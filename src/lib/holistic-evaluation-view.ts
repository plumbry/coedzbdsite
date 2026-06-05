/** Shared helpers for all-time vs last-6-weeks holistic display. */

export const RECENT_WEEKS_CUTOFF = 6;

export type HolisticEvaluationRow = {
  holisticScore: number;
  placementScore: number;
  winRateScore: number;
  killsScore: number;
  deathsScore?: number;
  totalEvents: number;
  avgPlacement: number;
  winRate: number;
  killsPerMatch: number;
  deathsPerMatch?: number;
  holisticVsSameTier?: number;
  promotionDiff?: number;
  demotionDiff?: number;
  recentHolisticScore?: number;
  recentPlacementScore?: number;
  recentWinRateScore?: number;
  recentKillsScore?: number;
  recentDeathsScore?: number;
  recentTotalEvents?: number;
  recentAvgPlacement?: number;
  recentWinRate?: number;
  recentKillsPerMatch?: number;
  recentDeathsPerMatch?: number;
  recentHolisticVsSameTier?: number;
  recentPromotionDiff?: number;
  recentDemotionDiff?: number;
  lastEventDate?: string | null;
};

export function hasRecentHolisticActivity(
  evaluation: Pick<
    HolisticEvaluationRow,
    "lastEventDate" | "recentHolisticScore" | "recentTotalEvents"
  >,
): boolean {
  if (evaluation.recentHolisticScore != null) return true;
  if ((evaluation.recentTotalEvents ?? 0) > 0) return true;
  if (!evaluation.lastEventDate) return false;
  const cutoffMs = Date.now() - RECENT_WEEKS_CUTOFF * 7 * 24 * 60 * 60 * 1000;
  return new Date(evaluation.lastEventDate).getTime() >= cutoffMs;
}

export function mapHolisticEvaluationForView<T extends HolisticEvaluationRow>(
  evaluation: T,
  recentWeeksOnly: boolean,
  multiplier = 1,
): T {
  if (!recentWeeksOnly) {
    if (multiplier === 1) return evaluation;
    return {
      ...evaluation,
      holisticScore: evaluation.holisticScore * multiplier,
      placementScore: evaluation.placementScore * multiplier,
      winRateScore: evaluation.winRateScore * multiplier,
      killsScore: evaluation.killsScore * multiplier,
      deathsScore:
        evaluation.deathsScore !== undefined
          ? evaluation.deathsScore * multiplier
          : evaluation.deathsScore,
    };
  }

  const scale = (value: number | undefined, fallback: number) =>
    (value ?? fallback) * multiplier;

  const holisticScore =
    evaluation.recentHolisticScore != null
      ? evaluation.recentHolisticScore * multiplier
      : 0;

  return {
    ...evaluation,
    holisticScore,
    placementScore: scale(
      evaluation.recentPlacementScore,
      evaluation.placementScore,
    ),
    winRateScore: scale(
      evaluation.recentWinRateScore,
      evaluation.winRateScore,
    ),
    killsScore: scale(evaluation.recentKillsScore, evaluation.killsScore),
    deathsScore:
      evaluation.recentDeathsScore !== undefined ||
      evaluation.deathsScore !== undefined
        ? scale(evaluation.recentDeathsScore, evaluation.deathsScore ?? 0)
        : undefined,
    totalEvents: evaluation.recentTotalEvents ?? evaluation.totalEvents,
    avgPlacement: evaluation.recentAvgPlacement ?? evaluation.avgPlacement,
    winRate: evaluation.recentWinRate ?? evaluation.winRate,
    killsPerMatch: evaluation.recentKillsPerMatch ?? evaluation.killsPerMatch,
    deathsPerMatch:
      evaluation.recentDeathsPerMatch ?? evaluation.deathsPerMatch,
    holisticVsSameTier:
      evaluation.recentHolisticVsSameTier ?? evaluation.holisticVsSameTier,
    promotionDiff: evaluation.recentPromotionDiff ?? evaluation.promotionDiff,
    demotionDiff: evaluation.recentDemotionDiff ?? evaluation.demotionDiff,
  };
}
