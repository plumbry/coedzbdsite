import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, internalMutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";

const BATCH_SIZE = 50;

type LegacyTierEvalFields = {
  avgPRPerEvent?: number;
  finalPowerScore?: number;
};

function rowHasDeprecatedPrFields(row: LegacyTierEvalFields) {
  return row.avgPRPerEvent !== undefined || row.finalPowerScore !== undefined;
}

function stripLegacyPrFields(
  row: Doc<"tierReEvaluationCache"> & LegacyTierEvalFields,
): Doc<"tierReEvaluationCache"> {
  const { avgPRPerEvent: _avg, finalPowerScore: _final, ...rest } = row;
  return rest;
}

export const countRowsWithDeprecatedTierEvalPrFields = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("tierReEvaluationCache").collect();
    const withFields = rows.filter((row) =>
      rowHasDeprecatedPrFields(row as Doc<"tierReEvaluationCache"> & LegacyTierEvalFields),
    );
    return {
      totalRows: rows.length,
      withDeprecatedFields: withFields.length,
    };
  },
});

export const clearDeprecatedTierEvalPrFieldsBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("tierReEvaluationCache")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let cleared = 0;
    for (const row of page.page) {
      const legacyRow = row as Doc<"tierReEvaluationCache"> & LegacyTierEvalFields;
      if (!rowHasDeprecatedPrFields(legacyRow)) {
        continue;
      }
      await ctx.db.replace(row._id, stripLegacyPrFields(legacyRow));
      cleared++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.clearDeprecatedTierEvalPrFields.clearDeprecatedTierEvalPrFieldsBatch,
        { cursor: page.continueCursor },
      );
    }

    return {
      clearedThisBatch: cleared,
      isDone: page.isDone,
    };
  },
});

/** Remove legacy `avgPRPerEvent` / `finalPowerScore` from tier-eval cache rows. */
export const clearDeprecatedTierEvalPrFields = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const snapshot = await ctx.db.query("tierReEvaluationCache").collect();
    const withFields = snapshot.filter((row) =>
      rowHasDeprecatedPrFields(row as Doc<"tierReEvaluationCache"> & LegacyTierEvalFields),
    );

    if (withFields.length === 0) {
      return {
        started: false,
        rowsToClear: 0,
        message: "No legacy Power Ranking fields found on tier-eval cache rows.",
      };
    }

    await ctx.scheduler.runAfter(
      0,
      internal.clearDeprecatedTierEvalPrFields.clearDeprecatedTierEvalPrFieldsBatch,
      {},
    );

    return {
      started: true,
      rowsToClear: withFields.length,
      message: `Clearing legacy fields on ${withFields.length} tier-eval cache row(s) in the background.`,
    };
  },
});
