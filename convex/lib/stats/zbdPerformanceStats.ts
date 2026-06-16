import type { Doc } from "../../_generated/dataModel.d.ts";
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import {
  computeInternalPlayerStatsByMode,
  type InternalPlayerStatsByMode,
} from "./computeInternalPlayerStats";
import { buildImportGameModeMap } from "./gameMode";
import type { InternalPlayerStats } from "./types";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Profile / admin ZBD tab stats — match metrics from internal rules; tournament points from Yunite rows only. */
export type ZbdPerformanceStats = {
  /** Distinct Yunite imports (canonical events played). */
  totalGames: number;
  eventsPlayed: number;
  totalMatches: number;
  matchWins: number;
  winRate: number;
  /** @deprecated Alias for matchWins */
  winCount: number;
  averagePlacement: number;
  /** Avg kills per match (legacy field name used by UI). */
  averageKD: number;
  killsPerMatch: number;
  deathsPerMatch: number;
  averageKd: number;
  totalEliminations: number;
  top3Finishes: number;
  /** Avg Yunite tournament points per import row. */
  averageScore: number;
  manualEventsCount: number;
  yuniteTournamentRows: number;
};

export type ZbdPerformanceStatsByMode = {
  combined: ZbdPerformanceStats;
  br: ZbdPerformanceStats;
  reload: ZbdPerformanceStats;
};

function buildStatsFromInternal(
  internal: InternalPlayerStats,
  yuniteResults: Doc<"thirdPartyResults">[],
  eventResults: Doc<"eventResults">[],
): ZbdPerformanceStats {
  const totalScore = yuniteResults.reduce((sum, r) => sum + r.points, 0);
  const averageScore =
    yuniteResults.length > 0 ? round1(totalScore / yuniteResults.length) : 0;

  return {
    totalGames: internal.eventsPlayed,
    eventsPlayed: internal.eventsPlayed,
    totalMatches: internal.totalMatches,
    matchWins: internal.matchWins,
    winRate: internal.winRate,
    winCount: internal.matchWins,
    averagePlacement: internal.averagePlacement,
    averageKD: internal.killsPerMatch,
    killsPerMatch: internal.killsPerMatch,
    deathsPerMatch: internal.deathsPerMatch,
    averageKd: internal.averageKd,
    totalEliminations: internal.totalEliminations,
    top3Finishes: internal.top3Finishes,
    averageScore,
    manualEventsCount: eventResults.length,
    yuniteTournamentRows: yuniteResults.length,
  };
}

function buildModeStats(
  internalByMode: InternalPlayerStatsByMode,
  yuniteResults: Doc<"thirdPartyResults">[],
  eventResults: Doc<"eventResults">[],
  brYuniteResults: Doc<"thirdPartyResults">[],
  reloadYuniteResults: Doc<"thirdPartyResults">[],
): ZbdPerformanceStatsByMode {
  return {
    combined: buildStatsFromInternal(
      internalByMode.combined,
      yuniteResults,
      eventResults,
    ),
    br: buildStatsFromInternal(internalByMode.br, brYuniteResults, eventResults),
    reload: buildStatsFromInternal(
      internalByMode.reload,
      reloadYuniteResults,
      eventResults,
    ),
  };
}

export async function buildZbdPerformanceStats(
  ctx: QueryCtx,
  playerId: Id<"players">,
  eventResults: Doc<"eventResults">[],
  yuniteResults: Doc<"thirdPartyResults">[],
): Promise<{
  internal: InternalPlayerStats;
  stats: ZbdPerformanceStats;
  statsByMode: ZbdPerformanceStatsByMode;
}> {
  const internalByMode = await computeInternalPlayerStatsByMode(
    ctx,
    playerId,
    yuniteResults,
  );
  const modeByImport = await buildImportGameModeMap(
    ctx,
    new Set(yuniteResults.map((result) => result.importId)),
  );
  const brYuniteResults = yuniteResults.filter(
    (result) => modeByImport.get(result.importId as string) === "ZB Main Map",
  );
  const reloadYuniteResults = yuniteResults.filter(
    (result) => modeByImport.get(result.importId as string) === "Reload",
  );
  const statsByMode = buildModeStats(
    internalByMode,
    yuniteResults,
    eventResults,
    brYuniteResults,
    reloadYuniteResults,
  );

  return {
    internal: internalByMode.combined,
    stats: statsByMode.combined,
    statsByMode,
  };
}
