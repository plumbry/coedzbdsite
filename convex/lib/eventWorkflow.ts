import type { Doc, Id } from "../_generated/dataModel.d.ts";
import {
  eventHasLeaderboardUrls,
  eventHasLinkedScrimSeries,
} from "./eventYuniteRequirement";

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

export type EventWorkflowImportSummary = {
  _id: Id<"thirdPartyImports">;
  eventName: string;
  playersUnmatched: number;
  matchDataSynced?: boolean;
  source: string;
  importMethod?: string;
  totalPlayers: number;
};

export type EventWorkflowContext = {
  linkedImports: EventWorkflowImportSummary[];
  manualResultCount: number;
  scrimSeriesScoreCount: number;
};

export type AdminActionItem = {
  id: string;
  category:
    | "event_setup"
    | "import_players"
    | "import_link"
    | "import_sync"
    | "event_results";
  recordId: string;
  recordLabel: string;
  reason: string;
  reasonCode: SetupReasonCode | "unlinked_import" | "unsynced_yunite";
  actionLabel: string;
  href: string;
};

type DateStatus = "upcoming" | "ongoing" | "completed";

type EventWorkflowFields = Pick<
  Doc<"events">,
  | "type"
  | "twoLobbies"
  | "standardLeaderboards"
  | "standardLeaderboardsLobby2"
  | "qualifierLobby1Leaderboards"
  | "qualifierLobby2Leaderboards"
  | "finalsLeaderboards"
  | "linkedScrimSeriesId"
  | "needsSetup"
  | "adminWorkflowStatus"
>;

export const SETUP_REASON_MESSAGES: Record<SetupReasonCode, string> = {
  results_not_entered: "Results not entered",
  player_matching_incomplete: "Player matching incomplete",
  match_sync_pending: "Match sync pending",
  import_not_linked: "Import not linked",
  manual_results_missing: "Manual results missing",
  discord_import_incomplete: "Discord import incomplete",
};

export const SETUP_REASON_ACTIONS: Record<SetupReasonCode, string> = {
  results_not_entered: "Enter Results",
  player_matching_incomplete: "Resolve Players",
  match_sync_pending: "Retry Sync",
  import_not_linked: "Link Event",
  manual_results_missing: "Enter Results",
  discord_import_incomplete: "Complete Setup",
};

export function isYuniteImportRecord(importRecord: {
  source: string;
  importMethod?: string;
}): boolean {
  return (
    importRecord.source === "Yunite" ||
    importRecord.source === "Yunite API" ||
    importRecord.importMethod === "api"
  );
}

export function isYuniteImportUnsynced(importRecord: {
  source: string;
  importMethod?: string;
  matchDataSynced?: boolean;
}): boolean {
  return isYuniteImportRecord(importRecord) && importRecord.matchDataSynced !== true;
}

/** Events scored outside Yunite imports (manual entry, Scrim Series, etc.). */
export function isManualScoringEvent(event: EventWorkflowFields): boolean {
  if (eventHasLinkedScrimSeries(event)) {
    return true;
  }
  if (eventHasLeaderboardUrls(event)) {
    return false;
  }
  return true;
}

export function eventHasYuniteIntegration(
  event: EventWorkflowFields,
  linkedImportCount: number,
): boolean {
  return (
    eventHasLeaderboardUrls(event) ||
    eventHasLinkedScrimSeries(event) ||
    linkedImportCount > 0
  );
}

export function computeSetupReasons(
  event: EventWorkflowFields,
  ctx: EventWorkflowContext,
  dateStatus: DateStatus,
): SetupReasonCode[] {
  const reasons: SetupReasonCode[] = [];

  if (event.needsSetup) {
    reasons.push("discord_import_incomplete");
  }

  const hasUrls = eventHasLeaderboardUrls(event);
  const linkedImports = ctx.linkedImports;

  if (hasUrls && linkedImports.length === 0) {
    reasons.push("import_not_linked");
  }

  const unmatchedPlayers = linkedImports.reduce(
    (total, importRecord) => total + importRecord.playersUnmatched,
    0,
  );
  if (unmatchedPlayers > 0) {
    reasons.push("player_matching_incomplete");
  }

  if (linkedImports.some(isYuniteImportUnsynced)) {
    reasons.push("match_sync_pending");
  }

  const manualScoring = isManualScoringEvent(event);
  const eventEnded = dateStatus === "completed";

  if (manualScoring && eventEnded) {
    const hasManualResults =
      ctx.manualResultCount > 0 || ctx.scrimSeriesScoreCount > 0;
    if (!hasManualResults) {
      reasons.push("manual_results_missing");
    }
  } else if (eventEnded && !manualScoring) {
    const hasImportResults = linkedImports.some(
      (importRecord) => importRecord.totalPlayers > 0,
    );
    if (!hasImportResults) {
      reasons.push("results_not_entered");
    }
  }

  return reasons;
}

