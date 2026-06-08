import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { TableNames } from "../_generated/dataModel";

/** Fields written by unreleased WIP that block production schema deploys. */
const STRIP_CONFIG: Array<{ table: TableNames; fields: string[] }> = [
  { table: "aggregateStatsCache", fields: ["formulaVersion"] },
  { table: "aggregateStatsJobs", fields: ["formulaVersion"] },
  { table: "playerStatsRebuildJobs", fields: ["pipelineVersion"] },
  {
    table: "tierReEvaluationCache",
    fields: [
      "evaluationStatusRaw",
      "recentEvaluationStatus",
      "recentEvaluationStatusRaw",
      "formulaVersion",
    ],
  },
  {
    table: "tierMediansCache",
    fields: [
      "rawTierHolisticMedians",
      "partialRawHolisticByTier",
      "partialRecentRawHolisticByTier",
      "recentTierRawHolisticMedians",
      "formulaVersion",
    ],
  },
  { table: "events", fields: ["adminWorkflowStatus"] },
];

async function stripTableFields(
  ctx: MutationCtx,
  table: TableNames,
  fields: string[],
): Promise<number> {
  let count = 0;
  const docs = await ctx.db.query(table).collect();

  for (const doc of docs) {
    const record = doc as Record<string, unknown>;
    const hasField = fields.some((field) => record[field] !== undefined);
    if (!hasField) continue;

    const { _id, _creationTime, ...rest } = record;
    for (const field of fields) {
      delete rest[field];
    }
    await ctx.db.replace(doc._id, rest as never);
    count++;
  }

  return count;
}

/** One-shot cleanup so production can deploy the committed schema. Run via CLI only. */
export const stripWipSchemaFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, number> = {};
    for (const { table, fields } of STRIP_CONFIG) {
      results[table] = await stripTableFields(ctx, table, fields);
    }

    return results;
  },
});
