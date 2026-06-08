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

export type YuniteLeaderboardEntryLike = {
  users?: Array<{
    discordId?: string;
    epicId?: string;
    name?: string;
  }>;
  discordId?: string;
  epicName?: string;
  username?: string;
  displayName?: string;
};

export type YuniteTournamentMetadataLike = {
  id?: string;
  name?: string;
  startedAt?: string;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Normalize Yunite leaderboard JSON (array or `{ data: [...] }`). */
export function normalizeYuniteLeaderboardPayload(
  raw: unknown,
): YuniteLeaderboardEntryLike[] {
  if (Array.isArray(raw)) {
    return raw as YuniteLeaderboardEntryLike[];
  }
  if (raw && typeof raw === "object") {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as YuniteLeaderboardEntryLike[];
    }
  }
  return [];
}

/** True when the leaderboard JSON has at least one identifiable player. */
export function yuniteLeaderboardHasPlayerData(
  entries: YuniteLeaderboardEntryLike[],
): boolean {
  for (const entry of entries) {
    if (entry.users && entry.users.length > 0) {
      for (const user of entry.users) {
        if (hasText(user.discordId) || hasText(user.epicId) || hasText(user.name)) {
          return true;
        }
      }
      continue;
    }
    if (
      hasText(entry.discordId) ||
      hasText(entry.epicName) ||
      hasText(entry.username) ||
      hasText(entry.displayName)
    ) {
      return true;
    }
  }
  return false;
}

/** True when the tournament object has basic metadata (id plus name or start time). */
export function yuniteTournamentHasMetadata(
  tournament: YuniteTournamentMetadataLike,
): boolean {
  return (
    hasText(tournament.id) &&
    (hasText(tournament.name) || hasText(tournament.startedAt))
  );
}

/** True when both tournament metadata and leaderboard player data are present. */
export function yuniteTournamentHasImportableData(
  tournament: YuniteTournamentMetadataLike,
  leaderboardPayload: unknown,
): boolean {
  return (
    yuniteTournamentHasMetadata(tournament) &&
    yuniteLeaderboardHasPlayerData(
      normalizeYuniteLeaderboardPayload(leaderboardPayload),
    )
  );
}
