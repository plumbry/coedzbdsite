import { v } from "convex/values";
import { query } from "./_generated/server";

export const getPlayerTierHistory = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Public query - anyone can view tier history
    const history = await ctx.db
      .query("tierHistory")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .order("desc")
      .collect();
    
    return history.map((record) => ({
      _id: record._id,
      _creationTime: record._creationTime,
      tier: record.tier,
      previousTier: record.previousTier,
      totalScore: record.totalScore,
      changedDate: new Date(record._creationTime).toLocaleDateString(),
    }));
  },
});

export const getLatestTierChange = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Public query - get the most recent tier change
    const latestChange = await ctx.db
      .query("tierHistory")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .order("desc")
      .first();
    
    if (!latestChange) {
      return null;
    }
    
    return {
      currentTier: latestChange.tier,
      previousTier: latestChange.previousTier,
      changedDate: new Date(latestChange._creationTime).toLocaleDateString(),
      totalScore: latestChange.totalScore,
    };
  },
});
