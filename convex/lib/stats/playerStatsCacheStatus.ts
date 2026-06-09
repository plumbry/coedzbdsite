import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import { FORMULA_VERSION } from "./versions";

type Ctx = QueryCtx | MutationCtx;

const RECENT_IMPORT_PROBE = 20;

export type StatsCacheStatusRecommendation =
  | "none"
  | "incremental"
  | "full_rebuild";

export type PlayerStatsCacheStatusReport = {
  rowCount: number;
  statsEligibleCount: number;
  reevaluationEligibleCount: number;
  belowDisplayThreshold: number;
  lastCalculatedAt: {
    oldest: number | null;
    newest: number | null;
  };
  importActivity: {
    newestImportAt: number | null;
    newestResultAt: number | null;
    newestImportActivityAt: number | null;
  };
  lastSuccessfulRebuildAt: number | null;
  currentSourceVersion: number;
  sourceVersionMismatch: boolean;
  estimatedAffectedPlayers: number;
  importsSinceLastRebuild: number;
  appearsStale: boolean;
  recommendation: StatsCacheStatusRecommendation;
  recommendationReason: string;
  activeRebuild: {
    jobId: Id<"playerStatsCacheRebuildJobs">;
    processedCount: number;
    totalPlayers: number;
    collectingPlayerIds: boolean;
  } | null;
  checkedAt: number;
};

function importActivityTimestamp(imp: {
  finalizedAt?: number;
  pipelineStatusUpdatedAt?: number;
  matchDataSyncedAt?: number;
  _creationTime: number;
}): number {
  return Math.max(
    imp.finalizedAt ?? 0,
    imp.pipelineStatusUpdatedAt ?? 0,
    imp.matchDataSyncedAt ?? 0,
    imp._creationTime,
  );
}

async function countIndexedBoolean(
  ctx: Ctx,
  table: "playerStatsCache",
  index: "by_stats_eligible" | "by_reevaluation_eligible",
  field: "statsEligible" | "reevaluationEligible",
  value: boolean,
): Promise<number> {
  const rows = await ctx.db
    .query(table)
    .withIndex(index, (q) => q.eq(field, value))
    .collect();
  return rows.length;
}

export async function getLastSuccessfulCacheRebuildAt(ctx: Ctx): Promise<number | null> {
  const job = await ctx.db
    .query("playerStatsCacheRebuildJobs")
    .withIndex("by_status_completed_at", (q) => q.eq("status", "completed"))
    .order("desc")
    .first();
  return job?.completedAt ?? null;
}

export async function collectAffectedPlayerIdsSince(
  ctx: Ctx,
  watermark: number,
): Promise<{ playerIds: Id<"players">[]; importJobsSince: number }> {
  const playerIdSet = new Set<string>();
  let importJobsSince = 0;

  const jobs = await ctx.db
    .query("importProcessingJobs")
    .withIndex("by_status_completed_at", (q) =>
      q.eq("status", "completed").gt("completedAt", watermark),
    )
    .collect();

  for (const job of jobs) {
    importJobsSince += 1;
    for (const playerId of job.affectedPlayerIds ?? []) {
      playerIdSet.add(playerId as string);
    }
  }

  const recentImports = await ctx.db
    .query("thirdPartyImports")
    .order("desc")
    .take(RECENT_IMPORT_PROBE);

  for (const imp of recentImports) {
    if (importActivityTimestamp(imp) <= watermark) {
      break;
    }

    const hasJob = jobs.some((job) => job.importId === imp._id);
    if (hasJob) {
      continue;
    }

    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", imp._id))
      .collect();

    for (const result of results) {
      if (result.matched && result.playerId) {
        playerIdSet.add(result.playerId as string);
      }
    }
  }

  return {
    playerIds: [...playerIdSet] as Id<"players">[],
    importJobsSince,
  };
}

