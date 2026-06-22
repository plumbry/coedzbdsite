import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";
import { getDisplayName } from "../auth_helpers";
import {
  FINAL_DECISIONS,
  FIVE_DAYS_MS,
  QUEUE_ACTION_REASONS,
  RE_EVAL_STATUSES,
  TRACKER_STATUSES,
  type ReEvalStatus,
  type TrackerStatus,
} from "./constants";
import {
  defaultTrackerLink,
  getAcceptedApplicationTrackerLink,
  getReEvalByPlayerId,
  hasActiveQueueItem,
  inferInitialTrackerStatus,
  memberResponseBlocksDeadline,
  startTrackerDeadline,
  trackerStillProblematic,
  writeReEvalAudit,
  writeSystemReEvalAudit,
  computeQueueCandidates,
  queueReasonForAction,
} from "./helpers";

const trackerStatusValidator = v.union(
  ...TRACKER_STATUSES.map((s) => v.literal(s)),
);
const reEvalStatusValidator = v.union(
  ...RE_EVAL_STATUSES.map((s) => v.literal(s)),
);
const finalDecisionValidator = v.union(
  ...FINAL_DECISIONS.map((s) => v.literal(s)),
);

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

export const initializeForActivePlayers = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();

    let created = 0;
    const now = Date.now();

    for (const player of activePlayers) {
      if (player.status !== "active") continue;
      const existing = await getReEvalByPlayerId(ctx, player._id);
      if (existing) continue;

      const appLink = await getAcceptedApplicationTrackerLink(ctx, player._id);
      const trackerLink = appLink ?? defaultTrackerLink(player.epicUsername);

      await ctx.db.insert("bigSummerReEval", {
        playerId: player._id,
        trackerStatus: inferInitialTrackerStatus(trackerLink),
        reEvalStatus: "unchecked",
        fortniteTrackerLink: trackerLink,
        memberResponse: "unset",
        lastUpdatedAt: now,
      });
      created += 1;
    }

    await writeReEvalAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "big_summer_reeval_initialized",
      playerId: activePlayers[0]?._id,
      newValue: `Enrolled ${created} active members for summer re-eval (no tier changes applied)`,
    });

    return { created };
  },
});

export const updateEpicId = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    epicId: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    const player = await ctx.db.get(reEval.playerId);
    if (!player) throw new Error("Player not found");

    const previous = player.epicId;
    const previousEpicIds = player.previousEpicIds ?? [];
    if (player.epicId && player.epicId !== args.epicId) {
      previousEpicIds.push({
        epicId: player.epicId,
        changedAt: new Date().toISOString(),
      });
    }

    await ctx.db.patch(player._id, {
      epicId: args.epicId,
      previousEpicIds,
    });
    await patchReEval(ctx, reEval._id, player._id, admin, {}, {
      action: "big_summer_reeval_epic_id_updated",
      previousValue: previous,
      newValue: args.epicId,
    });
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

    const patch: Record<string, unknown> = { trackerStatus: args.trackerStatus };
    const now = Date.now();

    if (args.trackerStatus === "waiting_for_public_tracker") {
      Object.assign(patch, startTrackerDeadline(now));
      patch.trackerStatus = "waiting_for_public_tracker";
    }

    if (args.trackerStatus === "tracker_fixed") {
      if (
        reEval.reEvalStatus === "waiting_initial_5_days" ||
        reEval.reEvalStatus === "extended_final_5_days"
      ) {
        patch.reEvalStatus = "ready_to_review";
      }
    }

    await patchReEval(ctx, reEval._id, reEval.playerId, admin, patch, {
      action: "big_summer_reeval_tracker_status_changed",
      previousValue: reEval.trackerStatus,
      newValue: args.trackerStatus,
    });
  },
});

export const markDmSent = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    const now = Date.now();
    const patch: Record<string, unknown> = {
      dmSentAt: now,
      ...startTrackerDeadline(now),
    };
    if (!reEval.trackerRequestSentAt) {
      patch.trackerStatus = "waiting_for_public_tracker";
    }
    await patchReEval(ctx, reEval._id, reEval.playerId, admin, patch, {
      action: "big_summer_reeval_dm_sent",
      newValue: new Date(now).toISOString(),
    });
  },
});

export const markTicketSent = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    const now = Date.now();
    const patch: Record<string, unknown> = {
      ticketSentAt: now,
      ...startTrackerDeadline(now),
    };
    if (!reEval.trackerRequestSentAt) {
      patch.trackerStatus = "waiting_for_public_tracker";
    }
    await patchReEval(ctx, reEval._id, reEval.playerId, admin, patch, {
      action: "big_summer_reeval_ticket_sent",
      newValue: new Date(now).toISOString(),
    });
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

