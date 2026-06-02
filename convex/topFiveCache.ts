import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { internal } from "./_generated/api";
import { filterVisibleMembers } from "./helpers/playerAlt";

// Helper function to calculate top-5 data for a single player
async function calculatePlayerTopFiveData(
  ctx: QueryCtx | MutationCtx,
  playerId: Id<"players">
): Promise<{
  recentTop5Count: number;
  recentTop4Count: number;
  recentTop3Count: number;
  hasRecentActivity: boolean;
  mostRecentEventTime: number;
  consistentTeammateName?: string;
  recentTop5WithTeammate: number;
} | null> {
  const player = await ctx.db.get(playerId);
  if (!player) {
    return null;
  }
  
  // Get all third party results for this player
  const playerResults = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  
  // Step 1: Get ALL player results with import and event data
  const allResultsPromises = playerResults.map(async (result) => {
    const importData = await ctx.db.get(result.importId);
    if (!importData || !importData.eventDate) {
      return null;
    }
    
    // Get linked Event to determine type
    let eventType: string | null = null;
    let eventId: string | null = null;
    if (importData.eventId) {
      const event = await ctx.db.get(importData.eventId);
      if (event) {
        eventType = event.type;
        eventId = importData.eventId;
      }
    }
    
    return { 
      result, 
      importId: result.importId, 
      placement: result.placement,
      eventDate: importData.eventDate,
      creationTime: importData._creationTime,
      eventType,
      eventId,
    };
  });
  
  const allResultsWithData = await Promise.all(allResultsPromises);
  const validResults = allResultsWithData.filter((r) => r !== null);
  
  // Step 2: Sort by event date (most recent first)
  // Fall back to creation time if event date is not available
  const sortedResults = validResults.sort((a, b) => {
    const dateA = a.eventDate ? new Date(a.eventDate).getTime() : a.creationTime;
    const dateB = b.eventDate ? new Date(b.eventDate).getTime() : b.creationTime;
    return dateB - dateA;
  });
  
  // Check if player has played within the last 8 weeks
  const eightWeeksAgo = Date.now() - (8 * 7 * 24 * 60 * 60 * 1000);
  const mostRecentEventTime = sortedResults.length > 0 
    ? (sortedResults[0].eventDate ? new Date(sortedResults[0].eventDate).getTime() : sortedResults[0].creationTime)
    : 0;
  const hasRecentActivity = mostRecentEventTime >= eightWeeksAgo;
  
  // Step 3: Build list of last 5 events/leaderboards
  let recentTop5Count = 0;
  let recentTop4Count = 0;
  let recentTop3Count = 0;
  
  if (!hasRecentActivity) {
    // Player hasn't played in 8 weeks, don't show badges
    return {
      recentTop5Count: 0,
      recentTop4Count: 0,
      recentTop3Count: 0,
      hasRecentActivity: false,
      mostRecentEventTime,
      consistentTeammateName: undefined,
      recentTop5WithTeammate: 0,
    };
  }
  
  // Player has recent activity, calculate from their last 5 events (from entire history)
  // Simplified version: use best weekly placement for cumulative events to avoid expensive queries
  const last5Items: Array<{ key: string; placement: number; eventType: string | null }> = [];
  const seenKeys = new Set<string>();
  
  for (const item of sortedResults) {
    // For random/mini-season: group by eventId (cumulative), use best placement
    // For others: treat each leaderboard separately
    const isRandomOrMiniSeason = item.eventType === "random" || item.eventType === "mini-season" || item.eventType === "random-squads";
    const key = isRandomOrMiniSeason && item.eventId ? item.eventId : item.importId;
    
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      
      // For cumulative events, use best weekly placement as approximation
      // This is faster than querying cumulative leaderboards and good enough for badges
      let placement: number;
      if (isRandomOrMiniSeason && item.eventId) {
        const eventResults = validResults.filter(r => r.eventId === item.eventId);
        placement = Math.min(...eventResults.map(r => r.placement));
      } else {
        placement = item.placement;
      }
      
      last5Items.push({ key, placement, eventType: item.eventType });
      
      if (last5Items.length >= 5) {
        break;
      }
    }
  }
  
  // Step 4: From the last 5 events, count how many are top-5, top-4, and top-3
  // For random-squads, duos are paired into squads (2 duos = 1 squad)
  // So top 5 squads = placement 1-10, top 4 = 1-8, top 3 = 1-6
  recentTop5Count = last5Items.filter(item => {
    const multiplier = item.eventType === "random-squads" ? 2 : 1;
    return item.placement <= 5 * multiplier;
  }).length;
  recentTop4Count = last5Items.filter(item => {
    const multiplier = item.eventType === "random-squads" ? 2 : 1;
    return item.placement <= 4 * multiplier;
  }).length;
  recentTop3Count = last5Items.filter(item => {
    const multiplier = item.eventType === "random-squads" ? 2 : 1;
    return item.placement <= 3 * multiplier;
  }).length;
  
  // Step 5: Find consistent teammate and count top-5s with them
  // Build teammate frequency map with most recent event timestamp
  // IMPORTANT: Only count teammates from top-5 finishes
  const teammateCount = new Map<string, { count: number; name: string; lastEventTime: number }>();
  
  for (const item of last5Items) {
    // Only count teammates from top-5 finishes (top 10 duos for random-squads)
    const multiplier = item.eventType === "random-squads" ? 2 : 1;
    if (item.placement > 5 * multiplier) {
      continue;
    }
    
    // Get all results for this event
    const eventResults = validResults.filter(r => {
      const isRandomOrMiniSeason = r.eventType === "random" || r.eventType === "mini-season" || r.eventType === "random-squads";
      const key = isRandomOrMiniSeason && r.eventId ? r.eventId : r.importId;
      return key === item.key;
    });
    
    // Find the most recent result for event time
    const mostRecentResult = eventResults[0];
    if (!mostRecentResult) continue;
    
    const eventTime = mostRecentResult.eventDate ? new Date(mostRecentResult.eventDate).getTime() : mostRecentResult.creationTime;
    
    // Extract teammates based on data available
    const teammates: string[] = [];
    
    // Method 1: Use teamMembers array if available
    if (mostRecentResult.result.teamMembers && mostRecentResult.result.teamMembers.length > 0) {
      teammates.push(...mostRecentResult.result.teamMembers.filter(epic => epic !== player.epicUsername));
    }
    // Method 2: For Random events with duoAssignment, find teammates from same import + duo
    else if (mostRecentResult.result.duoAssignment && mostRecentResult.result.duoAssignment !== null) {
      // Find all results from this import with the same duoAssignment AND same teamId (same game)
      const sameImportResults = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", mostRecentResult.importId))
        .filter((q) => 
          q.and(
            q.eq(q.field("duoAssignment"), mostRecentResult.result.duoAssignment),
            q.eq(q.field("teamId"), mostRecentResult.result.teamId),
            q.neq(q.field("epicUsername"), player.epicUsername)
          )
        )
        .collect();
      
      teammates.push(...sameImportResults.map(r => r.epicUsername));
    }
    
    // Track each teammate
    for (const teammateEpic of teammates) {
      // Try to find teammate's display name
      const teammatePlayer = await ctx.db
        .query("players")
        .withIndex("by_epic_username", (q) => q.eq("epicUsername", teammateEpic))
        .first();
      
      const displayName = teammatePlayer?.nickname || teammatePlayer?.discordUsername || teammateEpic;
      const current = teammateCount.get(teammateEpic) || { count: 0, name: displayName, lastEventTime: 0 };
      teammateCount.set(teammateEpic, {
        count: current.count + 1,
        name: displayName,
        lastEventTime: Math.max(current.lastEventTime, eventTime),
      });
    }
  }
  
  // Find most consistent teammate (prefer higher count, then most recent if tied)
  let consistentTeammateEpic: string | null = null;
  let consistentTeammateName: string | null = null;
  let maxCount = 0;
  let maxLastEventTime = 0;
  
  // Get player's possible display names to exclude (used for auto-detect and fallback)
  const playerDisplayNames = [
    player.discordUsername,
    player.nickname,
    player.epicUsername
  ].filter(Boolean);
  
  // Auto-detect from match data
  for (const [epicUsername, data] of teammateCount.entries()) {
    // Skip if epicUsername matches player's epicUsername
    if (epicUsername === player.epicUsername) {
      continue;
    }
    
    // Skip if the display name matches any of the player's names
    if (playerDisplayNames.some(pName => pName && pName.toLowerCase() === data.name.toLowerCase())) {
      continue;
    }
    
    // Prefer higher count, or if tied, prefer most recent
    if (data.count > maxCount || (data.count === maxCount && data.lastEventTime > maxLastEventTime)) {
      maxCount = data.count;
      maxLastEventTime = data.lastEventTime;
      consistentTeammateEpic = epicUsername;
      consistentTeammateName = data.name;
    }
  }
  
  // If no consistent teammate found but we have teammates, use the most recent one
  if (!consistentTeammateEpic && teammateCount.size > 0) {
    let mostRecentTeammateEpic: string | null = null;
    let mostRecentTeammateName: string | null = null;
    let mostRecentTime = 0;
    
    for (const [epicUsername, data] of teammateCount.entries()) {
      // Skip if epicUsername matches player's epicUsername
      if (epicUsername === player.epicUsername) {
        continue;
      }
      
      // Skip if the display name matches any of the player's names
      if (playerDisplayNames.some(pName => pName && pName.toLowerCase() === data.name.toLowerCase())) {
        continue;
      }
      
      if (data.lastEventTime > mostRecentTime) {
        mostRecentTime = data.lastEventTime;
        mostRecentTeammateEpic = epicUsername;
        mostRecentTeammateName = data.name;
      }
    }
    
    if (mostRecentTeammateEpic) {
      consistentTeammateEpic = mostRecentTeammateEpic;
      consistentTeammateName = mostRecentTeammateName;
      maxCount = teammateCount.get(mostRecentTeammateEpic)?.count || 0;
    }
  }
  
  // Count how many of the last 5 top-5 events were with consistent teammate
  let recentTop5WithTeammate = 0;
  if (consistentTeammateEpic) {
    for (const item of last5Items) {
      const multiplier = item.eventType === "random-squads" ? 2 : 1;
      if (item.placement <= 5 * multiplier) {
        // Find results for this event key
        const eventResults = validResults.filter(r => {
          const isRandomOrMiniSeason = r.eventType === "random" || r.eventType === "mini-season" || r.eventType === "random-squads";
          const key = isRandomOrMiniSeason && r.eventId ? r.eventId : r.importId;
          return key === item.key;
        });
        
        // Check if any of these results had the consistent teammate
        let hasTeammate = false;
        
        for (const r of eventResults) {
          // Method 1: Check teamMembers array
          if (r.result.teamMembers && r.result.teamMembers.includes(consistentTeammateEpic)) {
            hasTeammate = true;
            break;
          }
          
          // Method 2: For Random events with duoAssignment, check if they're in same duo
          if (r.result.duoAssignment && r.result.duoAssignment !== null) {
            const sameImportResults = await ctx.db
              .query("thirdPartyResults")
              .withIndex("by_import", (q) => q.eq("importId", r.importId))
              .filter((q) => 
                q.and(
                  q.eq(q.field("duoAssignment"), r.result.duoAssignment),
                  q.eq(q.field("teamId"), r.result.teamId),
                  q.eq(q.field("epicUsername"), consistentTeammateEpic)
                )
              )
              .first();
            
            if (sameImportResults) {
              hasTeammate = true;
              break;
            }
          }
        }
        
        if (hasTeammate) {
          recentTop5WithTeammate++;
        }
      }
    }
  }
  
  return {
    recentTop5Count,
    recentTop4Count,
    recentTop3Count,
    hasRecentActivity,
    mostRecentEventTime,
    consistentTeammateName: consistentTeammateName || undefined,
    recentTop5WithTeammate,
  };
}

