"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getDiscordRoleNameForBanType } from "../lib/eventBanDiscordRoles";

const ROLE_SYNC_DELAY_MS = 300;
const TIER_ROLE_NAMES = ["Tier S", "Tier A", "Tier B", "Tier C"];

type DiscordRole = { id: string; name: string };

function withoutTierRoles(roleIds: string[], roleNameToId: Map<string, string>): string[] {
  const tierRoleIds = new Set(
    TIER_ROLE_NAMES.map((name) => roleNameToId.get(name)).filter((id): id is string => !!id),
  );
  return roleIds.filter((id) => !tierRoleIds.has(id));
}

function getDiscordConfig() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) {
    throw new ConvexError({
      message: "DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be configured",
      code: "NOT_IMPLEMENTED",
    });
  }
  return { token, guildId };
}

async function fetchGuildRoleNameToId(token: string, guildId: string): Promise<Map<string, string>> {
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new ConvexError({
      message: `Failed to fetch Discord roles: ${response.status} - ${errorText}`,
      code: "EXTERNAL_SERVICE_ERROR",
    });
  }

  const roles: DiscordRole[] = await response.json();
  return new Map(roles.map((role) => [role.name, role.id]));
}

async function getMemberRoleIds(
  token: string,
  guildId: string,
  userId: string,
): Promise<string[] | null> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    { headers: { Authorization: `Bot ${token}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch member ${userId}: ${response.status} - ${errorText}`);
  }

  const member = await response.json();
  return member.roles ?? [];
}

async function setMemberRoleIds(
  token: string,
  guildId: string,
  userId: string,
  roleIds: string[],
): Promise<boolean> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roles: roleIds }),
    },
  );
  return response.ok;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const forceRoleSync = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    rolesAdded: number;
    rolesRemoved: number;
    errors: number;
    errorMessages: string[];
  }> => {
    await ctx.runQuery(internal.eventBans.viewerAuth.assertStaffWriteAccess, {});

    const { token, guildId } = getDiscordConfig();
    const pendingAdds = await ctx.runQuery(internal.eventBans.queries.getPendingRoleSyncs, {});
    const pendingRemovals = await ctx.runQuery(internal.eventBans.queries.getPendingRoleRemovals, {});

    if (pendingAdds.length === 0 && pendingRemovals.length === 0) {
      return { rolesAdded: 0, rolesRemoved: 0, errors: 0, errorMessages: [] };
    }

    const roleNameToId = await fetchGuildRoleNameToId(token, guildId);
    const acknowledgedAddIds: Id<"eventBans">[] = [];
    const acknowledgedRemovalBanIds: Id<"eventBans">[] = [];
    const acknowledgedQueueIds: Id<"pendingRoleRemovals">[] = [];
    let errors = 0;
    const errorMessages: string[] = [];

    for (const item of pendingAdds) {
      try {
        const discordRoleName =
          item.discordRoleName ?? getDiscordRoleNameForBanType(item.banType);
        if (!discordRoleName) {
          errors++;
          errorMessages.push(`No Discord role mapping for ban type "${item.banType}"`);
          continue;
        }

        const roleId = roleNameToId.get(discordRoleName);
        if (!roleId) {
          errors++;
          errorMessages.push(`Discord role not found for "${discordRoleName}"`);
          continue;
        }

        const currentRoles = await getMemberRoleIds(token, guildId, item.discordId);
        if (currentRoles === null) {
          errors++;
          errorMessages.push(`Member not in server: ${item.discordId}`);
          continue;
        }

        let targetRoles = currentRoles.includes(roleId)
          ? [...currentRoles]
          : [...currentRoles, roleId];
        if (item.banType === "Probation") {
          targetRoles = withoutTierRoles(targetRoles, roleNameToId);
        }

        const rolesUnchanged =
          targetRoles.length === currentRoles.length &&
          targetRoles.every((id) => currentRoles.includes(id));

        if (!rolesUnchanged) {
          const ok = await setMemberRoleIds(token, guildId, item.discordId, targetRoles);
          if (!ok) {
            errors++;
            errorMessages.push(`Failed to add ${item.banType} for ${item.discordId}`);
            await delay(ROLE_SYNC_DELAY_MS);
            continue;
          }
        }

        acknowledgedAddIds.push(item._id);
      } catch (error) {
        errors++;
        errorMessages.push(
          error instanceof Error ? error.message : `Failed to sync add for ${item.discordId}`,
        );
      }
      await delay(ROLE_SYNC_DELAY_MS);
    }

    for (const item of pendingRemovals) {
      try {
        const discordRoleName =
          item.discordRoleName ?? getDiscordRoleNameForBanType(item.banType);
        if (!discordRoleName) {
          errors++;
          errorMessages.push(`No Discord role mapping for ban type "${item.banType}"`);
          continue;
        }

        const roleId = roleNameToId.get(discordRoleName);
        if (!roleId) {
          errors++;
          errorMessages.push(`Discord role not found for "${discordRoleName}"`);
          continue;
        }

        const currentRoles = await getMemberRoleIds(token, guildId, item.discordId);
        if (currentRoles === null || !currentRoles.includes(roleId)) {
          if (item.source === "eventBans") {
            acknowledgedRemovalBanIds.push(item._id);
          } else {
            acknowledgedQueueIds.push(item._id);
          }
          await delay(ROLE_SYNC_DELAY_MS);
          continue;
        }

        const ok = await setMemberRoleIds(
          token,
          guildId,
          item.discordId,
          currentRoles.filter((id) => id !== roleId),
        );
        if (!ok) {
          errors++;
          errorMessages.push(`Failed to remove ${item.banType} for ${item.discordId}`);
          await delay(ROLE_SYNC_DELAY_MS);
          continue;
        }

        if (item.source === "eventBans") {
          acknowledgedRemovalBanIds.push(item._id);
        } else {
          acknowledgedQueueIds.push(item._id);
        }
      } catch (error) {
        errors++;
        errorMessages.push(
          error instanceof Error ? error.message : `Failed to sync removal for ${item.discordId}`,
        );
      }
      await delay(ROLE_SYNC_DELAY_MS);
    }

    let rolesAdded = 0;
    let rolesRemoved = 0;

    if (acknowledgedAddIds.length > 0) {
      const result = await ctx.runMutation(internal.eventBans.mutations.acknowledgeRoleSyncs, {
        banIds: acknowledgedAddIds,
      });
      rolesAdded = result.acknowledged;
    }

    if (acknowledgedRemovalBanIds.length > 0) {
      const result = await ctx.runMutation(internal.eventBans.mutations.acknowledgeRoleRemovals, {
        banIds: acknowledgedRemovalBanIds,
      });
      rolesRemoved += result.acknowledged;
    }

    if (acknowledgedQueueIds.length > 0) {
      const result = await ctx.runMutation(internal.eventBans.mutations.acknowledgePendingRoleRemovals, {
        ids: acknowledgedQueueIds,
      });
      rolesRemoved += result.acknowledged;
    }

    return {
      rolesAdded,
      rolesRemoved,
      errors,
      errorMessages: errorMessages.slice(0, 10),
    };
  },
});
