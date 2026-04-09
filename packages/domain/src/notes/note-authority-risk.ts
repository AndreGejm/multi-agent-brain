export const NOTE_AUTHORITY_RISKS = [
  "low",
  "medium",
  "high",
  "critical"
] as const;

export type NoteAuthorityRisk = (typeof NOTE_AUTHORITY_RISKS)[number];
