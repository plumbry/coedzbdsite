import { mutation, query, internalQuery } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { requireEventBanWriteAccess } from "../auth_helpers";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const viewerTokenArg = v.optional(v.string());

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function getViewerPassword(): string | undefined {
  const password = process.env.EVENT_BANS_VIEWER_PASSWORD;
  return password && password.length > 0 ? password : undefined;
}

export async function isValidViewerToken(
  ctx: QueryCtx,
  viewerToken: string | undefined,
): Promise<boolean> {
  if (!viewerToken) return false;

  const session = await ctx.db
    .query("eventBansViewerSessions")
    .withIndex("by_token", (q) => q.eq("token", viewerToken))
    .unique();

  return session !== null && session.expiresAt > Date.now();
}

async function hasStaffEventBanAccess(ctx: QueryCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  return user?.role === "admin" || user?.role === "event_mod";
}

/** Staff (admin/event_mod) or a valid viewer session token. */
export async function requireEventBanReadAccess(
  ctx: QueryCtx,
  viewerToken?: string,
): Promise<void> {
  if (await hasStaffEventBanAccess(ctx)) return;

  if (await isValidViewerToken(ctx, viewerToken)) return;

  throw new ConvexError({
    message: "Event ban read access required",
    code: "FORBIDDEN",
  });
}

export const createViewerSession = mutation({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    const expected = getViewerPassword();
    if (!expected) {
      throw new ConvexError({
        message: "Viewer access is not configured",
        code: "FAILED_PRECONDITION",
      });
    }

    if (!safeEqual(args.password, expected)) {
      throw new ConvexError({
        message: "Incorrect password",
        code: "UNAUTHORIZED",
      });
    }

    const now = Date.now();
    const expired = await ctx.db.query("eventBansViewerSessions").collect();
    for (const session of expired) {
      if (session.expiresAt <= now) {
        await ctx.db.delete(session._id);
      }
    }

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await ctx.db.insert("eventBansViewerSessions", {
      token,
      expiresAt: now + SESSION_TTL_MS,
    });

    return { token, expiresAt: now + SESSION_TTL_MS };
  },
});

export const isSessionValid = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, args) => {
    return await isValidViewerToken(ctx, args.viewerToken);
  },
});

export const assertStaffWriteAccess = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireEventBanWriteAccess(ctx);
  },
});
