import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";

// Define types for evaluation data
type PlayerEvaluationData = {
  playerId: Id<"players">;
  playerName: string;
  discordUsername: string;
  epicUsername: string;
  discordUserId: string;
  tier: string;
  totalEvents: number;
  finalPowerScore: number;
  killsPerMatch: number;
  deathsPerMatch: number | undefined;
  avgPlacement: number;
  winRate: number;
  holisticScore: number;
  placementScore: number;
  winRateScore: number;
  killsScore: number;
  deathsScore: number | undefined;
  // Tier-gap adjustment fields
  rawAvgPlacement?: number;
  adjustedAvgPlacement?: number;
  rawPlacementScore?: number;
  rawHolisticScore?: number;
  avgTeammateTier?: number;
  tierGapAdjustment?: number;
};

type TierEvaluationResult = {
  evaluations: Array<{
    playerId: Id<"players">;
    playerName: string;
    discordUsername: string;
    discordUserId: string;
    tier: string;
    totalEvents: number;
    avgPRPerEvent: number;
    finalPowerScore: number;
    killsPerMatch: number;
    deathsPerMatch: number | undefined;
    tierKillsMedian: number | null;
    killsVsTierDiff: number | null;
    holisticScore: number;
    avgPlacement: number;
    winRate: number;
    placementScore: number;
    winRateScore: number;
    killsScore: number;
    deathsScore: number | undefined;
    // Tier-gap adjustment fields
    rawAvgPlacement?: number;
    adjustedAvgPlacement?: number;
    rawPlacementScore?: number;
    rawHolisticScore?: number;
    avgTeammateTier?: number;
    tierGapAdjustment?: number;
    // Tier comparisons
    tierAbove: string | null;
    tierAboveAvg: number | null;
    tierAboveHolistic: number | null;
    tierBelow: string | null;
    tierBelowAvg: number | null;
    tierBelowHolistic: number | null;
    sameTierAvg: number | null;
    sameTierHolistic: number | null;
    sameTierDiff: number | null;
    holisticVsSameTier: number | null;
    promotionDiff: number | null;
    demotionDiff: number | null;
    recentTop5Count: number;
    recentTop4Count: number;
    recentTop3Count: number;
    recentTop5WithTeammate: number;
    consistentTeammateName: string | undefined;
    lastEventDate: string | null;
    evaluationStatus: "Strong Promotion Outlier" | "Eligible for Promotion Evaluation" | "Stable" | "Eligible for Demotion Evaluation" | "Strong Demotion Outlier" | "Insufficient Data";
  }>;
  tierAverages: Record<string, number>;
  tierHolisticMedians: Record<string, number>;
  tierKillsMedians: Record<string, number>;
};

