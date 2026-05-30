"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel.d.ts";

/**
 * Debug CS calculation for a specific player
 */
export const debugCSCalculation = action({
  args: {
    epicUsername: v.string(),
  },
  handler: async (ctx, args): Promise<{ error: string } | { success: boolean; result: unknown; error?: string }> => {
    console.log(`\n=== DEBUG CS for ${args.epicUsername} ===`);
    
    // Get player
    const players = await ctx.runQuery(api.players.getPlayers);
    const player = players.find((p: Doc<"players">) => p.epicUsername === args.epicUsername);
    
    if (!player) {
      return { error: "Player not found" };
    }
    
    console.log(`Player ID: ${player._id}`);
    
    // Try to calculate CS
    try {
      const result: unknown = await ctx.runMutation(internal.calculateContributionScore.calculateAndStoreCSInternal, {
        playerId: player._id,
      });
      
      console.log("CS Calculation Result:", result);
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error("CS Calculation Error:", error);
      return {
        success: false,
        error: String(error),
        result: null,
      };
    }
  },
});
