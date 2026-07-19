import { ConvexError, v } from "convex/values";
import type { UserIdentity } from "convex/server";
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  buildProfilePatch,
  getDiscordUserIdFromIdentity,
  isValidDiscordSnowflake,
} from "./auth_discord";
import { getDisplayName } from "./auth_helpers";
import { logAudit } from "./helpers/audit";
import type { Doc, Id } from "./_generated/dataModel";

const CLERK_FETCH_TIMEOUT_MS = 8_000;

/** Legacy Hercules rows awaiting a first Clerk Discord login. */
export function isUnlinkedMigrationUser(user: Doc<"users">): boolean {
  return user.tokenIdentifier.startsWith("https://hercules.app|");
}

export function clerkTokenIdentifier(clerkUserId: string): string {
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
  if (!issuer) {
    throw new ConvexError({
      message: "CLERK_JWT_ISSUER_DOMAIN is not configured",
      code: "FAILED_PRECONDITION",
    });
  }
  return `${issuer}|${clerkUserId}`;
}

async function findUsersByDiscordId(
  ctx: MutationCtx,
  discordUserId: string,
): Promise<Doc<"users">[]> {
  return await ctx.db
    .query("users")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
    .collect();
}

async function resolveUsernamePatch(
  ctx: MutationCtx,
  username: string | undefined,
  existingUserId?: Id<"users">,
): Promise<{ username?: string }> {
  if (!username) {
    return {};
  }

  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 20 || !/^[a-zA-Z0-9_]+$/.test(normalized)) {
    return {};
  }

  const existing = await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", normalized))
    .first();

  if (existing && existing._id !== existingUserId) {
    return {};
  }

  return { username: normalized };
}

export type UserProfilePatch = {
  name?: string;
  email?: string;
  discordUsername?: string;
};

export async function provisionViewerUser(
  ctx: MutationCtx,
  args: {
    tokenIdentifier: string;
    profilePatch: UserProfilePatch;
    discordUserId?: string;
    username?: string;
    auditSource: string;
  },
): Promise<{ userId: Id<"users">; created: boolean }> {
  const { tokenIdentifier, profilePatch, discordUserId, username, auditSource } = args;

  let existingUser = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();

  // Email accounts created before Discord was connected may not share the Clerk
  // token used by sync — fall back to email match for the small staff user table.
  if (!existingUser && profilePatch.email) {
    const email = profilePatch.email.trim().toLowerCase();
    const allUsers = await ctx.db.query("users").collect();
    existingUser =
      allUsers.find((user) => user.email?.trim().toLowerCase() === email) ?? null;
  }

  const usernamePatch = await resolveUsernamePatch(ctx, username, existingUser?._id);

  if (existingUser) {
    await ctx.db.patch(existingUser._id, {
      tokenIdentifier,
      ...profilePatch,
      ...usernamePatch,
      ...(discordUserId ? { discordUserId } : {}),
    });
    return { userId: existingUser._id, created: false };
  }

  if (discordUserId) {
    const discordMatches = await findUsersByDiscordId(ctx, discordUserId);
    const unlinkedMatches = discordMatches.filter(isUnlinkedMigrationUser);

    if (discordMatches.length > 1 && unlinkedMatches.length !== 1) {
      throw new ConvexError({
        message: "Account linking error: duplicate Discord id in database. Contact an admin.",
        code: "INTERNAL",
      });
    }

    const migrationUser =
      unlinkedMatches.length === 1
        ? unlinkedMatches[0]
        : discordMatches.length === 1 && isUnlinkedMigrationUser(discordMatches[0])
          ? discordMatches[0]
          : null;

    if (migrationUser) {
      const role = migrationUser.role ?? "viewer";
      await ctx.db.patch(migrationUser._id, {
        tokenIdentifier,
        discordUserId,
        ...profilePatch,
        ...usernamePatch,
        ...(migrationUser.role ? {} : { role: "viewer" as const }),
      });

      await logAudit(ctx, {
        userId: migrationUser._id,
        userName: getDisplayName({ ...migrationUser, ...profilePatch }),
        action: "user_account_linked",
        entityType: "user",
        entityId: migrationUser._id,
        details: `User signed in and linked Discord account (${profilePatch.email || profilePatch.name || discordUserId})`,
        newValue: role,
      });

      return { userId: migrationUser._id, created: false };
    }
  }

  const linkedDiscordOwner =
    discordUserId &&
    (await findUsersByDiscordId(ctx, discordUserId)).find(
      (user) => !isUnlinkedMigrationUser(user),
    );

  const userId = await ctx.db.insert("users", {
    tokenIdentifier,
    role: "viewer",
    ...profilePatch,
    ...usernamePatch,
    ...(discordUserId && !linkedDiscordOwner ? { discordUserId } : {}),
  });

  await logAudit(ctx, {
    userId,
    userName:
      profilePatch.name || profilePatch.email || profilePatch.discordUsername || "Unknown",
    action: "user_signed_up",
    entityType: "user",
    entityId: userId,
    details: `New user signed up via ${auditSource} (${profilePatch.email || profilePatch.name || tokenIdentifier})`,
    newValue: "viewer",
  });

  return { userId, created: true };
}

