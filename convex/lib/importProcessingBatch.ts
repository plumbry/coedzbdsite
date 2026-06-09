/** Rows processed per import pipeline batch mutation. */
export const IMPORT_ROW_BATCH_SIZE = 75;

/** Max automatic retries for transient Yunite/network errors before failing the job. */
export const MAX_PIPELINE_RETRIES = 8;

/** Minimum rows between throttled progress writes. */
export const PROGRESS_ROW_INTERVAL = 50;

/** Minimum fraction of step progress between throttled progress writes. */
export const PROGRESS_PCT_INTERVAL = 0.1;

export type ImportProgressWriteReason =
  | "step_start"
  | "interval"
  | "step_complete"
  | "error";

export function shouldWriteImportProgress(args: {
  current: number;
  total: number;
  lastWriteRow: number;
  reason?: ImportProgressWriteReason;
}): boolean {
  const { current, total, lastWriteRow, reason } = args;

  if (reason === "step_start" || reason === "step_complete" || reason === "error") {
    return true;
  }

  if (total <= 0) {
    return current === 0;
  }

  if (current >= total) {
    return true;
  }

  if (current - lastWriteRow >= PROGRESS_ROW_INTERVAL) {
    return true;
  }

  const lastPct = lastWriteRow / total;
  const currentPct = current / total;
  return currentPct - lastPct >= PROGRESS_PCT_INTERVAL;
}

export function isApiPipelineStep(step: string): boolean {
  return step === "sync_match_data" || step === "populate_team_members";
}
