import { query } from "../_generated/server";
import { v } from "convex/values";

export const getByMapId = query({
  args: { mapId: v.string() },
  handler: async (ctx, args) => {
    const map = await ctx.db
      .query("sharedMaps")
      .withIndex("by_map_id", (q) => q.eq("mapId", args.mapId))
      .first();
    if (!map) return null;

    const { _id: _convexId, ...publicMap } = map;
    return publicMap;
  },
});
