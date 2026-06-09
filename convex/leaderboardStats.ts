import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { internal } from "./_generated/api";

export type LeaderboardStatRow = {
  importId: Id<"thirdPartyImports">;
  eventName: string;
  eventDate?: string;
  eventType: string | null;
  mode: string | null;
  isNoMoneyEvent: boolean;
  totalTeams: number;
  top3Players: number;
  top4Players: number;
  top5Players: number;
  totalPlayers: number;
  top3Percentage: number;
  top4Percentage: number;
  top5Percentage: number;
  tierSPlayers: number;
  tierAPlayers: number;
  tierBPlayers: number;
  tierCPlayers: number;
};

async function computeLeaderboardStats(
  ctx: QueryCtx | MutationCtx,
): Promise<LeaderboardStatRow[]> {
  const allPlayers = await ctx.db.query("players").collect();
  const playerDiscordMap = new Map<string, string>();
  const playerTierMap = new Map<string, string>();

  for (const p of allPlayers) {
    if (p.discordUserId) playerDiscordMap.set(p._id, p.discordUserId);
    if (p.tier) playerTierMap.set(p._id, p.tier);
  }

  const imports = await ctx.db.query("thirdPartyImports").collect();
  const events = await ctx.db.query("events").collect();
  const eventMap = new Map<string, Doc<"events">>();
  for (const e of events) {
    eventMap.set(e._id, e);
  }

  const stats: LeaderboardStatRow[] = [];

  for (const imp of imports) {
    const event = imp.eventId ? eventMap.get(imp.eventId) : null;

    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", imp._id))
      .collect();

    const allDiscordIds = new Set<string>();
    const top3DiscordIds = new Set<string>();
    const top4DiscordIds = new Set<string>();
    const top5DiscordIds = new Set<string>();
    const tierSDiscordIds = new Set<string>();
    const tierADiscordIds = new Set<string>();
    const tierBDiscordIds = new Set<string>();
    const tierCDiscordIds = new Set<string>();

    for (const result of results) {
      if (result.playerId) {
        const discordId = playerDiscordMap.get(result.playerId);
        const tier = playerTierMap.get(result.playerId);

        if (discordId) {
          allDiscordIds.add(discordId);
          if (tier === "S") tierSDiscordIds.add(discordId);
          else if (tier === "A") tierADiscordIds.add(discordId);
          else if (tier === "B") tierBDiscordIds.add(discordId);
          else if (tier === "C") tierCDiscordIds.add(discordId);

          if (result.placement <= 3) top3DiscordIds.add(discordId);
          if (result.placement <= 4) top4DiscordIds.add(discordId);
          if (result.placement <= 5) top5DiscordIds.add(discordId);
        }
      }
    }

    const totalPlayers = allDiscordIds.size;
    const top3Players = top3DiscordIds.size;
    const top4Players = top4DiscordIds.size;
    const top5Players = top5DiscordIds.size;

    const teamIds = new Set<string>();
    for (const result of results) {
      if (result.teamId) {
        teamIds.add(result.teamId);
      } else {
        teamIds.add(`${result.placement}_${result.points}`);
      }
    }

    const top5Percentage =
      totalPlayers > 0 ? Math.round((top5Players / totalPlayers) * 100 * 10) / 10 : 0;
    const top4Percentage =
      totalPlayers > 0 ? Math.round((top4Players / totalPlayers) * 100 * 10) / 10 : 0;
    const top3Percentage =
      totalPlayers > 0 ? Math.round((top3Players / totalPlayers) * 100 * 10) / 10 : 0;

    stats.push({
      importId: imp._id,
      eventName: imp.eventName,
      eventDate: imp.eventDate,
      eventType: event?.type ?? null,
      mode: event?.mode ?? null,
      isNoMoneyEvent: event?.isNoMoneyEvent ?? false,
      totalTeams: teamIds.size,
      top3Players,
      top4Players,
      top5Players,
      totalPlayers,
      top3Percentage,
      top4Percentage,
      top5Percentage,
      tierSPlayers: tierSDiscordIds.size,
      tierAPlayers: tierADiscordIds.size,
      tierBPlayers: tierBDiscordIds.size,
      tierCPlayers: tierCDiscordIds.size,
    });
  }

  return stats.sort((a, b) => {
    if (a.eventDate && b.eventDate) {
      return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
    }
    return 0;
  });
}

