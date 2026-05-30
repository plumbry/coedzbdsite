import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireModeratorOrAdmin } from "../auth_helpers";
import { ConvexError } from "convex/values";

// Get all groups (duo or trio) for an event
export const getEventDuoPairs = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const pairs = await ctx.db
      .query("eventDuoPairs")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Enrich with player names
    const enrichedPairs = await Promise.all(
      pairs.map(async (pair) => {
        const player1 = await ctx.db.get(pair.player1Id);
        const player2 = await ctx.db.get(pair.player2Id);
        const player3 = pair.player3Id ? await ctx.db.get(pair.player3Id) : null;
        return {
          ...pair,
          player1Name: player1?.discordUsername ?? "Unknown",
          player1Epic: player1?.epicUsername ?? "Unknown",
          player1Tier: player1?.tier ?? null,
          player2Name: player2?.discordUsername ?? "Unknown",
          player2Epic: player2?.epicUsername ?? "Unknown",
          player2Tier: player2?.tier ?? null,
          player3Name: player3?.discordUsername ?? null,
          player3Epic: player3?.epicUsername ?? null,
          player3Tier: player3?.tier ?? null,
        };
      })
    );

    return enrichedPairs;
  },
});

// Add a group (duo or trio) to an event
export const addDuoPair = mutation({
  args: {
    eventId: v.id("events"),
    player1Id: v.id("players"),
    player2Id: v.id("players"),
    player3Id: v.optional(v.id("players")),
  },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    // Validate event exists and is solos-meets-duos type
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    if (event.type !== "solos-meets-duos") {
      throw new ConvexError({
        message: "Groups can only be assigned to Solos Meets Duos events",
        code: "BAD_REQUEST",
      });
    }

    const isTrio = event.smdTeamSize === "trio";

    // Validate trio requires player3
    if (isTrio && !args.player3Id) {
      throw new ConvexError({
        message: "Trio events require 3 players per group",
        code: "BAD_REQUEST",
      });
    }

    // Validate players exist
    const player1 = await ctx.db.get(args.player1Id);
    const player2 = await ctx.db.get(args.player2Id);
    if (!player1 || !player2) {
      throw new ConvexError({ message: "One or more players not found", code: "NOT_FOUND" });
    }
    if (args.player3Id) {
      const player3 = await ctx.db.get(args.player3Id);
      if (!player3) {
        throw new ConvexError({ message: "Player 3 not found", code: "NOT_FOUND" });
      }
    }

    // Validate no duplicates
    const allPlayerIds = [args.player1Id, args.player2Id];
    if (args.player3Id) allPlayerIds.push(args.player3Id);
    const uniqueIds = new Set(allPlayerIds);
    if (uniqueIds.size !== allPlayerIds.length) {
      throw new ConvexError({ message: "Cannot have duplicate players in a group", code: "BAD_REQUEST" });
    }

    // Check if any player is already in a group for this event
    const existingPairs = await ctx.db
      .query("eventDuoPairs")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const assignedPlayerIds = new Set<string>();
    for (const pair of existingPairs) {
      assignedPlayerIds.add(pair.player1Id);
      assignedPlayerIds.add(pair.player2Id);
      if (pair.player3Id) assignedPlayerIds.add(pair.player3Id);
    }

    for (const playerId of allPlayerIds) {
      if (assignedPlayerIds.has(playerId)) {
        throw new ConvexError({
          message: "One or more players are already assigned to a group for this event",
          code: "CONFLICT",
        });
      }
    }

    const pairId = await ctx.db.insert("eventDuoPairs", {
      eventId: args.eventId,
      player1Id: args.player1Id,
      player2Id: args.player2Id,
      player3Id: args.player3Id,
    });

    return pairId;
  },
});

// Remove a group
export const removeDuoPair = mutation({
  args: { pairId: v.id("eventDuoPairs") },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const pair = await ctx.db.get(args.pairId);
    if (!pair) {
      throw new ConvexError({ message: "Group not found", code: "NOT_FOUND" });
    }

    await ctx.db.delete(args.pairId);
    return { success: true };
  },
});

// Clear all groups for an event
export const clearEventDuoPairs = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const pairs = await ctx.db
      .query("eventDuoPairs")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    for (const pair of pairs) {
      await ctx.db.delete(pair._id);
    }

    return { deletedCount: pairs.length };
  },
});
