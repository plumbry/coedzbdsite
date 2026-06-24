import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./auth_helpers";
import { logAudit } from "./helpers/audit";
import {
  getManualScoreForPlayer,
  pickCanonicalManualScore,
} from "./helpers/manualScores";
import { scheduleGenderSheetRebuild } from "./helpers/genderSheetSchedule";
import { schedulePublicMemberDirectoryRebuildForPlayer } from "./helpers/publicMemberDirectory";
import { updateTierEvalForPlayerIfEligible } from "./lib/stats/updateTierEvalForPlayer";

// Calculate tier based on total score
function calculateTier(totalScore: number): string {
  if (totalScore >= 1000) return "S";
  if (totalScore >= 850) return "A";
  if (totalScore >= 700) return "B";
  return "C";
}

export const getPlayerScore = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Only admins can view detailed scores
    await requireAdmin(ctx);
    
    const score = await getManualScoreForPlayer(ctx, args.playerId);

    if (!score) return null;
    
    // Default modifiers and seasonPerformance to 0 if not set
    return {
      ...score,
      seasonPerformance: score.seasonPerformance ?? 0,
      modifiers: score.modifiers ?? 0,
    };
  },
});

export const getApplicationScore = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    // Only admins can view detailed scores
    await requireAdmin(ctx);

    const application = await ctx.db.get(args.applicationId);
    if (!application) return null;

    let score = application.playerId
      ? await getManualScoreForPlayer(ctx, application.playerId)
      : null;

    if (!score) {
      const applicationScores = await ctx.db
        .query("manualScores")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect();
      score = pickCanonicalManualScore(applicationScores);
    }

    if (!score) return null;

    // Default modifiers and seasonPerformance to 0 if not set
    return {
      ...score,
      seasonPerformance: score.seasonPerformance ?? 0,
      modifiers: score.modifiers ?? 0,
    };
  },
});

export const getAllPlayerEvaluations = query({
  args: {},
  handler: async (ctx) => {
    // Only admins can export evaluations
    await requireAdmin(ctx);
    
    const scores = await ctx.db.query("manualScores").collect();
    
    // Get player details for each score (including archived players)
    const evaluations = await Promise.all(
      scores.map(async (score) => {
        const player = await ctx.db.get(score.playerId);
        return {
          discordUsername: player?.discordUsername || "Unknown",
          epicUsername: player?.epicUsername || "Unknown",
          discordUserId: player?.discordUserId || "",
          nickname: player?.nickname || "",
          status: player?.status || "active",
          thirdPartyExperience: score.thirdPartyExperience,
          thirdPartyPerformance: score.thirdPartyPerformance,
          inGameTourneyPerformance: score.inGameTourneyPerformance,
          officialEarnings: score.officialEarnings,
          rankedPerformance: score.rankedPerformance,
          hoursPlayed: score.hoursPlayed,
          notorietyTeammates: score.notorietyTeammates,
          age: score.age,
          gender: score.gender,
          ability: score.ability,
          region: score.region,
          gameSense: score.gameSense,
          seasonPerformance: score.seasonPerformance ?? 0,
          modifiers: score.modifiers ?? 0,
          totalScore: score.totalScore,
          tier: score.tier,
        };
      })
    );
    
    return evaluations;
  },
});

// Lightweight batch query for exports - returns all scores in a single read
export const getAllScoresMap = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    
    const allScores = await ctx.db.query("manualScores").collect();
    
    // Return as array - the action will build a lookup map
    return allScores.map((score) => ({
      playerId: score.playerId,
      thirdPartyExperience: score.thirdPartyExperience,
      thirdPartyPerformance: score.thirdPartyPerformance,
      inGameTourneyPerformance: score.inGameTourneyPerformance,
      officialEarnings: score.officialEarnings,
      rankedPerformance: score.rankedPerformance,
      hoursPlayed: score.hoursPlayed,
      notorietyTeammates: score.notorietyTeammates,
      age: score.age,
      gender: score.gender,
      ability: score.ability,
      region: score.region,
      gameSense: score.gameSense,
      seasonPerformance: score.seasonPerformance ?? 0,
      modifiers: score.modifiers ?? 0,
      totalScore: score.totalScore,
      tier: score.tier,
    }));
  },
});

