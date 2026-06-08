import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

export const getTeamPopulateContext = internalQuery({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    const resultsByDiscord: Record<
      string,
      { resultId: Id<"thirdPartyResults">; hasTeamMembers: boolean }
    > = {};

    for (const result of results) {
      if (!result.discordId) {
        continue;
      }
      resultsByDiscord[result.discordId] = {
        resultId: result._id,
        hasTeamMembers: (result.teamMembers?.length ?? 0) > 0,
      };
    }

    const players = await ctx.db.query("players").collect();
    const discordToEpic: Record<string, string> = {};
    for (const player of players) {
      if (player.discordUserId && player.epicUsername) {
        discordToEpic[player.discordUserId] = player.epicUsername;
      }
    }

    return { resultsByDiscord, discordToEpic };
  },
});

export const bulkUpdateResultTeamMembers = internalMutation({
  args: {
    updates: v.array(
      v.object({
        resultId: v.id("thirdPartyResults"),
        teamMembers: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const update of args.updates) {
      await ctx.db.patch(update.resultId, {
        teamMembers: update.teamMembers,
      });
    }
    return { updated: args.updates.length };
  },
});
