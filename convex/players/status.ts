import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";
import { logAudit } from "../helpers/audit";

export const updatePlayerStatus = mutation({
  args: {
    playerId: v.id("players"),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("rejected")
    ),
    rejectionReason: v.optional(v.string()),
    archiveReason: v.optional(v.union(
      v.literal("left server"),
      v.literal("application incomplete"),
      v.literal("no tier role"),
      v.literal("banned"),
      v.literal("other")
    )),
  },
  handler: async (ctx, args) => {
    // Only admins can change player status
    const user = await requireAdmin(ctx);
    
    // Get current player state
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    const previousStatus = player.status || "active";
    const playerName = player.discordUsername || "Unknown Player";
    
    // Update player status
    const updateData: {
      status: "active" | "archived" | "rejected";
      currentMembershipStatus: "accepted" | "former" | "rejected";
      rejectionReason?: string;
      archiveReason?: "left server" | "application incomplete" | "no tier role" | "banned" | "other";
    } = {
      status: args.status,
      // Map status to currentMembershipStatus to keep both systems in sync
      currentMembershipStatus: args.status === "active" ? "accepted" : args.status === "archived" ? "former" : "rejected",
    };
    
    // If rejecting, require and store rejection reason
    if (args.status === "rejected") {
      updateData.rejectionReason = args.rejectionReason || "No reason provided";
      updateData.archiveReason = undefined;
    } else if (args.status === "archived") {
      // If archiving, store archive reason
      updateData.archiveReason = args.archiveReason || "other";
      updateData.rejectionReason = undefined;
    } else {
      // Clear both reasons if status is active
      updateData.rejectionReason = undefined;
      updateData.archiveReason = undefined;
    }
    
    await ctx.db.patch(args.playerId, updateData);
    
    // Log audit
    let details = `Changed status for ${playerName} from "${previousStatus}" to "${args.status}"`;
    if (args.status === "rejected" && args.rejectionReason) {
      details += ` (Reason: ${args.rejectionReason})`;
    } else if (args.status === "archived" && args.archiveReason) {
      details += ` (Reason: ${args.archiveReason})`;
    }
    
    await logAudit(ctx, {
      userId: user._id,
      userName: user.name || user.email,
      action: "player_status_changed",
      entityType: "player",
      entityId: args.playerId,
      details,
      previousValue: previousStatus,
      newValue: args.status,
    });
    
    return { success: true };
  },
});
