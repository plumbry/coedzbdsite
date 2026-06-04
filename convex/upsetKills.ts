import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { filterVisibleMembers } from "./helpers/playerAlt";
import type { MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";

type PlayerUpsetCounts = Record<
  string,
  { kills: number; deaths: number; playerId: Id<"players"> | undefined }
>;

type UpsetAggregation = {
  upsetCount: number;
  byKillerTier: Record<string, number>;
  byVictimTier: Record<string, number>;
  byTierDiff: Record<string, number>;
  playerUpsetCounts: PlayerUpsetCounts;
};

function emptyUpsetAggregation(): UpsetAggregation {
  return {
    upsetCount: 0,
    byKillerTier: {},
    byVictimTier: {},
    byTierDiff: {},
    playerUpsetCounts: {},
  };
}

function foldUpsetKill(agg: UpsetAggregation, kill: Doc<"matchKillEvents">) {
  agg.upsetCount++;

  const kTier = kill.killerTier || "Unknown";
  agg.byKillerTier[kTier] = (agg.byKillerTier[kTier] || 0) + 1;

  const vTier = kill.victimTier || "Unknown";
  agg.byVictimTier[vTier] = (agg.byVictimTier[vTier] || 0) + 1;

  const tierDiffKey = String(kill.tierDifference);
  agg.byTierDiff[tierDiffKey] = (agg.byTierDiff[tierDiffKey] || 0) + 1;

  if (kill.killerDiscordId) {
    if (!agg.playerUpsetCounts[kill.killerDiscordId]) {
      agg.playerUpsetCounts[kill.killerDiscordId] = {
        kills: 0,
        deaths: 0,
        playerId: kill.killerPlayerId,
      };
    }
    agg.playerUpsetCounts[kill.killerDiscordId].kills++;
  }

  if (kill.victimDiscordId) {
    if (!agg.playerUpsetCounts[kill.victimDiscordId]) {
      agg.playerUpsetCounts[kill.victimDiscordId] = {
        kills: 0,
        deaths: 0,
        playerId: kill.victimPlayerId,
      };
    }
    agg.playerUpsetCounts[kill.victimDiscordId].deaths++;
  }
}

async function countMatchKillEvents(ctx: MutationCtx): Promise<number> {
  const meta = await getOrCreateKillEventsMetadata(ctx);
  return meta.totalKillEvents;
}

async function aggregateUpsetKills(ctx: MutationCtx): Promise<UpsetAggregation> {
  const agg = emptyUpsetAggregation();
  const upsets = await ctx.db
    .query("matchKillEvents")
    .withIndex("by_upset", (q) => q.eq("isUpset", true))
    .collect();

  for (const kill of upsets) {
    foldUpsetKill(agg, kill);
  }

  return agg;
}

async function getOrCreateKillEventsMetadata(ctx: MutationCtx) {
  const existing = await ctx.db.query("matchKillEventsMetadata").first();
  if (existing) {
    return existing;
  }

  const id = await ctx.db.insert("matchKillEventsMetadata", {
    totalKillEvents: 0,
    totalUpsetKillEvents: 0,
    lastUpdated: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

async function adjustKillEventsMetadata(
  ctx: MutationCtx,
  delta: { totalKillEvents: number; upsetKillEvents: number },
) {
  const meta = await getOrCreateKillEventsMetadata(ctx);
  await ctx.db.patch(meta._id, {
    totalKillEvents: Math.max(0, meta.totalKillEvents + delta.totalKillEvents),
    totalUpsetKillEvents: Math.max(0, meta.totalUpsetKillEvents + delta.upsetKillEvents),
    lastUpdated: Date.now(),
  });
}

async function syncKillEventsMetadata(
  ctx: MutationCtx,
  totals: { totalKillEvents: number; upsetKillEvents: number },
) {
  const meta = await getOrCreateKillEventsMetadata(ctx);
  await ctx.db.patch(meta._id, {
    totalKillEvents: totals.totalKillEvents,
    totalUpsetKillEvents: totals.upsetKillEvents,
    lastUpdated: Date.now(),
  });
}

function duplicateKillEventKey(event: Doc<"matchKillEvents">): string {
  return `${event.importId}-${event.sessionId}-${event.killerDiscordId}-${event.victimDiscordId}-${event.timeInMatch ?? "null"}`;
}

async function dedupeKillEventsForImport(
  ctx: MutationCtx,
  importId: Id<"thirdPartyImports">,
) {
  const seen = new Map<string, Id<"matchKillEvents">>();
  const duplicateIds: Id<"matchKillEvents">[] = [];
  const events = await ctx.db
    .query("matchKillEvents")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .collect();

  for (const event of events) {
    const key = duplicateKillEventKey(event);
    if (seen.has(key)) {
      duplicateIds.push(event._id);
    } else {
      seen.set(key, event._id);
    }
  }

  const total = events.length;

  let upsetDuplicatesRemoved = 0;
  for (const id of duplicateIds) {
    const doc = await ctx.db.get(id);
    if (doc?.isUpset) {
      upsetDuplicatesRemoved++;
    }
    await ctx.db.delete(id);
  }

  return {
    total,
    duplicatesRemoved: duplicateIds.length,
    upsetDuplicatesRemoved,
  };
}

// Helper function to convert tier to numeric value (higher = better)
function tierToNumber(tier: string | undefined): number {
  switch (tier?.toUpperCase()) {
    case "S": return 4;
    case "A": return 3;
    case "B": return 2;
    case "C": return 1;
    case "D": return 0;
    default: return -1; // Unknown tier
  }
}

// Helper to determine if a kill is an "upset" (lower tier killing higher tier)
export function isUpsetKill(killerTier: string | undefined, victimTier: string | undefined): boolean {
  const killerNum = tierToNumber(killerTier);
  const victimNum = tierToNumber(victimTier);
  // Only count as upset if both tiers are known and killer is lower tier
  if (killerNum < 0 || victimNum < 0) return false;
  return killerNum < victimNum;
}

// Calculate tier difference (positive = upset, negative = expected)
export function calculateTierDifference(killerTier: string | undefined, victimTier: string | undefined): number {
  const killerNum = tierToNumber(killerTier);
  const victimNum = tierToNumber(victimTier);
  if (killerNum < 0 || victimNum < 0) return 0;
  return victimNum - killerNum;
}

// Store a single kill event
export const storeKillEvent = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
    sessionId: v.string(),
    killerDiscordId: v.string(),
    killerPlayerId: v.optional(v.id("players")),
    killerTier: v.optional(v.string()),
    victimDiscordId: v.string(),
    victimPlayerId: v.optional(v.id("players")),
    victimTier: v.optional(v.string()),
    eventType: v.union(v.literal("elimination"), v.literal("knock")),
    weapon: v.optional(v.string()),
    timeInMatch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const isUpset = isUpsetKill(args.killerTier, args.victimTier);
    const tierDiff = calculateTierDifference(args.killerTier, args.victimTier);
    
    await ctx.db.insert("matchKillEvents", {
      importId: args.importId,
      sessionId: args.sessionId,
      killerDiscordId: args.killerDiscordId,
      killerPlayerId: args.killerPlayerId,
      killerTier: args.killerTier,
      victimDiscordId: args.victimDiscordId,
      victimPlayerId: args.victimPlayerId,
      victimTier: args.victimTier,
      isUpset,
      tierDifference: tierDiff,
      eventType: args.eventType,
      weapon: args.weapon,
      timeInMatch: args.timeInMatch,
    });

    await adjustKillEventsMetadata(ctx, {
      totalKillEvents: 1,
      upsetKillEvents: isUpset ? 1 : 0,
    });
  },
});

// Batch store kill events (more efficient, with duplicate checking)
export const storeKillEventsBatch = internalMutation({
  args: {
    events: v.array(v.object({
      importId: v.id("thirdPartyImports"),
      sessionId: v.string(),
      killerDiscordId: v.string(),
      killerPlayerId: v.optional(v.id("players")),
      killerTier: v.optional(v.string()),
      victimDiscordId: v.string(),
      victimPlayerId: v.optional(v.id("players")),
      victimTier: v.optional(v.string()),
      eventType: v.union(v.literal("elimination"), v.literal("knock")),
      weapon: v.optional(v.string()),
      timeInMatch: v.optional(v.number()),
      knockedBy: v.optional(v.string()),
    })),
    skipDuplicateCheck: v.optional(v.boolean()), // Skip check when we know events are fresh (after delete)
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;
    let upsetInserted = 0;

    for (const event of args.events) {
      // Check for duplicate (same import, session, killer, victim)
      // Only check if skipDuplicateCheck is not set
      if (!args.skipDuplicateCheck) {
        const existing = await ctx.db
          .query("matchKillEvents")
          .withIndex("by_unique_kill", (q) =>
            q.eq("importId", event.importId)
              .eq("sessionId", event.sessionId)
              .eq("killerDiscordId", event.killerDiscordId)
              .eq("victimDiscordId", event.victimDiscordId)
          )
          .filter((q) =>
            // Also match on timeInMatch and eventType if provided
            q.and(
              event.timeInMatch !== undefined
                ? q.eq(q.field("timeInMatch"), event.timeInMatch)
                : true,
              q.eq(q.field("eventType"), event.eventType)
            )
          )
          .first();
        
        if (existing) {
          skipped++;
          continue;
        }
      }
      
      const isUpset = isUpsetKill(event.killerTier, event.victimTier);
      const tierDiff = calculateTierDifference(event.killerTier, event.victimTier);
      
      await ctx.db.insert("matchKillEvents", {
        importId: event.importId,
        sessionId: event.sessionId,
        killerDiscordId: event.killerDiscordId,
        killerPlayerId: event.killerPlayerId,
        killerTier: event.killerTier,
        victimDiscordId: event.victimDiscordId,
        victimPlayerId: event.victimPlayerId,
        victimTier: event.victimTier,
        isUpset,
        tierDifference: tierDiff,
        eventType: event.eventType,
        weapon: event.weapon,
        timeInMatch: event.timeInMatch,
        knockedBy: event.knockedBy,
      });
      inserted++;
      if (isUpset) {
        upsetInserted++;
      }
    }

    if (inserted > 0) {
      await adjustKillEventsMetadata(ctx, {
        totalKillEvents: inserted,
        upsetKillEvents: upsetInserted,
      });
    }

    return { inserted, skipped };
  },
});

// Delete kill events for a specific import (for re-syncing)
export const deleteKillEventsForImport = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args) => {
    const batchSize = 500;
    let deleted = 0;
    let upsetDeleted = 0;

    // Delete in batches via .take(); each batch removes rows so the next .take() advances.
    while (true) {
      const events = await ctx.db
        .query("matchKillEvents")
        .withIndex("by_import", (q) => q.eq("importId", args.importId))
        .take(batchSize);

      if (events.length === 0) {
        break;
      }

      for (const event of events) {
        if (event.isUpset) {
          upsetDeleted++;
        }
        await ctx.db.delete(event._id);
        deleted++;
      }
    }

    if (deleted > 0) {
      await adjustKillEventsMetadata(ctx, {
        totalKillEvents: -deleted,
        upsetKillEvents: -upsetDeleted,
      });
    }

    return { deleted };
  },
});

