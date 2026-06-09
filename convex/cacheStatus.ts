import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal, api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";
import { filterVisibleMembers } from "./helpers/playerAlt";
import { isActivePlayerWithMatchData } from "./lib/stats/listEligiblePlayers";
import { refreshEventCache } from "./lib/eventCache";
import { buildPlayerStatsCacheStatusReport } from "./lib/stats/playerStatsCacheStatus";

// Split into focused queries to avoid exceeding Convex scan limits
const STATUS_SAMPLE_LIMIT = 1000;
const TIER_EVAL_TIERS = new Set(["S", "A", "B", "C"]);

const isValidDiscordId = (id: string | undefined): boolean => {
  if (!id || id === "") return false;
  if (id === "imported") return false;
  if (id.startsWith("placeholder_")) return false;
  return true;
};

/** Stats rebuild pool: active members with Yunite match data (excludes alts). */
function buildCompetitivePoolStats(
  allPlayers: Doc<"players">[],
  tierEvalCacheCount: number,
) {
  const eligibleMatchData = filterVisibleMembers(
    allPlayers.filter(
      (p) => isActivePlayerWithMatchData(p) && isValidDiscordId(p.discordUserId),
    ),
  );
  const tierEvalEligible = eligibleMatchData.filter((p) =>
    TIER_EVAL_TIERS.has(p.tier || ""),
  );

  return {
    totalMembers: allPlayers.length,
    eligibleMatchDataPool: eligibleMatchData.length,
    tierEvalEligiblePool: tierEvalEligible.length,
    withContributionScore: eligibleMatchData.filter((p) => p.contributionScore)
      .length,
    withTopFiveCache: eligibleMatchData.filter((p) => p.topFiveCache).length,
    withTierEvalCache: tierEvalCacheCount,
  };
}

