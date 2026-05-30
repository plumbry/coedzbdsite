import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";

/**
 * Reset matchDataSynced flag for imports that don't have actual match data
 * This allows them to be re-processed by the backfill
 */
export const resetInvalidSyncFlags = mutation({
  args: {},
  handler: async (ctx) => {
    const imports = await ctx.db
      .query("thirdPartyImports")
      .filter((q) => q.eq(q.field("source"), "Yunite"))
      .collect();
    
    let resetCount = 0;
    const resetImports = [];
    
    for (const importRecord of imports) {
      // Only check imports marked as synced
      if (!importRecord.matchDataSynced) continue;
      
      // Check if this import actually has match stats
      const matchStats = await ctx.db
        .query("matchPlayerStats")
        .withIndex("by_match", (q) => q.eq("importId", importRecord._id))
        .first();
      
      // If no match stats exist, reset the flag
      if (!matchStats) {
        await ctx.db.patch(importRecord._id, {
          matchDataSynced: false,
        });
        resetCount++;
        resetImports.push(importRecord.eventName);
        console.log(`Reset: ${importRecord.eventName}`);
      }
    }
    
    return {
      resetCount,
      resetImports,
    };
  },
});

/**
 * Fix orphaned matchPlayerStats records by linking them to correct players via Discord ID
 * Processes a batch of players at a time to avoid hitting data limits
 */
export const fixOrphanedMatchStats = mutation({
  args: {
    discordId: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    lastPlayerId: v.optional(v.id("players")),
  },
  handler: async (ctx, args) => {
    let updated = 0;
    let skipped = 0;
    const updates: Array<{ discordId: string; oldPlayerId: string; newPlayerId: string; count: number }> = [];
    
    // If a specific Discord ID is provided, process just that one
    if (args.discordId) {
      const result = await processDiscordId(ctx, args.discordId);
      return {
        ...result,
        hasMore: false,
        lastPlayerId: null,
      };
    }
    
    // Otherwise, process players in batches using cursor-based pagination
    const batchSize = args.batchSize || 10;
    
    // Get the next batch of players
    let query = ctx.db.query("players").order("asc");
    
    // If we have a last player ID, start after it
    if (args.lastPlayerId) {
      const lastPlayer = await ctx.db.get(args.lastPlayerId);
      if (lastPlayer) {
        query = query.filter((q) => q.gt(q.field("_creationTime"), lastPlayer._creationTime));
      }
    }
    
    const batch = await query.take(batchSize + 1); // Take one extra to check if there's more
    const hasMore = batch.length > batchSize;
    const playersToProcess = hasMore ? batch.slice(0, batchSize) : batch;
    
    console.log(`Processing batch of ${playersToProcess.length} players`);
    
    // Process each player's Discord ID in this batch
    for (const player of playersToProcess) {
      if (!player.discordUserId) continue;
      
      const result = await processDiscordId(ctx, player.discordUserId);
      updated += result.updated;
      skipped += result.skipped;
      updates.push(...result.updates);
    }
    
    const lastPlayerId = playersToProcess.length > 0 
      ? playersToProcess[playersToProcess.length - 1]._id 
      : null;
    
    return {
      updated,
      skipped,
      updates,
      hasMore,
      lastPlayerId,
      processedCount: playersToProcess.length,
    };
  },
});

async function processDiscordId(
  ctx: { db: any },
  discordId: string
): Promise<{ updated: number; skipped: number; updates: Array<{ discordId: string; oldPlayerId: string; newPlayerId: string; count: number }> }> {
  let updated = 0;
  const updates: Array<{ discordId: string; oldPlayerId: string; newPlayerId: string; count: number }> = [];
  
  // Find the current player with this Discord ID
  const currentPlayer = await ctx.db
    .query("players")
    .filter((q: any) => q.eq(q.field("discordUserId"), discordId))
    .first();
  
  if (!currentPlayer) {
    return { updated: 0, skipped: 0, updates: [] };
  }
  
  // Get a sample of match stats to check if there are orphaned ones
  // We only need to check a few to find the old player ID pattern
  const sampleStats = await ctx.db
    .query("matchPlayerStats")
    .filter((q: any) => q.eq(q.field("discordId"), discordId))
    .take(10);
  
  if (sampleStats.length === 0) {
    return { updated: 0, skipped: 0, updates: [] };
  }
  
  // Find any player IDs that aren't the current player
  const oldPlayerIds = new Set<string>();
  for (const stat of sampleStats) {
    if (stat.playerId && stat.playerId !== currentPlayer._id) {
      oldPlayerIds.add(stat.playerId);
    }
  }
  
  // For each old player ID, check if it exists
  for (const oldPlayerId of oldPlayerIds) {
    const oldPlayer = await ctx.db.get(oldPlayerId as Id<"players">);
    
    if (!oldPlayer) {
      // Old player doesn't exist - this is an orphaned player ID
      // Update all match stats with this Discord ID and old player ID
      console.log(`Found orphaned player ID ${oldPlayerId} for Discord ${discordId}`);
      console.log(`Updating to current player: ${currentPlayer._id} (${currentPlayer.epicUsername})`);
      
      // Get all match stats with this combination and update them in batches
      let batchUpdated = 0;
      const statsToUpdate = await ctx.db
        .query("matchPlayerStats")
        .filter((q: any) => 
          q.and(
            q.eq(q.field("discordId"), discordId),
            q.eq(q.field("playerId"), oldPlayerId)
          )
        )
        .take(1000); // Limit to 1000 at a time
      
      for (const stat of statsToUpdate) {
        await ctx.db.patch(stat._id, {
          playerId: currentPlayer._id,
        });
        batchUpdated++;
        updated++;
      }
      
      console.log(`Updated ${batchUpdated} stats from ${oldPlayerId} to ${currentPlayer._id}`);
      
      updates.push({
        discordId,
        oldPlayerId,
        newPlayerId: currentPlayer._id,
        count: batchUpdated,
      });
    }
  }
  
  return { updated, skipped: 0, updates };
}
