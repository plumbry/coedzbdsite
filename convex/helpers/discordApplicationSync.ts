import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Indexed pending-application lookup for Discord sync (webhook-safe). */
export async function findPendingApplicationForDiscordMember(
  ctx: MutationCtx,
  args: { discordUserId: string; discordUsername: string },
): Promise<Doc<"applications"> | null> {
  const byDiscordId = await ctx.db
    .query("applications")
    .withIndex("by_discord_id_and_status", (q) =>
      q.eq("discordId", args.discordUserId).eq("status", "pending"),
    )
    .first();
  if (byDiscordId) {
    return byDiscordId;
  }

  const byUsername = await ctx.db
    .query("applications")
    .withIndex("by_discord_username", (q) =>
      q.eq("discordUsername", args.discordUsername),
    )
    .collect();

  return byUsername.find((app) => app.status === "pending") ?? null;
}

export async function autoAcceptPendingApplicationForDiscordMember(
  ctx: MutationCtx,
  args: {
    hasTierRole: boolean;
    discordUserId: string;
    discordUsername: string;
    playerId: Id<"players">;
  },
): Promise<void> {
  if (!args.hasTierRole) {
    return;
  }

  const matchingApplication = await findPendingApplicationForDiscordMember(ctx, {
    discordUserId: args.discordUserId,
    discordUsername: args.discordUsername,
  });
  if (!matchingApplication) {
    return;
  }

  await ctx.db.patch(matchingApplication._id, {
    status: "accepted",
    acceptedAt: Date.now(),
    autoAcceptedByDiscordSync: true,
    playerId: args.playerId,
    processedByName: "System (Discord sync)",
  });

  await ctx.db.insert("statusEvents", {
    entityType: "application",
    entityId: matchingApplication._id,
    discordId: matchingApplication.discordId || args.discordUserId,
    discordUsername: matchingApplication.discordUsername,
    previousStatus: "pending",
    newStatus: "accepted",
    action: "auto-accepted-from-discord-sync",
    reason: "Discord member joined with a tier role",
    isSystemAction: true,
  });
}
