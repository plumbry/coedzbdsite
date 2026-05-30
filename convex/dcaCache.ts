import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel.d.ts";

// Helper function to calculate DCA (Duo Carry Adjustment)
// DCA measures how much worse a player performs without their consistent duo
// If player performs worse without duo (being carried) → DCA < 1.00 (penalty)
// If player performs better without duo (independent) → DCA > 1.00 (boost)
const calculateDCA = (
  kdWithDuo: number,
  kdWithoutDuo: number,
  elimsWithDuo: number,
  elimsWithoutDuo: number,
  placementWithDuo: number,
  placementWithoutDuo: number
): number => {
  // Calculate the raw adjustment value (inverted so worse without duo = negative)
  const rawAdjustment = 
    (kdWithoutDuo - kdWithDuo) * 0.25 +
    (elimsWithoutDuo - elimsWithDuo) * 0.08 +
    (placementWithDuo - placementWithoutDuo) * 0.005;
  
  // Clamp between -0.25 and +0.25
  const clampedAdjustment = Math.max(-0.25, Math.min(0.25, rawAdjustment));
  
  // Return DCA as 1 + adjustment
  return 1 + clampedAdjustment;
};

// Helper to check if Discord ID is valid (not placeholder or imported)
const isValidDiscordId = (id: string | undefined): boolean => {
  if (!id || id === "") return false;
  if (id === "imported") return false;
  if (id.startsWith("placeholder_")) return false;
  return true;
};

// Internal mutation to calculate and cache DCA for a single player
export const cacheDCAForPlayer = internalMutation({
  args: { 
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      return { success: false, playerId: args.playerId };
    }
    
    const result = await computeAndStoreDCA(ctx, player);
    return result;
  },
});

// Internal mutation to apply mutual dependency correction
export const applyMutualDependencyCorrection = internalMutation({
  args: {
    playerIds: v.array(v.id("players")),
  },
  handler: async (ctx, args) => {
    const players = await Promise.all(
      args.playerIds.map(id => ctx.db.get(id))
    );
    
    let correctionCount = 0;
    
    for (const player of players) {
      if (!player || !player.dcaCache || !player.dcaCache.consistentDuoEpic) continue;
      
      // Find the duo partner
      const duoPlayer = players.find(p => p?.epicUsername === player.dcaCache?.consistentDuoEpic);
      if (!duoPlayer || !duoPlayer.dcaCache) continue;
      
      // Check if duo also considers this player as their consistent duo
      if (duoPlayer.dcaCache.consistentDuoEpic === player.epicUsername) {
        const dcaDiff = Math.abs(player.dcaCache.dca - duoPlayer.dcaCache.dca);
        
        // If DCA difference < 0.10, apply mutual dependency correction
        if (dcaDiff < 0.10) {
          // Reduce both players' DCA penalties by 50%
          const adjustedPlayerDCA = 1.00 + ((player.dcaCache.dca - 1.00) * 0.5);
          const adjustedDuoDCA = 1.00 + ((duoPlayer.dcaCache.dca - 1.00) * 0.5);
          
          // Update both players
          await ctx.db.patch(player._id, {
            dcaCache: {
              ...player.dcaCache,
              dca: adjustedPlayerDCA,
              hasMutualDependency: true,
              lastUpdated: Date.now(),
            },
          });
          
          await ctx.db.patch(duoPlayer._id, {
            dcaCache: {
              ...duoPlayer.dcaCache,
              dca: adjustedDuoDCA,
              hasMutualDependency: true,
              lastUpdated: Date.now(),
            },
          });
          
          correctionCount += 2;
        }
      }
    }
    
    return { correctionCount };
  },
});

// Admin mutation to rebuild DCA cache for all active players (batch processing with progress)
export const rebuildDCACache = mutation({
  args: { forceRebuild: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ success: number; failed: number; remaining: number; total: number }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: 0, failed: 0, remaining: 0, total: 0 };
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      return { success: 0, failed: 0, remaining: 0, total: 0 };
    }
    
    const forceRebuild = args.forceRebuild ?? false;
    
    // Get all players once — avoid querying the full table multiple times
    const allPlayers = await ctx.db.query("players").collect();
    const activePlayers = allPlayers.filter(p => 
      (p.status === "active" || p.status === undefined) && 
      isValidDiscordId(p.discordUserId) &&
      p.hasMatchData === true
    );
    
    // When force rebuilding, skip players updated in the last hour to prevent loops
    const now = Date.now();
    const recentUpdateThreshold = now - (60 * 60 * 1000);
    
    const needsProcessing = (p: Doc<"players">) => {
      if (forceRebuild) {
        return !p.dcaCache || !p.dcaCache.lastUpdated || p.dcaCache.lastUpdated < recentUpdateThreshold;
      }
      return !p.dcaCache || !p.dcaCache.lastUpdated;
    };
    
    const player = activePlayers.find(needsProcessing);
    
    if (!player) {
      return {
        success: 0,
        failed: 0,
        remaining: 0,
        total: activePlayers.length,
      };
    }
    
    let success = 0;
    let failed = 0;
    
    try {
      const result = await computeAndStoreDCA(ctx, player);
      if (result.success) {
        success = 1;
      } else {
        failed = 1;
      }
    } catch (error) {
      console.error(`[DCA Cache] Error processing player ${player.epicUsername}:`, error);
      failed = 1;
    }
    
    // Count remaining using the already-loaded players list minus the one we just processed
    // We subtract 1 for the player we just processed (success or fail)
    const remainingBeforeProcessing = activePlayers.filter(needsProcessing).length;
    const remaining = Math.max(0, remainingBeforeProcessing - 1);
    
    return {
      success,
      failed,
      remaining,
      total: activePlayers.length,
    };
  },
});

