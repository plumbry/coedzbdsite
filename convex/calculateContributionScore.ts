import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { getPlayerDisplayStatsEligibility } from "./lib/stats/playerStatsCacheEligibility";
import { computeAndStoreContributionScore } from "./lib/stats/computeContributionScore";

/** Read cached Team Contribution score for a player. */
export const getPlayerCS = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const eligibility = await getPlayerDisplayStatsEligibility(ctx, args.playerId);
    if (!eligibility.statsEligible) {
      return null;
    }

    const player = await ctx.db.get(args.playerId);
    return player?.contributionScore || null;
  },
});

/**
 * Production TC path — used by playerStatsRebuild.
 * TC is a 0.00-1.00 metric measuring individual contribution across all matches.
 */
export const calculateAndStoreCSInternal = internalMutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      console.log(`Player ${args.playerId} not found - skipping TC calculation`);
      return { calculated: false, skippedNoChange: false, reason: "not_found" as const };
    }

    const eligibility = await getPlayerDisplayStatsEligibility(ctx, args.playerId);
    if (!eligibility.statsEligible) {
      console.log(
        `Player ${player.discordUsername} is below stats display threshold - skipping TC calculation`,
      );
      return {
        calculated: false,
        skippedNoChange: false,
        reason: "ineligible" as const,
      };
    }

    const result = await computeAndStoreContributionScore(ctx, args.playerId);

    if (result.action === "calculated") {
      return {
        calculated: true,
        skippedNoChange: false,
        score: result.score,
        matchesAnalyzed: result.matchesAnalyzed,
      };
    }

    if (result.action === "skipped_no_change") {
      return {
        calculated: false,
        skippedNoChange: true,
        score: result.score,
        matchesAnalyzed: result.matchesAnalyzed,
      };
    }

    return {
      calculated: false,
      skippedNoChange: false,
      reason: result.action,
    };
  },
});
