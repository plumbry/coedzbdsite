import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { ConvexError } from "convex/values";

// Get average statistics from cache
export const getAveragePlayerStats = query({
  args: {},
  handler: async (ctx) => {
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
    
    // Get cached stats
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

// Rebuild the aggregate stats cache
export const rebuildAggregateStatsCache = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can rebuild aggregate stats cache",
        code: "FORBIDDEN",
      });
    }
    
    console.log("Starting aggregate stats cache rebuild...");
    
    // Helper to check if Discord ID is valid
    const isValidDiscordId = (id: string | undefined): boolean => {
      if (!id || id === "") return false;
      if (id === "imported") return false;
      if (id.startsWith("placeholder_")) return false;
      return true;
    };
    
    // Get all active players with match data
    const allPlayers = await ctx.db.query("players").collect();
    const activePlayers = allPlayers.filter(p => 
      (p.status === "active" || p.status === undefined) && 
      isValidDiscordId(p.discordUserId) &&
      p.hasMatchData === true
    );
    
    // Calculate stats for each player
    const playerStats: Array<{
      totalGames: number;
      totalEliminations: number;
      averageScore: number;
      averagePlacement: number;
      averageKD: number;
      winRate: number;
      winCount: number;
      top3Finishes: number;
      manualEventsCount: number;
      thirdPartyEventsCount: number;
      thirdPartyGamesCount: number;
    }> = await Promise.all(
      activePlayers.map(async (player) => {
        const stats = await ctx.runQuery(api.playerStats.getPlayerComprehensiveStats, {
          playerId: player._id,
        });
        return stats;
      })
    );
    
    // Filter out players with no events
    const playersWithEvents = playerStats.filter((s) => s.totalGames > 0);
    
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
      };
    }
    
    // Calculate averages
    const totalEvents = playersWithEvents.reduce((sum: number, s) => sum + s.totalGames, 0);
    const totalEliminations = playersWithEvents.reduce((sum: number, s) => sum + s.totalEliminations, 0);
    const avgPlacementSum = playersWithEvents.reduce((sum: number, s) => sum + s.averagePlacement, 0);
    const avgScoreSum = playersWithEvents.reduce((sum: number, s) => sum + s.averageScore, 0);
    const avgKDSum = playersWithEvents.reduce((sum: number, s) => sum + s.averageKD, 0);
    const winRateSum = playersWithEvents.reduce((sum: number, s) => sum + s.winRate, 0);
    const top3Sum = playersWithEvents.reduce((sum: number, s) => sum + s.top3Finishes, 0);
    
    const count: number = playersWithEvents.length;
    
    // Calculate medians
    const sortedTotalEvents = playersWithEvents.map((s) => s.totalGames).sort((a: number, b: number) => a - b);
    const sortedAvgPlacement = playersWithEvents.map((s) => s.averagePlacement).sort((a: number, b: number) => a - b);
    const sortedAvgScore = playersWithEvents.map((s) => s.averageScore).sort((a: number, b: number) => a - b);
    const sortedAvgKD = playersWithEvents.map((s) => s.averageKD).sort((a: number, b: number) => a - b);
    
    const getMedian = (sorted: number[]) => {
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 
        ? (sorted[mid - 1] + sorted[mid]) / 2 
        : sorted[mid];
    };
    
    // Calculate per-tier statistics
    const perTierStats: Record<string, {
      playerCount: number;
      avgTotalEvents: number;
      avgTotalEliminations: number;
      avgAveragePlacement: number;
      avgAverageScore: number;
      avgAverageKD: number;
      avgWinRate: number;
      avgTop3Finishes: number;
      medianTotalEvents: number;
      medianAveragePlacement: number;
      medianAverageScore: number;
      medianAverageKD: number;
    }> = {};
    
    const tiers = ["S", "A", "B", "C", "D"];
    
    for (const tier of tiers) {
      // Get players for this tier
      const tierPlayers = activePlayers.filter((p) => p.tier === tier);
      const tierPlayerIds = new Set(tierPlayers.map((p) => p._id));
      
      // Get stats for players in this tier
      const tierStats = playerStats.filter((_, idx) => tierPlayerIds.has(activePlayers[idx]._id));
      const tierStatsWithEvents = tierStats.filter((s) => s.totalGames > 0);
      
      if (tierStatsWithEvents.length === 0) {
        perTierStats[tier] = {
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
        continue;
      }
      
      const tierTotalEvents = tierStatsWithEvents.reduce((sum: number, s) => sum + s.totalGames, 0);
      const tierTotalEliminations = tierStatsWithEvents.reduce((sum: number, s) => sum + s.totalEliminations, 0);
      const tierAvgPlacementSum = tierStatsWithEvents.reduce((sum: number, s) => sum + s.averagePlacement, 0);
      const tierAvgScoreSum = tierStatsWithEvents.reduce((sum: number, s) => sum + s.averageScore, 0);
      const tierAvgKDSum = tierStatsWithEvents.reduce((sum: number, s) => sum + s.averageKD, 0);
      const tierWinRateSum = tierStatsWithEvents.reduce((sum: number, s) => sum + s.winRate, 0);
      const tierTop3Sum = tierStatsWithEvents.reduce((sum: number, s) => sum + s.top3Finishes, 0);
      
      const tierCount: number = tierStatsWithEvents.length;
      
      const tierSortedTotalEvents = tierStatsWithEvents.map((s) => s.totalGames).sort((a: number, b: number) => a - b);
      const tierSortedAvgPlacement = tierStatsWithEvents.map((s) => s.averagePlacement).sort((a: number, b: number) => a - b);
      const tierSortedAvgScore = tierStatsWithEvents.map((s) => s.averageScore).sort((a: number, b: number) => a - b);
      const tierSortedAvgKD = tierStatsWithEvents.map((s) => s.averageKD).sort((a: number, b: number) => a - b);
      
      perTierStats[tier] = {
        playerCount: tierCount,
        avgTotalEvents: Math.round((tierTotalEvents / tierCount) * 10) / 10,
        avgTotalEliminations: Math.round((tierTotalEliminations / tierCount) * 10) / 10,
        avgAveragePlacement: Math.round((tierAvgPlacementSum / tierCount) * 10) / 10,
        avgAverageScore: Math.round((tierAvgScoreSum / tierCount) * 10) / 10,
        avgAverageKD: Math.round((tierAvgKDSum / tierCount) * 100) / 100,
        avgWinRate: Math.round((tierWinRateSum / tierCount) * 10) / 10,
        avgTop3Finishes: Math.round((tierTop3Sum / tierCount) * 10) / 10,
        medianTotalEvents: Math.round(getMedian(tierSortedTotalEvents) * 10) / 10,
        medianAveragePlacement: Math.round(getMedian(tierSortedAvgPlacement) * 10) / 10,
        medianAverageScore: Math.round(getMedian(tierSortedAvgScore) * 10) / 10,
        medianAverageKD: Math.round(getMedian(tierSortedAvgKD) * 100) / 100,
      };
    }
    
    const statsData = {
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
      perTierStats: {
        S: perTierStats["S"],
        A: perTierStats["A"],
        B: perTierStats["B"],
        C: perTierStats["C"],
        D: perTierStats["D"],
      },
      lastUpdated: Date.now(),
    };
    
    // Delete old cache entry if exists
    const existingCache = await ctx.db.query("aggregateStatsCache").first();
    if (existingCache) {
      await ctx.db.delete(existingCache._id);
    }
    
    // Insert new cache entry
    await ctx.db.insert("aggregateStatsCache", statsData);
    
    console.log("Aggregate stats cache rebuilt successfully");
    
    return { success: true, playerCount: count };
  },
});
