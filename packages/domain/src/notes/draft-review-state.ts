export const DRAFT_REVIEW_STATES = [
  "unreviewed",
  "approved_draft",
  "rewrite_requested",
  "merge_required",
  "rejected",
  "escalated",
  "promotion_ready"
] as const;

export type DraftReviewState = (typeof DRAFT_REVIEW_STATES)[number];
