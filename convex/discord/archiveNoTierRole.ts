"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { FunctionReference } from "convex/server";
import { requireAdminAction } from "../auth_helpers";

interface DiscordRole {
  id: string;
  name: string;
}

export const archivePlayersWithoutTierRole = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    playersChecked: number;
    playersArchived: number;
    errors: number;
  }> => {
    await requireAdminAction(ctx);

    const discordBotToken = process.env.DISCORD_BOT_TOKEN;
    const discordGuildId = process.env.DISCORD_GUILD_ID;
    
    if (!discordBotToken) {
      throw new Error("DISCORD_BOT_TOKEN environment variable is not set");
    }
    
    if (!discordGuildId) {
      throw new Error("DISCORD_GUILD_ID environment variable is not set");
    }
    
    // Fetch all guild roles
    const rolesResponse = await fetch(
      `https://discord.com/api/v10/guilds/${discordGuildId}/roles`,
      {
        headers: {
          "Authorization": `Bot ${discordBotToken}`,
        },
      }
    );
    
    if (!rolesResponse.ok) {
      const errorText = await rolesResponse.text();
      throw new Error(`Failed to fetch Discord roles: ${rolesResponse.status} - ${errorText}`);
    }
    
    const roles: DiscordRole[] = await rolesResponse.json();
    
    // Find tier role IDs
    const tierRoles: Record<string, string> = {};
    const tierNames = ["Tier S", "Tier A", "Tier B", "Tier C"];
    
    for (const tierName of tierNames) {
      const role = roles.find(r => r.name === tierName);
      if (role) {
        tierRoles[tierName] = role.id;
      }
    }
    
    // Check if all tier roles exist
    const missingRoles = tierNames.filter(name => !tierRoles[name]);
    if (missingRoles.length > 0) {
      throw new Error(`Missing Discord roles: ${missingRoles.join(", ")}. Please create these roles in your Discord server.`);
    }
    
    // Get all active players with tiers and Discord IDs
    const players = await ctx.runQuery(
      api.discord.getPlayersForRoleSync as FunctionReference<"query", "public", Record<string, never>, Array<{ discordUserId: string; discordUsername: string; tier: string }>>, 
      {}
    );
    
    const playersToArchive: string[] = [];
    let errors = 0;
    
    for (const player of players) {
      if (!player.discordUserId || !player.tier) {
        continue;
      }
      
      try {
        // Get current member to see their roles
        const memberResponse = await fetch(
          `https://discord.com/api/v10/guilds/${discordGuildId}/members/${player.discordUserId}`,
          {
            headers: {
              "Authorization": `Bot ${discordBotToken}`,
            },
          }
        );
        
        if (!memberResponse.ok) {
          if (memberResponse.status === 404) {
            // Member not found - skip (will be handled by Discord sync)
            continue;
          }
          throw new Error(`Failed to fetch member: ${memberResponse.status}`);
        }
        
        const member = await memberResponse.json();
        const currentRoles: string[] = member.roles || [];
        
        // Check if they have ANY tier role
        const allTierRoleIds = Object.values(tierRoles);
        const hasTierRole = currentRoles.some(roleId => allTierRoleIds.includes(roleId));
        
        if (!hasTierRole) {
          playersToArchive.push(player.discordUserId);
        }
        
      } catch (error) {
        console.error(`Error checking roles for ${player.discordUsername}:`, error);
        errors++;
      }
    }
    
    // Archive players without tier roles
    let archived = 0;
    for (const discordUserId of playersToArchive) {
      try {
        await ctx.runMutation(
          internal.discord.archivePlayerByDiscordId as FunctionReference<"mutation", "internal", { discordUserId: string; reason: string }, { success: boolean; message?: string }>,
          {
            discordUserId,
            reason: "no tier role",
          }
        );
        archived++;
      } catch (error) {
        console.error(`Error archiving player ${discordUserId}:`, error);
        errors++;
      }
    }
    
    return {
      success: true,
      playersChecked: players.length,
      playersArchived: archived,
      errors,
    };
  },
});
