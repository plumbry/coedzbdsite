import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { fetchThirdPartyResultsForPlayer } from "../helpers/playerResults";
import { isYuniteImport } from "../lib/importSource";

async function expectedYuniteImportCount(
  ctx: QueryCtx,
  playerId: Id<"players">,
): Promise<number> {
  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);
  const yuniteImportIds = new Set<string>();

  for (const result of thirdPartyResults) {
    const importRecord = await ctx.db.get(result.importId);
    if (!importRecord || !isYuniteImport(importRecord)) {
      continue;
    }
    yuniteImportIds.add(result.importId as string);
  }

  return yuniteImportIds.size;
}

function bumpCount(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export const capturePhase3bSnapshotPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    pageSize: v.optional(v.number()),
    includeTierEval: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const pageSize = args.pageSize ?? 35;
    const includeTierEval = args.includeTierEval ?? false;

    const page = await ctx.db.query("players").paginate({
      numItems: pageSize,
      cursor: args.cursor,
    });

    const eventsPlayedRows: Array<{
      playerId: Id<"players">;
      discordUsername: string;
      stored: number;
      expected: number;
      delta: number;
    }> = [];

    const topFiveMismatches: Array<{
      playerId: Id<"players">;
      discordUsername: string;
      playerCache: number;
      tierEvalCache: number;
    }> = [];

    const byStatus: Record<string, number> = {};
    const byMembership: Record<string, number> = {};
    let withTier = 0;
    let withMatchData = 0;

    let tierEvalByPlayer: Map<string, { recentTop5Count: number }> | null = null;
    if (includeTierEval) {
      const tierEval = await ctx.db.query("tierReEvaluationCache").collect();
      tierEvalByPlayer = new Map(
        tierEval.map((row) => [
          row.playerId as string,
          { recentTop5Count: row.recentTop5Count },
        ]),
      );
    }

    for (const player of page.page) {
      bumpCount(byStatus, player.status ?? "unset");
      bumpCount(byMembership, player.currentMembershipStatus ?? "unset");
      if (player.tier) withTier += 1;
      if (player.hasMatchData) withMatchData += 1;

      const expected = await expectedYuniteImportCount(ctx, player._id);
      const stored = player.eventsPlayedCount ?? 0;
      if (stored !== expected) {
        eventsPlayedRows.push({
          playerId: player._id,
          discordUsername: player.discordUsername,
          stored,
          expected,
          delta: expected - stored,
        });
      }

      if (tierEvalByPlayer) {
        const cacheTop5 = player.topFiveCache?.recentTop5Count ?? 0;
        const tierRow = tierEvalByPlayer.get(player._id as string);
        if (tierRow && tierRow.recentTop5Count !== cacheTop5) {
          topFiveMismatches.push({
            playerId: player._id,
            discordUsername: player.discordUsername,
            playerCache: cacheTop5,
            tierEvalCache: tierRow.recentTop5Count,
          });
        }
      }
    }

    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      processed: page.page.length,
      populationBreakdown: {
        byStatus,
        byMembership,
        withTier,
        withMatchData,
      },
      eventsPlayedRows,
      topFiveMismatches,
    };
  },
});

export const getAggregateStatsSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const aggregateCache = await ctx.db.query("aggregateStatsCache").first();
    if (!aggregateCache) {
      return null;
    }

    return {
      lastUpdated: aggregateCache.lastUpdated,
      formulaVersion: aggregateCache.formulaVersion,
      playerCount: aggregateCache.playerCount,
      avgTotalEvents: aggregateCache.avgTotalEvents,
      avgWinRate: aggregateCache.avgWinRate,
      avgAveragePlacement: aggregateCache.avgAveragePlacement,
      avgAverageKD: aggregateCache.avgAverageKD,
      avgTotalEliminations: aggregateCache.avgTotalEliminations,
      avgAverageScore: aggregateCache.avgAverageScore,
      avgTop3Finishes: aggregateCache.avgTop3Finishes,
    };
  },
});

