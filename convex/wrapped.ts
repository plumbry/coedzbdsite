import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { VALID_STAT_IDS } from "./wrappedStatsConfig.js";

type StatType = "totalEvents" | "peakAttendance" | "playersPaid" | "mostActive" | "mostTop5s" | "mostWins" | "highestWinRate" | "mostEliminations";

interface StatResult {
  type: StatType;
  label: string;
  value?: number;
  subtitle?: string;
  players?: Array<{ name: string; value: number; metric: string }>;
}

// Calculate a specific stat
export const calculateStat = query({
  args: { 
    type: v.union(
      v.literal("totalEvents"),
      v.literal("peakAttendance"),
      v.literal("playersPaid"),
      v.literal("mostActive"),
      v.literal("mostTop5s"),
      v.literal("mostWins"),
      v.literal("highestWinRate"),
      v.literal("mostEliminations")
    ),
    customText: v.string(),
    playerCount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<StatResult> => {
    // Get all events from 2025
    const allEvents = await ctx.db.query("events").collect();
    const events2025 = allEvents.filter((event) => {
      const year = new Date(event.startDate).getFullYear();
      return year === 2025;
    });
    const eventIds2025 = new Set(events2025.map((e) => e._id));

    switch (args.type) {
      case "totalEvents":
        return {
          type: args.type,
          label: args.customText,
          value: events2025.length,
        };

      case "peakAttendance": {
        let peakEventAttendance = { count: 0, eventName: "N/A" };
        for (const event of events2025) {
          if (event.totalPlayers && event.totalPlayers > peakEventAttendance.count) {
            peakEventAttendance = {
              count: event.totalPlayers,
              eventName: event.name,
            };
          }
        }
        return {
          type: args.type,
          label: args.customText,
          value: peakEventAttendance.count,
          subtitle: peakEventAttendance.eventName,
        };
      }

      case "playersPaid": {
        const allEarnings = await ctx.db.query("playerEarnings").collect();
        const uniquePlayerIds = new Set(allEarnings.map((e) => e.playerId));
        return {
          type: args.type,
          label: args.customText,
          value: uniquePlayerIds.size,
        };
      }

      case "mostActive": {
        const playerEventCounts = await getPlayerEventCounts(ctx, eventIds2025);
        const topPlayers = Array.from(playerEventCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, args.playerCount || 5);

        const players = await Promise.all(
          topPlayers.map(async ([playerId, count]) => {
            const player = await ctx.db.get(playerId);
            return {
              name: player?.name || player?.discordUsername || "Unknown",
              value: count,
              metric: "events",
            };
          })
        );

        return {
          type: args.type,
          label: args.customText,
          players,
        };
      }

      case "mostTop5s": {
        const playerTop5Counts = new Map<Id<"players">, number>();
        const allEventResults = await ctx.db.query("eventResults").collect();
        const allThirdPartyResults = await ctx.db.query("thirdPartyResults").collect();

        // Count from eventResults
        for (const result of allEventResults) {
          if (!result.eventId || !eventIds2025.has(result.eventId)) continue;
          if (result.placement <= 5) {
            const current = playerTop5Counts.get(result.playerId) || 0;
            playerTop5Counts.set(result.playerId, current + 1);
          }
        }

        // Count from thirdPartyResults
        for (const result of allThirdPartyResults) {
          if (!result.playerId || !result.importId) continue;
          const importData = await ctx.db.get(result.importId);
          if (!importData?.eventId || !eventIds2025.has(importData.eventId)) continue;
          if (result.placement <= 5) {
            const current = playerTop5Counts.get(result.playerId) || 0;
            playerTop5Counts.set(result.playerId, current + 1);
          }
        }

        const topPlayers = Array.from(playerTop5Counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, args.playerCount || 5);

        const players = await Promise.all(
          topPlayers.map(async ([playerId, count]) => {
            const player = await ctx.db.get(playerId);
            return {
              name: player?.name || player?.discordUsername || "Unknown",
              value: count,
              metric: "top 5s",
            };
          })
        );

        return {
          type: args.type,
          label: args.customText,
          players,
        };
      }

      case "mostWins": {
        const playerWinCounts = new Map<Id<"players">, number>();
        const allEventResults = await ctx.db.query("eventResults").collect();
        const allThirdPartyResults = await ctx.db.query("thirdPartyResults").collect();

        // Count from eventResults
        for (const result of allEventResults) {
          if (!result.eventId || !eventIds2025.has(result.eventId)) continue;
          if (result.placement === 1) {
            const current = playerWinCounts.get(result.playerId) || 0;
            playerWinCounts.set(result.playerId, current + 1);
          }
        }

        // Count from thirdPartyResults
        for (const result of allThirdPartyResults) {
          if (!result.playerId || !result.importId) continue;
          const importData = await ctx.db.get(result.importId);
          if (!importData?.eventId || !eventIds2025.has(importData.eventId)) continue;
          if (result.placement === 1) {
            const current = playerWinCounts.get(result.playerId) || 0;
            playerWinCounts.set(result.playerId, current + 1);
          }
        }

        const topPlayers = Array.from(playerWinCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, args.playerCount || 5);

        const players = await Promise.all(
          topPlayers.map(async ([playerId, count]) => {
            const player = await ctx.db.get(playerId);
            return {
              name: player?.name || player?.discordUsername || "Unknown",
              value: count,
              metric: "wins",
            };
          })
        );

        return {
          type: args.type,
          label: args.customText,
          players,
        };
      }

      case "highestWinRate": {
        const playerEventCounts = await getPlayerEventCounts(ctx, eventIds2025);
        const playerWinCounts = new Map<Id<"players">, number>();
        const allEventResults = await ctx.db.query("eventResults").collect();
        const allThirdPartyResults = await ctx.db.query("thirdPartyResults").collect();

        // Count wins
        for (const result of allEventResults) {
          if (!result.eventId || !eventIds2025.has(result.eventId)) continue;
          if (result.placement === 1) {
            const current = playerWinCounts.get(result.playerId) || 0;
            playerWinCounts.set(result.playerId, current + 1);
          }
        }

        for (const result of allThirdPartyResults) {
          if (!result.playerId || !result.importId) continue;
          const importData = await ctx.db.get(result.importId);
          if (!importData?.eventId || !eventIds2025.has(importData.eventId)) continue;
          if (result.placement === 1) {
            const current = playerWinCounts.get(result.playerId) || 0;
            playerWinCounts.set(result.playerId, current + 1);
          }
        }

        // Calculate win rates (only for players with 5+ events)
        const playerWinRates: Array<[Id<"players">, number]> = [];
        for (const [playerId, eventCount] of playerEventCounts.entries()) {
          if (eventCount >= 5) {
            const wins = playerWinCounts.get(playerId) || 0;
            const winRate = (wins / eventCount) * 100;
            playerWinRates.push([playerId, winRate]);
          }
        }

        const topPlayers = playerWinRates
          .sort((a, b) => b[1] - a[1])
          .slice(0, args.playerCount || 5);

        const players = await Promise.all(
          topPlayers.map(async ([playerId, winRate]) => {
            const player = await ctx.db.get(playerId);
            return {
              name: player?.name || player?.discordUsername || "Unknown",
              value: Math.round(winRate),
              metric: "% win rate",
            };
          })
        );

        return {
          type: args.type,
          label: args.customText,
          players,
        };
      }

      case "mostEliminations": {
        const playerElimCounts = new Map<Id<"players">, number>();
        const allEventResults = await ctx.db.query("eventResults").collect();
        const allThirdPartyResults = await ctx.db.query("thirdPartyResults").collect();

        // Count from eventResults
        for (const result of allEventResults) {
          if (!result.eventId || !eventIds2025.has(result.eventId)) continue;
          const current = playerElimCounts.get(result.playerId) || 0;
          playerElimCounts.set(result.playerId, current + result.eliminations);
        }

        // Count from thirdPartyResults
        for (const result of allThirdPartyResults) {
          if (!result.playerId || !result.importId) continue;
          const importData = await ctx.db.get(result.importId);
          if (!importData?.eventId || !eventIds2025.has(importData.eventId)) continue;
          const current = playerElimCounts.get(result.playerId) || 0;
          playerElimCounts.set(result.playerId, current + (result.eliminations || 0));
        }

        const topPlayers = Array.from(playerElimCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, args.playerCount || 5);

        const players = await Promise.all(
          topPlayers.map(async ([playerId, count]) => {
            const player = await ctx.db.get(playerId);
            return {
              name: player?.name || player?.discordUsername || "Unknown",
              value: count,
              metric: "eliminations",
            };
          })
        );

        return {
          type: args.type,
          label: args.customText,
          players,
        };
      }

      default:
        throw new ConvexError({
          message: "Invalid stat type",
          code: "BAD_REQUEST",
        });
    }
  },
});

// Helper to get player event counts
async function getPlayerEventCounts(
  ctx: { db: { query: (table: "eventResults" | "thirdPartyResults") => { collect: () => Promise<unknown[]> }; get: (id: Id<"thirdPartyImports">) => Promise<Doc<"thirdPartyImports"> | null> } },
  eventIds2025: Set<Id<"events">>
): Promise<Map<Id<"players">, number>> {
  const playerEventCounts = new Map<Id<"players">, number>();
  const allEventResults = await ctx.db.query("eventResults").collect();
  const allThirdPartyResults = await ctx.db.query("thirdPartyResults").collect();

  // Count from eventResults
  for (const result of allEventResults as Array<{ eventId?: Id<"events">; playerId: Id<"players"> }>) {
    if (!result.eventId || !eventIds2025.has(result.eventId)) continue;
    const current = playerEventCounts.get(result.playerId) || 0;
    playerEventCounts.set(result.playerId, current + 1);
  }

  // Count from thirdPartyResults
  for (const result of allThirdPartyResults as Array<{ playerId?: Id<"players">; importId?: Id<"thirdPartyImports"> }>) {
    if (!result.playerId || !result.importId) continue;
    const importData = await ctx.db.get(result.importId);
    if (!importData?.eventId || !eventIds2025.has(importData.eventId)) continue;

    const current = playerEventCounts.get(result.playerId) || 0;
    playerEventCounts.set(result.playerId, current + 1);
  }

  return playerEventCounts;
}

// Get wrapped content for a specific year
export const getWrappedContent = query({
  args: { year: v.number() },
  handler: async (ctx, args): Promise<Doc<"wrappedContent"> | null> => {
    const content = await ctx.db
      .query("wrappedContent")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    return content;
  },
});

// Get published wrapped content (public)
export const getPublishedWrappedContent = query({
  args: { year: v.number() },
  handler: async (ctx, args): Promise<Doc<"wrappedContent"> | null> => {
    const content = await ctx.db
      .query("wrappedContent")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (!content || !content.isPublished) {
      return null;
    }

    return content;
  },
});

// Save or update wrapped content (admin only)
export const saveWrappedContent = mutation({
  args: {
    year: v.number(),
    introTagline: v.optional(v.string()),
    sponsors: v.array(
      v.object({
        name: v.string(),
        logoUrl: v.optional(v.string()),
      })
    ),
    sections: v.array(v.object({
      name: v.string(),
      tagline: v.optional(v.string()),
      stats: v.array(v.object({
        type: v.union(
          // Dynamically generated from wrappedStatsConfig.ts
          ...VALID_STAT_IDS.map(id => v.literal(id))
        ),
        customText: v.string(),
        playerCount: v.optional(v.number()),
        customValue: v.optional(v.string()),
      })),
    })),
    customMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"wrappedContent">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Admin access required",
        code: "FORBIDDEN",
      });
    }

    // Check if content already exists
    const existing = await ctx.db
      .query("wrappedContent")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        introTagline: args.introTagline,
        sponsors: args.sponsors,
        sections: args.sections,
        customMessage: args.customMessage,
        lastEditedBy: user._id,
      });
      return existing._id;
    } else {
      // Create new
      const id = await ctx.db.insert("wrappedContent", {
        year: args.year,
        isPublished: false,
        introTagline: args.introTagline,
        sponsors: args.sponsors,
        sections: args.sections,
        customMessage: args.customMessage,
        lastEditedBy: user._id,
      });
      return id;
    }
  },
});

// Publish wrapped content (admin only)
export const publishWrappedContent = mutation({
  args: { year: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Admin access required",
        code: "FORBIDDEN",
      });
    }

    const content = await ctx.db
      .query("wrappedContent")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (!content) {
      throw new ConvexError({
        message: "Wrapped content not found",
        code: "NOT_FOUND",
      });
    }

    await ctx.db.patch(content._id, {
      isPublished: true,
      publishedBy: user._id,
      publishedAt: Date.now(),
    });
  },
});

// Unpublish wrapped content (admin only)
export const unpublishWrappedContent = mutation({
  args: { year: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Admin access required",
        code: "FORBIDDEN",
      });
    }

    const content = await ctx.db
      .query("wrappedContent")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (!content) {
      throw new ConvexError({
        message: "Wrapped content not found",
        code: "NOT_FOUND",
      });
    }

    await ctx.db.patch(content._id, {
      isPublished: false,
    });
  },
});
