import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";

export const getAllReplays = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const replays = await ctx.db
      .query("replays")
      .order("desc")
      .collect();

    // Enrich with event names
    const enrichedReplays = await Promise.all(
      replays.map(async (replay) => {
        const event = replay.eventId
          ? await ctx.db.get(replay.eventId)
          : null;

        // Get player stats count
        const playerStats = await ctx.db
          .query("replayPlayerStats")
          .withIndex("by_replay", (q) => q.eq("replayId", replay._id))
          .collect();

        const matchedCount = playerStats.filter((s) => s.matched).length;

        return {
          ...replay,
          eventName: event?.name,
          totalPlayers: playerStats.length,
          matchedPlayers: matchedCount,
        };
      })
    );

    return enrichedReplays;
  },
});

export const getReplayById = query({
  args: { replayId: v.id("replays") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const replay = await ctx.db.get(args.replayId);
    if (!replay) {
      return null;
    }

    // Get event info
    const event = replay.eventId ? await ctx.db.get(replay.eventId) : null;

    // Get player stats
    const playerStats = await ctx.db
      .query("replayPlayerStats")
      .withIndex("by_replay", (q) => q.eq("replayId", args.replayId))
      .collect();

    // Enrich player stats with player names
    const enrichedPlayerStats = await Promise.all(
      playerStats.map(async (stat) => {
        const player = stat.playerId ? await ctx.db.get(stat.playerId) : null;
        return {
          ...stat,
          discordUsername: player?.discordUsername,
        };
      })
    );

    // Get team stats
    const teamStats = await ctx.db
      .query("replayTeamStats")
      .withIndex("by_replay", (q) => q.eq("replayId", args.replayId))
      .collect();

    return {
      ...replay,
      eventName: event?.name,
      playerStats: enrichedPlayerStats,
      teamStats,
    };
  },
});

export const getReplaysByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const replays = await ctx.db
      .query("replays")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .collect();

    return replays;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
