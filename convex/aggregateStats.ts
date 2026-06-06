import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

const PLAYERS_PER_BATCH = 8;

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
  const allPlayers = await ctx.db.query("players").collect();
  return allPlayers.filter(
    (p) =>
      (p.status === "active" || p.status === undefined) &&
      isValidDiscordId(p.discordUserId) &&
      p.hasMatchData === true,
  );
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
  statsData: ReturnType<typeof buildCachePayload>,
) {
  const existingCache = await ctx.db.query("aggregateStatsCache").first();
  if (existingCache) {
    await ctx.db.delete(existingCache._id);
  }
  await ctx.db.insert("aggregateStatsCache", statsData);
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

  await ctx.scheduler.runAfter(0, internal.aggregateStats.processRebuildBatch, {
    jobId,
  });

  return { started: true, playerCount: players.length, jobId };
}

export const scheduleAggregateStatsRebuild = internalMutation({
  args: {},
  handler: scheduleAggregateStatsRebuildHandler,
});

export const rebuildAggregateStatsCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return scheduleAggregateStatsRebuildHandler(ctx);
  },
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
        const stats = await ctx.runQuery(
          internal.playerStats.comprehensiveStatsForPlayerInternal,
          { playerId: entry.playerId },
        );
        newRows.push({
          tier: entry.tier,
          totalGames: stats.totalGames,
          totalEliminations: stats.totalEliminations,
          averagePlacement: stats.averagePlacement,
          averageScore: stats.averageScore,
          averageKD: stats.averageKD,
          winRate: stats.winRate,
          top3Finishes: stats.top3Finishes,
        });
      }

      const accumulatedStats = [...job.accumulatedStats, ...newRows];
      const processedCount = batchEnd;
      const isDone = processedCount >= job.players.length;

      if (!isDone) {
        await ctx.db.patch(args.jobId, {
          processedCount,
          nextPlayerIndex: batchEnd,
          accumulatedStats,
          lastProgressAt: Date.now(),
        });

        await ctx.scheduler.runAfter(
          0,
          internal.aggregateStats.processRebuildBatch,
          { jobId: args.jobId },
        );
        return;
      }

      const playersWithEvents = accumulatedStats.filter((s) => s.totalGames > 0);
      const statsData = buildCachePayload(playersWithEvents);
      await writeAggregateStatsCache(ctx, statsData);

      const completedAt = Date.now();
      await ctx.db.patch(args.jobId, {
        status: "completed",
        processedCount: job.totalCount,
        nextPlayerIndex: job.players.length,
        accumulatedStats,
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
