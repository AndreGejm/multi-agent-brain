import type { ActorContext } from "../common/actor-context.js";
import type { DraftReviewState, NoteId } from "@multi-agent-brain/domain";

export interface ReviewWorkflowStep {
  step:
    | "reviewability_check"
    | "approve_draft"
    | "set_promotion_ready"
    | "promote_note"
    | "verify_canonical_write"
    | "verify_retrieval"
    | "reject_draft"
    | "archive_rejected_draft";
  status: "succeeded" | "failed" | "skipped";
  message?: string;
}

export interface AcceptNoteRequest {
  actor: ActorContext;
  draftNoteId: NoteId;
}

export interface AcceptNoteResponse {
  draftNoteId: NoteId;
  accepted: boolean;
  finalReviewState: DraftReviewState;
  promotedNoteId?: NoteId;
  canonicalPath?: string;
  archivedDraftPath?: string;
  steps: ReviewWorkflowStep[];
  retrievalWarning?: string;
}
