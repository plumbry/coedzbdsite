import { mutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

/**
 * One-time migration to set currentMembershipStatus for all existing players
 * Maps old status field to new currentMembershipStatus:
 * - "active" → "accepted"
 * - "archived" → "former"
 * - "rejected" → "rejected"
 * - "discord_member" → no status (not yet evaluated)
 * - undefined/null → "accepted" (default for legacy players)
 */
export const migratePlayerMembershipStatus = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const allPlayers = await ctx.db.query("players").collect();
    
    let updatedCount = 0;
    let skippedCount = 0;

    for (const player of allPlayers) {
      // Skip if already has currentMembershipStatus
      if (player.currentMembershipStatus) {
        skippedCount++;
        continue;
      }

      let newStatus: "accepted" | "rejected" | "former" | undefined;

      // Map old status to new status
      if (player.status === "active" || !player.status) {
        newStatus = "accepted";
      } else if (player.status === "archived") {
        newStatus = "former";
      } else if (player.status === "rejected") {
        newStatus = "rejected";
      } else if (player.status === "discord_member") {
        // Don't set status for discord_member - they haven't been evaluated yet
        newStatus = undefined;
      }

      if (newStatus) {
        await ctx.db.patch(player._id, {
          currentMembershipStatus: newStatus,
        });
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    return {
      success: true,
      totalPlayers: allPlayers.length,
      updated: updatedCount,
      skipped: skippedCount,
      message: `Migration complete: ${updatedCount} players updated, ${skippedCount} skipped`,
    };
  },
});
