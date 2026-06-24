import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireAdmin } from "../auth_helpers";
import { getDisplayName } from "../auth_helpers";
import {
  FINAL_DECISIONS,
  TRACKER_STATUSES,
  type FinalDecision,
} from "./constants";
import {
  writeReEvalAudit,
  ensureAllActivePlayersEnrolled,
  syncDashboardCacheForReEval,
} from "./helpers";
import { updateTierEvalForPlayerIfEligible } from "../lib/stats/updateTierEvalForPlayer";
import { updateStatsForPlayer } from "../lib/stats/updatePlayerStatsCache";

export const ensureActivePlayersEnrolledInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return ensureAllActivePlayersEnrolled(ctx);
  },
});

export const syncEnrolledPlayers = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ensureAllActivePlayersEnrolled(ctx);
  },
});

export const initializeForActivePlayers = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const result = await ensureAllActivePlayersEnrolled(ctx);
    return { created: result.created };
  },
});

const trackerStatusValidator = v.union(
  ...TRACKER_STATUSES.map((s) => v.literal(s)),
);
const finalDecisionValidator = v.union(
  ...FINAL_DECISIONS.map((s) => v.literal(s)),
);
const summerScoreArgs = {
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
};

const TIER_ORDER = ["S", "A", "B", "C"];
const WORKFLOW_STATE_KEY = "summer_reeval";

function calculateTierFromScore(totalScore: number): FinalDecision {
  if (totalScore >= 1000) return "S";
  if (totalScore >= 850) return "A";
  if (totalScore >= 700) return "B";
  return "C";
}

async function upsertLiveManualScore(
  ctx: Parameters<typeof writeReEvalAudit>[0],
  playerId: Id<"players">,
  score: NonNullable<Doc<"bigSummerReEval">["summerScore"]>,
  tier: string,
  evaluatedBy: Id<"users">,
) {
  const patch = {
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
    seasonPerformance: score.seasonPerformance,
    modifiers: score.modifiers,
    totalScore: score.totalScore,
    tier,
    evaluatedBy,
  };

  const existingScore = await ctx.db
    .query("manualScores")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();

  if (existingScore) {
    await ctx.db.patch(existingScore._id, patch);
  } else {
    await ctx.db.insert("manualScores", {
      playerId,
      ...patch,
    });
  }
}

function decisionFromEvaluation(
  evaluationStatus: string,
  currentTier: string | undefined,
): { finalDecision: FinalDecision; targetTier?: string } {
  const tierIndex = currentTier ? TIER_ORDER.indexOf(currentTier) : -1;

  if (
    (evaluationStatus === "Strong Promotion Outlier" ||
      evaluationStatus === "Eligible for Promotion Evaluation") &&
    tierIndex > 0
  ) {
    const targetTier = TIER_ORDER[tierIndex - 1];
    return { finalDecision: targetTier as FinalDecision, targetTier };
  }

  if (
    (evaluationStatus === "Strong Demotion Outlier" ||
      evaluationStatus === "Eligible for Demotion Evaluation") &&
    tierIndex >= 0 &&
    tierIndex < TIER_ORDER.length - 1
  ) {
    const targetTier = TIER_ORDER[tierIndex + 1];
    return { finalDecision: targetTier as FinalDecision, targetTier };
  }

  return { finalDecision: "no_change" };
}

async function patchReEval(
  ctx: Parameters<typeof writeReEvalAudit>[0],
  reEvalId: Parameters<typeof writeReEvalAudit>[1]["reEvalId"] & {},
  playerId: Parameters<typeof writeReEvalAudit>[1]["playerId"],
  admin: Awaited<ReturnType<typeof requireAdmin>>,
  patch: Record<string, unknown>,
  audit: { action: string; previousValue?: string; newValue?: string },
) {
  const existing = await ctx.db.get(reEvalId);
  if (!existing) throw new Error("Re-eval record not found");
  await ctx.db.patch(reEvalId, { ...patch, lastUpdatedAt: Date.now() });
  await syncDashboardCacheForReEval(ctx, reEvalId);
  await writeReEvalAudit(ctx, {
    userId: admin._id,
    userName: getDisplayName(admin),
    action: audit.action,
    playerId,
    reEvalId,
    previousValue: audit.previousValue,
    newValue: audit.newValue,
  });
}

async function upsertWorkflowState(
  ctx: Parameters<typeof writeReEvalAudit>[0],
  patch: {
    stage: "first_stage" | "final_review" | "completed";
    firstStageCompletedAt?: number;
    firstStageCompletedBy?: Parameters<typeof writeReEvalAudit>[1]["userId"];
    completedAt?: number;
    completedBy?: Parameters<typeof writeReEvalAudit>[1]["userId"];
  },
) {
  const existing = await ctx.db
    .query("bigSummerReEvalState")
    .withIndex("by_key", (q) => q.eq("key", WORKFLOW_STATE_KEY))
    .first();
  const next = {
    key: WORKFLOW_STATE_KEY,
    ...patch,
    lastUpdatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch(existing._id, next);
    return existing._id;
  }
  return await ctx.db.insert("bigSummerReEvalState", next);
}

