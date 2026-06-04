import type { Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx } from "../_generated/server";

/**
 * Link at most one calendar event to a scrim series (and one series per event).
 */
export async function applyLinkedScrimSeries(
  ctx: MutationCtx,
  eventId: Id<"events">,
  seriesId: Id<"scrimSeries"> | undefined,
): Promise<void> {
  if (seriesId) {
    const series = await ctx.db.get(seriesId);
    if (!series) {
      throw new Error("Scrim series not found");
    }

    const otherEvents = await ctx.db
      .query("events")
      .withIndex("by_linked_scrim_series", (q) =>
        q.eq("linkedScrimSeriesId", seriesId),
      )
      .collect();

    for (const other of otherEvents) {
      if (other._id !== eventId) {
        await ctx.db.patch(other._id, { linkedScrimSeriesId: undefined });
      }
    }

    await ctx.db.patch(eventId, { linkedScrimSeriesId: seriesId });
    return;
  }

  await ctx.db.patch(eventId, { linkedScrimSeriesId: undefined });
}
