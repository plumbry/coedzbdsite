import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "../_generated/server";
import { requireAdmin, requireModeratorOrAdmin, getDisplayName } from "../auth_helpers";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx } from "../_generated/server";
import { appendLeaderboardUrlToEvent } from "../lib/eventLeaderboardLinks";
import {
  EVENT_YUNITE_REQUIRED_MESSAGE,
  eventMeetsYuniteMinimum,
  eventHasLeaderboardUrls,
  eventHasLinkedScrimSeries,
} from "../lib/eventYuniteRequirement";
import { applyLinkedScrimSeries } from "../lib/scrimSeriesEventLink";
import { collectEventLeaderboardUrls, extractTournamentIdFromUrl } from "../lib/yunite";

// Auto-link existing unlinked imports to an event based on matching leaderboard URLs
async function autoLinkImportsToEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
  leaderboardUrls: string[]
): Promise<number> {
  // Extract tournament IDs from the event's leaderboard URLs
  const eventTournamentIds = new Set<string>();
  for (const url of leaderboardUrls) {
    const tid = extractTournamentIdFromUrl(url);
    if (tid) eventTournamentIds.add(tid);
  }
  
  if (eventTournamentIds.size === 0) return 0;
  
  let linked = 0;
  
  // For each tournament ID, find matching unlinked imports
  for (const tournamentId of eventTournamentIds) {
    const leaderboardId = `yunite-${tournamentId}`;
    const matchingImport = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_leaderboard_id", (q) => q.eq("leaderboardId", leaderboardId))
      .first();
    
    if (matchingImport && !matchingImport.eventId) {
      await ctx.db.patch(matchingImport._id, { eventId });
      await appendLeaderboardUrlToEvent(
        ctx,
        eventId,
        matchingImport.leaderboardUrl,
      );
      linked++;
    }
  }
  
  return linked;
}

// Helper function to compute status based on dates
function computeEventStatus(startDate: string, endDate: string): "upcoming" | "ongoing" | "completed" {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (now < start) {
    return "upcoming";
  } else if (now > end) {
    return "completed";
  } else {
    return "ongoing";
  }
}

// Admin event list — linked import counts; image URLs resolved only when requested.
export const getAllEvents = query({
  args: {
    resolveImageUrls: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const resolveImageUrls = args.resolveImageUrls === true;
    const events = await ctx.db
      .query("events")
      .order("desc")
      .collect();

    const imports = await ctx.db.query("thirdPartyImports").collect();
    const linkedImportCountByEvent = new Map<Id<"events">, number>();
    for (const imp of imports) {
      if (imp.eventId) {
        linkedImportCountByEvent.set(
          imp.eventId,
          (linkedImportCountByEvent.get(imp.eventId) ?? 0) + 1,
        );
      }
    }

    const eventsWithDetails = await Promise.all(
      events.map(async (event) => {
        let imageUrl: string | null = null;
        if (resolveImageUrls && event.image) {
          imageUrl = await ctx.storage.getUrl(event.image);
        }

        const computedStatus = computeEventStatus(event.startDate, event.endDate);

        return {
          ...event,
          status: computedStatus,
          imageUrl,
          standardCount: event.standardLeaderboards?.length || 0,
          linkedImportCount: linkedImportCountByEvent.get(event._id) ?? 0,
          leaderboardUrlCount: collectEventLeaderboardUrls(event, {
            includeStandardLobby2: true,
          }).length,
        };
      }),
    );

    return eventsWithDetails;
  },
});

export const getEventForEdit = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    let imageUrl: string | null = null;
    if (event.image) {
      imageUrl = await ctx.storage.getUrl(event.image);
    }

    return {
      ...event,
      status: computeEventStatus(event.startDate, event.endDate),
      imageUrl,
      standardCount: event.standardLeaderboards?.length || 0,
    };
  },
});

