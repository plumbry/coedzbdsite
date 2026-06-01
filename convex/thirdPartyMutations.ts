import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, getDisplayName } from "./auth_helpers";
import { touchPlayerEventParticipationOnInsert } from "./helpers/playerEventStats";
import type { Id } from "./_generated/dataModel.d.ts";
import {
  collectEventLeaderboardUrls,
  extractTournamentIdFromLeaderboardId,
  extractTournamentIdFromUrl,
} from "./lib/yunite";
import { matchPlayerForImport } from "./lib/playerIdentity";
import type { Doc } from "./_generated/dataModel.d.ts";

function findPlayerForImportEntry(
  players: Doc<"players">[],
  entry: {
    discordId?: string | null;
    epicId?: string | null;
    epicUsername?: string | null;
    discordUsername?: string | null;
  },
) {
  return matchPlayerForImport(players, entry).player;
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
    
    // Get all active players for matching (including those without status field)
    const allPlayersList = await ctx.db.query("players").collect();
    const allPlayers = allPlayersList.filter(
      p => p.status === "active" || p.status === undefined
    );
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    
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
    
    // Process each entry
    for (const entry of args.entries) {
      const matchedPlayer = findPlayerForImportEntry(allPlayers, {
        discordId: entry.discordId,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
      });

      if (matchedPlayer) {
        playersMatched++;
      } else {
        playersUnmatched++;
      }

      // Save the result
      if (matchedPlayer?._id) {
        await touchPlayerEventParticipationOnInsert(
          ctx,
          matchedPlayer._id,
          args.eventName,
          undefined,
        );
      }

      await ctx.db.insert("thirdPartyResults", {
        importId,
        playerId: matchedPlayer?._id,
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
        matched: !!matchedPlayer,
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
      userName: args.importedByName,
      action: "third_party_import",
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
    
    // Get all active players for matching (including those without status field)
    const allPlayersList = await ctx.db.query("players").collect();
    const allPlayers = allPlayersList.filter(
      p => p.status === "active" || p.status === undefined
    );
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    
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
      const matchedPlayer = findPlayerForImportEntry(allPlayers, {
        discordId: entry.discordId,
        epicUsername: entry.epicUsername,
        discordUsername: entry.discordUsername,
      });

      if (matchedPlayer) {
        playersMatched++;
      } else {
        playersUnmatched++;
      }

      // Save the result
      if (matchedPlayer?._id) {
        await touchPlayerEventParticipationOnInsert(
          ctx,
          matchedPlayer._id,
          args.eventName,
          args.eventDate,
        );
      }

      await ctx.db.insert("thirdPartyResults", {
        importId,
        playerId: matchedPlayer?._id,
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
        matched: !!matchedPlayer,
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
    
    // Get all results for this import
    const results = await ctx.db
      .query("thirdPartyResults")
      .filter((q) => q.eq(q.field("importId"), args.importId))
      .collect();
    
    // Get all active players for matching (including those without status field)
    const allPlayersList = await ctx.db.query("players").collect();
    const allPlayers = allPlayersList.filter(
      p => p.status === "active" || p.status === undefined
    );
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    let newMatches = 0;
    
    // Re-match each result
    for (const result of results) {
      const matchedPlayer = findPlayerForImportEntry(allPlayers, {
        discordId: result.discordId,
        epicId: result.epicId,
        epicUsername: result.epicUsername,
        discordUsername: result.discordUsername,
      });

      const wasMatched = result.matched;
      const isNowMatched = !!matchedPlayer;
      
      if (isNowMatched) {
        playersMatched++;
        if (!wasMatched) {
          newMatches++;
        }
      } else {
        playersUnmatched++;
      }
      
      // Update the result if match status changed
      if (wasMatched !== isNowMatched || result.playerId !== matchedPlayer?._id) {
        await ctx.db.patch(result._id, {
          playerId: matchedPlayer?._id,
          matched: isNowMatched,
        });
      }
    }
    
    // Update import record with new match counts
    await ctx.db.patch(args.importId, {
      playersMatched,
      playersUnmatched,
    });
    
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
    
    for (const importRecord of allImports) {
      // Get all results for this import
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", importRecord._id))
        .collect();
      
      // Get all active players (including those without status field)
      const allPlayersList = await ctx.db.query("players").collect();
      const allPlayers = allPlayersList.filter(
        p => p.status === "active" || p.status === undefined
      );
      
      let playersMatched = 0;
      let playersUnmatched = 0;
      let newMatches = 0;
      
      // Re-match each result
      for (const result of results) {
        const wasMatched = result.matched;

        const matchedPlayer = findPlayerForImportEntry(allPlayers, {
          discordId: result.discordId,
          epicId: result.epicId,
          epicUsername: result.epicUsername,
          discordUsername: result.discordUsername,
        });

        // Update the result
        if (matchedPlayer) {
          playersMatched++;
          if (!wasMatched) {
            newMatches++;
          }
          await ctx.db.patch(result._id, {
            playerId: matchedPlayer._id,
            matched: true,
          });
        } else {
          playersUnmatched++;
          await ctx.db.patch(result._id, {
            playerId: undefined,
            matched: false,
          });
        }
      }
      
      // Update import stats
      await ctx.db.patch(importRecord._id, {
        playersMatched,
        playersUnmatched,
      });
      
      if (newMatches > 0) {
        totalRematchedImports++;
        totalNewMatches += newMatches;
      }
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
    
    // Get all active players for matching (including those without status field)
    const allPlayersList = await ctx.db.query("players").collect();
    const allPlayers = allPlayersList.filter(
      p => p.status === "active" || p.status === undefined
    );
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    
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
      // Try to match player by Discord ID or Epic ID
      let matchedPlayer = null;
      
      // First try Discord ID match
      if (entry.discordId) {
        const cleanDiscordId = entry.discordId.trim().replace(/['"]/g, '');
        matchedPlayer = allPlayers.find(
          p => p.discordUserId && p.discordUserId.trim() === cleanDiscordId
        );
      }
      
      // If no match, try Epic ID (case-insensitive)
      if (!matchedPlayer && entry.epicId) {
        matchedPlayer = allPlayers.find(
          p => p.epicUsername.toLowerCase() === entry.epicId.toLowerCase()
        );
      }
      
      if (matchedPlayer) {
        playersMatched++;
      } else {
        playersUnmatched++;
      }
      
      // Save the result
      if (matchedPlayer?._id) {
        await touchPlayerEventParticipationOnInsert(
          ctx,
          matchedPlayer._id,
          args.eventName,
          args.eventDate,
        );
      }

      await ctx.db.insert("thirdPartyResults", {
        importId,
        playerId: matchedPlayer?._id,
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
        matched: !!matchedPlayer,
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
      
      // Auto-fill leaderboard URL into event's standardLeaderboards if not already present
      if (importRecord.leaderboardUrl) {
        const existingUrls = event.standardLeaderboards ?? [];
        const urlAlreadyPresent = existingUrls.some(
          (url) => url === importRecord.leaderboardUrl
        );
        if (!urlAlreadyPresent) {
          await ctx.db.patch(args.eventId, {
            standardLeaderboards: [...existingUrls, importRecord.leaderboardUrl],
          });
        }
      }
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
    
    // Get all active players for matching
    const allPlayersList = await ctx.db.query("players").collect();
    const allPlayers = allPlayersList.filter(
      p => p.status === "active" || p.status === undefined
    );
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    
    // Process each entry from the new CSV
    for (const entry of args.entries) {
      // Try to match player
      let matchedPlayer = null;
      
      // First try Epic username match (case-insensitive)
      matchedPlayer = allPlayers.find(
        p => p.epicUsername.toLowerCase() === entry.epicUsername.toLowerCase()
      );
      
      // If no match, try Discord username
      if (!matchedPlayer && entry.discordUsername) {
        matchedPlayer = allPlayers.find(
          p => p.discordUsername.toLowerCase() === entry.discordUsername!.toLowerCase()
        );
      }
      
      // If no match, try Discord ID
      if (!matchedPlayer && entry.discordId) {
        const cleanDiscordId = entry.discordId.trim().replace(/['"]/g, '');
        matchedPlayer = allPlayers.find(
          p => p.discordUserId && p.discordUserId.trim() === cleanDiscordId
        );
      }
      
      if (matchedPlayer) {
        playersMatched++;
      } else {
        playersUnmatched++;
      }
      
      // Insert new result
      if (matchedPlayer?._id) {
        await touchPlayerEventParticipationOnInsert(
          ctx,
          matchedPlayer._id,
          importRecord.eventName,
          importRecord.eventDate,
        );
      }

      await ctx.db.insert("thirdPartyResults", {
        importId: args.importId,
        playerId: matchedPlayer?._id,
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
        matched: !!matchedPlayer,
      });
    }
    
    // Update import record with new counts
    await ctx.db.patch(args.importId, {
      playersMatched,
      playersUnmatched,
      totalPlayers: args.entries.length,
    });
    
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
    
    return await ctx.db.insert("thirdPartyImports", {
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

    const importRecord = await ctx.db.get(args.importId);
    if (args.playerId) {
      await touchPlayerEventParticipationOnInsert(
        ctx,
        args.playerId,
        args.eventName,
        importRecord?.eventDate,
      );
    }

    return await ctx.db.insert("thirdPartyResults", {
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

export const updateImportMatchDataSynced = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    matchDataSynced: v.boolean(),
    totalMatchKills: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const updates: {
      matchDataSynced: boolean;
      totalMatchKills?: number;
    } = {
      matchDataSynced: args.matchDataSynced,
    };
    
    if (args.totalMatchKills !== undefined) {
      updates.totalMatchKills = args.totalMatchKills;
    }
    
    await ctx.db.patch(args.importId, updates);
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
