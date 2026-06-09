import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import {
  type ImportIdentityInput,
  type ImportMatchMethod,
  normalizeDiscordId,
} from "../playerIdentity";

type LookupCtx = QueryCtx | MutationCtx;

/**
 * Match one import row to a player using indexed lookups (no full player scan).
 * Priority: Discord ID → alternate Discord ID → Epic ID → Epic username → Discord username.
 */
export async function matchPlayerForImportFromLookup(
  ctx: LookupCtx,
  input: ImportIdentityInput,
): Promise<{ playerId: Id<"players"> | null; matchMethod: ImportMatchMethod | null }> {
  if (input.discordId) {
    const cleanDiscordId = normalizeDiscordId(input.discordId);
    const byDiscord = await ctx.db
      .query("playerImportLookup")
      .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", cleanDiscordId))
      .first();
    if (byDiscord) {
      return { playerId: byDiscord.playerId, matchMethod: "discord_id" };
    }

    const alias = await ctx.db
      .query("playerDiscordAliases")
      .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", cleanDiscordId))
      .first();
    if (alias) {
      return { playerId: alias.playerId, matchMethod: "alternate_discord_id" };
    }
  }

  if (input.epicId) {
    const cleanEpicId = input.epicId.trim();
    const byEpicId = await ctx.db
      .query("playerImportLookup")
      .withIndex("by_epic_id", (q) => q.eq("epicId", cleanEpicId))
      .first();
    if (byEpicId) {
      return { playerId: byEpicId.playerId, matchMethod: "epic_id" };
    }
  }

  if (input.epicUsername) {
    const normalizedEpicUsername = input.epicUsername.toLowerCase();
    const byEpicUsername = await ctx.db
      .query("playerImportLookup")
      .withIndex("by_normalized_epic_username", (q) =>
        q.eq("normalizedEpicUsername", normalizedEpicUsername),
      )
      .first();
    if (byEpicUsername) {
      return { playerId: byEpicUsername.playerId, matchMethod: "epic_username" };
    }
  }

  if (input.discordUsername) {
    const normalizedDiscordUsername = input.discordUsername.toLowerCase();
    const byDiscordUsername = await ctx.db
      .query("playerImportLookup")
      .withIndex("by_normalized_discord_username", (q) =>
        q.eq("normalizedDiscordUsername", normalizedDiscordUsername),
      )
      .first();
    if (byDiscordUsername) {
      return { playerId: byDiscordUsername.playerId, matchMethod: "discord_username" };
    }
  }

  return { playerId: null, matchMethod: null };
}
