import type {
  MetadataControlStore,
  MetadataNoteRecord
} from "../ports/metadata-control-store.js";
import type {
  StagingDraftRecord,
  StagingNoteRepository
} from "../ports/staging-note-repository.js";
import type {
  AcceptNoteRequest,
  AcceptNoteResponse,
  ListReviewQueueRequest,
  ListReviewQueueResponse,
  ReadReviewNoteRequest,
  ReadReviewNoteResponse,
  RejectNoteRequest,
  RejectNoteResponse,
  ReviewWorkflowStep,
  ServiceResult
} from "@multi-agent-brain/contracts";
import type {
  CorpusId,
  DraftReviewState,
  NoteAuthorityRisk,
  NoteType
} from "@multi-agent-brain/domain";
import { DraftReviewService } from "./draft-review-service.js";
import {
  NOTE_INGRESS_POLICY_VERSION,
  resolveIngressShape
} from "../policy/note-ingress-policy.js";
import { buildNoteIdentity } from "./note-identity-service.js";
import { PromotionOrchestratorService } from "./promotion-orchestrator-service.js";

type ReviewOperatorErrorCode =
  | "forbidden"
  | "not_found"
  | "validation_failed"
  | "write_failed"
  | "duplicate_detected"
  | "revision_conflict";

const REVIEW_FRONTEND_ROLES = new Set(["operator", "orchestrator", "system"]);
const REVIEWABLE_CORPORA: ReadonlyArray<CorpusId> = ["context_brain", "general_notes"];

export class ReviewOperatorService {
  constructor(
    private readonly stagingNoteRepository: StagingNoteRepository,
    private readonly metadataControlStore: MetadataControlStore,
    private readonly draftReviewService: DraftReviewService,
    private readonly promotionOrchestratorService: PromotionOrchestratorService
  ) {}

