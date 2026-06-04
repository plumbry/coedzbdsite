import type { Doc, Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx } from "../_generated/server";
import { collectEventLeaderboardUrls } from "./yunite";

type EventDoc = Doc<"events">;

function isPersistableLeaderboardUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("CSV Import:") &&
    trimmed.includes("yunite")
  );
}

export function leaderboardUrlAlreadyOnEvent(
  event: Pick<
    EventDoc,
    | "standardLeaderboards"
    | "standardLeaderboardsLobby2"
    | "qualifierLobby1Leaderboards"
    | "qualifierLobby2Leaderboards"
    | "finalsLeaderboards"
    | "apiLeaderboards"
  >,
  leaderboardUrl: string,
): boolean {
  const existing = collectEventLeaderboardUrls(event, {
    includeStandardLobby2: true,
  });
  return existing.includes(leaderboardUrl);
}

/**
 * After linking a Yunite import to an event, ensure the tournament URL appears on the
 * event record (standard slots or mini-season qualifier/finals slots).
 */
export async function appendLeaderboardUrlToEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
  leaderboardUrl: string,
): Promise<boolean> {
  if (!isPersistableLeaderboardUrl(leaderboardUrl)) {
    return false;
  }

  const event = await ctx.db.get(eventId);
  if (!event) {
    return false;
  }

  if (leaderboardUrlAlreadyOnEvent(event, leaderboardUrl)) {
    return false;
  }

  if (event.type === "mini-season") {
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    imports.sort((a, b) => {
      if (a.eventDate && b.eventDate) {
        return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
      }
      return a._creationTime - b._creationTime;
    });

    const slotIndex = imports.findIndex(
      (imp) => imp.leaderboardUrl === leaderboardUrl,
    );
    const index = slotIndex >= 0 ? slotIndex : imports.length;

    if (index === 0) {
      const list = [...(event.qualifierLobby1Leaderboards ?? [])];
      list.push(leaderboardUrl);
      await ctx.db.patch(eventId, { qualifierLobby1Leaderboards: list });
      return true;
    }
    if (index === 1) {
      const list = [...(event.qualifierLobby2Leaderboards ?? [])];
      list.push(leaderboardUrl);
      await ctx.db.patch(eventId, { qualifierLobby2Leaderboards: list });
      return true;
    }
    const list = [...(event.finalsLeaderboards ?? [])];
    list.push(leaderboardUrl);
    await ctx.db.patch(eventId, { finalsLeaderboards: list });
    return true;
  }

  const list = [...(event.standardLeaderboards ?? [])];
  list.push(leaderboardUrl);
  await ctx.db.patch(eventId, { standardLeaderboards: list });
  return true;
}
