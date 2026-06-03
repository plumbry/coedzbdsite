import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { normalizeDiscordId } from "../lib/playerIdentity";

/**
 * Re-link thirdPartyResults to players by matching Discord IDs
 * This fixes orphaned results after player database changes
 * Processes in batches to avoid hitting query limits
 * 
 * IMPORTANT: This includes ALL players regardless of status (active/archived)
 * to ensure historical match data stays linked even after a player is archived
 */
export const relinkThirdPartyResults = mutation({
  args: { 
    batchSize: v.optional(v.number()),
    offset: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 100;
    const offset = args.offset || 0;
    
    // Get a batch of third party results
    const allResults = await ctx.db.query("thirdPartyResults").collect();
    const batch = allResults.slice(offset, offset + batchSize);
    
    // Build a map of Discord ID -> Player for efficient lookup
    // Get ALL players (including archived) once and build lookup maps
    const allPlayers = await ctx.db.query("players").collect();
    const discordIdToPlayer = new Map();
    
    for (const player of allPlayers) {
      if (player.discordUserId?.trim()) {
        discordIdToPlayer.set(
          normalizeDiscordId(player.discordUserId),
          player,
        );
      }
      for (const altId of player.alternateDiscordUserIds ?? []) {
        if (altId.trim()) {
          discordIdToPlayer.set(normalizeDiscordId(altId), player);
        }
      }
    }
    
    let relinked = 0;
    let unlinked = 0;
    let unchanged = 0;
    let notFound = 0;
    
    for (const result of batch) {
      const discordId = result.discordId;
      if (!discordId) {
        notFound++;
        continue;
      }
      
      const player = discordIdToPlayer.get(normalizeDiscordId(discordId));
      
      if (player) {
        // Check if already correctly linked
        if (result.playerId === player._id) {
          unchanged++;
        } else {
          // Update the link
          await ctx.db.patch(result._id, {
            playerId: player._id,
            matched: true
          });
          relinked++;
        }
      } else {
        // Player not found - unlink if previously linked
        if (result.playerId) {
          await ctx.db.patch(result._id, {
            playerId: undefined,
            matched: false
          });
          unlinked++;
        } else {
          notFound++;
        }
      }
    }
    
    const hasMore = offset + batchSize < allResults.length;
    
    return {
      processed: batch.length,
      total: allResults.length,
      relinked,
      unlinked,
      unchanged,
      notFound,
      hasMore,
      nextOffset: offset + batchSize
    };
  },
});