// Mutation to update top-5 cache for a single player
export const updatePlayerTopFiveCache = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const topFiveData = await calculatePlayerTopFiveData(ctx, args.playerId);
    
    if (!topFiveData) {
      return { success: false };
    }
    
    await ctx.db.patch(args.playerId, {
      topFiveCache: {
        recentTop5Count: topFiveData.recentTop5Count,
        recentTop4Count: topFiveData.recentTop4Count,
        recentTop3Count: topFiveData.recentTop3Count,
        hasRecentActivity: topFiveData.hasRecentActivity,
        mostRecentEventTime: topFiveData.mostRecentEventTime,
        consistentTeammateName: topFiveData.consistentTeammateName,
        recentTop5WithTeammate: topFiveData.recentTop5WithTeammate,
        lastUpdated: Date.now(),
      }
    });
    
    return { success: true };
  },
});

// Internal mutation to update cache for a single player
export const updateSinglePlayerCache = internalMutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const topFiveData = await calculatePlayerTopFiveData(ctx, args.playerId);
    
    if (topFiveData) {
      await ctx.db.patch(args.playerId, {
        topFiveCache: {
          recentTop5Count: topFiveData.recentTop5Count,
          recentTop4Count: topFiveData.recentTop4Count,
          recentTop3Count: topFiveData.recentTop3Count,
          hasRecentActivity: topFiveData.hasRecentActivity,
          mostRecentEventTime: topFiveData.mostRecentEventTime,
          consistentTeammateName: topFiveData.consistentTeammateName,
          recentTop5WithTeammate: topFiveData.recentTop5WithTeammate,
          lastUpdated: Date.now(),
        }
      });
      return { success: true };
    }
    
    return { success: false };
  },
});

