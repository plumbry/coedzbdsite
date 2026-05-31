"use node";

/**
 * Osirion Fortnite Public API client.
 * OpenAPI spec: docs/osirion-fortnite-api.openapi.json
 * Base URL: https://fnapi.osirion.gg
 */

export const OSIRION_BASE_URL = "https://fnapi.osirion.gg";

export interface CompactPayout {
  rank: number;
  usd: number;
}

export interface TournamentLeaderboardDescriptor {
  leaderboardEventId: string;
  leaderboardEventWindowId: string;
  tournamentName: string;
  eventDate: string;
  maxPages: number;
  payouts: CompactPayout[];
}

export interface TournamentEarning {
  name: string;
  placement: number;
  earnings: number;
  date: string;
}

interface OsirionPayout {
  rewardType: string;
  value: string;
  quantity: number;
}

interface OsirionPayoutRank {
  threshold: number;
  payouts: OsirionPayout[];
}

interface OsirionPayoutTable {
  ranks: OsirionPayoutRank[];
}

interface OsirionScoreLocation {
  leaderboardEventId: string;
  leaderboardEventWindowId: string;
  isMain?: boolean;
  payoutTables?: OsirionPayoutTable[];
}

interface OsirionEventWindow {
  eventWindowId: string;
  endTime: string;
  scoreLocations?: OsirionScoreLocation[];
}

interface OsirionTournament {
  eventId: string;
  displayData?: {
    titleLine1?: string;
    titleLine2?: string;
    longFormatTitle?: string;
  } | null;
  eventWindows?: OsirionEventWindow[];
}

interface OsirionLeaderboardEntry {
  players?: Array<{ accountId: string }>;
  rank: number;
}

interface OsirionLeaderboardResponse {
  success: boolean;
  leaderboard?: {
    entries: OsirionLeaderboardEntry[];
    totalPages: number;
  };
}

interface OsirionAccountLookupResponse {
  success: boolean;
  accounts?: Array<{ accountId: string }>;
  accountId?: string;
}

interface OsirionTournamentsResponse {
  success: boolean;
  tournaments?: OsirionTournament[];
}

function getTournamentName(tournament: OsirionTournament): string {
  const display = tournament.displayData;
  const parts = [display?.titleLine1, display?.titleLine2].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  if (display?.longFormatTitle) return display.longFormatTitle;
  return tournament.eventId;
}

function extractUsdPayouts(payoutTables: OsirionPayoutTable[]): CompactPayout[] {
  const payouts: CompactPayout[] = [];
  for (const table of payoutTables) {
    for (const rankEntry of table.ranks ?? []) {
      const usdTotal = (rankEntry.payouts ?? [])
        .filter((p) => p.value === "USD" && p.rewardType === "ecomm")
        .reduce((sum, p) => sum + p.quantity, 0);
      if (usdTotal > 0) {
        payouts.push({ rank: rankEntry.threshold, usd: usdTotal });
      }
    }
  }
  return payouts;
}

function hasUsdPayouts(payoutTables: OsirionPayoutTable[] | undefined): boolean {
  return (payoutTables ?? []).some((table) =>
    (table.ranks ?? []).some((rank) =>
      (rank.payouts ?? []).some((p) => p.value === "USD" && p.rewardType === "ecomm")
    )
  );
}

export function buildLeaderboardDescriptors(tournaments: OsirionTournament[]): TournamentLeaderboardDescriptor[] {
  const descriptors: TournamentLeaderboardDescriptor[] = [];

  for (const tournament of tournaments) {
    const tournamentName = getTournamentName(tournament);
    for (const eventWindow of tournament.eventWindows ?? []) {
      for (const scoreLocation of eventWindow.scoreLocations ?? []) {
        if (!hasUsdPayouts(scoreLocation.payoutTables)) continue;

        const payouts = extractUsdPayouts(scoreLocation.payoutTables ?? []);
        if (payouts.length === 0) continue;

        const maxPaidRank = Math.max(...payouts.map((p) => p.rank));
        descriptors.push({
          leaderboardEventId: scoreLocation.leaderboardEventId,
          leaderboardEventWindowId: scoreLocation.leaderboardEventWindowId,
          tournamentName,
          eventDate: eventWindow.endTime,
          maxPages: Math.min(Math.ceil(maxPaidRank / 20), 100),
          payouts,
        });
      }
    }
  }

  return descriptors;
}