export const getOperationsSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireModeratorOrAdmin(ctx);

    const events = await ctx.db.query("events").order("desc").take(100);
    const now = Date.now();
    const eventIds = new Set(events.map((event) => event._id));
    const recentImports = await ctx.db
      .query("thirdPartyImports")
      .order("desc")
      .take(400);

    const importsByEventId = new Map<
      Id<"events">,
      Array<(typeof recentImports)[number]>
    >();
    for (const importRecord of recentImports) {
      if (!importRecord.eventId || !eventIds.has(importRecord.eventId)) {
        continue;
      }
      const existing = importsByEventId.get(importRecord.eventId) ?? [];
      if (existing.length >= 20) continue;
      existing.push(importRecord);
      importsByEventId.set(importRecord.eventId, existing);
    }

    const eventDetails = events.map((event) => {
      const leaderboardCount = collectEventLeaderboardUrls(event).length;
      const linkedImports = importsByEventId.get(event._id) ?? [];
      const unmatchedPlayers = linkedImports.reduce(
        (total, importRecord) => total + importRecord.playersUnmatched,
        0,
      );
      const unsyncedYuniteImports = linkedImports.filter(
        (importRecord) =>
          (importRecord.source === "Yunite" ||
            importRecord.source === "Yunite API" ||
            importRecord.importMethod === "api") &&
          importRecord.matchDataSynced !== true,
      ).length;

      return {
        _id: event._id,
        name: event.name,
        type: event.type,
        mode: event.mode,
        status: computeEventStatus(event.startDate, event.endDate),
        startDate: event.startDate,
        endDate: event.endDate,
        needsSetup: event.needsSetup === true,
        leaderboardCount,
        linkedImportCount: linkedImports.length,
        unmatchedPlayers,
        unsyncedYuniteImports,
      };
    });

    return {
      totalEventsChecked: events.length,
      generatedAt: now,
      needsSetup: eventDetails.filter((event) => event.needsSetup).length,
      withLinkedImports: eventDetails.filter((event) => event.linkedImportCount > 0)
        .length,
      withUnmatchedImports: eventDetails.filter((event) => event.unmatchedPlayers > 0)
        .length,
      withUnsyncedYuniteData: eventDetails.filter(
        (event) => event.unsyncedYuniteImports > 0,
      ).length,
      recentEvents: eventDetails.slice(0, 8),
    };
  },
});

// Public events calendar — slim fields, no admin-only data
export const getPublicEvents = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").order("desc").collect();

    return events.map((event) => ({
      _id: event._id,
      name: event.name,
      type: event.type,
      mode: event.mode,
      startDate: event.startDate,
      endDate: event.endDate,
      description: event.description,
      season: event.season,
      status: computeEventStatus(event.startDate, event.endDate),
      hasImage: !!event.image,
      standardCount: event.standardLeaderboards?.length || 0,
    }));
  },
});

export const getEventImageUrl = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event?.image) {
      return null;
    }
    return await ctx.storage.getUrl(event.image);
  },
});

// Get events by status
export const getEventsByStatus = query({
  args: {
    status: v.union(v.literal("upcoming"), v.literal("ongoing"), v.literal("completed")),
  },
  handler: async (ctx, args) => {
    // Get all events and filter by computed status
    const allEvents = await ctx.db
      .query("events")
      .order("desc")
      .collect();
    
    // Filter by computed status
    const filteredEvents = allEvents.filter(event => {
      const computedStatus = computeEventStatus(event.startDate, event.endDate);
      return computedStatus === args.status;
    });
    
    return filteredEvents;
  },
});

// Get single event with leaderboard details
export const getEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      return null;
    }
    
    // Get image URL if exists
    let imageUrl = null;
    if (event.image) {
      imageUrl = await ctx.storage.getUrl(event.image);
    }
    
    // Compute status based on dates
    const computedStatus = computeEventStatus(event.startDate, event.endDate);

    const linkedImports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    let linkedScrimSeries: {
      _id: Id<"scrimSeries">;
      name: string;
      slug?: string;
      bestN: number;
      isActive: boolean;
    } | null = null;

    if (event.linkedScrimSeriesId) {
      const series = await ctx.db.get(event.linkedScrimSeriesId);
      if (series) {
        linkedScrimSeries = {
          _id: series._id,
          name: series.name,
          slug: series.slug,
          bestN: series.bestN,
          isActive: series.isActive,
        };
      }
    }
    
    return {
      ...event,
      status: computedStatus, // Override with computed status
      imageUrl,
      standardCount: event.standardLeaderboards?.length || 0,
      linkedImportCount: linkedImports.length,
      leaderboardUrlCount: collectEventLeaderboardUrls(event, {
        includeStandardLobby2: true,
      }).length,
      linkedScrimSeries,
    };
  },
});

