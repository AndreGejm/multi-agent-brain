import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir as fsMkdir, mkdtemp, rm, writeFile as fsWriteFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as application from "../../packages/application/dist/index.js";
import {
  SqliteAuditLog,
  SqliteFtsIndex,
  SqliteMetadataControlStore,
  buildServiceContainer,
  runRuntimeHealthChecks,
  validateTransportRequest
} from "../../packages/infrastructure/dist/index.js";

test("retrieval actors cannot create staging drafts", async (t) => {
  const { container } = await createHarness(t);

  const result = await container.services.stagingDraftService.createDraft({
    actor: actor("retrieval"),
    targetCorpus: "context_brain",
    noteType: "decision",
    title: "Retrieval Boundary",
    sourcePrompt: "Create a retrieval note.",
    supportingSources: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "forbidden");
});

test("note ingress classification returns a governed contract for high-risk policy drafts", async (t) => {
  const { container } = await createHarness(t);

  const result = container.services.noteIngressService.classify({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Governed Ingress Policy",
    sourcePrompt: "Store the governed ingress policy draft for beta rollout.",
    supportingSources: [],
    bodyHints: ["Policy drafts should require review before promotion."],
    scopeHint: "governance/note-ingress",
    sourceBasis: ["user_instruction", "session_synthesis"]
  });

  assert.equal(result.contractVersion, "note-ingress.v1");
  assert.equal(result.action, "draft_candidate");
  assert.equal(result.authorityRisk, "high");
  assert.equal(result.reviewRequired, true);
  assert.equal(result.promotionEligible, false);
  assert.equal(result.requiredTemplate, "policy.v1");
  assert.deepEqual(result.requiredSections, ["Policy", "Scope", "Rules", "Exceptions"]);
  assert.ok(result.classificationHash.length > 0);
});

test("note ingress can infer policy type and general-notes corpus when the candidate is clearly governance-focused", async (t) => {
  const { container } = await createHarness(t);

  const result = container.services.noteIngressService.classify({
    actor: actor("writer"),
    title: "Governed Review Policy",
    sourcePrompt: "Store the governed policy for draft review boundaries and promotion gates.",
    supportingSources: [],
    bodyHints: ["Policy drafts should require explicit review before promotion."],
    scopeHint: "governance/review-policy",
    sourceBasis: ["user_instruction", "session_synthesis"]
  });

  assert.equal(result.noteType, "policy");
  assert.equal(result.targetCorpus, "general_notes");
  assert.equal(result.action, "draft_candidate");
  assert.equal(result.requiredTemplate, "policy.v1");
  assert.equal(result.classificationConfidence, "high");
});

test("note ingress can infer architecture type and context-brain corpus from repo-inspection evidence", async (t) => {
  const { container } = await createHarness(t);

  const result = container.services.noteIngressService.classify({
    actor: actor("writer"),
    title: "Retrieval Architecture Boundaries",
    sourcePrompt: "Capture the repository architecture for retrieval layering and packet assembly.",
    supportingSources: [],
    candidateSummary: "Repository inspection shows how retrieval architecture and packet assembly are layered.",
    scopeHint: "architecture/retrieval-boundaries",
    sourceBasis: ["repo_inspection"]
  });

  assert.equal(result.noteType, "architecture");
  assert.equal(result.targetCorpus, "context_brain");
  assert.equal(result.action, "draft_candidate");
  assert.equal(result.requiredTemplate, "architecture.v1");
});

test("note ingress downgrades low-information session residue to session_only instead of durable staging", async (t) => {
  const { container } = await createHarness(t);

  const result = container.services.noteIngressService.classify({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "handoff",
    title: "Notes",
    sourcePrompt: "Remember this conversation for later.",
    supportingSources: [],
    sourceBasis: ["session_synthesis"]
  });

  assert.equal(result.action, "session_only");
  assert.equal(result.classificationConfidence, "low");
  assert.ok(
    result.rejectionReasons.some((reason) => /session-only|durable/i.test(reason))
  );
});

test("note ingress rejects raw transcript-like residue instead of storing it as a durable note", async (t) => {
  const { container } = await createHarness(t);

  const result = container.services.noteIngressService.classify({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "reference",
    title: "Chat Transcript",
    sourcePrompt: "Store this raw transcript from the chat for later.",
    supportingSources: [],
    candidateSummary: "Raw transcript from this chat session for temporary recall.",
    sourceBasis: ["session_synthesis"]
  });

  assert.equal(result.action, "reject");
  assert.equal(result.classificationConfidence, "low");
  assert.ok(
    result.rejectionReasons.some((reason) => /raw transcript|durable note/i.test(reason))
  );
});

test("note ingress rewrites vague high-risk candidates whose title and evidence are too weak", async (t) => {
  const { container } = await createHarness(t);

  const result = container.services.noteIngressService.classify({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "architecture",
    title: "Update",
    sourcePrompt: "Some thoughts.",
    supportingSources: [],
    sourceBasis: ["repo_inspection"]
  });

  assert.equal(result.action, "rewrite_required");
  assert.equal(result.classificationConfidence, "low");
  assert.ok(
    result.rejectionReasons.some((reason) => /clearer|durable|scope/i.test(reason))
  );
});

test("orchestrator-first note capture stages explicit note bodies without provider fallback", async (t) => {
  const { container } = await createHarness(t);
  const explicitBody = [
    "## Summary",
    "",
    "Capture-note lets other workspaces submit durable notes through one orchestrator-owned request.",
    "",
    "## Details",
    "",
    "The request can carry explicit markdown body content, so callers do not need to patch staged files when a drafting provider is unavailable.",
    "",
    "## Sources",
    "",
    "- repository inspection"
  ].join("\n");

  const result = await container.services.noteCaptureService.capture({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "reference",
    title: "Orchestrator-first note capture",
    sourcePrompt: "Store the orchestrator-first note capture flow for other workspaces.",
    supportingSources: [],
    body: explicitBody,
    scopeHint: "reference/orchestrator-capture",
    candidateSummary: "Other workspaces should stage notes through one orchestrator-owned capture call.",
    sourceBasis: ["repo_inspection"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.classification.action, "draft_candidate");
  assert.equal(result.data.staged, true);
  assert.equal(result.data.draft.body, explicitBody);
  assert.equal(result.data.draft.frontmatter.scope, "reference/orchestrator-capture");
});

test("high-risk drafts persist explicit review metadata and block promotion until reviewed", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Governed Review Gate",
    sourcePrompt: "Store the beta review-gating policy as a governed draft.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/review-gate"
    }
  });

  assert.equal(draft.ok, true);

  const noteMetadata = await container.ports.metadataControlStore.getNote(
    draft.data.draftNoteId
  );

  assert.ok(noteMetadata);
  assert.equal(noteMetadata.reviewState, "unreviewed");
  assert.equal(noteMetadata.reviewRequired, true);
  assert.equal(noteMetadata.promotionEligible, false);
  assert.equal(noteMetadata.authorityRisk, "high");

  const promoted = await container.services.promotionOrchestratorService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.data.draftNoteId,
    targetCorpus: "general_notes",
    promoteAsCurrentState: false
  });

  assert.equal(promoted.ok, false);
  assert.equal(promoted.error.code, "validation_failed");
  assert.match(promoted.error.message, /review|promotion eligible/i);
});

test("review workflow can mark a draft promotion-ready and unblock promotion", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Governed Promotion Readiness",
    sourcePrompt: "Store the promotion-readiness workflow as a governed draft.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/promotion-ready"
    }
  });

  assert.equal(draft.ok, true);

  const approval = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId: draft.data.draftNoteId,
    decision: "approve_draft",
    reviewNotes: "Initial governed review completed."
  });

  assert.equal(approval.ok, true);
  assert.equal(approval.data.reviewState, "approved_draft");
  assert.equal(approval.data.promotionEligible, false);

  const review = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId: draft.data.draftNoteId,
    decision: "set_promotion_ready",
    reviewNotes: "Reviewed for beta rollout and cleared for promotion."
  });

  assert.equal(review.ok, true);
  assert.equal(review.data.reviewState, "promotion_ready");
  assert.equal(review.data.promotionEligible, true);

  const noteMetadata = await container.ports.metadataControlStore.getNote(
    draft.data.draftNoteId
  );

  assert.ok(noteMetadata);
  assert.equal(noteMetadata.reviewState, "promotion_ready");
  assert.equal(noteMetadata.promotionEligible, true);
  assert.equal(noteMetadata.reviewedByActorRole, "operator");

  const promoted = await container.services.promotionOrchestratorService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.data.draftNoteId,
    targetCorpus: "general_notes",
    promoteAsCurrentState: false
  });

  assert.equal(promoted.ok, true);
});

