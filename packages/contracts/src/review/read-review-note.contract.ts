import type { ActorContext } from "../common/actor-context.js";
import type { ProvenanceRef } from "../common/provenance-ref.js";
import type {
  CorpusId,
  DraftReviewState,
  NoteAuthorityRisk,
  NoteId,
  NoteType
} from "@multi-agent-brain/domain";

export interface ReadReviewNoteRequest {
  actor: ActorContext;
  draftNoteId: NoteId;
}

export interface ReviewNoteWarning {
  code: string;
  message: string;
}

export interface ReadReviewNoteResponse {
  draftNoteId: NoteId;
  draftPath: string;
  title: string;
  targetCorpus: CorpusId;
  scope?: string;
  noteType: NoteType;
  authorityRisk: NoteAuthorityRisk;
  reviewState: DraftReviewState;
  promotionEligible: boolean;
  updatedAt: string;
  body: string;
  provenance: ProvenanceRef[];
  warnings: ReviewNoteWarning[];
}
