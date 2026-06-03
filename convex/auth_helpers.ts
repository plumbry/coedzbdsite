import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/** Returns the user's preferred display name: username > name > email > fallback */
export function getDisplayName(user: Doc<"users">): string {
  return user.username || user.name || user.email || "Unknown";
}

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      message: "User not logged in",
      code: "UNAUTHENTICATED",
    });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .first();

  if (!user) {
    throw new ConvexError({
      message: "User not found",
      code: "NOT_FOUND",
    });
  }

  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);

  // Treat users without a role as viewers (for backward compatibility)
  if (!user.role || user.role !== "admin") {
    throw new ConvexError({
      message: "Admin access required",
      code: "FORBIDDEN",
    });
  }

  return user;
}

export async function requireModeratorOrAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);

  // Allow admins and event mods
  if (!user.role || (user.role !== "admin" && user.role !== "event_mod")) {
    throw new ConvexError({
      message: "Mod or admin access required",
      code: "FORBIDDEN",
    });
  }

  return user;
}

export async function requireEventBanAccess(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);

  // Allow admins and event mods
  if (!user.role || (user.role !== "admin" && user.role !== "event_mod")) {
    throw new ConvexError({
      message: "Mod or admin access required",
      code: "FORBIDDEN",
    });
  }

  return user;
}

/** Write access for event bans (admin or event_mod only). */
export async function requireEventBanWriteAccess(ctx: QueryCtx | MutationCtx) {
  return await requireEventBanAccess(ctx);
}
