import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { fetchThirdPartyResultsForPlayer } from "./helpers/playerResults";

// Event data structure for per-event scoring
interface EventData {
  eventId: string;
  eventName: string;
  eventDate: number;
  eventType: string; // event type (scrim, minicup, season, mini-season, etc)
  teamKD: number;
  elims: number;
  placement: number;
  win: number; // 1 if tournament win, 0 if not (used for event score calculation)
  matchWins?: number; // Number of individual match wins in this tournament
  matchesPlayed?: number; // Total matches played in this tournament
}

// Helper function to get all events for a player
async function getPlayerEvents(ctx: QueryCtx, playerId: Id<"players">): Promise<EventData[]> {
  const events: EventData[] = [];
  
  // Get manual event results
  const manualEvents = await ctx.db
    .query("eventResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  
  // Get third party results (only those linked to events)
  const allThirdPartyResults = (
    await fetchThirdPartyResultsForPlayer(ctx, playerId)
  ).filter((r) => r.matched);
  
  // Process manual events
  for (const result of manualEvents) {
    // For manual events, we need to calculate K/D based on eliminations and placement
    const deaths = result.placement === 1 ? 0 : 1; // 1 death if not win, 0 if win
    const teamKD = deaths > 0 ? result.eliminations / deaths : result.eliminations;
    
    // Manual events don't have type tracking, default to "scrim"
    events.push({
      eventId: result._id,
      eventName: result.eventName,
      eventDate: result._creationTime,
      eventType: "scrim",
      teamKD,
      elims: result.eliminations,
      placement: result.placement,
      win: result.placement === 1 ? 1 : 0,
      matchWins: undefined, // Manual events don't track individual match wins
      matchesPlayed: undefined,
    });
  }
  
  // Process third party results
  for (const result of allThirdPartyResults) {
    const importRecord = await ctx.db.get(result.importId);
    if (importRecord?.eventId) {
      const event = await ctx.db.get(importRecord.eventId);
      if (event) {
        // Calculate K/D: kills / deaths (deaths = 1 if not win, 0 if win)
        const deaths = result.placement === 1 ? 0 : 1;
        const teamKD = deaths > 0 ? (result.eliminations || 0) / deaths : (result.eliminations || 0);
        
        // Use event startDate if available, otherwise use _creationTime
        const eventDate = event.startDate 
          ? new Date(event.startDate).getTime() 
          : event._creationTime;
        
        // Win = 1st place placement in tournament (for event score calculation)
        const winValue = result.placement === 1 ? 1 : 0;
        
        events.push({
          eventId: result._id,
          eventName: event.name,
          eventDate,
          eventType: event.type,
          teamKD,
          elims: result.eliminations || 0,
          placement: result.placement,
          win: winValue,
          matchWins: result.wins, // Individual match wins
          matchesPlayed: result.matchesPlayed, // Total matches in tournament
        });
      }
    }
  }
  
  // Sort by event date (most recent first)
  events.sort((a, b) => b.eventDate - a.eventDate);
  
  return events;
}

// Calculate EventScore for a single event
function calculateEventScore(event: EventData): number {
  const baseScore = (
    (event.teamKD * 45) +
    (event.elims * 1.3) +
    ((100 - event.placement) * 1.0) +
    (event.win * 1.2)
  );
  
  // Apply 0.7× weighting to mini-season events
  const eventTypeWeight = event.eventType === "mini-season" ? 0.7 : 1.0;
  
  return baseScore * eventTypeWeight;
}

// Calculate recency weight (last 3-4 events get 1.1, others get 1.0)
function getRecencyWeight(index: number): number {
  return index < 4 ? 1.1 : 1.0;
}

// Helper function to calculate PowerScore with per-event scoring, recency bias, and smoothing
function calculatePowerScore(
  events: EventData[], 
  medianEventScore: number,
  avgElims: number,
  totalElims: number,
  deathsPerMatch: number
): number {
  const SMOOTHING_THRESHOLD = 3;
  const POINTS_PER_EVENT = 50;
  const AVG_ELIMS_MULTIPLIER = 15;
  const TOTAL_ELIMS_MULTIPLIER = 0.5;
  const DEATHS_PENALTY_MULTIPLIER = 40; // Penalty per death per match
  const n_events = events.length;
  
  if (n_events === 0) {
    return 0;
  }
  
  // Calculate event scores and apply recency weighting
  let sumWeightedScores = 0;
  let sumWeights = 0;
  
  for (let i = 0; i < events.length; i++) {
    const eventScore = calculateEventScore(events[i]);
    const recencyWeight = getRecencyWeight(i);
    sumWeightedScores += eventScore * recencyWeight;
    sumWeights += recencyWeight;
  }
  
  // Apply smoothing for players with fewer than 3 events
  if (n_events < SMOOTHING_THRESHOLD) {
    const virtualEvents = SMOOTHING_THRESHOLD - n_events;
    sumWeightedScores += medianEventScore * virtualEvents;
    sumWeights += virtualEvents;
  }
  
  const averageScore = sumWeights > 0 ? sumWeightedScores / sumWeights : 0;
  
  // Add bonuses
  const eventBonus = n_events * POINTS_PER_EVENT;
  const avgElimsBonus = avgElims * AVG_ELIMS_MULTIPLIER;
  const totalElimsBonus = totalElims * TOTAL_ELIMS_MULTIPLIER;
  
  // Subtract deaths penalty (higher deaths = lower score)
  const deathsPenalty = deathsPerMatch * DEATHS_PENALTY_MULTIPLIER;
  
  const powerScore = averageScore + eventBonus + avgElimsBonus + totalElimsBonus - deathsPenalty;
  
  return Math.round(powerScore * 100) / 100;
}

// Helper function to calculate median event score across all players
async function calculateMedianEventScore(ctx: QueryCtx): Promise<number> {
  // Use a fixed median event score to avoid timeout
  // This is calculated from historical data and is good enough for smoothing
  // Value represents the median score across all events from all active players
  return 185.0;
}

// Admin/Moderator query to get player rankings (returns cached results)
export const getPlayerRankings = query({
  args: { 
    applyDuoAdjustment: v.optional(v.boolean()),
    applyCSPenalty: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ 
    rankings: Array<{
      playerId: Id<"players">;
      playerName: string;
      discordUsername: string;
      epicUsername: string;
      tier: string;
      rawPowerScore: number;
      dca: number;
      performanceRatio: number | null;
      withoutDuoCount: number;
      hasMutualDependency: boolean;
      cs: number | null;
      cpm: number;
      powerScore: number;
      avgPRPerEvent: number;
      averageTeamKD: number;
      averageTeamElims: number;
      totalTeamElims: number;
      deathsPerMatch: number;
      averagePlacement: number;
      winRate: number;
      totalEvents: number;
      displayTotalEvents: number;
      totalTeamScore: number;
      top3Finishes: number;
      recentTop5Count: number;
      recentTop4Count: number;
      recentTop3Count: number;
      recentTop5WithTeammate: number;
      consistentTeammateName?: string;
      lastUpdated?: number;
      tierDetail: string;
      rank: number;
    }>;
    tierMedians: Record<string, number>;
    applyDuoAdjustment: boolean;
    applyCSPenalty: boolean;
  }> => {
    // Check if user is admin or moderator
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { 
        rankings: [], 
        tierMedians: {}, 
        applyDuoAdjustment: args.applyDuoAdjustment ?? true, 
        applyCSPenalty: args.applyCSPenalty ?? true 
      };
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return { 
        rankings: [], 
        tierMedians: {}, 
        applyDuoAdjustment: args.applyDuoAdjustment ?? true, 
        applyCSPenalty: args.applyCSPenalty ?? true 
      };
    }
    
    // Helper to check if Discord ID is valid (not placeholder or imported)
    const isValidDiscordId = (id: string | undefined): boolean => {
      if (!id || id === "") return false;
      if (id === "imported") return false;
      if (id.startsWith("placeholder_")) return false;
      return true;
    };
    
    // Get all players that are active or don't have a status (treat undefined as active)
    // AND have match data - use indexed queries to avoid timeout
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.eq(q.field("hasMatchData"), true))
      .collect();
    
    const undefinedStatusPlayers = await ctx.db
      .query("players")
      .withIndex("by_status")
      .filter((q) => 
        q.and(
          q.eq(q.field("status"), undefined),
          q.eq(q.field("hasMatchData"), true)
        )
      )
      .collect();
    
    // Combine and filter for valid Discord IDs
    const allPlayersWithMatchData = [...activePlayers, ...undefinedStatusPlayers];
    const players = allPlayersWithMatchData.filter(p => isValidDiscordId(p.discordUserId));
    
    // Get ALL players (including archived) for teammate lookups - use indexed queries
    const activeForLookup = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    
    const undefinedForLookup = await ctx.db
      .query("players")
      .withIndex("by_status")
      .filter((q) => q.eq(q.field("status"), undefined))
      .collect();
    
    const archivedForLookup = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "archived"))
      .collect();
    
    const allPlayersForTeammateLookup = [...activeForLookup, ...undefinedForLookup, ...archivedForLookup]
      .filter(p => isValidDiscordId(p.discordUserId));
    
    // Return cached stats with optional duo adjustment
    const applyDuoAdjustment = args.applyDuoAdjustment || false;
    const applyCSPenalty = args.applyCSPenalty !== false; // Default to true
    
    // Helper functions for teammate tier calculation
    const tierToNumeric = (tier: string | undefined): number => {
      if (!tier) return 0;
      const mapping: Record<string, number> = { "S": 4, "A": 3, "B": 2, "C": 1 };
      return mapping[tier] || 0;
    };

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

    // Calculate median event score for power score recalculation
    const medianEventScore = await calculateMedianEventScore(ctx);
    const august4th2025 = new Date("2025-08-04").getTime();

    // Final pass: Generate rankings with all adjustments applied
    const rankings: Array<{
      playerId: Id<"players">;
      playerName: string;
      discordUsername: string;
      epicUsername: string;
      tier: string;
      rawPowerScore: number;
      dca: number;
      performanceRatio: number | null;
      withoutDuoCount: number;
      hasMutualDependency: boolean;
      cs: number | null;
      cpm: number;
      powerScore: number;
      avgPRPerEvent: number;
      averageTeamKD: number;
      averageTeamElims: number;
      totalTeamElims: number;
      deathsPerMatch: number;
      averagePlacement: number;
      winRate: number;
      totalEvents: number;
      displayTotalEvents: number;
      totalTeamScore: number;
      top3Finishes: number;
      recentTop5Count: number;
      recentTop4Count: number;
      recentTop3Count: number;
      recentTop5WithTeammate: number;
      consistentTeammateName?: string;
      lastUpdated?: number;
      tierDetail: string;
    }> = await Promise.all(players.map(async (player) => {
      const stats = player.rankingStats || {
        averageTeamKD: 0,
        averageTeamElims: 0,
        totalTeamElims: 0,
        averagePlacement: 0,
        winRate: 0,
        totalEvents: 0,
        totalTeamScore: 0,
        top3Finishes: 0,
      };
      
      let rawPowerScore = player.powerScore || 0;
      let displayTotalEvents = stats.totalEvents;
      
      // For S-tier players, recalculate power score using only events after August 4th, 2025
      if (player.tier === "S") {
        const allEvents = await getPlayerEvents(ctx, player._id);
        
        // Filter to events after August 4th, 2025
        const filteredEvents = allEvents.filter(event => event.eventDate >= august4th2025);
        
        if (filteredEvents.length > 0) {
          // Recalculate stats from filtered events
          const totalElims = filteredEvents.reduce((sum, e) => sum + e.elims, 0);
          const totalMatches = filteredEvents.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
          const avgElims = totalMatches > 0 ? totalElims / totalMatches : 0;
          
          // Use cached deaths per match from contribution score (avoids expensive sub-query)
          const deathsPerMatch = player.contributionScore?.averageDeathsPerMatch ?? 0;
          
          // Recalculate power score with filtered events and deaths penalty
          rawPowerScore = calculatePowerScore(filteredEvents, medianEventScore, avgElims, totalElims, deathsPerMatch);
          displayTotalEvents = filteredEvents.length;
        } else {
          // No events after August 4th, use 0 power score
          rawPowerScore = 0;
          displayTotalEvents = 0;
        }
      }
      
      // Calculate average teammate tier
      const playerResults = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();

      // For S-tier players, filter to only events after August 4th, 2025
      const filteredResults = player.tier === "S" 
        ? await Promise.all(
            playerResults.map(async (result) => {
              const importData = await ctx.db.get(result.importId);
              if (!importData || !importData.eventDate) return null;
              const eventTimestamp = new Date(importData.eventDate).getTime();
              return eventTimestamp >= august4th2025 ? result : null;
            })
          ).then(results => results.filter(r => r !== null) as typeof playerResults)
        : playerResults;

      const teammateTiers: number[] = [];
      const teammateScores: number[] = [];
      const uniqueTeammates = new Set<string>();

      for (const result of filteredResults) {
        if (!result.teamMembers || result.teamMembers.length === 0) continue;
        
        for (const teammateEpic of result.teamMembers) {
          if (teammateEpic === player.epicUsername) continue;
          if (uniqueTeammates.has(teammateEpic)) continue;
          
          uniqueTeammates.add(teammateEpic);
          // Look up teammate from ALL players (including archived) for accurate tier calculation
          const teammate = allPlayersForTeammateLookup.find(p => p.epicUsername === teammateEpic);
          if (teammate && teammate.tier) {
            teammateTiers.push(tierToNumeric(teammate.tier));
            // Also collect evaluation score if available
            if (teammate.totalScore !== undefined) {
              teammateScores.push(teammate.totalScore);
            }
          }
        }
      }

      const avgTeammateTierNumeric = teammateTiers.length > 0
        ? teammateTiers.reduce((sum, t) => sum + t, 0) / teammateTiers.length
        : 0;
      
      const avgTeammateTier = numericToTier(avgTeammateTierNumeric);
      
      // Calculate average evaluation score for teammates
      const avgTeammateEvalScore = teammateScores.length > 0
        ? Math.round(teammateScores.reduce((sum, s) => sum + s, 0) / teammateScores.length)
        : null;
      
      // Get DCA data from cache (if DCA is enabled)
      const dca = applyDuoAdjustment && player.dcaCache ? player.dcaCache.dca : 1.00;
      const performanceRatio = applyDuoAdjustment && player.dcaCache ? player.dcaCache.performanceRatio : null;
      const withoutDuoCount = applyDuoAdjustment && player.dcaCache ? player.dcaCache.withoutDuoCount : 0;
      const consistentDuoEpic = applyDuoAdjustment && player.dcaCache ? player.dcaCache.consistentDuoEpic : null;
      const hasMutualDependency = applyDuoAdjustment && player.dcaCache ? player.dcaCache.hasMutualDependency : false;
      
      // Apply DCA if enabled
      const powerScoreAfterDCA = applyDuoAdjustment ? rawPowerScore * dca : rawPowerScore;
      
      // Apply CS penalty (Carry Penalty Multiplier) if enabled
      // CPM = 0.65 + (0.35 × CS)
      // FinalPowerScore = PowerScore × CPM
      let cpm = 1.00; // Default to no penalty
      let cs: number | null = null;
      
      if (applyCSPenalty && player.contributionScore?.score !== undefined) {
        cs = player.contributionScore.score;
        cpm = 0.65 + (0.35 * cs);
      }
      
      const finalPowerScore = powerScoreAfterDCA * cpm;
      
      // Calculate average PR per event
      const avgPRPerEvent = displayTotalEvents > 0 ? finalPowerScore / displayTotalEvents : 0;
      
      // Use cached top-5 data if available (for performance)
      // Falls back to 0 if cache doesn't exist
      const recentTop5Count = player.topFiveCache?.recentTop5Count || 0;
      const recentTop4Count = player.topFiveCache?.recentTop4Count || 0;
      const recentTop3Count = player.topFiveCache?.recentTop3Count || 0;
      const recentTop5WithTeammate = player.topFiveCache?.recentTop5WithTeammate || 0;
      const consistentTeammateName = player.topFiveCache?.consistentTeammateName;
      
      // Use cached deaths per match from contribution score (avoids expensive sub-query)
      const deathsPerMatch: number = player.contributionScore?.averageDeathsPerMatch ?? 0;
      
      return {
        playerId: player._id,
        playerName: player.nickname || player.discordUsername,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        tier: player.tier || "Unranked",
        rawPowerScore,
        dca,
        performanceRatio,
        withoutDuoCount,
        hasMutualDependency,
        cs,
        cpm,
        powerScore: finalPowerScore,
        avgPRPerEvent,
        averageTeamKD: stats.averageTeamKD,
        averageTeamElims: stats.averageTeamElims,
        totalTeamElims: stats.totalTeamElims || 0,
        deathsPerMatch,
        averagePlacement: stats.averagePlacement,
        winRate: stats.winRate,
        totalEvents: displayTotalEvents,
        displayTotalEvents: displayTotalEvents,
        totalTeamScore: stats.totalTeamScore,
        top3Finishes: stats.top3Finishes || 0,
        recentTop5Count,
        recentTop4Count,
        recentTop3Count,
        recentTop5WithTeammate,
        consistentTeammateName,
        lastUpdated: player.topFiveCache?.lastUpdated,
        tierDetail: player.tier || "Unranked",
        avgTeammateTier: avgTeammateTierNumeric > 0 ? avgTeammateTierNumeric : null,
        avgTeammateEvalScore,
      };
    }));
    
    // Calculate tier medians (per-event scores)
    const calculateMedian = (values: number[]): number => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
      }
      return sorted[mid];
    };

    const tierGroups: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };

    // Group players by tier and collect per-event scores (players with ≥5 events and power score > 10)
    // For S-tier players, displayTotalEvents is already filtered to post-Aug-4th events
    // so if displayTotalEvents > 0, they have recent events
    for (const ranking of rankings) {
      if (ranking.totalEvents >= 5 && ranking.powerScore > 10) {
        // For S-tier, displayTotalEvents is already filtered to post-Aug-4th only
        // If it's 0, they have no recent events
        if (ranking.tier === "S" && ranking.displayTotalEvents === 0) {
          continue;
        }
        
        const perEventScore = ranking.totalEvents > 0 
          ? ranking.powerScore / ranking.totalEvents 
          : 0;
        if (tierGroups[ranking.tier]) {
          tierGroups[ranking.tier].push(perEventScore);
        }
      }
    }

    const tierMedians: Record<string, number> = {};
    for (const [tier, scores] of Object.entries(tierGroups)) {
      tierMedians[tier] = calculateMedian(scores);
    }

    // Sort by power score descending
    rankings.sort((a: typeof rankings[number], b: typeof rankings[number]) => b.powerScore - a.powerScore);
    
    // Add rank
    const rankedPlayers: Array<typeof rankings[number] & { rank: number }> = rankings.map((ranking: typeof rankings[number], index: number) => ({
      ...ranking,
      rank: index + 1,
    }));
    
    return { 
      rankings: rankedPlayers,
      tierMedians,
      applyDuoAdjustment,
      applyCSPenalty,
    };
  },
});

