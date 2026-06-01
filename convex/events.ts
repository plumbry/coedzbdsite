import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { touchPlayerEventParticipationOnInsert } from "./helpers/playerEventStats";

export const getPlayerEvents = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Public query - no authentication required
    return await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .order("desc")
      .collect();
  },
});

export const getAllEvents = query({
  args: {},
  handler: async (ctx) => {
    // Public query - returns all third-party results for the Event Results Manager
    // Get all third-party results that have been matched to players
    const results = await ctx.db
      .query("thirdPartyResults")
      .filter((q) => q.neq(q.field("playerId"), null))
      .order("desc")
      .collect();
    
    // Transform thirdPartyResults to match eventResults structure for compatibility
    const transformedResults = await Promise.all(
      results.map(async (result) => {
        // Get import details for event date
        const importData = await ctx.db.get(result.importId);
        const eventDate = importData?.eventDate || "";
        
        // Calculate K/D ratio
        const kdRatio = result.deaths && result.deaths > 0
          ? (result.eliminations || 0) / result.deaths
          : result.eliminations || 0;
        
        return {
          _id: result._id,
          _creationTime: result._creationTime,
          playerId: result.playerId!,
          eventName: result.eventName,
          eventDate,
          placement: result.placement,
          eliminations: result.eliminations || 0,
          kdRatio,
          eventScore: result.points, // Map points to eventScore
          yuniteLeaderboardUrl: result.leaderboardUrl,
          importId: result.importId,
          eventId: importData?.eventId,
        };
      })
    );
    
    return transformedResults;
  },
});

export const getEventResultSummaries = query({
  args: {},
  handler: async (ctx) => {
    const imports = await ctx.db.query("thirdPartyImports").order("desc").collect();
    const summaries = new Map<
      string,
      {
        eventName: string;
        eventDate: string;
        resultCount: number;
        importCount: number;
      }
    >();

    for (const importData of imports) {
      const existing = summaries.get(importData.eventName);
      const eventDate = importData.eventDate || "";
      if (!existing) {
        summaries.set(importData.eventName, {
          eventName: importData.eventName,
          eventDate,
          resultCount: importData.playersMatched,
          importCount: 1,
        });
        continue;
      }

      existing.resultCount += importData.playersMatched;
      existing.importCount += 1;
      if (eventDate > existing.eventDate) {
        existing.eventDate = eventDate;
      }
    }

    return Array.from(summaries.values()).sort((a, b) =>
      b.eventDate.localeCompare(a.eventDate),
    );
  },
});

export const getEventResultsForEvent = query({
  args: {
    eventName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 1000, 1000);
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_event_name", (q) => q.eq("eventName", args.eventName))
      .order("desc")
      .take(limit);

    const matchedResults = results.filter(
      (result): result is typeof result & { playerId: Id<"players"> } =>
        result.playerId !== undefined,
    );

    const importIds = Array.from(new Set(matchedResults.map((result) => result.importId)));
    const playerIds = Array.from(new Set(matchedResults.map((result) => result.playerId)));

    const imports = await Promise.all(importIds.map(async (id) => [id, await ctx.db.get(id)] as const));
    const players = await Promise.all(playerIds.map(async (id) => [id, await ctx.db.get(id)] as const));

    const importsById = new Map(imports);
    const playersById = new Map(players);

    return matchedResults.map((result) => {
      const importData = importsById.get(result.importId);
      const player = playersById.get(result.playerId);
      const kdRatio = result.deaths && result.deaths > 0
        ? (result.eliminations || 0) / result.deaths
        : result.eliminations || 0;

      return {
        _id: result._id,
        _creationTime: result._creationTime,
        playerId: result.playerId,
        playerName: player?.discordUsername || result.discordUsername || result.epicUsername,
        playerTier: player?.tier,
        eventName: result.eventName,
        eventDate: importData?.eventDate || "",
        placement: result.placement,
        eliminations: result.eliminations || 0,
        kdRatio,
        eventScore: result.points,
        yuniteLeaderboardUrl: result.leaderboardUrl,
        importId: result.importId,
        eventId: importData?.eventId,
      };
    });
  },
});

export const createEvent = mutation({
  args: {
    playerId: v.id("players"),
    eventName: v.string(),
    eventDate: v.string(),
    placement: v.number(),
    eliminations: v.number(),
    kdRatio: v.number(),
    eventScore: v.number(),
    yuniteLeaderboardUrl: v.optional(v.string()),
    importId: v.optional(v.id("thirdPartyImports")),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    
    if (!user) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }
    
    await touchPlayerEventParticipationOnInsert(
      ctx,
      args.playerId,
      args.eventName,
      args.eventDate,
    );

    const resultId = await ctx.db.insert("eventResults", {
      playerId: args.playerId,
      eventName: args.eventName,
      eventDate: args.eventDate,
      placement: args.placement,
      eliminations: args.eliminations,
      kdRatio: args.kdRatio,
      eventScore: args.eventScore,
      yuniteLeaderboardUrl: args.yuniteLeaderboardUrl,
      createdBy: user._id,
      importId: args.importId,
      eventId: args.eventId,
    });
    
    return resultId;
  },
});

