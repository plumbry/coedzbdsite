import { query } from "./_generated/server";
import { requireModeratorOrAdmin } from "./auth_helpers";
import {
  actionSortRank,
  buildTierCenters,
  classifyScoreAgainstCenters,
  computeHolisticConfidence,
  computeTierRecommendation,
  confidenceSortRank,
  isReviewTier,
  median,
  overallFitLabel,
  primaryAbilityTier,
  type ActionKind,
  type ConfidenceLevel,
  type ReviewTier,
} from "./lib/stats/tierReviewConfidence";
import {
  adjustHolisticForTeammateComposition,
  blendExpectedTeammateStrength,
  estimateHolisticPointsPerTeammateStrength,
  restrictionPriorTeammateStrength,
  type RestrictionTier,
} from "./lib/stats/tierRestrictions";
import {
  buildStrengthExpectations,
  computePerformanceVsExpected,
  type PerformanceVsExpectedLevel,
  type TeamPerfSample,
} from "./lib/stats/teamAdjustedPerformance";
import {
  computePerformanceTrend,
  toTrendSamples,
  type PerformanceTrendLevel,
} from "./lib/stats/performanceTrend";

type PlayerReviewRow = {
  playerId: string;
  discordUsername: string;
  epicUsername: string;
  nickname?: string;
  currentTier: ReviewTier;
  evaluationScore: number;
  evaluationFitLabel: string;
  holisticScore: number;
  /** Restriction-adjusted holistic used for best-fit / recommendations. */
  adjustedHolisticScore: number;
  holisticAdjustmentDelta: number;
  rawHolisticFitLabel: string;
  holisticFitLabel: string;
  holisticConfidence: ConfidenceLevel;
  holisticConfidenceLabel: string;
  holisticConfidenceStars: number;
  holisticConfidenceSummary: string;
  holisticConfidenceReasons: string[];
  actualTeammateStrength?: number;
  expectedTeammateStrength?: number;
  compositionResidual?: number;
  compositionBiasLabel?: string;
  duoShare?: number;
  /** Performance vs Expected — teams vs similar-strength historical peers. */
  performanceVsExpected?: PerformanceVsExpectedLevel;
  performanceVsExpectedLabel?: string;
  performanceVsExpectedSummary?: string;
  expectedAvgPlacement?: number;
  actualAvgPlacement?: number;
  expectedAvgTeamKills?: number;
  actualAvgTeamKills?: number;
  performanceVsExpectedEvents?: number;
  /** Recent form vs the player's own historical baseline. */
  performanceTrend?: PerformanceTrendLevel;
  performanceTrendLabel?: string;
  performanceTrendDisplayLabel?: string;
  performanceTrendSummary?: string;
  performanceTrendReasons?: string[];
  performanceTrendRecentEvents?: number;
  performanceTrendBaselineEvents?: number;
  totalEvents: number;
  overallFitLabel: string;
  recommendationConfidence: ConfidenceLevel;
  recommendationConfidenceLabel: string;
  stars: number;
  action: ActionKind;
  actionLabel: string;
  reason: string;
  suggestedTier?: ReviewTier;
};

/**
 * Tier recommendation — best-fit from evaluation + restriction-adjusted
 * holistic. Raw holistic is preserved for display; adjusted score drives fits.
 */
