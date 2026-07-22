import { query } from "./_generated/server";
import { requireModeratorOrAdmin } from "./auth_helpers";
import {
  actionSortRank,
  buildTierCenters,
  classifyScoreAgainstCenters,
  computeTierRecommendation,
  confidenceSortRank,
  isReviewTier,
  overallFitLabel,
  type ActionKind,
  type ConfidenceLevel,
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
  holisticScore: number;
  holisticFitLabel: string;
  totalEvents: number;
  overallFitLabel: string;
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  stars: number;
  action: ActionKind;
  actionLabel: string;
  reason: string;
  suggestedTier?: ReviewTier;
};

/**
 * Tier recommendation — best-fit from evaluation + holistic distributions.
 * Current assigned tier is used only for the action (promote / demote / none).
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

    // Population distributions by *assigned* tier — used only to learn centers.
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

      // Holistic center learning uses assigned tier of the population.
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
      });
    }

    const evaluationCenters = buildTierCenters(evaluationScoresByTier);
    const holisticCenters = buildTierCenters(holisticScoresByTier);

    const reviews: PlayerReviewRow[] = [];

    for (const candidate of candidates) {
      const { cache, currentTier, evaluationScore } = candidate;

      // Classification uses scores vs centers only — not the player's tier.
      const evaluationFit = classifyScoreAgainstCenters(
        evaluationScore,
        evaluationCenters,
      );
      const holisticFit = classifyScoreAgainstCenters(
        cache.holisticScore,
        holisticCenters,
      );

      const result = computeTierRecommendation(
        evaluationFit,
        holisticFit,
        currentTier,
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
        holisticFitLabel: holisticFit.label,
        totalEvents: cache.totalEvents,
        overallFitLabel: overallFitLabel(result.overallFit),
        confidence: result.confidence,
        confidenceLabel: result.confidenceLabel,
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
        confidenceSortRank(a.confidence) - confidenceSortRank(b.confidence);
      if (byConfidence !== 0) return byConfidence;
      return a.discordUsername.localeCompare(b.discordUsername);
    });

    const summary = {
      totalCompared: reviews.length,
      insufficientEvaluation,
      skippedInvalidTier,
      byConfidence: {
        high: reviews.filter((r) => r.confidence === "high").length,
        medium: reviews.filter((r) => r.confidence === "medium").length,
        low: reviews.filter((r) => r.confidence === "low").length,
      },
      byAction: {
        review_required: reviews.filter((r) => r.action === "review_required")
          .length,
        review_move: reviews.filter((r) => r.action === "review_move").length,
        optional_review: reviews.filter((r) => r.action === "optional_review")
          .length,
        no_change: reviews.filter((r) => r.action === "no_change").length,
      },
      needsAttention: reviews.filter((r) => r.action !== "no_change").length,
      evaluationCenters,
      holisticCenters,
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
