import { query } from "./_generated/server";
import { requireModeratorOrAdmin } from "./auth_helpers";
import {
  computePercentileRank,
  computeReviewConfidence,
  confidenceLabel,
  confidenceSortRank,
  formatPositionLabel,
  isReviewConfidenceTier,
  recommendationLabel,
  type ConfidenceLevel,
  type ReviewRecommendation,
} from "./lib/stats/tierReviewConfidence";

type PlayerReviewRow = {
  playerId: string;
  discordUsername: string;
  epicUsername: string;
  nickname?: string;
  currentTier: string;
  evaluationScore: number;
  evaluationPercentile: number;
  evaluationLabel: string;
  holisticScore: number;
  holisticPercentile: number;
  holisticLabel: string;
  totalEvents: number;
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  stars: number;
  recommendation: ReviewRecommendation;
  recommendationLabel: string;
  reason: string;
  percentileGap: number;
};

/**
 * Tier Review Confidence — prioritisation aid for admins.
 * Includes every player with a holistic cache score (when evaluation score exists).
 * Does not auto-promote or demote anyone.
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

    // Evaluation peer set: all active players with a score in S/A/B/C.
    const evaluationPeersByTier: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };
    for (const player of activePlayers) {
      if (
        player.isAlt ||
        !isReviewConfidenceTier(player.tier) ||
        typeof player.totalScore !== "number"
      ) {
        continue;
      }
      evaluationPeersByTier[player.tier].push(player.totalScore);
    }

    // Holistic peer set + review candidates: everyone in the holistic cache.
    const holisticPeersByTier: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };

    const playersById = new Map(activePlayers.map((p) => [p._id, p] as const));

    // Resolve any cache players not in the active set (still show if they have holistic).
    const missingIds = cacheRows
      .map((row) => row.playerId)
      .filter((id) => !playersById.has(id));
    if (missingIds.length > 0) {
      const extras = await Promise.all(missingIds.map((id) => ctx.db.get(id)));
      for (const player of extras) {
        if (player) playersById.set(player._id, player);
      }
    }

    type CacheCandidate = {
      cache: (typeof cacheRows)[number];
      tier: string;
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
      const tier =
        (player && isReviewConfidenceTier(player.tier) && player.tier) ||
        (isReviewConfidenceTier(cache.tier) ? cache.tier : null);

      if (!tier) {
        skippedInvalidTier += 1;
        continue;
      }

      holisticPeersByTier[tier].push(cache.holisticScore);

      const evaluationScore =
        typeof player?.totalScore === "number" ? player.totalScore : null;
      if (evaluationScore === null) {
        insufficientEvaluation += 1;
        continue;
      }

      candidates.push({
        cache,
        tier,
        evaluationScore,
        discordUsername: player?.discordUsername ?? cache.discordUsername,
        epicUsername: player?.epicUsername ?? "",
        nickname: player?.nickname,
      });
    }

    const reviews: PlayerReviewRow[] = [];

    for (const candidate of candidates) {
      const { cache, tier, evaluationScore } = candidate;

      const evaluationPercentile = computePercentileRank(
        evaluationScore,
        evaluationPeersByTier[tier],
      );
      const holisticPercentile = computePercentileRank(
        cache.holisticScore,
        holisticPeersByTier[tier],
      );

      const result = computeReviewConfidence(
        evaluationPercentile,
        holisticPercentile,
        tier,
      );

      reviews.push({
        playerId: cache.playerId,
        discordUsername: candidate.discordUsername,
        epicUsername: candidate.epicUsername,
        nickname: candidate.nickname,
        currentTier: tier,
        evaluationScore,
        evaluationPercentile,
        evaluationLabel: formatPositionLabel(evaluationPercentile, tier),
        holisticScore: cache.holisticScore,
        holisticPercentile,
        holisticLabel: formatPositionLabel(holisticPercentile, tier),
        totalEvents: cache.totalEvents,
        confidence: result.confidence,
        confidenceLabel: confidenceLabel(result.confidence),
        stars: result.stars,
        recommendation: result.recommendation,
        recommendationLabel: recommendationLabel(result.recommendation),
        reason: result.reason,
        percentileGap: result.percentileGap,
      });
    }

    reviews.sort((a, b) => {
      const byConfidence =
        confidenceSortRank(a.confidence) - confidenceSortRank(b.confidence);
      if (byConfidence !== 0) return byConfidence;
      if (a.confidence === "low") {
        return b.percentileGap - a.percentileGap;
      }
      if (a.confidence === "moderate") {
        const aEdge = Math.min(
          a.evaluationPercentile,
          100 - a.evaluationPercentile,
        );
        const bEdge = Math.min(
          b.evaluationPercentile,
          100 - b.evaluationPercentile,
        );
        return aEdge - bEdge;
      }
      return a.discordUsername.localeCompare(b.discordUsername);
    });

    const summary = {
      totalCompared: reviews.length,
      insufficientEvaluation,
      skippedInvalidTier,
      byConfidence: {
        very_high: reviews.filter((r) => r.confidence === "very_high").length,
        high: reviews.filter((r) => r.confidence === "high").length,
        moderate: reviews.filter((r) => r.confidence === "moderate").length,
        low: reviews.filter((r) => r.confidence === "low").length,
      },
      needsAttention: reviews.filter(
        (r) => r.confidence === "low" || r.confidence === "moderate",
      ).length,
      evaluationPeerCounts: {
        S: evaluationPeersByTier.S.length,
        A: evaluationPeersByTier.A.length,
        B: evaluationPeersByTier.B.length,
        C: evaluationPeersByTier.C.length,
      },
      holisticPeerCounts: {
        S: holisticPeersByTier.S.length,
        A: holisticPeersByTier.A.length,
        B: holisticPeersByTier.B.length,
        C: holisticPeersByTier.C.length,
      },
    };

    return { reviews, summary };
  },
});
