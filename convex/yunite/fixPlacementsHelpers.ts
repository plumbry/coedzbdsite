import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

/**
 * Get all Yunite imports (API-based, not CSV)
 */
export const getAllYuniteImports = query({
  args: {},
  handler: async (ctx) => {
    // Get all imports where source is "Yunite" and leaderboardId starts with "yunite-"
    const allImports = await ctx.db
      .query("thirdPartyImports")
      .filter((q) => q.eq(q.field("source"), "Yunite"))
      .collect();
    
    // Filter to only API imports (have "yunite-" prefix in leaderboardId)
    return allImports.filter((imp) => imp.leaderboardId.startsWith("yunite-"));
  },
});

/**
 * Update placement and points values in thirdPartyResults for a given import
 */
export const updateResultPlacements = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    discordIdToRank: v.record(v.string(), v.number()),
    discordIdToPoints: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    // Get all results for this import
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    let updated = 0;
    
    for (const result of results) {
      // Look up the correct rank and points by Discord ID
      if (result.discordId && args.discordIdToRank[result.discordId] !== undefined) {
        const correctRank = args.discordIdToRank[result.discordId];
        const correctPoints = args.discordIdToPoints[result.discordId] ?? result.points;
        
        // Only update if placement or points are different
        if (result.placement !== correctRank || result.points !== correctPoints) {
          await ctx.db.patch(result._id, {
            placement: correctRank,
            points: correctPoints,
          });
          updated++;
        }
      }
    }
    
    return updated;
  },
});

/**
 * Update placement and eventScore values in eventResults for a given import
 */
export const updateEventResultPlacements = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    discordIdToRank: v.record(v.string(), v.number()),
    discordIdToPoints: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    // Get all event results linked to this import
    const eventResults = await ctx.db
      .query("eventResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    let updated = 0;
    
    for (const eventResult of eventResults) {
      // Get the player to find their Discord ID
      const player = await ctx.db.get(eventResult.playerId);
      
      if (player?.discordUserId && args.discordIdToRank[player.discordUserId] !== undefined) {
        const correctRank = args.discordIdToRank[player.discordUserId];
        const correctPoints = args.discordIdToPoints[player.discordUserId] ?? eventResult.eventScore;
        
        // Only update if placement or eventScore are different
        if (eventResult.placement !== correctRank || eventResult.eventScore !== correctPoints) {
          await ctx.db.patch(eventResult._id, {
            placement: correctRank,
            eventScore: correctPoints,
          });
          updated++;
        }
      }
    }
    
    return updated;
  },
});
