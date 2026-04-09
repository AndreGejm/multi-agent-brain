import type {
  ClassifyNoteIngressResponse,
  NoteIngressValidationConstraints
} from "@multi-agent-brain/contracts";
import type {
  NoteAuthorityRisk,
  NoteSourceBasis,
  NoteType
} from "@multi-agent-brain/domain";
import { getNoteTemplateSpec } from "./note-template-policy.js";

interface NoteIngressPolicyByType {
  authorityRisk: NoteAuthorityRisk;
  reviewRequired: boolean;
  requiredProvenance: NoteSourceBasis[];
  allowedSourceBasis: NoteSourceBasis[];
}

export const NOTE_INGRESS_POLICY_VERSION = "2026-04-08.beta1";

const ALL_SOURCE_BASIS: NoteSourceBasis[] = [
  "user_instruction",
  "repo_inspection",
  "retrieved_note",
  "direct_observation",
  "session_synthesis",
  "inferred_multi_source",
  "imported_external"
];

export const NOTE_INGRESS_POLICY: Record<NoteType, NoteIngressPolicyByType> = {
  decision: {
    authorityRisk: "high",
    reviewRequired: true,
    requiredProvenance: ["repo_inspection", "retrieved_note"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  constraint: {
    authorityRisk: "medium",
    reviewRequired: true,
    requiredProvenance: ["repo_inspection", "retrieved_note"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  bug: {
    authorityRisk: "medium",
    reviewRequired: true,
    requiredProvenance: ["direct_observation", "repo_inspection"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  investigation: {
    authorityRisk: "medium",
    reviewRequired: true,
    requiredProvenance: ["repo_inspection", "retrieved_note"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  runbook: {
    authorityRisk: "medium",
    reviewRequired: true,
    requiredProvenance: ["repo_inspection", "direct_observation"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  architecture: {
    authorityRisk: "high",
    reviewRequired: true,
    requiredProvenance: ["repo_inspection", "retrieved_note"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  glossary: {
    authorityRisk: "low",
    reviewRequired: false,
    requiredProvenance: ["retrieved_note"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  handoff: {
    authorityRisk: "low",
    reviewRequired: false,
    requiredProvenance: ["session_synthesis"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  reference: {
    authorityRisk: "low",
    reviewRequired: false,
    requiredProvenance: ["retrieved_note"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  },
  policy: {
    authorityRisk: "high",
    reviewRequired: true,
    requiredProvenance: ["user_instruction"],
    allowedSourceBasis: ALL_SOURCE_BASIS
  }
};

export function buildDefaultValidationConstraints(
  allowCurrentState: boolean
): NoteIngressValidationConstraints {
  return {
    rejectPlaceholders: true,
    rejectEmptyRequiredSections: true,
    enforceSectionSubstance: true,
    allowCurrentState,
    requireSupportingSources: false,
    requireStructuredProvenance: true,
    requireTitleSummaryBodyConsistency: true,
    exactDuplicateAction: "merge_candidate",
    nearDuplicateAction: "merge_candidate"
  };
}

export function resolveIngressShape(noteType: NoteType): Pick<
  ClassifyNoteIngressResponse,
  | "authorityRisk"
  | "reviewRequired"
  | "requiredTemplate"
  | "requiredSections"
  | "requiredProvenance"
  | "allowedSourceBasis"
> {
  const policy = NOTE_INGRESS_POLICY[noteType];
  const template = getNoteTemplateSpec(noteType);

  return {
    authorityRisk: policy.authorityRisk,
    reviewRequired: policy.reviewRequired,
    requiredTemplate: template.templateId,
    requiredSections: template.requiredSections,
    requiredProvenance: policy.requiredProvenance,
    allowedSourceBasis: policy.allowedSourceBasis
  };
}