test("review queue recovers legacy on-disk draft files that are missing governed metadata", async (t) => {
  const { container, root } = await createHarness(t);
  const noteId = randomUUID();
  const draftPath = path.join(
    root,
    "vault",
    "staging",
    "general_notes",
    "legacy-queue-recovery.md"
  );

  await fsMkdir(path.dirname(draftPath), { recursive: true });
  await fsWriteFile(
    draftPath,
    [
      "---",
      `noteId: "${noteId}"`,
      'title: "Legacy Queue Recovery"',
      'project: "multi-agent-brain"',
      'type: "handoff"',
      'status: "draft"',
      `updated: "${currentDateIso()}"`,
      'summary: "Legacy staging drafts without metadata should still be reviewable."',
      "tags:",
      '  - "artifact/application"',
      'scope: "project/legacy-queue-recovery"',
      'corpusId: "general_notes"',
      'currentState: false',
      'supersedes: []',
      "---",
      "",
      "## Context",
      "",
      "Legacy drafts should be recovered into the governed review queue.",
      "",
      "## Current State",
      "",
      "This file was seeded directly on disk without SQLite metadata.",
      "",
      "## Open Questions",
      "",
      "Should the backend recover conservative metadata for operator review?",
      "",
      "## Next Steps",
      "",
      "Queue this draft for review."
    ].join("\n"),
    "utf8"
  );

  const queue = await container.services.reviewOperatorService.listReviewQueue({
    actor: actor("operator"),
    targetCorpus: "general_notes"
  });

  assert.equal(queue.ok, true);
  assert.ok(queue.data.items.some((item) => item.draftNoteId === noteId));

  const recoveredMetadata = await container.ports.metadataControlStore.getNote(noteId);
  assert.ok(recoveredMetadata);
  assert.equal(recoveredMetadata.lifecycleState, "draft");
  assert.equal(recoveredMetadata.reviewState, "unreviewed");
  assert.equal(recoveredMetadata.promotionEligible, false);
  assert.match(recoveredMetadata.policyVersion ?? "", /legacy/i);
});

test("high-risk drafts cannot jump directly from unreviewed to promotion-ready", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "No Direct Promotion Ready",
    sourcePrompt: "High-risk notes must pass through explicit approval before promotion readiness.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/review-transitions"
    }
  });

  assert.equal(draft.ok, true);

  const review = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId: draft.data.draftNoteId,
    decision: "set_promotion_ready",
    reviewNotes: "Attempting to skip the approved_draft state."
  });

  assert.equal(review.ok, false);
  assert.equal(review.error.code, "validation_failed");
  assert.match(review.error.message, /approved_draft|review state/i);
});

test("review workflow blocks self-approval for promotion readiness", async (t) => {
  const { container } = await createHarness(t);
  const sharedActorId = "shared-review-actor";

  const draft = await container.services.stagingDraftService.createDraft({
    actor: {
      ...actor("writer"),
      actorId: sharedActorId
    },
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Self Review Boundary",
    sourcePrompt: "Attempt to self-approve a governed draft.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/self-review-boundary"
    }
  });

  assert.equal(draft.ok, true);

  const review = await container.services.draftReviewService.reviewDraft({
    actor: {
      ...actor("operator"),
      actorId: sharedActorId
    },
    draftNoteId: draft.data.draftNoteId,
    decision: "set_promotion_ready",
    reviewNotes: "This should be rejected as self-review."
  });

  assert.equal(review.ok, false);
  assert.equal(review.error.code, "forbidden");
  assert.match(review.error.message, /self-approve|self-mark/i);
});

test("promotion-ready review is bound to the reviewed draft revision", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Reviewed Revision Binding",
    sourcePrompt: "Promotion approval must be tied to the revision that was reviewed.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/reviewed-revision"
    }
  });

  assert.equal(draft.ok, true);

  await reviewDraftForPromotion(container, draft.data.draftNoteId);

  const persistedDraft = await container.ports.stagingNoteRepository.getById(
    draft.data.draftNoteId
  );
  assert.ok(persistedDraft);

  const updatedDraft = await container.ports.stagingNoteRepository.updateDraft({
    ...persistedDraft,
    body: `${persistedDraft.body}\n\n## Review Delta\n\nThis body changed after review approval.\n`
  });

  const promoted = await container.services.promotionOrchestratorService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.data.draftNoteId,
    targetCorpus: "general_notes",
    promoteAsCurrentState: false
  });

  assert.equal(promoted.ok, false);
  assert.equal(promoted.error.code, "validation_failed");
  assert.match(promoted.error.message, /reviewed revision|review the latest draft/i);

  const promotedAfterReReview = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId: draft.data.draftNoteId,
    decision: "approve_draft",
    reviewNotes: "Approved again after the draft changed."
  });

  assert.equal(promotedAfterReReview.ok, true);
  assert.equal(promotedAfterReReview.data.reviewedRevision, updatedDraft.revision);

  const promotionReady = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId: draft.data.draftNoteId,
    decision: "set_promotion_ready",
    reviewNotes: "Promotion cleared for the latest reviewed revision."
  });

  assert.equal(promotionReady.ok, true);
  assert.equal(promotionReady.data.reviewedRevision, updatedDraft.revision);

  const promotedOnLatestRevision = await container.services.promotionOrchestratorService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.data.draftNoteId,
    targetCorpus: "general_notes",
    promoteAsCurrentState: false
  });

  assert.equal(promotedOnLatestRevision.ok, true);
});

test("writer actors cannot promote drafts", async (t) => {
  const { container } = await createHarness(t);

  const draft = await createDraft(container, {
    actorRole: "writer",
    targetCorpus: "context_brain",
    noteType: "decision",
    title: "Writer Promotion Boundary",
    sourcePrompt: "Capture the decision boundary that only orchestrator actors may promote drafts.",
    bodyHints: ["Writer actors should be forbidden from promoting staged drafts."],
    frontmatterOverrides: {
      scope: "governance/writer-promotion-boundary"
    }
  });

  const result = await container.services.promotionOrchestratorService.promoteDraft({
    actor: actor("writer"),
    draftNoteId: draft.draftNoteId,
    targetCorpus: "context_brain",
    expectedDraftRevision: draft.frontmatter.noteId ? undefined : undefined,
    promoteAsCurrentState: false
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "forbidden");
});

test("context-brain drafts reject general-notes source leakage", async (t) => {
  const { container } = await createHarness(t);

  const result = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "context_brain",
    noteType: "decision",
    title: "Leaky Draft",
    sourcePrompt: "Turn freeform notes into canonical context.",
    supportingSources: [
      {
        noteId: randomUUID(),
        notePath: "general_notes/scratch/freeform.md",
        headingPath: ["Scratch"],
        excerpt: "Temporary freeform note"
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "validation_failed");
  assert.match(result.error.message, /general_notes/i);
});

test("draft note reclassifies current-state-like drafts and blocks session-only evidence bypass", async (t) => {
  const { container } = await createHarness(t);

  const result = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "context_brain",
    noteType: "policy",
    title: "Session-only Current State Policy",
    sourcePrompt: "Attempt to write a current-state policy draft from session synthesis alone.",
    supportingSources: [],
    sourceBasis: ["session_synthesis"],
    frontmatterOverrides: {
      scope: "governance/current-state-policy",
      currentState: true
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "validation_failed");
  assert.match(result.error.message, /governed note-ingress contract/i);
  assert.equal(result.error.details.ingressDecision.action, "escalate");
});

test("draft ingress persists structured provenance for source basis and supporting sources", async (t) => {
  const { container } = await createHarness(t);
  const supportingNoteId = randomUUID();

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "decision",
    title: "Structured Provenance Persistence",
    sourcePrompt: "Capture a decision draft with explicit retrieved evidence.",
    supportingSources: [
      {
        noteId: supportingNoteId,
        notePath: "context_brain/decisions/prior-decision.md",
        headingPath: ["Decision"],
        excerpt: "Earlier decision context."
      }
    ],
    sourceBasis: ["retrieved_note", "user_instruction"],
    frontmatterOverrides: {
      scope: "governance/provenance-persistence"
    }
  });

  assert.equal(draft.ok, true);

  const provenance = await container.ports.metadataControlStore.getNoteProvenance(
    draft.data.draftNoteId
  );

  assert.equal(provenance.length, 2);
  assert.deepEqual(
    provenance.map((entry) => entry.sourceBasis).sort(),
    ["retrieved_note", "user_instruction"]
  );
  assert.ok(provenance.some((entry) => entry.sourceNoteId === supportingNoteId));
});

