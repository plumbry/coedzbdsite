import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, internalMutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";

const BATCH_SIZE = 50;

type LegacyPlayerFields = {
  powerScore?: number;
  rankingStats?: unknown;
};

function playerHasDeprecatedRankingFields(player: LegacyPlayerFields) {
  return player.powerScore !== undefined || player.rankingStats !== undefined;
}

function stripLegacyRankingFields(
  player: Doc<"players"> & LegacyPlayerFields,
): Doc<"players"> {
  const { powerScore: _ps, rankingStats: _rs, ...rest } = player;
  return rest;
}

/** Count players that still have legacy PR fields on the document. */
export const countPlayersWithDeprecatedRankingFields = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const players = await ctx.db.query("players").collect();
    const withFields = players.filter((player) =>
      playerHasDeprecatedRankingFields(player as Doc<"players"> & LegacyPlayerFields),
    );
    return {
      totalPlayers: players.length,
      withDeprecatedFields: withFields.length,
    };
  },
});

export const clearDeprecatedPlayerRankingFieldsBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("players")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let cleared = 0;
    for (const player of page.page) {
      const legacyPlayer = player as Doc<"players"> & LegacyPlayerFields;
      if (!playerHasDeprecatedRankingFields(legacyPlayer)) {
        continue;
      }
      await ctx.db.replace(player._id, stripLegacyRankingFields(legacyPlayer));
      cleared++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.clearDeprecatedPlayerRankingFields
          .clearDeprecatedPlayerRankingFieldsBatch,
        { cursor: page.continueCursor },
      );
    }

    return {
      clearedThisBatch: cleared,
      isDone: page.isDone,
    };
  },
});

/** Remove legacy `powerScore` / `rankingStats` from all player docs (Power Rankings removed). */
export const clearDeprecatedPlayerRankingFields = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const snapshot = await ctx.db.query("players").collect();
    const withFields = snapshot.filter((player) =>
      playerHasDeprecatedRankingFields(player as Doc<"players"> & LegacyPlayerFields),
    );

    if (withFields.length === 0) {
      return {
        started: false,
        playersToClear: 0,
        message: "No legacy Power Ranking fields found on player documents.",
      };
    }

    await ctx.scheduler.runAfter(
      0,
      internal.clearDeprecatedPlayerRankingFields
        .clearDeprecatedPlayerRankingFieldsBatch,
      {},
    );

    return {
      started: true,
      playersToClear: withFields.length,
      message: `Clearing legacy fields on ${withFields.length} player(s) in the background.`,
    };
  },
});
