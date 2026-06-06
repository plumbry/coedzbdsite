import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import { internal } from "./_generated/api";
import { requireAdmin } from "./auth_helpers";
import { filterVisibleMembers } from "./helpers/playerAlt";
import {
  isActivePlayerWithMatchData,
  paginateActivePlayers,
} from "./lib/stats/listEligiblePlayers";
import { computeInternalPlayerStats } from "./lib/stats/computeInternalPlayerStats";
import {
  applyDcaTcToHolistic,
  averageHolisticComponents,
  computeHolisticComponentScores,
  getPlayerDcaCpm,
  roundHolisticScore,
} from "./lib/stats/holisticScore";

const BATCH_SIZE = 1; // One player per batch — heavy per-player reads (results, imports, match stats)
const CACHE_CLEAR_BATCH = 50;
const RECENT_MEDIANS_CACHE_BATCH = 100;
const TIER_MEDIANS_PLAYER_BATCH = 4;

const VALID_TIERS = ["S", "A", "B", "C"] as const;
type ValidTier = (typeof VALID_TIERS)[number];

function emptyTierNumberArrays() {
  return { S: [] as number[], A: [] as number[], B: [] as number[], C: [] as number[] };
}

function medianFromSorted(scores: number[]): number {
  const mid = Math.floor(scores.length / 2);
  return scores.length % 2 === 0
    ? (scores[mid - 1] + scores[mid]) / 2
    : scores[mid];
}

function isEligibleForTierEvalPlayer(
  player: Doc<"players">,
  recentOnly: boolean,
): boolean {
  if (!isActivePlayerWithMatchData(player)) {
    return false;
  }

  if (!recentOnly) {
    return true;
  }

  const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - SIX_WEEKS_MS;
  const mostRecent = player.topFiveCache?.mostRecentEventTime;
  return mostRecent !== undefined && mostRecent >= cutoff;
}

function appendTierMedianScore(
  partialHolistic: Record<ValidTier, number[]>,
  partialKills: Record<ValidTier, number[]>,
  tier: ValidTier,
  holisticScore: number,
  killsPerMatch: number,
) {
  partialHolistic[tier].push(holisticScore);
  partialKills[tier].push(killsPerMatch);
}

function finalizeTierMediansFromPartials(
  partialHolistic: Record<ValidTier, number[]>,
  partialKills: Record<ValidTier, number[]>,
) {
  const tierHolisticMedians: { S?: number; A?: number; B?: number; C?: number } = {};
  const tierKillsMedians: { S?: number; A?: number; B?: number; C?: number } = {};
  const tierAverages: { S?: number; A?: number; B?: number; C?: number } = {};

  for (const tier of VALID_TIERS) {
    const tierScores = [...partialHolistic[tier]].sort((a, b) => a - b);
    const tierKills = [...partialKills[tier]].sort((a, b) => a - b);
    if (tierScores.length === 0) {
      continue;
    }

    tierHolisticMedians[tier] = medianFromSorted(tierScores);
    tierKillsMedians[tier] = medianFromSorted(tierKills);
    tierAverages[tier] =
      tierScores.reduce((sum, score) => sum + score, 0) / tierScores.length;
  }

  return { tierAverages, tierHolisticMedians, tierKillsMedians };
}

async function scorePlayerForTierMedians(
  ctx: MutationCtx,
  player: Doc<"players">,
): Promise<{ tier: ValidTier; holisticScore: number; killsPerMatch: number } | null> {
  const internal = await computeInternalPlayerStats(ctx, player._id);
  if (internal.eventsPlayed === 0) {
    return null;
  }

  const playerTier = player.tier || "Unranked";
  if (!VALID_TIERS.includes(playerTier as ValidTier)) {
    return null;
  }

  const components = computeHolisticComponentScores({
    avgPlacement: internal.averagePlacement || 50,
    winRate: internal.winRate || 0,
    killsPerMatch: internal.killsPerMatch,
    deathsPerMatch: internal.deathsPerMatch,
  });
  const baseHolistic = averageHolisticComponents(components);
  const { dca, cpm } = getPlayerDcaCpm(player);
  const holisticScore = applyDcaTcToHolistic(baseHolistic, dca, cpm);

  return {
    tier: playerTier as ValidTier,
    holisticScore,
    killsPerMatch: internal.killsPerMatch,
  };
}

