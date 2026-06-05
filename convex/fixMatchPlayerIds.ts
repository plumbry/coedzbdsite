import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";

/**
 * Fix match records that are linked to wrong/old player IDs
 * This mutation relinks matches to the correct current player based on discordId
 */
export const fixMatchPlayerIdMismatches = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const BATCH_SIZE = args.batchSize || 100;
    
    console.log("[Fix Match Player IDs] Starting...");
    
    // Get all players sorted by creation time (newest first)
    const allPlayers = await ctx.db.query("players").collect();
    
    // Sort: active first, then by _creationTime descending (newest first)
    allPlayers.sort((a, b) => {
      // Active players come first
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      // Then sort by creation time descending (newest first)
      return b._creationTime - a._creationTime;
    });
    
    // Create a map of discordId -> current player ID
    // Process in order, so first occurrence (active + newest) wins
    const discordIdToPlayerId = new Map<string, Id<"players">>();
    
    for (const player of allPlayers) {
      if (!player.discordUserId || player.discordUserId === "imported" || player.discordUserId.startsWith("placeholder_")) {
        continue;
      }
      
      // Only set if not already set (first occurrence wins)
      if (!discordIdToPlayerId.has(player.discordUserId)) {
        discordIdToPlayerId.set(player.discordUserId, player._id);
      }
    }
    
    console.log(`[Fix Match Player IDs] Found ${discordIdToPlayerId.size} unique Discord IDs`);
    
    // Process matches in chunks, fixing mismatches until we hit batch size
    let fixed = 0;
    let skipped = 0;
    let errors = 0;
    let totalChecked = 0;
    let hasMore = false;
    
    // Stream through ALL matches to find mismatches
    const CHUNK_SIZE = 500; // Increased since we're using indexed queries now
    let lastCreationTime: number | null = null;
    
    while (fixed < BATCH_SIZE) {
      // Get next chunk of matches using creation time index
      let matches;
      if (lastCreationTime !== null) {
        const creationTime: number = lastCreationTime;
        matches = await ctx.db
          .query("matchPlayerStats")
          .withIndex("by_creation_time", (q) => q.gt("_creationTime", creationTime))
          .take(CHUNK_SIZE);
      } else {
        matches = await ctx.db
          .query("matchPlayerStats")
          .withIndex("by_creation_time")
          .take(CHUNK_SIZE);
      }
      
      if (matches.length === 0) {
        // No more matches to process
        hasMore = false;
        break;
      }
      
      totalChecked += matches.length;
      lastCreationTime = matches[matches.length - 1]._creationTime;
      
      let noDiscordIdCount = 0;
      let noPlayerFoundCount = 0;
      let alreadyCorrectCount = 0;
      
      for (const match of matches) {
        // Stop if we've hit our batch limit
        if (fixed >= BATCH_SIZE) {
          hasMore = true;
          break;
        }
        
        try {
          // Skip if no discordId
          if (!match.discordId) {
            skipped++;
            noDiscordIdCount++;
            continue;
          }
          
          // Get correct player ID for this discordId
          const correctPlayerId = discordIdToPlayerId.get(match.discordId);
          
          if (!correctPlayerId) {
            // No player found for this discordId
            skipped++;
            noPlayerFoundCount++;
            continue;
          }
          
          // Skip if already correct
          if (match.playerId === correctPlayerId) {
            skipped++;
            alreadyCorrectCount++;
            continue;
          }
          
          // Update to correct player ID
          await ctx.db.patch(match._id, {
            playerId: correctPlayerId,
          });
          
          fixed++;
          
          if (fixed % 10 === 0) {
            console.log(`[Fix Match Player IDs] Fixed ${fixed} matches (checked ${totalChecked})...`);
          }
        } catch (error) {
          console.error(`[Fix Match Player IDs] Error fixing match ${match._id}:`, error);
          errors++;
        }
      }
      
      if (noDiscordIdCount > 0 || noPlayerFoundCount > 0 || alreadyCorrectCount > 0) {
        console.log(`[Fix Match Player IDs] Chunk stats - No Discord ID: ${noDiscordIdCount}, No Player: ${noPlayerFoundCount}, Already Correct: ${alreadyCorrectCount}, Fixed: ${fixed}`);
      }
      
      // If we've hit batch limit, stop
      if (fixed >= BATCH_SIZE) {
        hasMore = true;
        break;
      }
    }
    
    console.log(`[Fix Match Player IDs] Complete: ${fixed} fixed, ${skipped} skipped, ${errors} errors (checked ${totalChecked} total)`);
    
    return {
      fixed,
      skipped,
      errors,
      hasMore,
      totalChecked,
    };
  },
});

/**
 * Check how many match records have player ID mismatches (diagnostic only)
 */
export const checkMatchPlayerIdMismatches = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    console.log("[Check Match Player IDs] Starting diagnostic...");
    
    // Get all players sorted by creation time (newest first)
    const allPlayers = await ctx.db.query("players").collect();
    
    // Sort: active first, then by _creationTime descending (newest first)
    allPlayers.sort((a, b) => {
      // Active players come first
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      // Then sort by creation time descending (newest first)
      return b._creationTime - a._creationTime;
    });
    
    // Create a map of discordId -> current player ID
    // Process in order, so first occurrence (active + newest) wins
    const discordIdToPlayerId = new Map<string, Id<"players">>();
    
    for (const player of allPlayers) {
      if (!player.discordUserId || player.discordUserId === "imported" || player.discordUserId.startsWith("placeholder_")) {
        continue;
      }
      
      // Only set if not already set (first occurrence wins)
      if (!discordIdToPlayerId.has(player.discordUserId)) {
        discordIdToPlayerId.set(player.discordUserId, player._id);
      }
    }
    
    // Check all matches
    const allMatches = await ctx.db.query("matchPlayerStats").collect();
    
    let totalMismatches = 0;
    let totalCorrect = 0;
    let totalNoDiscordId = 0;
    const exampleMismatches: Array<{ discordId: string; currentPlayerId: Id<"players">; wrongPlayerId: Id<"players"> }> = [];
    
    for (const match of allMatches) {
      if (!match.discordId) {
        totalNoDiscordId++;
        continue;
      }
      
      const correctPlayerId = discordIdToPlayerId.get(match.discordId);
      if (!correctPlayerId) {
        continue; // No player for this discordId
      }
      
      if (match.playerId !== correctPlayerId) {
        totalMismatches++;
        if (exampleMismatches.length < 5) {
          exampleMismatches.push({
            discordId: match.discordId,
            currentPlayerId: correctPlayerId,
            wrongPlayerId: match.playerId,
          });
        }
      } else {
        totalCorrect++;
      }
    }
    
    console.log(`[Check Match Player IDs] Found ${totalMismatches} mismatches out of ${allMatches.length} total matches`);
    
    return {
      totalMatches: allMatches.length,
      totalMismatches,
      totalCorrect,
      totalNoDiscordId,
      exampleMismatches,
    };
  },
});
