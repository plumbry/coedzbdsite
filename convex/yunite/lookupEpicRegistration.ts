"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { requireAdminAction } from "../auth_helpers";
import {
  fetchYuniteRegistrationByDiscordIds,
  findRegistrationForDiscordId,
  getEpicDisplayName,
  isYuniteVerifiedRegistration,
} from "./registrationApi";

export type YuniteEpicLookupStatus = "success" | "not_found" | "error";

export type YuniteEpicLookupResult = {
  status: YuniteEpicLookupStatus;
  epicDisplayName?: string;
  epicAccountId?: string;
  verified?: boolean;
  errorMessage?: string;
};

/**
 * Look up a Discord user's Yunite-verified Epic registration.
 * Read-only: does not mutate player records.
 */
export const lookupEpicRegistrationByDiscordId = action({
  args: {
    discordUserId: v.string(),
  },
  handler: async (ctx, args): Promise<YuniteEpicLookupResult> => {
    await requireAdminAction(ctx);

    const discordUserId = args.discordUserId.trim();
    if (!discordUserId) {
      return {
        status: "error",
        errorMessage: "Discord user ID is required.",
      };
    }

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;

    if (!yuniteApiKey || !yuniteGuildId) {
      return {
        status: "error",
        errorMessage:
          "Could not fetch Yunite registration. Check API key, endpoint, or Yunite permissions.",
      };
    }

    const fetchResult = await fetchYuniteRegistrationByDiscordIds(
      [discordUserId],
      yuniteApiKey,
      yuniteGuildId,
    );

    if (!fetchResult.ok) {
      console.error("Yunite registration lookup failed:", {
        status: fetchResult.status,
        error: fetchResult.errorText,
        discordUserId,
      });
      return {
        status: "error",
        errorMessage:
          "Could not fetch Yunite registration. Check API key, endpoint, or Yunite permissions.",
      };
    }

    const registration = findRegistrationForDiscordId(
      fetchResult.entries,
      discordUserId,
    );

    if (!registration) {
      return { status: "not_found" };
    }

    const epicAccountId = registration.epicId?.trim();
    const epicDisplayName = getEpicDisplayName(registration);

    if (!epicAccountId && !epicDisplayName) {
      return { status: "not_found" };
    }

    return {
      status: "success",
      epicDisplayName,
      epicAccountId,
      verified: isYuniteVerifiedRegistration(registration),
    };
  },
});

// TODO: Add an admin mutation to save/sync epicAccountId + epicUsername onto the
// player record after staff confirm a lookup result (preserve previousEpicIds history).
