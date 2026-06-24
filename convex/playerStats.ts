import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import type { QueryCtx } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { fetchThirdPartyResultsForPlayer } from "./helpers/playerResults";
import { isYuniteImport } from "./lib/importSource";
import { buildZbdPerformanceStats } from "./lib/stats/zbdPerformanceStats";
import {
  getPlayerDisplayStatsEligibility,
} from "./lib/stats/playerStatsCacheEligibility";

async function partitionThirdPartyResultsByImport(
  ctx: QueryCtx,
  results: Doc<"thirdPartyResults">[],
) {
  const yuniteResults: Doc<"thirdPartyResults">[] = [];
  const csvResults: Doc<"thirdPartyResults">[] = [];
  const importIsYunite = new Map<string, boolean>();

  for (const result of results) {
    const importKey = result.importId as string;
    let isYunite = importIsYunite.get(importKey);
    if (isYunite === undefined) {
      const importRecord = await ctx.db.get(result.importId);
      isYunite = importRecord ? isYuniteImport(importRecord) : false;
      importIsYunite.set(importKey, isYunite);
    }
    if (isYunite) {
      yuniteResults.push(result);
    } else {
      csvResults.push(result);
    }
  }

  return { yuniteResults, csvResults };
}

async function fetchPlayerResultRows(ctx: QueryCtx, playerId: Id<"players">) {
  const eventResults = await ctx.db
    .query("eventResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();

  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);

  return { eventResults, thirdPartyResults };
}

