import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

export interface CalculatedStat {
  type: string;
  label: string;
  value?: number;
  subtitle?: string;
  players?: Array<{ name: string; value: number; metric: string }>;
  tierData?: Array<{ tier: string; count: number; percentage: number }>;
  breakdown?: Record<string, number | string>;
}

export interface CalculatedSection {
  name: string;
  tagline?: string;
  stats: CalculatedStat[];
}

// Calculate all stats for wrapped content
export const calculateAllStats = query({
  args: { year: v.number() },
  handler: async (ctx, args): Promise<CalculatedSection[]> => {
    // Get wrapped content
    const content = await ctx.db
      .query("wrappedContent")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (!content || !content.isPublished) {
      return [];
    }

    // Get all events from the year
    const allEvents = await ctx.db.query("events").collect();
    const eventsInYear = allEvents.filter((event) => {
      const year = new Date(event.startDate).getFullYear();
      return year === args.year;
    });
    const eventIdsInYear = new Set(eventsInYear.map((e) => e._id));

    const sections: CalculatedSection[] = [];

    for (const section of content.sections) {
      const sectionStats: CalculatedStat[] = [];

      for (const stat of section.stats) {
        const statResult = await calculateIndividualStat(ctx, stat, eventIdsInYear, eventsInYear);
        if (statResult) {
          sectionStats.push(statResult);
        }
      }

      sections.push({
        name: section.name,
        tagline: section.tagline,
        stats: sectionStats,
      });
    }

    return sections;
  },
});

async function calculateIndividualStat(
  ctx: {
    db: {
      query: (table: "eventResults" | "thirdPartyResults" | "players" | "playerEarnings" | "aggregateStatsCache" | "events") => {
        collect: () => Promise<unknown[]>;
        first?: () => Promise<unknown | null>;
      };
      get: (id: Id<"thirdPartyImports">) => Promise<Doc<"thirdPartyImports"> | null>;
    };
  },
  stat: { type: string; customText: string; playerCount?: number; customValue?: string },
  eventIdsInYear: Set<Id<"events">>,
  eventsInYear: Array<Doc<"events">>
): Promise<CalculatedStat | null> {
  switch (stat.type) {
    case "custom":
      return {
        type: stat.type,
        label: stat.customText,
        value: stat.customValue ? parseFloat(stat.customValue) || undefined : undefined,
        subtitle: stat.customValue && isNaN(parseFloat(stat.customValue)) ? stat.customValue : undefined,
      };

    case "totalEvents":
      return {
        type: stat.type,
        label: stat.customText,
        value: eventIdsInYear.size,
      };

    case "peakAttendance": {
      // Get top 3 events by attendance
      const sortedEvents = eventsInYear
        .filter((event) => event.totalPlayers && event.totalPlayers > 0)
        .sort((a, b) => (b.totalPlayers || 0) - (a.totalPlayers || 0))
        .slice(0, 3);

      const players = sortedEvents.map((event) => ({
        name: event.name,
        value: event.totalPlayers || 0,
        metric: "players",
      }));

      return {
        type: stat.type,
        label: stat.customText,
        players,
      };
    }

    case "playersPaid": {
      const allEarnings = (await ctx.db.query("playerEarnings").collect()) as Array<{
        playerId: Id<"players">;
      }>;
      const uniquePlayerIds = new Set(allEarnings.map((e) => e.playerId));
      return {
        type: stat.type,
        label: stat.customText,
        value: uniquePlayerIds.size,
      };
    }

    case "totalPlayers": {
      const allPlayers = (await ctx.db.query("players").collect()) as Array<{
        currentMembershipStatus?: string;
      }>;
      const activePlayers = allPlayers.filter((p) => p.currentMembershipStatus === "accepted");
      return {
        type: stat.type,
        label: stat.customText,
        value: activePlayers.length,
      };
    }

    case "tierBreakdown": {
      const allPlayers = (await ctx.db.query("players").collect()) as Array<{
        currentMembershipStatus?: string;
        tier?: string;
      }>;
      const activePlayers = allPlayers.filter((p) => p.currentMembershipStatus === "accepted");
      const tierCounts: Record<string, number> = {};

      for (const player of activePlayers) {
        if (player.tier) {
          tierCounts[player.tier] = (tierCounts[player.tier] || 0) + 1;
        }
      }

      const total = activePlayers.length;
      const tierData = Object.entries(tierCounts)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending (most to least)
        .map(([tier, count]) => ({
          tier,
          count,
          percentage: Math.round((count / total) * 100),
        }));

      return {
        type: stat.type,
        label: stat.customText,
        tierData,
      };
    }

    case "topPowerScores": {
      const allPlayers = (await ctx.db.query("players").collect()) as Array<{
        currentMembershipStatus?: string;
        powerScore?: number;
        name?: string;
        discordUsername: string;
        _id: Id<"players">;
      }>;
      const playersWithScores = allPlayers
        .filter((p) => p.currentMembershipStatus === "accepted" && p.powerScore)
        .sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0))
        .slice(0, stat.playerCount || 5);

      const players = playersWithScores.map((player) => ({
        name: player.name || player.discordUsername,
        value: Math.round(player.powerScore || 0),
        metric: "power score",
      }));

      return {
        type: stat.type,
        label: stat.customText,
        players,
      };
    }

    case "averageStatsByTier": {
      const cache = (await ctx.db.query("aggregateStatsCache").first?.()) as {
        perTierStats: Record<
          "S" | "A" | "B" | "C",
          {
            avgTotalEvents: number;
            avgAveragePlacement: number;
            avgWinRate: number;
          }
        >;
      } | null;
      if (cache) {
        const breakdown: Record<string, string | number> = {};
        for (const tier of ["S", "A", "B", "C"] as const) {
          const tierStats = cache.perTierStats[tier];
          breakdown[`${tier} Tier Avg Events`] = tierStats.avgTotalEvents.toFixed(1);
          breakdown[`${tier} Tier Avg Placement`] = tierStats.avgAveragePlacement.toFixed(1);
          breakdown[`${tier} Tier Win Rate`] = `${(tierStats.avgWinRate * 100).toFixed(1)}%`;
        }
        return {
          type: stat.type,
          label: stat.customText,
          breakdown,
        };
      }
      return null;
    }

    case "mostActiveTier": {
      // Get all active players with their tiers
      const allPlayers = (await ctx.db.query("players").collect()) as Array<{
        currentMembershipStatus?: string;
        tier?: string;
        _id: Id<"players">;
      }>;
      const activePlayers = allPlayers.filter((p) => p.currentMembershipStatus === "accepted" && p.tier);
      
      // Build map of playerId -> tier
      const playerTierMap = new Map<Id<"players">, string>();
      for (const player of activePlayers) {
        if (player.tier) {
          playerTierMap.set(player._id, player.tier);
        }
      }

      // Count events per tier
      const tierEventCounts: Record<string, number> = {};

      // Count from eventResults
      const allEventResults = (await ctx.db.query("eventResults").collect()) as Array<{
        eventId?: Id<"events">;
        playerId: Id<"players">;
      }>;
      for (const result of allEventResults) {
        if (!result.eventId || !eventIdsInYear.has(result.eventId)) continue;
        const tier = playerTierMap.get(result.playerId);
        if (tier) {
          tierEventCounts[tier] = (tierEventCounts[tier] || 0) + 1;
        }
      }

      // Count from thirdPartyResults
      const allThirdPartyResults = (await ctx.db.query("thirdPartyResults").collect()) as Array<{
        playerId?: Id<"players">;
        importId?: Id<"thirdPartyImports">;
      }>;
      for (const result of allThirdPartyResults) {
        if (!result.playerId || !result.importId) continue;
        const importData = await ctx.db.get(result.importId);
        if (!importData?.eventId || !eventIdsInYear.has(importData.eventId)) continue;
        
        const tier = playerTierMap.get(result.playerId);
        if (tier) {
          tierEventCounts[tier] = (tierEventCounts[tier] || 0) + 1;
        }
      }

      // Sort tiers by count (highest to lowest) and format as breakdown
      const breakdown: Record<string, number> = {};
      const sortedTiers = Object.entries(tierEventCounts)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .map(([tier]) => tier);

      for (const tier of sortedTiers) {
        breakdown[`${tier} Tier`] = tierEventCounts[tier];
      }

      return {
        type: stat.type,
        label: stat.customText,
        breakdown,
      };
    }

    case "eventsByType": {
      // Get all events data to access their types
      const allEvents = (await ctx.db.query("events").collect()) as Array<{
        _id: Id<"events">;
        type: string;
        startDate: string;
      }>;
      
      // Filter to events in the year and count by type
      const typeCounts: Record<string, number> = {};
      for (const event of allEvents) {
        const year = new Date(event.startDate).getFullYear();
        if (year === 2025) {
          const typeName = formatEventType(event.type);
          typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
        }
      }

      // Sort types by count (highest to lowest) and format as breakdown
      const breakdown: Record<string, number> = {};
      const sortedTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .map(([type]) => type);
      
      for (const type of sortedTypes) {
        breakdown[type] = typeCounts[type];
      }

      return {
        type: stat.type,
        label: stat.customText,
        breakdown,
      };
    }

    // Event stats require more complex logic - return null for now
    default:
      return null;
  }
}