// Internal mutation to rebuild cache for all players
// Called by scheduler after power score updates complete
export const rebuildAllTopFiveCaches = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Helper to check if Discord ID is valid
    const isValidDiscordId = (id: string | undefined): boolean => {
      if (!id || id === "") return false;
      if (id === "imported") return false;
      if (id.startsWith("placeholder_")) return false;
      return true;
    };
    
    // Get only active players (exclude former/archived)
    const activePlayersByStatus = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();
    
    // Combine and deduplicate
    const playerMap = new Map<string, typeof activePlayersByStatus[0]>();
    for (const p of [...activePlayersByStatus, ...acceptedMembers]) {
      playerMap.set(p._id, p);
    }
    
    // Filter for valid Discord IDs and exclude archived / alt accounts
    const activePlayers = filterVisibleMembers(
      Array.from(playerMap.values()).filter(
        (p) => p.status !== "archived" && isValidDiscordId(p.discordUserId),
      ),
    );
    
    console.log(`[Top-5 Cache] Scheduling cache rebuild for ${activePlayers.length} active players`);
    
    // Schedule all cache updates without awaiting each one (faster)
    // Use 500ms delay to avoid database overload
    const schedulePromises = activePlayers.map((player, i) => 
      ctx.scheduler.runAfter(
        i * 500, // Stagger by 500ms to keep database responsive
        internal.topFiveCache.updateSinglePlayerCache,
        { playerId: player._id }
      )
    );
    
    // Wait for all scheduling to complete
    await Promise.all(schedulePromises);
    
    console.log(`[Top-5 Cache] Successfully scheduled ${activePlayers.length} cache updates`);
    return { scheduled: activePlayers.length };
  },
});

