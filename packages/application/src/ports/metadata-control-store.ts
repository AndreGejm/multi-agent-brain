import type {
  ChunkId,
  ChunkRecord,
  CorpusId,
  NoteLifecycleState,
  NoteId,
  ControlledTag,
  NoteType,
  DraftReviewDecision,
  DraftReviewState,
  NoteAuthorityRisk,
  NoteSourceBasis
} from "@multi-agent-brain/domain";
import type {
  ActorContext,
  ProvenanceRef,
  QueryHistoryRequest,
  QueryHistoryResponse
} from "@multi-agent-brain/contracts";
import type { CanonicalNoteRecord } from "./canonical-note-repository.js";
import type { StagingDraftRecord } from "./staging-note-repository.js";

export interface MetadataNoteRecord {
  noteId: NoteId;
  corpusId: CorpusId;
  notePath: string;
  noteType: NoteType;
  lifecycleState: NoteLifecycleState;
  revision: string;
  updatedAt: string;
  currentState: boolean;
  validFrom?: string;
  validUntil?: string;
  summary?: string;
  scope?: string;
  tags?: ControlledTag[];
  contentHash?: string;
  semanticSignature?: string;
  authorityRisk?: NoteAuthorityRisk;
  reviewState?: DraftReviewState;
  reviewRequired?: boolean;
  promotionEligible?: boolean;
  submittedByActorId?: string;
  submittedByActorRole?: ActorContext["actorRole"];
  submittedAt?: string;
  reviewedByActorId?: string;
  reviewedByActorRole?: ActorContext["actorRole"];
  reviewTimestamp?: string;
  reviewedRevision?: string;
  reviewDecision?: DraftReviewDecision;
  reviewNotes?: string;
  classificationHash?: string;
  policyVersion?: string;
  templateId?: string;
}

export interface NoteProvenanceRecord {
  noteId: NoteId;
  ordinal: number;
  sourceBasis: NoteSourceBasis;
  sourceNoteId?: ProvenanceRef["noteId"];
  sourceNotePath?: ProvenanceRef["notePath"];
  headingPath?: ProvenanceRef["headingPath"];
  chunkId?: ProvenanceRef["chunkId"];
  excerpt?: ProvenanceRef["excerpt"];
  recordedAt: string;
}

export interface MetadataNoteReviewUpdate {
  noteId: NoteId;
  reviewState: DraftReviewState;
  reviewRequired: boolean;
  promotionEligible: boolean;
  reviewedByActorId?: string;
  reviewedByActorRole?: ActorContext["actorRole"];
  reviewTimestamp?: string;
  reviewedRevision?: string;
  reviewDecision?: DraftReviewDecision;
  reviewNotes?: string;
}

export interface PromotionDecisionRecord {
  promotionEventId?: string;
  draftNoteId: NoteId;
  canonicalNoteId: NoteId;
  supersededNoteIds: NoteId[];
  promotedAt: string;
}

export type PromotionOutboxState =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface PromotionOutboxPayload {
  actor: ActorContext;
  targetCorpus: CorpusId;
  canonicalWrites: CanonicalNoteRecord[];
  draftUpdate: StagingDraftRecord;
  promotionDecision: PromotionDecisionRecord;
}

export interface PromotionOutboxRecord {
  outboxId: string;
  state: PromotionOutboxState;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  payload: PromotionOutboxPayload;
}

export interface TemporalValiditySummary {
  asOf: string;
  expiringWithinDays: number;
  expiredCurrentStateNotes: number;
  futureDatedCurrentStateNotes: number;
  expiringSoonCurrentStateNotes: number;
}

export type TemporalValidityCandidateState =
  | "expired"
  | "future_dated"
  | "expiring_soon";

export interface TemporalValidityCandidate {
  noteId: NoteId;
  corpusId: CorpusId;
  notePath: string;
  noteType: NoteType;
  lifecycleState: NoteLifecycleState;
  currentState: boolean;
  updatedAt: string;
  validFrom?: string;
  validUntil?: string;
  summary?: string;
  scope?: string;
  state: TemporalValidityCandidateState;
  daysPastDue?: number;
  daysUntilValidityStart?: number;
  daysUntilExpiry?: number;
}

export interface TemporalValidityReport extends TemporalValiditySummary {
  limitPerCategory: number;
  expiredCurrentState: TemporalValidityCandidate[];
  futureDatedCurrentState: TemporalValidityCandidate[];
  expiringSoonCurrentState: TemporalValidityCandidate[];
}

export interface MetadataControlStore {
  upsertNote(note: MetadataNoteRecord): Promise<void>;
  getNote(noteId: NoteId): Promise<MetadataNoteRecord | null>;
  updateNoteReview(note: MetadataNoteReviewUpdate): Promise<MetadataNoteRecord | null>;
  replaceNoteProvenance(noteId: NoteId, provenance: NoteProvenanceRecord[]): Promise<void>;
  getNoteProvenance(noteId: NoteId): Promise<NoteProvenanceRecord[]>;
  upsertChunks(chunks: ChunkRecord[]): Promise<void>;
  removeChunksByNoteId(noteId: NoteId): Promise<void>;
  getChunksByIds(chunkIds: ChunkId[]): Promise<ChunkRecord[]>;
  getChunkNeighborhood(chunkId: ChunkId, radius: number): Promise<ChunkRecord[]>;
  findPotentialDuplicates(input: {
    corpusId: CorpusId;
    contentHash?: string;
    semanticSignature?: string;
  }): Promise<MetadataNoteRecord[]>;
  enqueuePromotionOutbox(input: {
    outboxId: string;
    payload: PromotionOutboxPayload;
  }): Promise<PromotionOutboxRecord>;
  getPromotionOutboxEntry(outboxId: string): Promise<PromotionOutboxRecord | null>;
  listPromotionOutboxEntries(input?: {
    states?: PromotionOutboxState[];
    limit?: number;
  }): Promise<PromotionOutboxRecord[]>;
  claimPromotionOutboxEntry(outboxId: string): Promise<PromotionOutboxRecord | null>;
  completePromotionOutboxEntry(outboxId: string): Promise<void>;
  failPromotionOutboxEntry(outboxId: string, lastError: string): Promise<void>;
  recordPromotion(decision: PromotionDecisionRecord): Promise<void>;
  getTemporalValiditySummary(input?: {
    asOf?: string;
    expiringWithinDays?: number;
    corpusId?: CorpusId;
  }): Promise<TemporalValiditySummary>;
  getTemporalValidityReport(input?: {
    asOf?: string;
    expiringWithinDays?: number;
    corpusId?: CorpusId;
    limitPerCategory?: number;
  }): Promise<TemporalValidityReport>;
  getTemporalValidityCandidate(noteId: NoteId, input?: {
    asOf?: string;
    expiringWithinDays?: number;
    corpusId?: CorpusId;
  }): Promise<TemporalValidityCandidate | null>;
  queryHistory(request: QueryHistoryRequest): Promise<QueryHistoryResponse>;
}
