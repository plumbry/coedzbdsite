import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getDisplayName } from "../auth_helpers";
import { isValidViewerToken } from "../eventBans/viewerAuth";
export const viewerTokenArg = v.optional(v.string());

export const accessMethodValidator = v.union(
  v.literal("admin"),
  v.literal("password"),
);

export type OpsHubAccess = {
  method: "admin" | "password";
  actorLabel: string;
};

async function hasAdminAccess(ctx: QueryCtx): Promise<{  actorLabel: string;
} | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (!user || user.role !== "admin") return null;

  return { actorLabel: getDisplayName(user) };
}

async function hasModOrAdminReadAccess(ctx: QueryCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  return user?.role === "admin" || user?.role === "event_mod";
}

/** View access: site admins, event mods, or a valid password session. */
export async function requireOpsHubReadAccess(
  ctx: QueryCtx,
  viewerToken?: string,
): Promise<OpsHubAccess> {
  const admin = await hasAdminAccess(ctx);
  if (admin) {
    return { method: "admin", actorLabel: admin.actorLabel };
  }

  if (await hasModOrAdminReadAccess(ctx)) {
    return { method: "password", actorLabel: "Staff access" };
  }

  if (await isValidViewerToken(ctx, viewerToken)) {
    return { method: "password", actorLabel: "Password access" };
  }

  throw new ConvexError({
    message: "Operations Hub access required",
    code: "FORBIDDEN",
  });
}

/** Write access: site admins only (live edits during events). */
export async function requireOpsHubWriteAccess(
  ctx: MutationCtx,
): Promise<OpsHubAccess> {
  const admin = await hasAdminAccess(ctx);
  if (admin) {
    return { method: "admin", actorLabel: admin.actorLabel };
  }

  throw new ConvexError({
    message: "Admin access required to edit Operations Hub data",
    code: "FORBIDDEN",
  });
}

export function auditFields(access: OpsHubAccess, now: number) {
  return {
    createdAt: now,
    updatedAt: now,
    createdBy: access.actorLabel,
    updatedBy: access.actorLabel,
    createdAccessMethod: access.method,
    updatedAccessMethod: access.method,
  };
}

export function updateAuditFields(access: OpsHubAccess, now: number) {
  return {
    updatedAt: now,
    updatedBy: access.actorLabel,
    updatedAccessMethod: access.method,
  };
}