// Create event (moderator or admin)
export const createEvent = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("scrim"), 
      v.literal("minicup"), 
      v.literal("season"), 
      v.literal("mini-season"),
      v.literal("random"), 
      v.literal("random-squads"), 
      v.literal("random-trios"),
      v.literal("solos-meets-duos"),
      v.literal("scrim-series"),
      v.literal("showdown")
    ),
    mode: v.union(v.literal("ZB Main Map"), v.literal("Reload")),
    startDate: v.string(),
    endDate: v.string(),
    description: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    season: v.optional(v.string()),
    placementEarningsTopN: v.optional(v.number()),
    matchWinEarnings: v.optional(v.boolean()),
    // Random Trios specific: separate earnings for duo and solo leaderboards
    duoPlacementEarningsTopN: v.optional(v.number()),
    soloPlacementEarningsTopN: v.optional(v.number()),
    standardLeaderboards: v.optional(v.array(v.string())),
    twoLobbies: v.optional(v.boolean()),
    standardLeaderboardsLobby2: v.optional(v.array(v.string())),
    qualifierLobby1Leaderboards: v.optional(v.array(v.string())),
    qualifierLobby2Leaderboards: v.optional(v.array(v.string())),
    finalsLeaderboards: v.optional(v.array(v.string())),
    dynamicPairDetection: v.optional(v.boolean()),
    excludeLowestScore: v.optional(v.boolean()),
    isNoMoneyEvent: v.optional(v.boolean()),
    seasonId: v.optional(v.string()),
    skipFirstNWeeksPoints: v.optional(v.number()),
    smdTeamSize: v.optional(v.union(v.literal("duo"), v.literal("trio"))),
    bestNGames: v.optional(v.number()),
    seriesDurationWeeks: v.optional(v.union(v.literal(3), v.literal(6))),
    showdownBestWeeks: v.optional(v.number()),
    penaltyAmount: v.optional(v.number()),
    linkedScrimSeriesId: v.optional(v.union(v.id("scrimSeries"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Compute status based on dates
    const computedStatus = computeEventStatus(args.startDate, args.endDate);

    const draftForYuniteCheck = {
      type: args.type,
      twoLobbies: args.twoLobbies,
      standardLeaderboards: args.standardLeaderboards,
      standardLeaderboardsLobby2: args.standardLeaderboardsLobby2,
      qualifierLobby1Leaderboards: args.qualifierLobby1Leaderboards,
      qualifierLobby2Leaderboards: args.qualifierLobby2Leaderboards,
      finalsLeaderboards: args.finalsLeaderboards,
      linkedScrimSeriesId:
        args.type === "scrim-series" ? args.linkedScrimSeriesId ?? undefined : undefined,
    };
    if (
      !eventHasLeaderboardUrls(draftForYuniteCheck) &&
      !eventHasLinkedScrimSeries(draftForYuniteCheck)
    ) {
      throw new Error(EVENT_YUNITE_REQUIRED_MESSAGE);
    }

    const eventId = await ctx.db.insert("events", {
      name: args.name,
      type: args.type,
      mode: args.mode,
      startDate: args.startDate,
      endDate: args.endDate,
      description: args.description,
      image: args.image,
      status: computedStatus,
      season: args.season,
      placementEarningsTopN: args.placementEarningsTopN,
      matchWinEarnings: args.matchWinEarnings,
      duoPlacementEarningsTopN: (args.type === "random-trios" || args.type === "solos-meets-duos") ? args.duoPlacementEarningsTopN : undefined,
      soloPlacementEarningsTopN: args.type === "random-trios" ? args.soloPlacementEarningsTopN : undefined,
      standardLeaderboards: args.standardLeaderboards,
      twoLobbies: args.twoLobbies,
      standardLeaderboardsLobby2: args.standardLeaderboardsLobby2,
      qualifierLobby1Leaderboards: args.qualifierLobby1Leaderboards,
      qualifierLobby2Leaderboards: args.qualifierLobby2Leaderboards,
      finalsLeaderboards: args.finalsLeaderboards,
      dynamicPairDetection: args.dynamicPairDetection,
      excludeLowestScore: args.excludeLowestScore,
      isNoMoneyEvent: args.isNoMoneyEvent,
      seasonId: args.seasonId,
      skipFirstNWeeksPoints: args.skipFirstNWeeksPoints,
      smdTeamSize: args.type === "solos-meets-duos" ? (args.smdTeamSize ?? "duo") : undefined,
      bestNGames: args.type === "scrim-series" ? args.bestNGames : undefined,
      seriesDurationWeeks: args.type === "scrim-series" ? args.seriesDurationWeeks : undefined,
      showdownBestWeeks: args.type === "showdown" ? args.showdownBestWeeks : undefined,
      penaltyAmount: args.type === "showdown" ? args.penaltyAmount : undefined,
      createdBy: user._id,
    });
    
    // Log to audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: getDisplayName(user),
      action: "event_created",
      entityType: "event",
      entityId: eventId,
      details: JSON.stringify({
        name: args.name,
        type: args.type,
        mode: args.mode,
        status: computedStatus,
      }),
    });
    
    // Schedule earnings calculation if earnings tracking is enabled
    if (args.placementEarningsTopN || args.matchWinEarnings || args.duoPlacementEarningsTopN || args.soloPlacementEarningsTopN) {
      await ctx.scheduler.runAfter(0, internal.playerEarnings.calculateEventEarnings, {
        eventId: eventId,
      });
    }
    
    // Auto-link existing imports that match the event's leaderboard URLs
    const newEvent = await ctx.db.get(eventId);
    if (newEvent) {
      const allUrls = collectEventLeaderboardUrls(newEvent);
      if (allUrls.length > 0) {
        await autoLinkImportsToEvent(ctx, eventId, allUrls);
      }
    }
    
    // Auto-lock (snapshot) tiers for Showdown events at creation time
    if (args.type === "showdown") {
      const players = await ctx.db.query("players").collect();
      for (const player of players) {
        if (player.tier) {
          await ctx.db.insert("showdownTierSnapshots", {
            eventId,
            playerId: player._id,
            tier: player.tier,
          });
        }
      }
    }

    if (args.type === "scrim-series" && args.linkedScrimSeriesId) {
      await applyLinkedScrimSeries(ctx, eventId, args.linkedScrimSeriesId);
    }
    
    return eventId;
  },
});

