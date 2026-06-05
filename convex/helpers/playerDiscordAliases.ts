import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export function isIndexableDiscordUserId(id: string | undefined): boolean {
  return !!id && !id.startsWith("placeholder_") && id !== "imported";
}

/** Sync alias rows for alternate Discord IDs (primary ID lives on players.by_discord_user_id). */
export async function syncPlayerDiscordAliases(
  ctx: MutationCtx,
  player: Pick<
    Doc<"players">,
    "_id" | "discordUserId" | "alternateDiscordUserIds"
  >,
): Promise<void> {
  const existing = await ctx.db
    .query("playerDiscordAliases")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .collect();

  for (const row of existing) {
    await ctx.db.delete(row._id);
  }

  const ids = new Set<string>();
  if (isIndexableDiscordUserId(player.discordUserId)) {
    ids.add(player.discordUserId);
  }
  for (const alternateId of player.alternateDiscordUserIds ?? []) {
    if (isIndexableDiscordUserId(alternateId)) {
      ids.add(alternateId);
    }
  }

  for (const discordUserId of ids) {
    await ctx.db.insert("playerDiscordAliases", {
      discordUserId,
      playerId: player._id,
    });
  }
}

/** Indexed lookup for any Discord snowflake linked to a player (primary or alternate). */
export async function findPlayerByDiscordUserId(
  ctx: QueryCtx,
  discordUserId: string,
): Promise<Doc<"players"> | null> {
  const byPrimary = await ctx.db
    .query("players")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
    .first();
  if (byPrimary) {
    return byPrimary;
  }

  const alias = await ctx.db
    .query("playerDiscordAliases")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
    .first();
  if (!alias) {
    return null;
  }

  return await ctx.db.get(alias.playerId);
}
