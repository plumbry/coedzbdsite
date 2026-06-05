"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { requireAdminAction } from "../auth_helpers";

/**
 * Probe Yunite API for member/user data that may include platform info.
 * Tries multiple possible endpoints and logs whatever comes back.
 */
export const probeYuniteUserEndpoints = action({
  args: {
    discordId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    results: Record<string, unknown>;
  }> => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;

    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error(
        "YUNITE_API_KEY and YUNITE_GUILD_ID environment variables must be set",
      );
    }

    const headers = { "Y-Api-Token": yuniteApiKey };
    const results: Record<string, unknown> = {};

    // Try several possible Yunite API endpoints for user/member data
    const endpoints = [
      {
        name: "guild_members",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/members`,
      },
      {
        name: "guild_users",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/users`,
      },
      {
        name: "guild_member_by_id",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/members/${args.discordId}`,
      },
      {
        name: "guild_user_by_id",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/users/${args.discordId}`,
      },
      {
        name: "guild_verified",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/verified`,
      },
      {
        name: "guild_registrations",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/registrations`,
      },
      {
        name: "guild_links",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/links`,
      },
      {
        name: "guild_link_by_id",
        url: `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/links/${args.discordId}`,
      },
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`\n🔍 Trying: ${endpoint.name}`);
        console.log(`   URL: ${endpoint.url}`);

        const response = await fetch(endpoint.url, { headers });
        console.log(`   Status: ${response.status}`);

        if (response.ok) {
          const data = await response.json();
          // If it's an array, just log first few entries to avoid huge logs
          if (Array.isArray(data)) {
            console.log(`   ✅ Got array with ${data.length} items`);
            if (data.length > 0) {
              console.log(
                `   First item keys:`,
                Object.keys(data[0] as Record<string, unknown>),
              );
              console.log(
                `   First item:`,
                JSON.stringify(data[0], null, 2).substring(0, 500),
              );
            }
            results[endpoint.name] = {
              status: response.status,
              count: data.length,
              sample: data.slice(0, 2),
            };
          } else {
            console.log(
              `   ✅ Got object:`,
              JSON.stringify(data, null, 2).substring(0, 500),
            );
            results[endpoint.name] = {
              status: response.status,
              data,
            };
          }
        } else {
          const errorText = await response.text();
          console.log(`   ❌ Error: ${errorText.substring(0, 200)}`);
          results[endpoint.name] = {
            status: response.status,
            error: errorText.substring(0, 200),
          };
        }

        // Rate limit delay
        await new Promise((resolve) => setTimeout(resolve, 600));
      } catch (error) {
        console.error(`   ❌ Exception:`, error);
        results[endpoint.name] = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { success: true, results };
  },
});