export const getTierReviewConfidence = query({
  args: {},
  handler: async (ctx) => {
    await requireModeratorOrAdmin(ctx);

    const [activePlayers, cacheRows] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
      ctx.db.query("tierReEvaluationCache").collect(),
    ]);

    const playersById = new Map(activePlayers.map((p) => [p._id, p] as const));

    const missingIds = cacheRows
      .map((row) => row.playerId)
      .filter((id) => !playersById.has(id));
    if (missingIds.length > 0) {
      const extras = await Promise.all(missingIds.map((id) => ctx.db.get(id)));
      for (const player of extras) {
        if (player) playersById.set(player._id, player);
      }
    }

    const evaluationScoresByTier: Record<ReviewTier, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };
    const holisticScoresByTier: Record<ReviewTier, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };

    for (const player of activePlayers) {
      if (
        player.isAlt ||
        !isReviewTier(player.tier) ||
        typeof player.totalScore !== "number"
      ) {
        continue;
      }
      evaluationScoresByTier[player.tier].push(player.totalScore);
    }

    type CacheCandidate = {
      cache: (typeof cacheRows)[number];
      currentTier: ReviewTier;
      evaluationScore: number;
      discordUsername: string;
      epicUsername: string;
      nickname?: string;
      matchesAnalyzed?: number;
      withoutDuoCount?: number;
      hasConsistentDuo: boolean;
      hasMutualDependency: boolean;
    };

    const candidates: CacheCandidate[] = [];
    let insufficientEvaluation = 0;
    let skippedInvalidTier = 0;

    for (const cache of cacheRows) {
      if (typeof cache.holisticScore !== "number") continue;

      const player = playersById.get(cache.playerId);
      const currentTier: ReviewTier | null =
        (player && isReviewTier(player.tier) && player.tier) ||
        (isReviewTier(cache.tier) ? cache.tier : null);

      if (!currentTier) {
        skippedInvalidTier += 1;
        continue;
      }

      holisticScoresByTier[currentTier].push(cache.holisticScore);

      const evaluationScore =
        typeof player?.totalScore === "number" ? player.totalScore : null;
      if (evaluationScore === null) {
        insufficientEvaluation += 1;
        continue;
      }

      candidates.push({
        cache,
        currentTier,
        evaluationScore,
        discordUsername: player?.discordUsername ?? cache.discordUsername,
        epicUsername: player?.epicUsername ?? "",
        nickname: player?.nickname,
        matchesAnalyzed: player?.contributionScore?.matchesAnalyzed,
        withoutDuoCount: player?.dcaCache?.withoutDuoCount,
        hasConsistentDuo: !!player?.dcaCache?.consistentDuoEpic,
        hasMutualDependency: !!player?.dcaCache?.hasMutualDependency,
      });
    }

    const evaluationCenters = buildTierCenters(evaluationScoresByTier);
    const rawHolisticCenters = buildTierCenters(holisticScoresByTier);
    const pointsPerStrengthUnit =
      estimateHolisticPointsPerTeammateStrength(rawHolisticCenters);

    // Empirical teammate-strength distributions by *evaluation ability* band
    // (not assigned tier) — used to adapt expectation as the player base shifts.
    const actualByAbility: Record<ReviewTier, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };

    const provisionalFits = candidates.map((candidate) => {
      const evaluationFit = classifyScoreAgainstCenters(
        candidate.evaluationScore,
        evaluationCenters,
      );
      const ability = primaryAbilityTier(evaluationFit);
      if (typeof candidate.cache.avgTeammateTier === "number") {
        actualByAbility[ability].push(candidate.cache.avgTeammateTier);
      }
      return { candidate, evaluationFit, ability };
    });

    const expectedByAbility: Record<ReviewTier, number> = {
      S: 0,
      A: 0,
      B: 0,
      C: 0,
    };
    for (const tier of ["S", "A", "B", "C"] as ReviewTier[]) {
      expectedByAbility[tier] = blendExpectedTeammateStrength({
        empiricalMedian: median(actualByAbility[tier]),
        empiricalCount: actualByAbility[tier].length,
        restrictionPrior: restrictionPriorTeammateStrength(
          tier as RestrictionTier,
        ),
      });
    }

    // Build restriction-adjusted holistic scores, then centers from those.
    const adjustedHolisticByTier: Record<ReviewTier, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };

    const withAdjusted = provisionalFits.map((row) => {
      const actualTeammateStrength = row.candidate.cache.avgTeammateTier;
      const expectedTeammateStrength = expectedByAbility[row.ability];
      const residual =
        actualTeammateStrength !== undefined
          ? actualTeammateStrength - expectedTeammateStrength
          : undefined;

      const { adjustedHolistic, adjustmentDelta } =
        adjustHolisticForTeammateComposition({
          rawHolistic: row.candidate.cache.holisticScore,
          residual,
          pointsPerStrengthUnit,
        });

      adjustedHolisticByTier[row.candidate.currentTier].push(adjustedHolistic);

      return {
        ...row,
        actualTeammateStrength,
        expectedTeammateStrength,
        residual,
        adjustedHolistic,
        adjustmentDelta,
      };
    });

    const adjustedHolisticCenters = buildTierCenters(adjustedHolisticByTier);

    // Learn expected team outcomes by strength from historical samples.
    const globalTeamSamples: TeamPerfSample[] = [];
    for (const cache of cacheRows) {
      const samples = cache.teamPerfSamples;
      if (!samples) continue;
      for (const sample of samples) {
        globalTeamSamples.push({
          strength: sample.strength,
          placement: sample.placement,
          teamKills: sample.teamKills,
          playerKills: sample.playerKills,
          asOfMs: sample.asOfMs,
        });
      }
    }
    const strengthExpectations = buildStrengthExpectations(globalTeamSamples);

    const reviews: PlayerReviewRow[] = [];

    for (const row of withAdjusted) {
      const { candidate, evaluationFit, adjustedHolistic, adjustmentDelta } =
        row;
      const { cache, currentTier, evaluationScore } = candidate;

      const rawHolisticFit = classifyScoreAgainstCenters(
        cache.holisticScore,
        rawHolisticCenters,
      );
      const holisticFit = classifyScoreAgainstCenters(
        adjustedHolistic,
        adjustedHolisticCenters,
      );

      const holisticConfidence = computeHolisticConfidence({
        totalEvents: cache.totalEvents,
        actualTeammateStrength: row.actualTeammateStrength,
        expectedTeammateStrength: row.expectedTeammateStrength,
        matchesAnalyzed: candidate.matchesAnalyzed,
        withoutDuoCount: candidate.withoutDuoCount,
        hasConsistentDuo: candidate.hasConsistentDuo,
        hasMutualDependency: candidate.hasMutualDependency,
      });

      const playerSamples: TeamPerfSample[] = (cache.teamPerfSamples ?? []).map(
        (s) => ({
          strength: s.strength,
          placement: s.placement,
          teamKills: s.teamKills,
          playerKills: s.playerKills,
          asOfMs: s.asOfMs,
        }),
      );
      const performanceVsExpected = computePerformanceVsExpected(
        playerSamples,
        strengthExpectations,
      );

      const trendSamples = toTrendSamples(playerSamples);
      const performanceTrend = computePerformanceTrend(
        trendSamples,
        strengthExpectations,
      );

      const result = computeTierRecommendation(
        evaluationFit,
        holisticFit,
        currentTier,
        holisticConfidence,
        performanceVsExpected,
        performanceTrend,
      );

      reviews.push({
        playerId: cache.playerId,
        discordUsername: candidate.discordUsername,
        epicUsername: candidate.epicUsername,
        nickname: candidate.nickname,
        currentTier,
        evaluationScore,
        evaluationFitLabel: evaluationFit.label,
        holisticScore: cache.holisticScore,
        adjustedHolisticScore: adjustedHolistic,
        holisticAdjustmentDelta: adjustmentDelta,
        rawHolisticFitLabel: rawHolisticFit.label,
        holisticFitLabel: holisticFit.label,
        holisticConfidence: holisticConfidence.level,
        holisticConfidenceLabel: holisticConfidence.label,
        holisticConfidenceStars: holisticConfidence.stars,
        holisticConfidenceSummary: holisticConfidence.summary,
        holisticConfidenceReasons: holisticConfidence.reasons,
        actualTeammateStrength: row.actualTeammateStrength,
        expectedTeammateStrength: row.expectedTeammateStrength,
        compositionResidual: holisticConfidence.compositionResidual,
        compositionBiasLabel: holisticConfidence.compositionBiasLabel,
        duoShare: holisticConfidence.duoShare,
        performanceVsExpected: performanceVsExpected?.level,
        performanceVsExpectedLabel: performanceVsExpected?.label,
        performanceVsExpectedSummary: performanceVsExpected?.summary,
        expectedAvgPlacement: performanceVsExpected?.expectedAvgPlacement,
        actualAvgPlacement: performanceVsExpected?.actualAvgPlacement,
        expectedAvgTeamKills: performanceVsExpected?.expectedAvgTeamKills,
        actualAvgTeamKills: performanceVsExpected?.actualAvgTeamKills,
        performanceVsExpectedEvents: performanceVsExpected?.eventCount,
        performanceTrend: performanceTrend?.level,
        performanceTrendLabel: performanceTrend?.label,
        performanceTrendDisplayLabel: performanceTrend?.displayLabel,
        performanceTrendSummary: performanceTrend?.summary,
        performanceTrendReasons: performanceTrend?.reasons,
        performanceTrendRecentEvents: performanceTrend?.recentEventCount,
        performanceTrendBaselineEvents: performanceTrend?.baselineEventCount,
        totalEvents: cache.totalEvents,
        overallFitLabel: overallFitLabel(result.overallFit),
        recommendationConfidence: result.recommendationConfidence,
        recommendationConfidenceLabel: result.recommendationConfidenceLabel,
        stars: result.stars,
        action: result.action,
        actionLabel: result.actionLabel,
        reason: result.reason,
        suggestedTier: result.suggestedTier,
      });
    }

    reviews.sort((a, b) => {
      const byAction = actionSortRank(a.action) - actionSortRank(b.action);
      if (byAction !== 0) return byAction;
      const byConfidence =
        confidenceSortRank(a.recommendationConfidence) -
        confidenceSortRank(b.recommendationConfidence);
      if (byConfidence !== 0) return byConfidence;
      const byHolistic =
        confidenceSortRank(a.holisticConfidence) -
        confidenceSortRank(b.holisticConfidence);
      if (byHolistic !== 0) return byHolistic;
      return a.discordUsername.localeCompare(b.discordUsername);
    });

    const summary = {
      totalCompared: reviews.length,
      insufficientEvaluation,
      skippedInvalidTier,
      byRecommendationConfidence: {
        high: reviews.filter((r) => r.recommendationConfidence === "high")
          .length,
        medium: reviews.filter((r) => r.recommendationConfidence === "medium")
          .length,
        low: reviews.filter((r) => r.recommendationConfidence === "low").length,
      },
      byHolisticConfidence: {
        high: reviews.filter((r) => r.holisticConfidence === "high").length,
        medium: reviews.filter((r) => r.holisticConfidence === "medium").length,
        low: reviews.filter((r) => r.holisticConfidence === "low").length,
      },
      byPerformanceVsExpected: {
        above: reviews.filter((r) => r.performanceVsExpected === "above")
          .length,
        around: reviews.filter((r) => r.performanceVsExpected === "around")
          .length,
        below: reviews.filter((r) => r.performanceVsExpected === "below")
          .length,
        insufficient: reviews.filter((r) => !r.performanceVsExpected).length,
      },
      byPerformanceTrend: {
        improving: reviews.filter((r) => r.performanceTrend === "improving")
          .length,
        stable: reviews.filter((r) => r.performanceTrend === "stable").length,
        declining: reviews.filter((r) => r.performanceTrend === "declining")
          .length,
        insufficient: reviews.filter((r) => !r.performanceTrend).length,
      },
      byAction: {
        review_required: reviews.filter((r) => r.action === "review_required")
          .length,
        review_move: reviews.filter((r) => r.action === "review_move").length,
        review_recommended: reviews.filter(
          (r) => r.action === "review_recommended",
        ).length,
        optional_review: reviews.filter((r) => r.action === "optional_review")
          .length,
        no_change: reviews.filter((r) => r.action === "no_change").length,
      },
      needsAttention: reviews.filter((r) => r.action !== "no_change").length,
      evaluationCenters,
      holisticCenters: rawHolisticCenters,
      adjustedHolisticCenters,
      holisticPointsPerTeammateStrength: pointsPerStrengthUnit,
      expectedTeammateStrengthByAbility: expectedByAbility,
      restrictionPriorsByAbility: {
        S: restrictionPriorTeammateStrength("S"),
        A: restrictionPriorTeammateStrength("A"),
        B: restrictionPriorTeammateStrength("B"),
        C: restrictionPriorTeammateStrength("C"),
      },
      teamStrengthExpectationBuckets: strengthExpectations.length,
      teamStrengthSampleCount: globalTeamSamples.length,
      evaluationPeerCounts: {
        S: evaluationScoresByTier.S.length,
        A: evaluationScoresByTier.A.length,
        B: evaluationScoresByTier.B.length,
        C: evaluationScoresByTier.C.length,
      },
      holisticPeerCounts: {
        S: holisticScoresByTier.S.length,
        A: holisticScoresByTier.A.length,
        B: holisticScoresByTier.B.length,
        C: holisticScoresByTier.C.length,
      },
    };

    return { reviews, summary };
  },
});