// Query upset kills with pagination and filters
export const getUpsetKills = query({
  args: {
    paginationOpts: paginationOptsValidator,
    killerTier: v.optional(v.string()),
    victimTier: v.optional(v.string()),
    killerPlayerId: v.optional(v.id("players")),
    victimPlayerId: v.optional(v.id("players")),
    minTierDifference: v.optional(v.number()),
    eventType: v.optional(v.union(v.literal("elimination"), v.literal("knock"))),
  },
  handler: async (ctx, args) => {
    // Query only upsets
    const query = ctx.db
      .query("matchKillEvents")
      .withIndex("by_upset", (q) => q.eq("isUpset", true))
      .order("desc");
    
    const results = await query.paginate(args.paginationOpts);
    
    // Apply filters in memory (can't do complex filtering with single index)
    let filtered = results.page;
    
    if (args.killerTier) {
      filtered = filtered.filter(e => e.killerTier === args.killerTier);
    }
    if (args.victimTier) {
      filtered = filtered.filter(e => e.victimTier === args.victimTier);
    }
    if (args.killerPlayerId) {
      filtered = filtered.filter(e => e.killerPlayerId === args.killerPlayerId);
    }
    if (args.victimPlayerId) {
      filtered = filtered.filter(e => e.victimPlayerId === args.victimPlayerId);
    }
    if (args.minTierDifference !== undefined) {
      filtered = filtered.filter(e => e.tierDifference >= args.minTierDifference!);
    }
    if (args.eventType) {
      filtered = filtered.filter(e => e.eventType === args.eventType);
    }
    
    // Enrich with player names
    const enriched = await Promise.all(filtered.map(async (event) => {
      const killer = event.killerPlayerId 
        ? await ctx.db.get(event.killerPlayerId)
        : null;
      const victim = event.victimPlayerId
        ? await ctx.db.get(event.victimPlayerId)
        : null;
      const importRecord = await ctx.db.get(event.importId);
      
      return {
        ...event,
        killerName: killer?.discordUsername || killer?.epicUsername || event.killerDiscordId,
        killerEpicUsername: killer?.epicUsername,
        victimName: victim?.discordUsername || victim?.epicUsername || event.victimDiscordId,
        victimEpicUsername: victim?.epicUsername,
        eventName: importRecord?.eventName || "Unknown Event",
        eventDate: importRecord?.eventDate,
      };
    }));
    
    return {
      ...results,
      page: enriched,
    };
  },
});

