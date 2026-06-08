import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { syncInternalEventParticipation } from "../lib/stats/syncInternalEventParticipation";

/** Recompute Yunite import participation after a new result row is inserted. */
export async function touchPlayerEventParticipationOnInsert(
  ctx: MutationCtx,
  playerId: Id<"players"> | undefined,
  _eventName?: string,
  _eventDate?: string,
) {
  if (!playerId) {
    return;
  }

  await syncInternalEventParticipation(ctx, playerId);
}
