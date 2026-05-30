import { mutation } from "./_generated/server";

/**
 * One-time migration: Set hasMatchData flag for all players who already have match stats
 * Run this once to backfill the flag for existing data
 */
export const backfillHasMatchDataFlag = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all match stats
    const allMatchStats = await ctx.db.query("matchPlayerStats").collect();
    
    // Get unique player IDs
    const playerIdsWithMatchData = new Set(allMatchStats.map(stat => stat.playerId));
    
    console.log(`Found ${playerIdsWithMatchData.size} players with match data`);
    
    let updated = 0;
    let skipped = 0;
    
    // Update each player (only if they exist)
    for (const playerId of playerIdsWithMatchData) {
      // Check if player exists before trying to patch
      const player = await ctx.db.get(playerId);
      
      if (player) {
        await ctx.db.patch(playerId, {
          hasMatchData: true,
        });
        updated++;
      } else {
        // Player doesn't exist - skip this orphaned record
        skipped++;
      }
    }
    
    console.log(`Updated ${updated} players with hasMatchData flag`);
    console.log(`Skipped ${skipped} orphaned match stat records (player no longer exists)`);
    
    return {
      totalPlayerIds: playerIdsWithMatchData.size,
      updated,
      skipped,
    };
  },
});

/**
 * Fix data inconsistency: Clear hasMatchData flag for players who don't have matchPlayerStats
 * This fixes the TC recalculation error where players are flagged but have no actual match data
 */
export const fixHasMatchDataInconsistency = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all players with hasMatchData flag
    const allPlayers = await ctx.db.query("players").collect();
    const playersWithFlag = allPlayers.filter(p => p.hasMatchData === true);
    
    console.log(`Checking ${playersWithFlag.length} players with hasMatchData flag`);
    
    let fixed = 0;
    let correct = 0;
    const fixedPlayers: string[] = [];
    
    for (const player of playersWithFlag) {
      // Check if they actually have match stats
      const matchStats = await ctx.db
        .query("matchPlayerStats")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .take(1);
      
      if (matchStats.length === 0) {
        // Player has flag but no stats - clear the flag
        await ctx.db.patch(player._id, {
          hasMatchData: false,
        });
        fixed++;
        fixedPlayers.push(player.discordUsername);
        console.log(`Fixed ${player.discordUsername} - cleared hasMatchData flag (no match stats found)`);
      } else {
        correct++;
      }
    }
    
    console.log(`Fixed ${fixed} players, ${correct} were already correct`);
    
    return {
      totalChecked: playersWithFlag.length,
      fixed,
      correct,
      fixedPlayers,
    };
  },
});