// Search upset kills by player name (fetches more results to search across)
export const searchUpsetKillsByPlayer = query({
  args: {
    playerSearch: v.string(),
    killerTier: v.optional(v.string()),
    victimTier: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.playerSearch || args.playerSearch.length < 2) {
      return [];
    }
    
    const searchLower = args.playerSearch.toLowerCase();
    const limit = args.limit || 50;
    
    // Fetch a large batch of upset kills to search through
    const allUpsets = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_upset", (q) => q.eq("isUpset", true))
      .order("desc")
      .take(2000); // Fetch enough to find matches
    
    // Apply tier filters first (cheap operation)
    let filtered = allUpsets;
    if (args.killerTier) {
      filtered = filtered.filter(e => e.killerTier === args.killerTier);
    }
    if (args.victimTier) {
      filtered = filtered.filter(e => e.victimTier === args.victimTier);
    }
    
    // Get unique player IDs involved
    const playerIds = new Set<Id<"players">>();
    for (const event of filtered) {
      if (event.killerPlayerId) playerIds.add(event.killerPlayerId);
      if (event.victimPlayerId) playerIds.add(event.victimPlayerId);
    }
    
    // Batch fetch all players
    const playerMap = new Map<Id<"players">, { discordUsername?: string; epicUsername?: string }>();
    for (const playerId of playerIds) {
      const player = await ctx.db.get(playerId);
      if (player) {
        playerMap.set(playerId, {
          discordUsername: player.discordUsername,
          epicUsername: player.epicUsername,
        });
      }
    }
    
    // Filter by player name match
    const matchingEvents: typeof filtered = [];
    for (const event of filtered) {
      const killer = event.killerPlayerId ? playerMap.get(event.killerPlayerId) : null;
      const victim = event.victimPlayerId ? playerMap.get(event.victimPlayerId) : null;
      
      const killerName = killer?.discordUsername || killer?.epicUsername || event.killerDiscordId;
      const victimName = victim?.discordUsername || victim?.epicUsername || event.victimDiscordId;
      
      const killerMatches = killerName.toLowerCase().includes(searchLower) ||
        (killer?.epicUsername && killer.epicUsername.toLowerCase().includes(searchLower));
      const victimMatches = victimName.toLowerCase().includes(searchLower) ||
        (victim?.epicUsername && victim.epicUsername.toLowerCase().includes(searchLower));
      
      if (killerMatches || victimMatches) {
        matchingEvents.push(event);
        if (matchingEvents.length >= limit) break;
      }
    }
    
    // Enrich the matching results
    const enriched = await Promise.all(matchingEvents.map(async (event) => {
      const killer = event.killerPlayerId ? playerMap.get(event.killerPlayerId) : null;
      const victim = event.victimPlayerId ? playerMap.get(event.victimPlayerId) : null;
      const importRecord = await ctx.db.get(event.importId);
      
      return {
        ...event,
        killerName: killer?.discordUsername || killer?.epicUsername || event.killerDiscordId,
        killerEpicUsername: killer?.epicUsername,
        victimName: victim?.discordUsername || victim?.epicUsername || event.victimDiscordId,
        victimEpicUsername: victim?.epicUsername,
        eventName: importRecord?.eventName || "Unknown Event",
        eventDate: importRecord?.eventDate,
      };
    }));
    
    return enriched;
  },
});

