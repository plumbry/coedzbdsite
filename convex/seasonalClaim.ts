import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getDiscordUserIdFromIdentity } from "./auth_discord";
import {
  ensureClerkPublicDiscordMetadata,
  fetchClerkUserById,
  resolveDiscordFromClerkUser,
} from "./userProvisioning";

/**
 * Claim / open passport.
 *
 * Always pulls Discord from Clerk on claim (external account + public_metadata),
 * writes it onto the site user, then matches the ZBD player / creates the passport.
 * Admin "Sync from Clerk" is not required for this path.
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

    if (!process.env.CLERK_SECRET_KEY) {
      throw new ConvexError({
        message:
          "Passport claim is misconfigured (Clerk secret missing). Please contact staff.",
        code: "FAILED_PRECONDITION",
      });
    }

    // Always fetch Clerk on claim so Discord is pulled without an admin sync.
    const clerkUser = await fetchClerkUserById(identity.subject);
    if (!clerkUser) {
      throw new ConvexError({
        message:
          "We couldn’t load your Clerk account to find Discord. Refresh and try again, or contact staff.",
        code: "CLERK_USER_FETCH_FAILED",
      });
    }

    const fromClerk = resolveDiscordFromClerkUser(clerkUser);
    const fromJwt = getDiscordUserIdFromIdentity(identity);
    const stored = await ctx.runQuery(internal.userProvisioning.getDiscordLinkByToken, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    const discordUserId =
      fromClerk.discordUserId ?? fromJwt ?? stored?.discordUserId ?? null;
    const discordUsername =
      fromClerk.discordUsername ?? stored?.discordUsername ?? undefined;

    if (!discordUserId) {
      const providers = (clerkUser.external_accounts ?? [])
        .map((account) => account.provider)
        .filter(Boolean);
      console.error("Passport claim: no Discord id on Clerk user", {
        clerkUserId: clerkUser.id,
        providers,
        hasPublicDiscordId: Boolean(clerkUser.public_metadata?.discord_id),
      });
      throw new ConvexError({
        message:
          "Sign in with Discord to claim your passport. We couldn’t find a Discord account on your login.",
        code: "DISCORD_NOT_LINKED",
      });
    }

    // Keep JWT claim working for future requests (public_metadata.discord_id).
    await ensureClerkPublicDiscordMetadata(
      clerkUser.id,
      discordUserId,
      clerkUser.public_metadata,
    );

    return await ctx.runMutation(internal.seasonal.ensureMyPassportInternal, {
      slug: args.slug,
      discordUserId,
      discordUsername,
    });
  },
});
