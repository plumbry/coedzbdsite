/**
 * Dev/staging-only helpers for Phase 1 Discord migration testing.
 * Enabled only when MIGRATION_DEV_TOOLS_ENABLED=true on a Convex deployment.
 * Never enable on production.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isValidDiscordSnowflake } from "./auth_discord";
import type { Id } from "./_generated/dataModel";

function assertDevToolsEnabled(): void {
  if (process.env.MIGRATION_DEV_TOOLS_ENABLED !== "true") {
    throw new ConvexError({
      message: "Migration dev tools are disabled on this deployment",
      code: "FORBIDDEN",
    });
  }
}

/** Snapshot of production staff users for dev seeding (from ../convex-export/users/documents.jsonl). */
const DEV_STAFF_USER_SNAPSHOT = [
  {
    tokenIdentifier: "https://hercules.app|MkagOPWSSag4hcAqrqbM2bIp2SJVrIif",
    email: "brylee1975@gmail.com",
    name: "Bryony Lee",
    role: "admin" as const,
    username: "plumalt",
  },
  {
    tokenIdentifier: "https://hercules.app|usr_01KSJVHADWQTRHHWEMACJ1PPK3",
    email: "cherkoyt@gmail.com",
    name: "Cherko",
    username: "cherko",
  },
  {
    tokenIdentifier: "https://hercules.app|DfcyZKs4YCP0e1YX85e9Ex4nyF2Gsuhj",
    email: "plumbrytv@gmail.com",
    name: "Bryony",
    role: "event_mod" as const,
    username: "plumbrytv",
  },
  {
    tokenIdentifier: "https://hercules.app|usr_01KRYM55V99QTBCN7EJKGG0DVH",
    email: "billychurchbills@gmail.com",
    name: "Billy",
  },
  {
    tokenIdentifier: "https://hercules.app|wwjMrZRDJdPQFMWucXVAbcTuPBcMgtEA",
    email: "billychurch1@outlook.com",
    name: "",
    role: "admin" as const,
    username: "billy",
  },
  {
    tokenIdentifier: "https://hercules.app|J9ZyxyKuFpLWYrD4CYUAAyzVnsUq4gQs",
    email: "bryonyleenewnham@gmail.com",
    name: "Bryony Lee",
    role: "admin" as const,
    username: "plumbry",
  },
] as const;

export const isDevToolsEnabled = query({
  args: {},
  handler: async () => {
    return process.env.MIGRATION_DEV_TOOLS_ENABLED === "true";
  },
});

/** Idempotent seed of the six staff user rows on a dev Convex deployment. */
export const seedDevStaffUsers = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevToolsEnabled();

    const results: Array<{
      username?: string;
      email: string;
      action: "inserted" | "skipped";
      userId?: Id<"users">;
    }> = [];

    for (const snapshot of DEV_STAFF_USER_SNAPSHOT) {
      const existingByToken = await ctx.db
        .query("users")
        .withIndex("by_token", (q) =>
          q.eq("tokenIdentifier", snapshot.tokenIdentifier),
        )
        .unique();

      if (existingByToken) {
        results.push({
          username: snapshot.username,
          email: snapshot.email,
          action: "skipped",
          userId: existingByToken._id,
        });
        continue;
      }

      const userId = await ctx.db.insert("users", {
        tokenIdentifier: snapshot.tokenIdentifier,
        name: snapshot.name || undefined,
        email: snapshot.email,
        username: snapshot.username,
        role: "role" in snapshot ? snapshot.role : undefined,
      });

      results.push({
        username: snapshot.username,
        email: snapshot.email,
        action: "inserted",
        userId,
      });
    }

    return { results, total: results.length };
  },
});

/** Dev-only Discord pre-seed without requiring an authenticated admin (bootstrap). */
export const devSetDiscordLink = mutation({
  args: {
    userId: v.id("users"),
    discordUserId: v.string(),
    discordUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDevToolsEnabled();

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

    const duplicate = await ctx.db
      .query("users")
      .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", snowflake))
      .first();

    if (duplicate && duplicate._id !== args.userId) {
      throw new ConvexError({
        message: "Discord user id is already linked to another account",
        code: "CONFLICT",
      });
    }

    await ctx.db.patch(args.userId, {
      discordUserId: snowflake,
      ...(args.discordUsername
        ? { discordUsername: args.discordUsername.trim() }
        : {}),
    });

    return {
      success: true,
      userId: args.userId,
      discordUserId: snowflake,
      username: targetUser.username,
    };
  },
});

/** Read-only migration link status for staging verification. */
export const getMigrationLinkStatus = query({
  args: {},
  handler: async (ctx) => {
    assertDevToolsEnabled();

    const users = await ctx.db.query("users").collect();
    return users.map((user) => ({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      discordUserId: user.discordUserId,
      discordUsername: user.discordUsername,
      tokenIssuer: user.tokenIdentifier.split("|")[0],
      isClerkLinked: !user.tokenIdentifier.startsWith("https://hercules.app|"),
    }));
  },
});

/** Dev-only rollback of a botched link test (restores Hercules tokenIdentifier). */
export const devResetUserLink = mutation({
  args: {
    userId: v.id("users"),
    herculesTokenIdentifier: v.string(),
    clearDiscordLink: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDevToolsEnabled();

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }

    if (!args.herculesTokenIdentifier.startsWith("https://hercules.app|")) {
      throw new ConvexError({
        message: "herculesTokenIdentifier must use the Hercules issuer prefix",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.patch(args.userId, {
      tokenIdentifier: args.herculesTokenIdentifier,
      ...(args.clearDiscordLink ? { discordUserId: undefined, discordUsername: undefined } : {}),
    });

    return { success: true, userId: args.userId };
  },
});
