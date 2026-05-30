import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Batch update player platforms from Yunite registration data.
 * Matches players by discordUserId and sets their platform field.
 */
export const batchUpdatePlatforms = internalMutation({
  args: {
    updates: v.array(
      v.object({
        discordId: v.string(),
        platform: v.union(
          v.literal("PC"),
          v.literal("PS4"),
          v.literal("XB1"),
          v.literal("SWITCH"),
          v.literal("MOBILE")
        ),
      })
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ updated: number; notFound: number; errors: string[] }> => {
    let updated = 0;
    let notFound = 0;
    const errors: string[] = [];

    for (const { discordId, platform } of args.updates) {
      try {
        // Look up player by primary discordUserId
        const player = await ctx.db
          .query("players")
          .withIndex("by_discord_user_id", (q) =>
            q.eq("discordUserId", discordId)
          )
          .first();

        if (!player) {
          notFound++;
          continue;
        }

        // Only patch if platform changed to avoid unnecessary writes
        if (player.platform !== platform) {
          await ctx.db.patch(player._id, { platform });
          updated++;
        } else {
          // Already correct — count as updated (no write needed)
          updated++;
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : `Failed to update discordId ${discordId}`;
        errors.push(msg);
      }
    }

    return { updated, notFound, errors };
  },
});