async function getOrCreateMediansBuildCache(ctx: MutationCtx) {
  const existing = await ctx.db.query("tierMediansCache").first();
  if (existing) {
    return existing;
  }

  const id = await ctx.db.insert("tierMediansCache", {
    tierAverages: {},
    tierHolisticMedians: {},
    tierKillsMedians: {},
    lastUpdated: Date.now(),
    partialHolisticByTier: emptyTierNumberArrays(),
    partialKillsByTier: emptyTierNumberArrays(),
    mediansPlayersCursor: null,
    partialRecentHolisticByTier: emptyTierNumberArrays(),
    recentMediansCacheCursor: null,
  });
  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to initialize tier medians cache");
  }
  return created;
}

function finalizeRecentMediansFromPartials(
  partialRecent: Record<ValidTier, number[]>,
) {
  const recentMedians: { S?: number; A?: number; B?: number; C?: number } = {};
  for (const tier of VALID_TIERS) {
    const scores = [...partialRecent[tier]].sort((a, b) => a - b);
    if (scores.length === 0) {
      continue;
    }
    recentMedians[tier] = medianFromSorted(scores);
  }
  return recentMedians;
}

async function appendRecentHolisticPartial(
  ctx: MutationCtx,
  tier: ValidTier,
  recentHolisticScore: number,
) {
  const cache = await getOrCreateMediansBuildCache(ctx);
  const partialRecent = {
    ...emptyTierNumberArrays(),
    ...(cache.partialRecentHolisticByTier ?? {}),
  };
  partialRecent[tier].push(recentHolisticScore);
  await ctx.db.patch(cache._id, {
    partialRecentHolisticByTier: partialRecent,
    lastUpdated: Date.now(),
  });
}

// Helper function to convert tier letter to numeric value
const tierToNumeric = (tier: string | undefined): number => {
  if (!tier) return 0;
  const mapping: Record<string, number> = { "S": 4, "A": 3, "B": 2, "C": 1 };
  return mapping[tier] || 0;
};

// Helper function to convert numeric value back to tier detail string
const numericToTier = (value: number): string => {
  if (value === 0) return "Unranked";
  
  // S Tier: 3.5 - 4.0
  if (value >= 3.5) {
    const rangeSize = 0.5;
    const position = value - 3.5;
    if (position < rangeSize / 3) return "Low S";
    if (position < (rangeSize * 2) / 3) return "Mid S";
    return "High S";
  }
  
  // A Tier: 2.5 - 3.5
  if (value >= 2.5) {
    const rangeSize = 1.0;
    const position = value - 2.5;
    if (position < rangeSize / 3) return "Low A";
    if (position < (rangeSize * 2) / 3) return "Mid A";
    return "High A";
  }
  
  // B Tier: 1.5 - 2.5
  if (value >= 1.5) {
    const rangeSize = 1.0;
    const position = value - 1.5;
    if (position < rangeSize / 3) return "Low B";
    if (position < (rangeSize * 2) / 3) return "Mid B";
    return "High B";
  }
  
  // C Tier: 0 - 1.5
  if (value >= 1.0) return "High C";
  if (value >= 0.5) return "Mid C";
  return "Low C";
};

// Step 1: Calculate and cache tier medians (legacy single-shot — prefer batched step in rebuild).
export const calculateTierMedians = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; tiersCalculated: number; totalPlayers: number }> => {
    await resetTierMediansBuildHandler(ctx);
    let isDone = false;
    let totalPlayers = 0;
    while (!isDone) {
      const step = await calculateTierMediansStepHandler(ctx);
      isDone = step.isDone;
      totalPlayers = step.totalPlayersScored;
    }

    const mediansCache = await ctx.db.query("tierMediansCache").first();
    return {
      success: true,
      tiersCalculated: mediansCache
        ? Object.keys(mediansCache.tierHolisticMedians).length
        : 0,
      totalPlayers,
    };
  },
});

async function resetTierMediansBuildHandler(ctx: MutationCtx): Promise<{ ok: true }> {
  const oldMedians = await ctx.db.query("tierMediansCache").collect();
  for (const oldMedian of oldMedians) {
    await ctx.db.delete(oldMedian._id);
  }

  await ctx.db.insert("tierMediansCache", {
    tierAverages: {},
    tierHolisticMedians: {},
    tierKillsMedians: {},
    lastUpdated: Date.now(),
    partialHolisticByTier: emptyTierNumberArrays(),
    partialKillsByTier: emptyTierNumberArrays(),
    mediansPlayersCursor: null,
    partialRecentHolisticByTier: emptyTierNumberArrays(),
    recentMediansCacheCursor: null,
  });

  return { ok: true };
}

export const resetTierMediansBuild = internalMutation({
  args: {},
  handler: resetTierMediansBuildHandler,
});

