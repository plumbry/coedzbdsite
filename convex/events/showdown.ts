import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireModeratorOrAdmin } from "../auth_helpers";

// Lock (snapshot) player tiers for a showdown event
// This copies each player's current tier into the showdownTierSnapshots table
export const lockTiers = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.type !== "showdown") throw new Error("Only showdown events support tier locking");

    // Clear any existing snapshots for this event
    const existing = await ctx.db
      .query("showdownTierSnapshots")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    for (const snap of existing) {
      await ctx.db.delete(snap._id);
    }

    // Snapshot all players who have a tier
    const players = await ctx.db.query("players").collect();
    let count = 0;

    for (const player of players) {
      if (player.tier) {
        await ctx.db.insert("showdownTierSnapshots", {
          eventId: args.eventId,
          playerId: player._id,
          tier: player.tier,
        });
        count++;
      }
    }

    return { success: true, snapshotCount: count };
  },
});

// Check whether tiers have been locked for a showdown event
export const getTierLockStatus = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("showdownTierSnapshots")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .take(1);

    return {
      isLocked: snapshots.length > 0,
    };
  },
});

// Get all tier snapshots for a showdown event (used by leaderboard calculation)
export const getTierSnapshots = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("showdownTierSnapshots")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Build a map of playerId -> locked tier
    const tierMap: Record<string, string> = {};
    for (const snap of snapshots) {
      tierMap[snap.playerId] = snap.tier;
    }

    return tierMap;
  },
});