export const setMemberResponse = mutation({
  args: {
    reEvalId: v.id("bigSummerReEval"),
    memberResponse: v.union(v.literal("yes"), v.literal("no"), v.literal("unset")),
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
      { memberResponse: args.memberResponse },
      {
        action: "big_summer_reeval_member_response_set",
        previousValue: reEval.memberResponse,
        newValue: args.memberResponse,
      },
    );
  },
});

export const extendDeadline = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");

    if (reEval.reEvalStatus !== "deadline_passed") {
      throw new Error("Extension only allowed when status is Deadline Passed");
    }
    if ((reEval.extensionCount ?? 0) >= 1) {
      throw new Error("Only one extension is allowed per player");
    }

    const now = Date.now();
    await patchReEval(
      ctx,
      reEval._id,
      reEval.playerId,
      admin,
      {
        extensionGranted: true,
        extensionCount: (reEval.extensionCount ?? 0) + 1,
        extendedAt: now,
        deadlineAt: now + FIVE_DAYS_MS,
        reEvalStatus: "extended_final_5_days",
        trackerStatus: "waiting_for_public_tracker_extended",
      },
      {
        action: "big_summer_reeval_deadline_extended",
        newValue: new Date(now + FIVE_DAYS_MS).toISOString(),
      },
    );
  },
});

export const removeTierAccessFromDeadline = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    const player = await ctx.db.get(reEval.playerId);
    if (!player) throw new Error("Player not found");

    const existingQueue = await hasActiveQueueItem(ctx, player._id);
    if (existingQueue) {
      throw new Error("A pending queue item already exists for this player");
    }

    const now = Date.now();
    await ctx.db.insert("tierRoleChangeQueue", {
      playerId: player._id,
      discordId: player.discordUserId,
      playerName: player.name || player.discordUsername,
      currentTier: player.tier,
      action: "remove_access",
      reason: QUEUE_ACTION_REASONS.trackerNotPublic,
      requestedBy: admin._id,
      requestedByName: getDisplayName(admin),
      requestedAt: now,
      status: "pending",
      reEvalId: reEval._id,
    });

    await patchReEval(
      ctx,
      reEval._id,
      player._id,
      admin,
      {
        reEvalStatus: "queued_for_access_removal",
        finalDecision: "remove_access",
      },
      {
        action: "big_summer_reeval_access_removal_queued",
        newValue: QUEUE_ACTION_REASONS.trackerNotPublic,
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

    const patch: Record<string, unknown> = { finalDecision: args.finalDecision };
    if (args.finalDecision === "retired") {
      patch.reEvalStatus = "retired";
    } else {
      patch.reEvalStatus = "reviewed";
    }

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

export const markActive = mutation({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) throw new Error("Re-eval record not found");
    const player = await ctx.db.get(reEval.playerId);
    if (!player) throw new Error("Player not found");

    await ctx.db.patch(player._id, {
      status: "active",
      currentMembershipStatus: "accepted",
    });
    await patchReEval(
      ctx,
      reEval._id,
      player._id,
      admin,
      { reEvalStatus: reEval.reEvalStatus === "retired" ? "unchecked" : reEval.reEvalStatus },
      {
        action: "big_summer_reeval_marked_active",
        newValue: "active",
      },
    );
  },
});

export const markRetired = mutation({
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
      {
        reEvalStatus: "retired",
        finalDecision: "retired",
      },
      {
        action: "big_summer_reeval_marked_retired",
        previousValue: reEval.reEvalStatus,
        newValue: "retired",
      },
    );
  },
});