async function calculateTierMediansStepHandler(
  ctx: MutationCtx,
): Promise<{ isDone: boolean; processed: number; totalPlayersScored: number }> {
  const cache = await getOrCreateMediansBuildCache(ctx);
  const partialHolistic = {
    ...emptyTierNumberArrays(),
    ...(cache.partialHolisticByTier ?? {}),
  };
  const partialKills = {
    ...emptyTierNumberArrays(),
    ...(cache.partialKillsByTier ?? {}),
  };

  let cursor = cache.mediansPlayersCursor ?? null;
  let processed = 0;
  let playersTableDone = false;

  while (processed < TIER_MEDIANS_PLAYER_BATCH) {
    const page = await paginateActivePlayers(ctx, cursor, 20);

    for (const player of page.page) {
      if (!isActivePlayerWithMatchData(player)) {
        continue;
      }

      const scored = await scorePlayerForTierMedians(ctx, player);
      if (!scored) {
        continue;
      }

      appendTierMedianScore(
        partialHolistic,
        partialKills,
        scored.tier,
        scored.holisticScore,
        scored.killsPerMatch,
      );
      processed += 1;
      if (processed >= TIER_MEDIANS_PLAYER_BATCH) {
        break;
      }
    }

    if (page.isDone) {
      playersTableDone = true;
      cursor = null;
      break;
    }

    cursor = page.continueCursor;
    if (processed >= TIER_MEDIANS_PLAYER_BATCH) {
      break;
    }
  }

  const totalPlayersScored = VALID_TIERS.reduce(
    (sum, tier) => sum + partialHolistic[tier].length,
    0,
  );

  if (playersTableDone) {
    const finalized = finalizeTierMediansFromPartials(partialHolistic, partialKills);
    await ctx.db.patch(cache._id, {
      tierAverages: finalized.tierAverages,
      tierHolisticMedians: finalized.tierHolisticMedians,
      tierKillsMedians: finalized.tierKillsMedians,
      lastUpdated: Date.now(),
      partialHolisticByTier: undefined,
      partialKillsByTier: undefined,
      mediansPlayersCursor: undefined,
    });
    return { isDone: true, processed, totalPlayersScored };
  }

  await ctx.db.patch(cache._id, {
    partialHolisticByTier: partialHolistic,
    partialKillsByTier: partialKills,
    mediansPlayersCursor: cursor,
    lastUpdated: Date.now(),
  });

  return { isDone: false, processed, totalPlayersScored };
}

export const calculateTierMediansStep = internalMutation({
  args: {},
  handler: calculateTierMediansStepHandler,
});

// Step 2a: Clear existing cache in batched pages (safe for large caches).
export const clearCache = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    let deleted = 0;
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const step = await clearCacheBatchHandler(ctx, cursor);
      deleted += step.deleted;
      isDone = step.isDone;
      cursor = step.continueCursor;
    }
    return { deleted };
  },
});

async function clearCacheBatchHandler(
  ctx: MutationCtx,
  cursor: string | null,
): Promise<{ deleted: number; continueCursor: string | null; isDone: boolean }> {
  const page = await ctx.db.query("tierReEvaluationCache").paginate({
    numItems: CACHE_CLEAR_BATCH,
    cursor,
  });

  for (const cache of page.page) {
    await ctx.db.delete(cache._id);
  }

  return {
    deleted: page.page.length,
    continueCursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
  };
}

export const clearCacheBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => clearCacheBatchHandler(ctx, args.cursor),
});

/** Reset partial recent-median build state before a tier-eval player scan. */
export const resetRecentMediansBuild = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cache = await ctx.db.query("tierMediansCache").first();
    if (!cache) {
      return { ok: true };
    }
    await ctx.db.patch(cache._id, {
      partialRecentHolisticByTier: emptyTierNumberArrays(),
      recentMediansCacheCursor: null,
      recentTierHolisticMedians: undefined,
      lastUpdated: Date.now(),
    });
    return { ok: true };
  },
});

// Step 2b: Initialize batch rebuild (no longer clears cache — done separately)
export const initializeBatchRebuild = internalMutation({
  args: {
    recentOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    totalPlayers: number;
    batchCount: number;
    playerIds: Id<"players">[];
  }> => {
    // Calculate tier medians (separate from clearing)
    await ctx.runMutation(internal.tierReEvaluationBatched.calculateTierMedians, {});

    // Active members with match data only.
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    let eligiblePlayers = filterVisibleMembers(
      activePlayers.filter((p) => p.hasMatchData === true),
    );

    // Filter to only players active in the last 6 weeks if recentOnly is enabled
    if (args.recentOnly) {
      const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - SIX_WEEKS_MS;
      eligiblePlayers = eligiblePlayers.filter((p) => {
        const mostRecent = p.topFiveCache?.mostRecentEventTime;
        return mostRecent !== undefined && mostRecent >= cutoff;
      });
    }

    const totalPlayers = eligiblePlayers.length;
    const batchCount = Math.ceil(totalPlayers / BATCH_SIZE);
    const playerIds = eligiblePlayers.map((p) => p._id);

    return { totalPlayers, batchCount, playerIds };
  },
});

