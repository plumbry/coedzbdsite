import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";
import { computeInternalPlayerStats } from "./lib/stats/computeInternalPlayerStats";
import { fetchThirdPartyResultsForPlayer } from "./helpers/playerResults";
import { FORMULA_VERSION } from "./lib/stats/versions";
import { listStatsEligiblePlayerIds } from "./lib/stats/listEligiblePlayers";

/** Population averages use `computeInternalPlayerStats` (Yunite imports) via `aggregateStatsCache`. */
const PLAYERS_PER_BATCH = 2;
/** One player per tick — keeps each mutation under Convex byte-read limits. */
const PLAYERS_PER_TICK = 1;

type PlayerStatSnapshot = {
  tier?: string;
  totalGames: number;
  totalEliminations: number;
  averagePlacement: number;
  averageScore: number;
  averageKD: number;
  winRate: number;
  top3Finishes: number;
};

const isValidDiscordId = (id: string | undefined): boolean => {
  if (!id || id === "") return false;
  if (id === "imported") return false;
  if (id.startsWith("placeholder_")) return false;
  return true;
};

async function listActivePlayersWithMatchData(ctx: MutationCtx) {
  const statsEligibleIds = await listStatsEligiblePlayerIds(ctx);
  const players = [];
  for (const playerId of statsEligibleIds) {
    const player = await ctx.db.get(playerId);
    if (
      player &&
      (player.status === "active" || player.status === undefined) &&
      isValidDiscordId(player.discordUserId)
    ) {
      players.push(player);
    }
  }
  return players;
}

