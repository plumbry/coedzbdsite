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
import { collectAffectedPlayerIdsForImport } from "./lib/importRematch";
import {
  buildPlayerStatsCacheStatusReport,
  collectAffectedPlayerIdsSince,
  getLastSuccessfulCacheRebuildAt,
} from "./lib/stats/playerStatsCacheStatus";
import { updateTierEvalForPlayerIfEligible } from "./lib/stats/updateTierEvalForPlayer";
import {
  updateStatsForPlayer,
  updateStatsForPlayers,
} from "./lib/stats/updatePlayerStatsCache";

const REBUILD_BATCH_SIZE = 3;
const COLLECT_RESULTS_PAGE = 500;

export const getPlayerStatsCache = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playerStatsCache")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .first();
  },
});

/** Indexed health check — estimates whether a full rebuild is needed. */
export const getStatsCacheStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await buildPlayerStatsCacheStatusReport(ctx);
  },
});

/** Admin summary for post-deploy backfill verification. */
export const getCacheStatusSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const report = await buildPlayerStatsCacheStatusReport(ctx);

    return {
      populated: report.rowCount > 0,
      totalRows: report.rowCount,
      statsEligible: report.statsEligibleCount,
      reevaluationEligible: report.reevaluationEligibleCount,
      belowDisplayThreshold: report.belowDisplayThreshold,
      betweenDisplayAndReeval:
        report.statsEligibleCount -
        report.reevaluationEligibleCount,
      activeRebuild: report.activeRebuild,
      recommendation: report.recommendation,
      recommendationReason: report.recommendationReason,
      appearsStale: report.appearsStale,
      estimatedAffectedPlayers: report.estimatedAffectedPlayers,
      lastCheckedAt: report.checkedAt,
    };
  },
});

export const recalculateStatsForPlayer = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const outcome = await updateStatsForPlayer(ctx, args.playerId);
    const tierEval = await updateTierEvalForPlayerIfEligible(ctx, args.playerId);
    return { ...outcome, tierEval };
  },
});

export const recalculateStatsForImport = mutation({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const playerIds = await collectAffectedPlayerIdsForImport(ctx, args.importId);
    const summary = await updateStatsForPlayers(ctx, playerIds);

    let tierEvalUpdated = 0;
    for (const playerId of playerIds) {
      const result = await updateTierEvalForPlayerIfEligible(ctx, playerId);
      if (result.tierEvalUpdated) {
        tierEvalUpdated += 1;
      }
    }

    return {
      importId: args.importId,
      affectedPlayers: playerIds.length,
      ...summary,
      tierEvalUpdated,
    };
  },
});

export const getActiveCacheRebuildJob = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("playerStatsCacheRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();
  },
});

async function startCacheRebuildJob(
  ctx: MutationCtx,
  args: {
    mode: "all_with_results" | "import" | "single" | "batch";
    importId?: Id<"thirdPartyImports">;
    playerId?: Id<"players">;
    playerIds?: Id<"players">[];
  },
) {
  const running = await ctx.db
    .query("playerStatsCacheRebuildJobs")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .first();
  if (running) {
    throw new ConvexError({
      message: "A player stats cache rebuild is already running",
      code: "CONFLICT",
    });
  }

  let playerIds = args.playerIds ?? [];
  let collectingPlayerIds = false;
  let resultsCursor: string | null = null;

  if (args.mode === "single" && args.playerId) {
    playerIds = [args.playerId];
  } else if (args.mode === "batch") {
    if (!args.playerIds || args.playerIds.length === 0) {
      throw new ConvexError({
        message: "Batch stats cache rebuild requires at least one player ID",
        code: "INVALID_ARGUMENT",
      });
    }
    playerIds = [...new Set(args.playerIds.map((id) => id as string))] as Id<"players">[];
  } else if (args.mode === "import" && args.importId) {
    playerIds = await collectAffectedPlayerIdsForImport(ctx, args.importId);
  } else if (args.mode === "all_with_results") {
    collectingPlayerIds = true;
    resultsCursor = null;
    playerIds = [];
  }

  const now = Date.now();
  const jobId = await ctx.db.insert("playerStatsCacheRebuildJobs", {
    status: "running",
    mode: args.mode,
    importId: args.importId,
    playerId: args.playerId,
    playerIds,
    nextPlayerIndex: 0,
    processedCount: 0,
    playersUpdated: 0,
    skippedNoChange: 0,
    errors: [],
    resultsCursor,
    collectingPlayerIds,
    startedAt: now,
    lastProgressAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.playerStatsCache.processCacheRebuildStep, {
    jobId,
  });

  return { jobId, playerCount: playerIds.length, collectingPlayerIds };
}

export const rebuildAllPlayerStatsCache = mutation({
  args: { confirm: v.literal(true) },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await startCacheRebuildJob(ctx, { mode: "all_with_results" });
  },
});

/** Recalculate cache rows only for players touched since the last successful rebuild. */
export const recalculateAffectedPlayerStatsCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const report = await buildPlayerStatsCacheStatusReport(ctx);
    if (report.recommendation === "full_rebuild") {
      throw new ConvexError({
        message: report.recommendationReason,
        code: "PRECONDITION_FAILED",
      });
    }

    const watermark =
      (await getLastSuccessfulCacheRebuildAt(ctx)) ??
      report.lastCalculatedAt.newest ??
      0;
    const { playerIds } = await collectAffectedPlayerIdsSince(ctx, watermark);

    if (playerIds.length === 0) {
      return {
        started: false,
        playerCount: 0,
        message: "No affected players since the last successful cache rebuild.",
      };
    }

    const result = await startCacheRebuildJob(ctx, {
      mode: "batch",
      playerIds,
    });

    return {
      started: true,
      playerCount: result.playerCount,
      jobId: result.jobId,
      message: `Recalculating stats cache for ${playerIds.length} affected player(s).`,
    };
  },
});

