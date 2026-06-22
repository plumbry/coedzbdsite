import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx } from "./_generated/server";
import { getDisplayName, requireAdmin } from "./auth_helpers";
import { relinkEventResultsForPlayer } from "./helpers/playerResults";
import { syncPlayerDiscordAliases } from "./helpers/playerDiscordAliases";
import { internal } from "./_generated/api";
import { diffPatch } from "./helpers/patchIfChanged";
import { ensurePlayerEnrolledInReEval } from "./bigSummerReEval/helpers";
import {
  syncPlayerImportLookupForPlayer,
  upsertPlayerImportLookup,
} from "./helpers/playerImportLookup";
import {
  autoAcceptPendingApplicationForDiscordMember,
  findPendingApplicationForDiscordMember,
  listPendingApplicationMatchKeys,
} from "./helpers/discordApplicationSync";
import { findPlayerByDiscordUserId } from "./helpers/playerDiscordAliases";
import { schedulePublicMemberDirectoryRebuild } from "./helpers/publicMemberDirectory";
import { scheduleGenderSheetRebuild } from "./helpers/genderSheetSchedule";
import {
  sanitizeDiscordNickname,
} from "./lib/discordNicknamePolicy";

type SyncMatchConfidence = "exact" | "username" | "fuzzy" | "manual";

const ADMIN_CACHE_RUN_ID = "admin-cache";

function nicknameForPlayerPatch(
  nickname: string | null | undefined,
  roles: Array<{ id: string; name: string }> | null | undefined,
): string | undefined {
  return sanitizeDiscordNickname(nickname, roles);
}

function hasRealDiscordUserId(discordUserId: string | undefined): boolean {
  return !!discordUserId && !discordUserId.startsWith("placeholder_");
}

/** Slim player row stored on a Discord sync run and used for batch fuzzy matching. */
type DiscordBatchSyncPlayer = {
  _id: Id<"players">;
  discordUserId?: string;
  discordUsername: string;
  epicUsername: string;
  nickname?: string;
  serverJoinDate: string;
  alternateDiscordUserIds?: string[];
  tier?: string;
  status?: string;
  currentMembershipStatus?: string;
  discordRoles?: Array<{ id: string; name: string }>;
  matchConfidence?: SyncMatchConfidence;
  needsReview?: boolean;
  hasLeftServer?: boolean;
};

function toDiscordBatchSyncPlayer(player: Doc<"players">): DiscordBatchSyncPlayer {
  return {
    _id: player._id,
    discordUserId: player.discordUserId,
    discordUsername: player.discordUsername,
    epicUsername: player.epicUsername,
    nickname: player.nickname,
    serverJoinDate: player.serverJoinDate,
    alternateDiscordUserIds: player.alternateDiscordUserIds,
    tier: player.tier,
    status: player.status,
    currentMembershipStatus: player.currentMembershipStatus,
    discordRoles: player.discordRoles,
    matchConfidence: player.matchConfidence,
    needsReview: player.needsReview,
    hasLeftServer: player.hasLeftServer,
  };
}

function isDiscordPlaceholderId(id?: string): boolean {
  return !id || id.startsWith("placeholder_") || id === "imported";
}

/**
 * Batch Discord sync (`syncDiscordMembersBatch`) — may load all players once per batch
 * and run fuzzy matching against that in-memory cache.
 */
async function resolveExistingPlayerForBatchSync(
  ctx: MutationCtx,
  args: {
    discordUserId: string;
    discordUsername: string;
    nickname?: string | null;
  },
  playersCache: DiscordBatchSyncPlayer[],
): Promise<{
  existingPlayer: DiscordBatchSyncPlayer | null;
  matchConfidence: SyncMatchConfidence | null;
}> {
  const epicUsername = args.nickname || args.discordUsername;

  const byPrimary = await ctx.db
    .query("players")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", args.discordUserId))
    .first();
  if (byPrimary) {
    return { existingPlayer: byPrimary, matchConfidence: "exact" };
  }

  const byAlternate =
    playersCache.find((p) => p.alternateDiscordUserIds?.includes(args.discordUserId)) ?? null;
  if (byAlternate) {
    return { existingPlayer: byAlternate, matchConfidence: "exact" };
  }

  const normalizedIncomingDiscord = normalizeUsername(args.discordUsername);
  const byDiscordName =
    playersCache.find(
      (p) =>
        isDiscordPlaceholderId(p.discordUserId) &&
        normalizeUsername(p.discordUsername) === normalizedIncomingDiscord,
    ) ?? null;
  if (byDiscordName) {
    return { existingPlayer: byDiscordName, matchConfidence: "username" };
  }

  if (args.nickname) {
    const normalizedIncomingEpic = normalizeUsername(epicUsername);
    const byEpicName =
      playersCache.find(
        (p) =>
          isDiscordPlaceholderId(p.discordUserId) &&
          normalizeUsername(p.epicUsername) === normalizedIncomingEpic,
      ) ?? null;
    if (byEpicName) {
      return { existingPlayer: byEpicName, matchConfidence: "username" };
    }

    const byNicknameAsEpic =
      playersCache.find(
        (p) =>
          isDiscordPlaceholderId(p.discordUserId) &&
          normalizeUsername(p.epicUsername) === normalizeUsername(args.nickname!),
      ) ?? null;
    if (byNicknameAsEpic) {
      return { existingPlayer: byNicknameAsEpic, matchConfidence: "username" };
    }
  }

  let fuzzyMatch =
    playersCache.find(
      (p) =>
        isDiscordPlaceholderId(p.discordUserId) &&
        areUsernamesSimilar(p.discordUsername, args.discordUsername),
    ) ?? null;
  if (fuzzyMatch) {
    return { existingPlayer: fuzzyMatch, matchConfidence: "fuzzy" };
  }

  if (args.nickname) {
    fuzzyMatch =
      playersCache.find(
        (p) =>
          isDiscordPlaceholderId(p.discordUserId) &&
          areUsernamesSimilar(p.epicUsername, epicUsername),
      ) ?? null;
    if (fuzzyMatch) {
      return { existingPlayer: fuzzyMatch, matchConfidence: "fuzzy" };
    }
  }

  return { existingPlayer: null, matchConfidence: null };
}

