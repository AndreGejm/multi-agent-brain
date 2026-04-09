export const DRAFT_REVIEW_DECISIONS = [
  "approve_draft",
  "request_rewrite",
  "require_merge",
  "reject",
  "escalate",
  "set_promotion_ready"
] as const;

export type DraftReviewDecision = (typeof DRAFT_REVIEW_DECISIONS)[number];
