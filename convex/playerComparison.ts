import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";

// Get comprehensive player data for comparison
export const getPlayerComparisonData = query({
  args: {
    playerIds: v.array(v.id("players")),
    applyDuoAdjustment: v.optional(v.boolean()),
    applyCSPenalty: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if user is admin or moderator
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return [];
    }

    const applyDuoAdjustment = args.applyDuoAdjustment || false;
    const applyCSPenalty = args.applyCSPenalty !== false; // Default to true

    // Helper function to calculate DCA
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

    // Get all players for DCA calculation context
    const allPlayers = await ctx.db.query("players").collect();

    // Fetch all requested players
    const playersData = await Promise.all(
      args.playerIds.map(async (playerId) => {
        const player = await ctx.db.get(playerId);
        if (!player) return null;

        // Get player's third-party results
        const thirdPartyResults = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_player", (q) => q.eq("playerId", playerId))
          .collect();

        // Calculate recent top 5s (last 5 leaderboards)
        const top5FinishesPromises = thirdPartyResults
          .filter((result) => result.placement <= 5)
          .map(async (result) => {
            const importData = await ctx.db.get(result.importId);
            if (!importData || !importData.eventDate) {
              return null;
            }
            
            return { 
              result, 
              importId: result.importId,
              eventDate: importData.eventDate,
              creationTime: importData._creationTime 
            };
          });

        const top5FinishesResults = await Promise.all(top5FinishesPromises);
        const validTop5s = top5FinishesResults.filter((r) => r !== null);
        
        // Sort by leaderboard creation time (most recent first)
        const sortedTop5s = validTop5s.sort((a, b) => {
          return b.creationTime - a.creationTime;
        });
        
        // Get unique leaderboards (importIds) and count top 5s in last 5 leaderboards
        const recentLeaderboardIds = new Set<string>();
        
        for (const item of sortedTop5s) {
          if (recentLeaderboardIds.size < 5) {
            recentLeaderboardIds.add(item.importId);
          }
        }
        
        const recentTop5Count = recentLeaderboardIds.size;
        
        // Calculate recent top 3 finishes (last 5 leaderboards) for green flag
        const top3FinishesPromises = thirdPartyResults
          .filter((result) => result.placement <= 3)
          .map(async (result) => {
            const importData = await ctx.db.get(result.importId);
            if (!importData || !importData.eventDate) {
              return null;
            }
            
            return { 
              result, 
              importId: result.importId,
              eventDate: importData.eventDate,
              creationTime: importData._creationTime 
            };
          });

        const top3FinishesResults = await Promise.all(top3FinishesPromises);
        const validTop3s = top3FinishesResults.filter((r) => r !== null);
        
        // Sort by leaderboard creation time (most recent first)
        const sortedTop3s = validTop3s.sort((a, b) => {
          return b.creationTime - a.creationTime;
        });
        
        // Get unique leaderboards (importIds) and count top 3s in last 5 leaderboards
        const recentTop3LeaderboardIds = new Set<string>();
        
        for (const item of sortedTop3s) {
          if (recentTop3LeaderboardIds.size < 5) {
            recentTop3LeaderboardIds.add(item.importId);
          }
        }
        
        const recentTop3Count = recentTop3LeaderboardIds.size;

        // Get last event played date
        let lastEventDate: string | null = null;
        if (thirdPartyResults.length > 0) {
          const sortedResults = [...thirdPartyResults].sort(
            (a, b) => b._creationTime - a._creationTime
          );
          const mostRecentResult = sortedResults[0];
          const mostRecentImport = await ctx.db.get(mostRecentResult.importId);
          if (mostRecentImport?.eventDate) {
            lastEventDate = mostRecentImport.eventDate;
          }
        }

        // Get ranking stats
        const rankingStats = player.rankingStats || {
          totalEvents: 0,
          averagePlacement: 0,
          averageTeamElims: 0,
          averageTeamKD: 0,
          totalTeamElims: 0,
          winRate: 0,
          top3Finishes: 0,
          totalTeamScore: 0,
        };

        // Calculate DCA if enabled
        let dca = 1.00;
        let consistentDuoEpic: string | null = null;
        let withoutDuoCount = 0;

        if (applyDuoAdjustment) {
          const playerResults = await ctx.db
            .query("thirdPartyResults")
            .withIndex("by_player", (q) => q.eq("playerId", player._id))
            .collect();

          // Find consistent duo
          const teammateCount = new Map<string, { count: number; lastEventTime: number }>();
          
          for (const result of playerResults) {
            if (!result.teamMembers || result.teamMembers.length === 0) continue;
            
            for (const teammateEpic of result.teamMembers) {
              if (teammateEpic === player.epicUsername) continue;
              
              const current = teammateCount.get(teammateEpic) || { count: 0, lastEventTime: 0 };
              teammateCount.set(teammateEpic, {
                count: current.count + 1,
                lastEventTime: Math.max(current.lastEventTime, result._creationTime),
              });
            }
          }

          // Find most consistent duo
          let maxCount = 0;
          let maxLastEventTime = 0;
          
          for (const [epicUsername, data] of teammateCount.entries()) {
            if (data.count > maxCount || (data.count === maxCount && data.lastEventTime > maxLastEventTime)) {
              maxCount = data.count;
              maxLastEventTime = data.lastEventTime;
              consistentDuoEpic = epicUsername;
            }
          }

          if (consistentDuoEpic && playerResults.length >= 5) {
            // Store in const to help TypeScript understand it's non-null in this block
            const duoEpic: string = consistentDuoEpic;
            
            const withDuoEvents = playerResults.filter(r => 
              r.teamMembers && r.teamMembers.includes(duoEpic)
            );
            
            const consistentDuoPlayer = allPlayers.find(p => p.epicUsername === duoEpic);
            const consistentDuoTier = consistentDuoPlayer?.tier;
            const consistentDuoPowerScore = consistentDuoPlayer?.powerScore || 0;
            
            const getTierScore = (tier: string | undefined): number => {
              if (!tier) return 0;
              const scores: Record<string, number> = { S: 92.5, A: 77, B: 62, C: 47 };
              return scores[tier] || 0;
            };
            
            const playerTierScore = getTierScore(player.tier);
            const duoTierScore = getTierScore(consistentDuoTier);
            
            // Get all events WITHOUT consistent duo partner
            // This includes events with no teammates (solo) or teammates that don't include the duo
            const withoutDuoEvents = playerResults.filter(r => 
              r.teamMembers && 
              !r.teamMembers.includes(duoEpic)
            );
            
            withoutDuoCount = withoutDuoEvents.length;
            
            const calculateGroupStats = (events: typeof playerResults) => {
              if (events.length === 0) return null;
              
              const kills = events.map(e => e.eliminations || 0);
              const placements = events.map(e => e.placement);
              
              const avgKD = kills.reduce((sum, k) => sum + k, 0) / kills.length;
              const avgElims = kills.reduce((sum, k) => sum + k, 0) / kills.length;
              const avgPlacement = placements.reduce((sum, p) => sum + p, 0) / placements.length;
              
              return { avgKD, avgElims, avgPlacement };
            };
            
            const withDuoStats = calculateGroupStats(withDuoEvents);
            const withoutDuoStats = calculateGroupStats(withoutDuoEvents);
            
            if (withDuoStats && withoutDuoStats) {
              const rawDCA = calculateDCA(
                withDuoStats.avgKD,
                withoutDuoStats.avgKD,
                withDuoStats.avgElims,
                withoutDuoStats.avgElims,
                withDuoStats.avgPlacement,
                withoutDuoStats.avgPlacement
              );
              
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
              
              const withDuoCount = withDuoEvents.length;
              const sampleSizeRatio = Math.min(withDuoCount, withoutDuoCount) / Math.max(withDuoCount, withoutDuoCount);
              const balancingFactor = 0.5 + (sampleSizeRatio * 0.5);
              
              const dcaAdjustment = rawDCA - 1.0;
              dca = 1.0 + (dcaAdjustment * confidenceWeight * balancingFactor);
            }
          }
        }

        // Calculate power scores with adjustments
        const rawPowerScore = player.powerScore || 0;
        const powerScoreAfterDCA = applyDuoAdjustment ? rawPowerScore * dca : rawPowerScore;
        
        let cpm = 1.00;
        let cs: number | null = null;
        
        if (applyCSPenalty && player.contributionScore?.score !== undefined) {
          cs = player.contributionScore.score;
          cpm = 0.65 + (0.35 * cs);
        }
        
        const finalPowerScore = powerScoreAfterDCA * cpm;

        // Calculate avg PR per event using final power score
        const avgPRPerEvent =
          rankingStats.totalEvents > 0
            ? finalPowerScore / rankingStats.totalEvents
            : 0;

        // Get Discord tier roles
        const tierRoleNames = ["Tier S", "Tier A", "Tier B", "Tier C", "Tier D"];
        const discordTierRoles = player.discordRoles
          ? player.discordRoles
              .filter((role) => tierRoleNames.includes(role.name))
              .map((role) => role.name.replace("Tier ", ""))
          : [];

        // Calculate average teammate tier
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

        const playerResults = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .collect();

        const teammateTiers: number[] = [];
        const uniqueTeammates = new Set<string>();

        for (const result of playerResults) {
          if (!result.teamMembers || result.teamMembers.length === 0) continue;
          
          for (const teammateEpic of result.teamMembers) {
            if (teammateEpic === player.epicUsername) continue;
            if (uniqueTeammates.has(teammateEpic)) continue;
            
            uniqueTeammates.add(teammateEpic);
            const teammate = allPlayers.find(p => p.epicUsername === teammateEpic);
            if (teammate && teammate.tier) {
              teammateTiers.push(tierToNumeric(teammate.tier));
            }
          }
        }

        const avgTeammateTierNumeric = teammateTiers.length > 0
          ? teammateTiers.reduce((sum, t) => sum + t, 0) / teammateTiers.length
          : 0;
        
        const avgTeammateTier = numericToTier(avgTeammateTierNumeric);

        return {
          playerId: player._id,
          playerName: player.nickname || player.discordUsername,
          discordUsername: player.discordUsername,
          epicUsername: player.epicUsername,
          tier: player.tier || "Unranked",
          status: player.status || "active",
          
          // Discord info
          discordTierRoles,
          
          // ZBD Performance stats
          totalEvents: rankingStats.totalEvents,
          avgPlacement: rankingStats.averagePlacement,
          avgTeamEliminations: rankingStats.averageTeamElims,
          avgTeamKD: rankingStats.averageTeamKD,
          totalTeamEliminations: rankingStats.totalTeamElims || 0,
          winRate: rankingStats.winRate,
          topThreeCount: rankingStats.top3Finishes || 0,
          totalTeamScore: rankingStats.totalTeamScore,
          avgPRPerEvent,
          rawPowerScore,
          dca,
          cs,
          cpm,
          powerScore: finalPowerScore,
          
          // Advanced stats
          contributionScore: player.contributionScore?.score || 0,
          duoPartner: player.contributionScore?.duoPartner || null,
          consistentDuoEpic,
          withoutDuoCount,
          
          // Recent performance
          recentTop5Count,
          recentTop3Count,
          lastEventDate,
          
          // Teammate analysis
          avgTeammateTier,
          avgTeammateTierNumeric,
        };
      })
    );

    return playersData.filter((p) => p !== null);
  },
});

// Get all active players for selection dropdown
export const getAllPlayersForComparison = query({
  args: {},
  handler: async (ctx) => {
    // Check if user is admin or moderator
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return [];
    }

    // Get all players (active, archived, and rejected)
    const allPlayers = await ctx.db.query("players").collect();

    return allPlayers.map((player) => ({
      _id: player._id,
      playerName: player.nickname || player.discordUsername,
      tier: player.tier || "Unranked",
      status: player.status || "active",
    }));
  },
});
