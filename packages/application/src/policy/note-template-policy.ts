import type { NoteType } from "@multi-agent-brain/domain";

export interface NoteTemplateSpec {
  templateId: string;
  noteType: NoteType;
  requiredSections: string[];
}

export const NOTE_TEMPLATE_SPECS: Record<NoteType, NoteTemplateSpec> = {
  decision: {
    templateId: "decision.v1",
    noteType: "decision",
    requiredSections: ["Context", "Decision", "Rationale", "Consequences"]
  },
  constraint: {
    templateId: "constraint.v1",
    noteType: "constraint",
    requiredSections: ["Constraint", "Scope", "Rationale", "Implications"]
  },
  bug: {
    templateId: "bug.v1",
    noteType: "bug",
    requiredSections: ["Summary", "Symptoms", "Reproduction", "Impact", "Status"]
  },
  investigation: {
    templateId: "investigation.v1",
    noteType: "investigation",
    requiredSections: ["Question", "Findings", "Evidence", "Next Steps"]
  },
  runbook: {
    templateId: "runbook.v1",
    noteType: "runbook",
    requiredSections: ["Purpose", "Preconditions", "Procedure", "Verification"]
  },
  architecture: {
    templateId: "architecture.v1",
    noteType: "architecture",
    requiredSections: ["Context", "Components", "Data Flow", "Constraints"]
  },
  glossary: {
    templateId: "glossary.v1",
    noteType: "glossary",
    requiredSections: ["Term", "Definition", "Related Terms"]
  },
  handoff: {
    templateId: "handoff.v1",
    noteType: "handoff",
    requiredSections: ["Context", "Current State", "Open Questions", "Next Steps"]
  },
  reference: {
    templateId: "reference.v1",
    noteType: "reference",
    requiredSections: ["Summary", "Details", "Sources"]
  },
  policy: {
    templateId: "policy.v1",
    noteType: "policy",
    requiredSections: ["Policy", "Scope", "Rules", "Exceptions"]
  }
};

export function getNoteTemplateSpec(noteType: NoteType): NoteTemplateSpec {
  return NOTE_TEMPLATE_SPECS[noteType];
}

export const NOTE_REQUIRED_SECTIONS_BY_TYPE: Record<NoteType, string[]> =
  Object.fromEntries(
    Object.entries(NOTE_TEMPLATE_SPECS).map(([noteType, spec]) => [
      noteType,
      spec.requiredSections
    ])
  ) as Record<NoteType, string[]>;
