import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

// Get all in-game earnings with player info
export const getAllInGameEarnings = query({
  args: {},
  handler: async (ctx) => {
    const earnings = await ctx.db.query("inGameEarnings").collect();

    const results = await Promise.all(
      earnings.map(async (e) => {
        const player = await ctx.db.get(e.playerId);
        return {
          ...e,
          playerName: player?.discordUsername ?? player?.name ?? "Unknown",
          tier: player?.tier,
          status: player?.status,
        };
      })
    );

    // Sort: flagged first, then by total earnings desc
    results.sort((a, b) => {
      if (a.hasNewEarnings && !b.hasNewEarnings) return -1;
      if (!a.hasNewEarnings && b.hasNewEarnings) return 1;
      return b.totalEarnings - a.totalEarnings;
    });

    return results;
  },
});

// Get in-game earnings for a specific player
export const getPlayerInGameEarnings = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inGameEarnings")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .unique();
  },
});

// Get active players who have played a scrim in the last 60 days
export const getRecentlyActivePlayers = query({
  args: {},
  handler: async (ctx): Promise<Array<{ _id: Id<"players">; epicUsername: string; discordUsername: string }>> => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const cutoffDate = sixtyDaysAgo.toISOString().split("T")[0]; // "YYYY-MM-DD"

    // Get imports from the last 60 days
    const allImports = await ctx.db.query("thirdPartyImports").collect();
    const recentImports = allImports.filter((imp) => {
      const eventDate = imp.eventDate || "";
      return eventDate >= cutoffDate;
    });

    // Collect unique player IDs from recent results
    const recentPlayerIds = new Set<string>();
    for (const imp of recentImports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();

      for (const result of results) {
        if (result.playerId) {
          recentPlayerIds.add(result.playerId);
        }
      }
    }

    // Fetch the player records for those IDs
    const players: Array<{ _id: Id<"players">; epicUsername: string; discordUsername: string }> = [];
    for (const id of recentPlayerIds) {
      const player = await ctx.db.get(id as Id<"players">);
      if (player && player.status === "active") {
        players.push({
          _id: player._id,
          epicUsername: player.epicUsername,
          discordUsername: player.discordUsername,
        });
      }
    }

    return players;
  },
});

// Get count of players with new earnings
export const getNewEarningsCount = query({
  args: {},
  handler: async (ctx) => {
    const flagged = await ctx.db
      .query("inGameEarnings")
      .withIndex("by_has_new", (q) => q.eq("hasNewEarnings", true))
      .collect();
    return flagged.length;
  },
});

// Get the latest earnings fetch job status
export const getLatestFetchJob = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("earningsFetchJob")
      .order("desc")
      .take(1);
    return jobs[0] ?? null;
  },
});

// Internal: get job by ID (for batch processor)
export const getJobById = internalQuery({
  args: { jobId: v.id("earningsFetchJob") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});
