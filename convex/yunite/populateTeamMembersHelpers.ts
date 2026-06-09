import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

/** Import-scoped result refs (array — avoids Convex 1024 object-field return limit). */
export const getImportResultRefsByDiscord = internalQuery({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    const resultRefs: Array<{
      discordId: string;
      resultId: Id<"thirdPartyResults">;
      hasTeamMembers: boolean;
    }> = [];

    for (const result of results) {
      if (!result.discordId) {
        continue;
      }
      resultRefs.push({
        discordId: result.discordId,
        resultId: result._id,
        hasTeamMembers: (result.teamMembers?.length ?? 0) > 0,
      });
    }

    console.log(
      `[populateTeamMembers] getImportResultRefsByDiscord import=${args.importId} refs=${resultRefs.length} topLevelFields=2`,
    );

    return { resultRefs, totalResults: results.length };
  },
});

/** Indexed epic-username lookup for a batch of Discord IDs (array return). */
export const lookupEpicUsernamesByDiscordIds = internalQuery({
  args: { discordIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const epicLookups: Array<{ discordId: string; epicUsername: string }> = [];

    for (const discordId of args.discordIds) {
      const lookup = await ctx.db
        .query("playerImportLookup")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
        .first();
      if (lookup?.epicUsername) {
        epicLookups.push({ discordId, epicUsername: lookup.epicUsername });
        continue;
      }

      const alias = await ctx.db
        .query("playerDiscordAliases")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
        .first();
      if (alias) {
        const player = await ctx.db.get(alias.playerId);
        if (player?.epicUsername) {
          epicLookups.push({ discordId, epicUsername: player.epicUsername });
        }
      }
    }

    return { epicLookups };
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
