import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

// Count match stats for a player
export const countPlayerMatchStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const matchStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    return matchStats.length;
  },
});

// Get all match player stats (for diagnostics)
export const getAllMatchPlayerStats = query({
  args: {},
  handler: async (ctx) => {
    const matchStats = await ctx.db
      .query("matchPlayerStats")
      .collect();
    return matchStats;
  },
});

// Get recent Yunite imports with summary statistics
export const getRecentYuniteImports = query({
  args: {},
  handler: async (ctx) => {
    const imports = await ctx.db
      .query("thirdPartyImports")
      .filter((q) => q.eq(q.field("importMethod"), "api"))
      .order("desc")
      .take(20);
    
    return imports;
  },
});

// Get detailed tournament data for a specific import
export const getTournamentDetails = query({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      return null;
    }
    
    // Get all results for this tournament
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    // Get matched players with their database info
    const matchedResults = [];
    const unmatchedResults = [];
    
    for (const result of results) {
      if (result.matched && result.playerId) {
        const player = await ctx.db.get(result.playerId);
        matchedResults.push({
          ...result,
          playerName: player?.discordUsername || "Unknown",
          playerTier: player?.tier,
        });
      } else {
        unmatchedResults.push(result);
      }
    }
    
    // Sort by placement
    matchedResults.sort((a, b) => a.placement - b.placement);
    unmatchedResults.sort((a, b) => a.placement - b.placement);
    
    // Calculate total eliminations
    // If match data has been synced, use the totalMatchKills (sum from all matches)
    // Otherwise, fall back to aggregate team kills from leaderboard
    let totalEliminations: number;
    if (importRecord.totalMatchKills !== undefined) {
      totalEliminations = importRecord.totalMatchKills;
    } else {
      // Fallback: Calculate from leaderboard data (dedupe by team)
      const teamKillsMap = new Map<string, number>();
      for (const result of results) {
        const teamId = result.teamId || result.teamName || `unknown-${result.placement}`;
        if (!teamKillsMap.has(teamId)) {
          teamKillsMap.set(teamId, result.teamKills || 0);
        }
      }
      totalEliminations = Array.from(teamKillsMap.values()).reduce((sum, kills) => sum + kills, 0);
    }
    
    // Calculate tier breakdown from matched players
    const tierCounts = {
      S: 0,
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      Unranked: 0,
    };
    
    for (const result of matchedResults) {
      const tier = result.playerTier || "Unranked";
      if (tier in tierCounts) {
        tierCounts[tier as keyof typeof tierCounts]++;
      } else {
        tierCounts.Unranked++;
      }
    }
    
    return {
      import: importRecord,
      matchedResults,
      unmatchedResults,
      stats: {
        totalPlayers: results.length,
        matched: matchedResults.length,
        unmatched: unmatchedResults.length,
        totalEliminations,
        averagePlacement: results.reduce((sum, r) => sum + r.placement, 0) / results.length,
        tierCounts,
      },
    };
  },
});

function isYuniteImportSource(source: string, importMethod?: string) {
  const normalized = source.trim().toLowerCase();
  return (
    normalized === "yunite" ||
    normalized === "yunite api" ||
    importMethod === "api"
  );
}

async function computeImportEliminationTotals(
  ctx: QueryCtx,
  importRecord: Pick<Doc<"thirdPartyImports">, "_id" | "totalMatchKills" | "totalPlayers">,
) {
  if (importRecord.totalMatchKills !== undefined) {
    return {
      totalEliminations: importRecord.totalMatchKills,
      averageEliminations: 0,
      totalPlayers: importRecord.totalPlayers,
    };
  }

  const results = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_import", (q) => q.eq("importId", importRecord._id))
    .collect();

  const teamKillsMap = new Map<string, number>();
  for (const result of results) {
    const teamId = result.teamId || result.teamName || `unknown-${result.placement}`;
    if (!teamKillsMap.has(teamId)) {
      teamKillsMap.set(teamId, result.teamKills || 0);
    }
  }
  const totalEliminations = Array.from(teamKillsMap.values()).reduce(
    (sum, kills) => sum + kills,
    0,
  );
  const teamCount = new Set(
    results.map((r) => r.teamId || r.teamName || `unknown-${r.placement}`),
  ).size;

  return {
    totalEliminations,
    averageEliminations: teamCount > 0 ? totalEliminations / teamCount : 0,
    totalPlayers: results.length,
  };
}

