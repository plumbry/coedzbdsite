import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

/** Read cached Team Contribution score for a player. */
export const getPlayerCS = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const player = await ctx.db.get(args.playerId);
    return player?.contributionScore || null;
  },
});

/**
 * Production TC path — used by playerStatsRebuild and match sync.
 * TC is a 0.00-1.00 metric measuring individual contribution across all matches.
 */
export const calculateAndStoreCSInternal = internalMutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      console.log(`Player ${args.playerId} not found - skipping TC calculation`);
      return null;
    }

    if (!player.hasMatchData) {
      console.log(
        `Player ${player.discordUsername} does not have match data flag set - skipping TC calculation`,
      );
      return null;
    }

    const allMatchStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    if (allMatchStats.length === 0) {
      await ctx.db.patch(args.playerId, {
        contributionScore: {
          score: 0,
          breakdown: {
            killShare: 0,
            top5Rate: 0,
            survivalRate: 0,
            clutchScore: 0,
          },
          matchesAnalyzed: 0,
          lastUpdated: Date.now(),
        },
      });
      return null;
    }

    let killShareSum = 0;
    let top5Placements = 0;
    let earlyDeathCount = 0;
    let clutchScoreSum = 0;
    let totalKills = 0;
    let totalDeaths = 0;
    let validMatches = 0;

    for (const match of allMatchStats) {
      validMatches++;
      totalKills += match.eliminations;
      totalDeaths += match.deaths;

      if (match.teamTotalKills > 0) {
        killShareSum += match.eliminations / match.teamTotalKills;
      }

      if (match.placement <= 5) {
        top5Placements++;
      }

      const teammateStats = await ctx.db
        .query("matchPlayerStats")
        .withIndex("by_match", (q) =>
          q.eq("importId", match.importId).eq("sessionId", match.sessionId),
        )
        .filter((q) => q.neq(q.field("playerId"), args.playerId))
        .collect();

      if (teammateStats.length > 0 && match.deathTime !== undefined) {
        const playerDeathTime = match.deathTime;
        const diedBeforeTeammate = teammateStats.some(
          (t) => t.deathTime !== undefined && playerDeathTime < t.deathTime,
        );
        if (diedBeforeTeammate) {
          earlyDeathCount++;
        }
      }

      if (teammateStats.length > 0) {
        const earliestTeammateDeathTime = Math.min(
          ...teammateStats
            .filter((t) => t.deathTime !== undefined)
            .map((t) => t.deathTime as number),
        );

        if (earliestTeammateDeathTime !== Infinity) {
          let timeAliveAfterTeammateDeath = 0;
          if (
            match.deathTime !== undefined &&
            match.deathTime > earliestTeammateDeathTime
          ) {
            timeAliveAfterTeammateDeath =
              match.deathTime - earliestTeammateDeathTime;
          } else if (match.deathTime === undefined) {
            timeAliveAfterTeammateDeath = 1500 - earliestTeammateDeathTime;
          }

          const clutchSurvivalScore = Math.min(
            timeAliveAfterTeammateDeath / 300,
            1.0,
          );
          clutchScoreSum += clutchSurvivalScore;
        }
      }
    }

    if (validMatches === 0) {
      return null;
    }

    const avgKillShare = killShareSum / validMatches;
    const top5Rate = top5Placements / validMatches;
    const survivalRate = 1 - earlyDeathCount / validMatches;
    const avgClutchScore = clutchScoreSum / validMatches;

    const contributionScore =
      avgKillShare * 0.25 +
      top5Rate * 0.25 +
      survivalRate * 0.25 +
      avgClutchScore * 0.25;
    const finalTC = Math.round(contributionScore * 100) / 100;
    const avgKillsPerMatch = Math.round((totalKills / validMatches) * 100) / 100;
    const avgDeathsPerMatch = Math.round((totalDeaths / validMatches) * 100) / 100;

    const thirdPartyResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    const eventResults = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    const profileTotalElims =
      thirdPartyResults.reduce((sum, e) => sum + (e.eliminations || 0), 0) +
      eventResults.reduce((sum, e) => sum + e.eliminations, 0);
    const profileTotalMatches = thirdPartyResults.reduce(
      (sum, e) => sum + (e.matchesPlayed || 0),
      0,
    );
    const profileKillsPerMatch =
      profileTotalMatches > 0
        ? Math.round((profileTotalElims / profileTotalMatches) * 100) / 100
        : avgKillsPerMatch;

    await ctx.db.patch(args.playerId, {
      contributionScore: {
        score: finalTC,
        breakdown: {
          killShare: Math.round(avgKillShare * 100) / 100,
          top5Rate: Math.round(top5Rate * 100) / 100,
          survivalRate: Math.round(survivalRate * 100) / 100,
          clutchScore: Math.round(avgClutchScore * 100) / 100,
        },
        matchesAnalyzed: validMatches,
        averageKillsPerMatch: avgKillsPerMatch,
        averageDeathsPerMatch: avgDeathsPerMatch,
        profileKillsPerMatch,
        lastUpdated: Date.now(),
      },
    });

    return {
      score: finalTC,
      matchesAnalyzed: validMatches,
    };
  },
});