function getMedian(sorted: number[]) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function buildCachePayload(playersWithEvents: PlayerStatSnapshot[]) {
  if (playersWithEvents.length === 0) {
    return {
      playerCount: 0,
      avgTotalEvents: 0,
      avgTotalEliminations: 0,
      avgAveragePlacement: 0,
      avgAverageScore: 0,
      avgAverageKD: 0,
      avgWinRate: 0,
      avgTop3Finishes: 0,
      medianTotalEvents: 0,
      medianAveragePlacement: 0,
      medianAverageScore: 0,
      medianAverageKD: 0,
      perTierStats: {
        S: emptyTierStats(),
        A: emptyTierStats(),
        B: emptyTierStats(),
        C: emptyTierStats(),
        D: emptyTierStats(),
      },
      lastUpdated: Date.now(),
      formulaVersion: FORMULA_VERSION,
    };
  }

  const totalEvents = playersWithEvents.reduce((sum, s) => sum + s.totalGames, 0);
  const totalEliminations = playersWithEvents.reduce(
    (sum, s) => sum + s.totalEliminations,
    0,
  );
  const avgPlacementSum = playersWithEvents.reduce(
    (sum, s) => sum + s.averagePlacement,
    0,
  );
  const avgScoreSum = playersWithEvents.reduce((sum, s) => sum + s.averageScore, 0);
  const avgKDSum = playersWithEvents.reduce((sum, s) => sum + s.averageKD, 0);
  const winRateSum = playersWithEvents.reduce((sum, s) => sum + s.winRate, 0);
  const top3Sum = playersWithEvents.reduce((sum, s) => sum + s.top3Finishes, 0);

  const count = playersWithEvents.length;

  const sortedTotalEvents = playersWithEvents
    .map((s) => s.totalGames)
    .sort((a, b) => a - b);
  const sortedAvgPlacement = playersWithEvents
    .map((s) => s.averagePlacement)
    .sort((a, b) => a - b);
  const sortedAvgScore = playersWithEvents
    .map((s) => s.averageScore)
    .sort((a, b) => a - b);
  const sortedAvgKD = playersWithEvents
    .map((s) => s.averageKD)
    .sort((a, b) => a - b);

  const tiers = ["S", "A", "B", "C", "D"] as const;
  const perTierStats: Record<
    (typeof tiers)[number],
    ReturnType<typeof emptyTierStats>
  > = {
    S: emptyTierStats(),
    A: emptyTierStats(),
    B: emptyTierStats(),
    C: emptyTierStats(),
    D: emptyTierStats(),
  };

  for (const tier of tiers) {
    const tierStatsWithEvents = playersWithEvents.filter(
      (s) => s.totalGames > 0 && s.tier === tier,
    );

    if (tierStatsWithEvents.length === 0) {
      continue;
    }

    const tierTotalEvents = tierStatsWithEvents.reduce(
      (sum, s) => sum + s.totalGames,
      0,
    );
    const tierTotalEliminations = tierStatsWithEvents.reduce(
      (sum, s) => sum + s.totalEliminations,
      0,
    );
    const tierAvgPlacementSum = tierStatsWithEvents.reduce(
      (sum, s) => sum + s.averagePlacement,
      0,
    );
    const tierAvgScoreSum = tierStatsWithEvents.reduce(
      (sum, s) => sum + s.averageScore,
      0,
    );
    const tierAvgKDSum = tierStatsWithEvents.reduce((sum, s) => sum + s.averageKD, 0);
    const tierWinRateSum = tierStatsWithEvents.reduce((sum, s) => sum + s.winRate, 0);
    const tierTop3Sum = tierStatsWithEvents.reduce(
      (sum, s) => sum + s.top3Finishes,
      0,
    );

    const tierCount = tierStatsWithEvents.length;

    const tierSortedTotalEvents = tierStatsWithEvents
      .map((s) => s.totalGames)
      .sort((a, b) => a - b);
    const tierSortedAvgPlacement = tierStatsWithEvents
      .map((s) => s.averagePlacement)
      .sort((a, b) => a - b);
    const tierSortedAvgScore = tierStatsWithEvents
      .map((s) => s.averageScore)
      .sort((a, b) => a - b);
    const tierSortedAvgKD = tierStatsWithEvents
      .map((s) => s.averageKD)
      .sort((a, b) => a - b);

    perTierStats[tier] = {
      playerCount: tierCount,
      avgTotalEvents: Math.round((tierTotalEvents / tierCount) * 10) / 10,
      avgTotalEliminations:
        Math.round((tierTotalEliminations / tierCount) * 10) / 10,
      avgAveragePlacement:
        Math.round((tierAvgPlacementSum / tierCount) * 10) / 10,
      avgAverageScore: Math.round((tierAvgScoreSum / tierCount) * 10) / 10,
      avgAverageKD: Math.round((tierAvgKDSum / tierCount) * 100) / 100,
      avgWinRate: Math.round((tierWinRateSum / tierCount) * 10) / 10,
      avgTop3Finishes: Math.round((tierTop3Sum / tierCount) * 10) / 10,
      medianTotalEvents: Math.round(getMedian(tierSortedTotalEvents) * 10) / 10,
      medianAveragePlacement:
        Math.round(getMedian(tierSortedAvgPlacement) * 10) / 10,
      medianAverageScore: Math.round(getMedian(tierSortedAvgScore) * 10) / 10,
      medianAverageKD: Math.round(getMedian(tierSortedAvgKD) * 100) / 100,
    };
  }

  return {
    playerCount: count,
    avgTotalEvents: Math.round((totalEvents / count) * 10) / 10,
    avgTotalEliminations: Math.round((totalEliminations / count) * 10) / 10,
    avgAveragePlacement: Math.round((avgPlacementSum / count) * 10) / 10,
    avgAverageScore: Math.round((avgScoreSum / count) * 10) / 10,
    avgAverageKD: Math.round((avgKDSum / count) * 100) / 100,
    avgWinRate: Math.round((winRateSum / count) * 10) / 10,
    avgTop3Finishes: Math.round((top3Sum / count) * 10) / 10,
    medianTotalEvents: Math.round(getMedian(sortedTotalEvents) * 10) / 10,
    medianAveragePlacement: Math.round(getMedian(sortedAvgPlacement) * 10) / 10,
    medianAverageScore: Math.round(getMedian(sortedAvgScore) * 10) / 10,
    medianAverageKD: Math.round(getMedian(sortedAvgKD) * 100) / 100,
    perTierStats,
    lastUpdated: Date.now(),
    formulaVersion: FORMULA_VERSION,
  };
}

