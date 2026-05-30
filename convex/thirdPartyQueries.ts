import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

export const getPlayerThirdPartyResults = query({
  args: { 
    playerId: v.id("players"),
    linkedToEvent: v.optional(v.union(v.literal("linked"), v.literal("unlinked"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    // Filter based on whether the import is linked to an event and add event info
    const filteredResults = await Promise.all(
      results.map(async (result) => {
        const importRecord = await ctx.db.get(result.importId);
        const isLinked = importRecord?.eventId !== undefined;
        
        // Apply filter
        const filterType = args.linkedToEvent || "all";
        if (filterType === "linked" && !isLinked) return null;
        if (filterType === "unlinked" && isLinked) return null;
        
        // Get event info if linked
        let eventInfo = null;
        if (importRecord?.eventId) {
          const event = await ctx.db.get(importRecord.eventId);
          if (event) {
            eventInfo = {
              type: event.type,
              excludeLowestScore: event.excludeLowestScore || false,
            };
          }
        }
        
        return {
          ...result,
          eventInfo,
          importId: result.importId,
        };
      })
    );
    
    return filteredResults
      .filter((r) => r !== null)
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const getImportHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("thirdPartyImports")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getImportDetails = query({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      return null;
    }
    
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    return {
      ...importRecord,
      results,
    };
  },
});

export const getUnmatchedPlayers = query({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_matched", (q) => q.eq("importId", args.importId).eq("matched", false))
      .collect();
    
    return results;
  },
});

export const getAllImports = query({
  args: {},
  handler: async (ctx) => {
    const imports = await ctx.db
      .query("thirdPartyImports")
      .order("desc")
      .collect();
    
    return imports;
  },
});
