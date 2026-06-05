import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";
import { syncInternalEventParticipation } from "./lib/stats/syncInternalEventParticipation";
import {
  listEligibleMatchDataPlayerIds,
  phaseLabel,
} from "./lib/stats/listEligiblePlayers";
import {
  isFullPlayerStatsRebuild,
  rebuildKindLabel,
  resolvePlayerStatsRebuildKind,
} from "./lib/stats/rebuildKind";

const EVENT_BATCH = 6;
const PLAYER_CACHE_BATCH = 3;
const STALE_JOB_MS = 30 * 60 * 1000;

const PHASE_ORDER = [
  "event_participation",
  "contribution_score",
  "dca",
  "dca_mutual",
  "top_five",
  "tier_eval",
  "aggregate_stats",
  "completed",
] as const;

type RebuildPhase = (typeof PHASE_ORDER)[number];

function nextPhase(current: RebuildPhase): RebuildPhase {
  const idx = PHASE_ORDER.indexOf(current);
  return PHASE_ORDER[Math.min(idx + 1, PHASE_ORDER.length - 1)];
}

async function failStaleRunningJobs(ctx: MutationCtx) {
  const running = await ctx.db
    .query("playerStatsRebuildJobs")
    .withIndex("by_status", (q: { eq: Function }) => q.eq("status", "running"))
    .collect();
  const cutoff = Date.now() - STALE_JOB_MS;
  for (const job of running) {
    if (job.lastProgressAt < cutoff) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage: "Job timed out (no progress for 30 minutes)",
        completedAt: Date.now(),
      });
    }
  }
}

/** Most recent completed full pipeline job (event counts through population averages). */
export const getLastFullPlayerStatsRebuild = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || user.role !== "admin") return null;

    const completed = await ctx.db
      .query("playerStatsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const fullJobs = completed
      .filter((job) => isFullPlayerStatsRebuild(job))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    const latest = fullJobs[0];
    if (!latest?.completedAt) {
      return null;
    }

    return {
      jobId: latest._id,
      completedAt: latest.completedAt,
      totalProcessed: latest.totalProcessed,
      rebuildKind: latest.rebuildKind ?? "full",
    };
  },
});

export const getActiveRebuildJob = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || user.role !== "admin") return null;

    const running = await ctx.db
      .query("playerStatsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (!running) return null;

    const rebuildKind = running.rebuildKind;

    return {
      jobId: running._id,
      phase: running.phase,
      phaseLabel: phaseLabel(running.phase),
      rebuildKind,
      rebuildKindLabel: rebuildKind ? rebuildKindLabel(rebuildKind) : undefined,
      processedInPhase: running.processedInPhase,
      totalProcessed: running.totalProcessed,
      tierEvalBatch: running.tierEvalBatch,
      tierEvalBatchCount: running.tierEvalBatchCount,
      tierEvalRecentOnly: running.tierEvalRecentOnly,
      startedAt: running.startedAt,
      lastProgressAt: running.lastProgressAt,
    };
  },
});

