import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { getDisplayName } from "./auth_helpers";
import { logAudit } from "./helpers/audit";

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
        q.eq("tokenIdentifier", identity.tokenIdentifier)
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
    // Only admins can view all users
    await requireAdmin(ctx);
    
    return await ctx.db.query("users").collect();
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

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existingUser) {
      // Update existing user's profile info
      await ctx.db.patch(existingUser._id, {
        name: identity.name,
        email: identity.email,
      });
      return existingUser._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
    });

    return userId;
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

    // Validate username format: 3-20 characters, alphanumeric and underscores only
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

    // Check uniqueness (case-insensitive)
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

    // If checking for the current user, it's available
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
        q.eq("tokenIdentifier", identity.tokenIdentifier)
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
    // Only admins can update user roles
    const currentUser = await requireAdmin(ctx);
    
    // Prevent admin from demoting themselves
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
    
    // Log audit
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
