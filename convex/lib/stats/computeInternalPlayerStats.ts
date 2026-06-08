import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel.d.ts";
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

const MATCH_STATS_PAGE_SIZE = 1000;

/** Internal competitive stats: Yunite imports + match-level performance (excludes external CSV). */
export async function computeInternalPlayerStats(
  ctx: QueryCtx,
  playerId: Id<"players">,
  prefetchedThirdPartyResults?: Doc<"thirdPartyResults">[],
): Promise<InternalPlayerStats> {
  const thirdPartyResults =
    prefetchedThirdPartyResults ??
    (await fetchThirdPartyResultsForPlayer(ctx, playerId));

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

  const eventsPlayed = yuniteImportIds.size;

  let cursor: string | null = null;
  let totalMatches = 0;
  let matchWins = 0;
  let totalEliminations = 0;
  let totalDeaths = 0;
  let totalPlacements = 0;

  while (true) {
    const page = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .paginate({ numItems: MATCH_STATS_PAGE_SIZE, cursor });

    for (const match of page.page) {
      totalMatches += 1;
      if (match.placement === 1) {
        matchWins += 1;
      }
      totalEliminations += match.eliminations;
      totalDeaths += match.deaths;
      totalPlacements += match.placement;
    }

    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }

  if (totalMatches === 0) {
    return {
      ...EMPTY_INTERNAL_PLAYER_STATS,
      eventsPlayed,
      top3Finishes,
    };
  }

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
