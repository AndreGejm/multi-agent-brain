export const NOTE_SOURCE_BASES = [
  "user_instruction",
  "repo_inspection",
  "retrieved_note",
  "direct_observation",
  "session_synthesis",
  "inferred_multi_source",
  "imported_external"
] as const;

export type NoteSourceBasis = (typeof NOTE_SOURCE_BASES)[number];