// Tier re-evaluation system - provides suggestions only, never modifies tiers
export const getTierReEvaluationData = query({
  args: {
    applyDuoAdjustment: v.optional(v.boolean()),
    applyTCPenalty: v.optional(v.boolean()),
    applyTCDCAToHolistic: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<TierEvaluationResult> => {
    // Check if user is admin or moderator
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { evaluations: [], tierAverages: {}, tierHolisticMedians: {}, tierKillsMedians: {} };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return { evaluations: [], tierAverages: {}, tierHolisticMedians: {}, tierKillsMedians: {} };
    }

    // Get active players WITH match data using existing indexes (to avoid reading entire table)
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();
    const formerMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "former"))
      .collect();

    // Combine and deduplicate
    const playerMap = new Map<string, typeof activePlayers[0]>();
    for (const p of [...activePlayers, ...acceptedMembers, ...formerMembers]) {
      playerMap.set(p._id, p);
    }
    const players = Array.from(playerMap.values()).filter(
      (p) => p.hasMatchData === true && p.status !== "archived"
    );
    
    // Get ALL players (including archived) for teammate lookups
    const allPlayersForTeammateLookup = Array.from(playerMap.values());

    const applyDuoAdjustment = args.applyDuoAdjustment || false;
    const applyTCPenalty = args.applyTCPenalty !== false; // Default to true

    // Helper to calculate DCA (same logic as rankings.ts)
    const calculateDCA = (
      kdWithDuo: number,
      kdWithoutDuo: number,
      elimsWithDuo: number,
      elimsWithoutDuo: number,
      placementWithDuo: number,
      placementWithoutDuo: number
    ): number => {
      const rawAdjustment =
        (kdWithoutDuo - kdWithDuo) * 0.25 +
        (elimsWithoutDuo - elimsWithDuo) * 0.08 +
        (placementWithDuo - placementWithoutDuo) * 0.005;
      const clampedAdjustment = Math.max(-0.25, Math.min(0.25, rawAdjustment));
      return 1 + clampedAdjustment;
    };

    // Calculate holistic evaluation data for each player
    
    const playerData: PlayerEvaluationData[] = await Promise.all(
      players.map(async (player): Promise<PlayerEvaluationData> => {
        const stats = player.rankingStats;
        
        if (!stats || stats.totalEvents === 0) {
          return {
            playerId: player._id,
            playerName: player.nickname || player.discordUsername,
            discordUsername: player.discordUsername,
            epicUsername: player.epicUsername,
            discordUserId: player.discordUserId || "",
            tier: player.tier || "Unranked",
            totalEvents: 0,
            finalPowerScore: 0,
            holisticScore: 0,
            avgPlacement: 0,
            winRate: 0,
            placementScore: 0,
            winRateScore: 0,
            killsScore: 0,
            deathsScore: undefined,
            killsPerMatch: 0,
            deathsPerMatch: undefined,
            rawAvgPlacement: undefined,
            adjustedAvgPlacement: undefined,
            rawPlacementScore: undefined,
            rawHolisticScore: undefined,
            avgTeammateTier: undefined,
            tierGapAdjustment: undefined,
          };
        }
        
        // Get comprehensive stats for holistic evaluation (use cached rankingStats)
        const comprehensiveStats: {
          averagePlacement: number;
          winRate: number;
        } = {
          averagePlacement: stats.averagePlacement || 50,
          winRate: stats.winRate || 0,
        };

        // Power score is no longer used in holistic evaluation
        const rawPowerScore = 0;
        const displayTotalEvents = stats.totalEvents;
        
        let dca = 1.0;

        // Calculate DCA if enabled
        if (applyDuoAdjustment) {
          const playerResults = await ctx.db
            .query("thirdPartyResults")
            .withIndex("by_player", (q) => q.eq("playerId", player._id))
            .collect();

          const teammateCount = new Map<
            string,
            { count: number; lastEventTime: number }
          >();

          for (const result of playerResults) {
            if (!result.teamMembers || result.teamMembers.length === 0) {
              continue;
            }

            for (const teammateEpic of result.teamMembers) {
              if (teammateEpic === player.epicUsername) {
                continue;
              }

              const current = teammateCount.get(teammateEpic) || {
                count: 0,
                lastEventTime: 0,
              };
              teammateCount.set(teammateEpic, {
                count: current.count + 1,
                lastEventTime: Math.max(
                  current.lastEventTime,
                  result._creationTime
                ),
              });
            }
          }

          let consistentDuoEpic: string | null = null;
          let maxCount = 0;
          let maxLastEventTime = 0;

          for (const [epicUsername, data] of teammateCount.entries()) {
            if (
              data.count > maxCount ||
              (data.count === maxCount && data.lastEventTime > maxLastEventTime)
            ) {
              maxCount = data.count;
              maxLastEventTime = data.lastEventTime;
              consistentDuoEpic = epicUsername;
            }
          }

          if (consistentDuoEpic && playerResults.length >= 5) {
            const withDuoEvents = playerResults.filter(
              (r) => r.teamMembers && r.teamMembers.includes(consistentDuoEpic)
            );

            // Get all events WITHOUT consistent duo partner
            // This includes events with no teammates (solo) or teammates that don't include the duo
            const withoutDuoEvents = playerResults.filter(
              (r) =>
                r.teamMembers &&
                !r.teamMembers.includes(consistentDuoEpic)
            );

            const calculateGroupStats = (events: typeof playerResults) => {
              if (events.length === 0) return null;

              const kills = events.map((e) => e.eliminations || 0);
              const placements = events.map((e) => e.placement);

              const avgKD = kills.reduce((sum, k) => sum + k, 0) / kills.length;
              const avgElims =
                kills.reduce((sum, k) => sum + k, 0) / kills.length;
              const avgPlacement =
                placements.reduce((sum, p) => sum + p, 0) / placements.length;

              return { avgKD, avgElims, avgPlacement };
            };

            const withDuoStats = calculateGroupStats(withDuoEvents);
            const withoutDuoStats = calculateGroupStats(withoutDuoEvents);

            if (withDuoStats && withoutDuoStats) {
              // Calculate raw DCA
              const rawDCA = calculateDCA(
                withDuoStats.avgKD,
                withoutDuoStats.avgKD,
                withDuoStats.avgElims,
                withoutDuoStats.avgElims,
                withDuoStats.avgPlacement,
                withoutDuoStats.avgPlacement
              );
              
              // Apply confidence weighting based on number of filtered events
              const filteredCount = withoutDuoEvents.length;
              let confidenceWeight = 1.0;
              
              if (filteredCount >= 3) {
                confidenceWeight = 1.0;
              } else if (filteredCount === 2) {
                confidenceWeight = 0.6;
              } else if (filteredCount === 1) {
                confidenceWeight = 0.3;
              } else {
                confidenceWeight = 0.0;
              }
              
              // Apply sample size balancing to prevent skew when games are imbalanced
              const withDuoCount = withDuoEvents.length;
              const withoutDuoCount = withoutDuoEvents.length;
              
              // Calculate sample size ratio (smaller sample / larger sample)
              const sampleSizeRatio = Math.min(withDuoCount, withoutDuoCount) / Math.max(withDuoCount, withoutDuoCount);
              
              // Apply balancing factor: reduce DCA adjustment when sample sizes are imbalanced
              const balancingFactor = 0.5 + (sampleSizeRatio * 0.5);
              
              // Apply both confidence weighting and balancing factor
              const dcaAdjustment = rawDCA - 1.0;
              dca = 1.0 + (dcaAdjustment * confidenceWeight * balancingFactor);
            }
          }
        }

        const powerScoreAfterDCA = applyDuoAdjustment
          ? rawPowerScore * dca
          : rawPowerScore;

        // Apply TC penalty if enabled
        let cpm = 1.0;
        if (applyTCPenalty && player.contributionScore?.score !== undefined) {
          const cs = player.contributionScore.score;
          cpm = 0.65 + 0.35 * cs;
        }

        const finalPowerScore = powerScoreAfterDCA * cpm;
        
        // Get kills per match and deaths per match from actual match-level data
        const matchStats = await ctx.db
          .query("matchPlayerStats")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .collect();
        
        let killsPerMatch = 0;
        let deathsPerMatch: number | undefined = undefined;
        
        if (matchStats.length > 0) {
          const totalKills = matchStats.reduce((sum, m) => sum + m.eliminations, 0);
          const totalDeaths = matchStats.reduce((sum, m) => sum + m.deaths, 0);
          killsPerMatch = totalKills / matchStats.length;
          deathsPerMatch = totalDeaths / matchStats.length;
        }
        
        // Calculate tier-gap adjustment for C-tier players with >= 8 events
        // This reduces carry inflation by adjusting placement based on teammate tiers
        const rawAvgPlacement: number = comprehensiveStats.averagePlacement;
        const winRate: number = comprehensiveStats.winRate;
        
        // Helper: Convert tier string to numeric value (C=1, B=2, A=3, S=4)
        const tierToNumeric = (tier: string): number => {
          if (tier === "C") return 1;
          if (tier === "B") return 2;
          if (tier === "A") return 3;
          if (tier === "S") return 4;
          return 0;
        };
        
        let avgTeammateTier: number | undefined = undefined;
        let tierGapAdjustment = 1.0; // Default: no adjustment
        let adjustedAvgPlacement = rawAvgPlacement;
        
        // Only apply adjustment for C-tier and B-tier players with >= 8 events
        const playerTierNumeric = tierToNumeric(player.tier || "Unranked");
        if ((playerTierNumeric === 1 || playerTierNumeric === 2) && displayTotalEvents >= 8) {
          // Get all player results to calculate teammate tiers
          const playerResults = await ctx.db
            .query("thirdPartyResults")
            .withIndex("by_player", (q) => q.eq("playerId", player._id))
            .collect();
          
          let totalTeammateTier = 0;
          let teammateCount = 0;
          
          for (const result of playerResults) {
            if (!result.teamMembers || result.teamMembers.length === 0) {
              continue;
            }
            
            for (const teammateEpic of result.teamMembers) {
              if (teammateEpic === player.epicUsername) {
                continue;
              }
              
              // Find teammate in player database
              const teammate = allPlayersForTeammateLookup.find(
                (p) => p.epicUsername === teammateEpic
              );
              
              if (teammate && teammate.tier) {
                const teammateTierNumeric = tierToNumeric(teammate.tier);
                if (teammateTierNumeric > 0) {
                  totalTeammateTier += teammateTierNumeric;
                  teammateCount++;
                }
              }
            }
          }
          
          if (teammateCount > 0) {
            avgTeammateTier = totalTeammateTier / teammateCount;
            const tierGap = Math.max(0, avgTeammateTier - playerTierNumeric);
            
            // Apply tier-gap multiplier based on gap size (reduced by ~20% for harsher penalties)
            if (tierGap >= 3) {
              tierGapAdjustment = 0.45;
            } else if (tierGap >= 2) {
              tierGapAdjustment = 0.60;
            } else if (tierGap >= 1) {
              tierGapAdjustment = 0.75;
            } else {
              tierGapAdjustment = 1.00; // No adjustment if tierGap < 1
            }
            
            // Apply adjustment to placement (divide to penalize - higher placement number is worse)
            adjustedAvgPlacement = rawAvgPlacement / tierGapAdjustment;
          }
        }
        
        // Calculate holistic evaluation score
        // Combines: placement (25%), win rate (25%), kills per match (25%), deaths per match (25%)
        // Normalized to 0-100 scale for each metric
        const avgPlacement = adjustedAvgPlacement; // Use adjusted placement
        
        // Calculate both raw and adjusted placement scores for transparency
        const rawPlacementScore = Math.max(0, Math.min(100, (50 - rawAvgPlacement) * 2));
        let placementScore = Math.max(0, Math.min(100, (50 - adjustedAvgPlacement) * 2));
        
        // Additional cap for C-tier players with very high-tier teammates
        // If C-tier (1) player has avgTeammateTier >= 2.8 (almost A-tier), cap placement score at 40
        if (playerTierNumeric === 1 && avgTeammateTier !== undefined && avgTeammateTier >= 2.8) {
          placementScore = Math.min(placementScore, 40);
        }
        
        // Win rate is already 0-100
        const winRateScore = Math.min(100, winRate * 7.5); // Amplify since most are <10%
        
        // Normalize kills per match (assume 0-10 kills per match range, 5+ is excellent)
        const killsScore = Math.min(100, (killsPerMatch / 5) * 100);
        
        // Normalize deaths per match (lower is better, invert: 0 deaths = 100 points, 3+ deaths = 0 points)
        const deathsScore = deathsPerMatch !== undefined
          ? Math.max(0, Math.min(100, (3 - deathsPerMatch) * 33.33))
          : undefined;
        
        // Calculate raw holistic score (before tier-gap adjustment)
        // Only include scores that are defined
        const rawScores = [rawPlacementScore, winRateScore, killsScore, deathsScore].filter(
          (s): s is number => s !== undefined
        );
        const rawHolisticScore = rawScores.reduce((sum, s) => sum + s, 0) / rawScores.length;
        
        // Weighted composite score (using adjusted placement)
        const scores = [placementScore, winRateScore, killsScore, deathsScore].filter(
          (s): s is number => s !== undefined
        );
        let holisticScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        
        // Apply TC/DCA adjustments to holistic score if enabled
        if (args.applyTCDCAToHolistic) {
          holisticScore = holisticScore * dca * cpm;
        }

        return {
          playerId: player._id,
          playerName: player.nickname || player.discordUsername,
          discordUsername: player.discordUsername,
          epicUsername: player.epicUsername,
          discordUserId: player.discordUserId,
          tier: player.tier || "Unranked",
          totalEvents: displayTotalEvents,
          finalPowerScore,
          killsPerMatch,
          deathsPerMatch,
          // Comprehensive stats
          avgPlacement,
          winRate,
          holisticScore: Math.round(holisticScore * 10) / 10,
          // Component scores for transparency
          placementScore: Math.round(placementScore * 10) / 10,
          winRateScore: Math.round(winRateScore * 10) / 10,
          killsScore: Math.round(killsScore * 10) / 10,
          deathsScore: deathsScore !== undefined ? Math.round(deathsScore * 10) / 10 : undefined,
          // Tier-gap adjustment fields (only set for C/B tier with >= 8 events)
          rawAvgPlacement: rawAvgPlacement !== adjustedAvgPlacement ? rawAvgPlacement : undefined,
          adjustedAvgPlacement: rawAvgPlacement !== adjustedAvgPlacement ? adjustedAvgPlacement : undefined,
          rawPlacementScore: rawAvgPlacement !== adjustedAvgPlacement ? Math.round(rawPlacementScore * 10) / 10 : undefined,
          rawHolisticScore: rawAvgPlacement !== adjustedAvgPlacement ? Math.round(rawHolisticScore * 10) / 10 : undefined,
          avgTeammateTier: avgTeammateTier !== undefined ? Math.round(avgTeammateTier * 100) / 100 : undefined,
          tierGapAdjustment: tierGapAdjustment !== 1.0 ? tierGapAdjustment : undefined,
        };
      })
    );

    // Split players into eligible (≥8 events) and insufficient data (<8 events)
    const eligiblePlayers: PlayerEvaluationData[] = playerData.filter((p: PlayerEvaluationData) => p.totalEvents >= 8);
    const insufficientDataPlayers: PlayerEvaluationData[] = playerData.filter((p: PlayerEvaluationData) => p.totalEvents < 8);

    // Filter for tier median calculation: >= 5 events
    const tierAveragePlayers: PlayerEvaluationData[] = playerData.filter(
      (p: PlayerEvaluationData) => p.totalEvents >= 5
    );

    // For S-tier median filtering: check if player has events after August 4th, 2025
    const august4th2025 = new Date("2025-08-04").getTime();
    const hasRecentEvents = new Map<string, boolean>();
    
    for (const player of tierAveragePlayers) {
      if (player.tier === "S") {
        const playerResults = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_player", (q) => q.eq("playerId", player.playerId))
          .collect();
        
        const hasPostAugust4th = await Promise.all(
          playerResults.map(async (result) => {
            const importData = await ctx.db.get(result.importId);
            if (!importData || !importData.eventDate) return false;
            const eventTimestamp = new Date(importData.eventDate).getTime();
            return eventTimestamp >= august4th2025;
          })
        );
        
        hasRecentEvents.set(player.playerId, hasPostAugust4th.some(v => v));
      }
    }

    // Group players by tier and collect per-event scores, holistic scores, and kills per match
    // Only process valid tiers (S, A, B, C) - filter out Unranked, ironman, etc.
    const tierGroups: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };
    
    const tierHolisticScores: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };
    
    const tierKillsPerMatch: Record<string, number[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
    };

    for (const player of tierAveragePlayers) {
      // Only process players with valid tiers (S, A, B, C)
      if (!["S", "A", "B", "C"].includes(player.tier)) {
        continue; // Skip players with invalid tiers (Unranked, ironman, etc.)
      }
      
      // For S-tier, only include if they have events after August 4th, 2025
      if (player.tier === "S" && !hasRecentEvents.get(player.playerId)) {
        continue;
      }
      
      // At this point, player.tier is guaranteed to be S, A, B, or C
      const perEventScore = player.totalEvents > 0 
        ? player.finalPowerScore / player.totalEvents 
        : 0;
      tierGroups[player.tier].push(perEventScore);
      tierHolisticScores[player.tier].push(player.holisticScore);
      tierKillsPerMatch[player.tier].push(player.killsPerMatch);
    }

    // Calculate median for each tier (more robust against outliers)
    const calculateMedian = (values: number[]): number => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
      }
      return sorted[mid];
    };

    const tierAverages: Record<string, number> = {};
    const tierHolisticMedians: Record<string, number> = {};
    const tierKillsMedians: Record<string, number> = {};
    for (const [tier, scores] of Object.entries(tierGroups)) {
      tierAverages[tier] = calculateMedian(scores);
      tierHolisticMedians[tier] = calculateMedian(tierHolisticScores[tier]);
      tierKillsMedians[tier] = calculateMedian(tierKillsPerMatch[tier]);
    }

    // Tier order for promotion/demotion checks
    const tierOrder = ["S", "A", "B", "C"];

    // Calculate cutoff for "recent" events (last 4 weeks)
    const fourWeeksAgo = Date.now() - 4 * 7 * 24 * 60 * 60 * 1000;

    // Evaluate each eligible player
    const evaluations = await Promise.all(eligiblePlayers.map(async (player: PlayerEvaluationData) => {
      // Get full player document for topFiveCache access
      const fullPlayer = await ctx.db.get(player.playerId);
      const avgPRPerEvent =
        player.totalEvents > 0
          ? player.finalPowerScore / player.totalEvents
          : 0;
      const currentTierIndex = tierOrder.indexOf(player.tier);
      const tierAbove =
        currentTierIndex > 0 ? tierOrder[currentTierIndex - 1] : null;
      const tierBelow =
        currentTierIndex < tierOrder.length - 1
          ? tierOrder[currentTierIndex + 1]
          : null;

      // Use holistic score for tier comparisons (primary)
      const tierAboveHolistic = tierAbove ? tierHolisticMedians[tierAbove] : null;
      const tierBelowHolistic = tierBelow ? tierHolisticMedians[tierBelow] : null;
      const sameTierHolistic = tierHolisticMedians[player.tier] || null;
      
      // Keep legacy PR-based averages for reference
      const tierAboveAvg = tierAbove ? tierAverages[tierAbove] : null;
      const tierBelowAvg = tierBelow ? tierAverages[tierBelow] : null;
      
      // For S-tier, also compare to S-tier average
      const sameTierAvg = player.tier === "S" ? tierAverages["S"] : null;
      const sameTierDiff = sameTierAvg && sameTierAvg > 0
        ? ((avgPRPerEvent - sameTierAvg) / sameTierAvg) * 100
        : null;
      
      // Calculate holistic score differences
      const holisticVsSameTier = sameTierHolistic && sameTierHolistic !== 0
        ? ((player.holisticScore - sameTierHolistic) / sameTierHolistic) * 100
        : null;
      
      // Calculate kills per match comparisons
      const sameTierKillsMedian = tierKillsMedians[player.tier] || null;
      const killsVsTierDiff = sameTierKillsMedian && sameTierKillsMedian !== 0
        ? ((player.killsPerMatch) - sameTierKillsMedian) / sameTierKillsMedian * 100
        : null;

      let evaluationStatus:
        | "Strong Promotion Outlier"
        | "Eligible for Promotion Evaluation"
        | "Strong Demotion Outlier"
        | "Eligible for Demotion Evaluation"
        | "Stable" = "Stable";

      let promotionDiff: number | null = null;
      let demotionDiff: number | null = null;

      // Check for recent top 5/3 finishes in last 5 events/leaderboards
      // Logic:
      // - Random & Mini-Season: Use cumulative placement (one per Event, best placement)
      // - Scrim, Minicup, Season: Use individual leaderboard placements
      // - Exclude events marked as "No Money Event"
      const playerResults = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_player", (q) => q.eq("playerId", player.playerId))
        .collect();

      // Step 1: Get ALL player results with import and event data
      const allResultsPromises = playerResults.map(async (result) => {
        const importData = await ctx.db.get(result.importId);
        if (!importData || !importData.eventDate) {
          return null;
        }
        
        // Get linked Event to determine type
        let eventType: string | null = null;
        let eventId: string | null = null;
        if (importData.eventId) {
          const event = await ctx.db.get(importData.eventId);
          if (event) {
            eventType = event.type;
            eventId = importData.eventId;
          }
        }
        
        return { 
          result, 
          importId: result.importId, 
          placement: result.placement,
          eventDate: importData.eventDate,
          creationTime: importData._creationTime,
          eventType,
          eventId,
        };
      });
      
      const allResultsWithData = await Promise.all(allResultsPromises);
      const validResults = allResultsWithData.filter((r) => r !== null);
      
      // Step 2: Sort by event date (most recent first)
      const sortedResults = validResults.sort((a, b) => {
        const dateA = new Date(a.eventDate).getTime();
        const dateB = new Date(b.eventDate).getTime();
        return dateB - dateA;
      });
      
      // Check if player has played within the last 8 weeks
      const eightWeeksAgo = Date.now() - (8 * 7 * 24 * 60 * 60 * 1000);
      const hasRecentActivity = sortedResults.length > 0 && 
        new Date(sortedResults[0].eventDate).getTime() >= eightWeeksAgo;
      
      // Use cached top-5 data if available, otherwise calculate
      let recentTop5Count = 0;
      let recentTop4Count = 0;
      let recentTop3Count = 0;
      let recentTop5WithTeammate = 0;
      
      if (fullPlayer && 'topFiveCache' in fullPlayer && fullPlayer.topFiveCache) {
        // Use cached data
        recentTop5Count = fullPlayer.topFiveCache.recentTop5Count || 0;
        recentTop4Count = fullPlayer.topFiveCache.recentTop4Count || 0;
        recentTop3Count = fullPlayer.topFiveCache.recentTop3Count || 0;
        recentTop5WithTeammate = fullPlayer.topFiveCache.recentTop5WithTeammate || 0;
      }
      
      const hasHotStreak = recentTop5Count >= 4;

      // Get last event played date
      let lastEventDate: string | null = null;
      if (playerResults.length > 0) {
        // Sort by creation time to get most recent result
        const sortedResults = [...playerResults].sort((a, b) => b._creationTime - a._creationTime);
        const mostRecentResult = sortedResults[0];
        const mostRecentImport = await ctx.db.get(mostRecentResult.importId);
        if (mostRecentImport?.eventDate) {
          lastEventDate = mostRecentImport.eventDate;
        }
      }

      // Tier Stickiness: Adjust promotion/demotion thresholds based on manual evaluation score position within tier
      let promotionStrongThreshold = 50;
      let promotionEligibleThreshold = 33;
      let demotionStrongThreshold = 50;
      let demotionEligibleThreshold = 33;
      
      // Get player's manual score
      const playerManualScore = await ctx.db
        .query("manualScores")
        .withIndex("by_player", (q) => q.eq("playerId", player.playerId))
        .first();
      
      if (playerManualScore && playerManualScore.totalScore) {
        // Get all manual scores for players in the same tier
        const allPlayersInTier = players.filter(p => p.tier === player.tier);
        
        // Fetch manual scores for all same-tier players
        const sameTierScores: number[] = [];
        for (const tierPlayer of allPlayersInTier) {
          const score = await ctx.db
            .query("manualScores")
            .withIndex("by_player", (q) => q.eq("playerId", tierPlayer._id))
            .first();
          if (score && score.totalScore) {
            sameTierScores.push(score.totalScore);
          }
        }
        
        // Calculate median manual score for the tier
        if (sameTierScores.length > 0) {
          sameTierScores.sort((a, b) => a - b);
          const mid = Math.floor(sameTierScores.length / 2);
          const tierMedianScore = sameTierScores.length % 2 === 0
            ? (sameTierScores[mid - 1] + sameTierScores[mid]) / 2
            : sameTierScores[mid];
          
          // Determine if player is in top or bottom half of their tier
          const isTopHalf = playerManualScore.totalScore >= tierMedianScore;
          
          if (isTopHalf) {
            // Top half: Harder to demote, easier to promote
            demotionStrongThreshold = 60;  // More lenient (was 50)
            demotionEligibleThreshold = 45; // More lenient (was 33)
            // Promotion thresholds stay at 50/33 (standard)
          } else {
            // Bottom half: Standard demotion, harder to promote
            // Demotion thresholds stay at 50/33 (standard)
            promotionStrongThreshold = 60;  // Stricter (was 50)
            promotionEligibleThreshold = 45; // Stricter (was 33)
          }
        }
      }

      // Check promotion eligibility using holistic score with adjusted thresholds
      if (tierAboveHolistic !== null && tierAboveHolistic !== 0) {
        const diffPercent = ((player.holisticScore - tierAboveHolistic) / tierAboveHolistic) * 100;
        promotionDiff = diffPercent;

        if (diffPercent >= promotionStrongThreshold) {
          evaluationStatus = "Strong Promotion Outlier";
        } else if (diffPercent >= promotionEligibleThreshold) {
          evaluationStatus = "Eligible for Promotion Evaluation";
        }
      }

      // Check for hot streak (3+ recent top 3s) - upgrades to promotion evaluation if stable
      if (hasHotStreak && evaluationStatus === "Stable") {
        evaluationStatus = "Eligible for Promotion Evaluation";
      }

      // Check demotion eligibility using holistic score with adjusted thresholds (only if not already flagged for promotion)
      if (
        evaluationStatus === "Stable" &&
        tierBelowHolistic !== null &&
        tierBelowHolistic !== 0
      ) {
        const diffPercent = ((tierBelowHolistic - player.holisticScore) / tierBelowHolistic) * 100;
        demotionDiff = diffPercent;

        if (diffPercent >= demotionStrongThreshold) {
          evaluationStatus = "Strong Demotion Outlier";
        } else if (diffPercent >= demotionEligibleThreshold) {
          evaluationStatus = "Eligible for Demotion Evaluation";
        }
      }

      const playerKillsPerMatch = eligiblePlayers.find((p: PlayerEvaluationData) => p.playerId === player.playerId)?.killsPerMatch || 0;
      const playerDeathsPerMatch = eligiblePlayers.find((p: PlayerEvaluationData) => p.playerId === player.playerId)?.deathsPerMatch || 0;
      const playerData = eligiblePlayers.find((p: PlayerEvaluationData) => p.playerId === player.playerId);
      
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        discordUsername: player.discordUsername,
        discordUserId: player.discordUserId,
        tier: player.tier,
        totalEvents: player.totalEvents,
        avgPRPerEvent: Math.round(avgPRPerEvent * 100) / 100,
        finalPowerScore: Math.round(player.finalPowerScore * 100) / 100,
        killsPerMatch: Math.round(playerKillsPerMatch * 10) / 10,
        deathsPerMatch: Math.round(playerDeathsPerMatch * 10) / 10,
        tierKillsMedian: sameTierKillsMedian ? Math.round(sameTierKillsMedian * 10) / 10 : null,
        killsVsTierDiff: killsVsTierDiff ? Math.round(killsVsTierDiff * 10) / 10 : null,
        // Holistic evaluation scores
        holisticScore: player.holisticScore,
        avgPlacement: Math.round(player.avgPlacement * 10) / 10,
        winRate: Math.round(player.winRate * 10) / 10,
        // Component scores
        placementScore: player.placementScore,
        winRateScore: player.winRateScore,
        killsScore: player.killsScore,
        deathsScore: player.deathsScore,
        // Tier-gap adjustment fields
        rawAvgPlacement: playerData?.rawAvgPlacement,
        adjustedAvgPlacement: playerData?.adjustedAvgPlacement,
        rawPlacementScore: playerData?.rawPlacementScore,
        rawHolisticScore: playerData?.rawHolisticScore,
        avgTeammateTier: playerData?.avgTeammateTier,
        tierGapAdjustment: playerData?.tierGapAdjustment,
        // Tier comparisons
        tierAbove,
        tierAboveAvg: tierAboveAvg
          ? Math.round(tierAboveAvg * 100) / 100
          : null,
        tierAboveHolistic: tierAboveHolistic
          ? Math.round(tierAboveHolistic * 10) / 10
          : null,
        tierBelow,
        tierBelowAvg: tierBelowAvg
          ? Math.round(tierBelowAvg * 100) / 100
          : null,
        tierBelowHolistic: tierBelowHolistic
          ? Math.round(tierBelowHolistic * 10) / 10
          : null,
        sameTierAvg: sameTierAvg
          ? Math.round(sameTierAvg * 100) / 100
          : null,
        sameTierHolistic: sameTierHolistic
          ? Math.round(sameTierHolistic * 10) / 10
          : null,
        sameTierDiff: sameTierDiff
          ? Math.round(sameTierDiff * 10) / 10
          : null,
        holisticVsSameTier: holisticVsSameTier
          ? Math.round(holisticVsSameTier * 10) / 10
          : null,
        promotionDiff: promotionDiff
          ? Math.round(promotionDiff * 10) / 10
          : null,
        demotionDiff: demotionDiff ? Math.round(demotionDiff * 10) / 10 : null,
        recentTop5Count,
        recentTop4Count,
        recentTop3Count,
        recentTop5WithTeammate,
        consistentTeammateName: fullPlayer && 'topFiveCache' in fullPlayer ? fullPlayer.topFiveCache?.consistentTeammateName : undefined,
        lastEventDate,
        evaluationStatus,
      };
    }));

    // Add insufficient data players
    const insufficientEvaluations = insufficientDataPlayers.map((player: PlayerEvaluationData) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      discordUsername: player.discordUsername,
      discordUserId: player.discordUserId,
      tier: player.tier,
      totalEvents: player.totalEvents,
      avgPRPerEvent: 0,
      finalPowerScore: Math.round(player.finalPowerScore * 100) / 100,
      killsPerMatch: Math.round(player.killsPerMatch * 10) / 10,
      deathsPerMatch: player.deathsPerMatch !== undefined ? Math.round(player.deathsPerMatch * 10) / 10 : undefined,
      tierKillsMedian: null,
      killsVsTierDiff: null,
      // Holistic evaluation scores
      holisticScore: player.holisticScore,
      avgPlacement: Math.round(player.avgPlacement * 10) / 10,
      winRate: Math.round(player.winRate * 10) / 10,
      // Component scores
      placementScore: player.placementScore,
      winRateScore: player.winRateScore,
      killsScore: player.killsScore,
      deathsScore: player.deathsScore,
      // Tier comparisons
      tierAbove: null,
      tierAboveAvg: null,
      tierAboveHolistic: null,
      tierBelow: null,
      tierBelowAvg: null,
      tierBelowHolistic: null,
      sameTierAvg: null,
      sameTierHolistic: null,
      sameTierDiff: null,
      holisticVsSameTier: null,
      promotionDiff: null,
      demotionDiff: null,
      recentTop5Count: 0,
      recentTop4Count: 0,
      recentTop3Count: 0,
      recentTop5WithTeammate: 0,
      consistentTeammateName: undefined,
      lastEventDate: null,
      evaluationStatus: "Insufficient Data" as const,
    }));

    // Filter to only show players who have played in the past 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.getTime();
    
    const allEvaluations = [...evaluations, ...insufficientEvaluations];
    const recentEvaluations = allEvaluations.filter(e => {
      if (!e.lastEventDate) return false;
      return new Date(e.lastEventDate).getTime() >= cutoff;
    });

    return {
      evaluations: recentEvaluations,
      tierAverages,
      tierHolisticMedians,
      tierKillsMedians,
    };
  },
});

