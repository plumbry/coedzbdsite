import type { Doc } from "../../_generated/dataModel.d.ts";
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import { computeInternalPlayerStats } from "./computeInternalPlayerStats";
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

export async function buildZbdPerformanceStats(
  ctx: QueryCtx,
  playerId: Id<"players">,
  eventResults: Doc<"eventResults">[],
  yuniteResults: Doc<"thirdPartyResults">[],
): Promise<{ internal: InternalPlayerStats; stats: ZbdPerformanceStats }> {
  const internal = await computeInternalPlayerStats(ctx, playerId);

  const totalScore = yuniteResults.reduce((sum, r) => sum + r.points, 0);
  const averageScore =
    yuniteResults.length > 0 ? round1(totalScore / yuniteResults.length) : 0;

  const stats: ZbdPerformanceStats = {
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

  return { internal, stats };
}