  async listReviewQueue(
    request: ListReviewQueueRequest
  ): Promise<ServiceResult<ListReviewQueueResponse, ReviewOperatorErrorCode>> {
    if (!REVIEW_FRONTEND_ROLES.has(request.actor.actorRole)) {
      return forbidden("Actor role cannot access the review queue.");
    }

    const corpora = request.targetCorpus ? [request.targetCorpus] : REVIEWABLE_CORPORA;
    const drafts = (await Promise.all(
      corpora.map((corpusId) => this.stagingNoteRepository.listByCorpus(corpusId))
    )).flat();

    const items = (
      await Promise.all(
        drafts.map(async (draft) => {
          const metadata = await this.ensureGovernedDraftMetadata(draft);
          if (!metadata) {
            return null;
          }

          if (!shouldIncludeInQueue(draft, metadata, Boolean(request.includeRejected))) {
            return null;
          }

          return {
            draftNoteId: draft.noteId,
            title: draft.frontmatter.title,
            targetCorpus: draft.corpusId,
            scope: draft.frontmatter.scope,
            noteType: draft.frontmatter.type,
            updatedAt: metadata.updatedAt,
            reviewState: metadata.reviewState ?? "unreviewed",
            authorityRisk: metadata.authorityRisk ?? "medium",
            warningSummary: summarizeWarnings(draft, metadata)
          };
        })
      )
    )
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));

    return {
      ok: true,
      data: {
        items
      }
    };
  }

  async readReviewNote(
    request: ReadReviewNoteRequest
  ): Promise<ServiceResult<ReadReviewNoteResponse, ReviewOperatorErrorCode>> {
    if (!REVIEW_FRONTEND_ROLES.has(request.actor.actorRole)) {
      return forbidden("Actor role cannot read review notes.");
    }

    const draft = await this.stagingNoteRepository.getById(request.draftNoteId);
    const metadata = draft
      ? await this.ensureGovernedDraftMetadata(draft)
      : null;
    if (!draft || !metadata) {
      return notFound(request.draftNoteId);
    }

    const provenance = (await this.metadataControlStore.getNoteProvenance(draft.noteId)).map(
      (record) => ({
        noteId: record.sourceNoteId ?? draft.noteId,
        notePath: record.sourceNotePath ?? draft.draftPath,
        headingPath: record.headingPath ?? [],
        chunkId: record.chunkId,
        excerpt: record.excerpt
      })
    );

    return {
      ok: true,
      data: {
        draftNoteId: draft.noteId,
        draftPath: draft.draftPath,
        title: draft.frontmatter.title,
        targetCorpus: draft.corpusId,
        scope: draft.frontmatter.scope,
        noteType: draft.frontmatter.type,
        authorityRisk: metadata.authorityRisk ?? "medium",
        reviewState: metadata.reviewState ?? "unreviewed",
        promotionEligible: metadata.promotionEligible ?? false,
        updatedAt: metadata.updatedAt,
        body: draft.body,
        provenance,
        warnings: summarizeWarnings(draft, metadata).map((message, index) => ({
          code: `review_warning_${index + 1}`,
          message
        }))
      }
    };
  }

  async acceptNote(
    request: AcceptNoteRequest
  ): Promise<ServiceResult<AcceptNoteResponse, ReviewOperatorErrorCode>> {
    if (!REVIEW_FRONTEND_ROLES.has(request.actor.actorRole)) {
      return forbidden("Actor role cannot accept review notes.");
    }

    const draft = await this.stagingNoteRepository.getById(request.draftNoteId);
    let metadata = draft
      ? await this.ensureGovernedDraftMetadata(draft)
      : null;
    if (!draft || !metadata) {
      return notFound(request.draftNoteId);
    }

    if (metadata.reviewState === "rejected" || metadata.lifecycleState === "rejected") {
      return validationFailed("Rejected drafts cannot be accepted into canonical memory.");
    }

    const steps: ReviewWorkflowStep[] = [
      {
        step: "reviewability_check",
        status: "succeeded",
        message: "Draft is still reviewable."
      }
    ];

    if (metadata.reviewState !== "approved_draft" && metadata.reviewState !== "promotion_ready") {
      const approved = await this.draftReviewService.reviewDraft({
        actor: request.actor,
        draftNoteId: request.draftNoteId,
        decision: "approve_draft",
        reviewNotes: "Accepted through the thin review frontend."
      });
      if (!approved.ok) {
        return { ok: false, error: approved.error };
      }
      steps.push({
        step: "approve_draft",
        status: "succeeded",
        message: "Draft approved through the governed review workflow."
      });
      metadata = await this.metadataControlStore.getNote(request.draftNoteId);
      if (!metadata) {
        return notFound(request.draftNoteId);
      }
    } else {
      steps.push({
        step: "approve_draft",
        status: "skipped",
        message: `Draft already in review state '${metadata.reviewState}'.`
      });
    }

    let reviewedRevision = metadata.reviewedRevision;
    if (metadata.reviewState !== "promotion_ready") {
      const ready = await this.draftReviewService.reviewDraft({
        actor: request.actor,
        draftNoteId: request.draftNoteId,
        decision: "set_promotion_ready",
        reviewNotes: "Promotion authorized through the thin review frontend."
      });
      if (!ready.ok) {
        return { ok: false, error: ready.error };
      }
      reviewedRevision = ready.data.reviewedRevision;
      steps.push({
        step: "set_promotion_ready",
        status: "succeeded",
        message: "Draft marked promotion ready."
      });
    } else {
      steps.push({
        step: "set_promotion_ready",
        status: "skipped",
        message: "Draft was already promotion ready."
      });
    }

    const promoted = await this.promotionOrchestratorService.promoteDraft({
      actor: request.actor,
      draftNoteId: request.draftNoteId,
      targetCorpus: draft.corpusId,
      expectedDraftRevision: reviewedRevision,
      promoteAsCurrentState: Boolean(draft.frontmatter.currentState)
    });
    if (!promoted.ok) {
      return { ok: false, error: promoted.error };
    }

    steps.push({
      step: "promote_note",
      status: "succeeded",
      message: "Draft promoted into canonical memory."
    });

    const promotedDraftMetadata = await this.metadataControlStore.getNote(request.draftNoteId);
    const archivedDraftPath = promotedDraftMetadata?.notePath;

    const canonicalMetadata = await this.metadataControlStore.getNote(promoted.data.promotedNoteId);
    if (canonicalMetadata?.lifecycleState === "promoted") {
      steps.push({
        step: "verify_canonical_write",
        status: "succeeded",
        message: "Canonical note metadata confirmed."
      });
    } else {
      steps.push({
        step: "verify_canonical_write",
        status: "failed",
        message: "Promotion returned success but canonical metadata was not found."
      });
    }

    steps.push({
      step: "verify_retrieval",
      status: "skipped",
      message: "Retrieval verification is reported by the backend and not required from the frontend."
    });

    return {
      ok: true,
      data: {
        draftNoteId: request.draftNoteId,
        accepted: true,
        finalReviewState: "promotion_ready",
        promotedNoteId: promoted.data.promotedNoteId,
        canonicalPath: promoted.data.canonicalPath,
        archivedDraftPath,
        steps
      }
    };
  }

  async rejectNote(
    request: RejectNoteRequest
  ): Promise<ServiceResult<RejectNoteResponse, ReviewOperatorErrorCode>> {
    if (!REVIEW_FRONTEND_ROLES.has(request.actor.actorRole)) {
      return forbidden("Actor role cannot reject review notes.");
    }

    const draft = await this.stagingNoteRepository.getById(request.draftNoteId);
    let metadata = draft
      ? await this.ensureGovernedDraftMetadata(draft)
      : null;
    if (!draft || !metadata) {
      return notFound(request.draftNoteId);
    }

    const steps: ReviewWorkflowStep[] = [];

    if (metadata.reviewState !== "rejected") {
      const rejected = await this.draftReviewService.reviewDraft({
        actor: request.actor,
        draftNoteId: request.draftNoteId,
        decision: "reject",
        reviewNotes: request.reviewNotes ?? "Rejected through the thin review frontend."
      });
      if (!rejected.ok) {
        return { ok: false, error: rejected.error };
      }
      metadata = await this.metadataControlStore.getNote(request.draftNoteId);
      if (!metadata) {
        return notFound(request.draftNoteId);
      }
      steps.push({
        step: "reject_draft",
        status: "succeeded",
        message: "Draft marked rejected."
      });
    } else {
      steps.push({
        step: "reject_draft",
        status: "skipped",
        message: "Draft was already rejected."
      });
    }

    const archived = await this.stagingNoteRepository.archiveRejectedDraft(request.draftNoteId);
    if (!archived) {
      return notFound(request.draftNoteId);
    }

    await this.metadataControlStore.upsertNote({
      ...metadata,
      noteId: archived.noteId,
      corpusId: archived.corpusId,
      notePath: archived.draftPath,
      noteType: archived.frontmatter.type,
      lifecycleState: "rejected",
      revision: archived.revision,
      updatedAt: currentTimestampIso(),
      currentState: archived.frontmatter.currentState,
      validFrom: archived.frontmatter.validFrom,
      validUntil: archived.frontmatter.validUntil,
      summary: archived.frontmatter.summary,
      scope: archived.frontmatter.scope,
      tags: archived.frontmatter.tags
    });

    steps.push({
      step: "archive_rejected_draft",
      status: "succeeded",
      message: "Rejected draft moved out of the active review queue."
    });

    return {
      ok: true,
      data: {
        draftNoteId: request.draftNoteId,
        finalReviewState: "rejected",
        archivedPath: archived.draftPath,
        steps
      }
    };
  }

  private async ensureGovernedDraftMetadata(
    draft: StagingDraftRecord
  ): Promise<MetadataNoteRecord | null> {
    const normalizedDraft = await this.normalizeHistoricalDraftLocation(draft);
    const existingMetadata = await this.metadataControlStore.getNote(normalizedDraft.noteId);
    if (existingMetadata) {
      if (
        existingMetadata.notePath !== normalizedDraft.draftPath ||
        existingMetadata.lifecycleState !== normalizedDraft.lifecycleState ||
        existingMetadata.revision !== normalizedDraft.revision
      ) {
        await this.metadataControlStore.upsertNote({
          ...existingMetadata,
          notePath: normalizedDraft.draftPath,
          lifecycleState: normalizedDraft.lifecycleState,
          revision: normalizedDraft.revision,
          updatedAt: normalizedDraft.frontmatter.updated,
          currentState: normalizedDraft.frontmatter.currentState,
          validFrom: normalizedDraft.frontmatter.validFrom,
          validUntil: normalizedDraft.frontmatter.validUntil,
          summary: normalizedDraft.frontmatter.summary,
          scope: normalizedDraft.frontmatter.scope,
          tags: normalizedDraft.frontmatter.tags
        });
        return this.metadataControlStore.getNote(normalizedDraft.noteId);
      }

      return existingMetadata;
    }

    if (normalizedDraft.lifecycleState !== "draft") {
      return null;
    }

    const ingressShape = resolveIngressShape(normalizedDraft.frontmatter.type as NoteType);
    const noteIdentity = buildNoteIdentity({
      noteType: normalizedDraft.frontmatter.type,
      title: normalizedDraft.frontmatter.title,
      summary: normalizedDraft.frontmatter.summary,
      scope: normalizedDraft.frontmatter.scope,
      body: normalizedDraft.body
    });
    const recoveredMetadata: MetadataNoteRecord = {
      noteId: normalizedDraft.noteId,
      corpusId: normalizedDraft.corpusId,
      notePath: normalizedDraft.draftPath,
      noteType: normalizedDraft.frontmatter.type,
      lifecycleState: normalizedDraft.lifecycleState,
      revision: normalizedDraft.revision,
      updatedAt: normalizedDraft.frontmatter.updated,
      currentState: normalizedDraft.frontmatter.currentState,
      validFrom: normalizedDraft.frontmatter.validFrom,
      validUntil: normalizedDraft.frontmatter.validUntil,
      summary: normalizedDraft.frontmatter.summary,
      scope: normalizedDraft.frontmatter.scope,
      tags: normalizedDraft.frontmatter.tags,
      contentHash: noteIdentity.contentHash,
      semanticSignature: noteIdentity.semanticSignature,
      authorityRisk: ingressShape.authorityRisk,
      reviewState: "unreviewed",
      reviewRequired: true,
      promotionEligible: false,
      policyVersion: `${NOTE_INGRESS_POLICY_VERSION}+legacy-recovered`,
      templateId: ingressShape.requiredTemplate ?? undefined
    };
    await this.metadataControlStore.upsertNote(recoveredMetadata);
    return this.metadataControlStore.getNote(normalizedDraft.noteId);
  }

  private async normalizeHistoricalDraftLocation(
    draft: StagingDraftRecord
  ): Promise<StagingDraftRecord> {
    if (draft.lifecycleState === "promoted" && !draft.draftPath.includes("/_promoted/")) {
      return (await this.stagingNoteRepository.archivePromotedDraft(draft.noteId)) ?? draft;
    }

    if (draft.lifecycleState === "rejected" && !draft.draftPath.includes("/_rejected/")) {
      return (await this.stagingNoteRepository.archiveRejectedDraft(draft.noteId)) ?? draft;
    }

    return draft;
  }
}

