import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

/** Import-scoped result refs keyed by Discord ID (indexed by_import read only). */
export const getImportResultRefsByDiscord = internalQuery({
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

    return { resultsByDiscord, totalResults: results.length };
  },
});

/** Indexed epic-username lookup for a batch of Discord IDs (no full player scan). */
export const lookupEpicUsernamesByDiscordIds = internalQuery({
  args: { discordIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const discordToEpic: Record<string, string> = {};

    for (const discordId of args.discordIds) {
      const lookup = await ctx.db
        .query("playerImportLookup")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
        .first();
      if (lookup?.epicUsername) {
        discordToEpic[discordId] = lookup.epicUsername;
        continue;
      }

      const alias = await ctx.db
        .query("playerDiscordAliases")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
        .first();
      if (alias) {
        const player = await ctx.db.get(alias.playerId);
        if (player?.epicUsername) {
          discordToEpic[discordId] = player.epicUsername;
        }
      }
    }

    return { discordToEpic };
  },
});

/**
 * @deprecated Use getImportResultRefsByDiscord + lookupEpicUsernamesByDiscordIds.
 * Kept for compatibility; uses indexed lookups only.
 */
export const getTeamPopulateContext = internalQuery({
  args: {
    importId: v.id("thirdPartyImports"),
    discordIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    const resultsByDiscord: Record<
      string,
      { resultId: Id<"thirdPartyResults">; hasTeamMembers: boolean }
    > = {};

    const discordIds = new Set<string>(args.discordIds ?? []);
    for (const result of results) {
      if (!result.discordId) {
        continue;
      }
      resultsByDiscord[result.discordId] = {
        resultId: result._id,
        hasTeamMembers: (result.teamMembers?.length ?? 0) > 0,
      };
      discordIds.add(result.discordId);
    }

    const discordToEpic: Record<string, string> = {};
    for (const discordId of discordIds) {
      const lookup = await ctx.db
        .query("playerImportLookup")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
        .first();
      if (lookup?.epicUsername) {
        discordToEpic[discordId] = lookup.epicUsername;
        continue;
      }

      const alias = await ctx.db
        .query("playerDiscordAliases")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
        .first();
      if (alias) {
        const player = await ctx.db.get(alias.playerId);
        if (player?.epicUsername) {
          discordToEpic[discordId] = player.epicUsername;
        }
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