// Get summary stats for upset kills (from cache for instant load)
export const getUpsetKillsStats = query({
  args: {},
  handler: async (ctx) => {
    // Read from cache for instant load
    const cache = await ctx.db.query("upsetKillsStatsCache").first();
    
    if (cache) {
      return {
        totalUpsetKills: cache.totalUpsetKills,
        totalKillEvents: cache.totalKillEvents,
        upsetPercentage: cache.upsetPercentage,
        byKillerTier: cache.byKillerTier as Record<string, number>,
        byVictimTier: cache.byVictimTier as Record<string, number>,
        byTierDiff: Object.fromEntries(
          Object.entries(cache.byTierDiff).map(([k, v]) => [Number(k), v])
        ) as Record<number, number>,
        topUpsetKillers: cache.topUpsetKillers,
        topUpsetVictims: cache.topUpsetVictims,
        lastUpdated: cache.lastUpdated,
        isCached: true,
      };
    }
    
    // Return empty stats if no cache (user needs to rebuild)
    return {
      totalUpsetKills: 0,
      totalKillEvents: 0,
      upsetPercentage: "0",
      byKillerTier: {} as Record<string, number>,
      byVictimTier: {} as Record<string, number>,
      byTierDiff: {} as Record<number, number>,
      topUpsetKillers: [],
      topUpsetVictims: [],
      lastUpdated: null,
      isCached: false,
    };
  },
});

