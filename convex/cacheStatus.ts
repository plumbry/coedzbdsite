import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal, api } from "./_generated/api";

// Split into focused queries to avoid exceeding Convex scan limits

export const getPlayerStats = query({
  args: {},
  handler: async (ctx) => {
    const allPlayers = await ctx.db.query("players").collect();
    
    const playersWithSync = allPlayers.filter(p => p.lastDiscordSync);
    const mostRecentPlayerSync = playersWithSync.length > 0
      ? Math.max(...playersWithSync.map(p => p.lastDiscordSync || 0))
      : undefined;
    
    return {
      total: allPlayers.length,
      withEpicId: allPlayers.filter(p => p.epicId).length,
      withName: allPlayers.filter(p => p.name).length,
      withAvatarUrl: allPlayers.filter(p => p.avatarUrl).length,
      withLastDiscordSync: playersWithSync.length,
      withPowerScore: allPlayers.filter(p => p.powerScore).length,
      withRankingStats: allPlayers.filter(p => p.rankingStats).length,
      withContributionScore: allPlayers.filter(p => p.contributionScore).length,
      withTopFiveCache: allPlayers.filter(p => p.topFiveCache).length,
      lastUpdated: mostRecentPlayerSync,
    };
  },
});

export const getEventStats = query({
  args: {},
  handler: async (ctx) => {
    const allEvents = await ctx.db.query("events").collect();
    const eventsWithSync = allEvents.filter(e => e.lastYunitSync);
    const mostRecentEventSync = eventsWithSync.length > 0
      ? Math.max(...eventsWithSync.map(e => e.lastYunitSync || 0))
      : undefined;
    
    return {
      total: allEvents.length,
      withLastYunitSync: eventsWithSync.length,
      withTotalTeams: allEvents.filter(e => e.totalTeams).length,
      withTotalPlayers: allEvents.filter(e => e.totalPlayers).length,
      completed: allEvents.filter(e => e.status === "completed").length,
      lastUpdated: mostRecentEventSync,
    };
  },
});

export const getImportStats = query({
  args: {},
  handler: async (ctx) => {
    const allImports = await ctx.db.query("thirdPartyImports").collect();
    const importsWithSync = allImports.filter(i => i.matchDataSyncedAt);
    const mostRecentImportSync = importsWithSync.length > 0
      ? Math.max(...importsWithSync.map(i => i.matchDataSyncedAt || 0))
      : undefined;
    
    return {
      total: allImports.length,
      withMatchDataSynced: allImports.filter(i => i.matchDataSynced).length,
      withMatchDataSyncedAt: importsWithSync.length,
      withDataFullyCached: allImports.filter(i => i.dataFullyCached).length,
      fromYuniteAPI: allImports.filter(i => i.source === "Yunite API").length,
      fromCSV: allImports.filter(i => i.source === "CSV").length,
      lastUpdated: mostRecentImportSync,
    };
  },
});

// Split into two separate queries to avoid exceeding Convex scan limits
export const getMatchStatsCount = query({
  args: {},
  handler: async (ctx) => {
    let matchStatsCount = 0;
    let mostRecentMatchStat: number | undefined = undefined;
    let matchStatsCursor: string | null = null;
    let matchStatsDone = false;
    
    while (!matchStatsDone) {
      const page = await ctx.db
        .query("matchPlayerStats")
        .paginate({ numItems: 1000, cursor: matchStatsCursor });
      matchStatsCount += page.page.length;
      for (const doc of page.page) {
        if (!mostRecentMatchStat || doc._creationTime > mostRecentMatchStat) {
          mostRecentMatchStat = doc._creationTime;
        }
      }
      matchStatsDone = page.isDone;
      matchStatsCursor = page.continueCursor;
    }
    
    return {
      matchStatsCount,
      matchStatsLastUpdated: mostRecentMatchStat,
    };
  },
});

