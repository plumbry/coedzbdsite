import type { Doc, Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "../_generated/server.d.ts";
import { isYuniteImport } from "./importSource";
import {
  collectEventLeaderboardUrls,
  extractTournamentIdFromLeaderboardId,
  extractTournamentIdFromUrl,
} from "./yunite";

/** Yunite tournament IDs listed on Event Manager scrim events. */
export async function buildScrimYuniteTournamentIdSet(
  ctx: MutationCtx | QueryCtx,
): Promise<Set<string>> {
  const scrimEvents = await ctx.db
    .query("events")
    .withIndex("by_type", (q) => q.eq("type", "scrim"))
    .collect();

  const tournamentIds = new Set<string>();
  for (const event of scrimEvents) {
    for (const url of collectEventLeaderboardUrls(event, {
      includeStandardLobby2: true,
    })) {
      const tournamentId = extractTournamentIdFromUrl(url);
      if (tournamentId) {
        tournamentIds.add(tournamentId);
      }
    }
  }
  return tournamentIds;
}

export function yuniteTournamentIdForImport(
  importData: Pick<Doc<"thirdPartyImports">, "leaderboardUrl" | "leaderboardId">,
): string | null {
  return (
    extractTournamentIdFromUrl(importData.leaderboardUrl) ||
    extractTournamentIdFromLeaderboardId(importData.leaderboardId)
  );
}

/** True when this import is a Yunite leaderboard for a scrim (not minicup, season, etc.). */
export async function isScrimYuniteLeaderboard(
  ctx: MutationCtx | QueryCtx,
  importData: Doc<"thirdPartyImports">,
  scrimTournamentIds: Set<string>,
  linkedEventCache: Map<Id<"events">, Doc<"events"> | null>,
): Promise<boolean> {
  if (!isYuniteImport(importData)) {
    return false;
  }

  if (importData.eventId) {
    let linkedEvent = linkedEventCache.get(importData.eventId);
    if (linkedEvent === undefined) {
      linkedEvent = await ctx.db.get(importData.eventId);
      linkedEventCache.set(importData.eventId, linkedEvent);
    }
    return linkedEvent?.type === "scrim";
  }

  const tournamentId = yuniteTournamentIdForImport(importData);
  return tournamentId !== null && scrimTournamentIds.has(tournamentId);
}