// Get cached tier re-evaluation data
export const getCachedTierReEvaluationData = query({
  args: {},
  handler: async (ctx) => {
    // Check if user is admin or moderator
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return null;
    }

    // Get tier medians first (lightweight check)
    const tierMedians = await ctx.db.query("tierMediansCache").first();
    
    if (!tierMedians) {
      return null; // No cache available
    }
    
    // Get cached evaluations - use reasonable limit for performance
    // 500 should cover all active players while keeping query fast
    const cachedEvaluations = await ctx.db
      .query("tierReEvaluationCache")
      .take(500); // Increased limit to show all players with match data
    
    if (cachedEvaluations.length === 0) {
      return null; // No cache available
    }
    
    // Filter to only show players who have played in the past 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.getTime();
    
    const recentEvaluations = cachedEvaluations.filter(e => {
      if (!e.lastEventDate) return false;
      return new Date(e.lastEventDate).getTime() >= cutoff;
    });
    
    return {
      evaluations: recentEvaluations,
      tierAverages: tierMedians.tierAverages,
      tierHolisticMedians: tierMedians.tierHolisticMedians,
      tierKillsMedians: tierMedians.tierKillsMedians,
      recentTierHolisticMedians: tierMedians.recentTierHolisticMedians,
      lastUpdated: tierMedians.lastUpdated,
    };
  },
});