function emptyTierStats() {
  return {
    playerCount: 0,
    avgTotalEvents: 0,
    avgTotalEliminations: 0,
    avgAveragePlacement: 0,
    avgAverageScore: 0,
    avgAverageKD: 0,
    avgWinRate: 0,
    avgTop3Finishes: 0,
    medianTotalEvents: 0,
    medianAveragePlacement: 0,
    medianAverageScore: 0,
    medianAverageKD: 0,
  };
}

async function writeAggregateStatsCache(
  ctx: MutationCtx,
  statsData: ReturnType<typeof buildCachePayload> & {
    rebuildPoolCount?: number;
    excludedNoYuniteEvents?: number;
  },
) {
  const existingCache = await ctx.db.query("aggregateStatsCache").first();
  if (existingCache) {
    await ctx.db.delete(existingCache._id);
  }
  await ctx.db.insert("aggregateStatsCache", statsData);
}

async function appendRebuildRow(
  ctx: MutationCtx,
  jobId: Id<"aggregateStatsJobs">,
  row: PlayerStatSnapshot,
) {
  await ctx.db.insert("aggregateStatsRebuildRows", { jobId, ...row });
}

async function loadRebuildRows(
  ctx: MutationCtx,
  jobId: Id<"aggregateStatsJobs">,
): Promise<PlayerStatSnapshot[]> {
  const rows = await ctx.db
    .query("aggregateStatsRebuildRows")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();

  return rows.map((row) => ({
    tier: row.tier,
    totalGames: row.totalGames,
    totalEliminations: row.totalEliminations,
    averagePlacement: row.averagePlacement,
    averageScore: row.averageScore,
    averageKD: row.averageKD,
    winRate: row.winRate,
    top3Finishes: row.top3Finishes,
  }));
}

async function deleteRebuildRows(ctx: MutationCtx, jobId: Id<"aggregateStatsJobs">) {
  const rows = await ctx.db
    .query("aggregateStatsRebuildRows")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

async function failStaleRunningJobs(ctx: MutationCtx) {
  const staleMs = 15 * 60 * 1000;
  const now = Date.now();
  const running = await ctx.db
    .query("aggregateStatsJobs")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .collect();

  for (const job of running) {
    if (now - job.lastProgressAt > staleMs) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage: "Rebuild timed out (no progress for 15 minutes)",
        completedAt: now,
      });
    }
  }
}

// Get average statistics from cache
export const getAveragePlayerStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || user.role !== "admin") {
      return null;
    }

    const cached = await ctx.db.query("aggregateStatsCache").first();
    if (!cached) {
      return null;
    }

    return {
      playerCount: cached.playerCount,
      avgTotalEvents: cached.avgTotalEvents,
      avgTotalEliminations: cached.avgTotalEliminations,
      avgAveragePlacement: cached.avgAveragePlacement,
      avgAverageScore: cached.avgAverageScore,
      avgAverageKD: cached.avgAverageKD,
      avgWinRate: cached.avgWinRate,
      avgTop3Finishes: cached.avgTop3Finishes,
      medianTotalEvents: cached.medianTotalEvents,
      medianAveragePlacement: cached.medianAveragePlacement,
      medianAverageScore: cached.medianAverageScore,
      medianAverageKD: cached.medianAverageKD,
      perTierStats: cached.perTierStats,
      lastUpdated: cached.lastUpdated,
    };
  },
});

export const getRebuildJobStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const job = await ctx.db
      .query("aggregateStatsJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (!job) {
      return null;
    }

    return {
      status: job.status,
      processedCount: job.processedCount,
      totalCount: job.totalCount,
      startedAt: job.startedAt,
      lastProgressAt: job.lastProgressAt,
      errorMessage: job.errorMessage,
    };
  },
});

