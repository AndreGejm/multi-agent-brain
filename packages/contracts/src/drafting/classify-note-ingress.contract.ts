import type {
  CorpusId,
  NoteAuthorityRisk,
  NoteIngressAction,
  NoteSourceBasis,
  NoteType
} from "@multi-agent-brain/domain";
import type { ActorContext } from "../common/actor-context.js";
import type { ProvenanceRef } from "../common/provenance-ref.js";

export type NoteIngressConfidence = "low" | "medium" | "high";

export interface NoteIngressValidationConstraints {
  rejectPlaceholders: boolean;
  rejectEmptyRequiredSections: boolean;
  enforceSectionSubstance: boolean;
  allowCurrentState: boolean;
  requireSupportingSources: boolean;
  requireStructuredProvenance: boolean;
  requireTitleSummaryBodyConsistency: boolean;
  exactDuplicateAction: "reject" | "merge_candidate";
  nearDuplicateAction: "merge_candidate" | "review_required";
}

export interface NoteIngressMergeHint {
  noteId?: string;
  notePath?: string;
  reason: string;
  similarity?: number;
}

export interface ClassifyNoteIngressRequest {
  actor: ActorContext;
  targetCorpus?: CorpusId;
  noteType?: NoteType;
  title: string;
  sourcePrompt: string;
  supportingSources: ProvenanceRef[];
  bodyHints?: string[];
  scopeHint?: string;
  candidateSummary?: string;
  currentStateIntent?: boolean;
  sourceBasis?: NoteSourceBasis[];
}

export interface ClassifyNoteIngressResponse {
  contractVersion: "note-ingress.v1";
  policyVersion: string;
  classificationHash: string;
  action: NoteIngressAction;
  noteType: NoteType;
  targetCorpus: CorpusId;
  scope: string;
  durability: "transient" | "session" | "durable";
  authorityRisk: NoteAuthorityRisk;
  reviewRequired: boolean;
  promotionEligible: boolean;
  requiredTemplate: string | null;
  requiredSections: string[];
  requiredProvenance: NoteSourceBasis[];
  allowedSourceBasis: NoteSourceBasis[];
  validationConstraints: NoteIngressValidationConstraints;
  rejectionReasons: string[];
  mergeHints: NoteIngressMergeHint[];
  classificationConfidence: NoteIngressConfidence;
  evidenceConfidence: NoteIngressConfidence;
}
