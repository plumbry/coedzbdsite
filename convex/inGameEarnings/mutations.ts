import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";

// Upsert earnings for a player (called from action)
export const upsertEarnings = mutation({
  args: {
    playerId: v.id("players"),
    epicUsername: v.string(),
    totalEarnings: v.number(),
    tournaments: v.array(v.object({
      name: v.string(),
      placement: v.number(),
      earnings: v.number(),
      date: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inGameEarnings")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .unique();

    if (existing) {
      const hasNewEarnings = args.totalEarnings > existing.totalEarnings;

      await ctx.db.patch(existing._id, {
        epicUsername: args.epicUsername,
        totalEarnings: args.totalEarnings,
        tournaments: args.tournaments,
        lastFetchedAt: Date.now(),
        hasNewEarnings: hasNewEarnings || existing.hasNewEarnings,
        previousTotalEarnings: existing.totalEarnings,
      });
    } else {
      await ctx.db.insert("inGameEarnings", {
        playerId: args.playerId,
        epicUsername: args.epicUsername,
        totalEarnings: args.totalEarnings,
        tournaments: args.tournaments,
        lastFetchedAt: Date.now(),
        hasNewEarnings: args.totalEarnings > 0,
        previousTotalEarnings: 0,
      });
    }
  },
});

// Dismiss new earnings flag for a player
export const dismissNewEarnings = mutation({
  args: { earningsId: v.id("inGameEarnings") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.earningsId, {
      hasNewEarnings: false,
      previousTotalEarnings: undefined,
    });
  },
});

// Dismiss all new earnings flags
export const dismissAllNewEarnings = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const flagged = await ctx.db
      .query("inGameEarnings")
      .withIndex("by_has_new", (q) => q.eq("hasNewEarnings", true))
      .collect();

    for (const record of flagged) {
      await ctx.db.patch(record._id, {
        hasNewEarnings: false,
        previousTotalEarnings: undefined,
      });
    }
    return { dismissed: flagged.length };
  },
});

// Create a new fetch job and schedule the first batch
export const startBulkFetch = mutation({
  args: {
    playerIds: v.array(v.string()),
    epicUsernames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Cancel any existing running job
    const existingJobs = await ctx.db.query("earningsFetchJob").collect();
    for (const job of existingJobs) {
      if (job.status === "running") {
        await ctx.db.patch(job._id, { status: "cancelled", completedAt: Date.now() });
      }
    }

    const jobId = await ctx.db.insert("earningsFetchJob", {
      status: "running",
      totalPlayers: args.playerIds.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      remainingPlayerIds: args.playerIds,
      remainingEpicUsernames: args.epicUsernames,
      startedAt: Date.now(),
    });

    // Schedule the first batch immediately
    await ctx.scheduler.runAfter(0, internal.inGameEarnings.actions.processBatch, { jobId });

    return jobId;
  },
});

// Update job progress after a batch completes (internal only)
export const updateJobProgress = internalMutation({
  args: {
    jobId: v.id("earningsFetchJob"),
    batchSucceeded: v.number(),
    batchFailed: v.number(),
    remainingPlayerIds: v.array(v.string()),
    remainingEpicUsernames: v.array(v.string()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;

    const newProcessed = job.processed + args.batchSucceeded + args.batchFailed;
    const isDone = args.remainingPlayerIds.length === 0;

    await ctx.db.patch(args.jobId, {
      processed: newProcessed,
      succeeded: job.succeeded + args.batchSucceeded,
      failed: job.failed + args.batchFailed,
      remainingPlayerIds: args.remainingPlayerIds,
      remainingEpicUsernames: args.remainingEpicUsernames,
      status: isDone ? "completed" : "running",
      completedAt: isDone ? Date.now() : undefined,
      lastError: args.lastError,
    });

    // Schedule next batch if not done (65s delay for rate limit safety)
    if (!isDone) {
      await ctx.scheduler.runAfter(65000, internal.inGameEarnings.actions.processBatch, { jobId: args.jobId });
    }
  },
});

// Cancel a running fetch job
export const cancelBulkFetch = mutation({
  args: { jobId: v.id("earningsFetchJob") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;

    await ctx.db.patch(args.jobId, {
      status: "cancelled",
      completedAt: Date.now(),
      remainingPlayerIds: [],
      remainingEpicUsernames: [],
    });
  },
});