test("draft ingress persists the normalized scope and candidate summary chosen by the governed contract", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "architecture",
    title: "Governed Scope Normalization",
    sourcePrompt: "Capture the governed scope normalization behavior for durable drafts.",
    supportingSources: [],
    candidateSummary: "Durable drafts should persist the candidate summary and normalized scope chosen at ingress.",
    sourceBasis: ["repo_inspection"],
    bodyHints: ["The stored draft should keep the normalized scope string instead of the raw mixed-case input."],
    frontmatterOverrides: {
      scope: "Governance/Scope Normalization"
    }
  });

  assert.equal(draft.ok, true);
  assert.equal(draft.data.frontmatter.scope, "governance/scope-normalization");
  assert.equal(
    draft.data.frontmatter.summary,
    "Durable drafts should persist the candidate summary and normalized scope chosen at ingress."
  );
});

test("draft ingress blocks exact duplicate drafts before staging admission", async (t) => {
  const { container } = await createHarness(t);

  const firstDraft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Duplicate Gate Exact Match",
    sourcePrompt: "Store the exact duplicate draft gate policy.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    bodyHints: ["Exact duplicate drafts should become merge candidates instead of new staging clutter."],
    frontmatterOverrides: {
      scope: "governance/duplicate-gate"
    }
  });

  assert.equal(firstDraft.ok, true);

  const firstMetadata = await container.ports.metadataControlStore.getNote(
    firstDraft.data.draftNoteId
  );
  assert.ok(firstMetadata?.contentHash);
  assert.ok(firstMetadata?.semanticSignature);

  const duplicateDraft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Duplicate Gate Exact Match",
    sourcePrompt: "Store the exact duplicate draft gate policy.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    bodyHints: ["Exact duplicate drafts should become merge candidates instead of new staging clutter."],
    frontmatterOverrides: {
      scope: "governance/duplicate-gate"
    }
  });

  assert.equal(duplicateDraft.ok, false);
  assert.equal(duplicateDraft.error.code, "validation_failed");
  assert.equal(duplicateDraft.error.details.ingressDecision.action, "merge_candidate");
  assert.ok(
    duplicateDraft.error.details.ingressDecision.mergeHints.some(
      (hint) => hint.noteId === firstDraft.data.draftNoteId
    )
  );
});

test("draft ingress blocks semantic duplicates for high-risk drafts even when the body changes", async (t) => {
  const { container } = await createHarness(t);

  const firstDraft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Duplicate Gate Semantic Match",
    sourcePrompt: "Store the semantic duplicate draft gate policy.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    bodyHints: ["First draft wording for the governed semantic duplicate policy."],
    frontmatterOverrides: {
      scope: "governance/semantic-duplicate-gate"
    }
  });

  assert.equal(firstDraft.ok, true);

  const nearDuplicateDraft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Duplicate Gate Semantic Match",
    sourcePrompt: "Store the semantic duplicate draft gate policy.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    bodyHints: ["Second draft wording that keeps the same title, scope, and summary but changes the body."],
    frontmatterOverrides: {
      scope: "governance/semantic-duplicate-gate"
    }
  });

  assert.equal(nearDuplicateDraft.ok, false);
  assert.equal(nearDuplicateDraft.error.code, "validation_failed");
  assert.equal(nearDuplicateDraft.error.details.ingressDecision.action, "merge_candidate");
  assert.ok(
    nearDuplicateDraft.error.details.ingressDecision.mergeHints.some(
      (hint) =>
        hint.noteId === firstDraft.data.draftNoteId &&
        /semantic|similar/i.test(hint.reason)
    )
  );
});

test("review rejects staged drafts whose governance frontmatter drifted after admission", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Immutable Governance Frontmatter",
    sourcePrompt: "Governance identity must stay locked after staging admission.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/immutable-frontmatter"
    }
  });

  assert.equal(draft.ok, true);

  const persistedDraft = await container.ports.stagingNoteRepository.getById(
    draft.data.draftNoteId
  );
  assert.ok(persistedDraft);

  await container.ports.stagingNoteRepository.updateDraft({
    ...persistedDraft,
    frontmatter: {
      ...persistedDraft.frontmatter,
      scope: "governance/drifted-frontmatter"
    }
  });

  const review = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId: draft.data.draftNoteId,
    decision: "approve_draft",
    reviewNotes: "This should fail because the scope drifted after admission."
  });

  assert.equal(review.ok, false);
  assert.equal(review.error.code, "validation_failed");
  assert.match(review.error.message, /governance identity|immutable/i);
});

test("metadata store rejects provenance replacement that changes the admitted governance basis", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Immutable Draft Provenance",
    sourcePrompt: "Initial provenance should remain locked after staging admission.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/immutable-provenance"
    }
  });

  assert.equal(draft.ok, true);

  await assert.rejects(
    container.ports.metadataControlStore.replaceNoteProvenance(draft.data.draftNoteId, [
      {
        noteId: draft.data.draftNoteId,
        ordinal: 0,
        sourceBasis: "session_synthesis",
        recordedAt: new Date().toISOString()
      }
    ]),
    /immutable provenance|governance basis/i
  );
});

test("metadata store rejects immutable governance metadata drift on admitted drafts", async (t) => {
  const { container } = await createHarness(t);

  const draft = await container.services.stagingDraftService.createDraft({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "policy",
    title: "Immutable Governance Metadata",
    sourcePrompt: "Governance metadata should stay locked after staging admission.",
    supportingSources: [],
    sourceBasis: ["user_instruction"],
    frontmatterOverrides: {
      scope: "governance/immutable-metadata"
    }
  });

  assert.equal(draft.ok, true);

  const metadata = await container.ports.metadataControlStore.getNote(
    draft.data.draftNoteId
  );
  assert.ok(metadata);

  await assert.rejects(
    container.ports.metadataControlStore.upsertNote({
      ...metadata,
      authorityRisk: "low"
    }),
    /immutable governance|authority risk/i
  );
});

test("note ingress blocks durable high-risk drafts whose required provenance basis is missing", async (t) => {
  const { container } = await createHarness(t);

  const result = container.services.noteIngressService.classify({
    actor: actor("writer"),
    targetCorpus: "general_notes",
    noteType: "architecture",
    title: "Weak Architecture Draft",
    sourcePrompt: "Store an architecture note with only session synthesis backing it.",
    supportingSources: [],
    sourceBasis: ["session_synthesis"],
    scopeHint: "architecture/weak-architecture-draft"
  });

  assert.equal(result.action, "rewrite_required");
  assert.equal(result.evidenceConfidence, "low");
  assert.ok(result.rejectionReasons.some((reason) => /required provenance/i.test(reason)));
});

test("general notes cannot be written as current-state canonical context", async (t) => {
  const { container } = await createHarness(t);
  const noteId = randomUUID();

  const result = await container.services.canonicalNoteService.writeCanonicalNote({
    noteId,
    corpusId: "general_notes",
    notePath: "general_notes/reference/general-current.md",
    revision: "",
    frontmatter: {
      noteId,
      title: "General Current",
      project: "multi-agent-brain",
      type: "reference",
      status: "promoted",
      updated: currentDateIso(),
      summary: "Should not be allowed as current-state canonical context.",
      tags: ["project/multi-agent-brain", "status/current", "artifact/application"],
      scope: "general_notes",
      corpusId: "general_notes",
      currentState: true
    },
    body: "## Summary\n\nBlocked.\n\n## Details\n\nBlocked.\n\n## Sources\n\n- none"
  });

  assert.equal(result.ok, false);
  assert.match(result.error.message, /general notes cannot be marked as current-state/i);
});

test("promotion of a current-state context note creates a deterministic snapshot note", async (t) => {
  const { container } = await createHarness(t);

  const draft = await createDraft(container, {
    actorRole: "writer",
    targetCorpus: "context_brain",
    noteType: "decision",
    title: "Writer Agent Policy",
    sourcePrompt: "Draft the current writer-agent policy.",
    bodyHints: [
      "Writer agent only writes to staging.",
      "Orchestrator alone promotes canonical notes."
    ],
    frontmatterOverrides: {
      scope: "writer-policy"
    }
  });
  await reviewDraftForPromotion(container, draft.draftNoteId);

  const result = await container.services.promotionOrchestratorService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.draftNoteId,
    targetCorpus: "context_brain",
    promoteAsCurrentState: true
  });

  assert.equal(result.ok, true);
  const notes = await container.services.canonicalNoteService.listCanonicalNotes("context_brain");
  assert.equal(notes.ok, true);

  const snapshot = notes.data.find((note) =>
    note.notePath.startsWith("context_brain/current-state/")
  );

  assert.ok(snapshot, "expected a current-state snapshot note to be created");
  assert.equal(snapshot.frontmatter.type, "reference");
  assert.equal(snapshot.frontmatter.currentState, false);
  assert.ok(snapshot.frontmatter.tags.includes("topic/current-state-snapshot"));
});

