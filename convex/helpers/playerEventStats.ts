import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

/** Update denormalized eventsPlayedCount / lastEventDate before inserting a new result row. */
export async function touchPlayerEventParticipationOnInsert(
  ctx: MutationCtx,
  playerId: Id<"players"> | undefined,
  eventName: string,
  eventDate?: string,
) {
  if (!playerId) {
    return;
  }

  const [existingManual, existingThird] = await Promise.all([
    ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .filter((q) => q.eq(q.field("eventName"), eventName))
      .first(),
    ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .filter((q) => q.eq(q.field("eventName"), eventName))
      .first(),
  ]);

  const isNewEventName = !existingManual && !existingThird;
  const player = await ctx.db.get(playerId);
  if (!player) {
    return;
  }

  const patch: { eventsPlayedCount?: number; lastEventDate?: string } = {};
  if (isNewEventName) {
    patch.eventsPlayedCount = (player.eventsPlayedCount ?? 0) + 1;
  }
  if (eventDate && (!player.lastEventDate || eventDate > player.lastEventDate)) {
    patch.lastEventDate = eventDate;
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(playerId, patch);
  }
}