// Rebuild the upset kills stats cache
export const rebuildStatsCache = mutation({
  args: {},
  handler: async (ctx) => {
    const agg = await aggregateUpsetKills(ctx);
    const totalEventsCount = await countMatchKillEvents(ctx);

    const { byKillerTier, byVictimTier, byTierDiff, playerUpsetCounts } = agg;

    // Get top upset killers (most upsets)
    const topKillers = Object.entries(playerUpsetCounts)
      .filter(([, data]) => data.playerId)
      .sort((a, b) => b[1].kills - a[1].kills)
      .slice(0, 10);

    // Enrich top killers with player names
    const enrichedTopKillers = await Promise.all(topKillers.map(async ([discordId, data]) => {
      const player = data.playerId ? await ctx.db.get(data.playerId) : null;
      return {
        discordId,
        playerId: data.playerId,
        upsetKills: data.kills,
        upsetDeaths: data.deaths,
        playerName: player?.discordUsername || player?.epicUsername || discordId,
        tier: player?.tier,
      };
    }));

    // Get players who die most to upsets (higher tier players dying to lower)
    const topVictims = Object.entries(playerUpsetCounts)
      .filter(([, data]) => data.playerId)
      .sort((a, b) => b[1].deaths - a[1].deaths)
      .slice(0, 10);

    const enrichedTopVictims = await Promise.all(topVictims.map(async ([discordId, data]) => {
      const player = data.playerId ? await ctx.db.get(data.playerId) : null;
      return {
        discordId,
        playerId: data.playerId,
        upsetKills: data.kills,
        upsetDeaths: data.deaths,
        playerName: player?.discordUsername || player?.epicUsername || discordId,
        tier: player?.tier,
      };
    }));

    const upsetPercentage = totalEventsCount > 0
      ? ((agg.upsetCount / totalEventsCount) * 100).toFixed(2)
      : "0";

    // Delete existing cache and insert new
    const existingCache = await ctx.db.query("upsetKillsStatsCache").first();
    if (existingCache) {
      await ctx.db.delete(existingCache._id);
    }

    await ctx.db.insert("upsetKillsStatsCache", {
      totalUpsetKills: agg.upsetCount,
      totalKillEvents: totalEventsCount,
      upsetPercentage,
      byKillerTier: {
        S: byKillerTier["S"],
        A: byKillerTier["A"],
        B: byKillerTier["B"],
        C: byKillerTier["C"],
        D: byKillerTier["D"],
        Unknown: byKillerTier["Unknown"],
      },
      byVictimTier: {
        S: byVictimTier["S"],
        A: byVictimTier["A"],
        B: byVictimTier["B"],
        C: byVictimTier["C"],
        D: byVictimTier["D"],
        Unknown: byVictimTier["Unknown"],
      },
      byTierDiff,
      topUpsetKillers: enrichedTopKillers,
      topUpsetVictims: enrichedTopVictims,
      lastUpdated: Date.now(),
    });

    await syncKillEventsMetadata(ctx, {
      totalKillEvents: totalEventsCount,
      upsetKillEvents: agg.upsetCount,
    });

    return {
      totalUpsetKills: agg.upsetCount,
      totalKillEvents: totalEventsCount,
      topKillersCount: enrichedTopKillers.length,
      topVictimsCount: enrichedTopVictims.length,
    };
  },
});

// Get upset kills for a specific player (for player profile)
export const getPlayerUpsetKills = query({
  args: {
    playerId: v.id("players"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Get kills where this player was the killer (upsets they made)
    const asKiller = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_killer_player", (q) => q.eq("killerPlayerId", args.playerId))
      .filter((q) => q.eq(q.field("isUpset"), true))
      .collect();
    
    // Get kills where this player was the victim (upsets against them)
    const asVictim = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_victim_player", (q) => q.eq("victimPlayerId", args.playerId))
      .filter((q) => q.eq(q.field("isUpset"), true))
      .collect();
    
    // Enrich with names
    const enrichKills = async (kills: typeof asKiller, type: "killer" | "victim") => {
      return Promise.all(kills.map(async (event) => {
        const otherPlayerId = type === "killer" ? event.victimPlayerId : event.killerPlayerId;
        const otherPlayer = otherPlayerId ? await ctx.db.get(otherPlayerId) : null;
        const importRecord = await ctx.db.get(event.importId);
        
        return {
          ...event,
          otherPlayerName: otherPlayer?.discordUsername || otherPlayer?.epicUsername || 
            (type === "killer" ? event.victimDiscordId : event.killerDiscordId),
          otherPlayerTier: type === "killer" ? event.victimTier : event.killerTier,
          eventName: importRecord?.eventName || "Unknown Event",
        };
      }));
    };
    
    return {
      upsetKillsMade: await enrichKills(asKiller, "killer"),
      upsetDeathsSuffered: await enrichKills(asVictim, "victim"),
      stats: {
        totalUpsetKills: asKiller.length,
        totalUpsetDeaths: asVictim.length,
      },
    };
  },
});

// Check if kill events have been cached for an import
export const hasKillEventsForImport = query({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args) => {
    const firstEvent = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .first();
    
    return !!firstEvent;
  },
});

