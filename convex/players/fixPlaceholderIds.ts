import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Fix players with placeholder Discord IDs by finding their real IDs from thirdPartyResults
 * Matches by Epic username variations (exact, "Mask {username}", "Mask {username}ǃ")
 */
export const fixPlaceholderDiscordIds = mutation({
  args: {
    batchSize: v.optional(v.number()),
    offset: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 50;
    const offset = args.offset || 0;
    
    // Get all players with placeholder IDs
    const allPlayers = await ctx.db.query("players").collect();
    const playersWithPlaceholder = allPlayers.filter(p => 
      p.discordUserId.startsWith("placeholder_")
    );
    
    const batch = playersWithPlaceholder.slice(offset, offset + batchSize);
    
    let fixed = 0;
    let notFound = 0;
    
    for (const player of batch) {
      // Try to find results by Epic username variations
      const epicUsername = player.epicUsername;
      
      // Build possible Epic username variations
      const variations = [
        epicUsername,
        `Mask ${epicUsername}`,
        `Mask ${epicUsername}ǃ`,
        epicUsername.toLowerCase(),
        epicUsername.toUpperCase()
      ];
      
      // Try to find any result with these Epic usernames
      let result = null;
      for (const variation of variations) {
        result = await ctx.db
          .query("thirdPartyResults")
          .filter((q) => q.eq(q.field("epicUsername"), variation))
          .first();
        
        if (result) break;
      }
      
      if (result && result.discordId) {
        const discordId = result.discordId;
        // Check if another player already has this Discord ID
        const existingPlayer = await ctx.db
          .query("players")
          .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
          .first();
        
        if (!existingPlayer) {
          // Update the player's Discord ID
          await ctx.db.patch(player._id, {
            discordUserId: discordId
          });
          fixed++;
        } else {
          // Discord ID already taken - skip
          notFound++;
        }
      } else {
        notFound++;
      }
    }
    
    const hasMore = offset + batchSize < playersWithPlaceholder.length;
    
    return {
      processed: batch.length,
      total: playersWithPlaceholder.length,
      fixed,
      notFound,
      hasMore,
      nextOffset: offset + batchSize
    };
  },
});