export function calculateUsdEarnings(rank: number, payouts: CompactPayout[]): number {
  const match = payouts.find((p) => p.rank === rank);
  return match?.usd ?? 0;
}

async function osirionFetch<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const response = await fetch(`${OSIRION_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Osirion API ${response.status} ${path}:`, errorText);
    return { ok: false, status: response.status, error: errorText };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

export async function lookupAccountId(displayName: string): Promise<{ accountId: string } | { error: string }> {
  const encoded = encodeURIComponent(displayName);
  const result = await osirionFetch<OsirionAccountLookupResponse>(
    `/v1/accounts/lookup-by-display-name?displayName=${encoded}`
  );

  if (!result.ok) {
    if (result.status === 404) {
      return { error: "Player not found on Osirion API" };
    }
    if (result.status === 429) {
      return { error: "Rate limit reached. Try again later." };
    }
    return { error: `Osirion API error (${result.status})` };
  }

  const accountId = result.data.accounts?.[0]?.accountId ?? result.data.accountId;
  if (!accountId) {
    return { error: "Could not resolve Epic account ID for this player." };
  }

  return { accountId };
}

export async function fetchTournamentLeaderboardDescriptors(): Promise<TournamentLeaderboardDescriptor[]> {
  const result = await osirionFetch<OsirionTournamentsResponse>(
    "/v1/tournaments?includeHistoricData=true"
  );

  if (!result.ok) {
    throw new Error(`Failed to fetch tournaments (${result.status})`);
  }

  return buildLeaderboardDescriptors(result.data.tournaments ?? []);
}

export async function scanLeaderboardsForPlayer(
  accountId: string,
  descriptors: TournamentLeaderboardDescriptor[],
  startIndex: number,
  count: number
): Promise<{ tournaments: TournamentEarning[]; nextIndex: number; apiCalls: number }> {
  const tournaments: TournamentEarning[] = [];
  let apiCalls = 0;
  const endIndex = Math.min(startIndex + count, descriptors.length);

  for (let i = startIndex; i < endIndex; i++) {
    const descriptor = descriptors[i];
    let found = false;

    for (let page = 0; page < descriptor.maxPages; page++) {
      apiCalls++;
      const params = new URLSearchParams({
        leaderboardEventId: descriptor.leaderboardEventId,
        leaderboardEventWindowId: descriptor.leaderboardEventWindowId,
        page: String(page),
      });

      const result = await osirionFetch<OsirionLeaderboardResponse>(
        `/v1/tournaments/leaderboard?${params.toString()}`
      );

      if (!result.ok) {
        if (result.status === 429) {
          throw new Error("Rate limit reached. Try again later.");
        }
        break;
      }

      const leaderboard = result.data.leaderboard;
      if (!leaderboard) break;

      const match = leaderboard.entries.find((entry) =>
        entry.players?.some((player) => player.accountId === accountId)
      );

      if (match) {
        const earnings = calculateUsdEarnings(match.rank, descriptor.payouts);
        if (earnings > 0) {
          tournaments.push({
            name: descriptor.tournamentName,
            placement: match.rank,
            earnings,
            date: descriptor.eventDate,
          });
        }
        found = true;
        break;
      }

      if (page + 1 >= leaderboard.totalPages) break;
    }

    if (!found) {
      // Player not on this leaderboard — no earnings for this event.
    }
  }

  return { tournaments, nextIndex: endIndex, apiCalls };
}
