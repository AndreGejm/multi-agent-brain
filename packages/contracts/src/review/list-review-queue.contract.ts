import type { ActorContext } from "../common/actor-context.js";
import type {
  CorpusId,
  DraftReviewState,
  NoteAuthorityRisk,
  NoteId,
  NoteType
} from "@multi-agent-brain/domain";

export interface ListReviewQueueRequest {
  actor: ActorContext;
  targetCorpus?: CorpusId;
  includeRejected?: boolean;
}

export interface ReviewQueueItem {
  draftNoteId: NoteId;
  title: string;
  targetCorpus: CorpusId;
  scope?: string;
  noteType: NoteType;
  updatedAt: string;
  reviewState: DraftReviewState;
  authorityRisk: NoteAuthorityRisk;
  warningSummary: string[];
}

export interface ListReviewQueueResponse {
  items: ReviewQueueItem[];
}
