import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import { api } from "./_generated/api";
import { filterVisibleMembers } from "./helpers/playerAlt";
import { computeInternalPlayerStats } from "./lib/stats/computeInternalPlayerStats";
import {
  applyDcaTcToHolistic,
  averageHolisticComponents,
  computeHolisticComponentScores,
  getPlayerDcaCpm,
  roundHolisticScore,
} from "./lib/stats/holisticScore";

const BATCH_SIZE = 10; // Process 10 players per batch

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

// Step 1: Calculate and cache tier medians
export const calculateTierMedians = mutation({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; tiersCalculated: number; totalPlayers: number }> => {
    // Clear old medians
    const oldMedians = await ctx.db.query("tierMediansCache").collect();
    for (const oldMedian of oldMedians) {
      await ctx.db.delete(oldMedian._id);
    }

    // Get only active players with match data (exclude former/archived)
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();

    // Combine and deduplicate
    const playerMap = new Map<string, typeof activePlayers[0]>();
    for (const p of [...activePlayers, ...acceptedMembers]) {
      playerMap.set(p._id, p);
    }
    const playersWithMatchData = filterVisibleMembers(
      Array.from(playerMap.values()).filter(
        (p) => p.hasMatchData === true && p.status !== "archived",
      ),
    );

    // Calculate holistic scores for all players using CACHED data only
    // (no per-player matchPlayerStats queries — uses contributionScore.profileKillsPerMatch)
    const playerScores: Array<{ tier: string; holisticScore: number; killsPerMatch: number }> = [];

    for (const player of playersWithMatchData) {
      const internal = await computeInternalPlayerStats(ctx, player._id);
      if (internal.eventsPlayed === 0) continue;

      const playerTier = player.tier || "Unranked";
      if (!["S", "A", "B", "C"].includes(playerTier)) {
        continue;
      }

      const avgPlacement = internal.averagePlacement || 50;
      const winRate = internal.winRate || 0;
      const killsPerMatch = internal.killsPerMatch;
      const deathsPerMatch = internal.deathsPerMatch;

      const components = computeHolisticComponentScores({
        avgPlacement,
        winRate,
        killsPerMatch,
        deathsPerMatch,
      });
      const baseHolistic = averageHolisticComponents(components);
      const { dca, cpm } = getPlayerDcaCpm(player);
      const holisticScore = applyDcaTcToHolistic(baseHolistic, dca, cpm);

      playerScores.push({
        tier: playerTier,
        holisticScore,
        killsPerMatch,
      });
    }

    // Calculate tier medians (only for valid tiers: S, A, B, C)
    const tierAverages: { S?: number; A?: number; B?: number; C?: number } = {};
    const tierHolisticMedians: { S?: number; A?: number; B?: number; C?: number } = {};
    const tierKillsMedians: { S?: number; A?: number; B?: number; C?: number } = {};

    // Only process S, A, B, C tiers (filter out Unranked, ironman, or any other tier values)
    for (const tier of ["S", "A", "B", "C"] as const) {
      const tierPlayers = playerScores.filter((p) => p.tier === tier);
      if (tierPlayers.length === 0) continue;

      const tierScores = tierPlayers.map((p) => p.holisticScore).sort((a, b) => a - b);
      const tierKills = tierPlayers.map((p) => p.killsPerMatch).sort((a, b) => a - b);

      const medianIndex = Math.floor(tierScores.length / 2);
      tierHolisticMedians[tier] = tierScores.length % 2 === 0
        ? (tierScores[medianIndex - 1] + tierScores[medianIndex]) / 2
        : tierScores[medianIndex];

      tierKillsMedians[tier] = tierKills.length % 2 === 0
        ? (tierKills[medianIndex - 1] + tierKills[medianIndex]) / 2
        : tierKills[medianIndex];

      tierAverages[tier] = tierScores.reduce((sum, s) => sum + s, 0) / tierScores.length;
    }

    // Store medians
    await ctx.db.insert("tierMediansCache", {
      tierAverages,
      tierHolisticMedians,
      tierKillsMedians,
      lastUpdated: Date.now(),
    });

    return { 
      success: true, 
      tiersCalculated: Object.keys(tierHolisticMedians).length,
      totalPlayers: playerScores.length,
    };
  },
});

// Step 2a: Clear existing cache in a lightweight transaction
export const clearCache = mutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    const existingCache = await ctx.db.query("tierReEvaluationCache").collect();
    for (const cache of existingCache) {
      await ctx.db.delete(cache._id);
    }
    return { deleted: existingCache.length };
  },
});

