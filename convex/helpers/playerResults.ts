import type { Doc, Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "../_generated/server.d.ts";
import { normalizeDiscordId } from "../lib/playerIdentity";

/** All Discord ID strings to query (raw + normalized) for this player. */
export function collectDiscordIdsForPlayer(
  player: Pick<Doc<"players">, "discordUserId" | "alternateDiscordUserIds">,
): string[] {
  const ids = new Set<string>();
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    ids.add(trimmed);
    ids.add(normalizeDiscordId(trimmed));
  };
  add(player.discordUserId);
  for (const alt of player.alternateDiscordUserIds ?? []) {
    add(alt);
  }
  return [...ids];
}

function resultDiscordIdMatches(
  resultDiscordId: string | undefined,
  playerDiscordIds: Set<string>,
): boolean {
  if (!resultDiscordId) {
    return false;
  }
  return playerDiscordIds.has(normalizeDiscordId(resultDiscordId));
}

/** Third-party results for a player (by playerId and all linked Discord IDs). */
export async function fetchThirdPartyResultsForPlayer(
  ctx: QueryCtx,
  playerId: Id<"players">,
): Promise<Doc<"thirdPartyResults">[]> {
  const player = await ctx.db.get(playerId);
  if (!player) {
    return [];
  }

  const byPlayerId = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();

  const discordIds = collectDiscordIdsForPlayer(player);
  if (discordIds.length <= 1) {
    return byPlayerId;
  }

  const seen = new Set(byPlayerId.map((r) => r._id));
  const playerDiscordIds = new Set(discordIds);
  const extra: Doc<"thirdPartyResults">[] = [];

  for (const discordId of discordIds) {
    const matches = await ctx.db
      .query("thirdPartyResults")
      .filter((q) => q.eq(q.field("discordId"), discordId))
      .collect();

    for (const result of matches) {
      if (seen.has(result._id)) {
        continue;
      }
      if (!resultDiscordIdMatches(result.discordId, playerDiscordIds)) {
        continue;
      }
      seen.add(result._id);
      extra.push(result);
    }
  }

  return [...byPlayerId, ...extra];
}

/** Link thirdPartyResults and matchPlayerStats for all Discord IDs on this player. */
export async function relinkEventResultsForPlayer(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<{ thirdPartyRelinked: number; matchStatsRelinked: number }> {
  const player = await ctx.db.get(playerId);
  if (!player) {
    return { thirdPartyRelinked: 0, matchStatsRelinked: 0 };
  }

  const discordIds = collectDiscordIdsForPlayer(player);
  let thirdPartyRelinked = 0;
  let matchStatsRelinked = 0;

  for (const discordId of discordIds) {
    const results = await ctx.db
      .query("thirdPartyResults")
      .filter((q) => q.eq(q.field("discordId"), discordId))
      .collect();

    for (const result of results) {
      const normalized = result.discordId
        ? normalizeDiscordId(result.discordId)
        : null;
      if (!normalized || !discordIds.includes(normalized)) {
        continue;
      }
      if (result.playerId !== playerId || !result.matched) {
        await ctx.db.patch(result._id, {
          playerId,
          matched: true,
        });
        thirdPartyRelinked++;
      }
    }

    const matchStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .collect();

    for (const stat of matchStats) {
      if (stat.playerId !== playerId) {
        await ctx.db.patch(stat._id, { playerId });
        matchStatsRelinked++;
      }
    }
  }

  return { thirdPartyRelinked, matchStatsRelinked };
}
