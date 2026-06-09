import type { Doc, Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { PlayerMatchFields } from "../lib/playerIdentity";

export type PlayerImportLookupRow = {
  playerId: Id<"players">;
  discordUserId?: string;
  alternateDiscordUserIds?: string[];
  epicId?: string;
  epicUsername: string;
  normalizedEpicUsername: string;
  discordUsername: string;
  normalizedDiscordUsername: string;
};

export function buildPlayerImportLookupRow(
  player: Pick<
    Doc<"players">,
    | "_id"
    | "discordUserId"
    | "alternateDiscordUserIds"
    | "epicId"
    | "epicUsername"
    | "discordUsername"
  >,
): PlayerImportLookupRow {
  return {
    playerId: player._id,
    discordUserId: player.discordUserId,
    alternateDiscordUserIds: player.alternateDiscordUserIds,
    epicId: player.epicId,
    epicUsername: player.epicUsername,
    normalizedEpicUsername: player.epicUsername.toLowerCase(),
    discordUsername: player.discordUsername,
    normalizedDiscordUsername: player.discordUsername.toLowerCase(),
  };
}

export function toPlayerMatchFields(row: PlayerImportLookupRow): PlayerMatchFields {
  return {
    _id: row.playerId,
    discordUserId: row.discordUserId,
    alternateDiscordUserIds: row.alternateDiscordUserIds,
    epicId: row.epicId,
    epicUsername: row.epicUsername,
    discordUsername: row.discordUsername,
  };
}

export async function upsertPlayerImportLookup(
  ctx: MutationCtx,
  player: Pick<
    Doc<"players">,
    | "_id"
    | "discordUserId"
    | "alternateDiscordUserIds"
    | "epicId"
    | "epicUsername"
    | "discordUsername"
  >,
): Promise<void> {
  const row = buildPlayerImportLookupRow(player);
  const existing = await ctx.db
    .query("playerImportLookup")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, row);
    return;
  }

  await ctx.db.insert("playerImportLookup", row);
}

export async function syncPlayerImportLookupForPlayer(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<void> {
  const player = await ctx.db.get(playerId);
  if (!player) {
    await removePlayerImportLookup(ctx, playerId);
    return;
  }
  await upsertPlayerImportLookup(ctx, player);
}

export async function removePlayerImportLookup(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<void> {
  const existing = await ctx.db
    .query("playerImportLookup")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .unique();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

export async function listPlayerMatchFieldsFromLookup(
  ctx: QueryCtx,
): Promise<PlayerMatchFields[]> {
  const rows = await ctx.db.query("playerImportLookup").collect();
  return rows.map(toPlayerMatchFields);
}
