import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { requireModeratorOrAdmin } from "../auth_helpers";

export const getPenalties = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.type !== "showdown") {
      return [];
    }

    const penalties = await ctx.db
      .query("eventPenalties")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const enriched = await Promise.all(
      penalties.map(async (penalty) => {
        const player = await ctx.db.get(penalty.playerId);
        return {
          ...penalty,
          playerName: player?.discordUsername ?? "Unknown",
          epicUsername: player?.epicUsername ?? "",
        };
      }),
    );

    return enriched;
  },
});

/** Players with Yunite results on this showdown event (for penalty assignment). */
export const getParticipantPlayers = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const playerIds = new Set<Id<"players">>();
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();
      for (const result of results) {
        if (result.playerId) {
          playerIds.add(result.playerId);
        }
      }
    }

    const players = await Promise.all(
      [...playerIds].map(async (playerId) => {
        const player = await ctx.db.get(playerId);
        if (!player) return null;
        return {
          _id: player._id,
          discordUsername: player.discordUsername,
          epicUsername: player.epicUsername,
        };
      }),
    );

    return players
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));
  },
});

export const addPenalty = mutation({
  args: {
    eventId: v.id("events"),
    playerId: v.id("players"),
    reason: v.string(),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const event = await ctx.db.get(args.eventId);
    if (!event || event.type !== "showdown") {
      throw new ConvexError({
        message: "Penalties are only supported on Showdown events",
        code: "INVALID_EVENT_TYPE",
      });
    }

    const amount = args.amount ?? event.penaltyAmount ?? 5;

    return await ctx.db.insert("eventPenalties", {
      eventId: args.eventId,
      playerId: args.playerId,
      reason: args.reason.trim(),
      amount,
      excluded: false,
    });
  },
});

export const updatePenalty = mutation({
  args: {
    penaltyId: v.id("eventPenalties"),
    reason: v.optional(v.string()),
    amount: v.optional(v.number()),
    excluded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const penalty = await ctx.db.get(args.penaltyId);
    if (!penalty) {
      throw new ConvexError({ message: "Penalty not found", code: "NOT_FOUND" });
    }

    const updates: Record<string, unknown> = {};
    if (args.reason !== undefined) updates.reason = args.reason.trim();
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.excluded !== undefined) updates.excluded = args.excluded;

    await ctx.db.patch(args.penaltyId, updates);
  },
});

export const removePenalty = mutation({
  args: { penaltyId: v.id("eventPenalties") },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const penalty = await ctx.db.get(args.penaltyId);
    if (!penalty) {
      throw new ConvexError({ message: "Penalty not found", code: "NOT_FOUND" });
    }

    await ctx.db.delete(args.penaltyId);
  },
});