export const getTierEvalStatusSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tierEval = await ctx.db.query("tierReEvaluationCache").collect();

    const missingRecentStatus = tierEval.filter(
      (row) =>
        row.recentHolisticScore != null &&
        (row.recentTotalEvents ?? 0) > 0 &&
        !row.recentEvaluationStatus,
    );

    const missingStatusRaw = tierEval.filter(
      (row) => row.evaluationStatus && !row.evaluationStatusRaw,
    );

    return {
      tierEvalCount: tierEval.length,
      tierEvalStatuses: tierEval.map((row) => ({
        playerId: row.playerId,
        discordUsername: row.discordUsername,
        evaluationStatus: row.evaluationStatus,
        evaluationStatusRaw: row.evaluationStatusRaw,
        recentEvaluationStatus: row.recentEvaluationStatus,
        recentEvaluationStatusRaw: row.recentEvaluationStatusRaw,
        recentTop5Count: row.recentTop5Count,
        recentTotalEvents: row.recentTotalEvents,
        formulaVersion: row.formulaVersion,
      })),
      missingRecentStatusCount: missingRecentStatus.length,
      missingStatusRawCount: missingStatusRaw.length,
      missingRecentStatusExamples: missingRecentStatus.slice(0, 10).map((r) => ({
        discordUsername: r.discordUsername,
        recentTotalEvents: r.recentTotalEvents,
      })),
    };
  },
});

const EVALUATION_STATUS_BUCKETS = [
  "Insufficient Data",
  "Stable",
  "Eligible for Promotion Evaluation",
  "Strong Promotion Outlier",
  "Eligible for Demotion Evaluation",
  "Strong Demotion Outlier",
] as const;

export const getEvaluationStatusDistribution = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tierEval = await ctx.db.query("tierReEvaluationCache").collect();
    const distribution: Record<string, number> = {};
    for (const label of EVALUATION_STATUS_BUCKETS) {
      distribution[label] = 0;
    }

    let formulaVersion: number | undefined;
    for (const row of tierEval) {
      const status = row.evaluationStatus;
      distribution[status] = (distribution[status] ?? 0) + 1;
      if (formulaVersion == null && row.formulaVersion != null) {
        formulaVersion = row.formulaVersion;
      }
    }

    const formulaVersions = new Set(
      tierEval.map((r) => r.formulaVersion).filter((v) => v != null),
    );

    return {
      tierEvalPoolSize: tierEval.length,
      distribution,
      formulaVersion: formulaVersion ?? null,
      formulaVersionCounts: Object.fromEntries(
        [...formulaVersions].map((v) => [
          String(v),
          tierEval.filter((r) => r.formulaVersion === v).length,
        ]),
      ),
    };
  },
});

export const getPipelineVersionSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rebuildJobs = await ctx.db.query("playerStatsRebuildJobs").collect();
    const latestCompleted = rebuildJobs
      .filter((j) => j.status === "completed")
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];

    return {
      pipelineVersion: latestCompleted?.pipelineVersion ?? null,
      latestCompletedRebuildJobId: latestCompleted?._id ?? null,
      latestCompletedRebuildAt: latestCompleted?.completedAt ?? null,
    };
  },
});

export const getRebuildJobStatusInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db
      .query("playerStatsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (running) {
      return {
        status: "running" as const,
        jobId: running._id,
        phase: running.phase,
        totalProcessed: running.totalProcessed,
        processedInPhase: running.processedInPhase,
        lastProgressAt: running.lastProgressAt,
        errorMessage: running.errorMessage,
      };
    }

    const allJobs = await ctx.db.query("playerStatsRebuildJobs").collect();
    const latest = allJobs.sort(
      (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
    )[0];

    if (!latest) {
      return { status: "none" as const };
    }

    return {
      status: latest.status,
      jobId: latest._id,
      phase: latest.phase,
      rebuildKind: latest.rebuildKind,
      totalProcessed: latest.totalProcessed,
      completedAt: latest.completedAt,
      errorMessage: latest.errorMessage,
    };
  },
});