/**
 * Compute DCA for a single player and store it.
 * Optimized to minimize document reads by batching queries per import.
 */
async function computeAndStoreDCA(
  ctx: MutationCtx,
  player: Doc<"players">
): Promise<{ success: boolean; playerId: Id<"players">; epicUsername: string; dca: number; consistentDuoEpic: string | null }> {
  const playerId = player._id;
  
  // 1. Fetch all match data for this player (1 indexed query)
  const playerMatches = await ctx.db
    .query("matchPlayerStats")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  
  // Skip players with no match data but still mark as processed
  if (playerMatches.length === 0) {
    await ctx.db.patch(playerId, {
      dcaCache: {
        dca: 1.00,
        consistentDuoEpic: null,
        performanceRatio: null,
        withoutDuoCount: 0,
        hasMutualDependency: false,
        lastUpdated: Date.now(),
      },
    });
    return { success: true, playerId, epicUsername: player.epicUsername, dca: 1.00, consistentDuoEpic: null };
  }
  
  // 2. Collect unique importIds from this player's matches
  const importIds = [...new Set(playerMatches.map(m => m.importId))];
  
  // 3. Pre-fetch ALL matchPlayerStats for those imports in bulk (1 query per import, not per match)
  //    Key: "importId:sessionId" → array of stats entries
  const matchStatsLookup = new Map<string, Array<{ playerId: Id<"players">; teamId?: string }>>();
  
  for (const importId of importIds) {
    const importStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_match", (q) => q.eq("importId", importId))
      .collect();
    for (const stat of importStats) {
      const key = `${String(stat.importId)}:${stat.sessionId}`;
      const existing = matchStatsLookup.get(key);
      if (existing) {
        existing.push({ playerId: stat.playerId, teamId: stat.teamId });
      } else {
        matchStatsLookup.set(key, [{ playerId: stat.playerId, teamId: stat.teamId }]);
      }
    }
  }
  
  // 4. Collect all unique teammate playerIds so we can batch-fetch their names
  const teammatePlayerIds = new Set<Id<"players">>();
  for (const match of playerMatches) {
    const key = `${String(match.importId)}:${match.sessionId}`;
    const entries = matchStatsLookup.get(key) || [];
    for (const entry of entries) {
      if (entry.playerId !== playerId && entry.teamId === match.teamId) {
        teammatePlayerIds.add(entry.playerId);
      }
    }
  }
  
  // 5. Batch-fetch teammate player docs for epicUsername (1 get per unique teammate)
  const playerNameMap = new Map<Id<"players">, string>();
  for (const pid of teammatePlayerIds) {
    const p = await ctx.db.get(pid);
    if (p) {
      playerNameMap.set(pid, p.epicUsername);
    }
  }
  
  // 6. Count teammates from in-memory data (no more per-match queries)
  const teammateCount = new Map<Id<"players">, { count: number; lastMatchTime: number; epicUsername: string }>();
  
  for (const match of playerMatches) {
    const key = `${String(match.importId)}:${match.sessionId}`;
    const entries = matchStatsLookup.get(key) || [];
    
    for (const entry of entries) {
      if (entry.playerId !== playerId && entry.teamId === match.teamId) {
        const epicUsername = playerNameMap.get(entry.playerId);
        if (!epicUsername) continue;
        
        const current = teammateCount.get(entry.playerId) || { count: 0, lastMatchTime: 0, epicUsername };
        teammateCount.set(entry.playerId, {
          count: current.count + 1,
          lastMatchTime: Math.max(current.lastMatchTime, match._creationTime),
          epicUsername,
        });
      }
    }
  }
  
  // 7. Find most consistent duo
  let maxCount = 0;
  let maxLastMatchTime = 0;
  let consistentDuoPlayerId: Id<"players"> | null = null;
  let consistentDuoEpic: string | null = null;
  
  for (const [pid, data] of teammateCount.entries()) {
    if (data.count > maxCount || (data.count === maxCount && data.lastMatchTime > maxLastMatchTime)) {
      maxCount = data.count;
      maxLastMatchTime = data.lastMatchTime;
      consistentDuoPlayerId = pid;
      consistentDuoEpic = data.epicUsername;
    }
  }
  
  let dca = 1.00;
  let performanceRatio: number | null = null;
  let withoutDuoCount = 0;
  
  if (consistentDuoPlayerId && consistentDuoEpic && playerMatches.length >= 5) {
    // Split matches into "with duo" and "without duo" using in-memory lookup
    type MatchDoc = typeof playerMatches[number];
    const withDuoMatches: MatchDoc[] = [];
    const withoutDuoMatches: MatchDoc[] = [];
    
    for (const match of playerMatches) {
      const key = `${String(match.importId)}:${match.sessionId}`;
      const entries = matchStatsLookup.get(key) || [];
      const duoPresent = entries.some(e => e.playerId === consistentDuoPlayerId && e.teamId === match.teamId);
      
      if (duoPresent) {
        withDuoMatches.push(match);
      } else {
        withoutDuoMatches.push(match);
      }
    }
    
    withoutDuoCount = withoutDuoMatches.length;
    
    // Calculate stats for both groups
    const calculateGroupStats = (matches: MatchDoc[]) => {
      if (matches.length === 0) return null;
      
      const totalKills = matches.reduce((sum, m) => sum + m.eliminations, 0);
      const totalDeaths = matches.reduce((sum, m) => sum + m.deaths, 0);
      const avgKD = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
      const avgElims = totalKills / matches.length;
      const avgPlacement = matches.reduce((sum, m) => sum + m.placement, 0) / matches.length;
      
      return { avgKD, avgElims, avgPlacement };
    };
    
    const withDuoStats = calculateGroupStats(withDuoMatches);
    const withoutDuoStats = calculateGroupStats(withoutDuoMatches);
    
    if (withDuoStats && withoutDuoStats) {
      const rawDCA = calculateDCA(
        withDuoStats.avgKD,
        withoutDuoStats.avgKD,
        withDuoStats.avgElims,
        withoutDuoStats.avgElims,
        withDuoStats.avgPlacement,
        withoutDuoStats.avgPlacement
      );
      
      // Apply confidence weighting
      const filteredCount = withoutDuoMatches.length;
      let confidenceWeight = 1.0;
      if (filteredCount >= 3) {
        confidenceWeight = 1.0;
      } else if (filteredCount === 2) {
        confidenceWeight = 0.6;
      } else if (filteredCount === 1) {
        confidenceWeight = 0.3;
      } else {
        confidenceWeight = 0.0;
      }
      
      // Apply sample size balancing
      const sampleSizeRatio = Math.min(withDuoMatches.length, withoutDuoMatches.length) / 
                              Math.max(withDuoMatches.length, withoutDuoMatches.length);
      const balancingFactor = 0.5 + (sampleSizeRatio * 0.5);
      
      const dcaAdjustment = rawDCA - 1.0;
      dca = 1.0 + (dcaAdjustment * confidenceWeight * balancingFactor);
      
      // Legacy performance ratio for display
      const kdDropRatio = withoutDuoStats.avgKD / withDuoStats.avgKD;
      const elimsDropRatio = withoutDuoStats.avgElims / withDuoStats.avgElims;
      const placementDropRatio = withDuoStats.avgPlacement / withoutDuoStats.avgPlacement;
      performanceRatio = (kdDropRatio + elimsDropRatio + placementDropRatio) / 3;
    }
  }
  
  // Store in database
  await ctx.db.patch(playerId, {
    dcaCache: {
      dca,
      consistentDuoEpic,
      performanceRatio,
      withoutDuoCount,
      hasMutualDependency: false,
      lastUpdated: Date.now(),
    },
  });
  
  return { success: true, playerId, epicUsername: player.epicUsername, dca, consistentDuoEpic };
}

// Query to get DCA cache status
export const getDCACacheStatus = query({
  args: {},
  handler: async (ctx) => {
    const allPlayers = await ctx.db.query("players").collect();
    const activePlayers = allPlayers.filter(p => 
      (p.status === "active" || p.status === undefined) && 
      isValidDiscordId(p.discordUserId) &&
      p.hasMatchData === true
    );
    
    const totalPlayers = activePlayers.length;
    const cachedPlayers = activePlayers.filter(p => p.dcaCache !== undefined).length;
    
    // Check for stale cache (older than 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const stalePlayers = activePlayers.filter(p => 
      p.dcaCache === undefined || p.dcaCache.lastUpdated < sevenDaysAgo
    ).length;
    
    return {
      totalPlayers,
      cachedPlayers,
      stalePlayers,
      cachePercentage: totalPlayers > 0 ? Math.round((cachedPlayers / totalPlayers) * 100) : 0,
    };
  },
});