// Start tier re-evaluation cache rebuild (synchronous)
export const startTierReEvaluationCacheRebuild = mutation({
  args: {
    applyDuoAdjustment: v.optional(v.boolean()),
    applyTCPenalty: v.optional(v.boolean()),
    applyTCDCAToHolistic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can rebuild cache");
    }

    // Clear old cache
    const oldEvaluations = await ctx.db.query("tierReEvaluationCache").collect();
    for (const oldEval of oldEvaluations) {
      await ctx.db.delete(oldEval._id);
    }
    
    const oldMedians = await ctx.db.query("tierMediansCache").collect();
    for (const oldMedian of oldMedians) {
      await ctx.db.delete(oldMedian._id);
    }

    // Get fresh evaluation data (runs with admin auth context)
    const evaluationData: TierEvaluationResult = await ctx.runQuery(api.tierReEvaluation.getTierReEvaluationData, {
      applyDuoAdjustment: args.applyDuoAdjustment || false,
      applyTCPenalty: args.applyTCPenalty !== false,
      applyTCDCAToHolistic: args.applyTCDCAToHolistic || false,
    });

    const now = Date.now();
    
    // Store tier medians
    await ctx.db.insert("tierMediansCache", {
      tierAverages: evaluationData.tierAverages,
      tierHolisticMedians: evaluationData.tierHolisticMedians,
      tierKillsMedians: evaluationData.tierKillsMedians,
      lastUpdated: now,
    });

    // Store ALL evaluations
    for (const evaluation of evaluationData.evaluations) {
      await ctx.db.insert("tierReEvaluationCache", {
        playerId: evaluation.playerId,
        playerName: evaluation.playerName,
        discordUsername: evaluation.discordUsername,
        discordUserId: evaluation.discordUserId,
        tier: evaluation.tier,
        totalEvents: evaluation.totalEvents,
        avgPRPerEvent: evaluation.avgPRPerEvent,
        finalPowerScore: evaluation.finalPowerScore,
        killsPerMatch: evaluation.killsPerMatch,
        deathsPerMatch: evaluation.deathsPerMatch,
        tierKillsMedian: evaluation.tierKillsMedian ?? undefined,
        killsVsTierDiff: evaluation.killsVsTierDiff ?? undefined,
        holisticScore: evaluation.holisticScore,
        avgPlacement: evaluation.avgPlacement,
        winRate: evaluation.winRate,
        placementScore: evaluation.placementScore,
        winRateScore: evaluation.winRateScore,
        killsScore: evaluation.killsScore,
        deathsScore: evaluation.deathsScore,
        // Tier-gap adjustment fields
        rawAvgPlacement: evaluation.rawAvgPlacement,
        adjustedAvgPlacement: evaluation.adjustedAvgPlacement,
        rawPlacementScore: evaluation.rawPlacementScore,
        rawHolisticScore: evaluation.rawHolisticScore,
        avgTeammateTier: evaluation.avgTeammateTier,
        tierGapAdjustment: evaluation.tierGapAdjustment,
        // Tier comparisons
        tierAbove: evaluation.tierAbove || undefined,
        tierAboveAvg: evaluation.tierAboveAvg ?? undefined,
        tierAboveHolistic: evaluation.tierAboveHolistic ?? undefined,
        tierBelow: evaluation.tierBelow || undefined,
        tierBelowAvg: evaluation.tierBelowAvg ?? undefined,
        tierBelowHolistic: evaluation.tierBelowHolistic ?? undefined,
        sameTierAvg: evaluation.sameTierAvg ?? undefined,
        sameTierHolistic: evaluation.sameTierHolistic ?? undefined,
        sameTierDiff: evaluation.sameTierDiff ?? undefined,
        holisticVsSameTier: evaluation.holisticVsSameTier ?? undefined,
        promotionDiff: evaluation.promotionDiff ?? undefined,
        demotionDiff: evaluation.demotionDiff ?? undefined,
        recentTop5Count: evaluation.recentTop5Count,
        recentTop4Count: evaluation.recentTop4Count,
        recentTop3Count: evaluation.recentTop3Count,
        recentTop5WithTeammate: evaluation.recentTop5WithTeammate,
        consistentTeammateName: evaluation.consistentTeammateName,
        lastEventDate: evaluation.lastEventDate || undefined,
        evaluationStatus: evaluation.evaluationStatus,
        lastUpdated: now,
      });
    }

    console.log(`Stored ${evaluationData.evaluations.length} evaluations in cache`);

    return {
      success: true,
      message: `Cache rebuilt successfully with ${evaluationData.evaluations.length} players`,
    };
  },
});

// Legacy function for backwards compatibility
export const rebuildTierReEvaluationCache = mutation({
  args: {
    applyDuoAdjustment: v.optional(v.boolean()),
    applyTCPenalty: v.optional(v.boolean()),
    applyTCDCAToHolistic: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
  }> => {
    return await ctx.runMutation(api.tierReEvaluation.startTierReEvaluationCacheRebuild, {
      applyDuoAdjustment: args.applyDuoAdjustment,
      applyTCPenalty: args.applyTCPenalty,
      applyTCDCAToHolistic: args.applyTCDCAToHolistic,
    });
  },
});
