import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireAdmin } from "../auth_helpers";

/**
 * Job manager for the kill events backfill process.
 * Runs in V8 runtime (mutations/queries).
 * The actual backfill work is done by the internalAction in backfillKillEvents.ts (Node runtime).
 */

// Start a new backfill job (kicks off the self-scheduling action chain)
export const startBackfillJob = mutation({
  args: {
    forceRefresh: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Check if there's already a running job
    const existingJobs = await ctx.db
      .query("backfillJobStatus")
      .order("desc")
      .take(5);

    const runningJob = existingJobs.find((j) => j.status === "running");
    if (runningJob) {
      throw new ConvexError({
        message: "A backfill job is already running",
        code: "CONFLICT",
      });
    }

    const jobId = await ctx.db.insert("backfillJobStatus", {
      mode: args.forceRefresh ? "refresh" : "backfill",
      status: "running",
      processed: 0,
      remaining: 0,
      total: 0,
      alreadyProcessed: 0,
      eventsStored: 0,
      upsetsFound: 0,
      errors: [],
      startedAt: Date.now(),
    });

    // Schedule the first batch to run immediately
    await ctx.scheduler.runAfter(
      0,
      internal.yunite.backfillKillEvents.backfillKillEventsBatch,
      {
        jobId,
        batchSize: 3,
        startFromIndex: 0,
        forceRefresh: args.forceRefresh,
      }
    );

    return jobId;
  },
});

// Get the most recent backfill job status (reactive query for the frontend)
export const getBackfillJobStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const job = await ctx.db
      .query("backfillJobStatus")
      .order("desc")
      .first();

    return job;
  },
});

// Cancel a running job
export const cancelBackfillJob = mutation({
  args: {
    jobId: v.id("backfillJobStatus"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;

    await ctx.db.patch(args.jobId, {
      status: "cancelled",
      completedAt: Date.now(),
    });
  },
});

// Dismiss/clear the most recent job (so UI hides the banner)
export const dismissJob = mutation({
  args: {
    jobId: v.id("backfillJobStatus"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const job = await ctx.db.get(args.jobId);
    if (!job) return;
    // Only allow dismissing completed/failed/cancelled jobs
    if (job.status === "running") return;
    await ctx.db.delete(args.jobId);
  },
});

// --- Internal functions (called by the backfill action) ---

// Check if job is still running
export const getJobById = internalQuery({
  args: { jobId: v.id("backfillJobStatus") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

// Update progress after processing a batch
export const updateProgress = internalMutation({
  args: {
    jobId: v.id("backfillJobStatus"),
    processed: v.number(),
    remaining: v.number(),
    total: v.number(),
    alreadyProcessed: v.number(),
    eventsStored: v.number(),
    upsetsFound: v.number(),
    errors: v.array(
      v.object({
        eventName: v.string(),
        error: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    await ctx.db.patch(args.jobId, {
      processed: job.processed + args.processed,
      remaining: args.remaining,
      total: args.total,
      alreadyProcessed: args.alreadyProcessed,
      eventsStored: job.eventsStored + args.eventsStored,
      upsetsFound: job.upsetsFound + args.upsetsFound,
      errors: [...job.errors, ...args.errors],
    });
  },
});

// Mark job as completed
export const completeJob = internalMutation({
  args: { jobId: v.id("backfillJobStatus") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    await ctx.db.patch(args.jobId, {
      status: "completed",
      completedAt: Date.now(),
    });
  },
});

// Mark job as failed
export const failJob = internalMutation({
  args: {
    jobId: v.id("backfillJobStatus"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    await ctx.db.patch(args.jobId, {
      status: "failed",
      completedAt: Date.now(),
      errors: [...job.errors, { eventName: "System", error: args.error }],
    });
  },
});