export const getLeaderboardStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { available: false as const, stats: [] as LeaderboardStatRow[], message: "Unauthorized" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || user.role !== "admin") {
      return { available: false as const, stats: [] as LeaderboardStatRow[], message: "Forbidden" };
    }

    const cache = await ctx.db.query("leaderboardStatsCache").first();
    if (cache) {
      return { available: true as const, stats: cache.stats, lastUpdated: cache.lastUpdated };
    }

    return {
      available: false as const,
      stats: [] as LeaderboardStatRow[],
      message:
        "Leaderboard stats cache is empty. Use Rebuild leaderboard cache in admin tools.",
    };
  },
});

export const getLeaderboardStatsCacheMeta = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const cache = await ctx.db.query("leaderboardStatsCache").first();
    return cache ? { lastUpdated: cache.lastUpdated, rowCount: cache.stats.length } : null;
  },
});

export const rebuildLeaderboardStatsCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.leaderboardStats.storeLeaderboardStatsCache, {});
  },
});

export const storeLeaderboardStatsCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stats = await computeLeaderboardStats(ctx);
    const existing = await ctx.db.query("leaderboardStatsCache").first();
    const payload = { stats, lastUpdated: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("leaderboardStatsCache", payload);
    }
  },
});

// Tier Impact Analytics query
export const getTierImpactStats = query({
  args: {
    hideNoMoney: v.optional(v.boolean()),
    hideReload: v.optional(v.boolean()),
    last90Days: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    perEventData: Array<{
      eventName: string;
      eventDate: string;
      eventType: string;
      totalPlayers: number;
      tierStats: Record<string, { count: number; top3: number; top5: number; totalPlacement: number; totalElims: number }>;
    }>;
    impactMetrics: Record<string, {
      lobbyShare: number;
      top3Share: number;
      top5Share: number;
      impactIndex3: number;
      impactIndex5: number;
      avgPlacement: number;
      avgElims: number;
      totalAppearances: number;
      totalTop3: number;
      totalTop5: number;
      eventCount: number;
    }>;
    totalEvents: number;
    totalAllPlayers: number;
    tierPopulation: Record<string, number>;
    totalPopulation: number;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return null;
    }

    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const undefinedStatusPlayers = await ctx.db
      .query("players")
      .withIndex("by_status")
      .filter((q) => q.eq(q.field("status"), undefined))
      .collect();

    const playerTierMap = new Map<string, string>();
    for (const p of [...activePlayers, ...undefinedStatusPlayers]) {
      if (p.tier) playerTierMap.set(p._id, p.tier);
    }

    const tierPopulation: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, Unknown: 0 };
    let totalPopulation = 0;
    for (const [, tier] of playerTierMap) {
      if (tier in tierPopulation) {
        tierPopulation[tier]++;
      } else {
        tierPopulation["Unknown"]++;
      }
      totalPopulation++;
    }

    const allImports = await ctx.db.query("thirdPartyImports").collect();
    const allEvents = await ctx.db.query("events").collect();
    const eventMap = new Map(allEvents.map((e) => [e._id, e]));

    const TIERS = ["S", "A", "B", "C"] as const;

    type TierBucket = { count: number; top3: number; top5: number; totalPlacement: number; totalElims: number };

    const perEventData: Array<{
      eventName: string;
      eventDate: string;
      eventType: string;
      totalPlayers: number;
      tierStats: Record<string, TierBucket>;
    }> = [];

    for (const imp of allImports) {
      if (!imp.eventId) continue;

      const event = eventMap.get(imp.eventId);
      if (!event) continue;

      if (args.hideNoMoney && event.isNoMoneyEvent) continue;
      if (args.hideReload && event.mode === "Reload") continue;

      const eventDateStr = imp.eventDate || event.startDate;
      if (args.last90Days) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        if (!eventDateStr || new Date(eventDateStr) < ninetyDaysAgo) continue;
      }

      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_matched", (q) => q.eq("importId", imp._id).eq("matched", true))
        .collect();

      if (results.length === 0) continue;

      const tierStats: Record<string, TierBucket> = {};
      for (const t of TIERS) {
        tierStats[t] = { count: 0, top3: 0, top5: 0, totalPlacement: 0, totalElims: 0 };
      }
      tierStats["Unknown"] = { count: 0, top3: 0, top5: 0, totalPlacement: 0, totalElims: 0 };

      for (const result of results) {
        if (!result.playerId) continue;
        const tier = playerTierMap.get(result.playerId) || "Unknown";
        const bucket =
          tierStats[tier] ||
          (tierStats[tier] = { count: 0, top3: 0, top5: 0, totalPlacement: 0, totalElims: 0 });

        bucket.count++;
        bucket.totalPlacement += result.placement;
        bucket.totalElims += result.eliminations || 0;
        if (result.placement <= 3) bucket.top3++;
        if (result.placement <= 5) bucket.top5++;
      }

      perEventData.push({
        eventName: imp.eventName,
        eventDate: eventDateStr || "",
        eventType: event.type,
        totalPlayers: results.length,
        tierStats,
      });
    }

    perEventData.sort(
      (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
    );

    const overallStats: Record<string, {
      totalAppearances: number;
      totalTop3: number;
      totalTop5: number;
      totalPlacement: number;
      totalElims: number;
      eventCount: number;
    }> = {};

    let totalAllPlayers = 0;
    let totalAllTop3 = 0;
    let totalAllTop5 = 0;

    for (const evt of perEventData) {
      for (const [tier, stats] of Object.entries(evt.tierStats)) {
        if (!overallStats[tier]) {
          overallStats[tier] = {
            totalAppearances: 0,
            totalTop3: 0,
            totalTop5: 0,
            totalPlacement: 0,
            totalElims: 0,
            eventCount: 0,
          };
        }
        const agg = overallStats[tier];
        agg.totalAppearances += stats.count;
        agg.totalTop3 += stats.top3;
        agg.totalTop5 += stats.top5;
        agg.totalPlacement += stats.totalPlacement;
        agg.totalElims += stats.totalElims;
        if (stats.count > 0) agg.eventCount++;

        totalAllPlayers += stats.count;
        totalAllTop3 += stats.top3;
        totalAllTop5 += stats.top5;
      }
    }

    const impactMetrics: Record<string, {
      lobbyShare: number;
      top3Share: number;
      top5Share: number;
      impactIndex3: number;
      impactIndex5: number;
      avgPlacement: number;
      avgElims: number;
      totalAppearances: number;
      totalTop3: number;
      totalTop5: number;
      eventCount: number;
    }> = {};

    for (const tier of [...TIERS, "Unknown"] as const) {
      const stats = overallStats[tier];
      if (!stats || stats.totalAppearances === 0) continue;

      const lobbyShare = totalAllPlayers > 0 ? (stats.totalAppearances / totalAllPlayers) * 100 : 0;
      const top3Share = totalAllTop3 > 0 ? (stats.totalTop3 / totalAllTop3) * 100 : 0;
      const top5Share = totalAllTop5 > 0 ? (stats.totalTop5 / totalAllTop5) * 100 : 0;

      impactMetrics[tier] = {
        lobbyShare: Math.round(lobbyShare * 10) / 10,
        top3Share: Math.round(top3Share * 10) / 10,
        top5Share: Math.round(top5Share * 10) / 10,
        impactIndex3: lobbyShare > 0 ? Math.round((top3Share / lobbyShare) * 100) / 100 : 0,
        impactIndex5: lobbyShare > 0 ? Math.round((top5Share / lobbyShare) * 100) / 100 : 0,
        avgPlacement: Math.round((stats.totalPlacement / stats.totalAppearances) * 10) / 10,
        avgElims: Math.round((stats.totalElims / stats.totalAppearances) * 10) / 10,
        totalAppearances: stats.totalAppearances,
        totalTop3: stats.totalTop3,
        totalTop5: stats.totalTop5,
        eventCount: stats.eventCount,
      };
    }

    return {
      perEventData,
      impactMetrics,
      totalEvents: perEventData.length,
      totalAllPlayers,
      tierPopulation,
      totalPopulation,
    };
  },
});
