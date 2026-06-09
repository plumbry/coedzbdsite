import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  buildPlayerImportLookupRow,
  removePlayerImportLookup,
  syncPlayerImportLookupForPlayer,
} from "../helpers/playerImportLookup";

/** Full rebuild of the import-matching lookup table (admin/migration). */
export const rebuildCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("playerImportLookup").collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const players = await ctx.db.query("players").collect();
    for (const player of players) {
      await ctx.db.insert("playerImportLookup", buildPlayerImportLookupRow(player));
    }

    return { playersIndexed: players.length };
  },
});

/** Upsert one player's lookup row after identity fields change. */
export const syncPlayer = internalMutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await syncPlayerImportLookupForPlayer(ctx, args.playerId);
  },
});

export const removePlayer = internalMutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await removePlayerImportLookup(ctx, args.playerId);
  },
});
