"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { v } from "convex/values";
import { requireAdminAction } from "./auth_helpers";

interface BackfillResult {
  processed: number;
  skipped: number;
  errors: number;
  total: number;
  remaining: number;
  alreadySynced: number;
}

/**
 * Reset sync flags for all Yunite imports (for force resync)
 */
export const resetAllSyncFlags = action({
  args: {},
  handler: async (ctx): Promise<{ resetCount: number }> => {
    await requireAdminAction(ctx);

    const allImports = (await ctx.runQuery(
      api.thirdPartyQueries.getAllImports,
    )) as Doc<"thirdPartyImports">[];
    const yuniteImports = allImports.filter((imp) => imp.source === "Yunite");
    
    let resetCount = 0;
    for (const imp of yuniteImports) {
      if (imp.matchDataSynced) {
        await ctx.runMutation(api.thirdPartyMutations.resetMatchDataSyncFlag, {
          importId: imp._id,
        });
        resetCount++;
      }
    }
    
    return { resetCount };
  },
});

/**
 * Check match data statistics - how many players have match data vs event results
 */
export const checkMatchDataStats = action({
  args: {},
  handler: async (ctx): Promise<{
    totalPlayers: number;
    playersWithEventResults: number;
    playersWithMatchData: number;
    playersMissingMatchData: number;
    missingDataPlayers: string[];
  }> => {
    await requireAdminAction(ctx);

    // Get all players with match data (from matchPlayerStats table)
    const allMatchStats = await ctx.runQuery(
      internal.yuniteQueries.getAllMatchPlayerStatsInternal,
    );
    const playersWithMatchDataSet = new Set(allMatchStats.map((stat: typeof allMatchStats[number]) => stat.playerId));
    
    const allPlayers = await ctx.runQuery(api.players.getPlayers);
    
    let playersWithEventResults = 0;
    let playersWithMatchData = 0;
    let playersMissingMatchData = 0;
    const missingDataPlayers: string[] = [];
    
    for (const player of allPlayers) {
      // Count event results for this player
      const eventResultsCount = await ctx.runQuery(api.events.results.countPlayerResults, {
        playerId: player._id,
      });
      
      if (eventResultsCount > 0) {
        playersWithEventResults++;
        
        // Check if player has match data
        if (!playersWithMatchDataSet.has(player._id)) {
          playersMissingMatchData++;
          missingDataPlayers.push(`${player.discordUsername} (${eventResultsCount} events)`);
        } else {
          playersWithMatchData++;
        }
      }
    }
    
    return {
      totalPlayers: allPlayers.length,
      playersWithEventResults,
      playersWithMatchData,
      playersMissingMatchData,
      missingDataPlayers: missingDataPlayers.slice(0, 10), // First 10 only
    };
  },
});

/**
 * Backfill match player stats for imports that haven't been synced yet
 * Processes up to 5 imports at a time to avoid timeouts
 */
export const backfillAllMatchStats = action({
  args: {
    forceResync: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BackfillResult> => {
    await requireAdminAction(ctx);

    const FORCE_RESYNC = args.forceResync || false;
    console.log(`🔄 [BACKFILL] Starting match stats backfill... ${FORCE_RESYNC ? '(FORCE RESYNC)' : ''}`);
    console.log(`🔄 [BACKFILL] Timestamp: ${new Date().toISOString()}`);
    
    try {
      // Get all third-party imports
      const allImports: Array<{
        _id: Id<"thirdPartyImports">;
        source: string;
        eventName: string;
        leaderboardId?: string;
        matchDataSynced?: boolean;
      }> = await ctx.runQuery(api.thirdPartyQueries.getAllImports);
      
      console.log(`📦 [BACKFILL] Found ${allImports.length} total imports`);
      
      // Filter to only Yunite imports
      const yuniteImports = allImports.filter((imp: typeof allImports[number]) => imp.source === "Yunite");
      console.log(`📦 [BACKFILL] ${yuniteImports.length} Yunite imports`);
      
      // Always only process unsynced imports (force resync just resets the flag)
      const unsynced = yuniteImports.filter(imp => !imp.matchDataSynced);
      const alreadySynced = yuniteImports.filter(imp => imp.matchDataSynced).length;
      
      console.log(`📦 [BACKFILL] ${unsynced.length} need syncing`);
      console.log(`📦 [BACKFILL] ${alreadySynced} already synced`);
      console.log(`📦 [BACKFILL] Force resync: ${FORCE_RESYNC}`);
      
      // If nothing to process, return early
      if (unsynced.length === 0) {
        console.log(`✅ [BACKFILL] Nothing to process`);
        return {
          processed: 0,
          skipped: 0,
          errors: 0,
          total: allImports.length,
          remaining: 0,
          alreadySynced,
        };
      }
      
      // Smaller batch size to avoid timeouts (each import can take 10-20 seconds)
      const BATCH_SIZE = 3;
      const toProcess = unsynced.slice(0, BATCH_SIZE);
      const remaining = Math.max(0, unsynced.length - BATCH_SIZE);
      
      console.log(`📊 [BACKFILL] Processing batch of ${toProcess.length} imports (${remaining} will remain)`);
      
      let processedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      // Process each import
      for (let i = 0; i < toProcess.length; i++) {
        const importRecord = toProcess[i];
        
        try {
          console.log(`\n[${i + 1}/${toProcess.length}] 📊 [BACKFILL] Processing: ${importRecord.eventName}`);
          console.log(`   [BACKFILL] Import ID: ${importRecord._id}`);
          console.log(`   [BACKFILL] Already synced: ${importRecord.matchDataSynced}`);
          
          // Fetch and store match data for this import
          const result = await ctx.runAction(api.yunite.sync.syncTournamentMatchData, {
            importId: importRecord._id,
          });
          
          console.log(`   [BACKFILL] Sync result:`, result);
          
          processedCount++;
          console.log(`✅ [BACKFILL] Completed ${processedCount}/${toProcess.length}`);
          
          // Add delay between imports to respect rate limits (1 second - optimized)
          if (i < toProcess.length - 1) {
            console.log(`⏸️  [BACKFILL] Waiting 1s before next import...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error) {
          errorCount++;
          console.error(`❌ [BACKFILL] Error processing import ${importRecord._id}:`);
          console.error(`   [BACKFILL] Error:`, error);
          
          // Check if it's a rate limit error
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("429") || errorMessage.includes("rate")) {
            console.log(`⚠️  [BACKFILL] Rate limited - waiting 10s before continuing...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          } else {
            // For other errors, wait a bit then continue
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      console.log(`\n🎉 [BACKFILL] Batch complete!`);
      console.log(`   [BACKFILL] Processed: ${processedCount}`);
      console.log(`   [BACKFILL] Errors: ${errorCount}`);
      console.log(`   [BACKFILL] Remaining: ${remaining}`);
      
      return {
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount,
        total: allImports.length,
        remaining,
        alreadySynced,
      };
    } catch (error) {
      console.error(`❌ [BACKFILL] Fatal error in backfill action:`, error);
      throw error;
    }
  },
});
