import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";

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