export const rebuildTierReevaluationForEligible = mutation({
  args: { confirm: v.literal(true) },
  handler: async (
    ctx,
  ): Promise<{ jobId: Id<"playerStatsRebuildJobs">; message: string }> => {
    await requireAdmin(ctx);

    const running = await ctx.db
      .query("playerStatsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();
    if (running) {
      throw new ConvexError({
        message: "A player stats rebuild is already running",
        code: "CONFLICT",
      });
    }

    return await ctx.runMutation(internal.playerStatsRebuild.scheduleFullRebuild, {
      tierEvalOnly: true,
    });
  },
});

export const scheduleStatsUpdateForPlayers = internalMutation({
  args: {
    playerIds: v.array(v.id("players")),
    matchDataChangedPlayerIds: v.optional(v.array(v.id("players"))),
  },
  handler: async (ctx, args) => {
    if (args.playerIds.length === 0) {
      return { scheduled: false };
    }

    const unique = [...new Set(args.playerIds.map((id) => id as string))] as Id<
      "players"
    >[];

    await ctx.scheduler.runAfter(0, internal.playerStatsCache.updateStatsBatchInternal, {
      playerIds: unique,
      matchDataChangedPlayerIds: args.matchDataChangedPlayerIds,
    });

    return { scheduled: true, count: unique.length };
  },
});

export const updateStatsBatchInternal = internalMutation({
  args: {
    playerIds: v.array(v.id("players")),
    matchDataChangedPlayerIds: v.optional(v.array(v.id("players"))),
  },
  handler: async (ctx, args) => {
    const matchDataChangedPlayerIds = args.matchDataChangedPlayerIds
      ? new Set(args.matchDataChangedPlayerIds.map((id) => id as string))
      : undefined;
    const summary = await updateStatsForPlayers(ctx, args.playerIds, {
      matchDataChangedPlayerIds,
    });
    let tierEvalUpdated = 0;
    for (const playerId of args.playerIds) {
      const result = await updateTierEvalForPlayerIfEligible(ctx, playerId);
      if (result.tierEvalUpdated) {
        tierEvalUpdated += 1;
      }
    }
    return { ...summary, tierEvalUpdated };
  },
});

export const processCacheRebuildStep = internalMutation({
  args: { jobId: v.id("playerStatsCacheRebuildJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }

    try {
      let playerIds = job.playerIds;
      let nextPlayerIndex = job.nextPlayerIndex;
      let resultsCursor = job.resultsCursor;
      let collectingPlayerIds = job.collectingPlayerIds ?? false;
      let playersUpdated = job.playersUpdated;
      let skippedNoChange = job.skippedNoChange;
      const errors = [...job.errors];

      if (collectingPlayerIds) {
        const page = await ctx.db
          .query("thirdPartyResults")
          .paginate({ numItems: COLLECT_RESULTS_PAGE, cursor: resultsCursor });

        const seen = new Set(playerIds.map((id) => id as string));
        for (const row of page.page) {
          if (row.matched && row.playerId) {
            const key = row.playerId as string;
            if (!seen.has(key)) {
              seen.add(key);
              playerIds.push(row.playerId);
            }
          }
        }

        if (!page.isDone) {
          await ctx.db.patch(args.jobId, {
            playerIds,
            resultsCursor: page.continueCursor,
            collectingPlayerIds: true,
            lastProgressAt: Date.now(),
          });
          await ctx.scheduler.runAfter(0, internal.playerStatsCache.processCacheRebuildStep, {
            jobId: args.jobId,
          });
          return;
        }

        collectingPlayerIds = false;
        resultsCursor = null;
        nextPlayerIndex = 0;
      }

      const end = Math.min(nextPlayerIndex + REBUILD_BATCH_SIZE, playerIds.length);
      const batch = playerIds.slice(nextPlayerIndex, end);
      const batchSummary = await updateStatsForPlayers(ctx, batch);
      playersUpdated += batchSummary.playersUpdated;
      skippedNoChange += batchSummary.skippedNoChange;
      errors.push(...batchSummary.errors);

      for (const playerId of batch) {
        await updateTierEvalForPlayerIfEligible(ctx, playerId);
      }

      nextPlayerIndex = end;
      const done = nextPlayerIndex >= playerIds.length;

      if (!done) {
        await ctx.db.patch(args.jobId, {
          playerIds,
          nextPlayerIndex,
          processedCount: nextPlayerIndex,
          playersUpdated,
          skippedNoChange,
          errors,
          collectingPlayerIds: false,
          resultsCursor: null,
          lastProgressAt: Date.now(),
        });
        await ctx.scheduler.runAfter(0, internal.playerStatsCache.processCacheRebuildStep, {
          jobId: args.jobId,
        });
        return;
      }

      await ctx.db.patch(args.jobId, {
        status: "completed",
        playerIds,
        nextPlayerIndex,
        processedCount: playerIds.length,
        playersUpdated,
        skippedNoChange,
        errors,
        collectingPlayerIds: false,
        completedAt: Date.now(),
        lastProgressAt: Date.now(),
      });
    } catch (error) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: Date.now(),
        lastProgressAt: Date.now(),
      });
    }
  },
});
