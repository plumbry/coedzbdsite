import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { writeSystemReEvalAudit } from "./helpers";

const MAX_CLAIM_BATCH = 25;

export const claimPendingQueueItems = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? MAX_CLAIM_BATCH, MAX_CLAIM_BATCH);
    const pending = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(limit);

    const claimed = [];
    const now = Date.now();
    for (const item of pending) {
      await ctx.db.patch(item._id, {
        status: "processing",
        processingStartedAt: now,
      });
      claimed.push({
        id: item._id,
        playerId: item.playerId,
        discordId: item.discordId,
        playerName: item.playerName,
        currentTier: item.currentTier,
        targetTier: item.targetTier,
        action: item.action,
        reason: item.reason,
        reEvalId: item.reEvalId,
      });
      if (item.reEvalId) {
        const reEval = await ctx.db.get(item.reEvalId);
        if (reEval && reEval.reEvalStatus === "tier_change_queued") {
          // keep status while processing
        }
      }
      void now;
    }
    return claimed;
  },
});

export const completeQueueItems = internalMutation({
  args: {
    results: v.array(
      v.object({
        id: v.id("tierRoleChangeQueue"),
        status: v.union(
          v.literal("completed"),
          v.literal("failed"),
          v.literal("skipped"),
        ),
        errorMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const result of args.results) {
      const item = await ctx.db.get(result.id);
      if (!item || item.status !== "processing") continue;

      await ctx.db.patch(item._id, {
        status: result.status,
        processedAt: now,
        processedByBot: true,
        errorMessage: result.errorMessage,
      });

      if (item.reEvalId) {
        const reEval = await ctx.db.get(item.reEvalId);
        if (reEval) {
          let reEvalStatus = reEval.reEvalStatus;
          if (result.status === "completed") {
            if (item.action === "remove_access") {
              reEvalStatus = "access_removed";
            } else if (item.action === "retire") {
              reEvalStatus = "retired";
            } else if (item.action === "change_tier") {
              reEvalStatus = "tier_change_complete";
            }
          } else if (result.status === "failed") {
            reEvalStatus = "tier_change_failed";
          }

          await ctx.db.patch(item.reEvalId, {
            reEvalStatus,
            lastUpdatedAt: now,
          });
        }
      }

      const auditAction =
        result.status === "completed"
          ? item.action === "remove_access"
            ? "big_summer_reeval_bot_removed_access"
            : item.action === "change_tier"
              ? "big_summer_reeval_bot_changed_tier"
              : "big_summer_reeval_bot_completed"
          : result.status === "failed"
            ? "big_summer_reeval_bot_failed"
            : "big_summer_reeval_bot_skipped";

      await writeSystemReEvalAudit(ctx, {
        action: auditAction,
        playerId: item.playerId,
        reEvalId: item.reEvalId,
        newValue: result.status,
        details: result.errorMessage,
      });
    }
  },
});

export const getPendingCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.length;
  },
});

export type ClaimedQueueItem = {
  id: Id<"tierRoleChangeQueue">;
  playerId: Id<"players">;
  discordId: string;
  playerName: string;
  currentTier?: string;
  targetTier?: string;
  action: "change_tier" | "remove_access" | "retire" | "no_change";
  reason: string;
  reEvalId?: Id<"bigSummerReEval">;
};