// Get imports that need kill events backfilled (have matchDataSynced but no kill events)
export const getImportsNeedingBackfill = query({
  args: {},
  handler: async (ctx) => {
    // Get all Yunite API imports with match data synced
    const allImports = await ctx.db
      .query("thirdPartyImports")
      .filter((q) => q.eq(q.field("source"), "Yunite"))
      .collect();
    
    // Filter to API imports (yunite- prefix) with matchDataSynced
    const syncedImports = allImports.filter(
      (imp) => imp.leaderboardId.startsWith("yunite-") && imp.matchDataSynced
    );
    
    // Check which imports already have kill events
    const importsNeedingBackfill: typeof syncedImports = [];
    
    for (const imp of syncedImports) {
      const hasEvents = await ctx.db
        .query("matchKillEvents")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .first();
      
      if (!hasEvents) {
        importsNeedingBackfill.push(imp);
      }
    }
    
    return {
      needsBackfill: importsNeedingBackfill,
      totalSynced: syncedImports.length,
      alreadyProcessed: syncedImports.length - importsNeedingBackfill.length,
    };
  },
});

// Get ALL kills for a specific player (both as killer and victim, including non-upsets)
export const getAllPlayerKills = query({
  args: {
    playerId: v.id("players"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      return {
        kills: [],
        deaths: [],
        stats: {
          totalKills: 0,
          totalDeaths: 0,
          upsetKills: 0,
          upsetDeaths: 0,
          kdRatio: "0.00",
        },
        playerName: "Unknown",
        playerTier: undefined,
      };
    }
    
    // Get all kills where this player was the killer
    const asKiller = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_killer_player", (q) => q.eq("killerPlayerId", args.playerId))
      .order("desc")
      .collect();
    
    // Get all kills where this player was the victim
    const asVictim = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_victim_player", (q) => q.eq("victimPlayerId", args.playerId))
      .order("desc")
      .collect();
    
    // Enrich kills with opponent info
    const enrichKills = async (kills: typeof asKiller, role: "killer" | "victim") => {
      return Promise.all(kills.map(async (event) => {
        const opponentPlayerId = role === "killer" ? event.victimPlayerId : event.killerPlayerId;
        const opponent = opponentPlayerId ? await ctx.db.get(opponentPlayerId) : null;
        const importRecord = await ctx.db.get(event.importId);
        
        return {
          _id: event._id,
          sessionId: event.sessionId,
          opponentPlayerId,
          opponentName: opponent?.discordUsername || opponent?.epicUsername || 
            (role === "killer" ? event.victimDiscordId : event.killerDiscordId),
          opponentTier: role === "killer" ? event.victimTier : event.killerTier,
          playerTier: role === "killer" ? event.killerTier : event.victimTier,
          isUpset: event.isUpset,
          tierDifference: event.tierDifference,
          eventType: event.eventType,
          weapon: event.weapon,
          timeInMatch: event.timeInMatch,
          eventName: importRecord?.eventName || "Unknown Event",
          eventDate: importRecord?.eventDate,
          _creationTime: event._creationTime,
        };
      }));
    };
    
    const enrichedKills = await enrichKills(asKiller, "killer");
    const enrichedDeaths = await enrichKills(asVictim, "victim");
    
    // Calculate stats
    const upsetKills = asKiller.filter(k => k.isUpset).length;
    const upsetDeaths = asVictim.filter(k => k.isUpset).length;
    const kdRatio = asVictim.length > 0 
      ? (asKiller.length / asVictim.length).toFixed(2)
      : asKiller.length > 0 ? "∞" : "0.00";
    
    return {
      kills: enrichedKills,
      deaths: enrichedDeaths,
      stats: {
        totalKills: asKiller.length,
        totalDeaths: asVictim.length,
        upsetKills,
        upsetDeaths,
        kdRatio,
      },
      playerName: player.discordUsername || player.epicUsername || "Unknown",
      playerTier: player.tier,
    };
  },
});

// Remove duplicate kill events from the database
// A duplicate has the same import, session, killer, victim (and timeInMatch if present)
export const removeDuplicateKillEvents = mutation({
  args: {},
  handler: async (ctx) => {
    const imports = await ctx.db.query("thirdPartyImports").collect();

    let totalEvents = 0;
    let duplicatesRemoved = 0;
    let upsetDuplicatesRemoved = 0;

    for (const imp of imports) {
      const result = await dedupeKillEventsForImport(ctx, imp._id);
      totalEvents += result.total;
      duplicatesRemoved += result.duplicatesRemoved;
      upsetDuplicatesRemoved += result.upsetDuplicatesRemoved;
    }

    if (duplicatesRemoved > 0) {
      await adjustKillEventsMetadata(ctx, {
        totalKillEvents: -duplicatesRemoved,
        upsetKillEvents: -upsetDuplicatesRemoved,
      });
    }

    return {
      totalEvents,
      duplicatesRemoved,
      uniqueEvents: totalEvents - duplicatesRemoved,
    };
  },
});