test("promotion succeeds when derived representations fail to regenerate", async (t) => {
  const { container } = await createHarness(t);

  const draft = await createDraft(container, {
    actorRole: "writer",
    targetCorpus: "context_brain",
    noteType: "decision",
    title: "Derived Representation Failure Tolerance",
    sourcePrompt: "Draft a policy note for the regression test.",
    bodyHints: ["Promotion must remain authoritative even if derived rows fail."],
    frontmatterOverrides: {
      scope: "representation"
    }
  });
  await reviewDraftForPromotion(container, draft.draftNoteId);

  let regenerationCalls = 0;
  const promotionService = new application.PromotionOrchestratorService(
    container.ports.stagingNoteRepository,
    container.services.canonicalNoteService,
    container.services.noteValidationService,
    container.ports.metadataControlStore,
    container.services.chunkingService,
    container.services.auditHistoryService,
    container.ports.lexicalIndex,
    container.ports.vectorIndex,
    container.ports.embeddingProvider,
    {
      async regenerateForCanonicalNote() {
        regenerationCalls += 1;
        throw new Error("derived representation failure");
      }
    }
  );

  const promoted = await promotionService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.draftNoteId,
    targetCorpus: "context_brain",
    promoteAsCurrentState: false
  });

  assert.equal(promoted.ok, true);
  assert.equal(regenerationCalls, 1);

  const promotedDraft = await container.ports.stagingNoteRepository.getById(draft.draftNoteId);
  assert.ok(promotedDraft);
  assert.equal(promotedDraft.lifecycleState, "promoted");
  assert.match(promotedDraft.draftPath, /_promoted/i);

  const canonicalNote = await container.services.canonicalNoteService.getCanonicalNote(
    promoted.data.promotedNoteId
  );
  assert.equal(canonicalNote.ok, true);
  assert.equal(canonicalNote.data.frontmatter.title, "Derived Representation Failure Tolerance");
});

test("promotion outbox replays failed cross-store sync work after a transient index failure", async (t) => {
  const { container } = await createHarness(t);
  assert.ok(container.ports.lexicalIndex, "expected lexical index to be available");

  const draft = await createDraft(container, {
    actorRole: "writer",
    targetCorpus: "context_brain",
    noteType: "decision",
    title: "Replayable Promotion",
    sourcePrompt: "Draft a promotion that should survive a transient indexing fault.",
    bodyHints: [
      "The promotion outbox should make canonical writes replayable.",
      "Chunk and index sync can be retried safely."
    ],
    frontmatterOverrides: {
      scope: "promotion-outbox"
    }
  });
  await reviewDraftForPromotion(container, draft.draftNoteId);

  let failLexicalUpsertOnce = true;
  const failOnceLexicalIndex = {
    async removeByNoteId(noteId) {
      return container.ports.lexicalIndex.removeByNoteId(noteId);
    },
    async upsertChunks(chunks) {
      if (failLexicalUpsertOnce) {
        failLexicalUpsertOnce = false;
        throw new Error("Injected lexical sync failure");
      }

      return container.ports.lexicalIndex.upsertChunks(chunks);
    }
  };
  const promotionService = new application.PromotionOrchestratorService(
    container.ports.stagingNoteRepository,
    container.services.canonicalNoteService,
    container.services.noteValidationService,
    container.ports.metadataControlStore,
    container.services.chunkingService,
    container.services.auditHistoryService,
    failOnceLexicalIndex,
    container.ports.vectorIndex,
    container.ports.embeddingProvider
  );

  const initialPromotion = await promotionService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.draftNoteId,
    targetCorpus: "context_brain",
    promoteAsCurrentState: false
  });

  assert.equal(initialPromotion.ok, false);
  assert.equal(initialPromotion.error.code, "write_failed");
  assert.equal(typeof initialPromotion.error.details?.outboxId, "string");

  const outboxId = initialPromotion.error.details.outboxId;
  const failedOutbox = await container.ports.metadataControlStore.getPromotionOutboxEntry(outboxId);
  assert.ok(failedOutbox);
  assert.equal(failedOutbox.state, "failed");

  const replay = await promotionService.replayPendingPromotions();
  assert.ok(replay.processedOutboxIds.includes(outboxId));
  assert.ok(!replay.failedOutboxIds.includes(outboxId));

  const completedOutbox = await container.ports.metadataControlStore.getPromotionOutboxEntry(outboxId);
  assert.ok(completedOutbox);
  assert.equal(completedOutbox.state, "completed");

  const notes = await container.services.canonicalNoteService.listCanonicalNotes("context_brain");
  assert.equal(notes.ok, true);
  assert.ok(
    notes.data.some((note) => note.frontmatter.title === "Replayable Promotion")
  );

  const promotedDraft = await container.ports.stagingNoteRepository.getById(draft.draftNoteId);
  assert.ok(promotedDraft);
  assert.equal(promotedDraft.lifecycleState, "promoted");
  assert.match(promotedDraft.draftPath, /_promoted/i);
});

test("chunking preserves code fences, heading hierarchy, and adjacency", async (t) => {
  const { container } = await createHarness(t);
  const noteId = randomUUID();
  const chunks = container.services.chunkingService.chunkCanonicalNote({
    noteId,
    corpusId: "context_brain",
    notePath: "context_brain/architecture/chunking-example.md",
    revision: "",
    frontmatter: {
      noteId,
      title: "Chunking Example",
      project: "multi-agent-brain",
      type: "architecture",
      status: "promoted",
      updated: currentDateIso(),
      summary: "Chunking behavior example.",
      tags: ["project/multi-agent-brain", "domain/chunking", "status/promoted"],
      scope: "chunking",
      corpusId: "context_brain",
      currentState: true
    },
    body: [
      "## Context",
      "",
      "This section explains chunking.",
      "",
      "```ts",
      "export function keepCodeFence() {",
      "  return true;",
      "}",
      "```",
      "",
      "## Data Flow",
      "",
      "- preserve headings",
      "- preserve adjacency",
      "",
      "Additional implementation details."
    ].join("\n")
  });

  assert.ok(chunks.length >= 2);
  assert.ok(chunks.some((chunk) => chunk.rawText.includes("```ts")));
  assert.equal(chunks[0].headingPath[0], "Chunking Example");
  assert.ok(chunks[0].nextChunkId);
  assert.equal(chunks[1].prevChunkId, chunks[0].chunkId);
});

test("chunking marks expired current-state notes as stale when a validity window has elapsed", async (t) => {
  const { container } = await createHarness(t);
  const noteId = randomUUID();
  const chunks = container.services.chunkingService.chunkCanonicalNote({
    noteId,
    corpusId: "context_brain",
    notePath: "context_brain/reference/expired-validity-window.md",
    revision: "",
    frontmatter: {
      noteId,
      title: "Expired Validity Window",
      project: "multi-agent-brain",
      type: "reference",
      status: "promoted",
      updated: "2026-04-01",
      summary: "Expired guidance should not remain current forever.",
      tags: ["project/multi-agent-brain", "status/promoted", "risk/stale-context"],
      scope: "temporal-validity",
      corpusId: "context_brain",
      currentState: true,
      validFrom: "2026-03-01",
      validUntil: "2026-03-31"
    },
    body: "## Summary\n\nExpired.\n\n## Details\n\nExpired.\n\n## Sources\n\n- none"
  });

  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].stalenessClass, "stale");
});

test("metadata control store summarizes expired and expiring current-state notes", async (t) => {
  const { container } = await createHarness(t);
  const today = currentDateIso();
  const expiredDate = addDaysIso(today, -1);
  const upcomingDate = addDaysIso(today, 5);

  await createAndPromote(container, {
    title: "Expired Current Guidance",
    noteType: "reference",
    bodyHints: [
      "Expired current guidance should surface in temporal validity reporting."
    ],
    scope: "temporal-validity-expired",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -30),
      validUntil: expiredDate
    }
  });

  await createAndPromote(container, {
    title: "Expiring Soon Guidance",
    noteType: "reference",
    bodyHints: [
      "Soon-to-expire guidance should surface before it becomes stale."
    ],
    scope: "temporal-validity-expiring",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -5),
      validUntil: upcomingDate
    }
  });

  const summary = await container.ports.metadataControlStore.getTemporalValiditySummary({
    asOf: today,
    expiringWithinDays: 7,
    corpusId: "context_brain"
  });

  assert.equal(summary.asOf, today);
  assert.equal(summary.expiredCurrentStateNotes, 1);
  assert.equal(summary.expiringSoonCurrentStateNotes, 1);
  assert.equal(summary.futureDatedCurrentStateNotes, 0);
});

