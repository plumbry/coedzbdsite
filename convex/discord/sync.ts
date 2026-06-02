"use node";

import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

const SYNC_BATCH_SIZE = 25;

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
  archived: number;
};

async function fetchAndSyncDiscordMembers(ctx: ActionCtx): Promise<SyncResult> {
    const discordBotToken = process.env.DISCORD_BOT_TOKEN;
    const discordGuildId = process.env.DISCORD_GUILD_ID;
    
    if (!discordBotToken) {
      throw new Error("DISCORD_BOT_TOKEN environment variable is not set");
    }
    
    if (!discordGuildId) {
      throw new Error("DISCORD_GUILD_ID environment variable is not set");
    }
    
    try {
      // Update sync status to in_progress
      await ctx.runMutation(api.sync.updateSyncStatus, {
        syncType: "discord",
        status: "in_progress",
      });
      
      // Fetch members from Discord API
      let allMembers: DiscordMember[] = [];
      let after: string | undefined = undefined;
      const roleNameById = new Map<string, string>();

      // Fetch guild roles once so member role IDs can be resolved to names.
      const rolesResponse = await fetch(`https://discord.com/api/v10/guilds/${discordGuildId}/roles`, {
        headers: {
          "Authorization": `Bot ${discordBotToken}`,
        },
      });
      if (!rolesResponse.ok) {
        const errorText = await rolesResponse.text();
        throw new Error(`Discord roles API error: ${rolesResponse.status} - ${errorText}`);
      }
      const guildRoles: DiscordRole[] = await rolesResponse.json();
      for (const role of guildRoles) {
        roleNameById.set(role.id, role.name);
      }
      
      // Discord returns max 1000 members per request, need to paginate
      while (true) {
        const url = new URL(`https://discord.com/api/v10/guilds/${discordGuildId}/members`);
        url.searchParams.set("limit", "1000");
        if (after) {
          url.searchParams.set("after", after);
        }
        
        const response = await fetch(url.toString(), {
          headers: {
            "Authorization": `Bot ${discordBotToken}`,
          },
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
        
        // If we got less than 1000, we're done
        if (members.length < 1000) {
          break;
        }
        
        // Set after to last member's ID for pagination
        after = members[members.length - 1].user.id;
      }
      
      // Filter out bots
      const humanMembers = allMembers.filter(m => !m.user.id.startsWith("bot_"));
      
      // Sync members to database
      let added = 0;
      let updated = 0;
      const discordUserIds: string[] = [];

      for (let i = 0; i < humanMembers.length; i += SYNC_BATCH_SIZE) {
        const batch = humanMembers.slice(i, i + SYNC_BATCH_SIZE).map((member) => {
          const username =
            member.user.discriminator === "0"
              ? member.user.username
              : `${member.user.username}#${member.user.discriminator}`;
          discordUserIds.push(member.user.id);
          return {
            discordUsername: username,
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
        });

        const result = await ctx.runMutation(internal.discord.syncDiscordMembersBatch, {
          members: batch,
        });
        added += result.added;
        updated += result.updated;
      }

      const archiveResult: { archived: number } = await ctx.runMutation(
        internal.discord.archiveMissingPlayersInternal,
        { currentDiscordUserIds: discordUserIds },
      );

      await ctx.runMutation(api.sync.updateSyncStatus, {
        syncType: "discord",
        status: "success",
        recordsAdded: added,
        recordsUpdated: updated,
        recordsArchived: archiveResult.archived,
      });
      
      return {
        success: true,
        totalMembers: humanMembers.length,
        added,
        updated,
        archived: archiveResult.archived,
      };
      
    } catch (error) {
      // Update sync status to error
      await ctx.runMutation(api.sync.updateSyncStatus, {
        syncType: "discord",
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      
      throw error;
    }
}

// Public action for manual sync button
export const syncDiscordMembers = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    return fetchAndSyncDiscordMembers(ctx);
  },
});

// Internal action for cron job (daily auto-sync)
export const syncDiscordMembersInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await fetchAndSyncDiscordMembers(ctx);
  },
});
