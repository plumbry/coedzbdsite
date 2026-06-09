import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import { STATS_DISPLAY_MIN_EVENTS, STATS_REEVAL_MIN_EVENTS } from "./thresholds";

type Ctx = QueryCtx | MutationCtx;

/** True once any playerStatsCache row exists (post-initial backfill). */
export async function isPlayerStatsCachePopulated(ctx: Ctx): Promise<boolean> {
  const row = await ctx.db.query("playerStatsCache").first();
  return row != null;
}

export async function getPlayerStatsCacheRow(
  ctx: Ctx,
  playerId: Id<"players">,
): Promise<Doc<"playerStatsCache"> | null> {
  return await ctx.db
    .query("playerStatsCache")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();
}

export type PlayerDisplayStatsEligibility = {
  statsEligible: boolean;
  reevaluationEligible: boolean;
  eventCount: number;
  requiredDisplayEvents: number;
  requiredReevaluationEvents: number;
  hasCacheRow: boolean;
};

export async function getPlayerDisplayStatsEligibility(
  ctx: Ctx,
  playerId: Id<"players">,
): Promise<PlayerDisplayStatsEligibility> {
  const cacheRow = await getPlayerStatsCacheRow(ctx, playerId);
  return {
    statsEligible: cacheRow?.statsEligible ?? false,
    reevaluationEligible: cacheRow?.reevaluationEligible ?? false,
    eventCount: cacheRow?.eventCount ?? 0,
    requiredDisplayEvents: STATS_DISPLAY_MIN_EVENTS,
    requiredReevaluationEvents: STATS_REEVAL_MIN_EVENTS,
    hasCacheRow: cacheRow != null,
  };
}