export const scheduleFullRebuild = internalMutation({
  args: {
    includeAggregateStats: v.optional(v.boolean()),
    stopAfterPhase: v.optional(
      v.union(
        v.literal("event_participation"),
        v.literal("dca_mutual"),
        v.literal("top_five"),
        v.literal("tier_eval"),
        v.literal("aggregate_stats"),
      ),
    ),
    tierEvalOnly: v.optional(v.boolean()),
    tcDcaOnly: v.optional(v.boolean()),
    topFiveOnly: v.optional(v.boolean()),
    aggregateStatsOnly: v.optional(v.boolean()),
    tierEvalRecentOnly: v.optional(v.boolean()),
    applyDuoAdjustment: v.optional(v.boolean()),
    applyTCPenalty: v.optional(v.boolean()),
    applyTCDCAToHolistic: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ jobId: Id<"playerStatsRebuildJobs">; message: string }> => {
    await failStaleRunningJobs(ctx);

    const existing = await ctx.db
      .query("playerStatsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (existing) {
      throw new ConvexError({
        message: "A player stats rebuild is already running",
        code: "CONFLICT",
      });
    }

    const tierEvalOnly = args.tierEvalOnly ?? false;
    const tcDcaOnly = args.tcDcaOnly ?? false;
    const topFiveOnly = args.topFiveOnly ?? false;
    const aggregateStatsOnly = args.aggregateStatsOnly ?? false;
    const partialOnly =
      tierEvalOnly || tcDcaOnly || topFiveOnly || aggregateStatsOnly;
    const rebuildKind = resolvePlayerStatsRebuildKind({
      tierEvalOnly,
      tcDcaOnly,
      topFiveOnly,
      aggregateStatsOnly,
      stopAfterPhase: args.stopAfterPhase,
      includeAggregateStats: args.includeAggregateStats,
    });

    const startPhase: RebuildPhase = tierEvalOnly
      ? "tier_eval"
      : tcDcaOnly
        ? "contribution_score"
        : topFiveOnly
          ? "top_five"
          : aggregateStatsOnly
            ? "aggregate_stats"
            : "event_participation";
    const endPhase = tierEvalOnly
      ? "tier_eval"
      : tcDcaOnly
        ? "dca_mutual"
        : topFiveOnly
          ? "top_five"
          : aggregateStatsOnly
            ? "aggregate_stats"
            : args.stopAfterPhase;

    const now = Date.now();
    const jobId = await ctx.db.insert("playerStatsRebuildJobs", {
      status: "running",
      phase: startPhase,
      playersCursor: null,
      tierEvalBatch: 0,
      tierEvalBatchCount: 0,
      tierEvalInitialized: false,
      includeAggregateStats: aggregateStatsOnly
        ? true
        : partialOnly
          ? false
          : (args.includeAggregateStats ?? true),
      stopAfterPhase: endPhase,
      tierEvalRecentOnly: args.tierEvalRecentOnly ?? false,
      rebuildKind,
      applyDuoAdjustment: args.applyDuoAdjustment ?? false,
      applyTCPenalty: args.applyTCPenalty !== false,
      applyTCDCAToHolistic: args.applyTCDCAToHolistic !== false,
      processedInPhase: 0,
      totalProcessed: 0,
      startedAt: now,
      lastProgressAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.playerStatsRebuild.processRebuildStep, {
      jobId,
    });

    const recentNote = args.tierEvalRecentOnly
      ? " (tier evaluation: last 6 weeks only)"
      : "";
    const message = tierEvalOnly
      ? `Tier evaluation cache rebuild started${recentNote}.`
      : tcDcaOnly
        ? "TC/DCA rebuild started for all players with match data."
        : topFiveOnly
          ? "Top 5 placement cache rebuild started for all players with match data."
          : aggregateStatsOnly
            ? "Population average stats rebuild started."
            : args.stopAfterPhase === "event_participation"
            ? "Yunite event count sync started for all players."
            : args.includeAggregateStats === false
              ? `Player stats rebuild started (event counts through tier evaluation)${recentNote}.`
              : `Player stats rebuild started: event counts → TC → DCA → top-five → tier evaluation → averages${recentNote}.`;

    return { jobId, message };
  },
});

export const startFullPlayerStatsRebuild = mutation({
  args: {
    includeAggregateStats: v.optional(v.boolean()),
    stopAfterPhase: v.optional(
      v.union(
        v.literal("event_participation"),
        v.literal("dca_mutual"),
        v.literal("top_five"),
        v.literal("tier_eval"),
        v.literal("aggregate_stats"),
      ),
    ),
    tierEvalOnly: v.optional(v.boolean()),
    tcDcaOnly: v.optional(v.boolean()),
    topFiveOnly: v.optional(v.boolean()),
    aggregateStatsOnly: v.optional(v.boolean()),
    tierEvalRecentOnly: v.optional(v.boolean()),
    applyDuoAdjustment: v.optional(v.boolean()),
    applyTCPenalty: v.optional(v.boolean()),
    applyTCDCAToHolistic: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ jobId: Id<"playerStatsRebuildJobs">; message: string }> => {
    await requireAdmin(ctx);
    return await ctx.runMutation(internal.playerStatsRebuild.scheduleFullRebuild, args);
  },
});

/** Event counts, DCA, and top-five after match import (TC usually already updated). */
export const refreshPlayerDerivedCachesForPlayers = internalMutation({
  args: { playerIds: v.array(v.id("players")) },
  handler: async (ctx, args) => {
    for (const playerId of args.playerIds) {
      await syncInternalEventParticipation(ctx, playerId);

      const player = await ctx.db.get(playerId);
      if (!player?.hasMatchData) continue;

      await ctx.runMutation(internal.dcaCache.cacheDCAForPlayer, { playerId });
      await ctx.runMutation(internal.topFiveCache.updateSinglePlayerCache, {
        playerId,
      });
    }
  },
});

export const processRebuildStep = internalMutation({
  args: { jobId: v.id("playerStatsRebuildJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }

    try {
      let processedInPhase = 0;
      let phase = job.phase as RebuildPhase;
      let playersCursor = job.playersCursor ?? null;
      let tierEvalBatch = job.tierEvalBatch;
      let tierEvalBatchCount = job.tierEvalBatchCount;
      let tierEvalInitialized = job.tierEvalInitialized;
      let totalProcessed = job.totalProcessed;

      if (phase === "event_participation") {
        const page = await ctx.db.query("players").paginate({
          numItems: EVENT_BATCH,
          cursor: playersCursor,
        });

        for (const player of page.page) {
          await syncInternalEventParticipation(ctx, player._id);
          processedInPhase += 1;
          totalProcessed += 1;
        }

        if (!page.isDone) {
          playersCursor = page.continueCursor;
        } else if (job.stopAfterPhase === "event_participation") {
          phase = "completed";
          playersCursor = null;
          processedInPhase = 0;
        } else {
          phase = nextPhase(phase);
          playersCursor = null;
          processedInPhase = 0;
        }
      } else if (
        phase === "contribution_score" ||
        phase === "dca" ||
        phase === "top_five"
      ) {
        const page = await ctx.db.query("players").paginate({
          numItems: PLAYER_CACHE_BATCH,
          cursor: playersCursor,
        });

        for (const player of page.page) {
          if (!player.hasMatchData) continue;

          if (phase === "contribution_score") {
            await ctx.runMutation(
              internal.calculateContributionScore.calculateAndStoreCSInternal,
              { playerId: player._id },
            );
          } else if (phase === "dca") {
            await ctx.runMutation(internal.dcaCache.cacheDCAForPlayer, {
              playerId: player._id,
            });
          } else {
            await ctx.runMutation(internal.topFiveCache.updateSinglePlayerCache, {
              playerId: player._id,
            });
          }

          processedInPhase += 1;
          totalProcessed += 1;
        }

        if (!page.isDone) {
          playersCursor = page.continueCursor;
        } else if (phase === "top_five" && job.stopAfterPhase === "top_five") {
          phase = "completed";
          playersCursor = null;
          processedInPhase = 0;
        } else {
          phase = nextPhase(phase);
          playersCursor = null;
          processedInPhase = 0;
        }
      } else if (phase === "dca_mutual") {
        const eligibleIds = await listEligibleMatchDataPlayerIds(ctx);
        await ctx.runMutation(internal.dcaCache.applyMutualDependencyCorrection, {
          playerIds: eligibleIds,
        });
        phase =
          job.stopAfterPhase === "dca_mutual" ? "completed" : nextPhase(phase);
        processedInPhase = 0;
      } else if (phase === "tier_eval") {
        if (!tierEvalInitialized) {
          await ctx.runMutation(api.tierReEvaluationBatched.clearCache, {});
          const init = await ctx.runMutation(
            api.tierReEvaluationBatched.initializeBatchRebuild,
            { recentOnly: job.tierEvalRecentOnly },
          );
          tierEvalBatchCount = init.batchCount;
          tierEvalBatch = 0;
          tierEvalInitialized = true;
          processedInPhase = 0;
        } else if (tierEvalBatchCount > 0 && tierEvalBatch < tierEvalBatchCount) {
          await ctx.runMutation(api.tierReEvaluationBatched.processBatch, {
            batchNumber: tierEvalBatch,
            recentOnly: job.tierEvalRecentOnly,
          });
          tierEvalBatch += 1;
          processedInPhase += 1;
          totalProcessed += 1;
        }

        if (tierEvalInitialized && tierEvalBatch >= tierEvalBatchCount) {
          await ctx.runMutation(
            api.tierReEvaluationBatched.finalizeRecentComparisons,
            {},
          );
          phase =
            job.stopAfterPhase === "tier_eval" ? "completed" : nextPhase(phase);
          processedInPhase = 0;
        }
      } else if (phase === "aggregate_stats") {
        if (job.includeAggregateStats) {
          const aggRunning = await ctx.db
            .query("aggregateStatsJobs")
            .withIndex("by_status", (q) => q.eq("status", "running"))
            .first();

          if (!aggRunning) {
            await ctx.runMutation(api.aggregateStats.rebuildAggregateStatsCache, {});
          }
        }
        phase = "completed";
      }

      if (phase === "completed") {
        await ctx.db.patch(args.jobId, {
          status: "completed",
          phase: "completed",
          playersCursor,
          tierEvalBatch,
          tierEvalBatchCount,
          tierEvalInitialized,
          processedInPhase,
          totalProcessed,
          lastProgressAt: Date.now(),
          completedAt: Date.now(),
        });
        return;
      }

      await ctx.db.patch(args.jobId, {
        phase,
        playersCursor,
        tierEvalBatch,
        tierEvalBatchCount,
        tierEvalInitialized,
        processedInPhase,
        totalProcessed,
        lastProgressAt: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.playerStatsRebuild.processRebuildStep, {
        jobId: args.jobId,
      });
    } catch (error) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown rebuild error",
        completedAt: Date.now(),
        lastProgressAt: Date.now(),
      });
    }
  },
});
