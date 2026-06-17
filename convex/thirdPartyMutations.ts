import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAdmin, getDisplayName } from "./auth_helpers";
import { touchPlayerEventParticipationOnInsert } from "./helpers/playerEventStats";
import type { Id } from "./_generated/dataModel.d.ts";
import { appendLeaderboardUrlToEvent } from "./lib/eventLeaderboardLinks";
import {
  refreshEventCache,
  refreshEventCacheForImport,
} from "./lib/eventCache";
import {
  collectEventLeaderboardUrls,
  extractTournamentIdFromLeaderboardId,
  extractTournamentIdFromUrl,
} from "./lib/yunite";
import { matchPlayerForImportFromLookup } from "./lib/stats/matchPlayerFromLookup";
import { rematchImportResults } from "./lib/importRematch";
import type { Doc } from "./_generated/dataModel.d.ts";

async function findPlayerIdForImportEntry(
  ctx: MutationCtx,
  entry: {
    discordId?: string | null;
    epicId?: string | null;
    epicUsername?: string | null;
    discordUsername?: string | null;
  },
): Promise<Id<"players"> | undefined> {
  const { playerId } = await matchPlayerForImportFromLookup(ctx, entry);
  return playerId ?? undefined;
}

// Helper to check existing import
export const checkExistingImport = internalMutation({
  args: { leaderboardId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_leaderboard_id", (q) => q.eq("leaderboardId", args.leaderboardId))
      .first();
  },
});

// Helper to save import data
export const saveImport = internalMutation({
  args: {
    leaderboardUrl: v.string(),
    leaderboardId: v.string(),
    eventName: v.string(),
    entries: v.array(v.object({
      epicUsername: v.string(),
      discordUsername: v.optional(v.string()),
      discordId: v.optional(v.string()),
      placement: v.number(),
      points: v.number(),
      eliminations: v.optional(v.number()),
      teamMembers: v.optional(v.array(v.string())),
    })),
    importedBy: v.string(),
    importedByName: v.string(),
  },
  handler: async (ctx, args) => {
    // Get user by token identifier
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.importedBy))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    const affectedPlayerIds = new Set<Id<"players">>();
    
    // Create the import record
    // Auto-link: find a matching event that has this leaderboard URL
    const importTournamentId = extractTournamentIdFromUrl(args.leaderboardUrl) 
      || extractTournamentIdFromLeaderboardId(args.leaderboardId);
    
    let matchedEventId: Id<"events"> | undefined;
    if (importTournamentId) {
      const allEvents = await ctx.db.query("events").collect();
      for (const event of allEvents) {
        const eventUrls = collectEventLeaderboardUrls(event, {
          includeStandardLobby2: false,
        });
        for (const url of eventUrls) {
          const eventTournamentId = extractTournamentIdFromUrl(url);
          if (eventTournamentId && eventTournamentId === importTournamentId) {
            matchedEventId = event._id;
            break;
          }
        }
        if (matchedEventId) break;
      }
    }
    
    const importId = await ctx.db.insert("thirdPartyImports", {
      leaderboardUrl: args.leaderboardUrl,
      leaderboardId: args.leaderboardId,
      eventName: args.eventName,
      source: "Yunite",
      playersMatched: 0,
      playersUnmatched: 0,
      totalPlayers: args.entries.length,
      importedBy: user._id,
      importedByName: args.importedByName,
      eventId: matchedEventId,
    });

    if (matchedEventId) {
      await appendLeaderboardUrlToEvent(ctx, matchedEventId, args.leaderboardUrl);
    }
    
    // Process each entry
    for (const entry of args.entries) {
      const matchedPlayerId = await findPlayerIdForImportEntry(ctx, {
        discordId: entry.discordId,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
      });

      if (matchedPlayerId) {
        playersMatched++;
        affectedPlayerIds.add(matchedPlayerId);
      } else {
        playersUnmatched++;
      }

      await ctx.db.insert("thirdPartyResults", {
        importId,
        playerId: matchedPlayerId,
        eventName: args.eventName,
        source: "Yunite",
        leaderboardUrl: args.leaderboardUrl,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
        discordId: entry.discordId,
        placement: entry.placement,
        points: entry.points,
        eliminations: entry.eliminations,
        teamMembers: entry.teamMembers,
        matched: !!matchedPlayerId,
      });
    }
    
    // Update import record with match counts
    await ctx.db.patch(importId, {
      playersMatched,
      playersUnmatched,
    });

    if (affectedPlayerIds.size > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
        { playerIds: [...affectedPlayerIds] },
      );
    }
    
    // Log to audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: args.importedByName,
      action: "third_party_import_created",
      entityType: "thirdPartyImport",
      entityId: importId,
      details: JSON.stringify({
        eventName: args.eventName,
        source: "Yunite",
        totalPlayers: args.entries.length,
        matched: playersMatched,
        unmatched: playersUnmatched,
      }),
    });
    
    return {
      success: true,
      eventName: args.eventName,
      totalPlayers: args.entries.length,
      playersMatched,
      playersUnmatched,
    };
  },
});