// Step 3: Process a single batch
async function lookupPlayerByEpicUsername(ctx: MutationCtx, epicUsername: string) {
  return await ctx.db
    .query("players")
    .withIndex("by_epic_username", (q) => q.eq("epicUsername", epicUsername))
    .first();
}

export const processBatch = internalMutation({
  args: {
    batchNumber: v.number(),
    recentOnly: v.optional(v.boolean()),
    playerIds: v.optional(v.array(v.id("players"))),
  },
  handler: async (ctx, args): Promise<{ processed: number; playersInBatch: string[] }> => {
    // Get cached tier medians
    const mediansCache = await ctx.db.query("tierMediansCache").first();
    if (!mediansCache) {
      throw new Error("Tier medians not calculated. Please restart the batch rebuild process.");
    }

    const { tierAverages, tierHolisticMedians, tierKillsMedians } = mediansCache;

    let batchPlayers: Doc<"players">[] = [];

    if (args.playerIds && args.playerIds.length > 0) {
      for (const playerId of args.playerIds) {
        const player = await ctx.db.get(playerId);
        if (player) {
          batchPlayers.push(player);
        }
      }
    } else {
      // Legacy path when playerIds were not stored on the rebuild job
      const activePlayers = await ctx.db
        .query("players")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
      let eligiblePlayers = filterVisibleMembers(
        activePlayers.filter((p) => p.hasMatchData === true),
      );

      if (args.recentOnly) {
        const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - SIX_WEEKS_MS;
        eligiblePlayers = eligiblePlayers.filter((p) => {
          const mostRecent = p.topFiveCache?.mostRecentEventTime;
          return mostRecent !== undefined && mostRecent >= cutoff;
        });
      }

      const startIdx = args.batchNumber * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, eligiblePlayers.length);
      batchPlayers = eligiblePlayers.slice(startIdx, endIdx);
    }

    const now = Date.now();
    const processedNames: string[] = [];

    // Process each player — delete existing entry first to prevent duplicates
    for (const player of batchPlayers) {
      // Always remove any existing cache entry for this player (idempotent)
      const existingEntry = await ctx.db
        .query("tierReEvaluationCache")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .first();
      if (existingEntry) {
        await ctx.db.delete(existingEntry._id);
      }

      const internal = await computeInternalPlayerStats(ctx, player._id);
      if (internal.eventsPlayed === 0) continue;

      const playerTier = player.tier || "Unranked";
      if (!["S", "A", "B", "C"].includes(playerTier)) {
        continue;
      }

      const totalEvents = internal.eventsPlayed;
      const avgPlacement = internal.averagePlacement || 50;
      const winRate = internal.winRate || 0;
      const killsPerMatch = internal.killsPerMatch;
      const deathsPerMatch =
        internal.deathsPerMatch > 0 ? internal.deathsPerMatch : undefined;

      const components = computeHolisticComponentScores({
        avgPlacement,
        winRate,
        killsPerMatch,
        deathsPerMatch,
      });
      const placementScore = components.placementScore;
      const winRateScore = components.winRateScore;
      const killsScore = components.killsScore;
      const deathsScore = components.deathsScore;
      const rawHolisticScore = roundHolisticScore(
        averageHolisticComponents(components),
      );
      const { dca, cpm } = getPlayerDcaCpm(player);
      const holisticScore = roundHolisticScore(
        applyDcaTcToHolistic(rawHolisticScore, dca, cpm),
      );

      // Calculate tier comparisons (playerTier is guaranteed to be S, A, B, or C at this point)
      const tierOrder = ["S", "A", "B", "C"];
      const tierIndex = tierOrder.indexOf(playerTier);

      const tierAbove = tierIndex > 0 ? tierOrder[tierIndex - 1] : undefined;
      const tierBelow = tierIndex < tierOrder.length - 1 ? tierOrder[tierIndex + 1] : undefined;

      const tierAboveHolistic = tierAbove ? (tierHolisticMedians as Record<string, number>)[tierAbove] : undefined;
      const tierBelowHolistic = tierBelow ? (tierHolisticMedians as Record<string, number>)[tierBelow] : undefined;
      const sameTierHolistic = (tierHolisticMedians as Record<string, number>)[playerTier] || undefined;

      const holisticVsSameTier = sameTierHolistic !== undefined ? holisticScore - sameTierHolistic : undefined;
      const promotionDiff = tierAboveHolistic !== undefined ? holisticScore - tierAboveHolistic : undefined;
      const demotionDiff = tierBelowHolistic !== undefined ? holisticScore - tierBelowHolistic : undefined;

      // Evaluation status
      let evaluationStatus: "Strong Promotion Outlier" | "Eligible for Promotion Evaluation" | "Stable" | "Eligible for Demotion Evaluation" | "Strong Demotion Outlier" | "Insufficient Data";

      if (totalEvents < 8) {
        evaluationStatus = "Insufficient Data";
      } else if (promotionDiff !== undefined && promotionDiff > 5) {
        evaluationStatus = "Strong Promotion Outlier";
      } else if (promotionDiff !== undefined && promotionDiff > 0) {
        evaluationStatus = "Eligible for Promotion Evaluation";
      } else if (demotionDiff !== undefined && demotionDiff < -5) {
        evaluationStatus = "Strong Demotion Outlier";
      } else if (demotionDiff !== undefined && demotionDiff < 0) {
        evaluationStatus = "Eligible for Demotion Evaluation";
      } else {
        evaluationStatus = "Stable";
      }

      const tierKillsMedian = (tierKillsMedians as Record<string, number>)[playerTier] || undefined;
      const killsVsTierDiff = tierKillsMedian !== undefined ? killsPerMatch - tierKillsMedian : undefined;

      // Get top 5 cache data from player
      const topFiveCache = player.topFiveCache;
      const recentTop5Count = topFiveCache?.recentTop5Count ?? 0;
      const recentTop4Count = topFiveCache?.recentTop4Count ?? 0;
      const recentTop3Count = topFiveCache?.recentTop3Count ?? 0;
      const recentTop5WithTeammate = topFiveCache?.recentTop5WithTeammate ?? 0;
      const consistentTeammateName = topFiveCache?.consistentTeammateName;

      // Get all player results for teammate tier calculation and last event date
      const allPlayerResults = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      // Calculate average teammate tier from all results
      const teammateTiers: number[] = [];
      const uniqueTeammates = new Set<string>();

      for (const result of allPlayerResults) {
        if (!result.teamMembers || result.teamMembers.length === 0) continue;
        
        for (const teammateEpic of result.teamMembers) {
          if (teammateEpic === player.epicUsername) continue;
          if (uniqueTeammates.has(teammateEpic)) continue;
          
          uniqueTeammates.add(teammateEpic);
          const teammate = await lookupPlayerByEpicUsername(ctx, teammateEpic);
          if (teammate?.tier) {
            teammateTiers.push(tierToNumeric(teammate.tier));
          }
        }
      }

      const avgTeammateTierNumeric = teammateTiers.length > 0
        ? teammateTiers.reduce((sum, t) => sum + t, 0) / teammateTiers.length
        : undefined;
      
      // Get the tier detail string if we have a value
      const avgTeammateTierDetail = avgTeammateTierNumeric !== undefined 
        ? numericToTier(avgTeammateTierNumeric) 
        : undefined;

      // Get last event date from most recent result
      let lastEventDate: string | undefined = undefined;
      // Build a map of importId -> eventDate for all results
      // Use the linked event's startDate (from the events table), NOT the import's eventDate
      const importDateMap = new Map<string, string>();
      
      for (const result of allPlayerResults) {
        const importData = await ctx.db.get(result.importId);
        if (!importData) continue;
        
        // Prefer the linked event's startDate over the import's eventDate
        let dateStr: string | undefined;
        if (importData.eventId) {
          const event = await ctx.db.get(importData.eventId);
          if (event?.startDate) {
            dateStr = event.startDate;
          }
        }
        // Fallback to import eventDate only if no linked event
        if (!dateStr && importData.eventDate) {
          dateStr = importData.eventDate;
        }
        if (dateStr) {
          importDateMap.set(result.importId as string, dateStr);
        }
      }
      
      // Find last event date from the map
      let latestTimestamp = 0;
      for (const [, dateStr] of importDateMap) {
        const ts = new Date(dateStr).getTime();
        if (ts > latestTimestamp) {
          latestTimestamp = ts;
          lastEventDate = dateStr;
        }
      }

      // Calculate recent 6-week holistic score
      const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
      const recentCutoff = now - SIX_WEEKS_MS;
      
      // Filter results to last 6 weeks
      const recentImportIds = new Set<string>();
      const recentResults = allPlayerResults.filter((r) => {
        const eventDate = importDateMap.get(r.importId as string);
        if (!eventDate) return false;
        const ts = new Date(eventDate).getTime();
        if (ts >= recentCutoff) {
          recentImportIds.add(r.importId as string);
          return true;
        }
        return false;
      });
      
      let recentHolisticScore: number | undefined;
      let recentRawHolisticScore: number | undefined;
      let recentKillsPerMatch: number | undefined;
      let recentDeathsPerMatch: number | undefined;
      let recentAvgPlacement: number | undefined;
      let recentWinRate: number | undefined;
      let recentTotalEvents: number | undefined;
      let recentPlacementScore: number | undefined;
      let recentWinRateScore: number | undefined;
      let recentKillsScore: number | undefined;
      let recentDeathsScore: number | undefined;
      
      if (recentResults.length > 0) {
        recentTotalEvents = recentResults.length;
        
        // Compute recent placement and win rate from thirdPartyResults
        const recentPlacements = recentResults.map((r) => r.placement);
        recentAvgPlacement = recentPlacements.reduce((sum, p) => sum + p, 0) / recentPlacements.length;
        const recentWins = recentPlacements.filter((p) => p === 1).length;
        recentWinRate = (recentWins / recentPlacements.length) * 100;
        
        // Get match-level stats for recent imports to compute kills/deaths per match
        const allMatchStats = await ctx.db
          .query("matchPlayerStats")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .collect();
        
        const recentMatchStats = allMatchStats.filter((m) =>
          recentImportIds.has(m.importId as string)
        );
        
        if (recentMatchStats.length > 0) {
          const totalKills = recentMatchStats.reduce((sum, m) => sum + m.eliminations, 0);
          const totalDeaths = recentMatchStats.reduce((sum, m) => sum + m.deaths, 0);
          recentKillsPerMatch = totalKills / recentMatchStats.length;
          recentDeathsPerMatch = totalDeaths / recentMatchStats.length;
        } else {
          // Fallback: use eliminations from thirdPartyResults if no match-level data
          const recentElims = recentResults.map((r) => r.eliminations || 0);
          recentKillsPerMatch = recentElims.reduce((sum, e) => sum + e, 0) / recentElims.length;
        }
        
        // Compute recent component scores (same formula as all-time)
        recentPlacementScore = Math.max(0, Math.min(100, (50 - recentAvgPlacement) * 2));
        recentWinRateScore = Math.min(100, recentWinRate * 7.5);
        recentKillsScore = Math.min(100, ((recentKillsPerMatch ?? 0) / 5) * 100);
        recentDeathsScore = recentDeathsPerMatch !== undefined
          ? Math.max(0, Math.min(100, (3 - recentDeathsPerMatch) * 33.33))
          : undefined;
        
        const recentScores = [recentPlacementScore, recentWinRateScore, recentKillsScore, recentDeathsScore].filter(
          (s): s is number => s !== undefined
        );
        if (recentScores.length > 0) {
          const recentBase = recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length;
          recentRawHolisticScore = roundHolisticScore(recentBase);
          recentHolisticScore = roundHolisticScore(
            applyDcaTcToHolistic(recentBase, dca, cpm),
          );
        }
      }

      // Recent-vs-tier diffs use population recent medians; filled in during finalize.
      const recentHolisticVsSameTier = undefined;
      const recentPromotionDiff = undefined;
      const recentDemotionDiff = undefined;

      if (
        recentHolisticScore != null &&
        VALID_TIERS.includes(playerTier as ValidTier)
      ) {
        await appendRecentHolisticPartial(
          ctx,
          playerTier as ValidTier,
          recentHolisticScore,
        );
      }

      // Store in cache
      await ctx.db.insert("tierReEvaluationCache", {
        playerId: player._id,
        playerName: player.name || player.discordUsername,
        discordUsername: player.discordUsername,
        discordUserId: player.discordUserId || "",
        tier: playerTier,
        totalEvents,
        killsPerMatch,
        deathsPerMatch,
        tierKillsMedian,
        killsVsTierDiff,
        holisticScore,
        avgPlacement,
        winRate,
        placementScore,
        winRateScore,
        killsScore,
        deathsScore,
        rawAvgPlacement: avgPlacement,
        adjustedAvgPlacement: avgPlacement,
        rawPlacementScore: placementScore,
        rawHolisticScore,
        avgTeammateTier: avgTeammateTierNumeric,
        tierGapAdjustment: undefined,
        tierAbove,
        tierAboveAvg: tierAbove ? (tierAverages as Record<string, number>)[tierAbove] : undefined,
        tierAboveHolistic,
        tierBelow,
        tierBelowAvg: tierBelow ? (tierAverages as Record<string, number>)[tierBelow] : undefined,
        tierBelowHolistic,
        sameTierAvg: (tierAverages as Record<string, number>)[playerTier],
        sameTierHolistic,
        sameTierDiff: undefined,
        holisticVsSameTier,
        promotionDiff,
        demotionDiff,
        recentTop5Count,
        recentTop4Count,
        recentTop3Count,
        recentTop5WithTeammate,
        consistentTeammateName,
        lastEventDate,
        evaluationStatus,
        recentHolisticScore,
        recentRawHolisticScore,
        recentKillsPerMatch,
        recentDeathsPerMatch,
        recentAvgPlacement,
        recentWinRate,
        recentTotalEvents,
        recentPlacementScore,
        recentWinRateScore,
        recentKillsScore,
        recentDeathsScore,
        recentHolisticVsSameTier,
        recentPromotionDiff,
        recentDemotionDiff,
        lastUpdated: now,
      });

      processedNames.push(player.name || player.discordUsername);
    }

    return {
      processed: processedNames.length,
      playersInBatch: processedNames,
    };
  },
});

