"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { requireAdminAction } from "../auth_helpers";

// Debug action to check what survival time data is available from Yunite API
export const checkLeaderboardData = action({
  args: {
    tournamentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("Yunite API credentials not configured");
    }
    
    const leaderboardUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}/leaderboard`;
    
    const response = await fetch(leaderboardUrl, {
      headers: {
        "Y-Api-Token": yuniteApiKey,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Return first 2 entries to inspect structure
    return {
      totalEntries: data.length,
      sampleEntries: data.slice(0, 2),
      availableFields: data.length > 0 ? Object.keys(data[0]) : [],
    };
  },
});