export async function provisionFromIdentity(
  ctx: MutationCtx,
  identity: UserIdentity,
): Promise<Id<"users">> {
  const profilePatch = buildProfilePatch(identity);
  const discordUserId = getDiscordUserIdFromIdentity(identity) ?? undefined;
  const result = await provisionViewerUser(ctx, {
    tokenIdentifier: identity.tokenIdentifier,
    profilePatch,
    discordUserId,
    auditSource: "sign-in",
  });
  return result.userId;
}

export function readDiscordIdFromClerkUser(
  externalAccounts: Array<{
    provider?: string;
    provider_user_id?: string;
    username?: string;
    external_id?: string;
    account_id?: string;
    [key: string]: unknown;
  }> | undefined,
): { discordUserId?: string; discordUsername?: string } {
  if (!externalAccounts) {
    return {};
  }

  const discord = externalAccounts.find((account) =>
    String(account.provider ?? "")
      .toLowerCase()
      .includes("discord"),
  );

  if (!discord) {
    return {};
  }

  const preferred = [
    discord.provider_user_id,
    discord.external_id,
    discord.account_id,
  ];
  for (const candidate of preferred) {
    const snowflake = asDiscordSnowflake(candidate);
    if (snowflake) {
      return {
        discordUserId: snowflake,
        discordUsername:
          typeof discord.username === "string" ? discord.username.trim() : undefined,
      };
    }
  }

  // Clerk payloads vary by API version — scan the Discord account object for a snowflake.
  for (const value of Object.values(discord)) {
    const snowflake = asDiscordSnowflake(value);
    if (snowflake) {
      return {
        discordUserId: snowflake,
        discordUsername:
          typeof discord.username === "string" ? discord.username.trim() : undefined,
      };
    }
  }

  return {};
}

function asDiscordSnowflake(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return asDiscordSnowflake(String(Math.trunc(value)));
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return isValidDiscordSnowflake(trimmed) ? trimmed : null;
}

function readDiscordIdFromPublicMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!metadata) {
    return undefined;
  }
  return (
    asDiscordSnowflake(metadata.discord_id) ??
    asDiscordSnowflake(metadata.discordId) ??
    undefined
  );
}

/**
 * Ensure Clerk public_metadata.discord_id is set so the Convex JWT template claim works.
 * The external_accounts shortcode does not populate in the convex JWT (see IMPLEMENTATION_NOTES.md).
 */
export async function ensureClerkPublicDiscordMetadata(
  clerkUserId: string,
  discordUserId: string,
  existingPublicMetadata?: Record<string, unknown> | null,
): Promise<boolean> {
  const current = readDiscordIdFromPublicMetadata(existingPublicMetadata);
  if (current === discordUserId) {
    return false;
  }

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${clerkUserId}/metadata`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          public_metadata: { discord_id: discordUserId },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      console.error(
        `Clerk metadata patch failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Clerk metadata patch error:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export const assertAdminByToken = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();

    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Admin access required",
        code: "FORBIDDEN",
      });
    }

    return user._id;
  },
});

/** Stored Discord link for the signed-in site user (avoids Clerk round-trips on claim). */
export const getDiscordLinkByToken = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    if (!user?.discordUserId) {
      return null;
    }
    return {
      discordUserId: user.discordUserId,
      discordUsername: user.discordUsername,
    };
  },
});