// Update event (moderator or admin)
export const updateEvent = mutation({
  args: {
    eventId: v.id("events"),
    name: v.optional(v.string()),
    type: v.optional(v.union(
      v.literal("scrim"), 
      v.literal("minicup"), 
      v.literal("season"), 
      v.literal("mini-season"),
      v.literal("random"), 
      v.literal("random-squads"), 
      v.literal("random-trios"),
      v.literal("solos-meets-duos"),
      v.literal("scrim-series"),
      v.literal("showdown")
    )),
    mode: v.optional(v.union(v.literal("ZB Main Map"), v.literal("Reload"))),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    season: v.optional(v.string()),
    placementEarningsTopN: v.optional(v.number()),
    matchWinEarnings: v.optional(v.boolean()),
    // Random Trios specific: separate earnings for duo and solo leaderboards
    duoPlacementEarningsTopN: v.optional(v.number()),
    soloPlacementEarningsTopN: v.optional(v.number()),
    standardLeaderboards: v.optional(v.array(v.string())),
    twoLobbies: v.optional(v.boolean()),
    standardLeaderboardsLobby2: v.optional(v.array(v.string())),
    qualifierLobby1Leaderboards: v.optional(v.array(v.string())),
    qualifierLobby2Leaderboards: v.optional(v.array(v.string())),
    finalsLeaderboards: v.optional(v.array(v.string())),
    dynamicPairDetection: v.optional(v.boolean()),
    excludeLowestScore: v.optional(v.boolean()),
    isNoMoneyEvent: v.optional(v.boolean()),
    seasonId: v.optional(v.string()),
    skipFirstNWeeksPoints: v.optional(v.number()),
    smdTeamSize: v.optional(v.union(v.literal("duo"), v.literal("trio"))),
    bestNGames: v.optional(v.number()),
    seriesDurationWeeks: v.optional(v.union(v.literal(3), v.literal(6))),
    showdownBestWeeks: v.optional(v.number()),
    penaltyAmount: v.optional(v.number()),
    linkedScrimSeriesId: v.optional(v.union(v.id("scrimSeries"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }
    
    const updates: Record<string, unknown> = {};
    const effectiveTypeEarly = args.type ?? event.type;
    
    if (args.name !== undefined) updates.name = args.name;
    if (args.type !== undefined) updates.type = args.type;
    if (args.mode !== undefined) updates.mode = args.mode;
    if (args.startDate !== undefined) updates.startDate = args.startDate;
    if (args.endDate !== undefined) updates.endDate = args.endDate;
    if (args.description !== undefined) updates.description = args.description;
    if (args.image !== undefined) updates.image = args.image;
    if (args.season !== undefined) updates.season = args.season;
    if (args.placementEarningsTopN !== undefined) updates.placementEarningsTopN = args.placementEarningsTopN;
    if (args.matchWinEarnings !== undefined) updates.matchWinEarnings = args.matchWinEarnings;
    
    // Handle Random Trios and Solos Meets Duos specific earnings
    const effectiveType = args.type ?? event.type;
    if (effectiveType === "random-trios" || effectiveType === "solos-meets-duos") {
      if (args.duoPlacementEarningsTopN !== undefined) updates.duoPlacementEarningsTopN = args.duoPlacementEarningsTopN;
      if (effectiveType === "random-trios" && args.soloPlacementEarningsTopN !== undefined) updates.soloPlacementEarningsTopN = args.soloPlacementEarningsTopN;
    } else {
      // Clear these fields if type is changed away from random-trios/solos-meets-duos
      if (args.type !== undefined) {
        updates.duoPlacementEarningsTopN = undefined;
        updates.soloPlacementEarningsTopN = undefined;
      }
    }

    // Handle smdTeamSize
    if (effectiveType === "solos-meets-duos") {
      if (args.smdTeamSize !== undefined) updates.smdTeamSize = args.smdTeamSize;
    } else if (args.type !== undefined) {
      updates.smdTeamSize = undefined;
    }

    // Handle scrim-series / showdown scoring config
    if (effectiveType === "scrim-series") {
      if (args.bestNGames !== undefined) updates.bestNGames = args.bestNGames;
      if (args.seriesDurationWeeks !== undefined) {
        updates.seriesDurationWeeks = args.seriesDurationWeeks;
      }
      updates.showdownBestWeeks = undefined;
      updates.penaltyAmount = undefined;
    } else if (effectiveType === "showdown") {
      if (args.showdownBestWeeks !== undefined) {
        updates.showdownBestWeeks = args.showdownBestWeeks;
      }
      if (args.penaltyAmount !== undefined) updates.penaltyAmount = args.penaltyAmount;
      updates.bestNGames = undefined;
      updates.seriesDurationWeeks = undefined;
    } else if (args.type !== undefined) {
      updates.bestNGames = undefined;
      updates.seriesDurationWeeks = undefined;
      updates.showdownBestWeeks = undefined;
      updates.penaltyAmount = undefined;
    }

    if (args.type !== undefined && effectiveTypeEarly !== "scrim-series") {
      updates.linkedScrimSeriesId = undefined;
    }
    
    // Recompute status if dates have changed
    if (args.startDate !== undefined || args.endDate !== undefined) {
      const startDate = args.startDate ?? event.startDate;
      const endDate = args.endDate ?? event.endDate;
      updates.status = computeEventStatus(startDate, endDate);
    }
    if (args.standardLeaderboards !== undefined) {
      updates.standardLeaderboards = args.standardLeaderboards.length > 0 ? args.standardLeaderboards : undefined;
    }
    if (args.twoLobbies !== undefined) updates.twoLobbies = args.twoLobbies;
    if (args.standardLeaderboardsLobby2 !== undefined) {
      updates.standardLeaderboardsLobby2 = args.standardLeaderboardsLobby2.length > 0 ? args.standardLeaderboardsLobby2 : undefined;
    }
    if (args.qualifierLobby1Leaderboards !== undefined) {
      updates.qualifierLobby1Leaderboards = args.qualifierLobby1Leaderboards.length > 0 ? args.qualifierLobby1Leaderboards : undefined;
    }
    if (args.qualifierLobby2Leaderboards !== undefined) {
      updates.qualifierLobby2Leaderboards = args.qualifierLobby2Leaderboards.length > 0 ? args.qualifierLobby2Leaderboards : undefined;
    }
    if (args.finalsLeaderboards !== undefined) {
      updates.finalsLeaderboards = args.finalsLeaderboards.length > 0 ? args.finalsLeaderboards : undefined;
    }
    if (args.dynamicPairDetection !== undefined) updates.dynamicPairDetection = args.dynamicPairDetection;
    if (args.excludeLowestScore !== undefined) updates.excludeLowestScore = args.excludeLowestScore;
    if (args.isNoMoneyEvent !== undefined) updates.isNoMoneyEvent = args.isNoMoneyEvent;
    if (args.seasonId !== undefined) updates.seasonId = args.seasonId;
    if (args.skipFirstNWeeksPoints !== undefined) updates.skipFirstNWeeksPoints = args.skipFirstNWeeksPoints;
    
    // Clear needsSetup flag when admin edits a Discord-imported event
    if (event.needsSetup) {
      updates.needsSetup = false;
    }

    const effectiveTypeForYunite = args.type ?? event.type;
    const effectiveLinkedScrimSeriesId =
      args.linkedScrimSeriesId !== undefined
        ? args.linkedScrimSeriesId === null
          ? undefined
          : args.linkedScrimSeriesId
        : event.linkedScrimSeriesId;
    const mergedForYuniteCheck = {
      type: effectiveTypeForYunite,
      twoLobbies:
        args.twoLobbies !== undefined ? args.twoLobbies : event.twoLobbies,
      standardLeaderboards:
        args.standardLeaderboards !== undefined
          ? args.standardLeaderboards
          : event.standardLeaderboards,
      standardLeaderboardsLobby2:
        args.standardLeaderboardsLobby2 !== undefined
          ? args.standardLeaderboardsLobby2
          : event.standardLeaderboardsLobby2,
      qualifierLobby1Leaderboards:
        args.qualifierLobby1Leaderboards !== undefined
          ? args.qualifierLobby1Leaderboards
          : event.qualifierLobby1Leaderboards,
      qualifierLobby2Leaderboards:
        args.qualifierLobby2Leaderboards !== undefined
          ? args.qualifierLobby2Leaderboards
          : event.qualifierLobby2Leaderboards,
      finalsLeaderboards:
        args.finalsLeaderboards !== undefined
          ? args.finalsLeaderboards
          : event.finalsLeaderboards,
      linkedScrimSeriesId:
        effectiveTypeForYunite === "scrim-series"
          ? effectiveLinkedScrimSeriesId
          : undefined,
    };
    if (
      !(await eventMeetsYuniteMinimum(ctx, mergedForYuniteCheck, args.eventId))
    ) {
      throw new Error(EVENT_YUNITE_REQUIRED_MESSAGE);
    }

    await ctx.db.patch(args.eventId, updates);

    if (args.linkedScrimSeriesId !== undefined) {
      const seriesId =
        args.linkedScrimSeriesId === null ? undefined : args.linkedScrimSeriesId;
      const linkType = args.type ?? event.type;
      if (linkType === "scrim-series") {
        await applyLinkedScrimSeries(ctx, args.eventId, seriesId);
      }
    } else if (args.type !== undefined && effectiveTypeEarly !== "scrim-series") {
      await applyLinkedScrimSeries(ctx, args.eventId, undefined);
    }
    
    // Log to audit
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "event_updated",
        entityType: "event",
        entityId: args.eventId,
        details: JSON.stringify({
          ...updates,
          linkedScrimSeriesId: args.linkedScrimSeriesId,
        }),
      });
    }
    
    // Schedule earnings calculation if earnings tracking was added or changed
    if (args.placementEarningsTopN !== undefined || args.matchWinEarnings !== undefined || 
        args.duoPlacementEarningsTopN !== undefined || args.soloPlacementEarningsTopN !== undefined) {
      await ctx.scheduler.runAfter(0, internal.playerEarnings.calculateEventEarnings, {
        eventId: args.eventId,
      });
    }
    
    // Auto-link existing imports if leaderboard URLs were updated
    const leaderboardsChanged = args.standardLeaderboards !== undefined ||
      args.standardLeaderboardsLobby2 !== undefined ||
      args.qualifierLobby1Leaderboards !== undefined ||
      args.qualifierLobby2Leaderboards !== undefined ||
      args.finalsLeaderboards !== undefined;
    
    if (leaderboardsChanged) {
      const updatedEvent = await ctx.db.get(args.eventId);
      if (updatedEvent) {
        const allUrls = collectEventLeaderboardUrls(updatedEvent);
        if (allUrls.length > 0) {
          await autoLinkImportsToEvent(ctx, args.eventId, allUrls);
        }
      }
    }
    
    return { success: true };
  },
});

// Delete event (admin only)
export const deleteEvent = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }
    
    await ctx.db.delete(args.eventId);
    
    // Log to audit
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (user) {
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "event_deleted",
        entityType: "event",
        entityId: args.eventId,
        details: JSON.stringify({
          name: event.name,
          type: event.type,
        }),
      });
    }
    
    return { success: true };
  },
});

// Generate upload URL for event image (moderator or admin)
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireModeratorOrAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