/** Process at most one eligible player per call to avoid mutation timeouts. */
export const processOneTierEvalPlayerStep = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    pageIndex: v.number(),
    recentOnly: v.boolean(),
  },
  handler: async (ctx, args): Promise<{
    isDone: boolean;
    continueCursor: string | null;
    nextPageIndex: number;
    processed: number;
  }> => {
    const mediansCache = await ctx.db.query("tierMediansCache").first();
    if (!mediansCache) {
      throw new Error("Tier medians not calculated. Run the medians step first.");
    }

    const page = await paginateActivePlayers(ctx, args.cursor, 20);

    for (let i = args.pageIndex; i < page.page.length; i++) {
      const player = page.page[i];
      if (!isEligibleForTierEvalPlayer(player, args.recentOnly)) {
        continue;
      }

      await ctx.runMutation(internal.tierReEvaluationBatched.processBatch, {
        batchNumber: 0,
        recentOnly: args.recentOnly,
        playerIds: [player._id],
      });

      const nextPageIndex = i + 1;
      if (nextPageIndex >= page.page.length) {
        if (page.isDone) {
          return {
            isDone: true,
            continueCursor: null,
            nextPageIndex: 0,
            processed: 1,
          };
        }
        return {
          isDone: false,
          continueCursor: page.continueCursor,
          nextPageIndex: 0,
          processed: 1,
        };
      }

      return {
        isDone: false,
        continueCursor: args.cursor,
        nextPageIndex,
        processed: 1,
      };
    }

    if (page.isDone) {
      return {
        isDone: true,
        continueCursor: null,
        nextPageIndex: 0,
        processed: 0,
      };
    }

    return {
      isDone: false,
      continueCursor: page.continueCursor,
      nextPageIndex: 0,
      processed: 0,
    };
  },
});

