import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/** After import — update stats only for players touched by the import. */
export const scheduleStatsForAffectedPlayers = internalMutation({
  args: { playerIds: v.array(v.id("players")) },
  handler: async (ctx, args) => {
    if (args.playerIds.length === 0) {
      return { scheduled: false };
    }
    await ctx.scheduler.runAfter(
      0,
      internal.playerStatsCache.scheduleStatsUpdateForPlayers,
      { playerIds: args.playerIds },
    );
    return { scheduled: true, count: args.playerIds.length };
  },
});

/**
 * @deprecated Use scheduleStatsForAffectedPlayers with explicit player IDs.
 * Kept for call sites migrating off full-table event participation rebuilds.
 */
export const scheduleEventParticipationRebuild = internalMutation({
  args: { playerIds: v.optional(v.array(v.id("players"))) },
  handler: async (
    ctx,
    args,
  ): Promise<{ scheduled: boolean; count?: number }> => {
    if (!args.playerIds || args.playerIds.length === 0) {
      return { scheduled: false };
    }
    return await ctx.runMutation(
      internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
      { playerIds: args.playerIds },
    );
  },
});

