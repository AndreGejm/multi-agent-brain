import type { ActorContext } from "../common/actor-context.js";
import type {
  DraftReviewDecision,
  DraftReviewState,
  NoteAuthorityRisk,
  NoteId
} from "@multi-agent-brain/domain";

export interface ReviewDraftNoteRequest {
  actor: ActorContext;
  draftNoteId: NoteId;
  decision: DraftReviewDecision;
  reviewNotes?: string;
}

export interface ReviewDraftNoteResponse {
  draftNoteId: NoteId;
  reviewState: DraftReviewState;
  reviewRequired: boolean;
  promotionEligible: boolean;
  authorityRisk: NoteAuthorityRisk;
  reviewedByActorId?: string;
  reviewedByActorRole?: ActorContext["actorRole"];
  reviewTimestamp?: string;
  reviewedRevision?: string;
  reviewDecision?: DraftReviewDecision;
  reviewNotes?: string;
}