export const getKillEventsCount = query({
  args: {},
  handler: async (ctx) => {
    const metadata = await ctx.db.query("matchKillEventsMetadata").first();
    if (metadata) {
      return {
        killEventsCount: metadata.totalKillEvents,
        upsetKillEventsCount: metadata.totalUpsetKillEvents,
        lastUpdated: metadata.lastUpdated,
      };
    }

    let killEventsCount = 0;
    let upsetKillEventsCount = 0;
    let lastUpdated: number | undefined;
    let cursor: string | null = null;
    let done = false;

    while (!done) {
      const page = await ctx.db
        .query("matchKillEvents")
        .paginate({ numItems: 1000, cursor });

      for (const event of page.page) {
        killEventsCount++;
        if (event.isUpset) {
          upsetKillEventsCount++;
        }
        if (!lastUpdated || event._creationTime > lastUpdated) {
          lastUpdated = event._creationTime;
        }
      }

      done = page.isDone;
      cursor = page.continueCursor;
    }

    return {
      killEventsCount,
      upsetKillEventsCount,
      lastUpdated,
    };
  },
});

export const getResultStats = query({
  args: {},
  handler: async (ctx) => {
    let resultsTotal = 0;
    let resultsMatched = 0;
    let resultsWithEpicId = 0;
    let resultsWithDiscordId = 0;
    let resultsWithTeamMembers = 0;
    let resultsWithMatchData = 0;
    let resultsCursor: string | null = null;
    let resultsDone = false;
    
    while (!resultsDone) {
      const page = await ctx.db
        .query("thirdPartyResults")
        .paginate({ numItems: 1000, cursor: resultsCursor });
      for (const r of page.page) {
        resultsTotal++;
        if (r.matched) resultsMatched++;
        if (r.epicId) resultsWithEpicId++;
        if (r.discordId) resultsWithDiscordId++;
        if (r.teamMembers && r.teamMembers.length > 0) resultsWithTeamMembers++;
        if (r.wins !== undefined || r.matchesPlayed !== undefined) resultsWithMatchData++;
      }
      resultsDone = page.isDone;
      resultsCursor = page.continueCursor;
    }
    
    return {
      total: resultsTotal,
      matched: resultsMatched,
      withEpicId: resultsWithEpicId,
      withDiscordId: resultsWithDiscordId,
      withTeamMembers: resultsWithTeamMembers,
      withMatchData: resultsWithMatchData,
    };
  },
});

export const getCacheMetadata = query({
  args: {},
  handler: async (ctx) => {
    // Small tables - safe to collect directly
    const aggregateStatsCache = await ctx.db.query("aggregateStatsCache").first();
    const tierReEvaluationCache = await ctx.db.query("tierReEvaluationCache").collect();
    const tierMediansCache = await ctx.db.query("tierMediansCache").first();
    
    return {
      aggregateStatsCache: aggregateStatsCache ? {
        lastUpdated: aggregateStatsCache.lastUpdated,
        playerCount: aggregateStatsCache.playerCount,
      } : null,
      tierReEvaluationCache: {
        evaluationCount: tierReEvaluationCache.length,
        lastUpdated: tierMediansCache?.lastUpdated || null,
      },
      lastChecked: Date.now(),
    };
  },
});

