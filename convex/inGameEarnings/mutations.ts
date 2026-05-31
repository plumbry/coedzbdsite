import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";
import { internal } from "../_generated/api";

const tournamentRecordValidator = v.object({
  name: v.string(),
  placement: v.number(),
  earnings: v.number(),
  date: v.string(),
});

const leaderboardDescriptorValidator = v.object({
  leaderboardEventId: v.string(),
  leaderboardEventWindowId: v.string(),
  tournamentName: v.string(),
  eventDate: v.string(),
  maxPages: v.number(),
  payouts: v.array(v.object({
    rank: v.number(),
    usd: v.number(),
  })),
});

// Upsert earnings for a player (called from action)
export const upsertEarnings = mutation({
  args: {
    playerId: v.id("players"),
    epicUsername: v.string(),
    totalEarnings: v.number(),
    tournaments: v.array(tournamentRecordValidator),
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
      scanLeaderboardIndex: 0,
      partialTournaments: [],
      startedAt: Date.now(),
    });

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
    currentPlayerId: v.optional(v.string()),
    currentEpicUsername: v.optional(v.string()),
    scanAccountId: v.optional(v.string()),
    scanLeaderboardIndex: v.optional(v.number()),
    partialTournaments: v.optional(v.array(tournamentRecordValidator)),
    clearCurrentPlayer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;

    const newProcessed = job.processed + args.batchSucceeded + args.batchFailed;
    const isDone = args.remainingPlayerIds.length === 0 && args.clearCurrentPlayer === true;

    await ctx.db.patch(args.jobId, {
      processed: newProcessed,
      succeeded: job.succeeded + args.batchSucceeded,
      failed: job.failed + args.batchFailed,
      remainingPlayerIds: args.remainingPlayerIds,
      remainingEpicUsernames: args.remainingEpicUsernames,
      status: isDone ? "completed" : "running",
      completedAt: isDone ? Date.now() : undefined,
      lastError: args.lastError,
      currentPlayerId: args.clearCurrentPlayer ? undefined : args.currentPlayerId,
      currentEpicUsername: args.clearCurrentPlayer ? undefined : args.currentEpicUsername,
      scanAccountId: args.clearCurrentPlayer ? undefined : args.scanAccountId,
      scanLeaderboardIndex: args.clearCurrentPlayer ? undefined : args.scanLeaderboardIndex,
      partialTournaments: args.clearCurrentPlayer ? undefined : args.partialTournaments,
    });

    if (!isDone) {
      const delayMs = args.batchFailed > 0 ? 60000 : 45000;
      await ctx.scheduler.runAfter(delayMs, internal.inGameEarnings.actions.processBatch, { jobId: args.jobId });
    }
  },
});

// Save tournament scan cache (internal only)
export const upsertTournamentScanCache = internalMutation({
  args: {
    leaderboards: v.array(leaderboardDescriptorValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("tournamentScanCache").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        leaderboards: args.leaderboards,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("tournamentScanCache", {
        leaderboards: args.leaderboards,
        updatedAt: Date.now(),
      });
    }
  },
});

// Mark a fetch job as failed (internal only)
export const failFetchJob = internalMutation({
  args: {
    jobId: v.id("earningsFetchJob"),
    lastError: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;

    await ctx.db.patch(args.jobId, {
      status: "failed",
      completedAt: Date.now(),
      lastError: args.lastError,
      remainingPlayerIds: [],
      remainingEpicUsernames: [],
      currentPlayerId: undefined,
      currentEpicUsername: undefined,
      scanAccountId: undefined,
      scanLeaderboardIndex: undefined,
      partialTournaments: undefined,
    });
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
      currentPlayerId: undefined,
      currentEpicUsername: undefined,
      scanAccountId: undefined,
      scanLeaderboardIndex: undefined,
      partialTournaments: undefined,
    });
  },
});
