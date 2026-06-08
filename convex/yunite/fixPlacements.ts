"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";
import { yuniteFetch } from "../lib/yuniteRateLimit";

interface YuniteUser {
  index: number;
  discordId: string;
  epicId: string;
}

interface YuniteLeaderboardEntry {
  teamId?: string;
  users?: YuniteUser[];
  discordId?: string;
  epicName?: string;
  username?: string;
  displayName?: string;
  placement: number;
  kills?: number;
  eliminations?: number;
  points?: number;
  score?: number;
}

/**
 * Fix placements for Yunite imports in batches.
 * 
 * Processes 5 imports at a time to avoid timeout issues.
 * Call repeatedly until isComplete is true.
 */
export const fixPlacementsBatch = action({
  args: {
    startIndex: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    processed: number;
    fixed: number;
    failed: number;
    resultsUpdated: number;
    eventResultsUpdated: number;
    nextIndex: number | null;
    isComplete: boolean;
    totalImports: number;
    errors: Array<{ importName: string; error: string }>;
  }> => {
    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }
    
    await requireAdminAction(ctx);

    const BATCH_SIZE = 5;
    const startIndex = args.startIndex ?? 0;
    
    console.log(`🔧 Starting placement fix batch from index ${startIndex}...`);
    
    // Get all Yunite imports
    const allImports = await ctx.runQuery(api.yunite.fixPlacementsHelpers.getAllYuniteImports, {});
    
    const totalImports = allImports.length;
    console.log(`📦 Total imports: ${totalImports}, starting at index ${startIndex}`);
    
    if (startIndex >= totalImports) {
      return {
        success: true,
        processed: 0,
        fixed: 0,
        failed: 0,
        resultsUpdated: 0,
        eventResultsUpdated: 0,
        nextIndex: null,
        isComplete: true,
        totalImports,
        errors: [],
      };
    }
    
    // Get batch to process
    const endIndex = Math.min(startIndex + BATCH_SIZE, totalImports);
    const batchImports = allImports.slice(startIndex, endIndex);
    
    let processed = 0;
    let fixed = 0;
    let failed = 0;
    let totalResultsUpdated = 0;
    let totalEventResultsUpdated = 0;
    const errors: Array<{ importName: string; error: string }> = [];
    
    for (let i = 0; i < batchImports.length; i++) {
      const importRecord = batchImports[i];
      const globalIndex = startIndex + i;
      processed++;
      
      const tournamentId = importRecord.leaderboardId.replace("yunite-", "");
      
      console.log(`\n[${globalIndex + 1}/${totalImports}] Processing: ${importRecord.eventName}`);
      
      try {
        const leaderboardUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/leaderboard`;
        const response = await yuniteFetch(leaderboardUrl, yuniteApiKey);
        
        if (response.status === 429) {
          console.error(`  ❌ Rate limited after retries`);
          errors.push({ importName: importRecord.eventName, error: "Rate limited" });
          failed++;
          continue;
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`  ❌ API error: ${response.status}`);
          errors.push({ importName: importRecord.eventName, error: `API ${response.status}` });
          failed++;
          continue;
        }
        
        const leaderboard: YuniteLeaderboardEntry[] = await response.json();
        console.log(`  ✓ Fetched ${leaderboard.length} entries`);
        
        // Build Discord ID -> rank and points maps
        const discordIdToRank = new Map<string, number>();
        const discordIdToPoints = new Map<string, number>();
        
        for (let idx = 0; idx < leaderboard.length; idx++) {
          const entry = leaderboard[idx];
          const correctRank = idx + 1;
          const points = entry.points ?? entry.score ?? 0;
          
          if (entry.users && entry.users.length > 0) {
            for (const user of entry.users) {
              if (user.discordId) {
                discordIdToRank.set(user.discordId, correctRank);
                discordIdToPoints.set(user.discordId, points);
              }
            }
          } else if (entry.discordId) {
            discordIdToRank.set(entry.discordId, correctRank);
            discordIdToPoints.set(entry.discordId, points);
          }
        }
        
        // Update placements and points
        const resultsUpdated = await ctx.runMutation(
          api.yunite.fixPlacementsHelpers.updateResultPlacements,
          { 
            importId: importRecord._id, 
            discordIdToRank: Object.fromEntries(discordIdToRank),
            discordIdToPoints: Object.fromEntries(discordIdToPoints),
          }
        );
        
        const eventResultsUpdated = await ctx.runMutation(
          api.yunite.fixPlacementsHelpers.updateEventResultPlacements,
          { 
            importId: importRecord._id, 
            discordIdToRank: Object.fromEntries(discordIdToRank),
            discordIdToPoints: Object.fromEntries(discordIdToPoints),
          }
        );
        
        totalResultsUpdated += resultsUpdated;
        totalEventResultsUpdated += eventResultsUpdated;
        
        if (resultsUpdated > 0 || eventResultsUpdated > 0) {
          fixed++;
          console.log(`  ✅ Fixed: ${resultsUpdated} results, ${eventResultsUpdated} events`);
        } else {
          console.log(`  ℹ️ No updates needed`);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ Error: ${errorMessage}`);
        errors.push({ importName: importRecord.eventName, error: errorMessage });
        failed++;
      }
    }
    
    const nextIndex = endIndex < totalImports ? endIndex : null;
    const isComplete = nextIndex === null;
    
    console.log(`\n=== Batch Complete ===`);
    console.log(`Processed: ${processed}, Fixed: ${fixed}, Failed: ${failed}`);
    console.log(`Next index: ${nextIndex ?? "DONE"}`);
    
    return {
      success: true,
      processed,
      fixed,
      failed,
      resultsUpdated: totalResultsUpdated,
      eventResultsUpdated: totalEventResultsUpdated,
      nextIndex,
      isComplete,
      totalImports,
      errors,
    };
  },
});
