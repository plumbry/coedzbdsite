"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { requireAdminAction } from "../auth_helpers";
import { normalizeDiscordUsernameForMatch } from "../helpers/discordApplicationSync";
import {
  canUseDiscordNickname,
  sanitizeDiscordNickname,
} from "../lib/discordNicknamePolicy";

const SYNC_BATCH_SIZE = 25;
const ADMIN_CACHE_RUN_ID = "admin-cache";
const CHANGE_NICKNAME_PERMISSION = 1n << 26n;

interface DiscordMember {
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
  };
  nick: string | null;
  joined_at: string;
  roles?: string[];
}

interface DiscordRole {
  id: string;
  name: string;
  permissions?: string;
}

type SyncResult = {
  success: boolean;
  totalMembers: number;
  added: number;
  updated: number;
  skipped: number;
  autoAccepted: number;
  archived?: number;
  nicknamesCleared?: number;
  nicknamePermissionRolesUpdated?: number;
};

function formatDiscordUsername(user: DiscordMember["user"]): string {
  return user.discriminator === "0"
    ? user.username
    : `${user.username}#${user.discriminator}`;
}

function memberToBatchPayload(
  member: DiscordMember,
  roleNameById: Map<string, string>,
) {
  const roles = (member.roles ?? [])
    .map((roleId) => {
      const name = roleNameById.get(roleId);
      return name ? { id: roleId, name } : null;
    })
    .filter((role): role is { id: string; name: string } => role !== null);
  const nickname = sanitizeDiscordNickname(member.nick, roles);

  return {
    discordUsername: formatDiscordUsername(member.user),
    discordUserId: member.user.id,
    nickname,
    serverJoinDate: member.joined_at,
    roles,
  };
}

function memberRoles(
  member: DiscordMember,
  roleNameById: Map<string, string>,
): Array<{ id: string; name: string }> {
  return (member.roles ?? [])
    .map((roleId) => {
      const name = roleNameById.get(roleId);
      return name ? { id: roleId, name } : null;
    })
    .filter((role): role is { id: string; name: string } => role !== null);
}

async function fetchGuildRoleMap(
  discordBotToken: string,
  discordGuildId: string,
): Promise<Map<string, string>> {
  const guildRoles = await fetchGuildRoles(discordBotToken, discordGuildId);
  const roleNameById = new Map<string, string>();
  for (const role of guildRoles) {
    roleNameById.set(role.id, role.name);
  }
  return roleNameById;
}

async function fetchGuildRoles(
  discordBotToken: string,
  discordGuildId: string,
): Promise<DiscordRole[]> {
  const rolesResponse = await fetch(
    `https://discord.com/api/v10/guilds/${discordGuildId}/roles`,
    { headers: { Authorization: `Bot ${discordBotToken}` } },
  );
  if (!rolesResponse.ok) {
    const errorText = await rolesResponse.text();
    throw new Error(`Discord roles API error: ${rolesResponse.status} - ${errorText}`);
  }
  return await rolesResponse.json();
}

async function patchGuildRolePermissions(
  discordBotToken: string,
  discordGuildId: string,
  roleId: string,
  permissions: bigint,
): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${discordGuildId}/roles/${roleId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${discordBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ permissions: permissions.toString() }),
    },
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord role patch error: ${response.status} - ${errorText}`);
  }
}

async function removeViewerNicknamePermissions(
  discordBotToken: string,
  discordGuildId: string,
  guildRoles: DiscordRole[],
): Promise<number> {
  let rolesUpdated = 0;
  for (const role of guildRoles) {
    const roleName = role.name.toLowerCase();
    const controlsViewerAccess = role.id === discordGuildId || roleName === "viewer";
    if (!controlsViewerAccess || !role.permissions) {
      continue;
    }

    const permissions = BigInt(role.permissions);
    if ((permissions & CHANGE_NICKNAME_PERMISSION) === 0n) {
      continue;
    }

    await patchGuildRolePermissions(
      discordBotToken,
      discordGuildId,
      role.id,
      permissions & ~CHANGE_NICKNAME_PERMISSION,
    );
    rolesUpdated++;
  }
  return rolesUpdated;
}

async function clearViewerOnlyDiscordNicknames(
  discordBotToken: string,
  discordGuildId: string,
  members: DiscordMember[],
  roleNameById: Map<string, string>,
): Promise<{ cleared: number; discordUserIds: string[]; errors: number }> {
  let cleared = 0;
  let errors = 0;
  const discordUserIds: string[] = [];

  for (const member of members) {
    if (!member.nick) {
      continue;
    }
    const roles = memberRoles(member, roleNameById);
    if (canUseDiscordNickname(roles)) {
      continue;
    }

    const response = await fetch(
      `https://discord.com/api/v10/guilds/${discordGuildId}/members/${member.user.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${discordBotToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nick: null }),
      },
    );

    if (!response.ok) {
      errors++;
      continue;
    }

    member.nick = null;
    discordUserIds.push(member.user.id);
    cleared++;
  }

  return { cleared, discordUserIds, errors };
}

