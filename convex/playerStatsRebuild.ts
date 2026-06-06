import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";
import { syncInternalEventParticipation } from "./lib/stats/syncInternalEventParticipation";
import {
  isActivePlayerWithMatchData,
  listEligibleMatchDataPlayerIds,
  paginateActivePlayers,
  phaseLabel,
} from "./lib/stats/listEligiblePlayers";
import {
  isFullPlayerStatsRebuild,
  rebuildKindLabel,
  resolvePlayerStatsRebuildKind,
} from "./lib/stats/rebuildKind";

const EVENT_BATCH = 6;
const PLAYER_CACHE_BATCH = 3;
/** TC/DCA do per-match reads; one player per step avoids mutation timeouts. */
const HEAVY_PLAYER_CACHE_BATCH = 1;
const TIER_EVAL_FINALIZE_BATCH = 25;
const STALE_JOB_MS = 6 * 60 * 60 * 1000;
const STALE_PROGRESS_MS = 30 * 60 * 1000;
const RECONCILE_IDLE_MS = 90 * 1000;

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

function jobIdleMs(job: { lastProgressAt: number; startedAt: number }, now: number): number {
  return now - job.lastProgressAt;
}

async function failStaleRunningJobs(ctx: MutationCtx) {
  const running = await ctx.db
    .query("playerStatsRebuildJobs")
    .withIndex("by_status", (q: { eq: Function }) => q.eq("status", "running"))
    .collect();
  const now = Date.now();
  for (const job of running) {
    const idleMs = jobIdleMs(job, now);
    if (now - job.startedAt > STALE_JOB_MS || idleMs > STALE_PROGRESS_MS) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage:
          idleMs > STALE_PROGRESS_MS
            ? "Rebuild stopped making progress — cancel and start again."
            : "Rebuild timed out — cancel and start again.",
        completedAt: now,
        lastProgressAt: now,
      });
    }
  }
}

/** Re-schedule a stalled chain before we mark the job failed. */
async function reconcilePlayerStatsRebuildJobs(ctx: MutationCtx) {
  const running = await ctx.db
    .query("playerStatsRebuildJobs")
    .withIndex("by_status", (q: { eq: Function }) => q.eq("status", "running"))
    .collect();

  const now = Date.now();
  for (const job of running) {
    const idleMs = jobIdleMs(job, now);
    if (idleMs < RECONCILE_IDLE_MS || idleMs >= STALE_PROGRESS_MS) {
      continue;
    }

    await ctx.scheduler.runAfter(0, internal.playerStatsRebuild.processRebuildStep, {
      jobId: job._id,
    });
  }
}

function patchRecentComparisonFields(
  entry: {
    _id: Id<"tierReEvaluationCache">;
    tier: string;
    recentHolisticScore?: number;
  },
  recentMedians: Record<string, number | undefined>,
) {
  const tierOrder = ["S", "A", "B", "C"];
  const tierIdx = tierOrder.indexOf(entry.tier);
  if (tierIdx === -1 || entry.recentHolisticScore == null) {
    return null;
  }

  const sameTierRecent = recentMedians[entry.tier];
  const tierAbove = tierIdx > 0 ? tierOrder[tierIdx - 1] : undefined;
  const tierBelow = tierIdx < tierOrder.length - 1 ? tierOrder[tierIdx + 1] : undefined;
  const aboveRecent = tierAbove ? recentMedians[tierAbove] : undefined;
  const belowRecent = tierBelow ? recentMedians[tierBelow] : undefined;

  return {
    recentHolisticVsSameTier:
      sameTierRecent != null ? entry.recentHolisticScore - sameTierRecent : undefined,
    recentPromotionDiff:
      aboveRecent != null ? entry.recentHolisticScore - aboveRecent : undefined,
    recentDemotionDiff:
      belowRecent != null ? entry.recentHolisticScore - belowRecent : undefined,
  };
}

function playerCacheBatchForPhase(phase: RebuildPhase): number {
  if (phase === "contribution_score" || phase === "dca") {
    return HEAVY_PLAYER_CACHE_BATCH;
  }
  return PLAYER_CACHE_BATCH;
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
    const now = Date.now();
    const idleMs = jobIdleMs(running, now);

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
      tierEvalInitialized: running.tierEvalInitialized ?? false,
      tierEvalClearDone: running.tierEvalClearDone ?? false,
      tierEvalMediansDone: running.tierEvalMediansDone ?? false,
      tierEvalRecentMediansDone: running.tierEvalRecentMediansDone ?? false,
      tierEvalRecentOnly: running.tierEvalRecentOnly,
      startedAt: running.startedAt,
      lastProgressAt: running.lastProgressAt,
      appearsStuck: idleMs >= RECONCILE_IDLE_MS,
    };
  },
});

