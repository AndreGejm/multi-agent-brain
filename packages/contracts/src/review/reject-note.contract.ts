import type { ActorContext } from "../common/actor-context.js";
import type { DraftReviewState, NoteId } from "@multi-agent-brain/domain";
import type { ReviewWorkflowStep } from "./accept-note.contract.js";

export interface RejectNoteRequest {
  actor: ActorContext;
  draftNoteId: NoteId;
  reviewNotes?: string;
}

export interface RejectNoteResponse {
  draftNoteId: NoteId;
  finalReviewState: DraftReviewState;
  archivedPath?: string;
  steps: ReviewWorkflowStep[];
}
