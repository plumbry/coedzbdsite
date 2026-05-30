import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const updateSyncStatus = mutation({
  args: {
    syncType: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    recordsAdded: v.optional(v.number()),
    recordsUpdated: v.optional(v.number()),
    recordsArchived: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
  },
});

export const getSyncStatus = query({
  args: { syncType: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    return await ctx.db
      .query("syncStatus")
      .withIndex("by_type", (q) => q.eq("syncType", args.syncType))
      .first();
  },
});

export const getAllSyncStatuses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    return await ctx.db.query("syncStatus").collect();
  },
});

export const stopSync = mutation({
  args: { syncType: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
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