export async function buildPlayerStatsCacheStatusReport(
  ctx: Ctx,
): Promise<PlayerStatsCacheStatusReport> {
  const statsEligibleCount = await countIndexedBoolean(
    ctx,
    "playerStatsCache",
    "by_stats_eligible",
    "statsEligible",
    true,
  );
  const belowDisplayThreshold = await countIndexedBoolean(
    ctx,
    "playerStatsCache",
    "by_stats_eligible",
    "statsEligible",
    false,
  );
  const reevaluationEligibleCount = await countIndexedBoolean(
    ctx,
    "playerStatsCache",
    "by_reevaluation_eligible",
    "reevaluationEligible",
    true,
  );

  const rowCount = statsEligibleCount + belowDisplayThreshold;

  const oldestCacheRow = await ctx.db
    .query("playerStatsCache")
    .withIndex("by_last_calculated")
    .order("asc")
    .first();
  const newestCacheRow = await ctx.db
    .query("playerStatsCache")
    .withIndex("by_last_calculated")
    .order("desc")
    .first();

  const newestImport = await ctx.db.query("thirdPartyImports").order("desc").first();
  const newestResult = await ctx.db.query("thirdPartyResults").order("desc").first();

  const newestImportAt = newestImport?._creationTime ?? null;
  const newestResultAt = newestResult?._creationTime ?? null;
  const newestImportActivityAt = newestImport
    ? importActivityTimestamp(newestImport)
    : null;

  const lastSuccessfulRebuildAt = await getLastSuccessfulCacheRebuildAt(ctx);

  const watermark =
    lastSuccessfulRebuildAt ??
    newestCacheRow?.lastCalculatedAt ??
    0;

  const { playerIds: estimatedAffectedPlayerIds, importJobsSince } =
    await collectAffectedPlayerIdsSince(ctx, watermark);

  const sourceVersionMismatch =
    rowCount > 0 &&
    ((oldestCacheRow?.sourceVersion ?? FORMULA_VERSION) !== FORMULA_VERSION ||
      (newestCacheRow?.sourceVersion ?? FORMULA_VERSION) !== FORMULA_VERSION);

  const cacheEmpty = rowCount === 0;
  const importActivityAfterRebuild =
    newestImportActivityAt != null && newestImportActivityAt > watermark;
  const cacheCalcBehindImports =
    newestCacheRow != null &&
    newestImportActivityAt != null &&
    newestCacheRow.lastCalculatedAt < newestImportActivityAt;

  const appearsStale =
    cacheEmpty ||
    sourceVersionMismatch ||
    estimatedAffectedPlayerIds.length > 0 ||
    importActivityAfterRebuild ||
    cacheCalcBehindImports;

  let recommendation: StatsCacheStatusRecommendation = "none";
  let recommendationReason =
    "Cache is populated and no import activity requires recalculation since the last rebuild.";

  if (cacheEmpty) {
    recommendation = "full_rebuild";
    recommendationReason =
      "playerStatsCache is empty. Run a full rebuild once to populate per-player stats.";
  } else if (sourceVersionMismatch) {
    recommendation = "full_rebuild";
    recommendationReason = `Cache sourceVersion is out of date (current formula v${FORMULA_VERSION}). Run a full rebuild after formula changes.`;
  } else if (estimatedAffectedPlayerIds.length > 0) {
    recommendation = "incremental";
    recommendationReason = `${estimatedAffectedPlayerIds.length} player(s) were affected by ${importJobsSince} import job(s) since the last successful cache rebuild.`;
  } else if (cacheCalcBehindImports) {
    recommendation = "incremental";
    recommendationReason =
      "Recent import activity is newer than the latest cache calculation. Recalculate affected players or confirm imports were processed.";
  } else if (importActivityAfterRebuild && estimatedAffectedPlayerIds.length === 0) {
    recommendation = "none";
    recommendationReason =
      "Import activity exists after the last rebuild, but no affected players were recorded. Stats may already be current.";
  }

  const activeRebuild = await ctx.db
    .query("playerStatsCacheRebuildJobs")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .first();

  return {
    rowCount,
    statsEligibleCount,
    reevaluationEligibleCount,
    belowDisplayThreshold,
    lastCalculatedAt: {
      oldest: oldestCacheRow?.lastCalculatedAt ?? null,
      newest: newestCacheRow?.lastCalculatedAt ?? null,
    },
    importActivity: {
      newestImportAt,
      newestResultAt,
      newestImportActivityAt,
    },
    lastSuccessfulRebuildAt,
    currentSourceVersion: FORMULA_VERSION,
    sourceVersionMismatch,
    estimatedAffectedPlayers: estimatedAffectedPlayerIds.length,
    importsSinceLastRebuild: importJobsSince,
    appearsStale,
    recommendation,
    recommendationReason,
    activeRebuild: activeRebuild
      ? {
          jobId: activeRebuild._id,
          processedCount: activeRebuild.processedCount,
          totalPlayers: activeRebuild.playerIds.length,
          collectingPlayerIds: activeRebuild.collectingPlayerIds ?? false,
        }
      : null,
    checkedAt: Date.now(),
  };
}
