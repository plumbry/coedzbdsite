import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import { fetchThirdPartyResultsForPlayer } from "../../helpers/playerResults";
import { isYuniteImport } from "../importSource";
import {
  EMPTY_INTERNAL_PLAYER_STATS,
  type InternalPlayerStats,
} from "./types";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Internal competitive stats: Yunite imports + match-level performance (excludes external CSV). */
export async function computeInternalPlayerStats(
  ctx: QueryCtx,
  playerId: Id<"players">,
): Promise<InternalPlayerStats> {
  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);

  const yuniteImportIds = new Set<string>();
  const bestPlacementByImport = new Map<string, number>();

  for (const result of thirdPartyResults) {
    const importRecord = await ctx.db.get(result.importId);
    if (!importRecord || !isYuniteImport(importRecord)) {
      continue;
    }

    const importKey = result.importId as string;
    yuniteImportIds.add(importKey);

    const prev = bestPlacementByImport.get(importKey);
    if (prev === undefined || result.placement < prev) {
      bestPlacementByImport.set(importKey, result.placement);
    }
  }

  let top3Finishes = 0;
  for (const placement of bestPlacementByImport.values()) {
    if (placement <= 3) {
      top3Finishes += 1;
    }
  }

  const matchStats = await ctx.db
    .query("matchPlayerStats")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();

  const eventsPlayed = yuniteImportIds.size;

  if (matchStats.length === 0) {
    return {
      ...EMPTY_INTERNAL_PLAYER_STATS,
      eventsPlayed,
      top3Finishes,
    };
  }

  const totalMatches = matchStats.length;
  const matchWins = matchStats.filter((m) => m.placement === 1).length;
  const totalEliminations = matchStats.reduce((sum, m) => sum + m.eliminations, 0);
  const totalDeaths = matchStats.reduce((sum, m) => sum + m.deaths, 0);
  const totalPlacements = matchStats.reduce((sum, m) => sum + m.placement, 0);

  const winRate =
    totalMatches > 0 ? round1((matchWins / totalMatches) * 100) : 0;
  const killsPerMatch =
    totalMatches > 0 ? round2(totalEliminations / totalMatches) : 0;
  const deathsPerMatch =
    totalMatches > 0 ? round2(totalDeaths / totalMatches) : 0;
  const averageKd =
    totalDeaths > 0
      ? round2(totalEliminations / totalDeaths)
      : round2(totalEliminations);
  const averagePlacement =
    totalMatches > 0 ? round1(totalPlacements / totalMatches) : 0;

  return {
    eventsPlayed,
    totalMatches,
    matchWins,
    winRate,
    killsPerMatch,
    deathsPerMatch,
    averageKd,
    averagePlacement,
    top3Finishes,
    totalEliminations,
  };
}
