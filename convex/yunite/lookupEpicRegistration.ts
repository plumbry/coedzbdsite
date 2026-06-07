"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { requireAdminAction } from "../auth_helpers";
import {
  formatYuniteLookupError,
  getEpicAccountId,
  getEpicDisplayName,
  isYuniteVerifiedRegistration,
  lookupYuniteRegistrationForDiscordId,
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
 * Look up a Discord user's Yunite-verified Epic registration via Get User Links.
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

    const yuniteApiKey = process.env.YUNITE_API_KEY?.trim();
    const yuniteGuildId = process.env.YUNITE_GUILD_ID?.trim();

    if (!yuniteApiKey) {
      return {
        status: "error",
        errorMessage:
          "YUNITE_API_KEY is not set in Convex environment variables.",
      };
    }

    if (!yuniteGuildId) {
      return {
        status: "error",
        errorMessage:
          "YUNITE_GUILD_ID is not set in Convex environment variables.",
      };
    }

    const { linksResult, registration, attemptedResults } =
      await lookupYuniteRegistrationForDiscordId(
        discordUserId,
        yuniteApiKey,
        yuniteGuildId,
      );

    if (!linksResult.ok) {
      console.error("Yunite Get User Links failed:", {
        discordUserId,
        attempts: attemptedResults.map((result) => ({
          source: result.source,
          status: result.status,
          error: result.errorText?.slice(0, 300),
        })),
      });
      return {
        status: "error",
        errorMessage: formatYuniteLookupError(attemptedResults),
      };
    }

    if (registration?.epicId) {
      const epicAccountId = getEpicAccountId(registration);
      const epicDisplayName = getEpicDisplayName(registration);

      console.log("Yunite registration match:", {
        discordUserId,
        source: linksResult.source,
        epicID: epicAccountId,
        epicName: epicDisplayName,
      });

      return {
        status: "success",
        epicDisplayName,
        epicAccountId,
        verified: isYuniteVerifiedRegistration(registration),
      };
    }

    console.log("Yunite registration not found:", {
      discordUserId,
      source: linksResult.source,
      notLinked: linksResult.notLinked,
      notFound: linksResult.notFound,
      entryCount: linksResult.entries.length,
    });

    return { status: "not_found" };
  },
});

// TODO: Add an admin mutation to save/sync epicAccountId + epicUsername onto the
// player record after staff confirm a lookup result (preserve previousEpicIds history).