// Starts a batched background rebuild; returns immediately.
async function snapshotPlayerForAggregate(
  ctx: MutationCtx,
  entry: { playerId: Id<"players">; tier?: string },
): Promise<PlayerStatSnapshot | null> {
  try {
    const thirdPartyResults = await fetchThirdPartyResultsForPlayer(
      ctx,
      entry.playerId,
    );
    const internal = await computeInternalPlayerStats(
      ctx,
      entry.playerId,
      thirdPartyResults,
    );
    const totalYunitePoints = thirdPartyResults.reduce(
      (sum, row) => sum + row.points,
      0,
    );
    const averageScore =
      thirdPartyResults.length > 0
        ? Math.round((totalYunitePoints / thirdPartyResults.length) * 10) / 10
        : 0;

    return {
      tier: entry.tier,
      totalGames: internal.eventsPlayed,
      totalEliminations: internal.totalEliminations,
      averagePlacement: internal.averagePlacement,
      averageScore,
      averageKD: internal.killsPerMatch,
      winRate: internal.winRate,
      top3Finishes: internal.top3Finishes,
    };
  } catch (error) {
    console.error(
      `[aggregateStats] player ${entry.playerId} failed:`,
      error,
    );
    return null;
  }
}

async function scheduleAggregateStatsRebuildHandler(ctx: MutationCtx) {
  await failStaleRunningJobs(ctx);

  const running = await ctx.db
    .query("aggregateStatsJobs")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .first();

  if (running) {
    throw new ConvexError({
      message: "An aggregate stats rebuild is already running",
      code: "CONFLICT",
    });
  }

  const activePlayers = await listActivePlayersWithMatchData(ctx);
  const players = activePlayers.map((p) => ({
    playerId: p._id,
    tier: p.tier,
  }));

  const now = Date.now();

  if (players.length === 0) {
    const statsData = buildCachePayload([]);
    await writeAggregateStatsCache(ctx, statsData);
    return { started: false, playerCount: 0, completed: true };
  }

  const jobId = await ctx.db.insert("aggregateStatsJobs", {
    status: "running",
    totalCount: players.length,
    processedCount: 0,
    nextPlayerIndex: 0,
    players,
    accumulatedStats: [],
    startedAt: now,
    lastProgressAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.aggregateStats.advanceAggregateStatsJobStep, {
    jobId,
  });

  return { started: true, playerCount: players.length, jobId };
}

async function advanceAggregateJob(
  ctx: MutationCtx,
  jobId: Id<"aggregateStatsJobs">,
  maxPlayers: number,
) {
  const job = await ctx.db.get(jobId);
  if (!job || job.status !== "running") {
    return { done: true as const, reason: "no_running_job" as const };
  }

  const startIdx = job.nextPlayerIndex;
  if (startIdx >= job.players.length) {
    return { done: false as const, needsFinalize: true as const };
  }

  const endIdx = Math.min(startIdx + maxPlayers, job.players.length);

  for (let idx = startIdx; idx < endIdx; idx++) {
    try {
      const entry = job.players[idx];
      const row = await snapshotPlayerForAggregate(ctx, entry);
      if (row) {
        await appendRebuildRow(ctx, jobId, row);
      }
    } catch (error) {
      console.error(
        `[aggregateStats] player index ${idx} failed for job ${jobId}:`,
        error,
      );
    }
  }

  const nextIdx = endIdx;
  const needsFinalize = nextIdx >= job.players.length;

  await ctx.db.patch(jobId, {
    processedCount: nextIdx,
    nextPlayerIndex: nextIdx,
    lastProgressAt: Date.now(),
  });

  return {
    done: needsFinalize,
    needsFinalize,
    processedCount: nextIdx,
    totalCount: job.totalCount,
  };
}

export const scheduleAggregateStatsRebuild = internalMutation({
  args: {},
  handler: scheduleAggregateStatsRebuildHandler,
});

export const processRebuildBatch = internalMutation({
  args: {
    jobId: v.id("aggregateStatsJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }

    try {
      const batchEnd = Math.min(
        job.nextPlayerIndex + PLAYERS_PER_BATCH,
        job.players.length,
      );
      const batch = job.players.slice(job.nextPlayerIndex, batchEnd);
      const newRows: PlayerStatSnapshot[] = [];

      for (const entry of batch) {
        const row = await snapshotPlayerForAggregate(ctx, entry);
        if (row) {
          newRows.push(row);
        }
      }

      for (const row of newRows) {
        await appendRebuildRow(ctx, args.jobId, row);
      }

      const processedCount = batchEnd;
      const isDone = processedCount >= job.players.length;

      if (!isDone) {
        await ctx.db.patch(args.jobId, {
          processedCount,
          nextPlayerIndex: batchEnd,
          lastProgressAt: Date.now(),
        });

        await ctx.scheduler.runAfter(
          0,
          internal.aggregateStats.processRebuildBatch,
          { jobId: args.jobId },
        );
        return;
      }

      const accumulatedStats = await loadRebuildRows(ctx, args.jobId);
      const playersWithEvents = accumulatedStats.filter((s) => s.totalGames > 0);
      const withoutYuniteEvents = accumulatedStats.filter((s) => s.totalGames === 0);
      const statsData = {
        ...buildCachePayload(playersWithEvents),
        rebuildPoolCount: job.totalCount,
        excludedNoYuniteEvents: withoutYuniteEvents.length,
      };
      await writeAggregateStatsCache(ctx, statsData);
      await deleteRebuildRows(ctx, args.jobId);

      const completedAt = Date.now();
      await ctx.db.patch(args.jobId, {
        status: "completed",
        processedCount: job.totalCount,
        nextPlayerIndex: job.players.length,
        accumulatedStats: [],
        lastProgressAt: completedAt,
        completedAt,
      });
    } catch (error) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown rebuild error",
        completedAt: Date.now(),
      });
    }
  },
});