export function computeWorkflowStatus(
  event: EventWorkflowFields,
  ctx: EventWorkflowContext,
  dateStatus: DateStatus,
): EventWorkflowStatus | null {
  if (event.adminWorkflowStatus === "archived") {
    return "archived";
  }
  if (event.adminWorkflowStatus === "complete") {
    return "complete";
  }

  const reasons = computeSetupReasons(event, ctx, dateStatus);

  if (reasons.length === 0) {
    return dateStatus === "completed" ? "complete" : null;
  }

  if (reasons.includes("manual_results_missing")) {
    return "manual_results_pending";
  }

  if (reasons.includes("import_not_linked")) {
    return "awaiting_import";
  }

  if (
    reasons.includes("discord_import_incomplete") ||
    dateStatus !== "completed"
  ) {
    return "draft";
  }

  return "ready_for_results";
}

function firstImportWithUnmatched(
  imports: EventWorkflowImportSummary[],
): EventWorkflowImportSummary | undefined {
  return imports.find((importRecord) => importRecord.playersUnmatched > 0);
}

function firstUnsyncedYuniteImport(
  imports: EventWorkflowImportSummary[],
): EventWorkflowImportSummary | undefined {
  return imports.find(isYuniteImportUnsynced);
}

export function buildEventActionItems(
  event: { _id: Id<"events">; name: string; type: Doc<"events">["type"]; linkedScrimSeriesId?: Id<"scrimSeries"> },
  reasons: SetupReasonCode[],
  ctx: EventWorkflowContext,
): AdminActionItem[] {
  const items: AdminActionItem[] = [];
  const eventHref = `/admin/events-manager?event=${event._id}`;

  for (const reasonCode of reasons) {
    let href = eventHref;
    let recordLabel = event.name;

    if (reasonCode === "player_matching_incomplete") {
      const importRecord = firstImportWithUnmatched(ctx.linkedImports);
      if (importRecord) {
        href = `/admin/unmatched/${importRecord._id}`;
        recordLabel = `${event.name} (${importRecord.playersUnmatched} unmatched)`;
      }
    } else if (reasonCode === "match_sync_pending") {
      const importRecord = firstUnsyncedYuniteImport(ctx.linkedImports);
      if (importRecord) {
        href = `/admin/yunite/${importRecord._id}`;
        recordLabel = `${event.name} (${importRecord.eventName})`;
      }
    } else if (reasonCode === "import_not_linked") {
      href = "/admin/uploads";
    } else if (
      reasonCode === "manual_results_missing" ||
      reasonCode === "results_not_entered"
    ) {
      if (event.type === "scrim-series" && event.linkedScrimSeriesId) {
        href = `/admin/scrim-series?series=${event.linkedScrimSeriesId}&tab=scores`;
      } else {
        href = "/admin/event-results";
      }
    }

    items.push({
      id: `event-${event._id}-${reasonCode}`,
      category:
        reasonCode === "results_not_entered" ||
        reasonCode === "manual_results_missing"
          ? "event_results"
          : "event_setup",
      recordId: event._id,
      recordLabel,
      reason: SETUP_REASON_MESSAGES[reasonCode],
      reasonCode,
      actionLabel: SETUP_REASON_ACTIONS[reasonCode],
      href,
    });
  }

  return items;
}

export function buildImportActionItems(
  importRecord: {
    _id: Id<"thirdPartyImports">;
    eventName: string;
    eventId?: Id<"events">;
    playersUnmatched: number;
    source: string;
    importMethod?: string;
    matchDataSynced?: boolean;
  },
): AdminActionItem[] {
  const items: AdminActionItem[] = [];
  const importLabel = `${importRecord.eventName} (Import)`;

  if (importRecord.playersUnmatched > 0) {
    items.push({
      id: `import-${importRecord._id}-unmatched`,
      category: "import_players",
      recordId: importRecord._id,
      recordLabel: importLabel,
      reason: `${importRecord.playersUnmatched} player${
        importRecord.playersUnmatched === 1 ? "" : "s"
      } unmatched`,
      reasonCode: "player_matching_incomplete",
      actionLabel: "Resolve Players",
      href: `/admin/unmatched/${importRecord._id}`,
    });
  }

  if (!importRecord.eventId) {
    items.push({
      id: `import-${importRecord._id}-unlinked`,
      category: "import_link",
      recordId: importRecord._id,
      recordLabel: importLabel,
      reason: "Import not linked to an event",
      reasonCode: "unlinked_import",
      actionLabel: "Link Event",
      href: "/admin/uploads",
    });
  }

  if (isYuniteImportUnsynced(importRecord)) {
    items.push({
      id: `import-${importRecord._id}-unsynced`,
      category: "import_sync",
      recordId: importRecord._id,
      recordLabel: importLabel,
      reason: "Match data unsynced",
      reasonCode: "unsynced_yunite",
      actionLabel: "Retry Sync",
      href: `/admin/yunite/${importRecord._id}`,
    });
  }

  return items;
}

export function summarizeEventWorkflow(
  event: EventWorkflowFields & {
    _id: Id<"events">;
    name: string;
    linkedScrimSeriesId?: Id<"scrimSeries">;
  },
  ctx: EventWorkflowContext,
  dateStatus: DateStatus,
) {
  const setupReasons = computeSetupReasons(event, ctx, dateStatus);
  const workflowStatus = computeWorkflowStatus(event, ctx, dateStatus);
  const needsAttention = setupReasons.length > 0;

  return {
    setupReasons,
    workflowStatus,
    needsAttention,
    isManualScoring: isManualScoringEvent(event),
    actionItems: needsAttention
      ? buildEventActionItems(event, setupReasons, ctx)
      : [],
  };
}
