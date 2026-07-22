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
 * Compares within-tier percentile of Tier Evaluation Score vs Holistic Score.
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

    const eligiblePlayers = activePlayers.filter(
      (p) =>
        !p.isAlt &&
        isReviewConfidenceTier(p.tier) &&
        typeof p.totalScore === "number",
    );

    const cacheByPlayerId = new Map(
      cacheRows.map((row) => [row.playerId, row] as const),
    );

    // Peer groups: evaluation uses all active players in the tier;
    // holistic uses cache peers currently in that same tier.
    const evaluationPeersByTier: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };
    const holisticPeersByTier: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };

    for (const player of eligiblePlayers) {
      const tier = player.tier!;
      evaluationPeersByTier[tier].push(player.totalScore!);

      const cached = cacheByPlayerId.get(player._id);
      if (cached && typeof cached.holisticScore === "number") {
        holisticPeersByTier[tier].push(cached.holisticScore);
      }
    }

    const reviews: PlayerReviewRow[] = [];
    let insufficientHolistic = 0;

    for (const player of eligiblePlayers) {
      const tier = player.tier!;
      const evaluationScore = player.totalScore!;
      const cached = cacheByPlayerId.get(player._id);

      if (!cached || typeof cached.holisticScore !== "number") {
        insufficientHolistic += 1;
        continue;
      }

      const evaluationPercentile = computePercentileRank(
        evaluationScore,
        evaluationPeersByTier[tier],
      );
      const holisticPercentile = computePercentileRank(
        cached.holisticScore,
        holisticPeersByTier[tier],
      );

      const result = computeReviewConfidence(
        evaluationPercentile,
        holisticPercentile,
        tier,
      );

      reviews.push({
        playerId: player._id,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        nickname: player.nickname,
        currentTier: tier,
        evaluationScore,
        evaluationPercentile,
        evaluationLabel: formatPositionLabel(evaluationPercentile, tier),
        holisticScore: cached.holisticScore,
        holisticPercentile,
        holisticLabel: formatPositionLabel(holisticPercentile, tier),
        totalEvents: cached.totalEvents,
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
      // Within same confidence, larger disagreement / closer to boundary first
      if (a.confidence === "low") {
        return b.percentileGap - a.percentileGap;
      }
      if (a.confidence === "moderate") {
        const aEdge = Math.min(a.evaluationPercentile, 100 - a.evaluationPercentile);
        const bEdge = Math.min(b.evaluationPercentile, 100 - b.evaluationPercentile);
        return aEdge - bEdge;
      }
      return a.discordUsername.localeCompare(b.discordUsername);
    });

    const summary = {
      totalCompared: reviews.length,
      insufficientHolistic,
      byConfidence: {
        very_high: reviews.filter((r) => r.confidence === "very_high").length,
        high: reviews.filter((r) => r.confidence === "high").length,
        moderate: reviews.filter((r) => r.confidence === "moderate").length,
        low: reviews.filter((r) => r.confidence === "low").length,
      },
      needsAttention: reviews.filter(
        (r) =>
          r.confidence === "low" || r.confidence === "moderate",
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