// Internal mutation to update a single player's power score
// Called by updateAllPowerScores via scheduler
export const updateSinglePlayerPowerScore = mutation({
  args: { 
    playerId: v.id("players"),
    medianEventScore: v.number(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      console.log(`[PR Update] Player ${args.playerId} not found - skipping`);
      return { success: false };
    }
    
    console.log(`[PR Update] Starting calculation for ${player.discordUsername || player.epicUsername}`);
    
    const august4th2025 = new Date("2025-08-04").getTime();
    
    let events = await getPlayerEvents(ctx, args.playerId);
    
    // Store unfiltered count for accurate tier re-evaluation
    const unfilteredTotalEvents = events.length;
    
    // For S-tier players, filter to only events after August 4th, 2025
    if (player.tier === "S") {
      events = events.filter(event => event.eventDate >= august4th2025);
    }
    
    // Calculate aggregate stats
    const totalEvents = events.length;
    const avgKD = totalEvents > 0 
      ? events.reduce((sum, e) => sum + e.teamKD, 0) / totalEvents 
      : 0;
    const totalElims = events.reduce((sum, e) => sum + e.elims, 0);
    
    // Calculate average kills per match (same as ZBD Performance)
    const totalMatches = events.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
    const avgElims = totalMatches > 0 
      ? totalElims / totalMatches 
      : 0;
    
    // Get deaths per match from match stats
    const matchStats = await ctx.runQuery(api.playerStats.getPlayerMatchStats, {
      playerId: args.playerId,
    });
    const deathsPerMatch = matchStats?.deathsPerMatch || 0;
    
    // Calculate power score with elims bonuses and deaths penalty
    const powerScore = calculatePowerScore(events, args.medianEventScore, avgElims, totalElims, deathsPerMatch);
    
    const avgPlacement = totalEvents > 0 
      ? events.reduce((sum, e) => sum + e.placement, 0) / totalEvents 
      : 0;
    
    // Calculate match-level wins (individual game wins across all tournaments)
    const totalMatchWins = events.reduce((sum, e) => sum + (e.matchWins || 0), 0);
    const totalMatchesPlayed = events.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
    
    // Calculate top 3 finishes (placement <= 3 in events)
    const top3Finishes = events.filter(e => e.placement <= 3).length;
    
    // Get total team score from thirdPartyResults
    const thirdPartyResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .filter((q) => q.eq(q.field("matched"), true))
      .collect();
    
    let totalTeamScore = 0;
    for (const result of thirdPartyResults) {
      const importRecord = await ctx.db.get(result.importId);
      if (importRecord?.eventId) {
        // Calculate total team score from ZBD events
        totalTeamScore += result.points || 0;
      }
    }
    
    // Calculate win rate as: (match wins / total matches) * 100
    const winRate = totalMatchesPlayed > 0 ? (totalMatchWins / totalMatchesPlayed) * 100 : 0;
    
    // Store all stats
    await ctx.db.patch(args.playerId, { 
      powerScore,
      rankingStats: {
        averageTeamKD: Math.round(avgKD * 100) / 100,
        averageTeamElims: Math.round(avgElims * 10) / 10,
        totalTeamElims: totalElims,
        averagePlacement: Math.round(avgPlacement * 10) / 10,
        winRate: Math.round(winRate * 10) / 10,
        totalEvents, // Filtered count (S-tier: post-Aug 4th only)
        unfilteredTotalEvents, // All events regardless of tier
        totalTeamScore: Math.round(totalTeamScore),
        top3Finishes,
      }
    });
    
    console.log(`[PR Update] ✓ Completed ${player.discordUsername || player.epicUsername}: PowerScore=${Math.round(powerScore)}, Events=${totalEvents}`);
    
    return { success: true, powerScore };
  },
});

