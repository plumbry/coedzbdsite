import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";

export const getLeaderboardStats = query({
  args: {},
  handler: async (ctx) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      return [];
    }
    
    // 1. Bulk load all players into memory maps to avoid N+1 queries
    const allPlayers = await ctx.db.query("players").collect();
    const playerDiscordMap = new Map<string, string>(); // playerId -> discordUserId
    const playerTierMap = new Map<string, string>();    // playerId -> tier
    
    for (const p of allPlayers) {
      if (p.discordUserId) playerDiscordMap.set(p._id, p.discordUserId);
      if (p.tier) playerTierMap.set(p._id, p.tier);
    }
    
    // 2. Load all imports and events
    const imports = await ctx.db.query("thirdPartyImports").collect();
    const events = await ctx.db.query("events").collect();
    const eventMap = new Map<string, Doc<"events">>();
    for (const e of events) {
      eventMap.set(e._id, e);
    }
    
    // 3. Process each import using in-memory lookups (no per-result DB calls)
    const stats = [];
    
    for (const imp of imports) {
      const event = imp.eventId ? eventMap.get(imp.eventId) : null;
      
      // Load results for this import using index
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();
      
      // Count unique Discord IDs from results using in-memory player maps
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
      const tierSPlayers = tierSDiscordIds.size;
      const tierAPlayers = tierADiscordIds.size;
      const tierBPlayers = tierBDiscordIds.size;
      const tierCPlayers = tierCDiscordIds.size;
      
      // Count unique teams
      const teamIds = new Set<string>();
      for (const result of results) {
        if (result.teamId) {
          teamIds.add(result.teamId);
        } else {
          teamIds.add(`${result.placement}_${result.points}`);
        }
      }
      
      // Calculate percentages
      const top5Percentage = totalPlayers > 0 
        ? Math.round((top5Players / totalPlayers) * 100 * 10) / 10
        : 0;
      const top4Percentage = totalPlayers > 0 
        ? Math.round((top4Players / totalPlayers) * 100 * 10) / 10
        : 0;
      const top3Percentage = totalPlayers > 0 
        ? Math.round((top3Players / totalPlayers) * 100 * 10) / 10
        : 0;
      
      stats.push({
        importId: imp._id,
        eventName: imp.eventName,
        eventDate: imp.eventDate,
        eventType: event?.type || null,
        mode: event?.mode || null,
        isNoMoneyEvent: event?.isNoMoneyEvent || false,
        totalTeams: teamIds.size,
        top3Players,
        top4Players,
        top5Players,
        totalPlayers,
        top3Percentage,
        top4Percentage,
        top5Percentage,
        tierSPlayers,
        tierAPlayers,
        tierBPlayers,
        tierCPlayers,
      });
    }
    
    // Sort by event date (most recent first)
    return stats.sort((a, b) => {
      if (a.eventDate && b.eventDate) {
        return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
      }
      return 0;
    });
  },
});

// Tier Impact Analytics query
// Computes per-tier performance metrics across events efficiently using in-memory joins
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

    // 1. Bulk load all players into a playerId → tier map (active + undefined status)
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

    // 2. Count total player population by tier (for relativity / representation index)
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

    // 3. Load all imports and filter to event-linked ones
    const allImports = await ctx.db.query("thirdPartyImports").collect();

    const TIERS = ["S", "A", "B", "C"] as const;

    type TierBucket = { count: number; top3: number; top5: number; totalPlacement: number; totalElims: number };

    const perEventData: Array<{
      eventName: string;
      eventDate: string;
      eventType: string;
      totalPlayers: number;
      tierStats: Record<string, TierBucket>;
    }> = [];

    // 4. Process each import linked to an event
    for (const imp of allImports) {
      if (!imp.eventId) continue;

      const event = await ctx.db.get(imp.eventId);
      if (!event) continue;

      // Apply filters
      if (args.hideNoMoney && event.isNoMoneyEvent) continue;
      if (args.hideReload && event.mode === "Reload") continue;

      const eventDateStr = imp.eventDate || event.startDate;
      if (args.last90Days) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        if (!eventDateStr || new Date(eventDateStr) < ninetyDaysAgo) continue;
      }

      // Use the matched index for efficiency
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_matched", (q) => q.eq("importId", imp._id).eq("matched", true))
        .collect();

      if (results.length === 0) continue;

      // Initialize tier buckets
      const tierStats: Record<string, TierBucket> = {};
      for (const t of TIERS) {
        tierStats[t] = { count: 0, top3: 0, top5: 0, totalPlacement: 0, totalElims: 0 };
      }
      tierStats["Unknown"] = { count: 0, top3: 0, top5: 0, totalPlacement: 0, totalElims: 0 };

      // Bucket each result by the player's tier (in-memory join, no extra DB calls)
      for (const result of results) {
        if (!result.playerId) continue;
        const tier = playerTierMap.get(result.playerId) || "Unknown";
        const bucket = tierStats[tier] || (tierStats[tier] = { count: 0, top3: 0, top5: 0, totalPlacement: 0, totalElims: 0 });

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

    // Sort chronologically
    perEventData.sort((a, b) =>
      new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
    );

    // 5. Aggregate across all events
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
          overallStats[tier] = { totalAppearances: 0, totalTop3: 0, totalTop5: 0, totalPlacement: 0, totalElims: 0, eventCount: 0 };
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

    // 6. Compute impact index per tier
    // Impact Index = (share of top placements) / (share of lobby)
    // > 1.0 means over-represented in top finishes, < 1.0 means under-represented
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