function computeComprehensiveStats(
  eventResults: Doc<"eventResults">[],
  thirdPartyResults: Doc<"thirdPartyResults">[],
) {
  const allResults = [
    ...eventResults.map((e) => ({
      placement: e.placement,
      eliminations: e.eliminations,
      eventScore: e.eventScore,
      kdRatio: e.kdRatio,
      eventName: e.eventName,
    })),
    ...thirdPartyResults.map((e) => ({
      placement: e.placement,
      eliminations: e.eliminations || 0,
      eventScore: e.points,
      kdRatio: undefined,
      eventName: e.eventName,
    })),
  ];

  const uniqueEventNames = new Set([
    ...eventResults.map((e) => e.eventName),
    ...thirdPartyResults.map((e) => e.eventName),
  ]);

  const totalEvents = uniqueEventNames.size;
  const totalEliminations = allResults.reduce((sum, e) => sum + e.eliminations, 0);
  const totalScore = allResults.reduce((sum, e) => sum + e.eventScore, 0);
  const totalWins = thirdPartyResults.reduce((sum, e) => sum + (e.wins || 0), 0);
  const placements = allResults.map((e) => e.placement);

  const averagePlacement =
    placements.length > 0
      ? placements.reduce((sum, p) => sum + p, 0) / placements.length
      : 0;
  const averageScore = allResults.length > 0 ? totalScore / allResults.length : 0;
  const totalMatches = thirdPartyResults.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
  const averageKD = totalMatches > 0 ? totalEliminations / totalMatches : 0;
  const winRate = totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0;
  const top3Finishes = allResults.filter((e) => e.placement <= 3).length;

  return {
    totalGames: totalEvents,
    totalEliminations,
    averageScore: Math.round(averageScore * 10) / 10,
    averagePlacement: Math.round(averagePlacement * 10) / 10,
    averageKD: Math.round(averageKD * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    winCount: totalWins,
    top3Finishes,
    manualEventsCount: eventResults.length,
    thirdPartyEventsCount: thirdPartyResults.length,
    thirdPartyGamesCount: thirdPartyResults.length,
  };
}

async function formatPlayerAllEvents(
  ctx: QueryCtx,
  playerId: Id<"players">,
  eventResults: Doc<"eventResults">[],
  thirdPartyResults: Doc<"thirdPartyResults">[],
) {
  const formattedEventResults = await Promise.all(
    eventResults.map(async (event) => {
      let isNoMoneyEvent = false;
      let mode: string | null = null;
      if (event.eventId) {
        const linkedEvent = await ctx.db.get(event.eventId);
        isNoMoneyEvent = linkedEvent?.isNoMoneyEvent ?? false;
        mode = linkedEvent?.mode ?? null;
      }

      return {
        _id: event._id,
        _creationTime: event._creationTime,
        eventName: event.eventName,
        eventDate: event.eventDate,
        placement: event.placement,
        eliminations: event.eliminations,
        kdRatio: event.kdRatio,
        eventScore: event.eventScore,
        source: "manual" as const,
        yuniteLeaderboardUrl: event.yuniteLeaderboardUrl,
        teammateName: undefined,
        isNoMoneyEvent,
        mode,
      };
    }),
  );

  const player = await ctx.db.get(playerId);
  const importIds = new Set(thirdPartyResults.map((e) => e.importId));
  type ImportInfo = {
    eventId?: string;
    eventDate?: string;
    leaderboardId?: string;
    isYunite: boolean;
    totalKillDiscrepancy?: number;
  };
  type EventInfo = {
    name?: string;
    type?: string;
    mode?: string;
    excludeLowestScore?: boolean;
    isNoMoneyEvent?: boolean;
    startDate?: string;
  };
  const importCache = new Map<string, ImportInfo | null>();
  const eventCache = new Map<string, EventInfo | null>();

  for (const importId of importIds) {
    const importData = await ctx.db.get(importId);
    const info: ImportInfo | null = importData
      ? {
          eventId: importData.eventId as string | undefined,
          eventDate: importData.eventDate as string | undefined,
          leaderboardId: importData.leaderboardId as string | undefined,
          isYunite: isYuniteImport(importData),
          totalKillDiscrepancy: importData.totalKillDiscrepancy,
        }
      : null;
    importCache.set(importId as string, info);
    if (info?.eventId && !eventCache.has(info.eventId)) {
      const linkedEvent = await ctx.db.get(importData!.eventId!);
      const evInfo: EventInfo | null = linkedEvent
        ? {
            name: linkedEvent.name as string | undefined,
            type: linkedEvent.type as string | undefined,
            mode: linkedEvent.mode as string | undefined,
            excludeLowestScore: linkedEvent.excludeLowestScore as boolean | undefined,
            isNoMoneyEvent: linkedEvent.isNoMoneyEvent as boolean | undefined,
            startDate: linkedEvent.startDate as string | undefined,
          }
        : null;
      eventCache.set(info.eventId, evInfo);
    }
  }

  const playerLookupCache = new Map<
    string,
    { nickname?: string; discordUsername: string; epicUsername: string }
  >();

  if (player) {
    const teammateEpics = new Set<string>();
    for (const event of thirdPartyResults) {
      for (const teammateEpic of event.teamMembers ?? []) {
        if (teammateEpic !== player.epicUsername) {
          teammateEpics.add(teammateEpic);
        }
      }
    }
    for (const teammateEpic of teammateEpics) {
      const teammate = await ctx.db
        .query("players")
        .withIndex("by_epic_username", (q) => q.eq("epicUsername", teammateEpic))
        .first();
      if (teammate) {
        playerLookupCache.set(teammateEpic, {
          nickname: teammate.nickname,
          discordUsername: teammate.discordUsername,
          epicUsername: teammate.epicUsername,
        });
      }
    }
  }

  const formattedThirdPartyResults = await Promise.all(
    thirdPartyResults.map(async (event) => {
      const importData = importCache.get(event.importId as string);

      let groupEventName: string | undefined;
      let eventType: string | null = null;
      let mode: string | null = null;
      let excludeLowestScore: boolean | undefined;
      let isNoMoneyEvent = false;
      let linkedEventStartDate: string | undefined;
      if (importData?.eventId) {
        const linkedEvent = eventCache.get(importData.eventId);
        if (linkedEvent) {
          groupEventName = linkedEvent.name;
          eventType = linkedEvent.type || null;
          mode = linkedEvent.mode ?? null;
          excludeLowestScore = linkedEvent.excludeLowestScore;
          isNoMoneyEvent = linkedEvent.isNoMoneyEvent ?? false;
          linkedEventStartDate = linkedEvent.startDate;
        }
      }

      let leaderboardUrl = event.leaderboardUrl;
      if (importData?.leaderboardId) {
        const uuid = importData.leaderboardId.replace(/^yunite-/, "");
        leaderboardUrl = `https://yunite.xyz/leaderboard/${uuid}`;
      }

      const teammateNames: string[] = [];
      if (event.teamMembers && player) {
        for (const teammateEpic of event.teamMembers) {
          if (teammateEpic === player.epicUsername) continue;

          const cached = playerLookupCache.get(teammateEpic);
          teammateNames.push(
            cached
              ? cached.nickname || cached.discordUsername || cached.epicUsername
              : teammateEpic,
          );
        }
      }

      const isYunite = importData?.isYunite ?? false;

      return {
        _id: event._id,
        _creationTime: event._creationTime,
        eventName: event.eventName,
        groupEventName,
        eventId: importData?.eventId,
        eventDate: linkedEventStartDate || importData?.eventDate || undefined,
        placement: event.placement,
        cumulativePlacement: null as number | null,
        eliminations: event.eliminations || 0,
        kdRatio: undefined,
        eventScore: event.points,
        source: isYunite ? ("yunite" as const) : ("csv" as const),
        leaderboardUrl,
        yuniteLeaderboardUrl: undefined,
        teammateName: teammateNames.length > 0 ? teammateNames.join(", ") : undefined,
        eventType,
        mode,
        excludeLowestScore,
        isNoMoneyEvent,
        hasKillDiscrepancy: (importData?.totalKillDiscrepancy ?? 0) > 0,
      };
    }),
  );

  return [...formattedEventResults, ...formattedThirdPartyResults].sort((a, b) => {
    const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
    const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
    return dateB - dateA;
  });
}

async function computePlayerKillDiscrepancySummary(
  ctx: QueryCtx,
  yuniteResults: Doc<"thirdPartyResults">[],
) {
  const importIds = new Set(yuniteResults.map((result) => result.importId as string));
  let affectedImportCount = 0;
  let totalKillDiscrepancy = 0;
  for (const importId of importIds) {
    const importRecord = await ctx.db.get(importId as Id<"thirdPartyImports">);
    const discrepancy = importRecord?.totalKillDiscrepancy ?? 0;
    if (discrepancy > 0) {
      affectedImportCount += 1;
      totalKillDiscrepancy += discrepancy;
    }
  }

  return {
    affectedImportCount,
    totalKillDiscrepancy,
    hasKillDiscrepancies: affectedImportCount > 0,
  };
}

/** ZBD performance: manual event results + Yunite imports (not third-party CSV). */
async function fetchZbdPerformanceRows(ctx: QueryCtx, playerId: Id<"players">) {
  const { eventResults, thirdPartyResults } = await fetchPlayerResultRows(
    ctx,
    playerId,
  );
  const { yuniteResults } = await partitionThirdPartyResultsByImport(
    ctx,
    thirdPartyResults,
  );
  return { eventResults, yuniteResults };
}

export const getPlayerComprehensiveStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const { eventResults, yuniteResults } = await fetchZbdPerformanceRows(
      ctx,
      args.playerId,
    );
    return computeComprehensiveStats(eventResults, yuniteResults);
  },
});