export const completeFirstStage = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    await upsertWorkflowState(ctx, {
      stage: "final_review",
      firstStageCompletedAt: now,
      firstStageCompletedBy: admin._id,
    });
    await writeReEvalAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "big_summer_reeval_first_stage_completed",
      newValue: "final_review",
    });
    return { stage: "final_review" as const };
  },
});

export const completeReEval = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const reEvalRows = await ctx.db.query("bigSummerReEval").collect();

    let updated = 0;
    let flaggedForTierRemoval = 0;
    let skipped = 0;
    for (const reEval of reEvalRows) {
      const player = await ctx.db.get(reEval.playerId);
      if (!player || player.status !== "active" || player.currentMembershipStatus !== "accepted") {
        skipped += 1;
        continue;
      }

      if (reEval.reEvalStatus === "private_tracker" || reEval.trackerStatus === "private") {
        await ctx.db.patch(reEval._id, {
          reEvalStatus: "tier_removal_flagged",
          finalDecision: "remove_access",
          appliedAt: now,
          appliedTier: undefined,
          lastUpdatedAt: now,
        });
        await syncDashboardCacheForReEval(ctx, reEval._id);
        flaggedForTierRemoval += 1;
        continue;
      }

      if (!reEval.finalDecision) {
        skipped += 1;
        continue;
      }

      const targetTier =
        reEval.finalDecision === "no_change"
          ? player.tier
          : TIER_ORDER.includes(reEval.finalDecision)
            ? reEval.finalDecision
            : undefined;
      if (!targetTier || !reEval.summerScore) {
        skipped += 1;
        continue;
      }

      const totalScore = reEval.summerScore.totalScore;
      const tierChanged = player.tier !== targetTier;

      await upsertLiveManualScore(ctx, player._id, reEval.summerScore, targetTier, admin._id);

      await ctx.db.patch(player._id, {
        tier: targetTier,
        totalScore,
        gender: reEval.summerScore.gender,
      });
      if (tierChanged) {
        await ctx.db.insert("tierHistory", {
          playerId: player._id,
          tier: targetTier,
          previousTier: player.tier,
          totalScore,
          changedBy: admin._id,
        });
      }
      await ctx.db.patch(reEval._id, {
        reEvalStatus: "tier_change_complete",
        appliedAt: now,
        appliedTier: targetTier,
        lastUpdatedAt: now,
      });
      await syncDashboardCacheForReEval(ctx, reEval._id);
      updated += 1;
    }

    await upsertWorkflowState(ctx, {
      stage: "completed",
      completedAt: now,
      completedBy: admin._id,
    });
    await writeReEvalAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "big_summer_reeval_completed",
      newValue: JSON.stringify({ updated, flaggedForTierRemoval, skipped }),
    });
    return { updated, flaggedForTierRemoval, skipped, stage: "completed" as const };
  },
});

export const updateTrackerLink = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    fortniteTrackerLink: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");

    await patchReEval(
      ctx,
      reEval._id,
      reEval.playerId,
      admin,
      { fortniteTrackerLink: args.fortniteTrackerLink },
      {
        action: "big_summer_reeval_tracker_link_updated",
        previousValue: reEval.fortniteTrackerLink,
        newValue: args.fortniteTrackerLink,
      },
    );
  },
});

export const setTrackerStatus = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    trackerStatus: trackerStatusValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");

    await patchReEval(ctx, reEval._id, reEval.playerId, admin, { trackerStatus: args.trackerStatus }, {
      action: "big_summer_reeval_tracker_status_changed",
      previousValue: reEval.trackerStatus,
      newValue: args.trackerStatus,
    });
  },
});

export const markPrivateTracker = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");

    await patchReEval(ctx, reEval._id, reEval.playerId, admin, {
      trackerStatus: "private",
      reEvalStatus: "private_tracker",
      assignedAdminId: admin._id,
      assignedAdminName: getDisplayName(admin),
      finalDecision: undefined,
      evaluationStatus: undefined,
      evaluationStatusRaw: undefined,
      evaluationTargetTier: undefined,
      evaluatedAt: undefined,
    }, {
      action: "big_summer_reeval_private_tracker",
      previousValue: reEval.reEvalStatus,
      newValue: "private_tracker",
    });
  },
});

