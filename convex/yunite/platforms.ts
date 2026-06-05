"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";

// Valid platform values from Yunite
type YunitePlatform = "PC" | "PS4" | "XB1" | "SWITCH" | "MOBILE";

const VALID_PLATFORMS: ReadonlySet<string> = new Set([
  "PC",
  "PS4",
  "XB1",
  "SWITCH",
  "MOBILE",
]);

interface YuniteRegistrationUser {
  discordId: string;
  epicName?: string;
  epicId?: string;
  chosenPlatform?: string;
}

/**
 * Fetch registration links from Yunite API and update player platforms.
 * Calls: GET /guild/{guildId}/registration/links
 * Maps each user's chosenPlatform to their player record by discordId.
 */
export const syncPlatforms = action({
  args: {},
  handler: async (ctx): Promise<{
    total: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;

    if (!yuniteApiKey) {
      throw new Error("YUNITE_API_KEY environment variable is not set");
    }
    if (!yuniteGuildId) {
      throw new Error("YUNITE_GUILD_ID environment variable is not set");
    }

    const url = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/registration/links`;
    console.log("Fetching registration links:", url);

    const response = await fetch(url, {
      headers: {
        "Y-Api-Token": yuniteApiKey,
      },
    });

    console.log("Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Yunite registration API error:", errorText);
      throw new Error(
        `Yunite registration API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    // The response has a `users` array
    const users: YuniteRegistrationUser[] = data.users ?? data ?? [];
    console.log(`Found ${users.length} registration entries`);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Batch updates — collect all valid platform mappings first
    const platformUpdates: Array<{
      discordId: string;
      platform: YunitePlatform;
    }> = [];

    for (const user of users) {
      if (!user.discordId) {
        skipped++;
        continue;
      }

      const rawPlatform = user.chosenPlatform?.toUpperCase();
      if (!rawPlatform || !VALID_PLATFORMS.has(rawPlatform)) {
        skipped++;
        continue;
      }

      platformUpdates.push({
        discordId: user.discordId,
        platform: rawPlatform as YunitePlatform,
      });
    }

    console.log(
      `Processing ${platformUpdates.length} platform updates (${skipped} skipped so far)`
    );

    // Process in batches of 50 to avoid overwhelming the mutation layer
    const BATCH_SIZE = 50;
    for (let i = 0; i < platformUpdates.length; i += BATCH_SIZE) {
      const batch = platformUpdates.slice(i, i + BATCH_SIZE);

      try {
        const result = await ctx.runMutation(
          internal.yunite.platformMutations.batchUpdatePlatforms,
          { updates: batch }
        );
        updated += result.updated;
        skipped += result.notFound;
        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown batch error";
        console.error(`Batch ${i}-${i + batch.length} failed:`, msg);
        errors.push(msg);
      }
    }

    console.log(
      `Platform sync complete: ${updated} updated, ${skipped} skipped, ${errors.length} errors`
    );

    return {
      total: users.length,
      updated,
      skipped,
      errors: errors.slice(0, 20), // Cap error list
    };
  },
});