export const provisionFromClerkData = internalMutation({
  args: {
    clerkUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    discordUserId: v.optional(v.string()),
    discordUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = clerkTokenIdentifier(args.clerkUserId);
    const profilePatch: UserProfilePatch = {
      ...(args.name ? { name: args.name } : {}),
      ...(args.email ? { email: args.email } : {}),
      ...(args.discordUsername ? { discordUsername: args.discordUsername } : {}),
    };

    if (args.username) {
      profilePatch.name = profilePatch.name ?? args.username;
    }

    return await provisionViewerUser(ctx, {
      tokenIdentifier,
      profilePatch,
      discordUserId: args.discordUserId,
      username: args.username,
      auditSource: "Clerk sync",
    });
  },
});

type ClerkUserRecord = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email_addresses?: Array<{ email_address?: string }>;
  public_metadata?: Record<string, unknown> | null;
  external_accounts?: Array<{
    provider?: string;
    provider_user_id?: string;
    username?: string;
    external_id?: string;
    account_id?: string;
    [key: string]: unknown;
  }>;
};

export async function fetchClerkUserById(
  clerkUserId: string,
): Promise<ClerkUserRecord | null> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        `Clerk user fetch failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
      );
      return null;
    }

    return (await response.json()) as ClerkUserRecord;
  } catch (error) {
    console.error("Clerk user fetch error:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveDiscordFromClerkUser(clerkUser: ClerkUserRecord): {
  discordUserId?: string;
  discordUsername?: string;
} {
  const fromAccounts = readDiscordIdFromClerkUser(clerkUser.external_accounts);
  if (fromAccounts.discordUserId) {
    return fromAccounts;
  }

  const fromMeta = readDiscordIdFromPublicMetadata(clerkUser.public_metadata ?? undefined);
  if (fromMeta) {
    return { discordUserId: fromMeta, discordUsername: fromAccounts.discordUsername };
  }

  return {};
}

export function clerkUserToProvisionArgs(clerkUser: ClerkUserRecord) {
  const primaryEmail = clerkUser.email_addresses?.[0]?.email_address;
  const fullName = [clerkUser.first_name, clerkUser.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const discord = resolveDiscordFromClerkUser(clerkUser);

  return {
    clerkUserId: clerkUser.id,
    name: fullName || clerkUser.username || undefined,
    email: primaryEmail || undefined,
    username: clerkUser.username || undefined,
    discordUserId: discord.discordUserId,
    discordUsername: discord.discordUsername,
  };
}

/** Admin-only: import all Clerk users into Convex as viewers. */
export const syncUsersFromClerk = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    await ctx.runQuery(internal.userProvisioning.assertAdminByToken, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      throw new ConvexError({
        message: "CLERK_SECRET_KEY is not configured on this Convex deployment",
        code: "FAILED_PRECONDITION",
      });
    }

    let offset = 0;
    let created = 0;
    let updated = 0;
    let clerkTotal = 0;
    let discordLinked = 0;
    let metadataSynced = 0;

    while (true) {
      const response = await fetch(
        `https://api.clerk.com/v1/users?limit=100&offset=${offset}&order_by=-created_at`,
        {
          headers: {
            Authorization: `Bearer ${secret}`,
          },
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new ConvexError({
          message: `Clerk API error (${response.status}): ${body.slice(0, 200)}`,
          code: "INTERNAL",
        });
      }

      const clerkUsers = (await response.json()) as ClerkUserRecord[];
      if (!Array.isArray(clerkUsers) || clerkUsers.length === 0) {
        break;
      }

      clerkTotal += clerkUsers.length;

      for (const clerkUser of clerkUsers) {
        const args = clerkUserToProvisionArgs(clerkUser);

        if (args.discordUserId) {
          discordLinked += 1;
          const patched = await ensureClerkPublicDiscordMetadata(
            clerkUser.id,
            args.discordUserId,
            clerkUser.public_metadata,
          );
          if (patched) {
            metadataSynced += 1;
          }
        } else if (clerkUser.external_accounts?.length) {
          console.warn(
            `Clerk user ${clerkUser.id} has external_accounts but no Discord snowflake`,
            clerkUser.external_accounts.map((account) => ({
              provider: account.provider,
              provider_user_id: account.provider_user_id,
              external_id: account.external_id,
              account_id: account.account_id,
            })),
          );
        }

        const result = await ctx.runMutation(
          internal.userProvisioning.provisionFromClerkData,
          args,
        );

        if (result.created) {
          created += 1;
        } else {
          updated += 1;
        }
      }

      offset += clerkUsers.length;
      if (clerkUsers.length < 100) {
        break;
      }
    }

    return { created, updated, clerkTotal, discordLinked, metadataSynced };
  },
});