// Head-to-head kill lookup between two players
export const getHeadToHead = query({
  args: {
    playerAId: v.id("players"),
    playerBId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const playerA = await ctx.db.get(args.playerAId);
    const playerB = await ctx.db.get(args.playerBId);
    if (!playerA || !playerB) return null;

    // A killed B
    const aKilledB = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_killer_player", (q) => q.eq("killerPlayerId", args.playerAId))
      .filter((q) => q.eq(q.field("victimPlayerId"), args.playerBId))
      .collect();

    // B killed A
    const bKilledA = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_killer_player", (q) => q.eq("killerPlayerId", args.playerBId))
      .filter((q) => q.eq(q.field("victimPlayerId"), args.playerAId))
      .collect();

    // Enrich with event names
    const enrichEvents = async (events: typeof aKilledB) => {
      return Promise.all(events.map(async (e) => {
        const imp = await ctx.db.get(e.importId);
        return {
          _id: e._id,
          sessionId: e.sessionId,
          eventType: e.eventType,
          weapon: e.weapon,
          timeInMatch: e.timeInMatch,
          isUpset: e.isUpset,
          killerTier: e.killerTier,
          victimTier: e.victimTier,
          eventName: imp?.eventName || "Unknown",
          eventDate: imp?.eventDate,
        };
      }));
    };

    return {
      playerA: {
        id: playerA._id,
        name: playerA.discordUsername || playerA.epicUsername || "Unknown",
        tier: playerA.tier,
      },
      playerB: {
        id: playerB._id,
        name: playerB.discordUsername || playerB.epicUsername || "Unknown",
        tier: playerB.tier,
      },
      aKilledBCount: aKilledB.length,
      bKilledACount: bKilledA.length,
      aKilledBEvents: await enrichEvents(aKilledB),
      bKilledAEvents: await enrichEvents(bKilledA),
    };
  },
});

// Search players by name for head-to-head picker
export const searchPlayersByName = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    if (!args.search || args.search.length < 2) return [];
    const searchLower = args.search.toLowerCase();
    // Only scan active players (much smaller set)
    const players = filterVisibleMembers(
      await ctx.db
        .query("players")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
    );
    return players
      .filter((p) => {
        const dn = p.discordUsername?.toLowerCase() || "";
        const en = p.epicUsername?.toLowerCase() || "";
        return dn.includes(searchLower) || en.includes(searchLower);
      })
      .slice(0, 15)
      .map((p) => ({
        _id: p._id,
        name: p.discordUsername || p.epicUsername || "Unknown",
        epicUsername: p.epicUsername,
        tier: p.tier,
      }));
  },
});

// Get a player's top killers and top victims (who they die to most / kill most)
export const getPlayerTopKillersAndVictims = query({
  args: {
    playerId: v.id("players"),
    topN: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return null;
    const topN = args.topN || 5;

    // All kills by this player
    const asKiller = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_killer_player", (q) => q.eq("killerPlayerId", args.playerId))
      .collect();

    // All deaths of this player
    const asVictim = await ctx.db
      .query("matchKillEvents")
      .withIndex("by_victim_player", (q) => q.eq("victimPlayerId", args.playerId))
      .collect();

    // Tally victims (people this player killed the most)
    const victimCounts = new Map<string, { count: number; playerId: Id<"players"> | undefined }>();
    for (const kill of asKiller) {
      const key = kill.victimPlayerId ?? kill.victimDiscordId;
      const existing = victimCounts.get(String(key));
      victimCounts.set(String(key), {
        count: (existing?.count ?? 0) + 1,
        playerId: kill.victimPlayerId ?? existing?.playerId,
      });
    }

    // Tally killers (people who killed this player the most)
    const killerCounts = new Map<string, { count: number; playerId: Id<"players"> | undefined }>();
    for (const death of asVictim) {
      const key = death.killerPlayerId ?? death.killerDiscordId;
      const existing = killerCounts.get(String(key));
      killerCounts.set(String(key), {
        count: (existing?.count ?? 0) + 1,
        playerId: death.killerPlayerId ?? existing?.playerId,
      });
    }

    // Sort and take top N
    const sortedVictims = [...victimCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, topN);
    const sortedKillers = [...killerCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, topN);

    // Enrich with player names
    const enrichEntry = async (entry: [string, { count: number; playerId: Id<"players"> | undefined }]) => {
      const [key, data] = entry;
      const p = data.playerId ? await ctx.db.get(data.playerId) : null;
      return {
        key,
        playerId: data.playerId,
        count: data.count,
        name: p?.discordUsername || p?.epicUsername || key,
        tier: p?.tier,
      };
    };

    return {
      player: {
        id: player._id,
        name: player.discordUsername || player.epicUsername || "Unknown",
        tier: player.tier,
      },
      totalKills: asKiller.length,
      totalDeaths: asVictim.length,
      topVictims: await Promise.all(sortedVictims.map(enrichEntry)),
      topKillers: await Promise.all(sortedKillers.map(enrichEntry)),
    };
  },
});

