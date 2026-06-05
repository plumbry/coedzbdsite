import type { Doc } from "../_generated/dataModel.d.ts";
import type { QueryCtx } from "../_generated/server.d.ts";
import { normalizeDiscordId } from "../lib/playerIdentity";
import { findPlayerByDiscordUserId } from "./playerDiscordAliases";

export type DiscordIdMatchType = "primary" | "alternate";

export type PlayerDiscordIdMatch = {
  player: Doc<"players">;
  matchType: DiscordIdMatchType;
};

export function playerMatchesSearchTerm(
  player: Pick<
    Doc<"players">,
    | "epicUsername"
    | "discordUsername"
    | "discordUserId"
    | "nickname"
    | "alternateDiscordUserIds"
  >,
  needle: string,
): boolean {
  const term = needle.toLowerCase();
  const epic = player.epicUsername.toLowerCase();
  const discord = player.discordUsername.toLowerCase();
  const discordId = player.discordUserId?.toLowerCase() ?? "";
  const nickname = player.nickname?.toLowerCase() ?? "";
  const alternateMatch = player.alternateDiscordUserIds?.some((id) =>
    id.toLowerCase().includes(term),
  );
  return (
    epic.includes(term) ||
    discord.includes(term) ||
    discordId.includes(term) ||
    nickname.includes(term) ||
    !!alternateMatch
  );
}

export function findPlayerByDiscordIdInList(
  players: Doc<"players">[],
  discordId: string,
): PlayerDiscordIdMatch | null {
  const normalized = normalizeDiscordId(discordId);
  const primary = players.find(
    (p) =>
      p.discordUserId &&
      normalizeDiscordId(p.discordUserId) === normalized,
  );
  if (primary) {
    return { player: primary, matchType: "primary" };
  }
  const alternate = players.find((p) =>
    p.alternateDiscordUserIds?.some(
      (id) => normalizeDiscordId(id) === normalized,
    ),
  );
  if (alternate) {
    return { player: alternate, matchType: "alternate" };
  }
  return null;
}

/**
 * Resolve a Discord snowflake to a player via indexed lookups only.
 * Safe for HTTP /api/member and other high-volume read paths.
 */
export async function resolvePlayerByDiscordId(
  ctx: QueryCtx,
  discordId: string,
): Promise<PlayerDiscordIdMatch | null> {
  const player = await findPlayerByDiscordUserId(ctx, discordId);
  if (!player) {
    return null;
  }

  const normalized = normalizeDiscordId(discordId);
  const isPrimary =
    !!player.discordUserId &&
    normalizeDiscordId(player.discordUserId) === normalized;

  return {
    player,
    matchType: isPrimary ? "primary" : "alternate",
  };
}
