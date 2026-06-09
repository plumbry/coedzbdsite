import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import { fetchThirdPartyResultsForPlayer } from "../../helpers/playerResults";
import { isYuniteImport } from "../importSource";
import { computeInternalPlayerStats } from "./computeInternalPlayerStats";
import { syncInternalEventParticipationFromResults } from "./syncInternalEventParticipation";
import {
  STATS_DISPLAY_MIN_EVENTS,
  STATS_REEVAL_MIN_EVENTS,
} from "./thresholds";
import { FORMULA_VERSION } from "./versions";
import { getCachedImportRecord, type ImportRecordCache } from "./importRecordCache";
import {
  maybeRecalculateContributionScore,
  type ContributionScoreUpdateResult,
} from "./computeContributionScore";

export type PlayerStatsCacheFields = {
  playerId: Id<"players">;
  eventCount: number;
  totalKills: number;
  totalPlacement: number;
  averagePlacement: number;
  averageKills: number;
  averageScore: number;
  winRate: number;
  top3Rate: number;
  lastEventAt?: string;
  statsEligible: boolean;
  reevaluationEligible: boolean;
  sourceVersion: number;
  lastCalculatedAt: number;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function cacheFieldsEqual(
  a: PlayerStatsCacheFields,
  b: PlayerStatsCacheFields,
): boolean {
  return (
    a.eventCount === b.eventCount &&
    a.totalKills === b.totalKills &&
    a.totalPlacement === b.totalPlacement &&
    a.averagePlacement === b.averagePlacement &&
    a.averageKills === b.averageKills &&
    a.averageScore === b.averageScore &&
    a.winRate === b.winRate &&
    a.top3Rate === b.top3Rate &&
    a.lastEventAt === b.lastEventAt &&
    a.statsEligible === b.statsEligible &&
    a.reevaluationEligible === b.reevaluationEligible &&
    a.sourceVersion === b.sourceVersion
  );
}

export async function computePlayerStatsCacheFieldsFromResults(
  ctx: MutationCtx,
  playerId: Id<"players">,
  thirdPartyResults: Doc<"thirdPartyResults">[],
): Promise<PlayerStatsCacheFields | null> {
  const player = await ctx.db.get(playerId);
  if (!player) {
    return null;
  }

  const importCache: ImportRecordCache = new Map();
  const matchedYuniteResults = [];
  for (const result of thirdPartyResults) {
    if (!result.matched) {
      continue;
    }
    const importRecord = await getCachedImportRecord(ctx, importCache, result.importId);
    if (!importRecord || !isYuniteImport(importRecord)) {
      continue;
    }
    matchedYuniteResults.push({ result, importRecord });
  }

  if (matchedYuniteResults.length === 0) {
    return null;
  }

  const internal = await computeInternalPlayerStats(
    ctx,
    playerId,
    thirdPartyResults,
  );
  const eventCount = internal.eventsPlayed;

  let totalKills = 0;
  let totalPlacement = 0;
  let totalScore = 0;
  let lastEventAt: string | undefined;

  const bestPlacementByImport = new Map<string, number>();
  for (const { result, importRecord } of matchedYuniteResults) {
    totalKills += result.eliminations ?? 0;
    totalPlacement += result.placement;
    totalScore += result.points;

    const importKey = result.importId as string;
    const prev = bestPlacementByImport.get(importKey);
    if (prev === undefined || result.placement < prev) {
      bestPlacementByImport.set(importKey, result.placement);
    }

    const eventDate = importRecord.eventDate;
    if (eventDate && (!lastEventAt || eventDate > lastEventAt)) {
      lastEventAt = eventDate;
    }
  }

  let top3Finishes = 0;
  for (const placement of bestPlacementByImport.values()) {
    if (placement <= 3) {
      top3Finishes += 1;
    }
  }

  const rowCount = matchedYuniteResults.length;
  const averagePlacement =
    rowCount > 0 ? round1(totalPlacement / rowCount) : internal.averagePlacement;
  const averageKills =
    eventCount > 0 ? round2(totalKills / eventCount) : internal.killsPerMatch;
  const averageScore =
    rowCount > 0 ? round1(totalScore / rowCount) : 0;
  const top3Rate =
    eventCount > 0 ? round1((top3Finishes / eventCount) * 100) : 0;

  return {
    playerId,
    eventCount,
    totalKills,
    totalPlacement,
    averagePlacement,
    averageKills,
    averageScore,
    winRate: internal.winRate,
    top3Rate,
    lastEventAt,
    statsEligible: eventCount >= STATS_DISPLAY_MIN_EVENTS,
    reevaluationEligible: eventCount >= STATS_REEVAL_MIN_EVENTS,
    sourceVersion: FORMULA_VERSION,
    lastCalculatedAt: Date.now(),
  };
}

export async function computePlayerStatsCacheFields(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<PlayerStatsCacheFields | null> {
  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);
  return computePlayerStatsCacheFieldsFromResults(ctx, playerId, thirdPartyResults);
}

export type UpsertPlayerStatsCacheResult = {
  action: "inserted" | "updated" | "skipped" | "deleted" | "none";
};

export async function upsertPlayerStatsCacheFromResults(
  ctx: MutationCtx,
  playerId: Id<"players">,
  thirdPartyResults: Doc<"thirdPartyResults">[],
): Promise<UpsertPlayerStatsCacheResult> {
  const existing = await ctx.db
    .query("playerStatsCache")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();

  const next = await computePlayerStatsCacheFieldsFromResults(
    ctx,
    playerId,
    thirdPartyResults,
  );

  if (!next) {
    if (existing) {
      await ctx.db.delete(existing._id);
      return { action: "deleted" };
    }
    return { action: "none" };
  }

  if (existing && cacheFieldsEqual(existing as PlayerStatsCacheFields, next)) {
    return { action: "skipped" };
  }

  if (existing) {
    await ctx.db.patch(existing._id, next);
    return { action: "updated" };
  }

  await ctx.db.insert("playerStatsCache", next);
  return { action: "inserted" };
}

export async function upsertPlayerStatsCache(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<UpsertPlayerStatsCacheResult> {
  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);
  return upsertPlayerStatsCacheFromResults(ctx, playerId, thirdPartyResults);
}

export async function removeTierReEvaluationCacheForPlayer(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<boolean> {
  const existing = await ctx.db
    .query("tierReEvaluationCache")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();
  if (!existing) {
    return false;
  }
  await ctx.db.delete(existing._id);
  return true;
}

export type UpdatePlayerStatsOutcome = {
  statsCache: UpsertPlayerStatsCacheResult;
  tierEvalRemoved: boolean;
  tierEvalSkipped: boolean;
  contributionScore: ContributionScoreUpdateResult;
};

export type UpdateStatsForPlayerOptions = {
  matchDataChanged?: boolean;
};

/** Update denormalized player fields, stats cache, tier-eval eligibility, and TC when triggered. */
export async function updateStatsForPlayer(
  ctx: MutationCtx,
  playerId: Id<"players">,
  options?: UpdateStatsForPlayerOptions,
): Promise<UpdatePlayerStatsOutcome> {
  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);
  await syncInternalEventParticipationFromResults(ctx, playerId, thirdPartyResults);
  const statsCache = await upsertPlayerStatsCacheFromResults(
    ctx,
    playerId,
    thirdPartyResults,
  );
  const cacheRow = await ctx.db
    .query("playerStatsCache")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();

  const contributionScore = await maybeRecalculateContributionScore(
    ctx,
    playerId,
    {
      statsCacheChanged: statsCache.action !== "skipped",
      matchDataChanged: options?.matchDataChanged ?? false,
    },
    cacheRow,
  );

  if (!cacheRow?.reevaluationEligible) {
    const tierEvalRemoved = await removeTierReEvaluationCacheForPlayer(ctx, playerId);
    return {
      statsCache,
      tierEvalRemoved,
      tierEvalSkipped: true,
      contributionScore,
    };
  }

  return {
    statsCache,
    tierEvalRemoved: false,
    tierEvalSkipped: false,
    contributionScore,
  };
}

export type UpdateStatsForPlayersOptions = {
  matchDataChangedPlayerIds?: ReadonlySet<string>;
};

export async function updateStatsForPlayers(
  ctx: MutationCtx,
  playerIds: Id<"players">[],
  options?: UpdateStatsForPlayersOptions,
): Promise<{
  playersUpdated: number;
  skippedNoChange: number;
  csCalculated: number;
  csSkippedNoChange: number;
  errors: string[];
}> {
  let playersUpdated = 0;
  let skippedNoChange = 0;
  let csCalculated = 0;
  let csSkippedNoChange = 0;
  const errors: string[] = [];
  const matchDataChanged = options?.matchDataChangedPlayerIds;

  for (const playerId of playerIds) {
    try {
      const outcome = await updateStatsForPlayer(ctx, playerId, {
        matchDataChanged: matchDataChanged?.has(playerId) ?? false,
      });
      if (outcome.statsCache.action === "skipped") {
        skippedNoChange += 1;
      } else if (
        outcome.statsCache.action === "inserted" ||
        outcome.statsCache.action === "updated" ||
        outcome.statsCache.action === "deleted"
      ) {
        playersUpdated += 1;
      }
      if (outcome.contributionScore.action === "calculated") {
        csCalculated += 1;
      } else if (outcome.contributionScore.action === "skipped_no_change") {
        csSkippedNoChange += 1;
      }
    } catch (error) {
      errors.push(
        `${playerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { playersUpdated, skippedNoChange, csCalculated, csSkippedNoChange, errors };
}