async function fetchGuildMember(
  discordBotToken: string,
  discordGuildId: string,
  discordUserId: string,
): Promise<DiscordMember | null> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${discordGuildId}/members/${discordUserId}`,
    { headers: { Authorization: `Bot ${discordBotToken}` } },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord API error: ${response.status} - ${errorText}`);
  }
  return response.json();
}

async function fetchAllGuildMembers(
  discordBotToken: string,
  discordGuildId: string,
): Promise<DiscordMember[]> {
  let allMembers: DiscordMember[] = [];
  let after: string | undefined;

  while (true) {
    const url = new URL(`https://discord.com/api/v10/guilds/${discordGuildId}/members`);
    url.searchParams.set("limit", "1000");
    if (after) {
      url.searchParams.set("after", after);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bot ${discordBotToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord API error: ${response.status} - ${errorText}`);
    }

    const members: DiscordMember[] = await response.json();
    if (members.length === 0) {
      break;
    }

    allMembers = allMembers.concat(members);
    if (members.length < 1000) {
      break;
    }
    after = members[members.length - 1].user.id;
  }

  return allMembers.filter((m) => !m.user.id.startsWith("bot_"));
}

function getDiscordConfig() {
  const discordBotToken = process.env.DISCORD_BOT_TOKEN;
  const discordGuildId = process.env.DISCORD_GUILD_ID;
  if (!discordBotToken) {
    throw new Error("DISCORD_BOT_TOKEN environment variable is not set");
  }
  if (!discordGuildId) {
    throw new Error("DISCORD_GUILD_ID environment variable is not set");
  }
  return { discordBotToken, discordGuildId };
}

function memberMatchesMembershipSyncTargets(
  member: DiscordMember,
  discordUserIdSet: Set<string>,
  pendingMatchKeySet: Set<string>,
): boolean {
  if (discordUserIdSet.has(member.user.id)) {
    return true;
  }

  const formattedUsername = formatDiscordUsername(member.user);
  if (pendingMatchKeySet.has(normalizeDiscordUsernameForMatch(formattedUsername))) {
    return true;
  }

  if (pendingMatchKeySet.has(normalizeDiscordUsernameForMatch(member.user.username))) {
    return true;
  }

  if (member.nick && pendingMatchKeySet.has(normalizeDiscordUsernameForMatch(member.nick))) {
    return true;
  }

  return false;
}

async function ensureSyncRun(ctx: ActionCtx): Promise<string> {
  const existing = await ctx.runQuery(internal.discord.getDiscordSyncCacheRun, {});
  if (existing) {
    return existing.syncRunId;
  }
  const syncRunId = crypto.randomUUID();
  await ctx.runMutation(internal.discord.beginDiscordMemberSyncRun, { syncRunId });
  return syncRunId;
}

type SingleMemberSyncResult = {
  success: boolean;
  discordUserId: string;
  added: number;
  updated: number;
  autoAccepted: number;
  unchanged: boolean;
};

/** Admin-only: sync one Discord guild member into the database. */
export const syncSingleDiscordMember = action({
  args: {
    discordUserId: v.string(),
  },
  handler: async (ctx, args): Promise<SingleMemberSyncResult> => {
    await requireAdminAction(ctx);
    const { discordBotToken, discordGuildId } = getDiscordConfig();

    const member = await fetchGuildMember(
      discordBotToken,
      discordGuildId,
      args.discordUserId,
    );
    if (!member) {
      throw new Error(`Discord member ${args.discordUserId} not found in guild`);
    }

    const guildRoles = await fetchGuildRoles(discordBotToken, discordGuildId);
    const roleNameById = new Map(guildRoles.map((role) => [role.id, role.name]));
    await removeViewerNicknamePermissions(discordBotToken, discordGuildId, guildRoles);
    const nicknameCleanup = await clearViewerOnlyDiscordNicknames(
      discordBotToken,
      discordGuildId,
      [member],
      roleNameById,
    );
    if (nicknameCleanup.discordUserIds.length > 0) {
      await ctx.runMutation(internal.discord.clearNicknamesForDiscordUsersInternal, {
        discordUserIds: nicknameCleanup.discordUserIds,
      });
    }
    const syncRunId = await ensureSyncRun(ctx);

    const result: { added: number; updated: number; autoAccepted: number } = await ctx.runMutation(
      internal.discord.syncDiscordMembersBatch,
      {
        syncRunId,
        allowMembershipAcceptance: true,
        members: [memberToBatchPayload(member, roleNameById)],
      },
    );

    return {
      success: true,
      discordUserId: args.discordUserId,
      added: result.added,
      updated: result.updated,
      autoAccepted: result.autoAccepted,
      unchanged: result.added === 0 && result.updated === 0,
    };
  },
});

/** Full guild member sync — used by the daily cron and archives players who left the server. */
async function fetchAndSyncAllDiscordMembers(
  ctx: ActionCtx,
  options: { allowMembershipAcceptance: boolean },
): Promise<SyncResult> {
  const { discordBotToken, discordGuildId } = getDiscordConfig();

  try {
    await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
      syncType: "discord",
      status: "in_progress",
    });

    const guildRoles = await fetchGuildRoles(discordBotToken, discordGuildId);
    const roleNameById = new Map(guildRoles.map((role) => [role.id, role.name]));
    const allMembers = await fetchAllGuildMembers(discordBotToken, discordGuildId);
    const nicknamePermissionRolesUpdated = await removeViewerNicknamePermissions(
      discordBotToken,
      discordGuildId,
      guildRoles,
    );
    const nicknameCleanup = await clearViewerOnlyDiscordNicknames(
      discordBotToken,
      discordGuildId,
      allMembers,
      roleNameById,
    );
    if (nicknameCleanup.discordUserIds.length > 0) {
      await ctx.runMutation(internal.discord.clearNicknamesForDiscordUsersInternal, {
        discordUserIds: nicknameCleanup.discordUserIds,
      });
    }

    let added = 0;
    let updated = 0;
    let autoAccepted = 0;
    const discordUserIds: string[] = [];
    const syncRunId = crypto.randomUUID();

    await ctx.runMutation(internal.discord.beginDiscordMemberSyncRun, { syncRunId });

    try {
      for (let i = 0; i < allMembers.length; i += SYNC_BATCH_SIZE) {
        const batch = allMembers.slice(i, i + SYNC_BATCH_SIZE).map((member) => {
          discordUserIds.push(member.user.id);
          return memberToBatchPayload(member, roleNameById);
        });

        const result = await ctx.runMutation(internal.discord.syncDiscordMembersBatch, {
          syncRunId,
          allowMembershipAcceptance: options.allowMembershipAcceptance,
          members: batch,
        });
        added += result.added;
        updated += result.updated;
        autoAccepted += result.autoAccepted;

        await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
          syncType: "discord",
          status: "in_progress",
          recordsAdded: allMembers.length,
          recordsUpdated: Math.min(i + SYNC_BATCH_SIZE, allMembers.length),
        });
      }
    } finally {
      await ctx.runMutation(internal.discord.completeDiscordMemberSyncRun, { syncRunId });
    }

    const archiveResult: { archived: number } = await ctx.runMutation(
      internal.discord.archiveMissingPlayersInternal,
      { currentDiscordUserIds: discordUserIds },
    );

    await ctx.runMutation(internal.memberManagement.storePublicMemberDirectoryCache, {});

    await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
      syncType: "discord",
      status: "success",
      recordsAdded: added,
      recordsUpdated: updated,
      recordsArchived: archiveResult.archived,
    });

    return {
      success: true,
      totalMembers: allMembers.length,
      added,
      updated,
      skipped: 0,
      autoAccepted,
      archived: archiveResult.archived,
      nicknamesCleared: nicknameCleanup.cleared,
      nicknamePermissionRolesUpdated,
    };
  } catch (error) {
    await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
      syncType: "discord",
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// Daily cron entry point (05:00 UTC).
export const syncDiscordMembersInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await fetchAndSyncAllDiscordMembers(ctx, { allowMembershipAcceptance: true });
  },
});

/** Admin-only: full guild sync (same as daily cron). */
export const syncAllGuildMembers = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    await requireAdminAction(ctx);
    return await fetchAndSyncAllDiscordMembers(ctx, { allowMembershipAcceptance: true });
  },
});

/** Admin-only: remove viewer nickname permissions and clear viewer-only nicknames now. */
export const enforceViewerNicknamePolicy = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    success: boolean;
    membersChecked: number;
    nicknamesCleared: number;
    nicknamePermissionRolesUpdated: number;
    errors: number;
  }> => {
    await requireAdminAction(ctx);
    const { discordBotToken, discordGuildId } = getDiscordConfig();
    const guildRoles = await fetchGuildRoles(discordBotToken, discordGuildId);
    const roleNameById = new Map(guildRoles.map((role) => [role.id, role.name]));
    const nicknamePermissionRolesUpdated = await removeViewerNicknamePermissions(
      discordBotToken,
      discordGuildId,
      guildRoles,
    );
    const allMembers = await fetchAllGuildMembers(discordBotToken, discordGuildId);
    const nicknameCleanup = await clearViewerOnlyDiscordNicknames(
      discordBotToken,
      discordGuildId,
      allMembers,
      roleNameById,
    );
    if (nicknameCleanup.discordUserIds.length > 0) {
      await ctx.runMutation(internal.discord.clearNicknamesForDiscordUsersInternal, {
        discordUserIds: nicknameCleanup.discordUserIds,
      });
    }

    return {
      success: true,
      membersChecked: allMembers.length,
      nicknamesCleared: nicknameCleanup.cleared,
      nicknamePermissionRolesUpdated,
      errors: nicknameCleanup.errors,
    };
  },
});

/** Admin-only: sync accepted, former, pending-application, and Discord-tab members. */
export const syncAcceptedMembers = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    await requireAdminAction(ctx);
    const { discordBotToken, discordGuildId } = getDiscordConfig();

    const targets = await ctx.runQuery(internal.discord.listMembershipSyncDiscordTargets, {});
    const discordUserIdSet = new Set(targets.discordUserIds);
    const pendingMatchKeySet = new Set(targets.pendingMatchKeys);

    if (discordUserIdSet.size === 0 && pendingMatchKeySet.size === 0) {
      return {
        success: true,
        totalMembers: 0,
        added: 0,
        updated: 0,
        skipped: 0,
        autoAccepted: 0,
      };
    }

    try {
      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "discord",
        status: "in_progress",
        recordsAdded: discordUserIdSet.size + pendingMatchKeySet.size,
        recordsUpdated: 0,
      });

      const guildRoles = await fetchGuildRoles(discordBotToken, discordGuildId);
      const roleNameById = new Map(guildRoles.map((role) => [role.id, role.name]));
      const allMembers = await fetchAllGuildMembers(discordBotToken, discordGuildId);
      const nicknamePermissionRolesUpdated = await removeViewerNicknamePermissions(
        discordBotToken,
        discordGuildId,
        guildRoles,
      );
      const nicknameCleanup = await clearViewerOnlyDiscordNicknames(
        discordBotToken,
        discordGuildId,
        allMembers,
        roleNameById,
      );
      if (nicknameCleanup.discordUserIds.length > 0) {
        await ctx.runMutation(internal.discord.clearNicknamesForDiscordUsersInternal, {
          discordUserIds: nicknameCleanup.discordUserIds,
        });
      }
      const membersToSync = allMembers.filter((member) =>
        memberMatchesMembershipSyncTargets(
          member,
          discordUserIdSet,
          pendingMatchKeySet,
        ),
      );
      const skipped =
        discordUserIdSet.size + pendingMatchKeySet.size - membersToSync.length;

      const syncRunId = await ensureSyncRun(ctx);
      let added = 0;
      let updated = 0;
      let autoAccepted = 0;
      let processed = 0;

      for (let i = 0; i < membersToSync.length; i += SYNC_BATCH_SIZE) {
        const batch = membersToSync
          .slice(i, i + SYNC_BATCH_SIZE)
          .map((member) => memberToBatchPayload(member, roleNameById));

        const result = await ctx.runMutation(internal.discord.syncDiscordMembersBatch, {
          syncRunId,
          allowMembershipAcceptance: true,
          members: batch,
        });
        added += result.added;
        updated += result.updated;
        autoAccepted += result.autoAccepted;
        processed += batch.length;

        await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
          syncType: "discord",
          status: "in_progress",
          recordsAdded: membersToSync.length,
          recordsUpdated: processed,
        });
      }

      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "discord",
        status: "success",
        recordsAdded: added,
        recordsUpdated: updated,
        recordsArchived: Math.max(0, skipped),
      });

      return {
        success: true,
        totalMembers: membersToSync.length,
        added,
        updated,
        skipped: Math.max(0, skipped),
        autoAccepted,
        nicknamesCleared: nicknameCleanup.cleared,
        nicknamePermissionRolesUpdated,
      };
    } catch (error) {
      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "discord",
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});