/** Latest completed or failed rebuild — used for outcome toasts after a running job disappears. */
export const getLatestFinishedRebuildJob = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || user.role !== "admin") return null;

    const [completed, failed] = await Promise.all([
      ctx.db
        .query("playerStatsRebuildJobs")
        .withIndex("by_status", (q) => q.eq("status", "completed"))
        .collect(),
      ctx.db
        .query("playerStatsRebuildJobs")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .collect(),
    ]);

    const latest = [...completed, ...failed]
      .filter((job) => job.completedAt != null)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];

    if (!latest) {
      return null;
    }

    const rebuildKind = latest.rebuildKind;
    return {
      jobId: latest._id,
      status: latest.status,
      phase: latest.phase,
      phaseLabel: phaseLabel(latest.phase),
      rebuildKindLabel: rebuildKind ? rebuildKindLabel(rebuildKind) : undefined,
      errorMessage: latest.errorMessage,
      completedAt: latest.completedAt,
    };
  },
});

/** Fails timed-out jobs and re-kicks stalled background chains (safe while viewing admin pages). */
export const cleanupPlayerStatsRebuildJobs = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await reconcilePlayerStatsRebuildJobs(ctx);
    await failStaleRunningJobs(ctx);
    return { ok: true };
  },
});

export const cancelPlayerStatsRebuild = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const running = await ctx.db
      .query("playerStatsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const now = Date.now();
    for (const job of running) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage: "Rebuild cancelled.",
        completedAt: now,
        lastProgressAt: now,
      });
    }

    return { cancelled: running.length };
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
      tierEvalClearDone: false,
      tierEvalMediansDone: false,
      tierEvalInitialized: false,
      tierEvalPageIndex: 0,
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
      let tierEvalClearDone = job.tierEvalClearDone ?? false;
      let tierEvalMediansDone = job.tierEvalMediansDone ?? false;
      let tierEvalInitialized = job.tierEvalInitialized;
      let tierEvalPageIndex = job.tierEvalPageIndex ?? 0;
      let tierEvalPlayerIds = job.tierEvalPlayerIds ?? [];
      let tierEvalRecentMediansDone = job.tierEvalRecentMediansDone ?? false;
      let totalProcessed = job.totalProcessed;

      if (phase === "event_participation") {
        const page = await paginateActivePlayers(ctx, playersCursor, EVENT_BATCH);

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
        const page = await paginateActivePlayers(
          ctx,
          playersCursor,
          playerCacheBatchForPhase(phase),
        );

        for (const player of page.page) {
          if (!isActivePlayerWithMatchData(player)) continue;

          try {
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
          } catch (error) {
            console.error(
              `[playerStatsRebuild] ${phase} failed for ${player.discordUsername}:`,
              error,
            );
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
        if (job.tierEvalBatchCount > 0) {
          // Legacy in-flight jobs that stored a player-id list on the job document.
          if (tierEvalBatch < tierEvalBatchCount) {
            const batchPlayerIds = tierEvalPlayerIds.slice(
              tierEvalBatch * HEAVY_PLAYER_CACHE_BATCH,
              (tierEvalBatch + 1) * HEAVY_PLAYER_CACHE_BATCH,
            );
            try {
              await ctx.runMutation(internal.tierReEvaluationBatched.processBatch, {
                batchNumber: tierEvalBatch,
                recentOnly: job.tierEvalRecentOnly,
                playerIds: batchPlayerIds,
              });
            } catch (error) {
              console.error(
                `[playerStatsRebuild] tier_eval batch ${tierEvalBatch} failed:`,
                error,
              );
            }
            tierEvalBatch += 1;
            processedInPhase += 1;
            totalProcessed += 1;
          } else if (!tierEvalRecentMediansDone) {
            const mediansCache = await ctx.db.query("tierMediansCache").first();
            const partialRecent = mediansCache?.partialRecentHolisticByTier;
            const hasRecentPartials =
              partialRecent != null &&
              (["S", "A", "B", "C"] as const).some(
                (tier) => (partialRecent[tier]?.length ?? 0) > 0,
              );

            if (hasRecentPartials) {
              await ctx.runMutation(
                internal.tierReEvaluationBatched.finalizeRecentTierMediansFromBuild,
                {},
              );
              tierEvalRecentMediansDone = true;
              playersCursor = null;
              processedInPhase = 0;
            } else {
              const recentStep = await ctx.runMutation(
                internal.tierReEvaluationBatched.computeRecentTierMediansStep,
                { cursor: playersCursor },
              );
              if (recentStep.isDone) {
                tierEvalRecentMediansDone = true;
                playersCursor = null;
                processedInPhase = 0;
              } else {
                playersCursor = recentStep.continueCursor;
                processedInPhase += 1;
                totalProcessed += 1;
              }
            }
          } else {
            const mediansCache = await ctx.db.query("tierMediansCache").first();
            const recentMedians = (mediansCache?.recentTierHolisticMedians ?? {}) as Record<
              string,
              number | undefined
            >;
            const page = await ctx.db.query("tierReEvaluationCache").paginate({
              numItems: TIER_EVAL_FINALIZE_BATCH,
              cursor: playersCursor,
            });

            for (const entry of page.page) {
              const patch = patchRecentComparisonFields(entry, recentMedians);
              if (patch) {
                await ctx.db.patch(entry._id, patch);
              }
            }

            processedInPhase += page.page.length;
            totalProcessed += page.page.length;

            if (!page.isDone) {
              playersCursor = page.continueCursor;
            } else {
              phase =
                job.stopAfterPhase === "tier_eval" ? "completed" : nextPhase(phase);
              playersCursor = null;
              processedInPhase = 0;
            }
          }
        } else if (!tierEvalClearDone) {
          const clearStep = await ctx.runMutation(
            internal.tierReEvaluationBatched.clearCacheBatch,
            { cursor: playersCursor },
          );
          if (clearStep.isDone) {
            tierEvalClearDone = true;
            playersCursor = null;
            processedInPhase = 0;
            await ctx.runMutation(internal.tierReEvaluationBatched.resetTierMediansBuild, {});
          } else {
            playersCursor = clearStep.continueCursor;
          }
          totalProcessed += 1;
        } else if (!tierEvalMediansDone) {
          const mediansStep = await ctx.runMutation(
            internal.tierReEvaluationBatched.calculateTierMediansStep,
            {},
          );
          processedInPhase = mediansStep.totalPlayersScored;
          totalProcessed += 1;
          if (mediansStep.isDone) {
            tierEvalMediansDone = true;
            playersCursor = null;
            tierEvalPageIndex = 0;
            processedInPhase = 0;
          }
        } else if (!tierEvalInitialized) {
          const playersStep = await ctx.runMutation(
            internal.tierReEvaluationBatched.processOneTierEvalPlayerStep,
            {
              cursor: playersCursor,
              pageIndex: tierEvalPageIndex,
              recentOnly: job.tierEvalRecentOnly,
            },
          );
          processedInPhase += playersStep.processed;
          totalProcessed += 1;
          if (playersStep.isDone) {
            tierEvalInitialized = true;
            playersCursor = null;
            tierEvalPageIndex = 0;
            processedInPhase = 0;
          } else {
            playersCursor = playersStep.continueCursor;
            tierEvalPageIndex = playersStep.nextPageIndex;
          }
        } else if (!tierEvalRecentMediansDone) {
          await ctx.runMutation(
            internal.tierReEvaluationBatched.finalizeRecentTierMediansFromBuild,
            {},
          );
          tierEvalRecentMediansDone = true;
          playersCursor = null;
          processedInPhase = 0;
        } else {
          const mediansCache = await ctx.db.query("tierMediansCache").first();
          const recentMedians = (mediansCache?.recentTierHolisticMedians ?? {}) as Record<
            string,
            number | undefined
          >;
          const page = await ctx.db.query("tierReEvaluationCache").paginate({
            numItems: TIER_EVAL_FINALIZE_BATCH,
            cursor: playersCursor,
          });

          for (const entry of page.page) {
            const patch = patchRecentComparisonFields(entry, recentMedians);
            if (patch) {
              await ctx.db.patch(entry._id, patch);
            }
          }

          processedInPhase += page.page.length;
          totalProcessed += page.page.length;

          if (!page.isDone) {
            playersCursor = page.continueCursor;
          } else {
            phase =
              job.stopAfterPhase === "tier_eval" ? "completed" : nextPhase(phase);
            playersCursor = null;
            processedInPhase = 0;
          }
        }
      } else if (phase === "aggregate_stats") {
        if (job.includeAggregateStats) {
          const aggRunning = await ctx.db
            .query("aggregateStatsJobs")
            .withIndex("by_status", (q) => q.eq("status", "running"))
            .first();

          if (!aggRunning) {
            await ctx.runMutation(internal.aggregateStats.scheduleAggregateStatsRebuild, {});
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
          tierEvalClearDone,
          tierEvalMediansDone,
          tierEvalRecentMediansDone,
          tierEvalInitialized,
          tierEvalPageIndex,
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
        tierEvalClearDone,
        tierEvalMediansDone,
        tierEvalRecentMediansDone,
        tierEvalInitialized,
        tierEvalPageIndex,
        processedInPhase,
        totalProcessed,
        lastProgressAt: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.playerStatsRebuild.processRebuildStep, {
        jobId: args.jobId,
      });
    } catch (error) {
      const jobAtFail = await ctx.db.get(args.jobId);
      console.error(
        `[playerStatsRebuild] step failed in phase ${jobAtFail?.phase ?? "unknown"}:`,
        error,
      );
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage:
          error instanceof Error
            ? `${jobAtFail?.phase ?? "rebuild"}: ${error.message}`
            : "Unknown rebuild error",
        completedAt: Date.now(),
        lastProgressAt: Date.now(),
      });
    }
  },
});
