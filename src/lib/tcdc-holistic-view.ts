/** Switch tier-eval cache rows between holistic with vs without TC/DCA multipliers. */

const TIER_ORDER = ["S", "A", "B", "C"] as const;

export type TierEvaluationRow = {
  tier: string;
  totalEvents: number;
  holisticScore: number;
  rawHolisticScore?: number;
  recentHolisticScore?: number;
  recentRawHolisticScore?: number;
  holisticVsSameTier?: number;
  promotionDiff?: number;
  demotionDiff?: number;
  recentHolisticVsSameTier?: number;
  recentPromotionDiff?: number;
  recentDemotionDiff?: number;
  sameTierHolistic?: number;
  tierAboveHolistic?: number;
  tierBelowHolistic?: number;
  evaluationStatus: string;
};

export type TierEvaluationCacheView = {
  evaluations: TierEvaluationRow[];
  tierHolisticMedians?: Record<string, number>;
  recentTierHolisticMedians?: Record<string, number>;
};

function calcMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function pickHolisticScore(
  evaluation: Pick<
    TierEvaluationRow,
    | "holisticScore"
    | "rawHolisticScore"
    | "recentHolisticScore"
    | "recentRawHolisticScore"
  >,
  applyTcdc: boolean,
  recent: boolean,
): number {
  if (recent) {
    if (applyTcdc) {
      return evaluation.recentHolisticScore ?? 0;
    }
    return (
      evaluation.recentRawHolisticScore ??
      evaluation.recentHolisticScore ??
      evaluation.rawHolisticScore ??
      evaluation.holisticScore
    );
  }

  if (applyTcdc) {
    return evaluation.holisticScore;
  }
  return evaluation.rawHolisticScore ?? evaluation.holisticScore;
}

function deriveEvaluationStatus(
  totalEvents: number,
  promotionDiff: number | undefined,
  demotionDiff: number | undefined,
  fallback: string,
): string {
  if (totalEvents < 8) return "Insufficient Data";
  if (promotionDiff != null && promotionDiff > 5) return "Strong Promotion Outlier";
  if (promotionDiff != null && promotionDiff > 0) return "Eligible for Promotion Evaluation";
  if (demotionDiff != null && demotionDiff < -5) return "Strong Demotion Outlier";
  if (demotionDiff != null && demotionDiff < 0) return "Eligible for Demotion Evaluation";
  if (promotionDiff != null || demotionDiff != null) return "Stable";
  return fallback;
}

function buildTierMedians(
  evaluations: TierEvaluationRow[],
  applyTcdc: boolean,
  recent: boolean,
): Record<string, number> {
  const tierScores: Record<string, number[]> = { S: [], A: [], B: [], C: [] };

  for (const evaluation of evaluations) {
    if (!TIER_ORDER.includes(evaluation.tier as (typeof TIER_ORDER)[number])) {
      continue;
    }
    if (recent) {
      if (
        evaluation.recentHolisticScore == null &&
        evaluation.recentRawHolisticScore == null
      ) {
        continue;
      }
      tierScores[evaluation.tier].push(
        pickHolisticScore(evaluation, applyTcdc, true),
      );
      continue;
    }
    if ((evaluation.totalEvents ?? 0) >= 5) {
      tierScores[evaluation.tier].push(
        pickHolisticScore(evaluation, applyTcdc, false),
      );
    }
  }

  const medians: Record<string, number> = {};
  for (const tier of TIER_ORDER) {
    if (tierScores[tier].length > 0) {
      medians[tier] = calcMedian(tierScores[tier]);
    }
  }
  return medians;
}

function deriveDiffs(
  displayHolistic: number,
  tier: string,
  medians: Record<string, number>,
) {
  const tierIndex = TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]);
  const tierAbove = tierIndex > 0 ? TIER_ORDER[tierIndex - 1] : undefined;
  const tierBelow =
    tierIndex < TIER_ORDER.length - 1
      ? TIER_ORDER[tierIndex + 1]
      : undefined;

  const sameTierMed = medians[tier];
  const aboveMed = tierAbove ? medians[tierAbove] : undefined;
  const belowMed = tierBelow ? medians[tierBelow] : undefined;

  return {
    holisticVsSameTier:
      sameTierMed != null ? displayHolistic - sameTierMed : undefined,
    promotionDiff: aboveMed != null ? displayHolistic - aboveMed : undefined,
    demotionDiff: belowMed != null ? displayHolistic - belowMed : undefined,
    sameTierHolistic: sameTierMed,
    tierAboveHolistic: aboveMed,
    tierBelowHolistic: belowMed,
  };
}

export function remapTierEvaluationForTcdcView<T extends TierEvaluationCacheView>(
  cachedData: T | null | undefined,
  applyTcdc: boolean,
): T | null | undefined {
  if (!cachedData?.evaluations) return cachedData;

  const tierHolisticMedians = buildTierMedians(
    cachedData.evaluations,
    applyTcdc,
    false,
  );
  const recentTierHolisticMedians = buildTierMedians(
    cachedData.evaluations,
    applyTcdc,
    true,
  );

  const evaluations = cachedData.evaluations.map((evaluation) => {
    const allTimeHolistic = pickHolisticScore(evaluation, applyTcdc, false);
    const recentHolistic = pickHolisticScore(evaluation, applyTcdc, true);

    const allTimeDiffs = deriveDiffs(
      allTimeHolistic,
      evaluation.tier,
      tierHolisticMedians,
    );
    const recentDiffs = deriveDiffs(
      recentHolistic,
      evaluation.tier,
      recentTierHolisticMedians,
    );

    const evaluationStatus = deriveEvaluationStatus(
      evaluation.totalEvents ?? 0,
      allTimeDiffs.promotionDiff,
      allTimeDiffs.demotionDiff,
      evaluation.evaluationStatus,
    );

    return {
      ...evaluation,
      holisticScore: allTimeHolistic,
      recentHolisticScore:
        evaluation.recentHolisticScore != null ||
        evaluation.recentRawHolisticScore != null
          ? recentHolistic
          : evaluation.recentHolisticScore,
      holisticVsSameTier: allTimeDiffs.holisticVsSameTier,
      promotionDiff: allTimeDiffs.promotionDiff,
      demotionDiff: allTimeDiffs.demotionDiff,
      sameTierHolistic: allTimeDiffs.sameTierHolistic,
      tierAboveHolistic: allTimeDiffs.tierAboveHolistic,
      tierBelowHolistic: allTimeDiffs.tierBelowHolistic,
      recentHolisticVsSameTier: recentDiffs.holisticVsSameTier,
      recentPromotionDiff: recentDiffs.promotionDiff,
      recentDemotionDiff: recentDiffs.demotionDiff,
      evaluationStatus,
    };
  });

  return {
    ...cachedData,
    evaluations,
    tierHolisticMedians,
    recentTierHolisticMedians,
  };
}
