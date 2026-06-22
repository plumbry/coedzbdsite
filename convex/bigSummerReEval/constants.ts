export const TRACKER_STATUSES = [
  "public",
  "private",
  "missing",
  "mismatch",
  "waiting_for_public_tracker",
  "waiting_for_public_tracker_extended",
  "tracker_fixed",
] as const;

export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export const RE_EVAL_STATUSES = [
  "unchecked",
  "waiting_initial_5_days",
  "deadline_passed",
  "extended_final_5_days",
  "extension_deadline_passed",
  "ready_to_review",
  "reviewed",
  "queued_for_access_removal",
  "access_removed",
  "tier_change_queued",
  "tier_change_complete",
  "tier_change_failed",
  "retired",
] as const;

export type ReEvalStatus = (typeof RE_EVAL_STATUSES)[number];

export const FINAL_DECISIONS = [
  "S",
  "A",
  "B",
  "C",
  "no_change",
  "remove_access",
  "retired",
] as const;

export type FinalDecision = (typeof FINAL_DECISIONS)[number];

export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export const TRACKER_PROBLEM_STATUSES: TrackerStatus[] = [
  "private",
  "missing",
  "mismatch",
];

export const TRACKER_STATUS_LABELS: Record<TrackerStatus, string> = {
  public: "Public",
  private: "Private",
  missing: "Missing",
  mismatch: "Mismatch",
  waiting_for_public_tracker: "Waiting For Public Tracker",
  waiting_for_public_tracker_extended: "Waiting For Public Tracker (Extended)",
  tracker_fixed: "Tracker Fixed",
};

export const RE_EVAL_STATUS_LABELS: Record<ReEvalStatus, string> = {
  unchecked: "Unchecked",
  waiting_initial_5_days: "Waiting - Initial 5 Days",
  deadline_passed: "Deadline Passed",
  extended_final_5_days: "Extended - Final 5 Days",
  extension_deadline_passed: "Extension Deadline Passed",
  ready_to_review: "Ready To Review",
  reviewed: "Reviewed",
  queued_for_access_removal: "Queued For Access Removal",
  access_removed: "Access Removed",
  tier_change_queued: "Tier Change Queued",
  tier_change_complete: "Tier Change Complete",
  tier_change_failed: "Tier Change Failed",
  retired: "Retired",
};

export const QUEUE_ACTION_REASONS = {
  trackerNotPublic: "big_summer_reeval_tracker_not_public",
  trackerNotPublicAfterExtension: "big_summer_reeval_tracker_not_public_after_extension",
  tierChange: "big_summer_reeval_tier_change",
  accessRemoval: "big_summer_reeval_access_removal",
  retire: "big_summer_reeval_retire",
} as const;

export type DashboardFilter =
  | "all"
  | "needs_action"
  | "needs_tracker_link"
  | "private_tracker"
  | "missing_tracker"
  | "waiting_for_public_tracker"
  | "deadline_passed"
  | "ready_to_review"
  | "reviewed"
  | "tier_changes"
  | "access_removal_queue"
  | "access_removed"
  | "retired";
