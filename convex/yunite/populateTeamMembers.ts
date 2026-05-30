"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";

interface LeaderboardUser {
  discordId: string;
  epicId: string;
}

interface LeaderboardEntry {
  users?: LeaderboardUser[];
  placement: number;
}

/**
 * Fetch with retry + exponential backoff for transient Yunite API errors (524 timeout, 429 rate limit).
 */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers });

    if (res.ok) return res;

    const isRetryable = res.status === 524 || res.status === 429 || res.status >= 500;
    if (!isRetryable || attempt === maxRetries) {
      throw new Error(`Yunite API error: ${res.status}`);
    }

    // Exponential back-off: 5s, 15s, 45s
    const delay = 5000 * Math.pow(3, attempt);
    console.log(`  ⏳ Retry ${attempt + 1}/${maxRetries} after ${delay / 1000}s (status ${res.status})`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  // Should not reach here, but satisfy TS
  throw new Error("Max retries exceeded");
}

export const populateForImport = action({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args): Promise<{ success: boolean; updated: number }> => {
    const apiKey = process.env.YUNITE_API_KEY;
    const guildId = process.env.YUNITE_GUILD_ID;
    
    if (!apiKey || !guildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }
    
    const imp = await ctx.runQuery(api.thirdParty.getImportById, { importId: args.importId });
    if (!imp) throw new Error("Import not found");
    
    const tournamentId = imp.leaderboardId.replace("yunite-", "");
    const url = `https://yunite.xyz/api/v3/guild/${guildId}/tournaments/${tournamentId}/leaderboard`;
    
    const res = await fetchWithRetry(url, { "Y-Api-Token": apiKey });
    
    const data: LeaderboardEntry[] = await res.json();
    const players = await ctx.runQuery(api.players.getPlayers);
    
    let updated = 0;
    
    for (const entry of data) {
      if (!entry.users || entry.users.length === 0) continue;
      
      const epics: string[] = [];
      for (const u of entry.users) {
        const p = players.find((pl: { discordUserId: string; epicUsername: string }) => pl.discordUserId === u.discordId);
        if (p) epics.push(p.epicUsername);
      }
      
      for (const u of entry.users) {
        const r = await ctx.runQuery(api.yunite.findResultByDiscordId, {
          importId: args.importId,
          discordId: u.discordId,
        });
        
        if (r) {
          await ctx.runMutation(api.yunite.updateResultTeamMembers, {
            resultId: r._id,
            teamMembers: epics,
          });
          updated++;
        }
      }
    }
    
    return { success: true, updated };
  },
});

export const populateAllImports = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    totalImports: number;
    successCount: number;
    failureCount: number;
    totalUpdated: number;
    failedImports: string[];
  }> => {
    console.log("🔄 Starting to populate team members for all Yunite imports...");
    
    const imports = await ctx.runQuery(api.yuniteQueries.getAllYuniteTournaments);
    console.log(`Found ${imports.length} Yunite imports`);
    
    let totalUpdated = 0;
    let successCount = 0;
    let failureCount = 0;
    const failedImports: string[] = [];
    
    for (let i = 0; i < imports.length; i++) {
      const imp = imports[i];
      console.log(`[${i + 1}/${imports.length}] ${imp.eventName}`);
      
      try {
        const result = await ctx.runAction(api.yunite.populateTeamMembers.populateForImport, {
          importId: imp._id,
        });
        
        totalUpdated += result.updated;
        successCount++;
        console.log(`  ✓ Updated ${result.updated} records`);
        
        // Rate limit delay
        if (i < imports.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`  ❌ Failed:`, error);
        failureCount++;
        failedImports.push(imp.eventName);
      }
    }
    
    console.log(`\n✅ Completed!`);
    console.log(`   Total: ${imports.length}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failureCount}`);
    console.log(`   Records updated: ${totalUpdated}`);
    
    if (failedImports.length > 0) {
      console.log(`   Failed imports:`, failedImports);
    }
    
    return {
      success: true,
      totalImports: imports.length,
      successCount,
      failureCount,
      totalUpdated,
      failedImports,
    };
  },
});
