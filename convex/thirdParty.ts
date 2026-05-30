import { v } from "convex/values";
import { query } from "./_generated/server";

// Check if an import with this leaderboard ID already exists
export const checkExistingImport = query({
  args: { leaderboardId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_leaderboard_id", (q) => q.eq("leaderboardId", args.leaderboardId))
      .first();
  },
});

// Get a specific import by ID
export const getImportById = query({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.importId);
  },
});
