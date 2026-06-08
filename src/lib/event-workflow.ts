export type EventWorkflowStatus =
  | "draft"
  | "awaiting_import"
  | "manual_results_pending"
  | "ready_for_results"
  | "complete"
  | "archived";

export type SetupReasonCode =
  | "results_not_entered"
  | "player_matching_incomplete"
  | "match_sync_pending"
  | "import_not_linked"
  | "manual_results_missing"
  | "discord_import_incomplete";

export const WORKFLOW_STATUS_LABELS: Record<EventWorkflowStatus, string> = {
  draft: "Draft",
  awaiting_import: "Awaiting Import",
  manual_results_pending: "Manual Results Pending",
  ready_for_results: "Ready For Results",
  complete: "Complete",
  archived: "Archived",
};

export const SETUP_REASON_LABELS: Record<SetupReasonCode, string> = {
  results_not_entered: "Results not entered",
  player_matching_incomplete: "Player matching incomplete",
  match_sync_pending: "Match sync pending",
  import_not_linked: "Import not linked",
  manual_results_missing: "Manual results missing",
  discord_import_incomplete: "Discord import incomplete",
};

export function workflowStatusBadgeVariant(
  status: EventWorkflowStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "complete":
    case "archived":
      return "secondary";
    case "draft":
    case "manual_results_pending":
      return "destructive";
    case "awaiting_import":
    case "ready_for_results":
      return "outline";
    default:
      return "default";
  }
}

export function formatSetupReasons(reasons: SetupReasonCode[]): string {
  if (reasons.length === 0) {
    return "";
  }
  return reasons.map((reason) => SETUP_REASON_LABELS[reason]).join(", ");
}
