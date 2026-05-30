import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";

// Recalculate player stats from match data and overrides
export const recalculatePlayerStats = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
    discordId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the thirdPartyResults record for this player
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    const playerResult = results.find(r => r.discordId === args.discordId);
    if (!playerResult) {
      return { success: false, message: "Player result not found" };
    }
    
    // Get the import to find tournament ID
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      return { success: false, message: "Import not found" };
    }
    
    // Get all overrides for this player in this tournament
    const overrides = await ctx.db
      .query("matchEliminationOverrides")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    const playerOverrides = overrides.filter(o => o.discordId === args.discordId);
    
    // If there are overrides, sum them up
    if (playerOverrides.length > 0) {
      const totalEliminations = playerOverrides.reduce((sum, override) => sum + override.eliminations, 0);
      
      // Update the thirdPartyResults record
      await ctx.db.patch(playerResult._id, {
        eliminations: totalEliminations,
      });
      
      return {
        success: true,
        totalEliminations,
        overridesApplied: playerOverrides.length,
      };
    }
    
    return {
      success: true,
      message: "No overrides found for this player",
    };
  },
});
