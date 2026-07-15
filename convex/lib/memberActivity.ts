import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

/** Six weeks — matches prior recently-active window. */
export const RECENT_ACTIVITY_MS = 6 * 7 * 24 * 60 * 60 * 1000;

export type PlayerActivityFields = {
  isRecentlyActive: boolean;
  lastActiveAt?: number;
};

/** Derive activity flags from a Yunite play timestamp (tournament start / event date). */
export function activityFromLastActiveAt(
  lastActiveAt: number | undefined,
  now: number = Date.now(),
): PlayerActivityFields {
  if (lastActiveAt === undefined || !Number.isFinite(lastActiveAt)) {
    return { isRecentlyActive: false };
  }

  return {
    isRecentlyActive: lastActiveAt >= now - RECENT_ACTIVITY_MS,
    lastActiveAt,
  };
}

/** Derive activity flags from a stored lastEventDate string. */
export function activityFromLastEventDate(
  lastEventDate: string | undefined,
  now: number = Date.now(),
): PlayerActivityFields {
  if (!lastEventDate) {
    return { isRecentlyActive: false };
  }

  const lastActiveAt = Date.parse(lastEventDate);
  if (Number.isNaN(lastActiveAt)) {
    return { isRecentlyActive: false };
  }

  return activityFromLastActiveAt(lastActiveAt, now);
}

function activityFieldsEqual(
  player: {
    isRecentlyActive?: boolean;
    lastActiveAt?: number;
  },
  next: PlayerActivityFields,
): boolean {
  const currentActive = player.isRecentlyActive ?? false;
  if (currentActive !== next.isRecentlyActive) {
    return false;
  }
  // When there is no event date, we only require the inactive flag (do not clear lastActiveAt).
  if (next.lastActiveAt === undefined) {
    return true;
  }
  return player.lastActiveAt === next.lastActiveAt;
}

/**
 * Recompute isRecentlyActive / lastActiveAt from each player's lastEventDate.
 * Does not stamp processing time — reprocessing old imports must not revive inactive players.
 */
export async function markPlayersRecentlyActive(
  ctx: MutationCtx,
  playerIds: Id<"players">[],
): Promise<number> {
  const now = Date.now();
  let updated = 0;

  for (const playerId of playerIds) {
    const player = await ctx.db.get(playerId);
    if (!player) {
      continue;
    }

    const next = activityFromLastEventDate(player.lastEventDate, now);
    if (activityFieldsEqual(player, next)) {
      continue;
    }

    await ctx.db.patch(playerId, next);
    updated += 1;
  }

  return updated;
}