export const comprehensiveStatsForPlayerInternal = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const { eventResults, yuniteResults } = await fetchZbdPerformanceRows(
      ctx,
      args.playerId,
    );
    return computeComprehensiveStats(eventResults, yuniteResults);
  },
});

export const getPlayerZBDPerformanceBundle = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const eligibility = await getPlayerDisplayStatsEligibility(ctx, args.playerId);
    const { eventResults, yuniteResults } = await fetchZbdPerformanceRows(
      ctx,
      args.playerId,
    );
    const events = await formatPlayerAllEvents(
      ctx,
      args.playerId,
      eventResults,
      yuniteResults,
    );
    const killDiscrepancySummary = await computePlayerKillDiscrepancySummary(
      ctx,
      yuniteResults,
    );

    const { stats, statsByMode } = await buildZbdPerformanceStats(
      ctx,
      args.playerId,
      eventResults,
      yuniteResults,
    );

    return {
      stats: {
        ...stats,
        totalRecordedEvents: stats.eventsPlayed,
      },
      statsByMode: {
        br: statsByMode.br,
        reload: statsByMode.reload,
      },
      eligibility,
      events,
      killDiscrepancySummary,
    };
  },
});

// Get player stats by Epic username (for unmatched players)
export const getPlayerStatsByEpic = query({
  args: { epicUsername: v.string() },
  handler: async (ctx, args) => {
    // Get third party results by Epic username
    const results = await ctx.db
      .query("thirdPartyResults")
      .filter((q) => q.eq(q.field("epicUsername"), args.epicUsername))
      .collect();
    
    if (results.length === 0) {
      return {
        totalEvents: 0,
        totalEliminations: 0,
        totalPoints: 0,
        averagePlacement: 0,
        winRate: 0,
        winCount: 0,
      };
    }
    
    const totalEliminations = results.reduce((sum, e) => sum + (e.eliminations || 0), 0);
    const totalPoints = results.reduce((sum, e) => sum + e.points, 0);
    const totalWins = results.reduce((sum, e) => sum + (e.wins || 0), 0);
    const averagePlacement = results.reduce((sum, e) => sum + e.placement, 0) / results.length;
    const winRate = (totalWins / results.length) * 100;
    
    return {
      totalEvents: results.length,
      totalEliminations,
      totalPoints,
      averagePlacement: Math.round(averagePlacement * 10) / 10,
      winRate: Math.round(winRate * 10) / 10,
      winCount: totalWins,
    };
  },
});