function shouldIncludeInQueue(
  draft: StagingDraftRecord,
  metadata: MetadataNoteRecord,
  includeRejected: boolean
): boolean {
  if (metadata.lifecycleState === "promoted" || metadata.lifecycleState === "superseded") {
    return false;
  }

  const isRejected =
    metadata.reviewState === "rejected" ||
    metadata.lifecycleState === "rejected" ||
    metadata.lifecycleState === "archived" ||
    draft.draftPath.includes("/_rejected/");

  if (isRejected) {
    return includeRejected;
  }

  return true;
}

function summarizeWarnings(
  draft: StagingDraftRecord,
  metadata: MetadataNoteRecord
): string[] {
  const warnings: string[] = [];
  const reviewState = metadata.reviewState ?? "unreviewed";
  const authorityRisk = metadata.authorityRisk ?? "medium";

  if (reviewState === "unreviewed") {
    warnings.push("Awaiting governed review.");
  } else if (reviewState === "rewrite_requested") {
    warnings.push("Rewrite requested before promotion.");
  } else if (reviewState === "merge_required") {
    warnings.push("Potential duplicate requires merge review.");
  } else if (reviewState === "escalated") {
    warnings.push("Escalated for higher-trust review.");
  }

  if (authorityRisk === "high" || authorityRisk === "critical") {
    warnings.push("High-risk note type requires careful operator review.");
  }

  if (metadata.policyVersion?.includes("legacy-recovered")) {
    warnings.push("Legacy staging draft was recovered from disk and should be reviewed carefully.");
  }

  if (draft.body.trim().length < 200) {
    warnings.push("Draft body is brief; review for substance before accepting.");
  }

  return warnings;
}

function currentTimestampIso(): string {
  return new Date().toISOString();
}

function forbidden(
  message: string
): ServiceResult<never, ReviewOperatorErrorCode> {
  return {
    ok: false,
    error: {
      code: "forbidden",
      message
    }
  };
}

function notFound(noteId: string): ServiceResult<never, ReviewOperatorErrorCode> {
  return {
    ok: false,
    error: {
      code: "not_found",
      message: `Review note '${noteId}' was not found.`
    }
  };
}

function validationFailed(
  message: string
): ServiceResult<never, ReviewOperatorErrorCode> {
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message
    }
  };
}