// Helper to format event type names
function formatEventType(type: string): string {
  switch (type) {
    case "scrim":
      return "Scrim";
    case "minicup":
      return "Minicup";
    case "season":
      return "Season";
    case "mini-season":
      return "Mini-Season";
    case "random":
      return "Random";
    case "random-squads":
      return "Random Squads";
    case "random-trios":
      return "Random Trios";
    default:
      return type;
  }
}

// Helper to get player event counts
async function getPlayerEventCountsInternal(
  ctx: {
    db: {
      query: (table: "eventResults" | "thirdPartyResults") => {
        collect: () => Promise<unknown[]>;
      };
      get: (id: Id<"thirdPartyImports">) => Promise<Doc<"thirdPartyImports"> | null>;
    };
  },
  eventIdsInYear: Set<Id<"events">>
): Promise<Map<Id<"players">, number>> {
  const playerEventCounts = new Map<Id<"players">, number>();
  const allEventResults = await ctx.db.query("eventResults").collect();
  const allThirdPartyResults = await ctx.db.query("thirdPartyResults").collect();

  for (const result of allEventResults as Array<{
    eventId?: Id<"events">;
    playerId: Id<"players">;
  }>) {
    if (!result.eventId || !eventIdsInYear.has(result.eventId)) continue;
    const current = playerEventCounts.get(result.playerId) || 0;
    playerEventCounts.set(result.playerId, current + 1);
  }

  for (const result of allThirdPartyResults as Array<{
    playerId?: Id<"players">;
    importId?: Id<"thirdPartyImports">;
  }>) {
    if (!result.playerId || !result.importId) continue;
    const importData = await ctx.db.get(result.importId);
    if (!importData?.eventId || !eventIdsInYear.has(importData.eventId)) continue;

    const current = playerEventCounts.get(result.playerId) || 0;
    playerEventCounts.set(result.playerId, current + 1);
  }

  return playerEventCounts;
}