/** Cancel in-flight aggregate rebuild jobs (ops / recovery). */
export const cancelRunningAggregateStatsJobs = internalMutation({
  args: {
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const running = await ctx.db
      .query("aggregateStatsJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const now = Date.now();
    const reason = args.reason ?? "Cancelled";
    for (const job of running) {
      await deleteRebuildRows(ctx, job._id);
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage: reason,
        completedAt: now,
        lastProgressAt: now,
        accumulatedStats: [],
      });
    }

    return { cancelled: running.length };
  },
});

/** Cancel any running job and start a fresh aggregate cache rebuild. */
export const recoverAggregateStatsCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    await failStaleRunningJobs(ctx);
    await ctx.runMutation(internal.aggregateStats.cancelRunningAggregateStatsJobs, {
      reason: "Cancelled for aggregate cache recovery rebuild",
    });
    return await scheduleAggregateStatsRebuildHandler(ctx);
  },
});

/** Self-scheduled driver — one batch per invocation while a job is running. */
export const advanceAggregateStatsJobStep = internalMutation({
  args: { jobId: v.id("aggregateStatsJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return { done: true as const, reason: "no_running_job" as const };
    }

    if (job.nextPlayerIndex >= job.players.length) {
      return await finalizeAggregateJobHandler(ctx, args.jobId);
    }

    const advanced = await advanceAggregateJob(ctx, args.jobId, PLAYERS_PER_TICK);
    if (advanced.needsFinalize) {
      return await finalizeAggregateJobHandler(ctx, args.jobId);
    }

    await ctx.scheduler.runAfter(0, internal.aggregateStats.advanceAggregateStatsJobStep, {
      jobId: args.jobId,
    });
    return advanced;
  },
});

/** Manual single-tick advance for one job (ops recovery). */
export const processRebuildSingleStep = internalMutation({
  args: { jobId: v.id("aggregateStatsJobs") },
  handler: async (ctx, args) => {
    const advanced = await advanceAggregateJob(ctx, args.jobId, PLAYERS_PER_TICK);
    if (advanced.needsFinalize) {
      return await finalizeAggregateJobHandler(ctx, args.jobId);
    }
    return advanced;
  },
});