// Import from CSV
export const importFromCSV = mutation({
  args: {
    eventName: v.string(),
    eventDate: v.optional(v.string()),
    source: v.string(),
    leaderboardUrl: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    entries: v.array(v.object({
      epicUsername: v.string(),
      discordUsername: v.optional(v.string()),
      discordId: v.optional(v.string()),
      placement: v.number(),
      points: v.number(),
      eliminations: v.optional(v.number()),
      wins: v.optional(v.number()),
      teamId: v.optional(v.string()),
      teamName: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    // Get user by token identifier
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    // Generate a unique ID for this import
    const leaderboardId = `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    const affectedPlayerIds = new Set<Id<"players">>();
    
    // Create the import record
    const importId = await ctx.db.insert("thirdPartyImports", {
      leaderboardUrl: args.leaderboardUrl || `CSV Import: ${args.eventName}`,
      leaderboardId,
      eventName: args.eventName,
      eventDate: args.eventDate,
      source: args.source,
      importMethod: "csv",
      eventId: args.eventId,
      playersMatched: 0,
      playersUnmatched: 0,
      totalPlayers: args.entries.length,
      importedBy: user._id,
      importedByName: getDisplayName(user),
    });
    
    // Process each entry
    for (const entry of args.entries) {
      const matchedPlayerId = await findPlayerIdForImportEntry(ctx, {
        discordId: entry.discordId,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
      });

      if (matchedPlayerId) {
        playersMatched++;
        affectedPlayerIds.add(matchedPlayerId);
      } else {
        playersUnmatched++;
      }

      await ctx.db.insert("thirdPartyResults", {
        importId,
        playerId: matchedPlayerId,
        eventName: args.eventName,
        source: args.source,
        leaderboardUrl: args.leaderboardUrl || `CSV Import: ${args.eventName}`,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
        discordId: entry.discordId,
        placement: entry.placement,
        points: entry.points,
        eliminations: entry.eliminations,
        wins: entry.wins,
        teamId: entry.teamId,
        teamName: entry.teamName,
        matched: !!matchedPlayerId,
      });
    }
    
    // Update import record with match counts
    await ctx.db.patch(importId, {
      playersMatched,
      playersUnmatched,
    });
    
    // Log to audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: getDisplayName(user),
      action: "third_party_csv_import",
      entityType: "thirdPartyImport",
      entityId: importId,
      details: JSON.stringify({
        eventName: args.eventName,
        source: args.source,
        totalPlayers: args.entries.length,
        matched: playersMatched,
        unmatched: playersUnmatched,
      }),
    });

    if (affectedPlayerIds.size > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
        { playerIds: [...affectedPlayerIds] },
      );
    }

    if (args.eventId) {
      await refreshEventCache(ctx, args.eventId);
    }
    
    return {
      success: true,
      eventName: args.eventName,
      totalPlayers: args.entries.length,
      playersMatched,
      playersUnmatched,
    };
  },
});

// Delete an import and all its results
export const deleteImport = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    // Get the import
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      throw new Error("Import not found");
    }
    
    // Delete all results for this import
    const results = await ctx.db
      .query("thirdPartyResults")
      .filter((q) => q.eq(q.field("importId"), args.importId))
      .collect();
    
    for (const result of results) {
      await ctx.db.delete(result._id);
    }
    
    // Delete the import record
    await ctx.db.delete(args.importId);
    
    // Get user for audit log
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      // Log to audit
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "third_party_delete",
        entityType: "thirdPartyImport",
        entityId: args.importId,
        details: JSON.stringify({
          eventName: importRecord.eventName,
          totalPlayers: importRecord.totalPlayers,
          resultsDeleted: results.length,
        }),
      });
    }
    
    return {
      success: true,
      eventName: importRecord.eventName,
    };
  },
});

// Re-match an existing import with current player data
export const rematchImport = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    // Get the import
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      throw new Error("Import not found");
    }
    
    const rematch = await rematchImportResults(ctx, args.importId);
    const playersMatched = rematch.playersMatched;
    const playersUnmatched = rematch.playersUnmatched;
    const newMatches = rematch.newMatches;
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    if (rematch.affectedPlayerIds.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
        { playerIds: rematch.affectedPlayerIds },
      );
    }
    
    // Get user for audit log
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      // Log to audit
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "third_party_rematch",
        entityType: "thirdPartyImport",
        entityId: args.importId,
        details: JSON.stringify({
          eventName: importRecord.eventName,
          totalPlayers: results.length,
          matched: playersMatched,
          unmatched: playersUnmatched,
          newMatches,
        }),
      });
    }
    
    return {
      success: true,
      eventName: importRecord.eventName,
      totalPlayers: results.length,
      playersMatched,
      playersUnmatched,
      newMatches,
    };
  },
});

// Refresh all imports (re-match all players)
export const refreshAllImports = mutation({
  args: {},
  handler: async (ctx) => {
    // Require admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get all imports
    const allImports = await ctx.db.query("thirdPartyImports").collect();
    
    let totalRematchedImports = 0;
    let totalNewMatches = 0;
    
    const allAffectedPlayerIds = new Set<Id<"players">>();

    for (const importRecord of allImports) {
      const rematch = await rematchImportResults(ctx, importRecord._id);
      if (rematch.newMatches > 0) {
        totalRematchedImports += 1;
        totalNewMatches += rematch.newMatches;
      }
      for (const playerId of rematch.affectedPlayerIds) {
        allAffectedPlayerIds.add(playerId);
      }
    }

    if (allAffectedPlayerIds.size > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
        { playerIds: [...allAffectedPlayerIds] },
      );
    }
    
    // Log to audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: getDisplayName(user),
      action: "refresh_all_imports",
      entityType: "thirdPartyImport",
      details: JSON.stringify({
        totalImports: allImports.length,
        rematchedImports: totalRematchedImports,
        totalNewMatches,
      }),
    });
    
    return {
      success: true,
      totalImports: allImports.length,
      rematchedImports: totalRematchedImports,
      totalNewMatches,
    };
  },
});

// Save Yunite API import
export const saveYuniteAPIImport = internalMutation({
  args: {
    leaderboardUrl: v.string(),
    leaderboardId: v.string(),
    eventName: v.string(),
    eventDate: v.optional(v.string()),
    entries: v.array(v.object({
      epicId: v.string(),
      discordId: v.string(),
      teamId: v.string(),
      placement: v.number(),
      points: v.number(),
      eliminations: v.number(),
      wins: v.number(),
      averagePlacement: v.number(),
      averageSecondsSurvived: v.number(),
      teamMembers: v.array(v.string()),
    })),
    importedBy: v.string(),
    importedByName: v.string(),
  },
  handler: async (ctx, args) => {
    // Get user by token identifier
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.importedBy))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    const affectedPlayerIds = new Set<Id<"players">>();
    
    // Create the import record
    const importId = await ctx.db.insert("thirdPartyImports", {
      leaderboardUrl: args.leaderboardUrl,
      leaderboardId: args.leaderboardId,
      eventName: args.eventName,
      eventDate: args.eventDate,
      source: "Yunite API",
      importMethod: "api",
      playersMatched: 0,
      playersUnmatched: 0,
      totalPlayers: args.entries.length,
      importedBy: user._id,
      importedByName: args.importedByName,
    });
    
    // Process each entry
    for (const entry of args.entries) {
      const matchedPlayerId = await findPlayerIdForImportEntry(ctx, {
        discordId: entry.discordId,
        epicId: entry.epicId,
        epicUsername: entry.epicId,
      });
      
      if (matchedPlayerId) {
        playersMatched++;
        affectedPlayerIds.add(matchedPlayerId);
      } else {
        playersUnmatched++;
      }

      await ctx.db.insert("thirdPartyResults", {
        importId,
        playerId: matchedPlayerId,
        eventName: args.eventName,
        source: "Yunite API",
        leaderboardUrl: args.leaderboardUrl,
        epicUsername: entry.epicId, // Use epicId as epicUsername for display
        epicId: entry.epicId,
        discordId: entry.discordId,
        teamId: entry.teamId,
        placement: entry.placement,
        points: entry.points,
        eliminations: entry.eliminations,
        wins: entry.wins,
        averagePlacement: entry.averagePlacement,
        averageSecondsSurvived: entry.averageSecondsSurvived,
        teamMembers: entry.teamMembers,
        matched: !!matchedPlayerId,
      });
    }
    
    // Update import record with match counts
    await ctx.db.patch(importId, {
      playersMatched,
      playersUnmatched,
    });

    if (affectedPlayerIds.size > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
        { playerIds: [...affectedPlayerIds] },
      );
    }
    
    // Log to audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: args.importedByName,
      action: "third_party_api_import",
      entityType: "thirdPartyImport",
      entityId: importId,
      details: JSON.stringify({
        eventName: args.eventName,
        source: "Yunite API",
        totalPlayers: args.entries.length,
        matched: playersMatched,
        unmatched: playersUnmatched,
      }),
    });
    
    return {
      success: true,
      eventName: args.eventName,
      totalPlayers: args.entries.length,
      playersMatched,
      playersUnmatched,
    };
  },
});

// Update import details (event name, date, organizer)
export const updateImportDetails = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    eventName: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    organizer: v.optional(v.string()),
    leaderboardUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      throw new Error("Import not found");
    }
    
    // Build update object
    const updates: {
      eventName?: string;
      eventDate?: string;
      organizer?: string;
      leaderboardUrl?: string;
    } = {};
    
    if (args.eventName !== undefined) updates.eventName = args.eventName;
    if (args.eventDate !== undefined) updates.eventDate = args.eventDate;
    if (args.organizer !== undefined) updates.organizer = args.organizer;
    if (args.leaderboardUrl !== undefined) updates.leaderboardUrl = args.leaderboardUrl;
    
    // Update the import
    await ctx.db.patch(args.importId, updates);
    
    // Update all thirdPartyResults if event name changed
    if (args.eventName && args.eventName !== importRecord.eventName) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", args.importId))
        .collect();
      
      for (const result of results) {
        await ctx.db.patch(result._id, { eventName: args.eventName });
      }
    }
    
    // Also update all eventResults (for Yunite API imports)
    const eventResults = await ctx.db
      .query("eventResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    if (eventResults.length > 0) {
      const eventUpdates: Partial<{
        eventName: string;
        eventDate: string;
        yuniteLeaderboardUrl: string;
      }> = {};
      
      if (args.eventName !== undefined) eventUpdates.eventName = args.eventName;
      if (args.eventDate !== undefined) eventUpdates.eventDate = args.eventDate;
      if (args.leaderboardUrl !== undefined) eventUpdates.yuniteLeaderboardUrl = args.leaderboardUrl;
      
      if (Object.keys(eventUpdates).length > 0) {
        for (const result of eventResults) {
          await ctx.db.patch(result._id, eventUpdates);
        }
      }
    }
    
    // Get user for audit log
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "third_party_update",
        entityType: "thirdPartyImport",
        entityId: args.importId,
        details: JSON.stringify({
          updates,
          oldEventName: importRecord.eventName,
        }),
      });
    }
    
    return { success: true };
  },
});

// Manually link unmatched player to existing player
export const manuallyLinkPlayer = mutation({
  args: {
    resultId: v.id("thirdPartyResults"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    const result = await ctx.db.get(args.resultId);
    if (!result) {
      throw new Error("Result not found");
    }
    
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }
    
    const wasMatched = result.matched;
    
    // Update the result
    await ctx.db.patch(args.resultId, {
      playerId: args.playerId,
      matched: true,
      manuallyLinked: true,
    });

    const importRecord = await ctx.db.get(result.importId);
    await touchPlayerEventParticipationOnInsert(
      ctx,
      args.playerId,
      result.eventName,
      importRecord?.eventDate,
    );
    
    // Update import counts if this was previously unmatched
    if (!wasMatched) {
      const importRecord = await ctx.db.get(result.importId);
      if (importRecord) {
        await ctx.db.patch(result.importId, {
          playersMatched: importRecord.playersMatched + 1,
          playersUnmatched: importRecord.playersUnmatched - 1,
        });
      }
    }
    
    // Get user for audit log
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "third_party_manual_link",
        entityType: "thirdPartyResult",
        entityId: args.resultId,
        details: JSON.stringify({
          resultEpicUsername: result.epicUsername,
          linkedToPlayer: player.epicUsername,
          linkedToPlayerId: args.playerId,
        }),
      });
    }
    
    return { success: true };
  },
});

// Link import to an event
export const linkImportToEvent = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    eventId: v.union(v.id("events"), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      throw new Error("Import not found");
    }
    
    // If eventId is provided, verify it exists
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (!event) {
        throw new Error("Event not found");
      }

      await appendLeaderboardUrlToEvent(
        ctx,
        args.eventId,
        importRecord.leaderboardUrl,
      );
    }
    
    const oldEventId = importRecord.eventId;
    
    // Update the import
    await ctx.db.patch(args.importId, {
      eventId: args.eventId || undefined,
    });
    
    // Also update all eventResults (for Yunite API imports)
    const eventResults = await ctx.db
      .query("eventResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    for (const result of eventResults) {
      await ctx.db.patch(result._id, {
        eventId: args.eventId || undefined,
      });
    }
    
    // Get user for audit log
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "third_party_link_event",
        entityType: "thirdPartyImport",
        entityId: args.importId,
        details: JSON.stringify({
          importName: importRecord.eventName,
          oldEventId: oldEventId || null,
          newEventId: args.eventId || null,
        }),
      });
    }

    if (oldEventId) {
      await refreshEventCache(ctx, oldEventId);
    }
    if (args.eventId) {
      await refreshEventCache(ctx, args.eventId);
    }
    
    return { success: true };
  },
});

// Replace CSV data for an existing import
export const replaceCSVData = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    entries: v.array(v.object({
      epicUsername: v.string(),
      discordUsername: v.optional(v.string()),
      discordId: v.optional(v.string()),
      placement: v.number(),
      points: v.number(),
      eliminations: v.optional(v.number()),
      wins: v.optional(v.number()),
      teamId: v.optional(v.string()),
      teamName: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    // Get the import record
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      throw new Error("Import not found");
    }
    
    // Delete all existing results for this import
    const existingResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();
    
    for (const result of existingResults) {
      await ctx.db.delete(result._id);
    }
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    const affectedPlayerIds = new Set<Id<"players">>();
    
    // Process each entry from the new CSV
    for (const entry of args.entries) {
      const matchedPlayerId = await findPlayerIdForImportEntry(ctx, {
        discordId: entry.discordId,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
      });
      
      if (matchedPlayerId) {
        playersMatched++;
        affectedPlayerIds.add(matchedPlayerId);
      } else {
        playersUnmatched++;
      }

      await ctx.db.insert("thirdPartyResults", {
        importId: args.importId,
        playerId: matchedPlayerId,
        eventName: importRecord.eventName,
        source: importRecord.source,
        leaderboardUrl: importRecord.leaderboardUrl,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
        discordId: entry.discordId,
        placement: entry.placement,
        points: entry.points,
        eliminations: entry.eliminations,
        wins: entry.wins,
        teamId: entry.teamId,
        teamName: entry.teamName,
        matched: !!matchedPlayerId,
      });
    }
    
    // Update import record with new counts
    await ctx.db.patch(args.importId, {
      playersMatched,
      playersUnmatched,
      totalPlayers: args.entries.length,
    });

    if (affectedPlayerIds.size > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
        { playerIds: [...affectedPlayerIds] },
      );
    }
    
    // Get user for audit log
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "third_party_csv_replaced",
        entityType: "thirdPartyImport",
        entityId: args.importId,
        details: JSON.stringify({
          eventName: importRecord.eventName,
          oldTotalPlayers: importRecord.totalPlayers,
          newTotalPlayers: args.entries.length,
          oldResultsDeleted: existingResults.length,
          matched: playersMatched,
          unmatched: playersUnmatched,
        }),
      });
    }
    
    return {
      success: true,
      eventName: importRecord.eventName,
      totalPlayers: args.entries.length,
      playersMatched,
      playersUnmatched,
    };
  },
});

// Helper mutations for Yunite sync
export const createImportRecord = mutation({
  args: {
    leaderboardUrl: v.string(),
    leaderboardId: v.string(),
    eventName: v.string(),
    eventDate: v.optional(v.string()),
    source: v.string(),
    importMethod: v.string(),
    totalPlayers: v.number(),
    importedBy: v.id("users"),
    importedByName: v.string(),
    isManualImport: v.optional(v.boolean()),
    matchDataSynced: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    // Extract tournament ID from this import for event matching
    const importTournamentId = extractTournamentIdFromUrl(args.leaderboardUrl) 
      || extractTournamentIdFromLeaderboardId(args.leaderboardId);
    
    // Auto-link: find a matching event that has this leaderboard URL
    let matchedEventId: Id<"events"> | undefined;
    if (importTournamentId) {
      const allEvents = await ctx.db.query("events").collect();
      for (const event of allEvents) {
        const eventUrls = collectEventLeaderboardUrls(event, {
          includeStandardLobby2: false,
        });
        for (const url of eventUrls) {
          const eventTournamentId = extractTournamentIdFromUrl(url);
          if (eventTournamentId && eventTournamentId === importTournamentId) {
            matchedEventId = event._id;
            break;
          }
        }
        if (matchedEventId) break;
      }
    }
    
    const importId = await ctx.db.insert("thirdPartyImports", {
      leaderboardUrl: args.leaderboardUrl,
      leaderboardId: args.leaderboardId,
      eventName: args.eventName,
      eventDate: args.eventDate,
      source: args.source,
      importMethod: args.importMethod,
      playersMatched: 0,
      playersUnmatched: 0,
      totalPlayers: args.totalPlayers,
      importedBy: args.importedBy,
      importedByName: args.importedByName,
      isManualImport: args.isManualImport,
      matchDataSynced: args.matchDataSynced,
      eventId: matchedEventId,
    });

    if (matchedEventId) {
      await appendLeaderboardUrlToEvent(ctx, matchedEventId, args.leaderboardUrl);
      await refreshEventCache(ctx, matchedEventId);
    }

    return importId;
  },
});

export const createResult = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    playerId: v.optional(v.id("players")),
    eventName: v.string(),
    source: v.string(),
    leaderboardUrl: v.string(),
    epicUsername: v.string(),
    epicId: v.optional(v.string()),
    discordUsername: v.optional(v.string()),
    discordId: v.optional(v.string()),
    placement: v.number(),
    points: v.number(),
    eliminations: v.optional(v.number()),
    teamKills: v.optional(v.number()),
    damage: v.optional(v.number()),
    deaths: v.optional(v.number()),
    knocks: v.optional(v.number()),
    teamId: v.optional(v.string()),
    teamName: v.optional(v.string()),
    matched: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const resultId = await ctx.db.insert("thirdPartyResults", {
      importId: args.importId,
      playerId: args.playerId,
      eventName: args.eventName,
      source: args.source,
      leaderboardUrl: args.leaderboardUrl,
      epicUsername: args.epicUsername,
      epicId: args.epicId,
      discordUsername: args.discordUsername,
      discordId: args.discordId,
      placement: args.placement,
      points: args.points,
      eliminations: args.eliminations,
      teamKills: args.teamKills,
      damage: args.damage,
      deaths: args.deaths,
      knocks: args.knocks,
      teamId: args.teamId,
      teamName: args.teamName,
      matched: args.matched,
    });

    if (args.playerId && args.matched) {
      await ctx.scheduler.runAfter(
        0,
        internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
        { playerIds: [args.playerId] },
      );
    }

    return resultId;
  },
});

export const updateImportMatchCounts = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    playersMatched: v.number(),
    playersUnmatched: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    await ctx.db.patch(args.importId, {
      playersMatched: args.playersMatched,
      playersUnmatched: args.playersUnmatched,
    });
  },
});

async function applyImportMatchDataSynced(
  ctx: MutationCtx,
  args: {
    importId: Id<"thirdPartyImports">;
    matchDataSynced: boolean;
    totalMatchKills?: number;
    killDiscrepancyTeamCount?: number;
  },
) {
  const updates: {
    matchDataSynced: boolean;
    matchDataSyncedAt?: number;
    totalMatchKills?: number;
    killDiscrepancyTeamCount?: number;
  } = {
    matchDataSynced: args.matchDataSynced,
  };

  if (args.matchDataSynced) {
    updates.matchDataSyncedAt = Date.now();
  }

  if (args.totalMatchKills !== undefined) {
    updates.totalMatchKills = args.totalMatchKills;
  }

  if (args.killDiscrepancyTeamCount !== undefined) {
    updates.killDiscrepancyTeamCount = args.killDiscrepancyTeamCount;
  }

  await ctx.db.patch(args.importId, updates);
  await refreshEventCacheForImport(ctx, args.importId);
}

export const updateImportMatchDataSyncedInternal = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
    matchDataSynced: v.boolean(),
    totalMatchKills: v.optional(v.number()),
    killDiscrepancyTeamCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await applyImportMatchDataSynced(ctx, args);
  },
});

export const updateImportMatchDataSynced = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    matchDataSynced: v.boolean(),
    totalMatchKills: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await applyImportMatchDataSynced(ctx, args);
  },
});

export const resetMatchDataSyncFlag = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    await ctx.db.patch(args.importId, {
      matchDataSynced: false,
      killDiscrepancyTeamCount: undefined,
    });
  },
});

// Backfill: add leaderboard URLs from all linked imports into their event's standardLeaderboards
export const backfillLeaderboardLinks = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    
    // Get all imports that are linked to an event and have a leaderboard URL
    const allImports = await ctx.db.query("thirdPartyImports").collect();
    const linkedImports = allImports.filter(
      (imp) => imp.eventId && imp.leaderboardUrl && !imp.leaderboardUrl.startsWith("CSV Import:")
    );
    
    let eventsUpdated = 0;
    let linksAdded = 0;
    
    // Group by event to batch updates
    const eventImports = new Map<string, string[]>();
    for (const imp of linkedImports) {
      const eventId = imp.eventId as string;
      if (!eventImports.has(eventId)) {
        eventImports.set(eventId, []);
      }
      eventImports.get(eventId)!.push(imp.leaderboardUrl);
    }
    
    for (const [eventId, importUrls] of eventImports) {
      const event = await ctx.db.get(eventId as Id<"events">);
      if (!event) continue;
      
      const existingUrls = event.standardLeaderboards ?? [];
      const newUrls = [...existingUrls];
      let added = false;
      
      for (const url of importUrls) {
        if (!newUrls.includes(url)) {
          newUrls.push(url);
          linksAdded++;
          added = true;
        }
      }
      
      if (added) {
        await ctx.db.patch(event._id, { standardLeaderboards: newUrls });
        eventsUpdated++;
      }
    }
    
    return { eventsUpdated, linksAdded, importsProcessed: linkedImports.length };
  },
});