test("metadata control store reports actionable temporal refresh candidates", async (t) => {
  const { container } = await createHarness(t);
  const today = currentDateIso();

  const expired = await createAndPromote(container, {
    title: "Expired Refresh Candidate",
    noteType: "reference",
    bodyHints: [
      "Expired refresh candidates should show up with note paths and days past due."
    ],
    scope: "temporal-validity-report-expired",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -30),
      validUntil: addDaysIso(today, -2)
    }
  });

  const expiringSoon = await createAndPromote(container, {
    title: "Expiring Soon Candidate",
    noteType: "reference",
    bodyHints: [
      "Soon-to-expire candidates should surface before they actually expire."
    ],
    scope: "temporal-validity-report-expiring",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -5),
      validUntil: addDaysIso(today, 3)
    }
  });

  const report = await container.ports.metadataControlStore.getTemporalValidityReport({
    asOf: today,
    expiringWithinDays: 7,
    corpusId: "context_brain",
    limitPerCategory: 5
  });

  assert.equal(report.expiredCurrentStateNotes, 1);
  assert.equal(report.expiringSoonCurrentStateNotes, 1);
  assert.equal(report.limitPerCategory, 5);
  assert.equal(report.expiredCurrentState[0].noteId, expired.promotedNoteId);
  assert.equal(report.expiredCurrentState[0].state, "expired");
  assert.ok(report.expiredCurrentState[0].daysPastDue >= 1);
  assert.equal(report.expiringSoonCurrentState[0].noteId, expiringSoon.promotedNoteId);
  assert.equal(report.expiringSoonCurrentState[0].state, "expiring_soon");
  assert.ok(report.expiringSoonCurrentState[0].daysUntilExpiry >= 0);
});

test("temporal refresh service creates a governed staging draft for expired current-state notes", async (t) => {
  const { container } = await createHarness(t);
  const today = currentDateIso();

  const promoted = await createAndPromote(container, {
    title: "Expired Refresh Workflow Guidance",
    noteType: "reference",
    bodyHints: [
      "Expired current-state notes should generate governed refresh drafts.",
      "Refresh drafts should supersede the stale source note and re-enter staging."
    ],
    scope: "temporal-refresh-workflow",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -21),
      validUntil: addDaysIso(today, -1)
    }
  });

  const refreshed = await container.orchestrator.createRefreshDraft({
    actor: actor("operator"),
    noteId: promoted.promotedNoteId,
    bodyHints: ["Confirm the validity window and update outdated claims."]
  });

  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.data.sourceNoteId, promoted.promotedNoteId);
  assert.equal(refreshed.data.sourceState, "expired");
  assert.equal(refreshed.data.frontmatter.currentState, false);
  assert.deepEqual(refreshed.data.frontmatter.supersedes, [promoted.promotedNoteId]);
  assert.ok(refreshed.data.frontmatter.tags.includes("risk/stale-context"));
  assert.ok(refreshed.data.body.length > 0);

  const staged = await container.ports.stagingNoteRepository.getById(
    refreshed.data.draftNoteId
  );
  assert.ok(staged);
  assert.equal(staged.lifecycleState, "draft");
  assert.deepEqual(staged.frontmatter.supersedes, [promoted.promotedNoteId]);

  const history = await container.services.auditHistoryService.queryHistory({
    actor: actor("operator"),
    limit: 20
  });

  assert.equal(history.ok, true);
  assert.ok(
    history.data.entries.some(
      (entry) =>
        entry.actionType === "create_refresh_draft" &&
        entry.affectedNoteIds.includes(promoted.promotedNoteId) &&
        entry.affectedNoteIds.includes(refreshed.data.draftNoteId)
    )
  );
});

test("temporal refresh service reuses an existing open refresh draft for the same canonical note", async (t) => {
  const { container } = await createHarness(t);
  const today = currentDateIso();

  const promoted = await createAndPromote(container, {
    title: "Refresh Draft Reuse Guidance",
    noteType: "reference",
    bodyHints: [
      "Repeated refresh attempts should reuse the open draft.",
      "The system should avoid duplicate refresh drafts for the same stale note."
    ],
    scope: "temporal-refresh-reuse",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -21),
      validUntil: addDaysIso(today, -1)
    }
  });

  const first = await container.orchestrator.createRefreshDraft({
    actor: actor("operator"),
    noteId: promoted.promotedNoteId,
    bodyHints: ["Create the first refresh draft."]
  });

  assert.equal(first.ok, true);
  assert.equal(first.data.reusedExistingDraft, false);

  const second = await container.orchestrator.createRefreshDraft({
    actor: actor("operator"),
    noteId: promoted.promotedNoteId,
    bodyHints: ["Attempt to create another refresh draft."]
  });

  assert.equal(second.ok, true);
  assert.equal(second.data.reusedExistingDraft, true);
  assert.equal(second.data.draftNoteId, first.data.draftNoteId);
  assert.match(second.data.warnings[0], /existing draft was reused/i);

  const drafts = await container.services.stagingDraftService.listDraftsByCorpus("context_brain");
  const refreshDrafts = drafts.filter((draft) =>
    draft.frontmatter.supersedes?.includes(promoted.promotedNoteId)
  );

  assert.equal(refreshDrafts.length, 1);
});

test("temporal refresh service can create a bounded batch of refresh drafts from current candidates", async (t) => {
  const { container } = await createHarness(t);
  const today = currentDateIso();

  const expiredA = await createAndPromote(container, {
    title: "Batch Refresh Expired A",
    noteType: "reference",
    bodyHints: ["Expired notes should be refreshable in a bounded batch."],
    scope: "temporal-refresh-batch-a",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -30),
      validUntil: addDaysIso(today, -2)
    }
  });
  const expiredB = await createAndPromote(container, {
    title: "Batch Refresh Expired B",
    noteType: "reference",
    bodyHints: ["A second expired note should be included in the same batch."],
    scope: "temporal-refresh-batch-b",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -20),
      validUntil: addDaysIso(today, -1)
    }
  });
  const expiringSoon = await createAndPromote(container, {
    title: "Batch Refresh Expiring Soon",
    noteType: "reference",
    bodyHints: ["Expiring-soon notes should remain visible after expired ones."],
    scope: "temporal-refresh-batch-c",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -5),
      validUntil: addDaysIso(today, 2)
    }
  });

  const batch = await container.orchestrator.createRefreshDraftBatch({
    actor: actor("operator"),
    asOf: today,
    expiringWithinDays: 14,
    maxDrafts: 2
  });

  assert.equal(batch.ok, true);
  assert.equal(batch.data.candidatesConsidered, 3);
  assert.equal(batch.data.candidatesRemaining, 1);
  assert.equal(batch.data.createdCount, 2);
  assert.equal(batch.data.reusedCount, 0);
  assert.equal(batch.data.drafts.length, 2);
  assert.ok(
    batch.data.drafts.every((draft) =>
      [expiredA.promotedNoteId, expiredB.promotedNoteId].includes(draft.sourceNoteId)
    )
  );
  assert.ok(
    batch.data.skipped.some(
      (item) =>
        item.noteId === expiringSoon.promotedNoteId &&
        /maxDrafts limit/i.test(item.reason)
    )
  );
});

test("retrieval packets stay within explicit source and raw-excerpt budgets", async (t) => {
  const { container } = await createHarness(t);

  await createAndPromote(container, {
    title: "Writer Staging Rules",
    noteType: "decision",
    bodyHints: [
      "Writer staging policy requires drafts only.",
      "Writers never promote canonical memory."
    ],
    scope: "writer-staging-a",
    promoteAsCurrentState: true
  });

  await createAndPromote(container, {
    title: "Promotion Policy",
    noteType: "constraint",
    bodyHints: [
      "Promotion policy is deterministic.",
      "Writer staging policy defers promotion to the orchestrator."
    ],
    scope: "writer-staging-b",
    promoteAsCurrentState: false
  });

  await createAndPromote(container, {
    title: "Context Brain Storage",
    noteType: "architecture",
    bodyHints: [
      "Context brain retrieval uses staged canonical promotion.",
      "Writer staging policy protects canonical memory."
    ],
    scope: "writer-staging-c",
    promoteAsCurrentState: false
  });

  const result = await container.services.retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "writer staging policy",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    requireEvidence: false
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.candidateCounts.lexical > 0);
  assert.ok(result.data.packet.evidence.length <= 2);
  assert.ok((result.data.packet.rawExcerpts?.length ?? 0) <= 1);
  assert.ok(result.data.packet.budgetUsage.sourceCount <= 2);
});

