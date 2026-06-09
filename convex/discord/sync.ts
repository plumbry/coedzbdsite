"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { requireAdminAction } from "../auth_helpers";

const SYNC_BATCH_SIZE = 25;
const ADMIN_CACHE_RUN_ID = "admin-cache";

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
}

type SyncResult = {
  success: boolean;
  totalMembers: number;
  added: number;
  updated: number;
  skipped: number;
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
  return {
    discordUsername: formatDiscordUsername(member.user),
    discordUserId: member.user.id,
    nickname: member.nick || undefined,
    serverJoinDate: member.joined_at,
    roles: (member.roles ?? [])
      .map((roleId) => {
        const name = roleNameById.get(roleId);
        return name ? { id: roleId, name } : null;
      })
      .filter((role): role is { id: string; name: string } => role !== null),
  };
}

async function fetchGuildRoleMap(
  discordBotToken: string,
  discordGuildId: string,
): Promise<Map<string, string>> {
  const rolesResponse = await fetch(
    `https://discord.com/api/v10/guilds/${discordGuildId}/roles`,
    { headers: { Authorization: `Bot ${discordBotToken}` } },
  );
  if (!rolesResponse.ok) {
    const errorText = await rolesResponse.text();
    throw new Error(`Discord roles API error: ${rolesResponse.status} - ${errorText}`);
  }
  const guildRoles: DiscordRole[] = await rolesResponse.json();
  const roleNameById = new Map<string, string>();
  for (const role of guildRoles) {
    roleNameById.set(role.id, role.name);
  }
  return roleNameById;
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

    const roleNameById = await fetchGuildRoleMap(discordBotToken, discordGuildId);
    const syncRunId = await ensureSyncRun(ctx);

    const result: { added: number; updated: number } = await ctx.runMutation(
      internal.discord.syncDiscordMembersBatch,
      {
        syncRunId,
        members: [memberToBatchPayload(member, roleNameById)],
      },
    );

    return {
      success: true,
      discordUserId: args.discordUserId,
      added: result.added,
      updated: result.updated,
      unchanged: result.added === 0 && result.updated === 0,
    };
  },
});

/** Admin-only: sync Discord profile/roles for all accepted members. */
export const syncAcceptedMembers = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    await requireAdminAction(ctx);
    const { discordBotToken, discordGuildId } = getDiscordConfig();

    const acceptedIds = await ctx.runQuery(internal.discord.listAcceptedDiscordUserIds, {});
    const acceptedIdSet = new Set(acceptedIds);

    if (acceptedIdSet.size === 0) {
      return { success: true, totalMembers: 0, added: 0, updated: 0, skipped: 0 };
    }

    try {
      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "discord",
        status: "in_progress",
        recordsAdded: acceptedIdSet.size,
        recordsUpdated: 0,
      });

      const roleNameById = await fetchGuildRoleMap(discordBotToken, discordGuildId);
      const allMembers = await fetchAllGuildMembers(discordBotToken, discordGuildId);
      const membersToSync = allMembers.filter((m) => acceptedIdSet.has(m.user.id));
      const skipped = acceptedIdSet.size - membersToSync.length;

      const syncRunId = await ensureSyncRun(ctx);
      let added = 0;
      let updated = 0;
      let processed = 0;

      for (let i = 0; i < membersToSync.length; i += SYNC_BATCH_SIZE) {
        const batch = membersToSync
          .slice(i, i + SYNC_BATCH_SIZE)
          .map((member) => memberToBatchPayload(member, roleNameById));

        const result = await ctx.runMutation(internal.discord.syncDiscordMembersBatch, {
          syncRunId,
          members: batch,
        });
        added += result.added;
        updated += result.updated;
        processed += batch.length;

        await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
          syncType: "discord",
          status: "in_progress",
          recordsAdded: acceptedIdSet.size,
          recordsUpdated: processed,
        });
      }

      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "discord",
        status: "success",
        recordsAdded: added,
        recordsUpdated: updated,
        recordsArchived: skipped,
      });

      return {
        success: true,
        totalMembers: membersToSync.length,
        added,
        updated,
        skipped,
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