/** @deprecated Prefer processOneTierEvalPlayerStep (one player per scheduler step). */
export const processTierEvalPlayersStep = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    recentOnly: v.boolean(),
  },
  handler: async (ctx, args): Promise<{
    isDone: boolean;
    continueCursor: string | null;
    processed: number;
  }> => {
    const mediansCache = await ctx.db.query("tierMediansCache").first();
    if (!mediansCache) {
      throw new Error("Tier medians not calculated. Run the medians step first.");
    }

    const page = await paginateActivePlayers(ctx, args.cursor, 20);

    let processed = 0;
    for (const player of page.page) {
      if (!isEligibleForTierEvalPlayer(player, args.recentOnly)) {
        continue;
      }

      await ctx.runMutation(internal.tierReEvaluationBatched.processBatch, {
        batchNumber: 0,
        recentOnly: args.recentOnly,
        playerIds: [player._id],
      });
      processed += 1;
    }

    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      processed,
    };
  },
});

/** Finalize recent tier medians from partials accumulated during player processing. */
export const finalizeRecentTierMediansFromBuild = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ recentMedians: { S?: number; A?: number; B?: number; C?: number } }> => {
    const cache = await getOrCreateMediansBuildCache(ctx);
    const partialRecent = {
      ...emptyTierNumberArrays(),
      ...(cache.partialRecentHolisticByTier ?? {}),
    };
    const recentMedians = finalizeRecentMediansFromPartials(partialRecent);

    await ctx.db.patch(cache._id, {
      recentTierHolisticMedians: recentMedians,
      partialRecentHolisticByTier: undefined,
      recentMediansCacheCursor: undefined,
      lastUpdated: Date.now(),
    });

    return { recentMedians };
  },
});