async function finalizeAggregateJobHandler(
  ctx: MutationCtx,
  jobId: Id<"aggregateStatsJobs">,
) {
  const job = await ctx.db.get(jobId);
  if (!job || job.status !== "running") {
    return { done: true as const, reason: "no_running_job" as const };
  }

  const accumulatedStats = await loadRebuildRows(ctx, jobId);
  const playersWithEvents = accumulatedStats.filter((s) => s.totalGames > 0);
  const withoutYuniteEvents = accumulatedStats.filter((s) => s.totalGames === 0);
  const statsData = {
    ...buildCachePayload(playersWithEvents),
    rebuildPoolCount: job.totalCount,
    excludedNoYuniteEvents: withoutYuniteEvents.length,
  };
  await writeAggregateStatsCache(ctx, statsData);
  await deleteRebuildRows(ctx, jobId);

  const completedAt = Date.now();
  await ctx.db.patch(jobId, {
    status: "completed",
    processedCount: job.totalCount,
    nextPlayerIndex: job.players.length,
    accumulatedStats: [],
    lastProgressAt: completedAt,
    completedAt,
  });

  return {
    done: true as const,
    playerCount: statsData.playerCount,
    formulaVersion: statsData.formulaVersion,
    skippedPlayers: job.totalCount - accumulatedStats.length,
  };
}

/** Write aggregateStatsCache from scratch rows (separate step to stay under read limits). */
export const finalizeAggregateStatsJob = internalMutation({
  args: { jobId: v.id("aggregateStatsJobs") },
  handler: async (ctx, args) => finalizeAggregateJobHandler(ctx, args.jobId),
});

/** Finish a stalled batched job from its cursor using single-player steps. */
export const finalizeStalledAggregateStatsJob = internalMutation({
  args: {
    jobId: v.optional(v.id("aggregateStatsJobs")),
  },
  handler: async (ctx, args) => {
    const job =
      args.jobId != null
        ? await ctx.db.get(args.jobId)
        : await ctx.db
            .query("aggregateStatsJobs")
            .withIndex("by_status", (q) => q.eq("status", "running"))
            .first();

    if (!job || job.status !== "running") {
      return { started: false, reason: "no_running_job" };
    }

    await ctx.scheduler.runAfter(0, internal.aggregateStats.advanceAggregateStatsJobStep, {
      jobId: job._id,
    });

    return {
      started: true,
      jobId: job._id,
      resumeFrom: job.nextPlayerIndex,
      totalCount: job.totalCount,
    };
  },
});

/** Re-schedule the next batch for a running job (scheduler chain recovery). */
export const kickAggregateStatsRebuild = internalMutation({
  args: {
    jobId: v.optional(v.id("aggregateStatsJobs")),
  },
  handler: async (ctx, args) => {
    const job =
      args.jobId != null
        ? await ctx.db.get(args.jobId)
        : await ctx.db
            .query("aggregateStatsJobs")
            .withIndex("by_status", (q) => q.eq("status", "running"))
            .first();

    if (!job || job.status !== "running") {
      return { kicked: false, reason: "no_running_job" };
    }

    await ctx.scheduler.runAfter(0, internal.aggregateStats.advanceAggregateStatsJobStep, {
      jobId: job._id,
    });

    return {
      kicked: true,
      jobId: job._id,
      processedCount: job.processedCount,
      totalCount: job.totalCount,
    };
  },
});

export const getAggregateStatsCacheInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cache = await ctx.db.query("aggregateStatsCache").first();
    const running = await ctx.db
      .query("aggregateStatsJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    return {
      cache: cache
        ? {
            lastUpdated: cache.lastUpdated,
            formulaVersion: cache.formulaVersion,
            playerCount: cache.playerCount,
            avgTotalEvents: cache.avgTotalEvents,
            avgWinRate: cache.avgWinRate,
            avgAveragePlacement: cache.avgAveragePlacement,
            avgAverageKD: cache.avgAverageKD,
            avgTotalEliminations: cache.avgTotalEliminations,
            avgAverageScore: cache.avgAverageScore,
            avgTop3Finishes: cache.avgTop3Finishes,
          }
        : null,
      runningJob: running
        ? {
            jobId: running._id,
            processedCount: running.processedCount,
            totalCount: running.totalCount,
            lastProgressAt: running.lastProgressAt,
            nextPlayerIndex: running.nextPlayerIndex,
            stuckPlayerId: running.players[running.nextPlayerIndex]?.playerId,
            errorMessage: running.errorMessage,
          }
        : null,
    };
  },
});