/**
 * Webhook-safe player lookup for `upsertDiscordMember` (Discord bot POST /api/discord/sync-member).
 * Uses indexed reads only — never scans the full `players` table.
 */
async function resolveExistingPlayerForWebhookSync(
  ctx: MutationCtx,
  args: {
    discordUserId: string;
    discordUsername: string;
    nickname?: string | null;
  },
): Promise<{
  existingPlayer: Doc<"players"> | null;
  matchConfidence: SyncMatchConfidence | null;
}> {
  const byPrimary = await findPlayerByDiscordUserId(ctx, args.discordUserId);
  if (byPrimary) {
    return { existingPlayer: byPrimary, matchConfidence: "exact" };
  }

  const byDiscordName = await ctx.db
    .query("players")
    .withIndex("by_discord_username", (q) =>
      q.eq("discordUsername", args.discordUsername),
    )
    .collect();
  const placeholderByDiscord = byDiscordName.find((player) =>
    isDiscordPlaceholderId(player.discordUserId),
  );
  if (placeholderByDiscord) {
    return { existingPlayer: placeholderByDiscord, matchConfidence: "username" };
  }

  const epicUsername = args.nickname || args.discordUsername;
  const byEpicName = await ctx.db
    .query("players")
    .withIndex("by_epic_username", (q) => q.eq("epicUsername", epicUsername))
    .collect();
  const placeholderByEpic = byEpicName.find((player) =>
    isDiscordPlaceholderId(player.discordUserId),
  );
  if (placeholderByEpic) {
    return { existingPlayer: placeholderByEpic, matchConfidence: "username" };
  }

  if (args.nickname) {
    const byNickEpic = await ctx.db
      .query("players")
      .withIndex("by_epic_username", (q) => q.eq("epicUsername", args.nickname!))
      .collect();
    const placeholderByNicknameEpic = byNickEpic.find((player) =>
      isDiscordPlaceholderId(player.discordUserId),
    );
    if (placeholderByNicknameEpic) {
      return { existingPlayer: placeholderByNicknameEpic, matchConfidence: "username" };
    }

    const normalizedNickname = normalizeUsername(args.nickname);
    const byEpicFromNickname = await ctx.db.query("players").collect();
    const placeholderByNormalizedEpic = byEpicFromNickname.find(
      (player) =>
        isDiscordPlaceholderId(player.discordUserId) &&
        normalizeUsername(player.epicUsername) === normalizedNickname,
    );
    if (placeholderByNormalizedEpic) {
      return { existingPlayer: placeholderByNormalizedEpic, matchConfidence: "username" };
    }
  }

  return { existingPlayer: null, matchConfidence: null };
}

// Batch-only: archive players missing from the daily Discord member sync.
export const archiveMissingPlayersInternal = internalMutation({
  args: {
    currentDiscordUserIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ archived: number; flagged: number; cleared: number }> => {
    const allPlayers = await ctx.db.query("players").collect();
    const currentDiscordIdsSet = new Set(args.currentDiscordUserIds);
    
    const isPlayerInServer = (player: typeof allPlayers[0]): boolean => {
      if (player.discordUserId && currentDiscordIdsSet.has(player.discordUserId)) return true;
      if (player.alternateDiscordUserIds?.some(id => currentDiscordIdsSet.has(id))) return true;
      return false;
    };
    
    const reviewablePlayers = allPlayers.filter((p) => 
      p.currentMembershipStatus === "accepted" || 
      p.status === "active" ||
      p.status === "discord_member" ||
      p.hasLeftServer === true
    );
    
    let archived = 0;
    let cleared = 0;
    
    for (const player of reviewablePlayers) {
      if (!player.discordUserId && (!player.alternateDiscordUserIds || player.alternateDiscordUserIds.length === 0)) {
        continue;
      }
      
      const isInServer = isPlayerInServer(player);
      const currentlyFlagged = player.hasLeftServer === true;
      const isCurrentlyActive = player.currentMembershipStatus === "accepted" || player.status === "active" || player.status === "discord_member";
      
      if (!isInServer && isCurrentlyActive) {
        await ctx.db.patch(player._id, {
          hasLeftServer: true,
          status: "archived",
          currentMembershipStatus: "former",
          archiveReason: "left server",
        });
        await ctx.db.insert("statusEvents", {
          entityType: "member",
          entityId: player._id,
          discordId: player.discordUserId,
          discordUsername: player.discordUsername,
          previousStatus: player.currentMembershipStatus || player.status || "active",
          newStatus: "former",
          action: "auto-archived",
          reason: "Player no longer appears in Discord server (detected by bot sync)",
          isSystemAction: true,
        });
        archived++;
      } else if (!isInServer && !currentlyFlagged && !isCurrentlyActive) {
        await ctx.db.patch(player._id, { hasLeftServer: true });
        archived++;
      } else if (isInServer && currentlyFlagged) {
        await ctx.db.patch(player._id, { hasLeftServer: false });
        cleared++;
      }
    }
    
    // Archive placeholder ID players
    const isPlaceholderId = (id?: string) => !id || id.startsWith("placeholder_") || id === "imported";
    const stalePlayersWithoutDiscord = allPlayers.filter((p) => {
      if (!isPlaceholderId(p.discordUserId)) return false;
      if (p.alternateDiscordUserIds && p.alternateDiscordUserIds.length > 0) return false;
      const isActive = p.currentMembershipStatus === "accepted" || p.status === "active";
      return isActive;
    });
    
    for (const player of stalePlayersWithoutDiscord) {
      await ctx.db.patch(player._id, {
        status: "archived",
        currentMembershipStatus: "former",
        archiveReason: "left server",
        hasLeftServer: true,
      });
      await ctx.db.insert("statusEvents", {
        entityType: "member",
        entityId: player._id,
        discordId: player.discordUserId,
        discordUsername: player.discordUsername,
        previousStatus: player.currentMembershipStatus || player.status || "active",
        newStatus: "former",
        action: "auto-archived",
        reason: "Player has no real Discord ID - not in server",
        isSystemAction: true,
      });
      archived++;
    }
    
    return { archived, flagged: archived, cleared };
  },
});

