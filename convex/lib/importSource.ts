/** True for Yunite API / auto-sync imports (ZBD event records). */
export function isYuniteImport(importRecord: {
  source: string;
  importMethod?: string;
  leaderboardId?: string;
}): boolean {
  const normalized = importRecord.source.trim().toLowerCase();
  if (normalized === "yunite" || normalized === "yunite api") {
    return true;
  }
  if (importRecord.importMethod === "api") {
    return true;
  }
  if (importRecord.leaderboardId?.startsWith("yunite-")) {
    return true;
  }
  return false;
}