// Step 4a: Compute 6-week tier medians from cached recentHolisticScore values.
export const computeRecentTierMedians = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ recentMedians: { S?: number; A?: number; B?: number; C?: number } }> => {
    let cursor: string | null = null;
    let isDone = false;
    let recentMedians: { S?: number; A?: number; B?: number; C?: number } = {};

    while (!isDone) {
      const step = await computeRecentTierMediansStepHandler(ctx, cursor);
      isDone = step.isDone;
      cursor = step.continueCursor;
      if (step.recentMedians) {
        recentMedians = step.recentMedians;
      }
    }

    return { recentMedians };
  },
});

async function computeRecentTierMediansStepHandler(
  ctx: MutationCtx,
  cursor: string | null,
): Promise<{
  isDone: boolean;
  continueCursor: string | null;
  recentMedians?: { S?: number; A?: number; B?: number; C?: number };
}> {
  const cache = await getOrCreateMediansBuildCache(ctx);
  const partialRecent = {
    ...emptyTierNumberArrays(),
    ...(cache.partialRecentHolisticByTier ?? {}),
  };

  const page = await ctx.db.query("tierReEvaluationCache").paginate({
    numItems: RECENT_MEDIANS_CACHE_BATCH,
    cursor,
  });

  for (const entry of page.page) {
    if (
      entry.recentHolisticScore != null &&
      VALID_TIERS.includes(entry.tier as ValidTier)
    ) {
      partialRecent[entry.tier as ValidTier].push(entry.recentHolisticScore);
    }
  }

  if (!page.isDone) {
    await ctx.db.patch(cache._id, {
      partialRecentHolisticByTier: partialRecent,
      recentMediansCacheCursor: page.continueCursor,
      lastUpdated: Date.now(),
    });
    return {
      isDone: false,
      continueCursor: page.continueCursor,
    };
  }

  const recentMedians = finalizeRecentMediansFromPartials(partialRecent);
  await ctx.db.patch(cache._id, {
    recentTierHolisticMedians: recentMedians,
    partialRecentHolisticByTier: undefined,
    recentMediansCacheCursor: undefined,
    lastUpdated: Date.now(),
  });

  return {
    isDone: true,
    continueCursor: null,
    recentMedians,
  };
}

