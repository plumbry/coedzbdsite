import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { computeInternalPlayerStats } from "./lib/stats/computeInternalPlayerStats";

export const getPlayerInternalStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await computeInternalPlayerStats(ctx, args.playerId);
  },
});

export const getPlayerInternalStatsInternal = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return await computeInternalPlayerStats(ctx, args.playerId);
  },
});
