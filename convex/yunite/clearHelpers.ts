import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const getYuniteImports = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("thirdPartyImports")
      .filter((q) => 
        q.and(
          q.eq(q.field("source"), "Yunite"),
          q.eq(q.field("importMethod"), "api")
        )
      )
      .collect();
  },
});

export const deleteResultsBatch = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .take(args.batchSize);
    
    for (const result of results) {
      await ctx.db.delete(result._id);
    }
    
    return results.length;
  },
});

export const deleteImport = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.importId);
  },
});

export const cleanupOrphanedResults = internalMutation({
  args: {
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    // Get all import IDs that exist
    const allImports = await ctx.db.query("thirdPartyImports").collect();
    const validImportIds = new Set(allImports.map(i => i._id));
    
    // Get batch of results and check if their import exists
    const results = await ctx.db.query("thirdPartyResults").take(args.batchSize);
    
    let deleted = 0;
    for (const result of results) {
      if (!validImportIds.has(result.importId)) {
        await ctx.db.delete(result._id);
        deleted++;
      }
    }
    
    return deleted;
  },
});