export const queueDiscordRoleChanges = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const candidates = await computeQueueCandidates(ctx);
    const now = Date.now();

    for (const candidate of candidates) {
      await ctx.db.insert("tierRoleChangeQueue", {
        playerId: candidate.playerId,
        discordId: candidate.discordId,
        playerName: candidate.playerName,
        currentTier: candidate.currentTier,
        targetTier: candidate.targetTier,
        action: candidate.action,
        reason: queueReasonForAction(candidate.action),
        requestedBy: admin._id,
        requestedByName: getDisplayName(admin),
        requestedAt: now,
        status: "pending",
        reEvalId: candidate.reEvalId,
      });

      await ctx.db.patch(candidate.reEvalId, {
        reEvalStatus: candidate.newReEvalStatus,
        lastUpdatedAt: now,
      });
    }

    const summary = {
      promotions: 0,
      demotions: 0,
      accessRemovals: 0,
      retirements: 0,
      queued: candidates.length,
    };
    const tierOrder = ["S", "A", "B", "C", "D"];
    for (const candidate of candidates) {
      if (candidate.action === "change_tier" && candidate.targetTier && candidate.currentTier) {
        const oldIdx = tierOrder.indexOf(candidate.currentTier);
        const newIdx = tierOrder.indexOf(candidate.targetTier);
        if (newIdx < oldIdx) summary.promotions += 1;
        else if (newIdx > oldIdx) summary.demotions += 1;
      } else if (candidate.action === "remove_access") {
        summary.accessRemovals += 1;
      } else if (candidate.action === "retire") {
        summary.retirements += 1;
      }
    }

    await writeReEvalAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "big_summer_reeval_queue_batch_created",
      newValue: JSON.stringify(summary),
    });

    return summary;
  },
});

const STUCK_PROCESSING_MS = 15 * 60 * 1000;

export const resetStuckProcessingQueueItems = mutation({
  args: {
    forceAll: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const processing = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();

    const toReset = processing.filter((item) => {
      if (args.forceAll) return true;
      const startedAt = item.processingStartedAt ?? item.requestedAt;
      return now - startedAt >= STUCK_PROCESSING_MS;
    });

    for (const item of toReset) {
      await ctx.db.patch(item._id, {
        status: "pending",
        processingStartedAt: undefined,
        errorMessage: undefined,
      });
    }

    await writeReEvalAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "big_summer_reeval_stuck_queue_reset",
      newValue: JSON.stringify({
        resetCount: toReset.length,
        forceAll: args.forceAll ?? false,
      }),
    });

    return { resetCount: toReset.length };
  },
});

export const processDeadlinesInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const waiting = await ctx.db
      .query("bigSummerReEval")
      .withIndex("by_re_eval_status", (q) => q.eq("reEvalStatus", "waiting_initial_5_days"))
      .collect();
    const extended = await ctx.db
      .query("bigSummerReEval")
      .withIndex("by_re_eval_status", (q) => q.eq("reEvalStatus", "extended_final_5_days"))
      .collect();

    for (const reEval of [...waiting, ...extended]) {
      if (!reEval.deadlineAt || reEval.deadlineAt > now) continue;

      if (reEval.reEvalStatus === "waiting_initial_5_days") {
        if (
          trackerStillProblematic(reEval.trackerStatus) &&
          memberResponseBlocksDeadline(reEval.memberResponse)
        ) {
          await ctx.db.patch(reEval._id, {
            reEvalStatus: "deadline_passed",
            lastUpdatedAt: now,
          });
          await writeSystemReEvalAudit(ctx, {
            action: "big_summer_reeval_deadline_passed",
            playerId: reEval.playerId,
            reEvalId: reEval._id,
            newValue: "deadline_passed",
          });
        }
        continue;
      }

      if (reEval.reEvalStatus === "extended_final_5_days") {
        if (!trackerStillProblematic(reEval.trackerStatus)) continue;

        const player = await ctx.db.get(reEval.playerId);
        if (!player) continue;

        const existingQueue = await hasActiveQueueItem(ctx, player._id);
        if (existingQueue) {
          await ctx.db.patch(reEval._id, {
            reEvalStatus: "queued_for_access_removal",
            lastUpdatedAt: now,
          });
          continue;
        }

        await ctx.db.insert("tierRoleChangeQueue", {
          playerId: player._id,
          discordId: player.discordUserId,
          playerName: player.name || player.discordUsername,
          currentTier: player.tier,
          action: "remove_access",
          reason: QUEUE_ACTION_REASONS.trackerNotPublicAfterExtension,
          requestedAt: now,
          status: "pending",
          reEvalId: reEval._id,
        });

        await ctx.db.patch(reEval._id, {
          reEvalStatus: "queued_for_access_removal",
          finalDecision: "remove_access",
          lastUpdatedAt: now,
        });

        await writeSystemReEvalAudit(ctx, {
          action: "big_summer_reeval_auto_access_removal_queued",
          playerId: reEval.playerId,
          reEvalId: reEval._id,
          newValue: QUEUE_ACTION_REASONS.trackerNotPublicAfterExtension,
          details: "System queued access removal after extended tracker deadline passed",
        });
      }
    }
  },
});