// Keep the old getCacheStatus for backward compatibility but mark as deprecated
// This will now delegate to the split queries internally
export const getCacheStatus = query({
  args: {},
  handler: async (ctx) => {
    // Players - should be manageable size
    const allPlayers = await ctx.db.query("players").collect();
    
    const playersWithSync = allPlayers.filter(p => p.lastDiscordSync);
    const mostRecentPlayerSync = playersWithSync.length > 0
      ? Math.max(...playersWithSync.map(p => p.lastDiscordSync || 0))
      : undefined;
    
    const playerStats = {
      total: allPlayers.length,
      withEpicId: allPlayers.filter(p => p.epicId).length,
      withName: allPlayers.filter(p => p.name).length,
      withAvatarUrl: allPlayers.filter(p => p.avatarUrl).length,
      withLastDiscordSync: playersWithSync.length,
      withPowerScore: allPlayers.filter(p => p.powerScore).length,
      withRankingStats: allPlayers.filter(p => p.rankingStats).length,
      withContributionScore: allPlayers.filter(p => p.contributionScore).length,
      withTopFiveCache: allPlayers.filter(p => p.topFiveCache).length,
      lastUpdated: mostRecentPlayerSync,
    };
    
    // Events - should be small
    const allEvents = await ctx.db.query("events").collect();
    const eventsWithSync = allEvents.filter(e => e.lastYunitSync);
    const mostRecentEventSync = eventsWithSync.length > 0
      ? Math.max(...eventsWithSync.map(e => e.lastYunitSync || 0))
      : undefined;
    
    const eventStats = {
      total: allEvents.length,
      withLastYunitSync: eventsWithSync.length,
      withTotalTeams: allEvents.filter(e => e.totalTeams).length,
      withTotalPlayers: allEvents.filter(e => e.totalPlayers).length,
      completed: allEvents.filter(e => e.status === "completed").length,
      lastUpdated: mostRecentEventSync,
    };
    
    // Imports - should be small
    const allImports = await ctx.db.query("thirdPartyImports").collect();
    const importsWithSync = allImports.filter(i => i.matchDataSyncedAt);
    const mostRecentImportSync = importsWithSync.length > 0
      ? Math.max(...importsWithSync.map(i => i.matchDataSyncedAt || 0))
      : undefined;
    
    const importStats = {
      total: allImports.length,
      withMatchDataSynced: allImports.filter(i => i.matchDataSynced).length,
      withMatchDataSyncedAt: importsWithSync.length,
      withDataFullyCached: allImports.filter(i => i.dataFullyCached).length,
      fromYuniteAPI: allImports.filter(i => i.source === "Yunite API").length,
      fromCSV: allImports.filter(i => i.source === "CSV").length,
      lastUpdated: mostRecentImportSync,
    };
    
    // Match stats - use paginated counting to avoid scan limits
    let matchStatsCount = 0;
    let mostRecentMatchStat: number | undefined = undefined;
    let matchStatsCursor: string | null = null;
    let matchStatsDone = false;
    
    while (!matchStatsDone) {
      const page = await ctx.db
        .query("matchPlayerStats")
        .paginate({ numItems: 2000, cursor: matchStatsCursor });
      matchStatsCount += page.page.length;
      for (const doc of page.page) {
        if (!mostRecentMatchStat || doc._creationTime > mostRecentMatchStat) {
          mostRecentMatchStat = doc._creationTime;
        }
      }
      matchStatsDone = page.isDone;
      matchStatsCursor = page.continueCursor;
    }
    
    // Results - use paginated counting
    let resultsTotal = 0;
    let resultsMatched = 0;
    let resultsWithEpicId = 0;
    let resultsWithDiscordId = 0;
    let resultsWithTeamMembers = 0;
    let resultsWithMatchData = 0;
    let resultsCursor: string | null = null;
    let resultsDone = false;
    
    while (!resultsDone) {
      const page = await ctx.db
        .query("thirdPartyResults")
        .paginate({ numItems: 2000, cursor: resultsCursor });
      for (const r of page.page) {
        resultsTotal++;
        if (r.matched) resultsMatched++;
        if (r.epicId) resultsWithEpicId++;
        if (r.discordId) resultsWithDiscordId++;
        if (r.teamMembers && r.teamMembers.length > 0) resultsWithTeamMembers++;
        if (r.wins !== undefined || r.matchesPlayed !== undefined) resultsWithMatchData++;
      }
      resultsDone = page.isDone;
      resultsCursor = page.continueCursor;
    }
    
    const resultStats = {
      total: resultsTotal,
      matched: resultsMatched,
      withEpicId: resultsWithEpicId,
      withDiscordId: resultsWithDiscordId,
      withTeamMembers: resultsWithTeamMembers,
      withMatchData: resultsWithMatchData,
    };
    
    // Small tables
    const aggregateStatsCache = await ctx.db.query("aggregateStatsCache").first();
    const tierReEvaluationCache = await ctx.db.query("tierReEvaluationCache").collect();
    const tierMediansCache = await ctx.db.query("tierMediansCache").first();
    
    return {
      playerStats,
      eventStats,
      importStats,
      matchStatsCount,
      matchStatsLastUpdated: mostRecentMatchStat,
      resultStats,
      aggregateStatsCache: aggregateStatsCache ? {
        lastUpdated: aggregateStatsCache.lastUpdated,
        playerCount: aggregateStatsCache.playerCount,
      } : null,
      tierReEvaluationCache: {
        evaluationCount: tierReEvaluationCache.length,
        lastUpdated: tierMediansCache?.lastUpdated || null,
      },
      lastChecked: Date.now(),
    };
  },
});