export const clearNicknamesForDiscordUsersInternal = internalMutation({
  args: {
    discordUserIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ cleared: number }> => {
    let cleared = 0;
    for (const discordUserId of args.discordUserIds) {
      const player = await ctx.db
        .query("players")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
        .first();
      if (!player?.nickname) {
        continue;
      }
      await ctx.db.patch(player._id, { nickname: undefined });
      cleared++;
    }
    return { cleared };
  },
});

// One-time bulk archive of all active players without real Discord IDs
export const archiveAllWithoutDiscordId = mutation({
  args: {},
  handler: async (ctx): Promise<{ archived: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "User not logged in", code: "UNAUTHENTICATED" });
    }

    const isPlaceholderId = (id?: string) => {
      return !id || id.startsWith("placeholder_") || id === "imported";
    };

    const allPlayers = await ctx.db.query("players").collect();
    const toArchive = allPlayers.filter((p) => {
      if (!isPlaceholderId(p.discordUserId)) return false;
      if (p.alternateDiscordUserIds && p.alternateDiscordUserIds.length > 0) return false;
      const isActive = p.currentMembershipStatus === "accepted" || p.status === "active";
      return isActive;
    });

    let archived = 0;
    for (const player of toArchive) {
      await ctx.db.patch(player._id, {
        status: "archived",
        currentMembershipStatus: "former",
        archiveReason: "left server",
        hasLeftServer: true,
      });

      await ctx.db.insert("statusEvents", {
        entityType: "member",
        entityId: player._id,
        discordId: player.discordUserId,
        discordUsername: player.discordUsername,
        previousStatus: player.currentMembershipStatus || player.status || "active",
        newStatus: "former",
        action: "auto-archived",
        reason: "Bulk archive: player has no real Discord ID - not in server",
        isSystemAction: true,
      });

      archived++;
    }

    return { archived };
  },
});

export const getPlayersForRoleSync = query({
  args: {},
  handler: async (ctx): Promise<Array<{ discordUserId: string; discordUsername: string; tier: string }>> => {
    // Get all active players with tiers
    const allPlayers = await ctx.db.query("players").collect();
    const activePlayers = allPlayers.filter((p) => !p.status || p.status === "active");
    
    // Return only players with tiers and Discord IDs
    return activePlayers
      .filter((p) => p.tier && p.discordUserId)
      .map((p) => ({
        discordUserId: p.discordUserId as string,
        discordUsername: p.discordUsername,
        tier: p.tier as string,
      }));
  },
});

export const archivePlayerByDiscordId = internalMutation({
  args: {
    discordUserId: v.string(),
    reason: v.union(
      v.literal("left server"),
      v.literal("application incomplete"),
      v.literal("no tier role"),
      v.literal("banned"),
      v.literal("other")
    ),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("discordUserId"), args.discordUserId))
      .first();
    
    if (!player) {
      return { success: false, message: "Player not found" };
    }
    
    // Only archive if currently active
    if (player.status && player.status !== "active") {
      return { success: false, message: "Player is not active" };
    }
    
    await ctx.db.patch(player._id, {
      status: "archived",
      archiveReason: args.reason,
    });
    
    return { success: true };
  },
});

export const manualMatchToPlayer = mutation({
  args: {
    discordMemberId: v.id("players"),
    targetPlayerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    // Get both records
    const discordMember = await ctx.db.get(args.discordMemberId);
    const targetPlayer = await ctx.db.get(args.targetPlayerId);

    if (!discordMember) {
      throw new ConvexError({
        message: "Discord member not found",
        code: "NOT_FOUND",
      });
    }

    if (!targetPlayer) {
      throw new ConvexError({
        message: "Target player not found",
        code: "NOT_FOUND",
      });
    }

  const allowedNickname = nicknameForPlayerPatch(
    discordMember.nickname,
    discordMember.discordRoles,
  );

    // Update the target player with Discord member's data
    await ctx.db.patch(args.targetPlayerId, {
      discordUsername: discordMember.discordUsername,
      discordUserId: discordMember.discordUserId,
      epicUsername: discordMember.epicUsername,
    nickname: allowedNickname,
      discordRoles: discordMember.discordRoles,
      serverJoinDate: discordMember.serverJoinDate,
      matchConfidence: "manual" as const,
      needsReview: false,
    });

    // Delete the Discord member record (it's now merged into the target player)
    await ctx.db.delete(args.discordMemberId);

    return { success: true };
  },
});

// Convert a Discord member to an active player (promote from discord_member status)
export const convertToPlayer = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      throw new ConvexError({
        message: "Only admins and moderators can convert Discord members",
        code: "FORBIDDEN",
      });
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }

    if (player.status !== "discord_member") {
      throw new ConvexError({
        message: "Player is not a Discord member — already converted",
        code: "BAD_REQUEST",
      });
    }

    // Promote to active player
    await ctx.db.patch(args.playerId, {
      status: "active",
      currentMembershipStatus: "accepted",
      matchConfidence: "manual",
    });

    // Log the conversion as a status event
    await ctx.db.insert("statusEvents", {
      entityType: "member",
      entityId: args.playerId,
      discordId: player.discordUserId,
      discordUsername: player.discordUsername,
      previousStatus: "discord_member",
      newStatus: "active",
      action: "converted_from_discord",
      performedBy: user._id,
      performedByName: getDisplayName(user),
      isSystemAction: false,
    });

    await ensurePlayerEnrolledInReEval(ctx, args.playerId);

    return { success: true, epicUsername: player.epicUsername };
  },
});

