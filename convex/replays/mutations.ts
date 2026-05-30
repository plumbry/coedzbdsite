import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";
import type { Id } from "../_generated/dataModel.d.ts";

export const createReplay = mutation({
  args: {
    fileName: v.string(),
    storageId: v.id("_storage"),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);

    const replayId = await ctx.db.insert("replays", {
      fileName: args.fileName,
      storageId: args.storageId,
      eventId: args.eventId,
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      parseStatus: "pending",
    });

    return replayId;
  },
});

export const updateReplayStatus = internalMutation({
  args: {
    replayId: v.id("replays"),
    status: v.union(
      v.literal("pending"),
      v.literal("parsing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.replayId, {
      parseStatus: args.status,
      parseError: args.error,
      ...(args.status === "completed" && { parsedAt: Date.now() }),
    });
  },
});

export const saveParsedReplayData = internalMutation({
  args: {
    replayId: v.id("replays"),
    matchMetadata: v.object({
      matchId: v.optional(v.string()),
      gameMode: v.optional(v.string()),
      mapName: v.optional(v.string()),
      matchDuration: v.optional(v.number()),
      recordingStartTime: v.optional(v.string()),
      recordingEndTime: v.optional(v.string()),
    }),
    playerStats: v.array(
      v.object({
        epicUsername: v.string(),
        epicId: v.optional(v.string()),
        teamId: v.optional(v.string()),
        eliminations: v.number(),
        deaths: v.number(),
        damage: v.optional(v.number()),
        assists: v.optional(v.number()),
        revives: v.optional(v.number()),
        accuracy: v.optional(v.number()),
        materials: v.optional(v.number()),
      })
    ),
    teamStats: v.array(
      v.object({
        teamId: v.optional(v.string()),
        teamName: v.optional(v.string()),
        placement: v.optional(v.number()),
        totalEliminations: v.number(),
        totalDamage: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Update replay with match metadata
    await ctx.db.patch(args.replayId, {
      ...args.matchMetadata,
      parseStatus: "completed",
      parsedAt: Date.now(),
    });

    // Save player stats and try to match with existing players
    for (const playerStat of args.playerStats) {
      // Try to match player by Epic username
      const matchedPlayer = await ctx.db
        .query("players")
        .withIndex("by_epic_username", (q) =>
          q.eq("epicUsername", playerStat.epicUsername)
        )
        .first();

      await ctx.db.insert("replayPlayerStats", {
        replayId: args.replayId,
        playerId: matchedPlayer?._id,
        epicUsername: playerStat.epicUsername,
        epicId: playerStat.epicId,
        teamId: playerStat.teamId,
        eliminations: playerStat.eliminations,
        deaths: playerStat.deaths,
        damage: playerStat.damage,
        assists: playerStat.assists,
        revives: playerStat.revives,
        accuracy: playerStat.accuracy,
        materials: playerStat.materials,
        matched: !!matchedPlayer,
      });
    }

    // Save team stats
    for (const teamStat of args.teamStats) {
      await ctx.db.insert("replayTeamStats", {
        replayId: args.replayId,
        teamId: teamStat.teamId,
        teamName: teamStat.teamName,
        placement: teamStat.placement,
        totalEliminations: teamStat.totalEliminations,
        totalDamage: teamStat.totalDamage,
        matchesPlayed: 1,
      });
    }
  },
});

export const linkReplayToEvent = mutation({
  args: {
    replayId: v.id("replays"),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    await ctx.db.patch(args.replayId, {
      eventId: args.eventId,
    });
  },
});

export const deleteReplay = mutation({
  args: {
    replayId: v.id("replays"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Get the replay
    const replay = await ctx.db.get(args.replayId);
    if (!replay) {
      throw new Error("Replay not found");
    }

    // Delete the replay file from storage
    await ctx.storage.delete(replay.storageId);

    // Delete associated player stats
    const playerStats = await ctx.db
      .query("replayPlayerStats")
      .withIndex("by_replay", (q) => q.eq("replayId", args.replayId))
      .collect();
    
    for (const stat of playerStats) {
      await ctx.db.delete(stat._id);
    }

    // Delete associated team stats
    const teamStats = await ctx.db
      .query("replayTeamStats")
      .withIndex("by_replay", (q) => q.eq("replayId", args.replayId))
      .collect();
    
    for (const stat of teamStats) {
      await ctx.db.delete(stat._id);
    }

    // Delete the replay
    await ctx.db.delete(args.replayId);
  },
});
