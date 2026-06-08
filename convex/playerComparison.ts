import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { sortByTier } from "./helpers/tierSort";
import { computeInternalPlayerStats } from "./lib/stats/computeInternalPlayerStats";
import { getPlayerDcaCpm } from "./lib/stats/holisticScore";

// Get comprehensive player data for comparison
export const getPlayerComparisonData = query({
  args: {
    playerIds: v.array(v.id("players")),
    applyTcdcToHolistic: v.optional(v.boolean()),
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

    const applyTcdcToHolistic = args.applyTcdcToHolistic !== false;

    // Get all players for teammate tier lookups
    const allPlayers = await ctx.db.query("players").collect();

    // Fetch all requested players
    const playersData = await Promise.all(
      args.playerIds.map(async (playerId) => {
        const player = await ctx.db.get(playerId);
        if (!player) return null;

        const topFiveCache = player.topFiveCache;
        const recentTop5Count = topFiveCache?.recentTop5Count ?? 0;
        const recentTop3Count = topFiveCache?.recentTop3Count ?? 0;
        const lastEventDate = player.lastEventDate ?? null;

        const internal = await computeInternalPlayerStats(ctx, playerId);
        const tierCache = await ctx.db
          .query("tierReEvaluationCache")
          .withIndex("by_player", (q) => q.eq("playerId", playerId))
          .first();

        const { dca, cpm } = getPlayerDcaCpm(player);
        const cs =
          player.contributionScore?.score !== undefined
            ? player.contributionScore.score
            : null;
        const consistentDuoEpic = player.dcaCache?.consistentDuoEpic ?? null;

        const rawHolisticScore =
          tierCache?.rawHolisticScore ?? tierCache?.holisticScore ?? null;
        const adjustedHolisticScore = tierCache?.holisticScore ?? null;
        const displayHolisticScore = applyTcdcToHolistic
          ? adjustedHolisticScore
          : rawHolisticScore;

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
          
          totalEvents: internal.eventsPlayed,
          totalMatches: internal.totalMatches,
          matchWins: internal.matchWins,
          avgPlacement: internal.averagePlacement,
          avgTeamEliminations: internal.killsPerMatch,
          deathsPerMatch: internal.deathsPerMatch,
          averageKd: internal.averageKd,
          totalTeamEliminations: internal.totalEliminations,
          winRate: internal.winRate,
          topThreeCount: internal.top3Finishes,
          rawHolisticScore,
          adjustedHolisticScore,
          holisticScore: displayHolisticScore,
          holisticVsSameTier: tierCache?.holisticVsSameTier ?? null,
          dca,
          cs,
          cpm,
          consistentDuoEpic,

          contributionScore: player.contributionScore?.score || 0,
          duoPartner: player.contributionScore?.duoPartner || null,
          
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

    const rows = allPlayers.map((player) => ({
      _id: player._id,
      playerName: player.nickname || player.discordUsername,
      tier: player.tier || "Unranked",
      status: player.status || "active",
    }));

    return sortByTier(rows, (p) => (p.tier === "Unranked" ? undefined : p.tier), (a, b) =>
      a.playerName.localeCompare(b.playerName),
    );
  },
});
