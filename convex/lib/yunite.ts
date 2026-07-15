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
  /** Legacy field; Yunite v3 list/detail responses use `startDate` instead. */
  startedAt?: string;
  startDate?: string;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Prefer Yunite v3 `startDate`, fall back to legacy `startedAt`. */
export function getYuniteTournamentStartIso(
  tournament: YuniteTournamentMetadataLike,
): string | undefined {
  for (const candidate of [tournament.startDate, tournament.startedAt]) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }
    const trimmed = candidate.trim();
    if (Number.isFinite(Date.parse(trimmed))) {
      return trimmed;
    }
  }
  return undefined;
}

export function getYuniteTournamentStartMs(
  tournament: YuniteTournamentMetadataLike,
): number | undefined {
  const startIso = getYuniteTournamentStartIso(tournament);
  if (!startIso) {
    return undefined;
  }
  return Date.parse(startIso);
}

/** Derive stored `eventDate` and `tournamentStartedAt` from a Yunite start ISO. */
export function yuniteStartFieldsFromIso(startIso: string | undefined): {
  eventDate: string;
  tournamentStartedAt?: string;
} {
  if (startIso && Number.isFinite(Date.parse(startIso))) {
    const parsed = new Date(startIso);
    return {
      eventDate: parsed.toISOString().split("T")[0],
      tournamentStartedAt: parsed.toISOString(),
    };
  }
  return {
    eventDate: new Date().toISOString().split("T")[0],
  };
}

export function yuniteStartFieldsFromTournament(
  tournament: YuniteTournamentMetadataLike,
): { eventDate: string; tournamentStartedAt?: string } {
  return yuniteStartFieldsFromIso(getYuniteTournamentStartIso(tournament));
}

/**
 * Play time for activity / lastEventDate from a Yunite import.
 * Prefer Yunite leaderboard `tournamentStartedAt` (startDate); fall back to eventDate.
 */
export function yuniteImportPlayTime(importRecord: {
  tournamentStartedAt?: string;
  eventDate?: string;
}): { lastEventDate: string; lastActiveAt: number } | null {
  const started = importRecord.tournamentStartedAt?.trim();
  if (started) {
    const ms = Date.parse(started);
    if (Number.isFinite(ms)) {
      return {
        lastEventDate: new Date(ms).toISOString().split("T")[0]!,
        lastActiveAt: ms,
      };
    }
  }

  const eventDate = importRecord.eventDate?.trim();
  if (eventDate) {
    const ms = Date.parse(eventDate);
    if (Number.isFinite(ms)) {
      return {
        lastEventDate: new Date(ms).toISOString().split("T")[0]!,
        lastActiveAt: ms,
      };
    }
  }

  return null;
}

/** Normalize an arbitrary date string to ISO for storage. */
export function normalizeTournamentStartedAt(
  value: string | undefined,
): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString();
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
    (hasText(tournament.name) || getYuniteTournamentStartIso(tournament) !== undefined)
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