// Admin mutation to manually trigger cache rebuild (batched with progress)
export const triggerCacheRebuild = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
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
    
    const BATCH_SIZE = args.batchSize || 5;
    
    // Helper to check if Discord ID is valid
    const isValidDiscordId = (id: string | undefined): boolean => {
      if (!id || id === "") return false;
      if (id === "imported") return false;
      if (id.startsWith("placeholder_")) return false;
      return true;
    };
    
    // Get only active players using indexed queries (exclude former/archived)
    const activePlayersByStatus = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();
    
    // Combine and deduplicate
    const playerMap = new Map<string, typeof activePlayersByStatus[0]>();
    for (const p of [...activePlayersByStatus, ...acceptedMembers]) {
      playerMap.set(p._id, p);
    }
    
    // Filter for valid Discord IDs and exclude archived / alt accounts
    const allActivePlayers = filterVisibleMembers(
      Array.from(playerMap.values()).filter(
        (p) => p.status !== "archived" && isValidDiscordId(p.discordUserId),
      ),
    );
    
    // Find players that need cache updates (either no cache or stale)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const playersNeedingUpdate = allActivePlayers.filter(p => 
      !p.topFiveCache || !p.topFiveCache.lastUpdated || p.topFiveCache.lastUpdated < oneHourAgo
    );
    
    const total = playersNeedingUpdate.length;
    
    if (total === 0) {
      return { success: 0, failed: 0, remaining: 0, total: allActivePlayers.length };
    }
    
    // Process batch
    const batch = playersNeedingUpdate.slice(0, BATCH_SIZE);
    let successCount = 0;
    let failedCount = 0;
    
    for (const player of batch) {
      try {
        const topFiveData = await calculatePlayerTopFiveData(ctx, player._id);
        
        if (topFiveData) {
          await ctx.db.patch(player._id, {
            topFiveCache: {
              recentTop5Count: topFiveData.recentTop5Count,
              recentTop4Count: topFiveData.recentTop4Count,
              recentTop3Count: topFiveData.recentTop3Count,
              hasRecentActivity: topFiveData.hasRecentActivity,
              mostRecentEventTime: topFiveData.mostRecentEventTime,
              consistentTeammateName: topFiveData.consistentTeammateName,
              recentTop5WithTeammate: topFiveData.recentTop5WithTeammate,
              lastUpdated: Date.now(),
            }
          });
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`[Top-5 Cache] Failed to update player ${player._id}:`, error);
        failedCount++;
      }
    }
    
    const remaining = Math.max(0, total - BATCH_SIZE);
    
    return { success: successCount, failed: failedCount, remaining, total: allActivePlayers.length };
  },
});

