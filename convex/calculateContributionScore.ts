import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";

/**
 * Calculate Team Contribution (TC) for a player from stored match data
 * TC is a 0.00-1.00 metric measuring individual contribution to team performance across ALL matches
 */
export const calculateAndStoreCS = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    // Get player info
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    // Only calculate TC for players with match data flag
    if (!player.hasMatchData) {
      console.log(`Player ${player.discordUsername} does not have match data flag set - skipping TC calculation`);
      return null;
    }

    // Get ALL match stats for this player
    const allMatchStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    if (allMatchStats.length === 0) {
      console.log(`No match stats for player ${player.discordUsername}`);
      return null;
    }

    console.log(`Calculating TC for ${player.discordUsername} over ${allMatchStats.length} matches`);

    // Calculate TC components across all matches
    let killShareSum = 0;
    let top5Placements = 0;
    let earlyDeathCount = 0;
    let clutchScoreSum = 0;
    let validMatches = 0;
    let matchesWithTeammates = 0;

    for (const match of allMatchStats) {
      validMatches++;

      // 1. Kill Share (player kills / team total kills)
      if (match.teamTotalKills > 0) {
        const killShare = match.eliminations / match.teamTotalKills;
        killShareSum += killShare;
      } else {
        killShareSum += 0;
      }

      // 2. Top-5 Rate (placement <= 5)
      if (match.placement <= 5) {
        top5Placements++;
      }

      // Get all teammate stats for the same match AND team (excluding the player)
      const teammateStats = await ctx.db
        .query("matchPlayerStats")
        .withIndex("by_match", (q) =>
          q.eq("importId", match.importId).eq("sessionId", match.sessionId)
        )
        .filter((q) => 
          q.and(
            q.neq(q.field("playerId"), args.playerId),
            q.eq(q.field("teamId"), match.teamId)
          )
        )
        .collect();

      if (teammateStats.length > 0) {
        matchesWithTeammates++;
      }

      // 3. Early Death Rate (did player die before ANY teammates?)
      if (teammateStats.length > 0 && match.deathTime !== undefined) {
        const playerDeathTime = match.deathTime;
        const diedBeforeTeammate = teammateStats.some(
          (t) => t.deathTime !== undefined && playerDeathTime < t.deathTime
        );
        if (diedBeforeTeammate) {
          earlyDeathCount++;
        }
      }

      // 4. Clutch Factor (survival time after teammates die)
      if (teammateStats.length > 0) {
        // Find earliest teammate death time
        const earliestTeammateDeathTime = Math.min(
          ...teammateStats
            .filter((t) => t.deathTime !== undefined)
            .map((t) => t.deathTime as number)
        );
        
        if (earliestTeammateDeathTime !== Infinity) {
          // Calculate time alive after first teammate death
          let timeAliveAfterTeammateDeath = 0;
          if (match.deathTime !== undefined && match.deathTime > earliestTeammateDeathTime) {
            timeAliveAfterTeammateDeath = match.deathTime - earliestTeammateDeathTime;
          } else if (match.deathTime === undefined) {
            // Player survived the match after teammate(s) died (estimate 25min max match = 1500s)
            timeAliveAfterTeammateDeath = 1500 - earliestTeammateDeathTime;
          }

          // Score based on clutch survival (cap at 5 minutes = 1.0)
          const clutchSurvivalScore = Math.min(timeAliveAfterTeammateDeath / 300, 1.0);
          clutchScoreSum += clutchSurvivalScore;
        }
      }
    }

    if (validMatches === 0) {
      console.log(`No valid matches for TC calculation`);
      return null;
    }

    // Calculate final TC components (0.00-1.00 each)
    const avgKillShare = killShareSum / validMatches;
    const top5Rate = top5Placements / validMatches;
    const survivalRate = 1 - earlyDeathCount / validMatches;
    const avgClutchScore = clutchScoreSum / validMatches;

    // Weighted TC (equal 25% share for all components)
    const contributionScore =
      avgKillShare * 0.25 + top5Rate * 0.25 + survivalRate * 0.25 + avgClutchScore * 0.25;

    // Round to 2 decimal places
    const finalTC = Math.round(contributionScore * 100) / 100;

    console.log(`TC for ${player.discordUsername}: ${finalTC}`);
    console.log(`  Kill Share: ${(avgKillShare * 100).toFixed(0)}%`);
    console.log(`  Top-5 Rate: ${(top5Rate * 100).toFixed(0)}%`);
    console.log(`  Survival Rate: ${(survivalRate * 100).toFixed(0)}%`);
    console.log(`  Clutch Score: ${(avgClutchScore * 100).toFixed(0)}%`);
    console.log(`  Matches with teammates: ${matchesWithTeammates}/${validMatches}`);

    // Store TC in player record
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
        lastUpdated: Date.now(),
      },
    });

    return {
      score: finalTC,
      breakdown: {
        killShare: Math.round(avgKillShare * 100) / 100,
        top5Rate: Math.round(top5Rate * 100) / 100,
        survivalRate: Math.round(survivalRate * 100) / 100,
        clutchScore: Math.round(avgClutchScore * 100) / 100,
      },
      matchesAnalyzed: validMatches,
    };
  },
});

