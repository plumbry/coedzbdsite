import type { Doc, Id } from "../_generated/dataModel.d.ts";

/** Explicit import pipeline statuses (stored on thirdPartyImports.pipelineStatus). */
export type ImportPipelineStatus =
  | "Imported"
  | "Match Data Pending"
  | "Syncing Match Data"
  | "Match Data Synced"
  | "Player Matching Required"
  | "Matching Players"
  | "Players Matched"
  | "Event Link Required"
  | "Linking Event"
  | "Linked To Event"
  | "Generating Results"
  | "Results Generated"
  | "Finalized"
  | "Failed"
  | "Rate Limited"
  | "Ignored";

export type ImportPipelineStep =
  | "sync_match_data"
  | "populate_team_members"
  | "match_players"
  | "link_event"
  | "validate_results"
  | "finalize";

export const YUNITE_PIPELINE_STEPS: ImportPipelineStep[] = [
  "sync_match_data",
  "populate_team_members",
  "match_players",
  "link_event",
  "validate_results",
  "finalize",
];

export const CSV_PIPELINE_STEPS: ImportPipelineStep[] = [
  "match_players",
  "link_event",
  "validate_results",
  "finalize",
];

export function isYuniteSource(source: string) {
  return source === "Yunite" || source === "Yunite API";
}

export function pipelineStepsForImport(source: string): ImportPipelineStep[] {
  return isYuniteSource(source) ? YUNITE_PIPELINE_STEPS : CSV_PIPELINE_STEPS;
}

export function statusForStep(step: ImportPipelineStep): ImportPipelineStatus {
  switch (step) {
    case "sync_match_data":
      return "Syncing Match Data";
    case "populate_team_members":
      return "Generating Results";
    case "match_players":
      return "Matching Players";
    case "link_event":
      return "Linking Event";
    case "validate_results":
      return "Generating Results";
    case "finalize":
      return "Finalized";
  }
}

export function progressMessageForStep(
  step: ImportPipelineStep,
  detail?: { current?: number; total?: number; extra?: string },
): string {
  const suffix = detail?.extra ? ` ${detail.extra}` : "";
  switch (step) {
    case "sync_match_data":
      return `Syncing match data…${suffix}`;
    case "populate_team_members":
      return `Populating team members…${suffix}`;
    case "match_players":
      if (detail?.current != null && detail?.total != null) {
        return `Matching players (${detail.current}/${detail.total})…`;
      }
      return `Matching players…${suffix}`;
    case "link_event":
      return `Linking event…${suffix}`;
    case "validate_results":
      return `Validating normalized results…${suffix}`;
    case "finalize":
      return `Finalizing import…${suffix}`;
  }
}

export function isImportFinalized(
  imp: Pick<Doc<"thirdPartyImports">, "pipelineStatus">,
) {
  return imp.pipelineStatus === "Finalized";
}

export function shouldSkipStep(
  imp: Doc<"thirdPartyImports">,
  step: ImportPipelineStep,
  forceReprocess: boolean,
): boolean {
  if (forceReprocess) {
    return false;
  }

  switch (step) {
    case "sync_match_data":
      return imp.matchDataSynced === true;
    case "populate_team_members":
      return imp.matchDataSynced !== true;
    case "match_players":
      return imp.playersUnmatched === 0;
    case "link_event":
      return imp.eventId != null;
    case "validate_results":
      return false;
    case "finalize":
      return imp.pipelineStatus === "Finalized";
  }
}

export function resolveNextStep(
  imp: Doc<"thirdPartyImports">,
  forceReprocess: boolean,
): ImportPipelineStep | null {
  if (!forceReprocess && imp.pipelineStatus === "Finalized") {
    return null;
  }

  for (const step of pipelineStepsForImport(imp.source)) {
    if (!shouldSkipStep(imp, step, forceReprocess)) {
      return step;
    }
  }

  return null;
}

export function postStepStatus(
  imp: Doc<"thirdPartyImports">,
  completedStep: ImportPipelineStep,
): ImportPipelineStatus {
  switch (completedStep) {
    case "sync_match_data":
      return "Match Data Synced";
    case "populate_team_members":
      return "Results Generated";
    case "match_players":
      return imp.playersUnmatched > 0
        ? "Player Matching Required"
        : "Players Matched";
    case "link_event":
      return imp.eventId ? "Linked To Event" : "Event Link Required";
    case "validate_results":
      return "Results Generated";
    case "finalize":
      return "Finalized";
  }
}

export type ImportProcessingErrorCode =
  | "rate_limited"
  | "event_link_ambiguous"
  | "event_link_missing"
  | "validation_failed"
  | "yunite_api_error"
  | "import_not_found"
  | "not_yunite"
  | "unknown";

export function isRateLimitError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests")
  );
}

export function retryDelayMsForRateLimit(attempt: number) {
  return Math.min(120_000, 15_000 * Math.pow(2, attempt));
}