test("flat retrieval remains the default baseline while hierarchical stays explicit opt-in", async (t) => {
  const { container } = await createHarness(t);

  await createAndPromote(container, {
    title: "Flat Baseline Writer Policy",
    noteType: "decision",
    bodyHints: [
      "Flat retrieval remains the rollout baseline.",
      "Writer promotion still requires orchestrator review."
    ],
    scope: "retrieval-rollout-a",
    promoteAsCurrentState: true
  });

  await createAndPromote(container, {
    title: "Hierarchical Rollout Guardrail",
    noteType: "architecture",
    bodyHints: [
      "Hierarchical retrieval stays opt-in until rollout gates are closed.",
      "Packet diff checks are required before any default switch."
    ],
    scope: "retrieval-rollout-b",
    promoteAsCurrentState: false
  });

  const defaultValidated = validateTransportRequest("search-context", {
    query: "writer promotion rollout",
    corpusIds: ["context_brain"],
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    }
  });
  assert.equal(defaultValidated.strategy, undefined);

  const hierarchicalValidated = validateTransportRequest("search-context", {
    query: "writer promotion rollout",
    corpusIds: ["context_brain"],
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    strategy: "hierarchical"
  });
  assert.equal(hierarchicalValidated.strategy, "hierarchical");

  const flatResult = await container.services.retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "writer promotion rollout",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    includeTrace: true
  });

  const hierarchicalResult = await container.services.retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "writer promotion rollout",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    strategy: "hierarchical",
    includeTrace: true
  });

  assert.equal(flatResult.ok, true);
  assert.equal(hierarchicalResult.ok, true);
  assert.equal(flatResult.data.trace.strategy, "flat");
  assert.equal(hierarchicalResult.data.trace.strategy, "hierarchical");
  assert.equal(
    flatResult.data.trace.packetDiff.deliveredEvidenceCount,
    flatResult.data.packet.evidence.length
  );
  assert.equal(
    hierarchicalResult.data.trace.packetDiff.deliveredEvidenceCount,
    hierarchicalResult.data.packet.evidence.length
  );
  assert.ok(flatResult.data.packet.evidence.length <= 2);
  assert.ok(hierarchicalResult.data.packet.evidence.length <= 2);
});

test("context packet assembly hard-enforces token and summary-sentence budgets", async (t) => {
  const { container } = await createHarness(t);

  const packetResponse = await container.services.contextPacketService.assemblePacket(
    {
      actor: actor("retrieval"),
      intent: "architecture_recall",
      budget: {
        maxTokens: 80,
        maxSources: 3,
        maxRawExcerpts: 2,
        maxSummarySentences: 1
      },
      includeRawExcerpts: true,
      candidates: [
        {
          noteType: "architecture",
          score: 0.92,
          summary: "Primary architecture guidance explains the packet contract. It also describes the retry loop in detail.",
          rawText: "Primary architecture guidance explains the packet contract in a very long paragraph. ".repeat(12),
          scope: "packet-budget",
          qualifiers: ["bounded context", "packet budget", "retry loop"],
          tags: ["project/multi-agent-brain", "domain/retrieval"],
          stalenessClass: "current",
          provenance: {
            noteId: "packet-budget-1",
            notePath: "context_brain/architecture/packet-budget-1.md",
            headingPath: ["Summary"]
          }
        },
        {
          noteType: "decision",
          score: 0.81,
          summary: "Secondary decision context keeps packets compact. It should be reduced when budgets tighten.",
          rawText: "Secondary decision context keeps packets compact while preserving provenance. ".repeat(10),
          scope: "packet-budget",
          qualifiers: ["compact packets", "provenance"],
          tags: ["project/multi-agent-brain", "domain/retrieval"],
          stalenessClass: "current",
          provenance: {
            noteId: "packet-budget-2",
            notePath: "context_brain/decision/packet-budget-2.md",
            headingPath: ["Decision"]
          }
        },
        {
          noteType: "reference",
          score: 0.74,
          summary: "Reference material should only survive if room remains in the explicit budget.",
          rawText: "Reference material should only survive if room remains in the explicit budget. ".repeat(8),
          scope: "packet-budget",
          qualifiers: ["budget", "reference"],
          tags: ["project/multi-agent-brain", "domain/retrieval"],
          stalenessClass: "current",
          provenance: {
            noteId: "packet-budget-3",
            notePath: "context_brain/reference/packet-budget-3.md",
            headingPath: ["Reference"]
          }
        }
      ]
    },
    "needs_escalation"
  );

  assert.ok(packetResponse.packet.budgetUsage.tokenEstimate <= 80);
  assert.ok(countSummarySentences(packetResponse.packet.summary) <= 1);
  assert.ok(packetResponse.packet.budgetUsage.sourceCount <= 3);
  assert.ok(packetResponse.packet.budgetUsage.rawExcerptCount <= 2);
});

test("retrieve context honors tagFilters across the retrieval pipeline", async (t) => {
  const { container } = await createHarness(t);

  const alpha = await createAndPromote(container, {
    title: "Tag Filter Alpha",
    noteType: "architecture",
    bodyHints: [
      "Shared retrieval query context should match this alpha note.",
      "Tag filters must allow only alpha-tagged context through."
    ],
    scope: "tag-filter-alpha",
    frontmatterOverrides: {
      tags: ["topic/mcp"]
    }
  });
  await createAndPromote(container, {
    title: "Tag Filter Beta",
    noteType: "architecture",
    bodyHints: [
      "Shared retrieval query context should also match this beta note.",
      "Tag filters must exclude beta-tagged context when alpha is requested."
    ],
    scope: "tag-filter-beta",
    frontmatterOverrides: {
      tags: ["topic/docker"]
    }
  });

  const result = await container.services.retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "shared retrieval query context",
    budget: {
      maxTokens: 320,
      maxSources: 3,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    tagFilters: ["topic/mcp"],
    requireEvidence: false
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.candidateCounts.lexical > 0);
  assert.ok(result.data.packet.evidence.length >= 1);
  assert.ok(
    result.data.packet.evidence.every((source) => source.noteId === alpha.promotedNoteId)
  );
});

test("retrieve context warns when bounded evidence includes expired notes", async (t) => {
  const { container } = await createHarness(t);
  const today = currentDateIso();

  await createAndPromote(container, {
    title: "Expired Retrieval Guidance",
    noteType: "architecture",
    bodyHints: [
      "Expired retrieval guidance should still be visible as expired when selected.",
      "Freshness warnings should call this out explicitly."
    ],
    scope: "expired-retrieval-guidance",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -14),
      validUntil: addDaysIso(today, -1)
    }
  });

  const result = await container.services.retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "freshness warnings should call this out explicitly",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    requireEvidence: false
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.packet.evidence.length >= 1);
  assert.ok(
    result.warnings?.some((warning) => /expired note/i.test(warning))
  );
});

test("retrieve context warns when bounded evidence is approaching expiry", async (t) => {
  const { container } = await createHarness(t);
  const today = currentDateIso();

  await createAndPromote(container, {
    title: "Expiring Retrieval Guidance",
    noteType: "architecture",
    bodyHints: [
      "Expiring retrieval guidance should warn before the note becomes stale.",
      "Freshness warnings should mention expiring-soon evidence explicitly."
    ],
    scope: "expiring-retrieval-guidance",
    promoteAsCurrentState: true,
    frontmatterOverrides: {
      validFrom: addDaysIso(today, -7),
      validUntil: addDaysIso(today, 2)
    }
  });

  const result = await container.services.retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "freshness warnings should mention expiring-soon evidence explicitly",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    requireEvidence: false
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.packet.evidence.length >= 1);
  assert.ok(
    result.warnings?.some((warning) => /expiring within 14 days/i.test(warning))
  );
});

test("retrieve context uses the paid escalation provider to enrich uncertainty when local evidence is insufficient", async (t) => {
  const { container } = await createHarness(t);

  const retrieveContextService = new application.RetrieveContextService({
    lexicalIndex: container.ports.lexicalIndex,
    metadataControlStore: container.ports.metadataControlStore,
    vectorIndex: container.ports.vectorIndex,
    embeddingProvider: container.ports.embeddingProvider,
    localReasoningProvider: container.ports.localReasoningProvider,
    paidEscalationProvider: {
      providerId: "paid-escalation-test",
      async classifyIntent() {
        return "fact_lookup";
      },
      async assessAnswerability() {
        return "needs_escalation";
      },
      async summarizeUncertainty(query, evidence) {
        assert.equal(query, "unmapped query with no local evidence");
        assert.deepEqual(evidence, []);
        return "Escalate to the paid provider for authoritative synthesis.";
      }
    },
    rerankerProvider: container.ports.rerankerProvider
  });

  const result = await retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "unmapped query with no local evidence",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    requireEvidence: false
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.packet.answerability, "needs_escalation");
  assert.ok(
    result.data.packet.uncertainties.includes(
      "Escalate to the paid provider for authoritative synthesis."
    )
  );
  assert.ok(
    result.warnings?.includes(
      "Paid escalation provider enriched the uncertainty summary."
    )
  );
});

