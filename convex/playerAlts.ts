import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getDisplayName, requireAdmin } from "./auth_helpers";
import { logAudit } from "./helpers/audit";
import { filterVisibleMembers, isAltAccount } from "./helpers/playerAlt";
import { playerMatchesSearchTerm } from "./helpers/playerDiscordId";
import type { Doc } from "./_generated/dataModel";

function matchesPlayerSearch(player: Doc<"players">, needle: string): boolean {
  return playerMatchesSearchTerm(player, needle);
}

export const listAltPlayers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const alts = await ctx.db
      .query("players")
      .withIndex("by_is_alt", (q) => q.eq("isAlt", true))
      .collect();

    return alts
      .map((player) => ({
        _id: player._id,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        nickname: player.nickname,
        tier: player.tier,
        currentMembershipStatus: player.currentMembershipStatus,
        discordUserId: player.discordUserId,
      }))
      .sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));
  },
});

export const searchPlayersForAltMarking = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const needle = args.search.trim().toLowerCase();
    const maxResults = Math.min(args.limit ?? 20, 20);
    if (needle.length < 2) {
      return [];
    }

    const players = await ctx.db.query("players").order("desc").collect();

    return filterVisibleMembers(players)
      .filter((player) => matchesPlayerSearch(player, needle))
      .slice(0, maxResults)
      .map((player) => ({
        _id: player._id,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        nickname: player.nickname,
        tier: player.tier,
        currentMembershipStatus: player.currentMembershipStatus,
      }));
  },
});

export const setPlayerAltStatus = mutation({
  args: {
    playerId: v.id("players"),
    isAlt: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const player = await ctx.db.get(args.playerId);

    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }

    const wasAlt = isAltAccount(player);
    if (wasAlt === args.isAlt) {
      return { playerId: args.playerId, isAlt: args.isAlt };
    }

    await ctx.db.patch(args.playerId, { isAlt: args.isAlt ? true : false });

    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: args.isAlt ? "player_marked_alt" : "player_unmarked_alt",
      entityType: "player",
      entityId: args.playerId,
      details: `${args.isAlt ? "Marked" : "Unmarked"} alt: ${player.discordUsername} (${player.epicUsername})`,
    });

    return { playerId: args.playerId, isAlt: args.isAlt };
  },
});
