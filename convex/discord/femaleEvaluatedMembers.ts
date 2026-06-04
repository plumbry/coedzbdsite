import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { filterVisibleMembers } from "../helpers/playerAlt";
import { getManualScoreForPlayer } from "../helpers/manualScores";

const FEMALE_GENDER_VALUE = 50;

async function getReviewablePlayers(ctx: QueryCtx): Promise<Doc<"players">[]> {
  const activePlayers = await ctx.db
    .query("players")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();

  const acceptedMembers = await ctx.db
    .query("players")
    .withIndex("by_membership_status", (q) =>
      q.eq("currentMembershipStatus", "accepted"),
    )
    .collect();

  const playerMap = new Map<string, Doc<"players">>();
  for (const p of [...activePlayers, ...acceptedMembers]) {
    playerMap.set(p._id, p);
  }

  return filterVisibleMembers(
    [...playerMap.values()].filter(
      (p) => p.status !== "archived" && p.status !== "rejected",
    ),
  );
}

function hasRealDiscordId(discordUserId: string | undefined): discordUserId is string {
  return Boolean(
    discordUserId && !discordUserId.startsWith("placeholder_"),
  );
}

/**
 * Discord bot: members evaluated female (gender = 50) on the website.
 */
export const getFemaleEvaluatedDiscordMembers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const members: Array<{
      discordUserId: string;
      discordUsername: string;
    }> = [];

    for (const player of await getReviewablePlayers(ctx)) {
      if (!hasRealDiscordId(player.discordUserId)) {
        continue;
      }

      const score = await getManualScoreForPlayer(ctx, player._id);
      if (score?.gender !== FEMALE_GENDER_VALUE) {
        continue;
      }

      members.push({
        discordUserId: player.discordUserId,
        discordUsername: player.discordUsername,
      });
    }

    return { members };
  },
});