export const deleteEvent = mutation({
  args: { 
    eventId: v.union(v.id("eventResults"), v.id("thirdPartyResults"))
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    await ctx.db.delete(args.eventId);
  },
});

// Delete all results for a specific event by name
export const deleteAllEventResultsByName = mutation({
  args: { eventName: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_event_name", (q) => q.eq("eventName", args.eventName))
      .take(1000);
    
    // Delete each result
    for (const result of results) {
      await ctx.db.delete(result._id);
    }
    
    return {
      deleted: results.length,
    };
  },
});

// Update all eventResults for a given import when import metadata is updated
export const updateEventResultsFromImport = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    eventName: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    yuniteLeaderboardUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    // Get all eventResults for this import
    const results = await ctx.db
      .query("eventResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    // Update each result
    let updated = 0;
    for (const result of results) {
      const updates: Partial<{
        eventName: string;
        eventDate: string;
        yuniteLeaderboardUrl: string;
      }> = {};
      
      if (args.eventName !== undefined) updates.eventName = args.eventName;
      if (args.eventDate !== undefined) updates.eventDate = args.eventDate;
      if (args.yuniteLeaderboardUrl !== undefined) updates.yuniteLeaderboardUrl = args.yuniteLeaderboardUrl;
      
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(result._id, updates);
        updated++;
      }
    }
    
    return { updated };
  },
});

// Link/unlink all eventResults for a given import to an Event
export const linkEventResultsToEvent = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    eventId: v.union(v.id("events"), v.null()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    // Get all eventResults for this import
    const results = await ctx.db
      .query("eventResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    // Update each result
    for (const result of results) {
      await ctx.db.patch(result._id, {
        eventId: args.eventId || undefined,
      });
    }
    
    return { updated: results.length };
  },
});

// Update all eventResults with a specific event name
export const updateEventResultsByName = mutation({
  args: {
    oldEventName: v.string(),
    newEventName: v.optional(v.string()),
    newEventDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Admin access required",
        code: "FORBIDDEN",
      });
    }
    
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_event_name", (q) => q.eq("eventName", args.oldEventName))
      .take(1000);
    
    // Update each result's event name
    let updated = 0;
    const importIdsSet = new Set<string>();

    for (const result of results) {
      importIdsSet.add(result.importId);
    }
    
    if (args.newEventName !== undefined) {
      for (const result of results) {
        await ctx.db.patch(result._id, { eventName: args.newEventName });
        updated++;
      }
    }
    
    // Also update the imports' metadata
    const importIds = Array.from(importIdsSet);
    for (const importIdStr of importIds) {
      const importUpdates: Partial<{
        eventName: string;
        eventDate: string;
      }> = {};
      
      if (args.newEventName !== undefined) importUpdates.eventName = args.newEventName;
      if (args.newEventDate !== undefined) importUpdates.eventDate = args.newEventDate;
      
      if (Object.keys(importUpdates).length > 0) {
        await ctx.db.patch(importIdStr as unknown as import("./_generated/dataModel.d.ts").Id<"thirdPartyImports">, importUpdates);
      }
    }
    
    if (updated === 0 && args.newEventDate !== undefined) {
      updated = results.length;
    }

    return { updated };
  },
});

// Get player statistics
export const getPlayerStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Public query - no authentication required
    const events = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    if (events.length === 0) {
      return {
        totalEvents: 0,
        averagePlacement: 0,
        averageKD: 0,
        totalEliminations: 0,
        winCount: 0,
        winPercentage: 0,
      };
    }
    
    const totalEliminations = events.reduce((sum, e) => sum + e.eliminations, 0);
    const averagePlacement = events.reduce((sum, e) => sum + e.placement, 0) / events.length;
    const averageKD = events.reduce((sum, e) => sum + e.kdRatio, 0) / events.length;
    const winCount = events.filter(e => e.placement === 1).length;
    const winPercentage = (winCount / events.length) * 100;
    
    return {
      totalEvents: events.length,
      averagePlacement: Math.round(averagePlacement * 10) / 10,
      averageKD: Math.round(averageKD * 100) / 100,
      totalEliminations,
      winCount,
      winPercentage: Math.round(winPercentage * 10) / 10,
    };
  },
});
