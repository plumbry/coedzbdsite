import type { Doc, Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx } from "../_generated/server";
import { collectEventLeaderboardUrls } from "./yunite";

type EventLeaderboardFields = Pick<
  Doc<"events">,
  | "type"
  | "twoLobbies"
  | "standardLeaderboards"
  | "standardLeaderboardsLobby2"
  | "qualifierLobby1Leaderboards"
  | "qualifierLobby2Leaderboards"
  | "finalsLeaderboards"
  | "linkedScrimSeriesId"
>;

export const EVENT_YUNITE_REQUIRED_MESSAGE =
  "Event must have at least one Yunite leaderboard URL, a linked Yunite import, or a linked Scrim Series before saving.";

export function eventHasLeaderboardUrls(event: EventLeaderboardFields): boolean {
  return (
    collectEventLeaderboardUrls(event, { includeStandardLobby2: true }).length > 0
  );
}

export function eventHasLinkedScrimSeries(
  event: Pick<EventLeaderboardFields, "type" | "linkedScrimSeriesId">,
): boolean {
  return event.type === "scrim-series" && !!event.linkedScrimSeriesId;
}

export async function countLinkedImportsForEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<number> {
  const imports = await ctx.db
    .query("thirdPartyImports")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  return imports.length;
}

export async function eventMeetsYuniteMinimum(
  ctx: MutationCtx,
  event: EventLeaderboardFields,
  eventId?: Id<"events">,
): Promise<boolean> {
  if (eventHasLeaderboardUrls(event)) {
    return true;
  }
  if (eventHasLinkedScrimSeries(event)) {
    return true;
  }
  if (eventId) {
    const linkedImportCount = await countLinkedImportsForEvent(ctx, eventId);
    if (linkedImportCount > 0) {
      return true;
    }
  }
  return false;
}