// Get ALL kill events (full killfeed with knocked/finished/eliminated states)
// Uses stored knockedBy field to determine state without expensive cross-queries
export const getAllEliminations = query({
  args: {
    paginationOpts: paginationOptsValidator,
    killerTier: v.optional(v.string()),
    victimTier: v.optional(v.string()),
    killState: v.optional(v.union(
      v.literal("knocked"),
      v.literal("finished"),
      v.literal("eliminated"),
    )),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("matchKillEvents")
      .order("desc")
      .paginate(args.paginationOpts);

    let filtered = results.page;

    if (args.killerTier) {
      filtered = filtered.filter(e => e.killerTier === args.killerTier);
    }
    if (args.victimTier) {
      filtered = filtered.filter(e => e.victimTier === args.victimTier);
    }
    if (args.killState === "knocked") {
      filtered = filtered.filter(e => e.eventType === "knock");
    } else if (args.killState === "finished" || args.killState === "eliminated") {
      filtered = filtered.filter(e => e.eventType === "elimination");
    }

    // Batch-fetch unique player IDs and import IDs
    const playerIdSet = new Set<string>();
    const importIdSet = new Set<string>();
    for (const e of filtered) {
      if (e.killerPlayerId) playerIdSet.add(e.killerPlayerId);
      if (e.victimPlayerId) playerIdSet.add(e.victimPlayerId);
      importIdSet.add(e.importId);
    }

    const playerCache = new Map<string, { discordUsername?: string; epicUsername?: string }>();
    for (const pid of playerIdSet) {
      const p = await ctx.db.get(pid as Id<"players">);
      if (p) playerCache.set(pid, { discordUsername: p.discordUsername, epicUsername: p.epicUsername });
    }

    const importCache = new Map<string, { eventName?: string; eventDate?: string }>();
    for (const iid of importIdSet) {
      const imp = await ctx.db.get(iid as Id<"thirdPartyImports">);
      if (imp) importCache.set(iid, { eventName: imp.eventName, eventDate: imp.eventDate });
    }

    const enriched = filtered.map((event) => {
      const killer = event.killerPlayerId ? playerCache.get(event.killerPlayerId) : null;
      const victim = event.victimPlayerId ? playerCache.get(event.victimPlayerId) : null;
      const imp = importCache.get(event.importId);

      // Compute kill state from stored data
      let killState: "knocked" | "finished" | "eliminated";
      if (event.eventType === "knock") {
        killState = "knocked";
      } else if (event.knockedBy && event.knockedBy !== event.killerDiscordId) {
        // Victim was knocked by someone else → this is a finish
        killState = "finished";
      } else {
        killState = "eliminated";
      }

      return {
        ...event,
        killerName: killer?.discordUsername || killer?.epicUsername || event.killerDiscordId,
        killerEpicUsername: killer?.epicUsername,
        victimName: victim?.discordUsername || victim?.epicUsername || event.victimDiscordId,
        victimEpicUsername: victim?.epicUsername,
        eventName: imp?.eventName || "Unknown Event",
        eventDate: imp?.eventDate,
        killState,
      };
    });

    // Apply killState filter after computation (for finished vs eliminated)
    let finalPage = enriched;
    if (args.killState) {
      finalPage = enriched.filter(e => e.killState === args.killState);
    }

    return {
      ...results,
      page: finalPage,
    };
  },
});

// Clear all kill events data (batched to handle large datasets)
export const clearAllKillEvents = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 500;
    
    // Get a batch of events to delete
    const events = await ctx.db
      .query("matchKillEvents")
      .take(batchSize);
    
    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    if (events.length > 0) {
      const upsetDeleted = events.filter((event) => event.isUpset).length;
      await adjustKillEventsMetadata(ctx, {
        totalKillEvents: -events.length,
        upsetKillEvents: -upsetDeleted,
      });
    }

    // Check if there are more events
    const remaining = await ctx.db.query("matchKillEvents").first();
    const hasMore = !!remaining;

    // Clear stats cache when fully empty
    if (!hasMore) {
      const cache = await ctx.db.query("upsetKillsStatsCache").first();
      if (cache) {
        await ctx.db.delete(cache._id);
      }
    }
    
    return {
      deletedInBatch: events.length,
      hasMore,
    };
  },
});

// One-time / manual backfill for matchKillEventsMetadata from paginated scans
export const backfillKillEventsMetadata = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const totalKillEvents = await countMatchKillEvents(ctx);
    const agg = await aggregateUpsetKills(ctx);

    await syncKillEventsMetadata(ctx, {
      totalKillEvents,
      upsetKillEvents: agg.upsetCount,
    });

    return {
      totalKillEvents,
      totalUpsetKillEvents: agg.upsetCount,
    };
  },
});
