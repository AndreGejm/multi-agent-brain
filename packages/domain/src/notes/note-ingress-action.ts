export const NOTE_INGRESS_ACTIONS = [
  "reject",
  "session_only",
  "merge_candidate",
  "draft_candidate",
  "rewrite_required",
  "escalate"
] as const;

export type NoteIngressAction = (typeof NOTE_INGRESS_ACTIONS)[number];