// Admin-only mutation to recalculate all player power scores and stats
// This schedules batch processing to avoid timeouts
export const updateAllPowerScores = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { started: false, playerCount: 0 };
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      return { started: false, playerCount: 0 };
    }
    
    // Helper to check if Discord ID is valid (not placeholder or imported)
    const isValidDiscordId = (id: string | undefined): boolean => {
      if (!id || id === "") return false;
      if (id === "imported") return false;
      if (id.startsWith("placeholder_")) return false;
      return true;
    };
    
    // Get all players and filter in a single pass to avoid timeout
    // Use indexed queries to avoid full table scan
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.eq(q.field("hasMatchData"), true))
      .collect();
    
    const undefinedStatusPlayers = await ctx.db
      .query("players")
      .withIndex("by_status")
      .filter((q) => 
        q.and(
          q.eq(q.field("status"), undefined),
          q.eq(q.field("hasMatchData"), true)
        )
      )
      .collect();
    
    const allPlayersWithMatchData = [...activePlayers, ...undefinedStatusPlayers];
    const players = allPlayersWithMatchData.filter(p => isValidDiscordId(p.discordUserId));
    
    console.log(`[PR Backend] Processing ${players.length} active players with match data`);
    
    if (players.length === 0) {
      console.log('[PR Backend] No players to process - returning early');
      return { started: false, playerCount: 0, medianEventScore: 0 };
    }
    
    // Use a fixed median event score to avoid timeout
    // This is calculated from historical data and is good enough for smoothing
    // Value represents the median score across all events from all active players
    const medianEventScore = 185.0;
    
    // Schedule all power score updates without awaiting each one (faster)
    // Use 1 second delay to keep database responsive for frontend queries
    console.log(`[PR Backend] Scheduling ${players.length} power score updates...`);
    
    const schedulePromises = players.map((player, i) =>
      ctx.scheduler.runAfter(
        i * 1000, // Stagger by 1 second to avoid database overload
        api.rankings.updateSinglePlayerPowerScore,
        { 
          playerId: player._id,
          medianEventScore,
        }
      )
    );
    
    // Schedule cache rebuild to run after all players are processed
    // Add extra delay to ensure all player updates complete first
    schedulePromises.push(
      ctx.scheduler.runAfter(
        players.length * 1000 + 5000,
        internal.topFiveCache.rebuildAllTopFiveCaches
      )
    );
    
    // Wait for all scheduling to complete
    await Promise.all(schedulePromises);
    
    console.log(`[PR Backend] Successfully scheduled ${players.length} updates`);
    return { started: true, playerCount: players.length, medianEventScore };
  },
});