// Query to get cache status
export const getTopFiveCacheStatus = query({
  args: {},
  handler: async (ctx) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { totalPlayers: 0, cachedPlayers: 0, stalePlayers: 0 };
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      return { totalPlayers: 0, cachedPlayers: 0, stalePlayers: 0 };
    }
    
    const isValidDiscordId = (id: string | undefined): boolean => {
      if (!id || id === "") return false;
      if (id === "imported") return false;
      if (id.startsWith("placeholder_")) return false;
      return true;
    };
    
    // Get only active players using existing indexes (exclude former/archived)
    const activePlayersByStatus = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();
    
    // Combine and deduplicate
    const playerMap = new Map<string, typeof activePlayersByStatus[0]>();
    for (const p of [...activePlayersByStatus, ...acceptedMembers]) {
      playerMap.set(p._id, p);
    }
    
    // Filter for valid Discord IDs and exclude archived / alt accounts
    const activePlayers = filterVisibleMembers(
      Array.from(playerMap.values()).filter(
        (p) => p.status !== "archived" && isValidDiscordId(p.discordUserId),
      ),
    );
    
    const totalPlayers = activePlayers.length;
    const cachedPlayers = activePlayers.filter(p => p.topFiveCache !== undefined).length;
    
    // Consider cache stale if older than 1 hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const stalePlayers = activePlayers.filter(p => 
      p.topFiveCache === undefined || p.topFiveCache.lastUpdated < oneHourAgo
    ).length;
    
    return { totalPlayers, cachedPlayers, stalePlayers };
  },
});