// Step 2b: Initialize batch rebuild (no longer clears cache — done separately)
export const initializeBatchRebuild = mutation({
  args: {
    recentOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ totalPlayers: number; batchCount: number }> => {
    // Calculate tier medians (separate from clearing)
    await ctx.runMutation(api.tierReEvaluationBatched.calculateTierMedians, {});

    // Get only active players using existing indexes (exclude former/archived)
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();

    // Combine and deduplicate
    const playerMap = new Map<string, typeof activePlayers[0]>();
    for (const p of [...activePlayers, ...acceptedMembers]) {
      playerMap.set(p._id, p);
    }
    let eligiblePlayers = filterVisibleMembers(
      Array.from(playerMap.values()).filter(
        (p) => p.hasMatchData === true && p.status !== "archived",
      ),
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

    return { totalPlayers, batchCount };
  },
});

// Step 3: Process a single batch
export const processBatch = mutation({
  args: {
    batchNumber: v.number(),
    recentOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ processed: number; playersInBatch: string[] }> => {
    // Get cached tier medians
    const mediansCache = await ctx.db.query("tierMediansCache").first();
    if (!mediansCache) {
      throw new Error("Tier medians not calculated. Please restart the batch rebuild process.");
    }

    const { tierAverages, tierHolisticMedians, tierKillsMedians } = mediansCache;

    // Get only active eligible players using existing indexes (exclude former/archived)
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();

    // Combine and deduplicate
    const playerMap = new Map<string, typeof activePlayers[0]>();
    for (const p of [...activePlayers, ...acceptedMembers]) {
      playerMap.set(p._id, p);
    }
    let eligiblePlayers = filterVisibleMembers(
      Array.from(playerMap.values()).filter(
        (p) => p.hasMatchData === true && p.status !== "archived",
      ),
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

    // Get ALL players (including archived) for teammate lookups - need to look up teammates by epicUsername
    const archivedPlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "archived"))
      .collect();
    
    // Helper to check if Discord ID is valid (not placeholder or imported)
    const isValidDiscordId = (id: string | undefined): boolean => {
      if (!id || id === "") return false;
      if (id === "imported") return false;
      if (id.startsWith("placeholder_")) return false;
      return true;
    };
    
    // Build a map of epicUsername -> player for fast teammate lookups
    const allPlayersForLookup = [...Array.from(playerMap.values()), ...archivedPlayers]
      .filter(p => isValidDiscordId(p.discordUserId));
    const epicUsernameToPlayer = new Map<string, typeof activePlayers[0]>();
    for (const p of allPlayersForLookup) {
      if (p.epicUsername) {
        epicUsernameToPlayer.set(p.epicUsername, p);
      }
    }

    // Get just this batch
    const startIdx = args.batchNumber * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, eligiblePlayers.length);
    const batchPlayers = eligiblePlayers.slice(startIdx, endIdx);

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
          // Look up teammate from ALL players (including archived) for accurate tier calculation
          const teammate = epicUsernameToPlayer.get(teammateEpic);
          if (teammate && teammate.tier) {
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

      // Compute recent comparison diffs (recentHolisticScore vs tier medians)
      const recentHolisticVsSameTier = (recentHolisticScore != null && sameTierHolistic != null)
        ? recentHolisticScore - sameTierHolistic
        : undefined;
      const recentPromotionDiff = (recentHolisticScore != null && tierAboveHolistic != null)
        ? recentHolisticScore - tierAboveHolistic
        : undefined;
      const recentDemotionDiff = (recentHolisticScore != null && tierBelowHolistic != null)
        ? recentHolisticScore - tierBelowHolistic
        : undefined;

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

// Step 4: Finalize recent (6-week) comparisons after all batches complete.
// Computes 6-week tier medians from cached recentHolisticScore values,
// then updates each cache entry's recent diff fields against those medians.
export const finalizeRecentComparisons = mutation({
  args: {},
  handler: async (ctx): Promise<{ updated: number; recentMedians: Record<string, number | undefined> }> => {
    const allCache = await ctx.db.query("tierReEvaluationCache").collect();

    // Group recentHolisticScore by tier (only entries that have recent data)
    const tierScores: Record<string, number[]> = { S: [], A: [], B: [], C: [] };
    for (const entry of allCache) {
      if (entry.recentHolisticScore != null && ["S", "A", "B", "C"].includes(entry.tier)) {
        tierScores[entry.tier].push(entry.recentHolisticScore);
      }
    }

    // Compute recent medians per tier
    const recentMedians: { S?: number; A?: number; B?: number; C?: number } = {};
    for (const tier of ["S", "A", "B", "C"] as const) {
      const scores = tierScores[tier].sort((a, b) => a - b);
      if (scores.length === 0) continue;
      const mid = Math.floor(scores.length / 2);
      recentMedians[tier] = scores.length % 2 === 0
        ? (scores[mid - 1] + scores[mid]) / 2
        : scores[mid];
    }

    // Store recent medians in tierMediansCache
    const mediansCache = await ctx.db.query("tierMediansCache").first();
    if (mediansCache) {
      await ctx.db.patch(mediansCache._id, { recentTierHolisticMedians: recentMedians });
    }

    // Update each cache entry's recent diff fields using the 6-week medians
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
    const cache = await ctx.db.query("tierReEvaluationCache").collect();
    return { cacheCount: cache.length };
  },
});