// Mutation to update a single player's power score (called automatically on stats update)
export const updatePlayerPowerScore = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const medianEventScore = await calculateMedianEventScore(ctx);
    const events = await getPlayerEvents(ctx, args.playerId);
    
    // Calculate elims stats
    const totalEvents = events.length;
    const totalElims = events.reduce((sum, e) => sum + e.elims, 0);
    const totalMatches = events.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
    const avgElims = totalMatches > 0 ? totalElims / totalMatches : 0;
    
    // Get deaths per match from match stats
    const matchStats = await ctx.runQuery(api.playerStats.getPlayerMatchStats, {
      playerId: args.playerId,
    });
    const deathsPerMatch = matchStats?.deathsPerMatch || 0;
    
    const powerScore = calculatePowerScore(events, medianEventScore, avgElims, totalElims, deathsPerMatch);
    
    await ctx.db.patch(args.playerId, { powerScore });
    
    return { powerScore };
  },
});

// Admin-only query to get detailed event breakdown for a player
export const getPlayerEventBreakdown = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Check if user is admin
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
    
    const events = await getPlayerEvents(ctx, args.playerId);
    const medianEventScore = await calculateMedianEventScore(ctx);
    
    // Calculate breakdown for each event
    const breakdown = events.map((event, index) => ({
      eventName: event.eventName,
      eventDate: event.eventDate,
      eventType: event.eventType,
      teamKD: Math.round(event.teamKD * 100) / 100,
      elims: event.elims,
      placement: event.placement,
      win: event.win,
      eventScore: Math.round(calculateEventScore(event) * 100) / 100,
      recencyWeight: getRecencyWeight(index),
      weightedScore: Math.round(calculateEventScore(event) * getRecencyWeight(index) * 100) / 100,
    }));
    
    // Add virtual events if needed
    const SMOOTHING_THRESHOLD = 3;
    const virtualEvents = events.length < SMOOTHING_THRESHOLD 
      ? SMOOTHING_THRESHOLD - events.length 
      : 0;
    
    // Calculate elims stats
    const totalEvents = events.length;
    const totalElims = events.reduce((sum, e) => sum + e.elims, 0);
    const totalMatches = events.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
    const avgElims = totalMatches > 0 ? totalElims / totalMatches : 0;
    
    // Get deaths per match from match stats
    const matchStats: { deathsPerMatch: number } | null = await ctx.runQuery(api.playerStats.getPlayerMatchStats, {
      playerId: args.playerId,
    });
    const deathsPerMatch: number = matchStats?.deathsPerMatch || 0;
    
    return {
      breakdown,
      medianEventScore: Math.round(medianEventScore * 100) / 100,
      virtualEvents,
      totalEvents: events.length,
      powerScore: calculatePowerScore(events, medianEventScore, avgElims, totalElims, deathsPerMatch),
    };
  },
});
