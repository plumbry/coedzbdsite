import { v } from "convex/values";
import { query } from "./_generated/server";
import { FORMULA_VERSION } from "./lib/stats/versions";

/** Production tier re-evaluation data — reads pre-built cache only. */
export const getCachedTierReEvaluationData = query({
  args: {
    tier: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return null;
    }

    const tierMedians = await ctx.db.query("tierMediansCache").first();

    if (!tierMedians) {
      return null;
    }

    const maxResults = Math.min(args.limit ?? 500, 500);

    const cachedEvaluations = args.tier
      ? await ctx.db
          .query("tierReEvaluationCache")
          .withIndex("by_tier", (q) => q.eq("tier", args.tier!))
          .take(maxResults)
      : await ctx.db.query("tierReEvaluationCache").take(maxResults);

    if (cachedEvaluations.length === 0) {
      return null;
    }

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.getTime();

    const recentEvaluations = cachedEvaluations.filter((e) => {
      if (!e.lastEventDate) return false;
      return new Date(e.lastEventDate).getTime() >= cutoff;
    });

    return {
      evaluations: recentEvaluations,
      tierAverages: tierMedians.tierAverages,
      tierHolisticMedians: tierMedians.tierHolisticMedians,
      tierKillsMedians: tierMedians.tierKillsMedians,
      recentTierHolisticMedians: tierMedians.recentTierHolisticMedians,
      lastUpdated: tierMedians.lastUpdated,
      formulaVersion: tierMedians.formulaVersion ?? FORMULA_VERSION,
    };
  },
});
