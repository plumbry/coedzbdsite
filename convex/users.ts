import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { isValidDiscordSnowflake } from "./auth_discord";
import {
  ANALYTICS_STATS_REFRESH_COOLDOWN_MS,
  getDisplayName,
  requireAdmin,
} from "./auth_helpers";
import { logAudit } from "./helpers/audit";
import type { Doc, Id } from "./_generated/dataModel";
import { countUserReferences } from "./userMerge";
import { isUnlinkedMigrationUser, provisionFromIdentity } from "./userProvisioning";

function userLabel(user: Pick<Doc<"users">, "_id" | "username" | "name" | "email">): string {
  return user.username || user.name || user.email || user._id;
}

function canSetUsername(role: Doc<"users">["role"]): boolean {
  return role === "admin" || role === "event_mod" || role === "analytics";
}

function assertDeletableUser(
  admin: Doc<"users">,
  target: Doc<"users">,
): void {
  if (admin._id === target._id) {
    throw new ConvexError({
      message: "You cannot delete your own account",
      code: "BAD_REQUEST",
    });
  }

  if (target.role === "admin") {
    throw new ConvexError({
      message: "Admin accounts cannot be deleted from User Management",
      code: "BAD_REQUEST",
    });
  }
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
      .first();

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

    return await provisionFromIdentity(ctx, identity);
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

    if (!canSetUsername(currentUser.role)) {
      throw new ConvexError({
        message: "Only admins, moderators, and analytics users can set a username",
        code: "FORBIDDEN",
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

export const getAnalyticsStatsRefreshCooldown = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { applies: false as const, canRefresh: true };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .first();

    if (!user || user.role !== "analytics") {
      return { applies: false as const, canRefresh: true };
    }

    const lastRefreshAt = user.lastAnalyticsStatsRefreshAt;
    if (!lastRefreshAt) {
      return {
        applies: true as const,
        canRefresh: true,
        lastRefreshAt: undefined,
        nextAvailableAt: undefined,
      };
    }

    const nextAvailableAt = lastRefreshAt + ANALYTICS_STATS_REFRESH_COOLDOWN_MS;
    return {
      applies: true as const,
      canRefresh: Date.now() >= nextAvailableAt,
      lastRefreshAt,
      nextAvailableAt,
    };
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("admin"),
      v.literal("event_mod"),
      v.literal("viewer"),
      v.literal("analytics"),
    ),
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
      ...(canSetUsername(args.role) ? {} : { username: undefined }),
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

export const clearViewerUsernames = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    let cleared = 0;

    for (const user of users) {
      if (!user.username || (user.role && user.role !== "viewer")) {
        continue;
      }

      await ctx.db.patch(user._id, { username: undefined });
      cleared++;
    }

    if (cleared > 0) {
      await logAudit(ctx, {
        userId: currentUser._id,
        userName: getDisplayName(currentUser),
        action: "viewer_usernames_cleared",
        entityType: "user",
        details: `Cleared usernames for ${cleared} viewer account${cleared === 1 ? "" : "s"}`,
        newValue: String(cleared),
      });
    }

    return { cleared };
  },
});

export const previewUserDelete = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }

    const references = await countUserReferences(ctx, args.userId);
    const referenceTotal = Object.values(references).reduce((sum, count) => sum + count, 0);

    return {
      user: {
        _id: target._id,
        name: target.name,
        username: target.username,
        email: target.email,
        role: target.role,
        discordUserId: target.discordUserId,
        discordUsername: target.discordUsername,
        isClerkLinked: !isUnlinkedMigrationUser(target),
        isLegacy: isUnlinkedMigrationUser(target),
      },
      references,
      referenceTotal,
    };
  },
});

export const deleteUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }

    assertDeletableUser(admin, target);

    const references = await countUserReferences(ctx, args.userId);

    const passports = await ctx.db
      .query("seasonalPassports")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const passport of passports) {
      await ctx.db.delete(passport._id);
    }

    await ctx.db.delete(args.userId);

    await logAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "user_deleted",
      entityType: "user",
      entityId: args.userId,
      details: `Deleted account ${userLabel(target)} (${target.email || "no email"})`,
      previousValue: JSON.stringify({
        email: target.email,
        username: target.username,
        role: target.role,
        discordUserId: target.discordUserId,
        references,
      }),
    });

    return {
      success: true,
      deletedUserId: args.userId,
      passportsRemoved: passports.length,
      references,
    };
  },
});