export const getPlayerStats = query({
  args: {},
  handler: async (ctx) => {
    const allPlayers = await ctx.db.query("players").collect();
    
    const playersWithSync = allPlayers.filter(p => p.lastDiscordSync);
    const mostRecentPlayerSync = playersWithSync.length > 0
      ? Math.max(...playersWithSync.map(p => p.lastDiscordSync || 0))
      : undefined;
    
    const tierEvalCache = await ctx.db.query("tierReEvaluationCache").collect();
    const competitivePool = buildCompetitivePoolStats(
      allPlayers,
      tierEvalCache.length,
    );

    return {
      ...competitivePool,
      /** @deprecated Use totalMembers — kept for older UI paths */
      total: allPlayers.length,
      withEpicId: allPlayers.filter(p => p.epicId).length,
      withName: allPlayers.filter(p => p.name).length,
      withAvatarUrl: allPlayers.filter(p => p.avatarUrl).length,
      withLastDiscordSync: playersWithSync.length,
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
      withTeamsOrPlayers: allEvents.filter((e) => e.totalTeams || e.totalPlayers).length,
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
    const page = await ctx.db
      .query("matchPlayerStats")
      .paginate({ numItems: STATUS_SAMPLE_LIMIT, cursor: null });
    const latest = await ctx.db.query("matchPlayerStats").order("desc").first();
    
    return {
      matchStatsCount: page.page.length,
      matchStatsCountIsSampled: !page.isDone,
      matchStatsLastUpdated: latest?._creationTime,
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
    const page = await ctx.db
      .query("thirdPartyResults")
      .paginate({ numItems: STATUS_SAMPLE_LIMIT, cursor: null });

    for (const r of page.page) {
      resultsTotal++;
      if (r.matched) resultsMatched++;
      if (r.epicId) resultsWithEpicId++;
      if (r.discordId) resultsWithDiscordId++;
      if (r.teamMembers && r.teamMembers.length > 0) resultsWithTeamMembers++;
      if (r.wins !== undefined || r.matchesPlayed !== undefined) resultsWithMatchData++;
    }
    
    return {
      total: resultsTotal,
      totalIsSampled: !page.isDone,
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
    
    const allPlayers = await ctx.db.query("players").collect();
    const competitivePool = buildCompetitivePoolStats(
      allPlayers,
      tierReEvaluationCache.length,
    );

    return {
      aggregateStatsCache: aggregateStatsCache ? {
        lastUpdated: aggregateStatsCache.lastUpdated,
        playerCount: aggregateStatsCache.playerCount,
        rebuildPoolCount: aggregateStatsCache.rebuildPoolCount,
        excludedNoYuniteEvents: aggregateStatsCache.excludedNoYuniteEvents,
      } : null,
      tierReEvaluationCache: {
        evaluationCount: tierReEvaluationCache.length,
        lastUpdated: tierMediansCache?.lastUpdated || null,
      },
      competitivePool,
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
    
    const tierEvalCache = await ctx.db.query("tierReEvaluationCache").collect();
    const competitivePool = buildCompetitivePoolStats(
      allPlayers,
      tierEvalCache.length,
    );

    const playerStats = {
      ...competitivePool,
      total: allPlayers.length,
      withEpicId: allPlayers.filter(p => p.epicId).length,
      withName: allPlayers.filter(p => p.name).length,
      withAvatarUrl: allPlayers.filter(p => p.avatarUrl).length,
      withLastDiscordSync: playersWithSync.length,
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
      withTeamsOrPlayers: allEvents.filter((e) => e.totalTeams || e.totalPlayers).length,
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
        rebuildPoolCount: aggregateStatsCache.rebuildPoolCount,
        excludedNoYuniteEvents: aggregateStatsCache.excludedNoYuniteEvents,
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
    
    return Promise.all(
      sorted.map(async (p) => {
        const tierCache = await ctx.db
          .query("tierReEvaluationCache")
          .withIndex("by_player", (q) => q.eq("playerId", p._id))
          .first();

        return {
          playerId: p._id,
          discordUsername: p.discordUsername,
          name: p.name,
          epicUsername: p.epicUsername,
          lastDiscordSync: p.lastDiscordSync,
          hasEpicId: !!p.epicId,
          hasAvatar: !!p.avatarUrl,
          hasTierEvalCache: tierCache !== null,
          hasTopFiveCache: !!p.topFiveCache,
        };
      }),
    );
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

// Rebuild player cache (Top 5 placement badges via unified rebuild)
export const rebuildPlayerCache = mutation({
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
        message: "Only admins can rebuild player cache",
        code: "FORBIDDEN",
      });
    }
    
    const result = await ctx.runMutation(
      api.playerStatsRebuild.startFullPlayerStatsRebuild,
      { topFiveOnly: true },
    );

    return {
      success: true,
      message: result.message,
    };
  },
});

// Rebuild event cache from linked imports
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

    const allEvents = await ctx.db.query("events").collect();
    let updated = 0;
    for (const event of allEvents) {
      const result = await refreshEventCache(ctx, event._id);
      if (result.updated) {
        updated += 1;
      }
    }
    
    return {
      success: true,
      message: `Refreshed event cache for ${updated} of ${allEvents.length} events from linked imports.`,
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
      message:
        "Imports are created when an admin runs Yunite sync or uploads CSV from Admin → Uploads. No manual rebuild needed.",
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
      message:
        "Match stats are updated when an admin runs Sync Match Data per import. No manual rebuild needed.",
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
    
    const result = await ctx.runMutation(
      api.playerStatsRebuild.startFullPlayerStatsRebuild,
      { aggregateStatsOnly: true },
    );

    return {
      success: true,
      message: result.message,
    };
  },
});

async function buildDiagnosticsSnapshot(ctx: MutationCtx) {
  const allPlayers = await ctx.db.query("players").collect();
  const playersWithSync = allPlayers.filter((p) => p.lastDiscordSync);
  const mostRecentPlayerSync =
    playersWithSync.length > 0
      ? Math.max(...playersWithSync.map((p) => p.lastDiscordSync || 0))
      : undefined;

  const tierEvalCache = await ctx.db.query("tierReEvaluationCache").collect();
  const competitivePool = buildCompetitivePoolStats(allPlayers, tierEvalCache.length);

  const playerStats = {
    ...competitivePool,
    total: allPlayers.length,
    withEpicId: allPlayers.filter((p) => p.epicId).length,
    withName: allPlayers.filter((p) => p.name).length,
    withAvatarUrl: allPlayers.filter((p) => p.avatarUrl).length,
    withLastDiscordSync: playersWithSync.length,
    lastUpdated: mostRecentPlayerSync,
  };

  const allEvents = await ctx.db.query("events").collect();
  const eventsWithSync = allEvents.filter((e) => e.lastYunitSync);
  const eventStats = {
    total: allEvents.length,
    withLastYunitSync: eventsWithSync.length,
    withTotalTeams: allEvents.filter((e) => e.totalTeams).length,
    withTotalPlayers: allEvents.filter((e) => e.totalPlayers).length,
    withTeamsOrPlayers: allEvents.filter((e) => e.totalTeams || e.totalPlayers).length,
    completed: allEvents.filter((e) => e.status === "completed").length,
    lastUpdated:
      eventsWithSync.length > 0
        ? Math.max(...eventsWithSync.map((e) => e.lastYunitSync || 0))
        : undefined,
  };

  const allImports = await ctx.db.query("thirdPartyImports").collect();
  const importsWithSync = allImports.filter((i) => i.matchDataSyncedAt);
  const importStats = {
    total: allImports.length,
    withMatchDataSynced: allImports.filter((i) => i.matchDataSynced).length,
    withMatchDataSyncedAt: importsWithSync.length,
    withDataFullyCached: allImports.filter((i) => i.dataFullyCached).length,
    fromYuniteAPI: allImports.filter((i) => i.source === "Yunite API").length,
    fromCSV: allImports.filter((i) => i.source === "CSV").length,
    lastUpdated:
      importsWithSync.length > 0
        ? Math.max(...importsWithSync.map((i) => i.matchDataSyncedAt || 0))
        : undefined,
  };

  const matchPage = await ctx.db
    .query("matchPlayerStats")
    .paginate({ numItems: STATUS_SAMPLE_LIMIT, cursor: null });
  const latestMatch = await ctx.db.query("matchPlayerStats").order("desc").first();
  const matchStats = {
    matchStatsCount: matchPage.page.length,
    matchStatsCountIsSampled: !matchPage.isDone,
    matchStatsLastUpdated: latestMatch?._creationTime,
  };

  const resultsPage = await ctx.db
    .query("thirdPartyResults")
    .paginate({ numItems: STATUS_SAMPLE_LIMIT, cursor: null });
  let resultsTotal = 0;
  let resultsMatched = 0;
  let resultsWithEpicId = 0;
  let resultsWithDiscordId = 0;
  let resultsWithTeamMembers = 0;
  let resultsWithMatchData = 0;
  for (const r of resultsPage.page) {
    resultsTotal++;
    if (r.matched) resultsMatched++;
    if (r.epicId) resultsWithEpicId++;
    if (r.discordId) resultsWithDiscordId++;
    if (r.teamMembers && r.teamMembers.length > 0) resultsWithTeamMembers++;
    if (r.wins !== undefined || r.matchesPlayed !== undefined) resultsWithMatchData++;
  }
  const resultStats = {
    total: resultsTotal,
    totalIsSampled: !resultsPage.isDone,
    matched: resultsMatched,
    withEpicId: resultsWithEpicId,
    withDiscordId: resultsWithDiscordId,
    withTeamMembers: resultsWithTeamMembers,
    withMatchData: resultsWithMatchData,
  };

  const aggregateStatsCache = await ctx.db.query("aggregateStatsCache").first();
  const tierMediansCache = await ctx.db.query("tierMediansCache").first();
  const cacheMetadata = {
    aggregateStatsCache: aggregateStatsCache
      ? {
          lastUpdated: aggregateStatsCache.lastUpdated,
          playerCount: aggregateStatsCache.playerCount,
          rebuildPoolCount: aggregateStatsCache.rebuildPoolCount,
          excludedNoYuniteEvents: aggregateStatsCache.excludedNoYuniteEvents,
        }
      : null,
    tierReEvaluationCache: {
      evaluationCount: tierEvalCache.length,
      lastUpdated: tierMediansCache?.lastUpdated || null,
    },
    competitivePool,
    playerStatsCache: await buildPlayerStatsCacheStatusReport(ctx),
    lastChecked: Date.now(),
  };

  const recentPlayers = await ctx.db.query("players").order("desc").take(200);
  const recentPlayerSyncs = recentPlayers
    .filter((p) => p.lastDiscordSync)
    .sort((a, b) => (b.lastDiscordSync || 0) - (a.lastDiscordSync || 0))
    .slice(0, 10)
    .map((p) => ({
      playerId: p._id,
      discordUsername: p.discordUsername,
      name: p.name,
      epicUsername: p.epicUsername,
      lastDiscordSync: p.lastDiscordSync,
      hasEpicId: !!p.epicId,
      hasAvatar: !!p.avatarUrl,
      hasTierEvalCache: false,
      hasTopFiveCache: !!p.topFiveCache,
    }));

  for (const row of recentPlayerSyncs) {
    const tierCache = await ctx.db
      .query("tierReEvaluationCache")
      .withIndex("by_player", (q) => q.eq("playerId", row.playerId))
      .first();
    row.hasTierEvalCache = tierCache !== null;
  }

  const recentEventSyncs = allEvents
    .filter((e) => e.lastYunitSync)
    .sort((a, b) => (b.lastYunitSync || 0) - (a.lastYunitSync || 0))
    .slice(0, 10)
    .map((e) => ({
      eventId: e._id,
      name: e.name,
      type: e.type,
      status: e.status,
      lastYunitSync: e.lastYunitSync,
      totalTeams: e.totalTeams,
      totalPlayers: e.totalPlayers,
    }));

  const recentImportSyncs = allImports
    .filter((i) => i.matchDataSyncedAt)
    .sort((a, b) => (b.matchDataSyncedAt || 0) - (a.matchDataSyncedAt || 0))
    .slice(0, 10)
    .map((i) => ({
      importId: i._id,
      eventName: i.eventName,
      source: i.source,
      matchDataSynced: i.matchDataSynced,
      matchDataSyncedAt: i.matchDataSyncedAt,
      dataFullyCached: i.dataFullyCached,
      totalPlayers: i.totalPlayers,
      playersMatched: i.playersMatched,
    }));

  return {
    playerStats,
    eventStats,
    importStats,
    matchStats,
    resultStats,
    cacheMetadata,
    recentPlayerSyncs,
    recentEventSyncs,
    recentImportSyncs,
  };
}

/** Lightweight dashboard read — single snapshot document (no table scans on subscribe). */
export const getDataCacheDashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const snapshot = await ctx.db
      .query("dataCacheDiagnostics")
      .withIndex("by_key", (q) => q.eq("snapshotKey", "main"))
      .first();

    if (!snapshot) {
      return {
        needsRefresh: true as const,
        lastUpdated: null,
        message: 'Click "Refresh diagnostics" to build the first snapshot.',
      };
    }

    return {
      needsRefresh: false as const,
      lastUpdated: snapshot.lastUpdated,
      playerStats: snapshot.playerStats,
      eventStats: snapshot.eventStats,
      importStats: snapshot.importStats,
      matchStats: snapshot.matchStats,
      resultStats: snapshot.resultStats,
      cacheMetadata: snapshot.cacheMetadata,
      recentPlayerSyncs: snapshot.recentPlayerSyncs,
      recentEventSyncs: snapshot.recentEventSyncs,
      recentImportSyncs: snapshot.recentImportSyncs,
    };
  },
});

export const storeDataCacheDiagnostics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const built = await buildDiagnosticsSnapshot(ctx);
    const payload = {
      snapshotKey: "main" as const,
      lastUpdated: Date.now(),
      ...built,
    };

    const existing = await ctx.db
      .query("dataCacheDiagnostics")
      .withIndex("by_key", (q) => q.eq("snapshotKey", "main"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("dataCacheDiagnostics", payload);
    }
  },
});

export const refreshDataCacheDiagnostics = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.cacheStatus.storeDataCacheDiagnostics, {});
    return {
      started: true,
      message: "Refreshing data cache diagnostics snapshot…",
    };
  },
});

export const backfillPlayerEventParticipationStats = mutation({
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
        message: "Only admins can backfill player event stats",
        code: "FORBIDDEN",
      });
    }

    const result = await ctx.runMutation(
      api.playerStatsRebuild.startFullPlayerStatsRebuild,
      { stopAfterPhase: "event_participation" },
    );

    return {
      success: true,
      message: result.message,
    };
  },
});

