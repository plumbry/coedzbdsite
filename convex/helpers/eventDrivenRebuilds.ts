import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/** After tournament/CSV import — sync Yunite event counts onto players. */
export const scheduleEventParticipationRebuild = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.playerStatsRebuild.scheduleFullRebuild, {
      stopAfterPhase: "event_participation",
    });
  },
});

/** After manual score evaluation — refresh tier evaluation cache. */
export const scheduleTierEvalRebuild = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.playerStatsRebuild.scheduleFullRebuild, {
      tierEvalOnly: true,
    });
  },
});
