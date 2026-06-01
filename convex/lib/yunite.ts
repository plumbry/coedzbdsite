import type { Doc } from "../_generated/dataModel.d.ts";

type EventLeaderboardFields = Pick<
  Doc<"events">,
  | "standardLeaderboards"
  | "standardLeaderboardsLobby2"
  | "qualifierLobby1Leaderboards"
  | "qualifierLobby2Leaderboards"
  | "finalsLeaderboards"
  | "apiLeaderboards"
>;

export function extractTournamentIdFromUrl(url: string): string | null {
  const match = url.match(/\/leaderboard\/([^/\s?#]+)/);
  return match ? match[1] : null;
}

export function extractTournamentIdFromLeaderboardId(
  leaderboardId: string,
): string | null {
  if (leaderboardId.startsWith("yunite-")) {
    return leaderboardId.slice(7);
  }
  return null;
}

export function collectEventLeaderboardUrls(
  event: EventLeaderboardFields,
  options: { includeStandardLobby2?: boolean } = {},
): string[] {
  const { includeStandardLobby2 = true } = options;
  const urls: string[] = [];

  if (event.standardLeaderboards) urls.push(...event.standardLeaderboards);
  if (includeStandardLobby2 && event.standardLeaderboardsLobby2) {
    urls.push(...event.standardLeaderboardsLobby2);
  }
  if (event.qualifierLobby1Leaderboards) {
    urls.push(...event.qualifierLobby1Leaderboards);
  }
  if (event.qualifierLobby2Leaderboards) {
    urls.push(...event.qualifierLobby2Leaderboards);
  }
  if (event.finalsLeaderboards) urls.push(...event.finalsLeaderboards);
  if (event.apiLeaderboards) urls.push(...event.apiLeaderboards);

  return urls.filter((url) => url.trim().length > 0);
}
