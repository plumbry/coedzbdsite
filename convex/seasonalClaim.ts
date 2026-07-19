import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getDiscordUserIdFromIdentity } from "./auth_discord";
import {
  fetchClerkUserById,
  readDiscordIdFromClerkUser,
} from "./userProvisioning";

/**
 * Claim / open passport: resolve Discord ID from the Clerk Discord OAuth link
 * (JWT claim, stored site user, else Clerk API), write it onto the site user,
 * then match ZBD player.
 */
export const ensureMyPassport = action({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{
    passportId: string;
    player: {
      _id: string;
      discordUsername?: string;
      epicUsername?: string;
    };
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    let discordUserId: string | null = getDiscordUserIdFromIdentity(identity);
    let discordUsername: string | undefined;

    if (!discordUserId) {
      const stored = await ctx.runQuery(internal.userProvisioning.getDiscordLinkByToken, {
        tokenIdentifier: identity.tokenIdentifier,
      });
      if (stored?.discordUserId) {
        discordUserId = stored.discordUserId;
        discordUsername = stored.discordUsername;
      }
    }

    if (!discordUserId) {
      const clerkUser = await fetchClerkUserById(identity.subject);
      const fromClerk = readDiscordIdFromClerkUser(clerkUser?.external_accounts);
      discordUserId = fromClerk.discordUserId ?? null;
      discordUsername = fromClerk.discordUsername;
    }

    if (!discordUserId) {
      throw new ConvexError({
        message:
          "Sign in with Discord to claim your passport. We couldn’t find a Discord account on your login.",
        code: "DISCORD_NOT_LINKED",
      });
    }

    return await ctx.runMutation(internal.seasonal.ensureMyPassportInternal, {
      slug: args.slug,
      discordUserId,
      discordUsername,
    });
  },
});
