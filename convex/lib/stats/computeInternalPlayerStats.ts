import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import { fetchThirdPartyResultsForPlayer } from "../../helpers/playerResults";
import { isYuniteImport } from "../importSource";
import {
  buildImportGameModeMap,
  importMatchesMode,
  type GameMode,
} from "./gameMode";
import { getCachedImportRecord, type ImportRecordCache } from "./importRecordCache";
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

type MatchAccumulator = {
  totalMatches: number;
  matchWins: number;
  totalEliminations: number;
  totalDeaths: number;
  totalPlacements: number;
};

function emptyAccumulator(): MatchAccumulator {
  return {
    totalMatches: 0,
    matchWins: 0,
    totalEliminations: 0,
    totalDeaths: 0,
    totalPlacements: 0,
  };
}

function finalizeInternalStats(
  eventsPlayed: number,
  top3Finishes: number,
  acc: MatchAccumulator,
): InternalPlayerStats {
  const { totalMatches, matchWins, totalEliminations, totalDeaths, totalPlacements } =
    acc;

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

function accumulateMatch(acc: MatchAccumulator, match: Doc<"matchPlayerStats">) {
  acc.totalMatches += 1;
  if (match.placement === 1) {
    acc.matchWins += 1;
  }
  acc.totalEliminations += match.eliminations;
  acc.totalDeaths += match.deaths;
  acc.totalPlacements += match.placement;
}

/** Internal competitive stats: Yunite imports + match-level performance (excludes external CSV). */
export async function computeInternalPlayerStats(
  ctx: QueryCtx,
  playerId: Id<"players">,
  prefetchedThirdPartyResults?: Doc<"thirdPartyResults">[],
  mode?: GameMode,
): Promise<InternalPlayerStats> {
  const byMode = await computeInternalPlayerStatsByMode(
    ctx,
    playerId,
    prefetchedThirdPartyResults,
  );

  if (mode === "ZB Main Map") {
    return byMode.br;
  }
  if (mode === "Reload") {
    return byMode.reload;
  }

  return byMode.combined;
}

export type InternalPlayerStatsByMode = {
  combined: InternalPlayerStats;
  br: InternalPlayerStats;
  reload: InternalPlayerStats;
};

export async function computeInternalPlayerStatsByMode(
  ctx: QueryCtx,
  playerId: Id<"players">,
  prefetchedThirdPartyResults?: Doc<"thirdPartyResults">[],
): Promise<InternalPlayerStatsByMode> {
  const thirdPartyResults =
    prefetchedThirdPartyResults ??
    (await fetchThirdPartyResultsForPlayer(ctx, playerId));

  const importCache: ImportRecordCache = new Map();
  const yuniteImportIds = new Set<string>();
  const brImportIds = new Set<string>();
  const reloadImportIds = new Set<string>();
  const bestPlacementByImport = new Map<string, number>();
  const brBestPlacementByImport = new Map<string, number>();
  const reloadBestPlacementByImport = new Map<string, number>();

  const importIdsForMode = new Set<Id<"thirdPartyImports">>();
  for (const result of thirdPartyResults) {
    importIdsForMode.add(result.importId);
  }

  const modeByImport = await buildImportGameModeMap(ctx, importIdsForMode);

  for (const result of thirdPartyResults) {
    const importRecord = await getCachedImportRecord(ctx, importCache, result.importId);
    if (!importRecord || !isYuniteImport(importRecord)) {
      continue;
    }

    const importKey = result.importId as string;
    yuniteImportIds.add(importKey);

    const prev = bestPlacementByImport.get(importKey);
    if (prev === undefined || result.placement < prev) {
      bestPlacementByImport.set(importKey, result.placement);
    }

    const gameMode = modeByImport.get(importKey) ?? null;
    if (gameMode === "ZB Main Map") {
      brImportIds.add(importKey);
      const brPrev = brBestPlacementByImport.get(importKey);
      if (brPrev === undefined || result.placement < brPrev) {
        brBestPlacementByImport.set(importKey, result.placement);
      }
    } else if (gameMode === "Reload") {
      reloadImportIds.add(importKey);
      const reloadPrev = reloadBestPlacementByImport.get(importKey);
      if (reloadPrev === undefined || result.placement < reloadPrev) {
        reloadBestPlacementByImport.set(importKey, result.placement);
      }
    }
  }

  const countTop3 = (placements: Map<string, number>) => {
    let count = 0;
    for (const placement of placements.values()) {
      if (placement <= 3) {
        count += 1;
      }
    }
    return count;
  };

  const combinedAcc = emptyAccumulator();
  const brAcc = emptyAccumulator();
  const reloadAcc = emptyAccumulator();

  let cursor: string | null = null;
  while (true) {
    const page = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .paginate({ numItems: MATCH_STATS_PAGE_SIZE, cursor });

    for (const match of page.page) {
      accumulateMatch(combinedAcc, match);

      if (importMatchesMode(modeByImport, match.importId, "ZB Main Map")) {
        accumulateMatch(brAcc, match);
      } else if (importMatchesMode(modeByImport, match.importId, "Reload")) {
        accumulateMatch(reloadAcc, match);
      }
    }

    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }

  return {
    combined: finalizeInternalStats(
      yuniteImportIds.size,
      countTop3(bestPlacementByImport),
      combinedAcc,
    ),
    br: finalizeInternalStats(
      brImportIds.size,
      countTop3(brBestPlacementByImport),
      brAcc,
    ),
    reload: finalizeInternalStats(
      reloadImportIds.size,
      countTop3(reloadBestPlacementByImport),
      reloadAcc,
    ),
  };
}