export const createOrUpdateScore = mutation({
  args: {
    playerId: v.id("players"),
    applicationId: v.optional(v.id("applications")),
    thirdPartyExperience: v.number(),
    thirdPartyPerformance: v.number(),
    inGameTourneyPerformance: v.number(),
    officialEarnings: v.number(),
    rankedPerformance: v.number(),
    hoursPlayed: v.number(),
    notorietyTeammates: v.number(),
    age: v.number(),
    gender: v.number(),
    ability: v.number(),
    region: v.number(),
    gameSense: v.number(),
    seasonPerformance: v.number(),
    modifiers: v.number(),
    femaleVerified: v.optional(v.boolean()),
    verificationMethod: v.optional(v.union(
      v.literal("ID"),
      v.literal("FACECAM"),
      v.literal("TRUSTED SERVER")
    )),
  },
  handler: async (ctx, args) => {
    // Only admins can create or update scores
    const user = await requireAdmin(ctx);
    
    // Validate scores are between 0-100 (except officialEarnings and modifiers)
    const regularScores = [
      args.thirdPartyExperience,
      args.thirdPartyPerformance,
      args.inGameTourneyPerformance,
      args.rankedPerformance,
      args.hoursPlayed,
      args.notorietyTeammates,
      args.age,
      args.gender,
      args.ability,
      args.region,
      args.gameSense,
      args.seasonPerformance,
    ];
    
    for (const score of regularScores) {
      if (score < 0 || score > 100) {
        throw new ConvexError({
          message: "All category scores must be between 0 and 100",
          code: "BAD_REQUEST",
        });
      }
    }
    
    // Validate official earnings separately (no maximum, only >= 0)
    if (args.officialEarnings < 0) {
      throw new ConvexError({
        message: "Official earnings must be 0 or greater",
        code: "BAD_REQUEST",
      });
    }
    
    // Validate modifiers separately (no maximum, only >= 0)
    if (args.modifiers < 0) {
      throw new ConvexError({
        message: "Modifiers must be 0 or greater",
        code: "BAD_REQUEST",
      });
    }
    
    const scores = [...regularScores, args.officialEarnings, args.modifiers];
    
    // Calculate total score
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const tier = calculateTier(totalScore);
    
    // Get current player info (before updating)
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    const playerName = player.discordUsername || "Unknown Player";
    const previousTier = player.tier;
    
    let existingScore = await getManualScoreForPlayer(ctx, args.playerId);

    if (!existingScore && args.applicationId) {
      const applicationScores = await ctx.db
        .query("manualScores")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect();
      existingScore = pickCanonicalManualScore(applicationScores);
    }
    
    const isUpdate = !!existingScore;
    
    if (existingScore) {
      // Update existing score
      await ctx.db.patch(existingScore._id, {
        playerId: args.playerId,
        applicationId: args.applicationId,
        thirdPartyExperience: args.thirdPartyExperience,
        thirdPartyPerformance: args.thirdPartyPerformance,
        inGameTourneyPerformance: args.inGameTourneyPerformance,
        officialEarnings: args.officialEarnings,
        rankedPerformance: args.rankedPerformance,
        hoursPlayed: args.hoursPlayed,
        notorietyTeammates: args.notorietyTeammates,
        age: args.age,
        gender: args.gender,
        ability: args.ability,
        region: args.region,
        gameSense: args.gameSense,
        seasonPerformance: args.seasonPerformance,
        modifiers: args.modifiers,
        femaleVerified: args.femaleVerified,
        verificationMethod: args.verificationMethod,
        totalScore,
        tier,
        evaluatedBy: user._id,
      });
    } else {
      // Create new score
      await ctx.db.insert("manualScores", {
        playerId: args.playerId,
        applicationId: args.applicationId,
        thirdPartyExperience: args.thirdPartyExperience,
        thirdPartyPerformance: args.thirdPartyPerformance,
        inGameTourneyPerformance: args.inGameTourneyPerformance,
        officialEarnings: args.officialEarnings,
        rankedPerformance: args.rankedPerformance,
        hoursPlayed: args.hoursPlayed,
        notorietyTeammates: args.notorietyTeammates,
        age: args.age,
        gender: args.gender,
        ability: args.ability,
        region: args.region,
        gameSense: args.gameSense,
        seasonPerformance: args.seasonPerformance,
        modifiers: args.modifiers,
        femaleVerified: args.femaleVerified,
        verificationMethod: args.verificationMethod,
        totalScore,
        tier,
        evaluatedBy: user._id,
      });
    }
    
    // Update player's total score, tier, and denormalized public directory gender
    await ctx.db.patch(args.playerId, {
      totalScore,
      tier,
      gender: args.gender,
    });
    
    // If tier changed, create history record
    if (previousTier && previousTier !== tier) {
      await ctx.db.insert("tierHistory", {
        playerId: args.playerId,
        tier,
        previousTier,
        totalScore,
        changedBy: user._id,
      });
    } else if (!previousTier) {
      // First time getting a tier
      await ctx.db.insert("tierHistory", {
        playerId: args.playerId,
        tier,
        totalScore,
        changedBy: user._id,
      });
    }
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: user.name || user.email,
      action: isUpdate ? "score_updated" : "score_created",
      entityType: "player",
      entityId: args.playerId,
      details: `${isUpdate ? "Updated" : "Created"} evaluation for ${playerName}: Total ${totalScore}/1900, Tier ${tier}`,
      previousValue: existingScore ? `${existingScore.totalScore}/1900, Tier ${existingScore.tier}` : undefined,
      newValue: `${totalScore}/1900, Tier ${tier}`,
    });

    await ctx.scheduler.runAfter(0, internal.scores.syncTierEvalAfterEvaluation, {
      playerId: args.playerId,
    });

    await schedulePublicMemberDirectoryRebuildForPlayer(ctx, {
      currentMembershipStatus: player.currentMembershipStatus,
      isAlt: player.isAlt,
    });

    await scheduleGenderSheetRebuild(ctx);

    return { totalScore, tier };
  },
});

/** After a manual evaluation save — update tier re-eval for this player only. */
export const syncTierEvalAfterEvaluation = internalMutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return await updateTierEvalForPlayerIfEligible(ctx, args.playerId);
  },
});