/**
 * Get a player's cached CS from their player record
 */
export const getPlayerCS = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    return player?.contributionScore || null;
  },
});

/**
 * Recalculate TC for a specific player by username
 */
export const recalculateCSForPlayer = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args): Promise<{
    username: string;
    tc: number;
    matchesAnalyzed: number;
  }> => {
    // Find player by username (discord or epic)
    const allPlayers = await ctx.db.query("players").collect();
    const player = allPlayers.find(
      (p) =>
        p.discordUsername.toLowerCase() === args.username.toLowerCase() ||
        p.epicUsername.toLowerCase() === args.username.toLowerCase()
    );

    if (!player) {
      throw new Error(`Player not found: ${args.username}`);
    }

    // Check if player has match data flag
    if (!player.hasMatchData) {
      // Check if they have event results but no match stats
      const eventResults = await ctx.db
        .query("eventResults")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      if (eventResults.length > 0) {
        throw new Error(
          `Player ${args.username} has ${eventResults.length} event results but no detailed match data. Run "Backfill Match Stats" to sync match-level data needed for TC calculation.`
        );
      }
      
      throw new Error(`Player ${args.username} has no match data or event results`);
    }

    console.log(`[TC Single] Recalculating TC for ${player.discordUsername}`);

    // Calculate and store TC
    const result: { score: number; matchesAnalyzed: number } | null = await ctx.runMutation(
      internal.calculateContributionScore.calculateAndStoreCSInternal,
      { playerId: player._id }
    );

    if (result === null) {
      throw new Error(`Failed to calculate TC for ${args.username}`);
    }

    console.log(`[TC Single] Success: ${player.discordUsername} - Score: ${result.score}, Matches: ${result.matchesAnalyzed}`);

    return {
      username: player.discordUsername,
      tc: result.score,
      matchesAnalyzed: result.matchesAnalyzed,
    };
  },
});

/**
 * Recalculate CS for all players with match data (processes one at a time)
 */
export const recalculateAllCS = mutation({
  args: {
    forceRecalculate: v.optional(v.boolean()),
    cutoffTimestamp: v.optional(v.number()), // Frontend passes Date.now() from before the loop started
  },
  handler: async (ctx, args) => {
    const FORCE = args.forceRecalculate || false;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // When force-recalculating, use the cutoff timestamp from the frontend
    // so that ALL calls in the same refresh run share the same cutoff.
    // This prevents the loop from re-processing players whose lastUpdated
    // has "expired" past a short rolling window.
    const forceCutoff = args.cutoffTimestamp ?? (Date.now() - 10_000);

    // Get only active players with match data (using indexed queries)
    const activeWithMatch = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.eq(q.field("hasMatchData"), true))
      .collect();
    const undefinedStatusWithMatch = await ctx.db
      .query("players")
      .withIndex("by_status")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), undefined),
          q.eq(q.field("hasMatchData"), true)
        )
      )
      .collect();
    const playersWithMatchData = [...activeWithMatch, ...undefinedStatusWithMatch];

    // Find first player that needs processing
    let playerToProcess: Id<"players"> | null = null;
    
    for (const player of playersWithMatchData) {
      const lastUpdated = player.contributionScore?.lastUpdated || 0;
      const needsProcessing = FORCE
        ? lastUpdated < forceCutoff
        : lastUpdated < oneHourAgo;

      if (needsProcessing) {
        playerToProcess = player._id;
        break; // Found one, process it
      }
    }

    if (!playerToProcess) {
      // No players need processing
      return {
        success: 0,
        failed: 0,
        total: 0,
        remaining: 0,
        totalPlayers: playersWithMatchData.length,
      };
    }

    console.log(`[TC] Processing 1 player out of ${playersWithMatchData.length} total`);

    // Process the one player
    let success = 0;
    let failed = 0;
    
    try {
      const player = await ctx.db.get(playerToProcess);
      console.log(`[TC] Processing ${player?.discordUsername || playerToProcess}`);
      
      const result = await ctx.runMutation(internal.calculateContributionScore.calculateAndStoreCSInternal, {
        playerId: playerToProcess,
      });
      
      if (result === null) {
        console.log(`[TC] No data for ${player?.discordUsername || playerToProcess}`);
        failed = 1;
      } else {
        console.log(`[TC] Success: ${player?.discordUsername || playerToProcess} - Score: ${result.score}`);
        success = 1;
      }
    } catch (error) {
      const player = await ctx.db.get(playerToProcess);
      console.error(`[TC] Failed for ${player?.discordUsername || playerToProcess}:`, error);
      failed = 1;
    }

    // Count remaining players that need processing
    let remainingCount = 0;
    for (const player of playersWithMatchData) {
      if (player._id === playerToProcess) {
        continue; // Skip the one we just processed
      }
      
      const lastUpdated = player.contributionScore?.lastUpdated || 0;
      const needsProcessing = FORCE
        ? lastUpdated < forceCutoff
        : lastUpdated < oneHourAgo;
      
      if (needsProcessing) {
        remainingCount++;
      }
    }

    return {
      success,
      failed,
      total: 1,
      remaining: remainingCount,
      totalPlayers: playersWithMatchData.length,
    };
  },
});