// Query to get detailed top 5 data for a single player
export const getPlayerTopFiveDetails = query({
  args: { discordUsername: v.string() },
  handler: async (ctx, args) => {
    // Find player by discord username
    const player = await ctx.db
      .query("players")
      .withIndex("by_discord_username", (q) => q.eq("discordUsername", args.discordUsername))
      .first();
    
    if (!player) {
      return null;
    }
    
    // Get all third party results for this player
    const playerResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    
    // Build list of events with import and event data
    const allResultsPromises = playerResults.map(async (result) => {
      const importData = await ctx.db.get(result.importId);
      if (!importData || !importData.eventDate) {
        return null;
      }
      
      // Get linked Event to determine type
      let eventType: string | null = null;
      let eventId: string | null = null;
      let eventName = importData.eventName || "Unknown Event";
      
      if (importData.eventId) {
        const event = await ctx.db.get(importData.eventId);
        if (event) {
          eventType = event.type;
          eventId = importData.eventId;
          eventName = event.name;
        }
      }
      
      return { 
        result, 
        importId: result.importId, 
        placement: result.placement,
        eventDate: importData.eventDate,
        creationTime: importData._creationTime,
        eventType,
        eventId,
        eventName,
      };
    });
    
    const allResultsWithData = await Promise.all(allResultsPromises);
    const validResults = allResultsWithData.filter((r) => r !== null);
    
    // Sort by event date (most recent first)
    const sortedResults = validResults.sort((a, b) => {
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : a.creationTime;
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : b.creationTime;
      return dateB - dateA;
    });
    
    // Build list of last 5 events
    const last5Events: Array<{
      key: string;
      placement: number;
      eventName: string;
      eventDate: number;
      teammates: string[];
      eventType: string | null;
    }> = [];
    const seenKeys = new Set<string>();
    
    for (const item of sortedResults) {
      const isRandomOrMiniSeason = item.eventType === "random" || item.eventType === "mini-season" || item.eventType === "random-squads";
      const key = isRandomOrMiniSeason && item.eventId ? item.eventId : item.importId;
      
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        
        // Get best placement for this event
        let placement: number;
        if (isRandomOrMiniSeason && item.eventId) {
          const eventResults = validResults.filter(r => r.eventId === item.eventId);
          placement = Math.min(...eventResults.map(r => r.placement));
        } else {
          placement = item.placement;
        }
        
        // Get teammates for this event
        const teammates: string[] = [];
        
        // Method 1: Use teamMembers array if available
        if (item.result.teamMembers && item.result.teamMembers.length > 0) {
          for (const teammateEpic of item.result.teamMembers) {
            if (teammateEpic !== player.epicUsername) {
              // Try to find teammate's display name
              const teammatePlayer = await ctx.db
                .query("players")
                .withIndex("by_epic_username", (q) => q.eq("epicUsername", teammateEpic))
                .first();
              
              const displayName = teammatePlayer?.nickname || teammatePlayer?.discordUsername || teammateEpic;
              teammates.push(displayName);
            }
          }
        }
        // Method 2: For Random events with duoAssignment, find teammates from same import + duo
        else if (item.result.duoAssignment && item.result.duoAssignment !== null) {
          // Find all results from this import with the same duoAssignment AND same teamId (same game)
          const sameImportResults = await ctx.db
            .query("thirdPartyResults")
            .withIndex("by_import", (q) => q.eq("importId", item.importId))
            .filter((q) => 
              q.and(
                q.eq(q.field("duoAssignment"), item.result.duoAssignment),
                q.eq(q.field("teamId"), item.result.teamId),
                q.neq(q.field("epicUsername"), player.epicUsername)
              )
            )
            .collect();
          
          for (const teammateResult of sameImportResults) {
            // Try to find teammate's display name
            const teammatePlayer = await ctx.db
              .query("players")
              .withIndex("by_epic_username", (q) => q.eq("epicUsername", teammateResult.epicUsername))
              .first();
            
            const displayName = teammatePlayer?.nickname || teammatePlayer?.discordUsername || teammateResult.epicUsername;
            teammates.push(displayName);
          }
        }
        
        const eventDate = item.eventDate ? new Date(item.eventDate).getTime() : item.creationTime;
        
        last5Events.push({
          key,
          placement,
          eventName: item.eventName,
          eventDate,
          teammates,
          eventType: item.eventType,
        });
        
        if (last5Events.length >= 5) {
          break;
        }
      }
    }
    
    // For random-squads, top 5 squads = placement 1-10, etc.
    return {
      playerName: player.nickname || player.discordUsername,
      epicUsername: player.epicUsername,
      recentTop5Count: last5Events.filter(e => {
        const multiplier = e.eventType === "random-squads" ? 2 : 1;
        return e.placement <= 5 * multiplier;
      }).length,
      recentTop4Count: last5Events.filter(e => {
        const multiplier = e.eventType === "random-squads" ? 2 : 1;
        return e.placement <= 4 * multiplier;
      }).length,
      recentTop3Count: last5Events.filter(e => {
        const multiplier = e.eventType === "random-squads" ? 2 : 1;
        return e.placement <= 3 * multiplier;
      }).length,
      consistentTeammateName: player.topFiveCache?.consistentTeammateName,
      recentTop5WithTeammate: player.topFiveCache?.recentTop5WithTeammate || 0,
      events: last5Events,
    };
  },
});
