import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export function normalizeDiscordUsernameForMatch(username: string): string {
  return username.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function epicUsernameFromFortniteProfileLink(fortniteProfileLink: string): string | null {
  try {
    const lastSegment = fortniteProfileLink.split("/").filter(Boolean).pop();
    if (!lastSegment) {
      return null;
    }
    return decodeURIComponent(lastSegment);
  } catch {
    return null;
  }
}

function applicationMatchesDiscordIdentity(
  application: Doc<"applications">,
  args: {
    discordUserId: string;
    discordUsername: string;
    nickname?: string | null;
    normalizedDiscordUsername: string;
    normalizedNickname: string | null;
  },
): boolean {
  if (args.discordUserId && application.discordId === args.discordUserId) {
    return true;
  }

  const normalizedApplicationUsername = normalizeDiscordUsernameForMatch(
    application.discordUsername,
  );
  if (normalizedApplicationUsername === args.normalizedDiscordUsername) {
    return true;
  }

  if (
    args.normalizedNickname &&
    normalizedApplicationUsername === args.normalizedNickname
  ) {
    return true;
  }

  const epicFromLink = epicUsernameFromFortniteProfileLink(application.fortniteProfileLink);
  if (epicFromLink) {
    const normalizedEpic = normalizeDiscordUsernameForMatch(epicFromLink);
    if (
      normalizedEpic === args.normalizedDiscordUsername ||
      (args.normalizedNickname && normalizedEpic === args.normalizedNickname)
    ) {
      return true;
    }
  }

  return false;
}

/** Indexed pending-application lookup for Discord sync (webhook-safe). */
export async function findPendingApplicationForDiscordMember(
  ctx: MutationCtx,
  args: {
    discordUserId: string;
    discordUsername: string;
    playerId?: Id<"players">;
    nickname?: string | null;
  },
): Promise<Doc<"applications"> | null> {
  if (args.playerId) {
    const byPlayer = await ctx.db
      .query("applications")
      .withIndex("by_player_id", (q) => q.eq("playerId", args.playerId))
      .collect();
    const pendingByPlayer = byPlayer.find((app) => app.status === "pending");
    if (pendingByPlayer) {
      return pendingByPlayer;
    }
  }

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

  const normalizedDiscordUsername = normalizeDiscordUsernameForMatch(args.discordUsername);
  const normalizedNickname = args.nickname
    ? normalizeDiscordUsernameForMatch(args.nickname)
    : null;

  const byUsername = await ctx.db
    .query("applications")
    .withIndex("by_discord_username", (q) =>
      q.eq("discordUsername", args.discordUsername),
    )
    .collect();
  const exactUsernameMatch = byUsername.find((app) => app.status === "pending");
  if (exactUsernameMatch) {
    return exactUsernameMatch;
  }

  const pendingApplications = await ctx.db
    .query("applications")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .collect();

  return (
    pendingApplications.find((app) =>
      applicationMatchesDiscordIdentity(app, {
        discordUserId: args.discordUserId,
        discordUsername: args.discordUsername,
        nickname: args.nickname,
        normalizedDiscordUsername,
        normalizedNickname,
      }),
    ) ?? null
  );
}

export async function autoAcceptPendingApplicationForDiscordMember(
  ctx: MutationCtx,
  args: {
    hasTierRole: boolean;
    discordUserId: string;
    discordUsername: string;
    playerId: Id<"players">;
    nickname?: string | null;
  },
): Promise<boolean> {
  if (!args.hasTierRole) {
    return false;
  }

  const matchingApplication = await findPendingApplicationForDiscordMember(ctx, {
    discordUserId: args.discordUserId,
    discordUsername: args.discordUsername,
    playerId: args.playerId,
    nickname: args.nickname,
  });
  if (!matchingApplication) {
    return false;
  }

  await ctx.db.patch(matchingApplication._id, {
    status: "accepted",
    acceptedAt: Date.now(),
    autoAcceptedByDiscordSync: true,
    playerId: args.playerId,
    discordId: matchingApplication.discordId || args.discordUserId,
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

/** Normalized lookup keys for pending applications (Discord username + Epic from tracker link). */
export async function listPendingApplicationMatchKeys(
  ctx: QueryCtx,
): Promise<{ discordUserIds: string[]; matchKeys: string[] }> {
  const discordUserIds = new Set<string>();
  const matchKeys = new Set<string>();

  const pendingApplications = await ctx.db
    .query("applications")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .collect();

  for (const application of pendingApplications) {
    const discordId = application.discordId?.trim();
    if (discordId) {
      discordUserIds.add(discordId);
    }

    matchKeys.add(normalizeDiscordUsernameForMatch(application.discordUsername));

    const epicFromLink = epicUsernameFromFortniteProfileLink(application.fortniteProfileLink);
    if (epicFromLink) {
      matchKeys.add(normalizeDiscordUsernameForMatch(epicFromLink));
    }

    if (application.playerId) {
      const player = await ctx.db.get(application.playerId);
      if (player?.epicUsername) {
        matchKeys.add(normalizeDiscordUsernameForMatch(player.epicUsername));
      }
    }
  }

  return {
    discordUserIds: [...discordUserIds],
    matchKeys: [...matchKeys],
  };
}
