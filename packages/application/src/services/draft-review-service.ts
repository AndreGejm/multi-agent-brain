import type {
  MetadataControlStore
} from "../ports/metadata-control-store.js";
import type {
  StagingNoteRepository
} from "../ports/staging-note-repository.js";
import type {
  ReviewDraftNoteRequest,
  ReviewDraftNoteResponse,
  ServiceResult
} from "@multi-agent-brain/contracts";
import type {
  DraftReviewDecision,
  DraftReviewState
} from "@multi-agent-brain/domain";
import { findDraftGovernanceIdentityViolations } from "./draft-governance-identity-service.js";

type ReviewDraftErrorCode = "forbidden" | "not_found" | "validation_failed" | "write_failed";

const REVIEW_ROLES = new Set(["operator", "orchestrator", "system"]);
const SELF_REVIEW_BLOCKED_DECISIONS = new Set<DraftReviewDecision>([
  "approve_draft",
  "set_promotion_ready"
]);
const ALLOWED_REVIEW_DECISIONS_BY_STATE: Record<DraftReviewState, ReadonlySet<DraftReviewDecision>> = {
  unreviewed: new Set([
    "approve_draft",
    "request_rewrite",
    "require_merge",
    "reject",
    "escalate"
  ]),
  approved_draft: new Set([
    "approve_draft",
    "request_rewrite",
    "require_merge",
    "reject",
    "escalate",
    "set_promotion_ready"
  ]),
  rewrite_requested: new Set([
    "approve_draft",
    "request_rewrite",
    "require_merge",
    "reject",
    "escalate"
  ]),
  merge_required: new Set([
    "approve_draft",
    "request_rewrite",
    "require_merge",
    "reject",
    "escalate"
  ]),
  rejected: new Set(),
  escalated: new Set([
    "approve_draft",
    "request_rewrite",
    "require_merge",
    "reject",
    "escalate"
  ]),
  promotion_ready: new Set([
    "approve_draft",
    "request_rewrite",
    "require_merge",
    "reject",
    "escalate"
  ])
};

export class DraftReviewService {
  constructor(
    private readonly stagingNoteRepository: StagingNoteRepository,
    private readonly metadataControlStore: MetadataControlStore
  ) {}

  async reviewDraft(
    request: ReviewDraftNoteRequest
  ): Promise<ServiceResult<ReviewDraftNoteResponse, ReviewDraftErrorCode>> {
    if (!REVIEW_ROLES.has(request.actor.actorRole)) {
      return {
        ok: false,
        error: {
          code: "forbidden",
          message: `Actor role '${request.actor.actorRole}' cannot review staging drafts.`
        }
      };
    }

    const draft = await this.stagingNoteRepository.getById(request.draftNoteId);
    if (!draft) {
      return {
        ok: false,
        error: {
          code: "not_found",
          message: `Staging draft '${request.draftNoteId}' was not found.`
        }
      };
    }

    const metadata = await this.metadataControlStore.getNote(request.draftNoteId);
    if (!metadata) {
      return {
        ok: false,
        error: {
          code: "not_found",
          message: `Draft metadata '${request.draftNoteId}' was not found.`
        }
      };
    }

    if (metadata.lifecycleState === "promoted") {
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: "Promoted notes cannot be reviewed through the staging review workflow."
        }
      };
    }

    const governanceIdentityViolations = findDraftGovernanceIdentityViolations(draft, metadata);
    if (governanceIdentityViolations.length > 0) {
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: "Draft governance identity no longer matches the admitted immutable staging contract.",
          details: {
            violations: governanceIdentityViolations
          }
        }
      };
    }

    if (
      metadata.submittedByActorId &&
      metadata.submittedByActorId === request.actor.actorId &&
      SELF_REVIEW_BLOCKED_DECISIONS.has(request.decision)
    ) {
      return {
        ok: false,
        error: {
          code: "forbidden",
          message: "Writers and submitters cannot self-approve or self-mark drafts as promotion ready.",
          details: {
            submittedByActorId: metadata.submittedByActorId,
            decision: request.decision
          }
        }
      };
    }

    const currentReviewState = metadata.reviewState ?? "unreviewed";
    if (currentReviewState === "rejected") {
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: "Rejected drafts must be rewritten as new draft candidates before review can continue."
        }
      };
    }

    if (!ALLOWED_REVIEW_DECISIONS_BY_STATE[currentReviewState].has(request.decision)) {
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: `Review decision '${request.decision}' is not allowed when the draft is in review state '${currentReviewState}'.`,
          details: {
            reviewState: currentReviewState,
            decision: request.decision
          }
        }
      };
    }

    const transition = resolveReviewTransition(request.decision);

    try {
      const updated = await this.metadataControlStore.updateNoteReview({
        noteId: metadata.noteId,
        reviewState: transition.reviewState,
        reviewRequired: metadata.reviewRequired ?? true,
        promotionEligible: transition.promotionEligible,
        reviewedByActorId: request.actor.actorId,
        reviewedByActorRole: request.actor.actorRole,
        reviewTimestamp: currentTimestampIso(),
        reviewedRevision: draft.revision,
        reviewDecision: request.decision,
        reviewNotes: request.reviewNotes
      });

      if (!updated) {
        return {
          ok: false,
          error: {
            code: "not_found",
            message: `Draft metadata '${request.draftNoteId}' disappeared before review could be recorded.`
          }
        };
      }

      return {
        ok: true,
        data: {
          draftNoteId: updated.noteId,
          reviewState: updated.reviewState ?? transition.reviewState,
          reviewRequired: updated.reviewRequired ?? (metadata.reviewRequired ?? true),
          promotionEligible: updated.promotionEligible ?? transition.promotionEligible,
          authorityRisk: updated.authorityRisk ?? metadata.authorityRisk ?? "medium",
          reviewedByActorId: updated.reviewedByActorId,
          reviewedByActorRole: updated.reviewedByActorRole,
          reviewTimestamp: updated.reviewTimestamp,
          reviewedRevision: updated.reviewedRevision,
          reviewDecision: updated.reviewDecision,
          reviewNotes: updated.reviewNotes
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "write_failed",
          message: "Failed to persist the draft review decision.",
          details: {
            reason: error instanceof Error ? error.message : String(error)
          }
        }
      };
    }
  }
}

function resolveReviewTransition(decision: DraftReviewDecision): {
  reviewState: DraftReviewState;
  promotionEligible: boolean;
} {
  switch (decision) {
    case "approve_draft":
      return { reviewState: "approved_draft", promotionEligible: false };
    case "request_rewrite":
      return { reviewState: "rewrite_requested", promotionEligible: false };
    case "require_merge":
      return { reviewState: "merge_required", promotionEligible: false };
    case "reject":
      return { reviewState: "rejected", promotionEligible: false };
    case "escalate":
      return { reviewState: "escalated", promotionEligible: false };
    case "set_promotion_ready":
      return { reviewState: "promotion_ready", promotionEligible: true };
  }
}

function currentTimestampIso(): string {
  return new Date().toISOString();
}
