import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { requireAdmin } from "./auth_helpers";
import {
  extractTournamentIdFromLeaderboardId,
  extractTournamentIdFromUrl,
} from "./lib/yunite";
import { fetchThirdPartyResultsForPlayer } from "./helpers/playerResults";
import { isYuniteImport } from "./lib/importSource";
import { buildImportActionItems } from "./lib/eventWorkflow";

export const getPlayerThirdPartyResults = query({
  args: { 
    playerId: v.id("players"),
    linkedToEvent: v.optional(v.union(v.literal("linked"), v.literal("unlinked"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const results = await fetchThirdPartyResultsForPlayer(ctx, args.playerId);
    
    // Filter based on whether the import is linked to an event and add event info
    const filteredResults = await Promise.all(
      results.map(async (result) => {
        const importRecord = await ctx.db.get(result.importId);
        if (!importRecord || isYuniteImport(importRecord)) {
          return null;
        }
        const isLinked = importRecord.eventId !== undefined;
        
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

export const getImportOperationsSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const imports = await ctx.db
      .query("thirdPartyImports")
      .order("desc")
      .take(100);

    const importsWithUnmatchedPlayers = imports.filter(
      (importRecord) => importRecord.playersUnmatched > 0,
    );
    const unsyncedYuniteImports = imports.filter(
      (importRecord) =>
        (importRecord.source === "Yunite" ||
          importRecord.source === "Yunite API" ||
          importRecord.importMethod === "api") &&
        importRecord.matchDataSynced !== true,
    );
    const importsWithKillDiscrepancies = imports.filter(
      (importRecord) => (importRecord.killDiscrepancyTeamCount ?? 0) > 0,
    );
    const unlinkedImports = imports.filter((importRecord) => !importRecord.eventId);

    const needsReviewImports = imports.filter(
      (importRecord) =>
        importRecord.playersUnmatched > 0 ||
        !importRecord.eventId ||
        ((importRecord.source === "Yunite" ||
          importRecord.source === "Yunite API" ||
          importRecord.importMethod === "api") &&
          importRecord.matchDataSynced !== true) ||
        (importRecord.killDiscrepancyTeamCount ?? 0) > 0,
    );

    const actionItems = needsReviewImports
      .flatMap((importRecord) => buildImportActionItems(importRecord))
      .slice(0, 20);

    return {
      totalImportsChecked: imports.length,
      importsWithUnmatchedPlayers: importsWithUnmatchedPlayers.length,
      unmatchedPlayers: importsWithUnmatchedPlayers.reduce(
        (total, importRecord) => total + importRecord.playersUnmatched,
        0,
      ),
      unsyncedYuniteImports: unsyncedYuniteImports.length,
      importsWithKillDiscrepancies: importsWithKillDiscrepancies.length,
      unlinkedImports: unlinkedImports.length,
      recentNeedsReview: needsReviewImports.slice(0, 8).map((importRecord) => ({
        _id: importRecord._id,
        eventName: importRecord.eventName,
        eventDate: importRecord.eventDate,
        source: importRecord.source,
        leaderboardUrl: importRecord.leaderboardUrl,
        playersUnmatched: importRecord.playersUnmatched,
        totalPlayers: importRecord.totalPlayers,
        eventId: importRecord.eventId,
        matchDataSynced: importRecord.matchDataSynced,
      })),
      actionItems,
    };
  },
});

export const findPotentialDuplicateImports = query({
  args: {
    eventName: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    leaderboardUrl: v.optional(v.string()),
    leaderboardId: v.optional(v.string()),
    tournamentIds: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const normalizedEventName = args.eventName?.trim().toLowerCase();
    const normalizedEventDate = args.eventDate?.trim();
    const normalizedSource = args.source?.trim().toLowerCase();
    const tournamentIds = new Set(
      (args.tournamentIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    );

    if (args.leaderboardUrl) {
      const urlTournamentId = extractTournamentIdFromUrl(args.leaderboardUrl);
      if (urlTournamentId) tournamentIds.add(urlTournamentId);
    }
    if (args.leaderboardId) {
      const leaderboardTournamentId = extractTournamentIdFromLeaderboardId(
        args.leaderboardId,
      );
      if (leaderboardTournamentId) tournamentIds.add(leaderboardTournamentId);
    }

    if (
      !normalizedEventName &&
      !normalizedEventDate &&
      !args.leaderboardUrl &&
      !args.leaderboardId &&
      tournamentIds.size === 0
    ) {
      return [];
    }

    const indexedMatches =
      args.leaderboardId && args.leaderboardId.trim().length > 0
        ? await ctx.db
            .query("thirdPartyImports")
            .withIndex("by_leaderboard_id", (q) =>
              q.eq("leaderboardId", args.leaderboardId!.trim()),
            )
            .take(10)
        : [];

    const recentImports = await ctx.db
      .query("thirdPartyImports")
      .order("desc")
      .take(200);

    const seenIds = new Set(indexedMatches.map((importRecord) => importRecord._id));
    const candidates = [
      ...indexedMatches,
      ...recentImports.filter((importRecord) => !seenIds.has(importRecord._id)),
    ];

    return candidates
      .map((importRecord) => {
        const reasons: string[] = [];
        const importTournamentId =
          extractTournamentIdFromUrl(importRecord.leaderboardUrl) ||
          extractTournamentIdFromLeaderboardId(importRecord.leaderboardId);

        if (importTournamentId && tournamentIds.has(importTournamentId)) {
          reasons.push("Same Yunite tournament");
        }
        if (
          normalizedEventName &&
          importRecord.eventName.trim().toLowerCase() === normalizedEventName
        ) {
          reasons.push("Same event name");
        }
        if (
          normalizedEventDate &&
          importRecord.eventDate &&
          importRecord.eventDate.trim() === normalizedEventDate
        ) {
          reasons.push("Same event date");
        }
        if (
          reasons.length > 0 &&
          normalizedSource &&
          importRecord.source.trim().toLowerCase() === normalizedSource
        ) {
          reasons.push("Same source");
        }

        return reasons.length > 0
          ? {
              _id: importRecord._id,
              eventName: importRecord.eventName,
              eventDate: importRecord.eventDate,
              source: importRecord.source,
              leaderboardUrl: importRecord.leaderboardUrl,
              leaderboardId: importRecord.leaderboardId,
              totalPlayers: importRecord.totalPlayers,
              playersMatched: importRecord.playersMatched,
              playersUnmatched: importRecord.playersUnmatched,
              eventId: importRecord.eventId,
              createdAt: importRecord._creationTime,
              reasons,
            }
          : null;
      })
      .filter((match) => match !== null)
      .slice(0, 8);
  },
});