test("retrieve context surfaces degraded vector mode explicitly while continuing lexical retrieval", async (t) => {
  const { container } = await createHarness(t);

  await createAndPromote(container, {
    title: "Vector Degraded Fallback",
    noteType: "architecture",
    bodyHints: [
      "Lexical retrieval should still answer when vector mode is degraded.",
      "Degraded vector telemetry should surface as a warning."
    ],
    scope: "vector-degraded-warning"
  });

  const retrieveContextService = new application.RetrieveContextService({
    lexicalIndex: container.ports.lexicalIndex,
    metadataControlStore: container.ports.metadataControlStore,
    vectorIndex: {
      async upsertEmbeddings() {},
      async removeByNoteId() {},
      async search() {
        return [];
      },
      getHealthSnapshot() {
        return {
          status: "degraded",
          softFail: true,
          consecutiveFailures: 3,
          lastError: "Qdrant search_points failed with status 503.",
          lastFailureAt: new Date().toISOString(),
          degradedSince: new Date().toISOString(),
          details: {
            baseUrl: "http://127.0.0.1:6333/",
            collectionName: "context_brain_chunks_test"
          }
        };
      }
    },
    embeddingProvider: container.ports.embeddingProvider,
    localReasoningProvider: container.ports.localReasoningProvider,
    rerankerProvider: container.ports.rerankerProvider
  });

  const result = await retrieveContextService.retrieveContext({
    actor: actor("retrieval"),
    query: "degraded vector telemetry should surface as a warning",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    corpusIds: ["context_brain"],
    requireEvidence: false
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.packet.evidence.length >= 1);
  assert.ok(
    result.warnings?.includes(
      "Vector retrieval is degraded; lexical retrieval remains active."
    )
  );
});

test("runtime health reports degraded vector state explicitly", async (t) => {
  const { env } = await createHarness(t);

  const report = await runRuntimeHealthChecks(env, "live", {
    vectorHealth: {
      status: "degraded",
      softFail: true,
      consecutiveFailures: 2,
      lastError: "Qdrant search_points failed with status 503.",
      lastFailureAt: new Date().toISOString(),
      degradedSince: new Date().toISOString(),
      details: {
        baseUrl: env.qdrantUrl,
        collectionName: env.qdrantCollection
      }
    }
  });

  assert.equal(report.status, "degraded");
  const qdrantCheck = report.checks.find((check) => check.name === "qdrant_vector_store");
  assert.ok(qdrantCheck);
  assert.equal(qdrantCheck.status, "warn");
  assert.equal(qdrantCheck.details?.vectorHealth?.status, "degraded");
});

test("runtime health reports expired temporal validity state explicitly", async (t) => {
  const { env } = await createHarness(t);

  const report = await runRuntimeHealthChecks(env, "live", {
    temporalValidity: {
      asOf: currentDateIso(),
      expiringWithinDays: 14,
      expiredCurrentStateNotes: 2,
      futureDatedCurrentStateNotes: 0,
      expiringSoonCurrentStateNotes: 1
    }
  });

  assert.equal(report.status, "degraded");
  const temporalCheck = report.checks.find((check) => check.name === "temporal_validity");
  assert.ok(temporalCheck);
  assert.equal(temporalCheck.status, "warn");
  assert.equal(temporalCheck.details?.expiredCurrentStateNotes, 2);
});

test("sqlite-backed adapters share a reference-counted connection lifecycle", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mab-sqlite-shared-"));
  const sqlitePath = path.join(root, "state", "multi-agent-brain.sqlite");
  const metadataStore = new SqliteMetadataControlStore(sqlitePath);
  const auditLog = new SqliteAuditLog(sqlitePath);
  const lexicalIndex = new SqliteFtsIndex(sqlitePath);

  t.after(async () => {
    lexicalIndex.close();
    auditLog.close();
    metadataStore.close();
    await rm(root, { recursive: true, force: true });
  });

  const noteId = randomUUID();
  await metadataStore.upsertNote({
    noteId,
    corpusId: "context_brain",
    notePath: "context_brain/architecture/sqlite-shared-lifecycle.md",
    noteType: "architecture",
    lifecycleState: "promoted",
    revision: currentDateIso(),
    updatedAt: currentDateIso(),
    currentState: false,
    summary: "Shared SQLite lifecycle test.",
    scope: "sqlite-shared-lifecycle",
    tags: ["project/multi-agent-brain"],
    contentHash: "sha256:test",
    semanticSignature: "sqlite-shared-lifecycle"
  });

  auditLog.close();

  const duplicates = await metadataStore.findPotentialDuplicates({
    corpusId: "context_brain",
    contentHash: "sha256:test"
  });
  assert.equal(duplicates.length, 1);

  await lexicalIndex.upsertChunks([
    {
      chunkId: "sqlite-shared-lifecycle-chunk",
      noteId,
      corpusId: "context_brain",
      noteType: "architecture",
      notePath: "context_brain/architecture/sqlite-shared-lifecycle.md",
      headingPath: ["Summary"],
      rawText: "Shared SQLite lifecycle should keep the remaining adapters alive.",
      summary: "Shared SQLite lifecycle remains available.",
      entities: [],
      qualifiers: [],
      scope: "sqlite-shared-lifecycle",
      tags: ["project/multi-agent-brain"],
      stalenessClass: "current",
      tokenEstimate: 12,
      updatedAt: currentDateIso()
    }
  ]);

  const lexicalHits = await lexicalIndex.search({
    query: "remaining adapters alive",
    corpusIds: ["context_brain"],
    limit: 5,
    includeSuperseded: true
  });
  assert.ok(lexicalHits.length >= 1);
});

test("root orchestrator exposes direct context-packet assembly for ranked candidates", async (t) => {
  const { container } = await createHarness(t);

  const result = await container.orchestrator.getContextPacket({
    actor: actor("retrieval"),
    intent: "architecture_recall",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    },
    includeRawExcerpts: true,
    candidates: [
      {
        noteType: "architecture",
        score: 0.81,
        summary: "Canonical architecture notes define bounded retrieval packets.",
        rawText: "Canonical architecture notes define bounded retrieval packets and keep provenance attached.",
        scope: "architecture",
        qualifiers: ["bounded retrieval", "provenance required"],
        tags: ["project/multi-agent-brain", "domain/retrieval"],
        stalenessClass: "current",
        provenance: {
          noteId: "note-architecture-1",
          notePath: "context_brain/architecture/retrieval-packets.md",
          headingPath: ["Summary"]
        }
      },
      {
        noteType: "decision",
        score: 0.67,
        summary: "Decision packets should stay smaller than raw retrieval search outputs.",
        scope: "architecture",
        qualifiers: ["bounded packets"],
        tags: ["project/multi-agent-brain", "domain/retrieval"],
        stalenessClass: "current",
        provenance: {
          noteId: "note-decision-1",
          notePath: "context_brain/decision/packet-size.md",
          headingPath: ["Decision"]
        }
      }
    ]
  });

  assert.equal(result.packet.packetType, "implementation");
  assert.equal(result.packet.answerability, "local_answer");
  assert.ok(result.packet.evidence.length <= 2);
  assert.ok((result.packet.rawExcerpts?.length ?? 0) <= 1);
});

