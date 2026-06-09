import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import { internal } from "../../_generated/api";
import { getPlayerStatsCacheRow } from "./playerStatsCacheEligibility";
import { removeTierReEvaluationCacheForPlayer } from "./updatePlayerStatsCache";

/** Update or remove tier re-eval cache for a single player based on stats cache eligibility. */
export async function updateTierEvalForPlayerIfEligible(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<{ tierEvalUpdated: boolean; reason?: string }> {
  const cacheRow = await getPlayerStatsCacheRow(ctx, playerId);
  if (!cacheRow) {
    return { tierEvalUpdated: false, reason: "no_cache_row" };
  }

  if (!cacheRow.reevaluationEligible) {
    await removeTierReEvaluationCacheForPlayer(ctx, playerId);
    return { tierEvalUpdated: false, reason: "below_reevaluation_threshold" };
  }

  const medians = await ctx.db.query("tierMediansCache").first();
  if (!medians) {
    return { tierEvalUpdated: false, reason: "no_medians" };
  }

  await ctx.runMutation(internal.tierReEvaluationBatched.processBatch, {
    batchNumber: 0,
    playerIds: [playerId],
  });
  return { tierEvalUpdated: true };
}
