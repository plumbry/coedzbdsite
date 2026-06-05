import { v } from "convex/values";
import { query } from "../_generated/server";
import { computeEventLeaderboards } from "../lib/eventLeaderboards";

// Count event results for a player
export const countPlayerResults = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    return results.length;
  },
});

export const getEventLeaderboards = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await computeEventLeaderboards(ctx, args.eventId);
  },
});

// Get all results for an event (legacy - kept for backward compatibility)
export const getEventResults = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    if (imports.length === 0) {
      return [];
    }

    const allResults = [];
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .filter((q) => q.eq(q.field("matched"), true))
        .collect();

      allResults.push(...results);
    }

    const playerStats = new Map<
      string,
      {
        playerId: string;
        playerName: string;
        totalPoints: number;
        bestPlacement: number;
        totalEliminations: number;
        gamesPlayed: number;
      }
    >();

    for (const result of allResults) {
      if (!result.playerId) continue;

      const key = result.playerId;
      const existing = playerStats.get(key);

      if (existing) {
        existing.totalPoints += result.points;
        existing.bestPlacement = Math.min(existing.bestPlacement, result.placement);
        existing.totalEliminations += result.eliminations || 0;
        existing.gamesPlayed += 1;
      } else {
        const player = await ctx.db.get(result.playerId);

        playerStats.set(key, {
          playerId: result.playerId,
          playerName: player?.discordUsername || "Unknown",
          totalPoints: result.points,
          bestPlacement: result.placement,
          totalEliminations: result.eliminations || 0,
          gamesPlayed: 1,
        });
      }
    }

    return Array.from(playerStats.values()).sort((a, b) => b.totalPoints - a.totalPoints);
  },
});
