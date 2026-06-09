import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

/** Six weeks — matches prior recently-active window. */
export const RECENT_ACTIVITY_MS = 6 * 7 * 24 * 60 * 60 * 1000;

/** Mark players as recently active after import processing touches them. */
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
    if (player.isRecentlyActive === true && player.lastActiveAt === now) {
      continue;
    }
    await ctx.db.patch(playerId, {
      isRecentlyActive: true,
      lastActiveAt: now,
    });
    updated += 1;
  }

  return updated;
}
