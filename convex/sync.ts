import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

const syncStatusArgs = {
  syncType: v.string(),
  status: v.string(),
  errorMessage: v.optional(v.string()),
  recordsAdded: v.optional(v.number()),
  recordsUpdated: v.optional(v.number()),
  recordsArchived: v.optional(v.number()),
};

async function applySyncStatusUpdate(
  ctx: MutationCtx,
  args: {
    syncType: string;
    status: string;
    errorMessage?: string;
    recordsAdded?: number;
    recordsUpdated?: number;
    recordsArchived?: number;
  },
) {
  const existingStatus = await ctx.db
    .query("syncStatus")
    .withIndex("by_type", (q) => q.eq("syncType", args.syncType))
    .first();

  const statusData = {
    syncType: args.syncType,
    lastSyncTime: Date.now(),
    status: args.status,
    errorMessage: args.errorMessage,
    recordsAdded: args.recordsAdded,
    recordsUpdated: args.recordsUpdated,
    recordsArchived: args.recordsArchived,
  };

  if (existingStatus) {
    await ctx.db.patch(existingStatus._id, statusData);
  } else {
    await ctx.db.insert("syncStatus", statusData);
  }
}

/** Used by cron jobs and admin sync actions — not callable from public pages. */
export const updateSyncStatusInternal = internalMutation({
  args: syncStatusArgs,
  handler: async (ctx, args) => {
    await applySyncStatusUpdate(ctx, args);
  },
});

export const updateSyncStatus = mutation({
  args: syncStatusArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await applySyncStatusUpdate(ctx, args);
  },
});

export const getSyncStatus = query({
  args: { syncType: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    return await ctx.db
      .query("syncStatus")
      .withIndex("by_type", (q) => q.eq("syncType", args.syncType))
      .first();
  },
});

export const getAllSyncStatuses = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    return await ctx.db.query("syncStatus").collect();
  },
});

export const stopSync = mutation({
  args: { syncType: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existingStatus = await ctx.db
      .query("syncStatus")
      .withIndex("by_type", (q) => q.eq("syncType", args.syncType))
      .first();

    if (existingStatus) {
      await ctx.db.patch(existingStatus._id, {
        status: "stopping",
      });
    }
  },
});
