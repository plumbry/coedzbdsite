import { query } from "./_generated/server";
import { requireModeratorOrAdmin } from "./auth_helpers";
import {
  actionSortRank,
  buildTierCenters,
  classifyScoreAgainstCenters,
  computeRecommendationFromTtAssessment,
  confidenceSortRank,
  isReviewTier,
  overallFitLabel,
  ttCacheRowToAssessmentInput,
  type ActionKind,
  type ConfidenceLevel,
  type OverallFit,
  type ReviewTier,
} from "./lib/stats/tierReviewConfidence";

type PlayerReviewRow = {
  playerId: string;
  discordUsername: string;
  epicUsername: string;
  nickname?: string;
  currentTier: ReviewTier;
  evaluationScore: number;
  evaluationFitLabel: string;
  experienceScore?: number;
  ttConclusion?: string;
  ttEligible?: boolean;
  formTrendLevel?: string;
  overallFitLabel: string;
  recommendationConfidence: ConfidenceLevel;
  recommendationConfidenceLabel: string;
  stars: number;
  action: ActionKind;
  actionLabel: string;
  reason: string;
  recommendationSource: "tier_tool" | "pending_import" | "missing_from_export";
};

/**
 * Tier recommendations — evaluation fit + Tier Tool ECP consensus import.
 * No holistic/TAP modelling on Website (Phase 6).
 */
export const getTierReviewConfidence = query({
  args: {},
  handler: async (ctx) => {
    await requireModeratorOrAdmin(ctx);

    const [activePlayers, ttImportMeta, ttMetricRows] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
      ctx.db.query("ttReviewMetricsImport").take(1),
      ctx.db.query("ttReviewMetricsByPlayer").collect(),
    ]);

    const ttImport = ttImportMeta[0] ?? null;
    const ttImportActive = Boolean(ttImport);
    const ttByPlayerId = new Map(
      ttMetricRows.map((row) => [row.playerId, row] as const),
    );

    const evaluationScoresByTier: Record<ReviewTier, number[]> = {
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

    const evaluationCenters = buildTierCenters(evaluationScoresByTier);

    const reviews: PlayerReviewRow[] = [];
    let insufficientEvaluation = 0;
    let skippedInvalidTier = 0;
    let missingFromExport = 0;

    for (const player of activePlayers) {
      if (player.isAlt || !isReviewTier(player.tier)) {
        if (!player.isAlt && player.tier && !isReviewTier(player.tier)) {
          skippedInvalidTier += 1;
        }
        continue;
      }

      const currentTier = player.tier;
      const evaluationScore =
        typeof player.totalScore === "number" ? player.totalScore : null;
      if (evaluationScore === null) {
        insufficientEvaluation += 1;
        continue;
      }

      const evaluationFit = classifyScoreAgainstCenters(
        evaluationScore,
        evaluationCenters,
      );

      const ttRow = ttByPlayerId.get(player._id);

      let action: ActionKind = "no_change";
      let actionLabel = "No Change";
      let reason = "Import Tier Tool review metrics to enable recommendations.";
      let recommendationConfidence: ConfidenceLevel = "low";
      let stars = 1;
      let overallFit: OverallFit = evaluationFit;
      let recommendationSource: PlayerReviewRow["recommendationSource"] =
        "pending_import";
      let ttConclusion: string | undefined;
      let ttEligible: boolean | undefined;
      let formTrendLevel: string | undefined;
      let experienceScore: number | undefined;

      if (ttImportActive && ttRow) {
        const ttResult = computeRecommendationFromTtAssessment(
          currentTier,
          evaluationFit,
          ttCacheRowToAssessmentInput(ttRow),
        );
        action = ttResult.action;
        actionLabel = ttResult.actionLabel;
        reason = ttResult.reason;
        recommendationConfidence = ttResult.recommendationConfidence;
        stars = ttResult.stars;
        overallFit = ttResult.overallFit;
        recommendationSource = "tier_tool";
        ttConclusion = ttRow.conclusion ?? undefined;
        ttEligible = ttRow.eligible;
        formTrendLevel = ttRow.formTrendLevel ?? undefined;
        experienceScore = ttRow.experienceScore ?? undefined;
      } else if (ttImportActive) {
        recommendationSource = "missing_from_export";
        missingFromExport += 1;
        reason =
          "Player not in Tier Tool export snapshot — re-export from Tier Tool after rebuild.";
      }

      const recommendationConfidenceLabel =
        recommendationConfidence === "high"
          ? "High"
          : recommendationConfidence === "medium"
            ? "Medium"
            : "Low";

      reviews.push({
        playerId: player._id,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        nickname: player.nickname,
        currentTier,
        evaluationScore,
        evaluationFitLabel: evaluationFit.label,
        experienceScore,
        ttConclusion,
        ttEligible,
        formTrendLevel,
        overallFitLabel: overallFitLabel(overallFit),
        recommendationConfidence,
        recommendationConfidenceLabel,
        stars,
        action,
        actionLabel,
        reason,
        recommendationSource,
      });
    }

    reviews.sort((a, B) => {
      const byAction = actionSortRank(a.action) - actionSortRank(B.action);
      if (byAction !== 0) return byAction;
      const byConfidence =
        confidenceSortRank(a.recommendationConfidence) -
        confidenceSortRank(B.recommendationConfidence);
      if (byConfidence !== 0) return byConfidence;
      return a.discordUsername.localeCompare(B.discordUsername);
    });

    return {
      reviews,
      summary: {
        totalCompared: reviews.length,
        insufficientEvaluation,
        skippedInvalidTier,
        missingFromExport,
        byRecommendationConfidence: {
          high: reviews.filter((r) => r.recommendationConfidence === "high")
            .length,
          medium: reviews.filter((r) => r.recommendationConfidence === "medium")
            .length,
          low: reviews.filter((r) => r.recommendationConfidence === "low")
            .length,
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
        evaluationPeerCounts: {
          S: evaluationScoresByTier.S.length,
          A: evaluationScoresByTier.A.length,
          B: evaluationScoresByTier.B.length,
          C: evaluationScoresByTier.C.length,
        },
        ttImport: ttImportActive
          ? {
              active: true,
              generatedAt: ttImport!.generatedAt,
              importedAt: ttImport!.importedAt,
              playerCount: ttImport!.playerCount,
              matchedInReviews: reviews.filter(
                (r) => r.recommendationSource === "tier_tool",
              ).length,
            }
          : { active: false },
      },
    };
  },
});