// Slim list for admin Yunite dashboard (no per-import result scans when cached).
export const getYuniteImportSummaries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200);
    const imports = await ctx.db
      .query("thirdPartyImports")
      .order("desc")
      .take(limit * 2);

    const summaries = [];
    for (const importRecord of imports) {
      if (!isYuniteImportSource(importRecord.source, importRecord.importMethod)) {
        continue;
      }

      let totalEliminations = importRecord.totalMatchKills ?? 0;
      if (importRecord.totalMatchKills === undefined) {
        const computed = await computeImportEliminationTotals(ctx, importRecord);
        totalEliminations = computed.totalEliminations;
      }

      summaries.push({
        _id: importRecord._id,
        eventName: importRecord.eventName,
        eventDate: importRecord.eventDate,
        source: importRecord.source,
        leaderboardUrl: importRecord.leaderboardUrl,
        leaderboardId: importRecord.leaderboardId,
        playersMatched: importRecord.playersMatched,
        playersUnmatched: importRecord.playersUnmatched,
        totalPlayers: importRecord.totalPlayers,
        matchDataSynced: importRecord.matchDataSynced,
        totalEliminations,
      });

      if (summaries.length >= limit) break;
    }

    return summaries;
  },
});

// Get all Yunite tournaments with their raw data
export const getAllYuniteTournaments = query({
  args: {},
  handler: async (ctx) => {
    const imports = await ctx.db
      .query("thirdPartyImports")
      .order("desc")
      .take(200);

    const yuniteImports = imports.filter((importRecord) =>
      isYuniteImportSource(importRecord.source, importRecord.importMethod),
    );

    const tournamentsWithStats = [];

    for (const importRecord of yuniteImports) {
      const computed = await computeImportEliminationTotals(ctx, importRecord);

      tournamentsWithStats.push({
        ...importRecord,
        totalEliminations: computed.totalEliminations,
        averageEliminations: computed.averageEliminations,
        totalPlayers: computed.totalPlayers,
      });
    }

    return tournamentsWithStats;
  },
});

// Get player-specific Yunite performance across all tournaments
export const getPlayerYunitePerformance = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .filter((q) => q.eq(q.field("source"), "Yunite"))
      .collect();
    
    if (results.length === 0) {
      return null;
    }
    
    const totalDamage = results.reduce((sum, r) => sum + (r.damage || 0), 0);
    const totalEliminations = results.reduce((sum, r) => sum + (r.eliminations || 0), 0);
    const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
    const averagePlacement = results.reduce((sum, r) => sum + r.placement, 0) / results.length;
    
    return {
      tournamentsPlayed: results.length,
      totalDamage,
      totalEliminations,
      totalPoints,
      averageDamage: totalDamage / results.length,
      averageEliminations: totalEliminations / results.length,
      averagePlacement,
      averagePoints: totalPoints / results.length,
      tournaments: results.map(r => ({
        eventName: r.eventName,
        placement: r.placement,
        points: r.points,
        eliminations: r.eliminations,
        damage: r.damage,
        date: r._creationTime,
      })).sort((a, b) => b.date - a.date),
    };
  },
});

// Debug: Check teamId groupings for an import
export const debugTeamIdGroupings = query({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    // Group by teamId to see what's being grouped together
    const teamGroups = new Map<string, typeof results>();
    
    for (const result of results) {
      const key = result.teamId || "NO_TEAM_ID";
      if (!teamGroups.has(key)) {
        teamGroups.set(key, []);
      }
      teamGroups.get(key)!.push(result);
    }
    
    // Format for display
    const groupings = Array.from(teamGroups.entries()).map(([teamId, members]) => ({
      teamId,
      memberCount: members.length,
      placement: members[0].placement,
      points: members[0].points,
      members: members.map(m => ({
        epicUsername: m.epicUsername,
        discordUsername: m.discordUsername,
        teamName: m.teamName,
      })),
    })).sort((a, b) => a.placement - b.placement);
    
    return {
      totalResults: results.length,
      uniqueTeamIds: teamGroups.size,
      groupings,
    };
  },
});
