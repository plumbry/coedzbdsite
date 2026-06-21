import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function normalizeDiscordUsernameForMatch(username: string): string {
  return username.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

/** Indexed pending-application lookup for Discord sync (webhook-safe). */
export async function findPendingApplicationForDiscordMember(
  ctx: MutationCtx,
  args: { discordUserId: string; discordUsername: string },
): Promise<Doc<"applications"> | null> {
  if (args.discordUserId) {
    const byDiscordId = await ctx.db
      .query("applications")
      .withIndex("by_discord_id_and_status", (q) =>
        q.eq("discordId", args.discordUserId).eq("status", "pending"),
      )
      .first();
    if (byDiscordId) {
      return byDiscordId;
    }
  }

  const byUsername = await ctx.db
    .query("applications")
    .withIndex("by_discord_username", (q) =>
      q.eq("discordUsername", args.discordUsername),
    )
    .collect();

  const normalizedIncoming = normalizeDiscordUsernameForMatch(args.discordUsername);
  return (
    byUsername.find((app) => app.status === "pending") ??
    (await ctx.db
      .query("applications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect())
      .find(
        (app) =>
          normalizeDiscordUsernameForMatch(app.discordUsername) === normalizedIncoming,
      ) ??
    null
  );
}

export async function autoAcceptPendingApplicationForDiscordMember(
  ctx: MutationCtx,
  args: {
    hasTierRole: boolean;
    discordUserId: string;
    discordUsername: string;
    playerId: Id<"players">;
  },
): Promise<boolean> {
  if (!args.hasTierRole) {
    return false;
  }

  const matchingApplication = await findPendingApplicationForDiscordMember(ctx, {
    discordUserId: args.discordUserId,
    discordUsername: args.discordUsername,
  });
  if (!matchingApplication) {
    return false;
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

  return true;
}