export const computeRecentTierMediansStep = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => computeRecentTierMediansStepHandler(ctx, args.cursor),
});

// Step 4b: Finalize recent (6-week) comparisons after all batches complete.
// Computes 6-week tier medians from cached recentHolisticScore values,
// then updates each cache entry's recent diff fields against those medians.
export const finalizeRecentComparisons = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ updated: number; recentMedians: Record<string, number | undefined> }> => {
    const { recentMedians } = await ctx.runMutation(
      internal.tierReEvaluationBatched.computeRecentTierMedians,
      {},
    );

    const allCache = await ctx.db.query("tierReEvaluationCache").collect();
    const tierOrder = ["S", "A", "B", "C"];
    let updated = 0;

    for (const entry of allCache) {
      if (entry.recentHolisticScore == null) continue;

      const tierIdx = tierOrder.indexOf(entry.tier);
      if (tierIdx === -1) continue;

      const sameTierRecent = (recentMedians as Record<string, number | undefined>)[entry.tier];
      const tierAbove = tierIdx > 0 ? tierOrder[tierIdx - 1] : undefined;
      const tierBelow = tierIdx < tierOrder.length - 1 ? tierOrder[tierIdx + 1] : undefined;
      const aboveRecent = tierAbove ? (recentMedians as Record<string, number | undefined>)[tierAbove] : undefined;
      const belowRecent = tierBelow ? (recentMedians as Record<string, number | undefined>)[tierBelow] : undefined;

      const recentHolisticVsSameTier = sameTierRecent != null
        ? entry.recentHolisticScore - sameTierRecent : undefined;
      const recentPromotionDiff = aboveRecent != null
        ? entry.recentHolisticScore - aboveRecent : undefined;
      const recentDemotionDiff = belowRecent != null
        ? entry.recentHolisticScore - belowRecent : undefined;

      await ctx.db.patch(entry._id, {
        recentHolisticVsSameTier,
        recentPromotionDiff,
        recentDemotionDiff,
      });
      updated++;
    }

    return { updated, recentMedians };
  },
});

export const getBatchProgress = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const cache = await ctx.db.query("tierReEvaluationCache").collect();
    return { cacheCount: cache.length };
  },
});