export const reEvaluatePlayer = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    const player = await ctx.db.get(reEval.playerId);
    if (!player) throw new Error("Player not found");

    await updateStatsForPlayer(ctx, player._id);
    const result = await updateTierEvalForPlayerIfEligible(ctx, player._id);
    if (!result.tierEvalUpdated) {
      const finalDecision: FinalDecision = "no_change";
      await patchReEval(ctx, reEval._id, player._id, admin, {
        trackerStatus: "public",
        reEvalStatus: "ready_to_review",
        finalDecision: undefined,
        evaluationStatus: result.reason === "below_reevaluation_threshold"
          ? "Insufficient Data"
          : "Unable to Evaluate",
        evaluationStatusRaw: undefined,
        evaluationTargetTier: undefined,
        evaluatedAt: Date.now(),
      }, {
        action: "big_summer_reeval_player_re_evaluated",
        previousValue: reEval.finalDecision,
        newValue: result.reason ?? "unable_to_evaluate",
      });
      return {
        finalDecision,
        evaluationStatus: result.reason === "below_reevaluation_threshold"
          ? "Insufficient Data"
          : "Unable to Evaluate",
        reason: result.reason,
      };
    }

    const evaluation = await ctx.db
      .query("tierReEvaluationCache")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .first();
    if (!evaluation) {
      throw new Error("Re-evaluation cache row was not created for this player");
    }

    const { finalDecision, targetTier } = decisionFromEvaluation(
      evaluation.evaluationStatus,
      player.tier,
    );

    await patchReEval(ctx, reEval._id, player._id, admin, {
      trackerStatus: "public",
      reEvalStatus: "ready_to_review",
      finalDecision: undefined,
      evaluationStatus: evaluation.evaluationStatus,
      evaluationStatusRaw: evaluation.evaluationStatusRaw,
      evaluationTargetTier: targetTier,
      evaluatedAt: Date.now(),
    }, {
      action: "big_summer_reeval_player_re_evaluated",
      previousValue: reEval.finalDecision,
      newValue: evaluation.evaluationStatus,
    });

    return {
      finalDecision,
      evaluationStatus: evaluation.evaluationStatus,
      targetTier,
    };
  },
});

export const saveSummerEvaluationScore = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    ...summerScoreArgs,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");

    const totalScore =
      args.thirdPartyExperience +
      args.thirdPartyPerformance +
      args.inGameTourneyPerformance +
      args.officialEarnings +
      args.rankedPerformance +
      args.hoursPlayed +
      args.notorietyTeammates +
      args.age +
      args.gender +
      args.ability +
      args.region +
      args.gameSense +
      args.seasonPerformance +
      args.modifiers;
    const tier = calculateTierFromScore(totalScore);
    const { reEvalId: _reEvalId, ...scoreFields } = args;

    await patchReEval(ctx, reEval._id, reEval.playerId, admin, {
      trackerStatus: "public",
      reEvalStatus: "ready_to_review",
      assignedAdminId: admin._id,
      assignedAdminName: getDisplayName(admin),
      finalDecision: tier,
      evaluationStatus: "Manual Summer Evaluation",
      evaluationStatusRaw: undefined,
      evaluationTargetTier: tier,
      evaluatedAt: Date.now(),
      summerScore: {
        ...scoreFields,
        totalScore,
        tier,
      },
    }, {
      action: "big_summer_reeval_manual_score_saved",
      previousValue: reEval.finalDecision,
      newValue: `${tier}:${totalScore}`,
    });

    return { tier, totalScore };
  },
});

export const assignAdmin = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    assignedAdminId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");

    let assignedAdminName: string | undefined;
    if (args.assignedAdminId) {
      const assigned = await ctx.db.get(args.assignedAdminId);
      assignedAdminName = assigned ? getDisplayName(assigned) : undefined;
    }

    await patchReEval(
      ctx,
      reEval._id,
      reEval.playerId,
      admin,
      {
        assignedAdminId: args.assignedAdminId,
        assignedAdminName,
      },
      {
        action: "big_summer_reeval_admin_assigned",
        previousValue: reEval.assignedAdminName,
        newValue: assignedAdminName,
      },
    );
  },
});

export const markReadyToReview = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    await patchReEval(
      ctx,
      reEval._id,
      reEval.playerId,
      admin,
      { reEvalStatus: "ready_to_review" },
      {
        action: "big_summer_reeval_ready_to_review",
        previousValue: reEval.reEvalStatus,
        newValue: "ready_to_review",
      },
    );
  },
});

export const markReviewed = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    await patchReEval(
      ctx,
      reEval._id,
      reEval.playerId,
      admin,
      { reEvalStatus: "reviewed" },
      {
        action: "big_summer_reeval_reviewed",
        previousValue: reEval.reEvalStatus,
        newValue: "reviewed",
      },
    );
  },
});

export const setFinalDecision = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    finalDecision: finalDecisionValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");

    const patch: Record<string, unknown> = {
      finalDecision: args.finalDecision,
      reEvalStatus: "reviewed",
      assignedAdminId: admin._id,
      assignedAdminName: getDisplayName(admin),
    };

    await patchReEval(ctx, reEval._id, reEval.playerId, admin, patch, {
      action: "big_summer_reeval_final_decision_set",
      previousValue: reEval.finalDecision,
      newValue: args.finalDecision,
    });
  },
});

export const updateNotes = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    await patchReEval(
      ctx,
      reEval._id,
      reEval.playerId,
      admin,
      { notes: args.notes },
      {
        action: "big_summer_reeval_notes_updated",
        previousValue: reEval.notes,
        newValue: args.notes,
      },
    );
  },
});

