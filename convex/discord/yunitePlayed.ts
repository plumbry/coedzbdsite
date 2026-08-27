import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { findPlayerByDiscordUserId } from "../helpers/playerDiscordAliases";
import { collectDiscordIdsForPlayer } from "../helpers/playerResults";
import { isYuniteImport } from "../lib/importSource";

export const MAX_YUNITE_PLAYED_DISCORD_IDS = 500;

const memberMatchValidator = v.union(
  v.literal("player"),
  v.literal("result"),
  v.literal("none"),
);

export const yunitePlayedMemberValidator = v.object({
  discordId: v.string(),
  played: v.boolean(),
  eventsPlayedCount: v.number(),
  epicId: v.string(),
  epicName: v.string(),
  match: memberMatchValidator,
});

function resultLooksLikeYunite(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  return (
    normalized === "yunite" ||
    normalized === "yunite api" ||
    normalized.includes("yunite")
  );
}

async function resultIsYunite(
  ctx: QueryCtx,
  result: { source: string; importId: Id<"thirdPartyImports"> },
): Promise<boolean> {
  if (resultLooksLikeYunite(result.source)) {
    return true;
  }

  const importRecord = await ctx.db.get(result.importId);
  return importRecord ? isYuniteImport(importRecord) : false;
}

async function hasYuniteResultByDiscordId(
  ctx: QueryCtx,
  discordId: string,
): Promise<boolean> {
  const rows = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_discord", (q) => q.eq("discordId", discordId))
    .take(25);

  for (const row of rows) {
    if (await resultIsYunite(ctx, row)) {
      return true;
    }
  }

  return false;
}

async function hasYuniteResultByPlayerId(
  ctx: QueryCtx,
  playerId: Id<"players">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .take(25);

  for (const row of rows) {
    if (await resultIsYunite(ctx, row)) {
      return true;
    }
  }

  return false;
}

/**
 * Discord bot inactive prune: which Discord IDs appear in website Yunite scrim data.
 */
export const getYunitePlayedByDiscordIds = internalQuery({
  args: {
    discordIds: v.array(v.string()),
  },
  returns: v.object({
    members: v.array(yunitePlayedMemberValidator),
  }),
  handler: async (ctx, args) => {
    const seen = new Set<string>();
    const discordIds: string[] = [];

    for (const raw of args.discordIds) {
      const discordId = raw.trim();
      if (!discordId || seen.has(discordId)) {
        continue;
      }
      seen.add(discordId);
      discordIds.push(discordId);
      if (discordIds.length >= MAX_YUNITE_PLAYED_DISCORD_IDS) {
        break;
      }
    }

    const members = [];

    for (const discordId of discordIds) {
      const player = await findPlayerByDiscordUserId(ctx, discordId);
      const eventsPlayedCount = player?.eventsPlayedCount ?? 0;
      const epicId = player?.epicId ?? "";
      const epicName = player?.epicUsername ?? "";

      if (player && eventsPlayedCount > 0) {
        members.push({
          discordId,
          played: true,
          eventsPlayedCount,
          epicId,
          epicName,
          match: "player" as const,
        });
        continue;
      }

      if (player) {
        let playedViaPlayer = await hasYuniteResultByPlayerId(ctx, player._id);
        if (!playedViaPlayer) {
          for (const linkedId of collectDiscordIdsForPlayer(player)) {
            if (await hasYuniteResultByDiscordId(ctx, linkedId)) {
              playedViaPlayer = true;
              break;
            }
          }
        }

        members.push({
          discordId,
          played: playedViaPlayer,
          eventsPlayedCount: playedViaPlayer
            ? Math.max(eventsPlayedCount, 1)
            : eventsPlayedCount,
          epicId,
          epicName,
          match: "player" as const,
        });
        continue;
      }

      const playedViaResult = await hasYuniteResultByDiscordId(ctx, discordId);
      members.push({
        discordId,
        played: playedViaResult,
        eventsPlayedCount: playedViaResult ? 1 : 0,
        epicId: "",
        epicName: "",
        match: playedViaResult ? ("result" as const) : ("none" as const),
      });
    }

    return { members };
  },
});
