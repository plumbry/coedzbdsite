import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  buildProfilePatch,
  getDiscordUserIdFromIdentity,
  isValidDiscordSnowflake,
} from "./auth_discord";
import { requireAdmin } from "./auth_helpers";
import { getDisplayName } from "./auth_helpers";
import { logAudit } from "./helpers/audit";
import type { Doc, Id } from "./_generated/dataModel";

/** Legacy Hercules rows awaiting a first Clerk Discord login. */
function isUnlinkedMigrationUser(user: Doc<"users">): boolean {
  return user.tokenIdentifier.startsWith("https://hercules.app|");
}

async function findUsersByDiscordId(
  ctx: MutationCtx,
  discordUserId: string,
): Promise<Doc<"users">[]> {
  const match = await ctx.db
    .query("users")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
    .collect();

  return match;
}

async function assertDiscordUserIdAvailable(
  ctx: MutationCtx,
  discordUserId: string,
  excludeUserId?: Id<"users">,
): Promise<void> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
    .first();

  if (existing && existing._id !== excludeUserId) {
    throw new ConvexError({
      message: "Discord user id is already linked to another account",
      code: "CONFLICT",
    });
  }
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    return user;
  },
});

export const getUserByToken = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .first();
  },
});

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const profilePatch = buildProfilePatch(identity);
    const discordUserId = getDiscordUserIdFromIdentity(identity);

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        ...profilePatch,
        ...(discordUserId ? { discordUserId } : {}),
      });
      return existingUser._id;
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
          tokenIdentifier: identity.tokenIdentifier,
          discordUserId,
          ...profilePatch,
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

        return migrationUser._id;
      }
    }

    // Open sign-up: any authenticated user gets their own viewer row.
    // Skip discordUserId when it already belongs to an active (linked) account.
    const linkedDiscordOwner =
      discordUserId &&
      (await findUsersByDiscordId(ctx, discordUserId)).find(
        (user) => !isUnlinkedMigrationUser(user),
      );

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      role: "viewer",
      ...profilePatch,
      ...(discordUserId && !linkedDiscordOwner ? { discordUserId } : {}),
    });

    await logAudit(ctx, {
      userId,
      userName:
        profilePatch.name || profilePatch.email || profilePatch.discordUsername || "Unknown",
      action: "user_signed_up",
      entityType: "user",
      entityId: userId,
      details: `New user signed up (${profilePatch.email || profilePatch.name || identity.tokenIdentifier})`,
      newValue: "viewer",
    });

    return userId;
  },
});

/** Admin-only: pre-seed Discord snowflake before a staff member's first Clerk login. */
export const setDiscordLink = mutation({
  args: {
    userId: v.id("users"),
    discordUserId: v.string(),
    discordUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const snowflake = args.discordUserId.trim();
    if (!isValidDiscordSnowflake(snowflake)) {
      throw new ConvexError({
        message: "Invalid Discord user id (expected 17–20 digit snowflake)",
        code: "BAD_REQUEST",
      });
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }

    await assertDiscordUserIdAvailable(ctx, snowflake, args.userId);

    await ctx.db.patch(args.userId, {
      discordUserId: snowflake,
      ...(args.discordUsername
        ? { discordUsername: args.discordUsername.trim() }
        : {}),
    });

    await logAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "discord_link_preseeded",
      entityType: "user",
      entityId: args.userId,
      details: `Pre-seeded Discord link for ${targetUser.username || targetUser.email || args.userId}`,
      newValue: snowflake,
    });

    return { success: true, userId: args.userId, discordUserId: snowflake };
  },
});

export const setUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const trimmed = args.username.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      throw new ConvexError({
        message: "Username must be between 3 and 20 characters",
        code: "BAD_REQUEST",
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      throw new ConvexError({
        message: "Username can only contain letters, numbers, and underscores",
        code: "BAD_REQUEST",
      });
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", trimmed.toLowerCase()))
      .first();

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!currentUser) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }

    if (existing && existing._id !== currentUser._id) {
      throw new ConvexError({
        message: "Username is already taken",
        code: "CONFLICT",
      });
    }

    await ctx.db.patch(currentUser._id, {
      username: trimmed.toLowerCase(),
    });

    return { success: true };
  },
});

export const checkUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const trimmed = args.username.trim().toLowerCase();
    if (trimmed.length < 3) return { available: false, reason: "Too short" };

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", trimmed))
      .first();

    const identity = await ctx.auth.getUserIdentity();
    if (identity && existing) {
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_token", (q) =>
          q.eq("tokenIdentifier", identity.tokenIdentifier),
        )
        .unique();
      if (currentUser && existing._id === currentUser._id) {
        return { available: true };
      }
    }

    return { available: !existing };
  },
});

export const becomeAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }

    await ctx.db.patch(user._id, {
      role: "admin",
    });

    return user;
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("event_mod"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireAdmin(ctx);

    if (currentUser._id === args.userId && args.role !== "admin") {
      throw new ConvexError({
        message: "You cannot change your own role",
        code: "BAD_REQUEST",
      });
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }

    const previousRole = targetUser.role || "viewer";

    await ctx.db.patch(args.userId, {
      role: args.role,
    });

    await logAudit(ctx, {
      userId: currentUser._id,
      userName: getDisplayName(currentUser),
      action: "user_role_updated",
      entityType: "user",
      entityId: args.userId,
      details: `Changed role for ${targetUser.name || targetUser.email} from ${previousRole} to ${args.role}`,
      previousValue: previousRole,
      newValue: args.role,
    });

    return { success: true };
  },
});
