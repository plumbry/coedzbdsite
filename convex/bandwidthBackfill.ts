import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./auth_helpers";
import { pickCanonicalManualScore } from "./helpers/manualScores";
import { syncPlayerDiscordAliases } from "./helpers/playerDiscordAliases";

const BATCH_SIZE = 50;

/** Public entry point (CLI/dashboard). Schedules the internal alias backfill. */
export const startPlayerDiscordAliasesBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(
      0,
      internal.bandwidthBackfill.backfillPlayerDiscordAliasesBatch,
      {},
    );
    return {
      started: true,
      message:
        "Discord alias backfill started in the background (50 players per batch).",
    };
  },
});

/** Public entry point (CLI/dashboard). Schedules the internal gender backfill. */
export const startPlayerGenderBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.bandwidthBackfill.backfillPlayerGenderBatch, {});
    return {
      started: true,
      message:
        "Player gender backfill started in the background (50 players per batch).",
    };
  },
});

/** One-time / periodic backfill: copy manualScores.gender onto players.gender. */
export const backfillPlayerGenderBatch = internalMutation({  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("players")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let updated = 0;
    for (const player of page.page) {
      if (player.gender !== undefined) {
        continue;
      }

      const scores = await ctx.db
        .query("manualScores")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      const score = pickCanonicalManualScore(scores);
      if (score?.gender === undefined) {
        continue;
      }

      await ctx.db.patch(player._id, { gender: score.gender });
      updated++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.bandwidthBackfill.backfillPlayerGenderBatch, {
        cursor: page.continueCursor,
      });
    }

    return { updated, done: page.isDone };
  },
});

/** One-time backfill: populate playerDiscordAliases from existing player records. */
export const backfillPlayerDiscordAliasesBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("players")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    for (const player of page.page) {
      await syncPlayerDiscordAliases(ctx, player);
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.bandwidthBackfill.backfillPlayerDiscordAliasesBatch,
        { cursor: page.continueCursor },
      );
    }

    return { processed: page.page.length, done: page.isDone };
  },
});