/**
 * Internal mutation for calculating CS (used by recalculateAllCS)
 * OPTIMIZED: Fetches all match data upfront to avoid N+1 query pattern
 */
export const calculateAndStoreCSInternal = internalMutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    // Get player info
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      console.log(`Player ${args.playerId} not found - skipping TC calculation`);
      return null;
    }

    // Only calculate TC for players with match data flag
    if (!player.hasMatchData) {
      console.log(`Player ${player.discordUsername} does not have match data flag set - skipping TC calculation`);
      return null;
    }

    // Get ALL match stats for this player
    const allMatchStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    if (allMatchStats.length === 0) {
      // Mark as processed with no data to prevent infinite loop
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

    // Calculate TC components across all matches
    // Query teammates per-match to avoid hitting document/byte limits
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

      // 1. Kill Share
      if (match.teamTotalKills > 0) {
        killShareSum += match.eliminations / match.teamTotalKills;
      }

      // 2. Top-5 Rate (placement <= 5)
      if (match.placement <= 5) {
        top5Placements++;
      }

      // 3 & 4: Get teammate stats for this specific match
      const teammateStats = await ctx.db
        .query("matchPlayerStats")
        .withIndex("by_match", (q) =>
          q.eq("importId", match.importId).eq("sessionId", match.sessionId)
        )
        .filter((q) => q.neq(q.field("playerId"), args.playerId))
        .collect();

      // 3. Early Death Rate
      if (teammateStats.length > 0 && match.deathTime !== undefined) {
        const playerDeathTime = match.deathTime;
        const diedBeforeTeammate = teammateStats.some(
          (t) => t.deathTime !== undefined && playerDeathTime < t.deathTime
        );
        if (diedBeforeTeammate) {
          earlyDeathCount++;
        }
      }

      // 4. Clutch Factor
      if (teammateStats.length > 0) {
        const earliestTeammateDeathTime = Math.min(
          ...teammateStats
            .filter((t) => t.deathTime !== undefined)
            .map((t) => t.deathTime as number)
        );
        
        if (earliestTeammateDeathTime !== Infinity) {
          let timeAliveAfterTeammateDeath = 0;
          if (match.deathTime !== undefined && match.deathTime > earliestTeammateDeathTime) {
            timeAliveAfterTeammateDeath = match.deathTime - earliestTeammateDeathTime;
          } else if (match.deathTime === undefined) {
            timeAliveAfterTeammateDeath = 1500 - earliestTeammateDeathTime;
          }

          const clutchSurvivalScore = Math.min(timeAliveAfterTeammateDeath / 300, 1.0);
          clutchScoreSum += clutchSurvivalScore;
        }
      }
    }

    if (validMatches === 0) {
      return null;
    }

    // Calculate final TC components
    const avgKillShare = killShareSum / validMatches;
    const top5Rate = top5Placements / validMatches;
    const survivalRate = 1 - earlyDeathCount / validMatches;
    const avgClutchScore = clutchScoreSum / validMatches;

    // Weighted TC (equal 25% share for all components)
    const contributionScore =
      avgKillShare * 0.25 + top5Rate * 0.25 + survivalRate * 0.25 + avgClutchScore * 0.25;
    const finalTC = Math.round(contributionScore * 100) / 100;
    const avgKillsPerMatch = Math.round((totalKills / validMatches) * 100) / 100;
    const avgDeathsPerMatch = Math.round((totalDeaths / validMatches) * 100) / 100;

    // Also compute kills-per-match from thirdPartyResults (same source as player profile)
    // This ensures holistic scores use consistent K/D with player profiles
    const thirdPartyResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    const eventResults = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    const profileTotalElims = thirdPartyResults.reduce((sum, e) => sum + (e.eliminations || 0), 0)
      + eventResults.reduce((sum, e) => sum + e.eliminations, 0);
    const profileTotalMatches = thirdPartyResults.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
    const profileKillsPerMatch = profileTotalMatches > 0
      ? Math.round((profileTotalElims / profileTotalMatches) * 100) / 100
      : avgKillsPerMatch; // fallback to match-level if no thirdPartyResults

    // Store TC in player record
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
