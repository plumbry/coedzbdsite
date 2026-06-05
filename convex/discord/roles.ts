"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";
import type { FunctionReference } from "convex/server";

interface DiscordRole {
  id: string;
  name: string;
}

interface RoleMismatch {
  discordUsername: string;
  discordUserId: string;
  expectedTier: string;
  currentTierRoles: string[];
  status: "missing_role" | "wrong_role" | "multiple_roles";
}

export const checkDiscordRoles = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    playersChecked: number;
    mismatches: RoleMismatch[];
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
    
    const mismatches: RoleMismatch[] = [];
    let errors = 0;
    
    for (const player of players) {
      if (!player.discordUserId || !player.tier) {
        continue;
      }
      
      const tier: string = player.tier;
      
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
            // Member not found - skip
            continue;
          }
          throw new Error(`Failed to fetch member: ${memberResponse.status}`);
        }
        
        const member = await memberResponse.json();
        const currentRoles: string[] = member.roles || [];
        
        // Determine which tier role they should have
        const expectedRoleId = tierRoles[`Tier ${tier}`];
        const allTierRoleIds = Object.values(tierRoles);
        
        // Find all tier roles this member currently has
        const currentTierRoleIds = currentRoles.filter(roleId => allTierRoleIds.includes(roleId));
        const currentTierRoleNames = currentTierRoleIds.map(roleId => {
          const roleName = Object.keys(tierRoles).find(name => tierRoles[name] === roleId);
          return roleName || roleId;
        });
        
        // Check for mismatches
        if (currentTierRoleIds.length === 0) {
          // Missing role
          mismatches.push({
            discordUsername: player.discordUsername,
            discordUserId: player.discordUserId,
            expectedTier: tier,
            currentTierRoles: [],
            status: "missing_role",
          });
        } else if (currentTierRoleIds.length > 1) {
          // Multiple tier roles
          mismatches.push({
            discordUsername: player.discordUsername,
            discordUserId: player.discordUserId,
            expectedTier: tier,
            currentTierRoles: currentTierRoleNames,
            status: "multiple_roles",
          });
        } else if (!currentTierRoleIds.includes(expectedRoleId)) {
          // Wrong role
          mismatches.push({
            discordUsername: player.discordUsername,
            discordUserId: player.discordUserId,
            expectedTier: tier,
            currentTierRoles: currentTierRoleNames,
            status: "wrong_role",
          });
        }
        
      } catch (error) {
        console.error(`Error checking roles for ${player.discordUsername}:`, error);
        errors++;
      }
    }
    
    return {
      success: true,
      playersChecked: players.length,
      mismatches,
      errors,
    };
  },
});