export const getRecentPlayerCacheUpdates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    
    // Use order desc to get most recent first, then take only what we need
    const players = await ctx.db
      .query("players")
      .order("desc")
      .take(200);
    
    // Filter and sort by lastDiscordSync
    const sorted = players
      .filter(p => p.lastDiscordSync)
      .sort((a, b) => (b.lastDiscordSync || 0) - (a.lastDiscordSync || 0))
      .slice(0, limit);
    
    return sorted.map(p => ({
      playerId: p._id,
      discordUsername: p.discordUsername,
      name: p.name,
      epicUsername: p.epicUsername,
      lastDiscordSync: p.lastDiscordSync,
      hasEpicId: !!p.epicId,
      hasAvatar: !!p.avatarUrl,
      hasPowerScore: !!p.powerScore,
      hasTopFiveCache: !!p.topFiveCache,
    }));
  },
});

export const getRecentEventSyncs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    
    // Events table is typically small, safe to collect
    const events = await ctx.db.query("events").collect();
    
    const sorted = events
      .filter(e => e.lastYunitSync)
      .sort((a, b) => (b.lastYunitSync || 0) - (a.lastYunitSync || 0))
      .slice(0, limit);
    
    return sorted.map(e => ({
      eventId: e._id,
      name: e.name,
      type: e.type,
      status: e.status,
      lastYunitSync: e.lastYunitSync,
      totalTeams: e.totalTeams,
      totalPlayers: e.totalPlayers,
    }));
  },
});

export const getRecentImportSyncs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    
    // Imports table is typically small, safe to collect
    const imports = await ctx.db.query("thirdPartyImports").collect();
    
    const sorted = imports
      .filter(i => i.matchDataSyncedAt)
      .sort((a, b) => (b.matchDataSyncedAt || 0) - (a.matchDataSyncedAt || 0))
      .slice(0, limit);
    
    return sorted.map(i => ({
      importId: i._id,
      eventName: i.eventName,
      source: i.source,
      matchDataSynced: i.matchDataSynced,
      matchDataSyncedAt: i.matchDataSyncedAt,
      dataFullyCached: i.dataFullyCached,
      totalPlayers: i.totalPlayers,
      playersMatched: i.playersMatched,
    }));
  },
});

// Rebuild player cache (triggers Discord sync)
export const rebuildPlayerCache = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can rebuild player cache",
        code: "FORBIDDEN",
      });
    }
    
    await ctx.scheduler.runAfter(0, internal.topFiveCache.rebuildAllTopFiveCaches);
    
    return {
      success: true,
      message: "Player cache rebuild started (Top 5 cache). This may take a few minutes.",
    };
  },
});

// Rebuild event cache (no-op)
export const rebuildEventCache = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can rebuild event cache",
        code: "FORBIDDEN",
      });
    }
    
    return {
      success: true,
      message: "Events are synced automatically from Yunite API. No manual rebuild needed.",
    };
  },
});

// Rebuild import cache (no-op)
export const rebuildImportCache = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can rebuild import cache",
        code: "FORBIDDEN",
      });
    }
    
    return {
      success: true,
      message: "Imports are synced automatically from Yunite API and CSV uploads. No manual rebuild needed.",
    };
  },
});

// Rebuild match stats cache (no-op)
export const rebuildMatchStatsCache = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can rebuild match stats cache",
        code: "FORBIDDEN",
      });
    }
    
    return {
      success: true,
      message: "Match stats are synced automatically from Yunite API. No manual rebuild needed.",
    };
  },
});

// Rebuild aggregate stats cache
export const rebuildAggregateStatsCache = mutation({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; message: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can rebuild aggregate stats cache",
        code: "FORBIDDEN",
      });
    }
    
    const result = await ctx.runMutation(api.aggregateStats.rebuildAggregateStatsCache);
    const playerCount = "success" in result ? result.playerCount : result.playerCount;
    
    return {
      success: true,
      message: `Aggregate stats cache rebuilt successfully (${playerCount} players).`,
    };
  },
});

// Rebuild holistic scores cache (tier re-evaluation)
export const rebuildHolisticScoresCache = mutation({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; message: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can rebuild holistic scores cache",
        code: "FORBIDDEN",
      });
    }
    
    await ctx.runMutation(api.tierReEvaluationBatched.clearCache, {});
    
    const result: { success: boolean; message: string } = await ctx.runMutation(api.tierReEvaluation.rebuildTierReEvaluationCache, {
      applyDuoAdjustment: false,
      applyTCPenalty: true,
    });
    
    return {
      success: result.success,
      message: result.message,
    };
  },
});