export const backfillEpicUsernamesFromDiscord = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Get all players that have Discord roles (meaning they've been synced from Discord)
    const allPlayers = await ctx.db.query("players").collect();
    const playersWithDiscordData = allPlayers.filter(p => p.discordRoles && p.discordRoles.length > 0);

    let updated = 0;

    for (const player of playersWithDiscordData) {
      // Calculate what the Epic username should be based on Discord data
      // Server nickname is the Epic username, fall back to Discord username
      const expectedEpicUsername = player.nickname || player.discordUsername;

      // Only update if it's different
      if (player.epicUsername !== expectedEpicUsername) {
        await ctx.db.patch(player._id, {
          epicUsername: expectedEpicUsername,
        });
        updated++;
      }
    }

    return { 
      success: true, 
      updated,
      total: playersWithDiscordData.length 
    };
  },
});

export const addAlternateDiscordId = mutation({
  args: {
    playerId: v.id("players"),
    newDiscordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }

    // Check if this Discord ID is already the primary for this player
    if (player.discordUserId === args.newDiscordUserId) {
      throw new ConvexError({
        message: "This Discord ID is already the primary ID for this player",
        code: "CONFLICT",
      });
    }

    // Check if this Discord ID is already in alternates
    if (player.alternateDiscordUserIds?.includes(args.newDiscordUserId)) {
      throw new ConvexError({
        message: "This Discord ID is already an alternate for this player",
        code: "CONFLICT",
      });
    }

    // Check if we already have 2 alternates (max 3 total IDs)
    const currentAlternates = player.alternateDiscordUserIds || [];
    if (currentAlternates.length >= 2) {
      throw new ConvexError({
        message: "Cannot add more than 2 alternate Discord IDs (3 total limit)",
        code: "CONFLICT",
      });
    }

    // Check if this Discord ID is in use by another player
    const allPlayers = await ctx.db.query("players").collect();
    const idInUse = allPlayers.find(p => 
      p._id !== args.playerId && (
        p.discordUserId === args.newDiscordUserId || 
        p.alternateDiscordUserIds?.includes(args.newDiscordUserId)
      )
    );

    if (idInUse) {
      throw new ConvexError({
        message: "This Discord ID is already linked to another player",
        code: "CONFLICT",
      });
    }

    // Add to alternates
    await ctx.db.patch(args.playerId, {
      alternateDiscordUserIds: [...currentAlternates, args.newDiscordUserId],
    });

    await relinkEventResultsForPlayer(ctx, args.playerId);

    return { success: true };
  },
});

export const removeAlternateDiscordId = mutation({
  args: {
    playerId: v.id("players"),
    discordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }

    if (!player.alternateDiscordUserIds?.includes(args.discordUserId)) {
      throw new ConvexError({
        message: "This Discord ID is not an alternate for this player",
        code: "NOT_FOUND",
      });
    }

    // Remove from alternates
    const newAlternates = player.alternateDiscordUserIds.filter(id => id !== args.discordUserId);
    await ctx.db.patch(args.playerId, {
      alternateDiscordUserIds: newAlternates.length > 0 ? newAlternates : undefined,
    });

    return { success: true };
  },
});

export const setAlternateAsPrimary = mutation({
  args: {
    playerId: v.id("players"),
    alternateDiscordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }

    if (!player.alternateDiscordUserIds?.includes(args.alternateDiscordUserId)) {
      throw new ConvexError({
        message: "This Discord ID is not an alternate for this player",
        code: "NOT_FOUND",
      });
    }

    // Swap primary with alternate
    const oldPrimary = player.discordUserId;
    const newAlternates = player.alternateDiscordUserIds
      .filter(id => id !== args.alternateDiscordUserId)
      .concat(oldPrimary);

    await ctx.db.patch(args.playerId, {
      discordUserId: args.alternateDiscordUserId,
      alternateDiscordUserIds: newAlternates,
    });

    await relinkEventResultsForPlayer(ctx, args.playerId);

    return { success: true };
  },
});

// Helper function to normalize usernames for fuzzy matching
function normalizeUsername(username: string): string {
  return username
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ""); // Remove special characters, spaces, etc.
}

// Helper function to strip common gaming prefixes/suffixes
function stripCommonAffixes(username: string): string {
  const normalized = normalizeUsername(username);
  
  // Common prefixes - expanded list
  const prefixes = [
    "ttv", "twitch", "tv", "yt", "youtube", "ig", "insta", "instagram", "tiktok", "tk", "tt",
    "fn", "fortnite", "epic", "discord", "mask", "clan", "team", "squad", "faze", "optic",
    "the", "a", "real", "og", "pro", "x", "xx", "xxx", "i", "im", "its", "is"
  ];
  
  let result = normalized;
  
  // Try removing all prefixes
  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) {
      const withoutPrefix = result.slice(prefix.length);
      // Only strip if there's still a substantial username left
      if (withoutPrefix.length >= 2) {
        result = withoutPrefix;
      }
    }
  }
  
  // Common suffixes - expanded list
  const suffixes = [
    "ttv", "twitch", "tv", "yt", "youtube", "ig", "fn", "fortnite", 
    "pro", "x", "xx", "xxx", "xd", "lol", "gg", "gaming", "plays", "yt",
    "tv", "live", "official", "real", "og"
  ];
  
  // Try removing suffixes
  for (const suffix of suffixes) {
    if (result.endsWith(suffix)) {
      const withoutSuffix = result.slice(0, -suffix.length);
      if (withoutSuffix.length >= 2) {
        result = withoutSuffix;
      }
    }
  }
  
  // Strip trailing numbers if the core is long enough
  const withoutTrailingNumbers = result.replace(/\d+$/, "");
  if (withoutTrailingNumbers.length >= 2 && withoutTrailingNumbers !== result) {
    result = withoutTrailingNumbers;
  }
  
  // Strip leading numbers
  const withoutLeadingNumbers = result.replace(/^\d+/, "");
  if (withoutLeadingNumbers.length >= 2 && withoutLeadingNumbers !== result) {
    result = withoutLeadingNumbers;
  }
  
  return result;
}