/** All ZBD event records (manual + Yunite imports) for a player. */
export const getPlayerAllEvents = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const { eventResults, yuniteResults } = await fetchZbdPerformanceRows(
      ctx,
      args.playerId,
    );
    return formatPlayerAllEvents(ctx, args.playerId, eventResults, yuniteResults);
  },
});

// Get duo performance analysis for a player
// Compares performance with consistent duo partner vs without
export const getPlayerDuoPerformance = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const eligibility = await getPlayerDisplayStatsEligibility(ctx, args.playerId);
    if (!eligibility.statsEligible) {
      return null;
    }

    // Get the player details
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      return null;
    }

    // Check if player has DCA cache with consistent duo
    if (!player.dcaCache || !player.dcaCache.consistentDuoEpic) {
      return null;
    }

    const consistentDuoEpic = player.dcaCache.consistentDuoEpic;

    // Get the duo partner's player record
    const duoPlayer = await ctx.db
      .query("players")
      .withIndex("by_epic_username", (q) => q.eq("epicUsername", consistentDuoEpic))
      .first();

    // Get all match data for this player from matchPlayerStats
    const playerMatches = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    if (playerMatches.length === 0) {
      return null;
    }

    // Pre-build set of (import, session, team) keys where duo partner played on same team
    const duoMatchKeys = new Set<string>();
    if (duoPlayer) {
      const duoMatches = await ctx.db
        .query("matchPlayerStats")
        .withIndex("by_player", (q) => q.eq("playerId", duoPlayer._id))
        .collect();
      for (const dm of duoMatches) {
        duoMatchKeys.add(`${dm.importId}|${dm.sessionId}|${dm.teamId ?? ""}`);
      }
    }

    // Split matches into "with duo" and "without duo"
    const withDuoMatches: typeof playerMatches = [];
    const withoutDuoMatches: typeof playerMatches = [];

    for (const match of playerMatches) {
      const teamKey = match.teamId ?? "";
      const duoInMatchKey = `${match.importId}|${match.sessionId}|${teamKey}`;
      if (duoMatchKeys.has(duoInMatchKey)) {
        withDuoMatches.push(match);
      } else {
        withoutDuoMatches.push(match);
      }
    }

    // Count unique events (by importId) with duo
    const uniqueEventsWithDuo = new Set(withDuoMatches.map(m => m.importId)).size;

    // Helper function to calculate stats for a group of matches
    const calculateGroupStats = (matches: typeof playerMatches) => {
      if (matches.length === 0) {
        return null;
      }

      const kills = matches.map(m => m.eliminations);
      const deaths = matches.map(m => m.deaths);
      const placements = matches.map(m => m.placement);

      const totalKills = kills.reduce((sum, k) => sum + k, 0);
      const totalDeaths = deaths.reduce((sum, d) => sum + d, 0);
      const avgKD = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
      const avgElims = totalKills / kills.length;
      const avgPlacement = placements.reduce((sum, p) => sum + p, 0) / placements.length;

      return {
        avgKD,
        avgElims,
        avgPlacement,
        eventCount: matches.length,
      };
    };

    const withDuoStats = calculateGroupStats(withDuoMatches);
    const withoutDuoStats = calculateGroupStats(withoutDuoMatches);

    // Calculate drop ratios and performance ratio
    let kdDropRatio = 1.0;
    let elimsDropRatio = 1.0;
    let placementDropRatio = 1.0;

    if (withDuoStats && withoutDuoStats) {
      // Lower ratio = worse performance without duo
      kdDropRatio = withoutDuoStats.avgKD / withDuoStats.avgKD;
      elimsDropRatio = withoutDuoStats.avgElims / withDuoStats.avgElims;
      // For placement, lower is better, so invert the ratio
      placementDropRatio = withDuoStats.avgPlacement / withoutDuoStats.avgPlacement;
    }

    const performanceRatio = (kdDropRatio + elimsDropRatio + placementDropRatio) / 3;

    // Use DCA from cache (already calculated and stored)
    const dca = player.dcaCache.dca;
    
    // Determine confidence based on number of matches without duo
    let dcaConfidence: "high" | "medium" | "low" | null = null;
    const withoutDuoCount = withoutDuoMatches.length;
    
    if (withoutDuoCount >= 3) {
      dcaConfidence = "high";
    } else if (withoutDuoCount === 2) {
      dcaConfidence = "medium";
    } else if (withoutDuoCount === 1) {
      dcaConfidence = "low";
    }

    return {
      playerId: args.playerId,
      consistentDuo: {
        epicUsername: consistentDuoEpic,
        playerId: duoPlayer?._id || null,
        eventsWithDuo: uniqueEventsWithDuo,
      },
      withDuo: withDuoStats ? {
        avgKD: Math.round(withDuoStats.avgKD * 100) / 100,
        avgElims: Math.round(withDuoStats.avgElims * 10) / 10,
        avgPlacement: Math.round(withDuoStats.avgPlacement * 10) / 10,
        eventCount: withDuoStats.eventCount,
      } : null,
      withoutDuo: withoutDuoStats ? {
        avgKD: Math.round(withoutDuoStats.avgKD * 100) / 100,
        avgElims: Math.round(withoutDuoStats.avgElims * 10) / 10,
        avgPlacement: Math.round(withoutDuoStats.avgPlacement * 10) / 10,
        eventCount: withoutDuoStats.eventCount,
        filteredCount: withoutDuoMatches.length,
      } : null,
      dropRatios: {
        kd: Math.round(kdDropRatio * 100) / 100,
        elims: Math.round(elimsDropRatio * 100) / 100,
        placement: Math.round(placementDropRatio * 100) / 100,
      },
      performanceRatio: Math.round(performanceRatio * 100) / 100,
      dca: Math.round(dca * 1000) / 1000,
      dcaConfidence: dcaConfidence,
      totalMatches: playerMatches.length,
    };
  },
});

