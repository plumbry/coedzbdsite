import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { PlayerMatchFields } from "../lib/playerIdentity";

export const getPlayerDocumentById = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.playerId);
  },
});

export const listPlayersForImportMatching = internalQuery({
  args: {},
  handler: async (ctx): Promise<PlayerMatchFields[]> => {
    const players = await ctx.db.query("players").collect();
    return players.map((player) => ({
      _id: player._id,
      discordUserId: player.discordUserId,
      alternateDiscordUserIds: player.alternateDiscordUserIds,
      epicId: player.epicId,
      epicUsername: player.epicUsername,
      discordUsername: player.discordUsername,
    }));
  },
});