// Helper function to check if usernames are similar (handles typos)
function areUsernamesSimilar(username1: string, username2: string): boolean {
  const norm1 = normalizeUsername(username1);
  const norm2 = normalizeUsername(username2);
  
  // Too short to reliably match
  if (norm1.length < 3 || norm2.length < 3) return false;
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Try stripping common prefixes/suffixes
  const stripped1 = stripCommonAffixes(username1);
  const stripped2 = stripCommonAffixes(username2);
  
  // Exact match after stripping affixes (minimum 3 chars)
  if (stripped1 === stripped2 && stripped1.length >= 3) return true;
  
  // Calculate similarity ratio
  const minLength = Math.min(norm1.length, norm2.length);
  const maxLength = Math.max(norm1.length, norm2.length);
  
  // Length difference check - reject if too different
  const lengthDiff = maxLength - minLength;
  if (lengthDiff > Math.max(3, maxLength * 0.3)) return false;
  
  // Substring matching - much more conservative
  // Only match if the substring is at least 60% of the shorter string
  const minSubstringLength = Math.max(5, Math.floor(minLength * 0.6));
  
  // Check if stripped versions have significant overlap
  if (stripped1.length >= minSubstringLength && stripped2.length >= minSubstringLength) {
    if (stripped1.length >= minSubstringLength) {
      if (stripped2.includes(stripped1)) return true;
    }
    if (stripped2.length >= minSubstringLength) {
      if (stripped1.includes(stripped2)) return true;
    }
  }
  
  // Starts/ends with check - require longer matches
  if (norm1.length >= 5 && norm2.length >= 5) {
    const minPrefixSuffixLength = Math.floor(minLength * 0.7);
    
    // Check prefix
    if (norm1.substring(0, minPrefixSuffixLength) === norm2.substring(0, minPrefixSuffixLength)) {
      return true;
    }
    
    // Check suffix
    if (norm1.substring(norm1.length - minPrefixSuffixLength) === 
        norm2.substring(norm2.length - minPrefixSuffixLength)) {
      return true;
    }
  }
  
  // Levenshtein distance - much more conservative
  // Only allow up to 20% edit distance and max 2 characters for shorter names
  const distance = getLevenshteinDistance(norm1, norm2);
  const maxDistance = Math.min(2, Math.floor(maxLength * 0.2));
  if (distance <= maxDistance) return true;
  
  // Check Levenshtein on stripped versions too (conservative)
  if (stripped1.length >= 4 && stripped2.length >= 4) {
    const strippedDistance = getLevenshteinDistance(stripped1, stripped2);
    const strippedMaxDistance = Math.min(2, Math.floor(Math.max(stripped1.length, stripped2.length) * 0.2));
    if (strippedDistance <= strippedMaxDistance) return true;
  }
  
  return false;
}

// Simple Levenshtein distance implementation
function getLevenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = [];

  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

export const listAcceptedDiscordUserIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();
    return players
      .filter(
        (player) =>
          player.currentMembershipStatus === "accepted" &&
          hasRealDiscordUserId(player.discordUserId),
      )
      .map((player) => player.discordUserId as string);
  },
});

/** Discord IDs and pending usernames to include in manual membership sync. */
export const listMembershipSyncDiscordTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const discordUserIds = new Set<string>();

    const players = await ctx.db.query("players").collect();
    for (const player of players) {
      const shouldSync =
        player.currentMembershipStatus === "accepted" ||
        player.currentMembershipStatus === "former" ||
        player.status === "discord_member";

      if (!shouldSync) {
        continue;
      }

      if (hasRealDiscordUserId(player.discordUserId)) {
        discordUserIds.add(player.discordUserId);
      }
      for (const alternateId of player.alternateDiscordUserIds ?? []) {
        if (hasRealDiscordUserId(alternateId)) {
          discordUserIds.add(alternateId);
        }
      }
    }

    const pendingTargets = await listPendingApplicationMatchKeys(ctx);
    for (const discordId of pendingTargets.discordUserIds) {
      discordUserIds.add(discordId);
    }

    return {
      discordUserIds: [...discordUserIds],
      pendingMatchKeys: pendingTargets.matchKeys,
    };
  },
});

export const getDiscordSyncCacheRun = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("discordMemberSyncRuns")
      .withIndex("by_sync_run_id", (q) => q.eq("syncRunId", ADMIN_CACHE_RUN_ID))
      .first();
  },
});

/** Recompute the player matching cache without calling Discord. */
export const rebuildDiscordSyncCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const existingRuns = await ctx.db.query("discordMemberSyncRuns").collect();
    for (const run of existingRuns) {
      await ctx.db.delete(run._id);
    }

    const allPlayers = await ctx.db.query("players").collect();
    await ctx.db.insert("discordMemberSyncRuns", {
      syncRunId: ADMIN_CACHE_RUN_ID,
      players: allPlayers.map(toDiscordBatchSyncPlayer),
      createdAt: Date.now(),
    });

    return { playerCount: allPlayers.length };
  },
});

/** Load all players once per manual Discord sync (shared across batches). */
export const beginDiscordMemberSyncRun = internalMutation({
  args: { syncRunId: v.string() },
  handler: async (ctx, args) => {
    const allPlayers = await ctx.db.query("players").collect();
    await ctx.db.insert("discordMemberSyncRuns", {
      syncRunId: args.syncRunId,
      players: allPlayers.map(toDiscordBatchSyncPlayer),
      createdAt: Date.now(),
    });
  },
});