async function computePlayerMatchStats(ctx: QueryCtx, playerId: Id<"players">) {
  const matchStats = await ctx.db
    .query("matchPlayerStats")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();

  if (matchStats.length === 0) {
    return null;
  }

  const totalMatches = matchStats.length;
  const totalDeaths = matchStats.reduce((sum, m) => sum + m.deaths, 0);
  const totalEliminations = matchStats.reduce((sum, m) => sum + m.eliminations, 0);
  const totalPlacements = matchStats.reduce((sum, m) => sum + m.placement, 0);

  return {
    totalMatches,
    deathsPerMatch: Math.round((totalDeaths / totalMatches) * 100) / 100,
    eliminationsPerMatch: Math.round((totalEliminations / totalMatches) * 100) / 100,
    avgPlacement: Math.round((totalPlacements / totalMatches) * 10) / 10,
  };
}

/** Internal match-stats helper — no role gate (rebuild pipeline). */
export const getPlayerMatchStatsInternal = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => computePlayerMatchStats(ctx, args.playerId),
});

export const getPlayerMatchStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const eligibility = await getPlayerDisplayStatsEligibility(ctx, args.playerId);
    if (!eligibility.statsEligible) {
      return null;
    }
    return computePlayerMatchStats(ctx, args.playerId);
  },
});