test("decision summary retrieval returns a decision packet and records audit history", async (t) => {
  const { container } = await createHarness(t);

  await createAndPromote(container, {
    title: "Writer Agent Policy",
    noteType: "decision",
    bodyHints: [
      "Writer agents only create staging drafts.",
      "The orchestrator alone promotes canonical notes."
    ],
    scope: "writer-policy",
    promoteAsCurrentState: true
  });

  const result = await container.services.decisionSummaryService.getDecisionSummary({
    actor: actor("retrieval"),
    topic: "writer agent policy",
    budget: {
      maxTokens: 320,
      maxSources: 2,
      maxRawExcerpts: 1,
      maxSummarySentences: 2
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.decisionPacket.packetType, "decision");
  assert.ok(result.data.decisionPacket.evidence.length >= 1);

  const history = await container.services.auditHistoryService.queryHistory({
    actor: actor("operator"),
    limit: 20
  });

  assert.equal(history.ok, true);
  assert.ok(history.data.entries.some((entry) => entry.actionType === "fetch_decision_summary"));
  assert.ok(history.data.entries.some((entry) => entry.actionType === "retrieve_context"));
});

test("schema validation blocks missing required sections", async (t) => {
  const { container } = await createHarness(t);
  const noteId = randomUUID();

  const validation = container.services.noteValidationService.validate({
    actor: actor("orchestrator"),
    targetCorpus: "context_brain",
    notePath: "context_brain/decision/invalid-note.md",
    validationMode: "promotion",
    frontmatter: {
      noteId,
      title: "Invalid Decision",
      project: "multi-agent-brain",
      type: "decision",
      status: "promoted",
      updated: currentDateIso(),
      summary: "Missing required sections.",
      tags: ["project/multi-agent-brain", "domain/orchestration", "status/promoted"],
      scope: "validation",
      corpusId: "context_brain",
      currentState: false
    },
    body: "## Context\n\nOnly one section exists."
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.violations.some((issue) => issue.field === "body.sections"));
});

test("schema validation blocks placeholder content in required sections", async (t) => {
  const { container } = await createHarness(t);
  const noteId = randomUUID();

  const validation = container.services.noteValidationService.validate({
    actor: actor("orchestrator"),
    targetCorpus: "general_notes",
    notePath: "general_notes/policy/placeholder-policy.md",
    validationMode: "draft",
    frontmatter: {
      noteId,
      title: "Placeholder Policy",
      project: "multi-agent-brain",
      type: "policy",
      status: "draft",
      updated: currentDateIso(),
      summary: "Placeholder sections should be rejected.",
      tags: ["project/multi-agent-brain", "artifact/application", "status/draft"],
      scope: "general_notes",
      corpusId: "general_notes",
      currentState: false
    },
    body: [
      "## Policy",
      "",
      "TBD.",
      "",
      "## Scope",
      "",
      "TODO",
      "",
      "## Rules",
      "",
      "To be determined.",
      "",
      "## Exceptions",
      "",
      "Placeholder."
    ].join("\n")
  });

  assert.equal(validation.valid, false);
  assert.ok(
    validation.violations.some(
      (issue) =>
        issue.field === "body.sections" &&
        /placeholder content/i.test(issue.message)
    )
  );
});

test("schema validation blocks inverted temporal validity windows", async (t) => {
  const { container } = await createHarness(t);
  const noteId = randomUUID();

  const validation = container.services.noteValidationService.validate({
    actor: actor("orchestrator"),
    targetCorpus: "context_brain",
    notePath: "context_brain/reference/invalid-validity-window.md",
    validationMode: "promotion",
    frontmatter: {
      noteId,
      title: "Invalid Validity Window",
      project: "multi-agent-brain",
      type: "reference",
      status: "promoted",
      updated: currentDateIso(),
      summary: "Temporal windows must be ordered.",
      tags: ["project/multi-agent-brain", "domain/metadata", "status/promoted"],
      scope: "validation",
      corpusId: "context_brain",
      currentState: false,
      validFrom: "2026-04-10",
      validUntil: "2026-04-01"
    },
    body: "## Summary\n\nWindow.\n\n## Details\n\nWindow.\n\n## Sources\n\n- none"
  });

  assert.equal(validation.valid, false);
  assert.ok(
    validation.violations.some(
      (issue) => issue.field === "frontmatter.validUntil"
    )
  );
});

test("root orchestrator routes coding tasks through the vendored runtime bridge", async (t) => {
  const { container } = await createHarness(t);

  const result = await container.orchestrator.executeCodingTask({
    actor: actor("operator"),
    taskType: "propose_fix",
    task: "Fix the writer promotion bug.",
    context: "The bug affects writer promotion.",
    filePath: "src/example.py"
  });

  assert.equal(result.status, "escalate");
  assert.match(result.reason, /allowed_patch_root|LOCAL_EXPERT_REPO_ROOT/i);
});

test("root orchestrator passes repoRoot into the vendored runtime for bounded coding tasks", async (t) => {
  const { container, root } = await createHarness(t, {
    providerEndpoints: {
      dockerOllamaBaseUrl: "http://127.0.0.1:1"
    }
  });
  const repoRoot = path.join(root, "coding-repo");
  await fsMkdir(path.join(repoRoot, ".git"), { recursive: true });
  await fsMkdir(path.join(repoRoot, "src"), { recursive: true });
  await fsWriteFile(
    path.join(repoRoot, "src", "foo.py"),
    'def greet(name: str) -> str:\n    return f"Hello, {name}"\n',
    "utf8"
  );

  const result = await container.orchestrator.executeCodingTask({
    actor: actor("operator"),
    taskType: "propose_fix",
    task: "Fix the greet function.",
    context: "The greeting function should be corrected safely.",
    repoRoot,
    filePath: "src/foo.py"
  });

  assert.equal(result.status, "fail");
  assert.doesNotMatch(result.reason, /allowed_patch_root|LOCAL_EXPERT_REPO_ROOT/i);
});

async function createHarness(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mab-e2e-"));
  const env = testEnvironment(root, overrides);
  const container = buildServiceContainer(env);

  t.after(async () => {
    container.dispose?.();
    await rm(root, { recursive: true, force: true });
  });

  return { root, env, container };
}

async function createDraft(container, input) {
  const result = await container.services.stagingDraftService.createDraft({
    actor: actor(input.actorRole ?? "writer"),
    targetCorpus: input.targetCorpus ?? "context_brain",
    noteType: input.noteType,
    title: input.title,
    sourcePrompt: input.sourcePrompt,
    supportingSources: input.supportingSources ?? [],
    sourceBasis: input.sourceBasis ?? defaultSourceBasisForNoteType(input.noteType),
    bodyHints: input.bodyHints ?? [],
    frontmatterOverrides: input.frontmatterOverrides
  });

  assert.equal(result.ok, true);
  return result.data;
}

async function createAndPromote(container, input) {
  const draft = await createDraft(container, {
    actorRole: "writer",
    targetCorpus: "context_brain",
    noteType: input.noteType,
    title: input.title,
    sourcePrompt: `Draft ${input.title}`,
    bodyHints: input.bodyHints,
    frontmatterOverrides: {
      scope: input.scope,
      ...input.frontmatterOverrides
    }
  });
  await reviewDraftForPromotion(container, draft.draftNoteId);

  const promoted = await container.services.promotionOrchestratorService.promoteDraft({
    actor: actor("orchestrator"),
    draftNoteId: draft.draftNoteId,
    targetCorpus: "context_brain",
    promoteAsCurrentState: input.promoteAsCurrentState ?? false
  });

  assert.equal(promoted.ok, true);
  return promoted.data;
}

async function reviewDraftForPromotion(container, draftNoteId) {
  const approved = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId,
    decision: "approve_draft",
    reviewNotes: "Approved in the test harness before promotion readiness."
  });

  assert.equal(approved.ok, true);

  const reviewed = await container.services.draftReviewService.reviewDraft({
    actor: actor("operator"),
    draftNoteId,
    decision: "set_promotion_ready",
    reviewNotes: "Approved in the test harness for governed promotion."
  });

  assert.equal(reviewed.ok, true);
  return reviewed.data;
}

function actor(role) {
  return {
    actorId: `${role}-actor`,
    actorRole: role,
    transport: "internal",
    source: "test-suite",
    requestId: randomUUID(),
    initiatedAt: new Date().toISOString(),
    toolName: "service-test"
  };
}

function testEnvironment(root = path.join(os.tmpdir(), `mab-standalone-${randomUUID()}`), overrides = {}) {
  return {
    nodeEnv: "test",
    vaultRoot: path.join(root, "vault", "canonical"),
    stagingRoot: path.join(root, "vault", "staging"),
    sqlitePath: path.join(root, "state", "multi-agent-brain.sqlite"),
    qdrantUrl: "http://127.0.0.1:6333",
    qdrantCollection: `context_brain_chunks_${randomUUID().slice(0, 8)}`,
    embeddingProvider: "hash",
    reasoningProvider: "heuristic",
    draftingProvider: "disabled",
    rerankerProvider: "local",
    apiHost: "127.0.0.1",
    apiPort: 8080,
    logLevel: "error",
    ...overrides
  };
}

function currentDateIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countSummarySentences(value) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .length;
}

function defaultSourceBasisForNoteType(noteType) {
  switch (noteType) {
    case "policy":
      return ["user_instruction"];
    case "glossary":
    case "handoff":
    case "reference":
      return ["session_synthesis"];
    default:
      return ["repo_inspection"];
  }
}