export const completeDiscordMemberSyncRun = internalMutation({
  args: { syncRunId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("discordMemberSyncRuns")
      .withIndex("by_sync_run_id", (q) => q.eq("syncRunId", args.syncRunId))
      .first();
    if (run) {
      await ctx.db.delete(run._id);
    }
  },
});

// Batch upsert for daily Discord sync — reads player cache from sync run when provided.
export const syncDiscordMembersBatch = internalMutation({
  args: {
    syncRunId: v.optional(v.string()),
    allowMembershipAcceptance: v.optional(v.boolean()),
    members: v.array(
      v.object({
        discordUsername: v.string(),
        discordUserId: v.string(),
        nickname: v.optional(v.string()),
        serverJoinDate: v.string(),
        roles: v.optional(
          v.array(
            v.object({
              id: v.string(),
              name: v.string(),
            }),
          ),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const allowMembershipAcceptance = args.allowMembershipAcceptance ?? false;
    let playersCache: DiscordBatchSyncPlayer[];
    if (args.syncRunId) {
      const run = await ctx.db
        .query("discordMemberSyncRuns")
        .withIndex("by_sync_run_id", (q) => q.eq("syncRunId", args.syncRunId!))
        .unique();
      if (!run) {
        throw new Error(`Discord sync run ${args.syncRunId} not found`);
      }
      playersCache = run.players;
    } else {
      playersCache = (await ctx.db.query("players").collect()).map(toDiscordBatchSyncPlayer);
    }

    let added = 0;
    let updated = 0;
    let autoAccepted = 0;
    let needsCacheRebuild = false;
    const tierRoleNames = ["Tier S", "Tier A", "Tier B", "Tier C", "Tier D"];

    for (const member of args.members) {
      const allowedNickname = nicknameForPlayerPatch(member.nickname, member.roles);
      const epicUsername = allowedNickname || member.discordUsername;
      const hasTierRole = member.roles?.some((role) => tierRoleNames.includes(role.name)) || false;
      const { existingPlayer: matchedPlayer, matchConfidence } = await resolveExistingPlayerForBatchSync(
        ctx,
        {
          discordUserId: member.discordUserId,
          discordUsername: member.discordUsername,
          nickname: allowedNickname,
        },
        playersCache,
      );
      const existingPlayer = matchedPlayer;

      if (existingPlayer) {
        const updateData: {
          discordUsername: string;
          discordUserId: string;
          nickname?: string;
          epicUsername: string;
          serverJoinDate: string;
          discordRoles?: Array<{ id: string; name: string }>;
          tier?: string;
          status?: "active";
          currentMembershipStatus?: "accepted";
          matchConfidence?: SyncMatchConfidence;
          needsReview?: boolean;
          hasLeftServer?: boolean;
        } = {
          discordUsername: member.discordUsername,
          discordUserId: member.discordUserId,
          nickname: allowedNickname,
          epicUsername,
          serverJoinDate: member.serverJoinDate,
          hasLeftServer: false,
        };

        if (member.roles) {
          updateData.discordRoles = member.roles;
          const discordTierRole = member.roles.find((role) => tierRoleNames.includes(role.name));
          if (discordTierRole) {
            const discordTier = discordTierRole.name.replace("Tier ", "");
            if (existingPlayer.tier !== discordTier) {
              updateData.tier = discordTier;
            }
          }
        }

        if (matchConfidence) {
          updateData.matchConfidence = matchConfidence;
          if (matchConfidence === "fuzzy") {
            updateData.needsReview = true;
          }
        }

        if (
          allowMembershipAcceptance &&
          hasTierRole &&
          (existingPlayer.status === "archived" ||
            existingPlayer.currentMembershipStatus === "former")
        ) {
          updateData.status = "active";
          updateData.currentMembershipStatus = "accepted";
        }

        if (
          allowMembershipAcceptance &&
          hasTierRole &&
          (existingPlayer.status === "discord_member" ||
            existingPlayer.currentMembershipStatus === "rejected")
        ) {
          updateData.status = "active";
          updateData.currentMembershipStatus = "accepted";
        }

        const changedFields = diffPatch(existingPlayer, updateData);
        if (changedFields) {
          await ctx.db.patch(existingPlayer._id, changedFields as Partial<Doc<"players">>);
          await syncPlayerDiscordAliases(ctx, {
            _id: existingPlayer._id,
            discordUserId: member.discordUserId,
            alternateDiscordUserIds: existingPlayer.alternateDiscordUserIds,
          });
          await syncPlayerImportLookupForPlayer(ctx, existingPlayer._id);
          if (
            changedFields.currentMembershipStatus !== undefined ||
            changedFields.tier !== undefined
          ) {
            needsCacheRebuild = true;
          }
          updated++;
        }

        const wasAutoAccepted = allowMembershipAcceptance
          ? await autoAcceptPendingApplicationForDiscordMember(ctx, {
              hasTierRole,
              discordUserId: member.discordUserId,
              discordUsername: member.discordUsername,
              playerId: existingPlayer._id,
              nickname: allowedNickname,
            })
          : false;
        if (wasAutoAccepted) {
          needsCacheRebuild = true;
          autoAccepted++;
        }
      } else {
        const pendingApplication = await findPendingApplicationForDiscordMember(ctx, {
          discordUserId: member.discordUserId,
          discordUsername: member.discordUsername,
          nickname: allowedNickname,
        });

        if (pendingApplication?.playerId) {
          const evaluationPlayer = await ctx.db.get(pendingApplication.playerId);
          if (evaluationPlayer) {
            const updateData: {
              discordUsername: string;
              discordUserId: string;
              nickname?: string;
              epicUsername: string;
              serverJoinDate: string;
              discordRoles?: Array<{ id: string; name: string }>;
              tier?: string;
              status?: "active";
              currentMembershipStatus?: "accepted";
              hasLeftServer?: boolean;
            } = {
              discordUsername: member.discordUsername,
              discordUserId: member.discordUserId,
              nickname: allowedNickname,
              epicUsername,
              serverJoinDate: member.serverJoinDate,
              hasLeftServer: false,
            };

            if (member.roles) {
              updateData.discordRoles = member.roles;
              const discordTierRole = member.roles.find((role) =>
                tierRoleNames.includes(role.name),
              );
              if (discordTierRole) {
                const discordTier = discordTierRole.name.replace("Tier ", "");
                if (evaluationPlayer.tier !== discordTier) {
                  updateData.tier = discordTier;
                }
              }
            }

            if (allowMembershipAcceptance && hasTierRole) {
              updateData.status = "active";
              updateData.currentMembershipStatus = "accepted";
            }

            const changedFields = diffPatch(evaluationPlayer, updateData);
            if (changedFields) {
              await ctx.db.patch(evaluationPlayer._id, changedFields as Partial<Doc<"players">>);
              await syncPlayerDiscordAliases(ctx, {
                _id: evaluationPlayer._id,
                discordUserId: member.discordUserId,
                alternateDiscordUserIds: evaluationPlayer.alternateDiscordUserIds,
              });
              await syncPlayerImportLookupForPlayer(ctx, evaluationPlayer._id);
              if (
                changedFields.currentMembershipStatus !== undefined ||
                changedFields.tier !== undefined
              ) {
                needsCacheRebuild = true;
              }
              updated++;
            }

            const wasAutoAccepted = allowMembershipAcceptance
              ? await autoAcceptPendingApplicationForDiscordMember(ctx, {
                  hasTierRole,
                  discordUserId: member.discordUserId,
                  discordUsername: member.discordUsername,
                  playerId: evaluationPlayer._id,
                  nickname: allowedNickname,
                })
              : false;
            if (wasAutoAccepted) {
              needsCacheRebuild = true;
              autoAccepted++;
            }
            continue;
          }
        }

        const playerId = await ctx.db.insert("players", {
          discordUsername: member.discordUsername,
          discordUserId: member.discordUserId,
          nickname: allowedNickname,
          serverJoinDate: member.serverJoinDate,
          epicUsername,
          discordRoles: member.roles,
          status: allowMembershipAcceptance && hasTierRole ? "active" : "discord_member",
          currentMembershipStatus:
            allowMembershipAcceptance && hasTierRole ? "accepted" : undefined,
          matchConfidence: "exact" as const,
        });
        await syncPlayerDiscordAliases(ctx, {
          _id: playerId,
          discordUserId: member.discordUserId,
          alternateDiscordUserIds: undefined,
        });
        await upsertPlayerImportLookup(ctx, {
          _id: playerId,
          discordUserId: member.discordUserId,
          epicUsername,
          discordUsername: member.discordUsername,
        });
        const wasAutoAccepted = allowMembershipAcceptance
          ? await autoAcceptPendingApplicationForDiscordMember(ctx, {
              hasTierRole,
              discordUserId: member.discordUserId,
              discordUsername: member.discordUsername,
              playerId,
              nickname: allowedNickname,
            })
          : false;
        if ((allowMembershipAcceptance && hasTierRole) || wasAutoAccepted) {
          needsCacheRebuild = true;
        }
        if (wasAutoAccepted) {
          autoAccepted++;
        }
        added++;
      }
    }

    if (needsCacheRebuild) {
      await schedulePublicMemberDirectoryRebuild(ctx);
      await scheduleGenderSheetRebuild(ctx);
    }

    return { added, updated, autoAccepted };
  },
});

/** Webhook-safe: Discord bot POST /api/discord/sync-member — indexed lookups only. */
export const upsertDiscordMember = internalMutation({
  args: {
    discordUserId: v.string(),
    discordUsername: v.string(),
    nickname: v.union(v.string(), v.null()),
    joinedAt: v.string(),
    roles: v.union(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
        }),
      ),
      v.null(),
    ),
  },
  handler: async (ctx, args) => {
    const allowedNickname = nicknameForPlayerPatch(args.nickname, args.roles);
    const epicUsername = allowedNickname || args.discordUsername;
    const tierRoleNames = ["Tier S", "Tier A", "Tier B", "Tier C", "Tier D"];
    const hasTierRole =
      args.roles?.some((role) => tierRoleNames.includes(role.name)) || false;

    const { existingPlayer, matchConfidence } = await resolveExistingPlayerForWebhookSync(
      ctx,
      {
        discordUserId: args.discordUserId,
        discordUsername: args.discordUsername,
        nickname: allowedNickname,
      },
    );

    if (existingPlayer) {
      const updateData: {
        discordUsername: string;
        discordUserId: string;
        nickname?: string;
        epicUsername: string;
        serverJoinDate: string;
        discordRoles?: Array<{ id: string; name: string }>;
        tier?: string;
        status?: "active" | "discord_member";
        currentMembershipStatus?: "accepted";
        matchConfidence?: SyncMatchConfidence;
        needsReview?: boolean;
        hasLeftServer?: boolean;
      } = {
        discordUsername: args.discordUsername,
        discordUserId: args.discordUserId,
        nickname: allowedNickname,
        epicUsername,
        serverJoinDate: args.joinedAt,
        hasLeftServer: false,
      };

      if (args.roles) {
        updateData.discordRoles = args.roles;
        const discordTierRole = args.roles.find((role) =>
          tierRoleNames.includes(role.name),
        );
        if (discordTierRole) {
          const discordTier = discordTierRole.name.replace("Tier ", "");
          if (existingPlayer.tier !== discordTier) {
            updateData.tier = discordTier;
          }
        }
      }

      if (matchConfidence) {
        updateData.matchConfidence = matchConfidence;
        if (matchConfidence === "fuzzy") {
          updateData.needsReview = true;
        }
      }

      if (
        hasTierRole &&
        (existingPlayer.status === "archived" ||
          existingPlayer.currentMembershipStatus === "former")
      ) {
        updateData.status = "active";
        updateData.currentMembershipStatus = "accepted";
      }

      if (
        hasTierRole &&
        (existingPlayer.status === "discord_member" ||
          existingPlayer.currentMembershipStatus === "rejected")
      ) {
        updateData.status = "active";
        updateData.currentMembershipStatus = "accepted";
      }

      const changedFields = diffPatch(existingPlayer, updateData);
      if (changedFields) {
        await ctx.db.patch(existingPlayer._id, changedFields as Partial<Doc<"players">>);
        await syncPlayerDiscordAliases(ctx, {
          _id: existingPlayer._id,
          discordUserId: args.discordUserId,
          alternateDiscordUserIds: existingPlayer.alternateDiscordUserIds,
        });
        await syncPlayerImportLookupForPlayer(ctx, existingPlayer._id);
      }

      const autoAccepted = await autoAcceptPendingApplicationForDiscordMember(ctx, {
        hasTierRole,
        discordUserId: args.discordUserId,
        discordUsername: args.discordUsername,
        playerId: existingPlayer._id,
        nickname: allowedNickname,
      });

      if (
        autoAccepted ||
        changedFields?.currentMembershipStatus !== undefined ||
        changedFields?.tier !== undefined
      ) {
        await schedulePublicMemberDirectoryRebuild(ctx);
        await scheduleGenderSheetRebuild(ctx);
      }

      return {
        created: false,
        playerId: existingPlayer._id,
        updated: !!changedFields,
        autoAccepted,
        matchConfidence: matchConfidence || "unknown",
      };
    }

    const pendingApplication = await findPendingApplicationForDiscordMember(ctx, {
      discordUserId: args.discordUserId,
      discordUsername: args.discordUsername,
      nickname: allowedNickname,
    });

    if (pendingApplication?.playerId) {
      const evaluationPlayer = await ctx.db.get(pendingApplication.playerId);
      if (evaluationPlayer) {
        const updateData: {
          discordUsername: string;
          discordUserId: string;
          nickname?: string;
          epicUsername: string;
          serverJoinDate: string;
          discordRoles?: Array<{ id: string; name: string }>;
          tier?: string;
          status?: "active" | "discord_member";
          currentMembershipStatus?: "accepted";
          matchConfidence?: SyncMatchConfidence;
          hasLeftServer?: boolean;
        } = {
          discordUsername: args.discordUsername,
          discordUserId: args.discordUserId,
          nickname: allowedNickname,
          epicUsername,
          serverJoinDate: args.joinedAt,
          hasLeftServer: false,
          matchConfidence: "exact",
        };

        if (args.roles) {
          updateData.discordRoles = args.roles;
          const discordTierRole = args.roles.find((role) =>
            tierRoleNames.includes(role.name),
          );
          if (discordTierRole) {
            const discordTier = discordTierRole.name.replace("Tier ", "");
            if (evaluationPlayer.tier !== discordTier) {
              updateData.tier = discordTier;
            }
          }
        }

        if (hasTierRole) {
          updateData.status = "active";
          updateData.currentMembershipStatus = "accepted";
        }

        const changedFields = diffPatch(evaluationPlayer, updateData);
        if (changedFields) {
          await ctx.db.patch(evaluationPlayer._id, changedFields as Partial<Doc<"players">>);
          await syncPlayerDiscordAliases(ctx, {
            _id: evaluationPlayer._id,
            discordUserId: args.discordUserId,
            alternateDiscordUserIds: evaluationPlayer.alternateDiscordUserIds,
          });
          await syncPlayerImportLookupForPlayer(ctx, evaluationPlayer._id);
        }

        const autoAccepted = await autoAcceptPendingApplicationForDiscordMember(ctx, {
          hasTierRole,
          discordUserId: args.discordUserId,
          discordUsername: args.discordUsername,
          playerId: evaluationPlayer._id,
          nickname: allowedNickname,
        });

        if (
          autoAccepted ||
          changedFields?.currentMembershipStatus !== undefined ||
          changedFields?.tier !== undefined
        ) {
          await schedulePublicMemberDirectoryRebuild(ctx);
          await scheduleGenderSheetRebuild(ctx);
        }

        return {
          created: false,
          playerId: evaluationPlayer._id,
          updated: !!changedFields,
          autoAccepted,
          matchConfidence: "exact",
        };
      }
    }

    const playerId = await ctx.db.insert("players", {
      discordUsername: args.discordUsername,
      discordUserId: args.discordUserId,
      nickname: allowedNickname,
      serverJoinDate: args.joinedAt,
      epicUsername,
      discordRoles: args.roles || undefined,
      status: hasTierRole ? ("active" as const) : ("discord_member" as const),
      currentMembershipStatus: hasTierRole ? ("accepted" as const) : undefined,
      matchConfidence: "exact" as const,
    });
    await syncPlayerDiscordAliases(ctx, {
      _id: playerId,
      discordUserId: args.discordUserId,
      alternateDiscordUserIds: undefined,
    });
    await upsertPlayerImportLookup(ctx, {
      _id: playerId,
      discordUserId: args.discordUserId,
      epicUsername,
      discordUsername: args.discordUsername,
    });

    const autoAccepted = await autoAcceptPendingApplicationForDiscordMember(ctx, {
      hasTierRole,
      discordUserId: args.discordUserId,
      discordUsername: args.discordUsername,
      playerId,
      nickname: allowedNickname,
    });

    if (hasTierRole || autoAccepted) {
      await schedulePublicMemberDirectoryRebuild(ctx);
      await scheduleGenderSheetRebuild(ctx);
    }

    return { created: true, playerId, autoAccepted, matchConfidence: "exact" };
  },
});
