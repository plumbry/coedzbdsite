import { v } from "convex/values";
import { query } from "./_generated/server";

// Get comprehensive player stats from both eventResults and thirdPartyResults
// Note: We read from both tables to get complete player history
// - Yunite API auto-sync creates eventResults only
// - Manual admin imports create thirdPartyResults only
// - No duplication occurs because each source writes to only one table
export const getPlayerComprehensiveStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Get all event results from both tables
    const eventResults = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    const thirdPartyResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    // Combine all results
    const allResults = [
      ...eventResults.map(e => ({
        placement: e.placement,
        eliminations: e.eliminations,
        eventScore: e.eventScore,
        kdRatio: e.kdRatio,
        eventName: e.eventName,
      })),
      ...thirdPartyResults.map(e => ({
        placement: e.placement,
        eliminations: e.eliminations || 0,
        eventScore: e.points,
        kdRatio: undefined,
        eventName: e.eventName,
      })),
    ];
    
    // Count unique event names across both sources
    const uniqueEventNames = new Set([
      ...eventResults.map(e => e.eventName),
      ...thirdPartyResults.map(e => e.eventName),
    ]);
    
    const totalEvents = uniqueEventNames.size;
    const totalEliminations = allResults.reduce((sum, e) => sum + e.eliminations, 0);
    const totalScore = allResults.reduce((sum, e) => sum + e.eventScore, 0);
    
    // Count match-level wins (individual game wins) instead of tournament placements
    const totalWins = thirdPartyResults.reduce((sum, e) => sum + (e.wins || 0), 0);
    
    const placements = allResults.map(e => e.placement);
    
    // Calculate averages
    const averagePlacement = placements.length > 0 
      ? placements.reduce((sum, p) => sum + p, 0) / placements.length 
      : 0;
    
    const averageScore = allResults.length > 0 ? totalScore / allResults.length : 0;
    
    // Calculate average kills per match: total eliminations / total matches played
    const totalMatches = thirdPartyResults.reduce((sum, e) => sum + (e.matchesPlayed || 0), 0);
    const averageKD = totalMatches > 0 ? totalEliminations / totalMatches : 0;
    
    // Calculate win rate as: (match wins / total matches played) * 100
    const winRate = totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0;
    
    // Calculate top 3 finishes (placement <= 3 in any event)
    const top3Finishes = allResults.filter(e => e.placement <= 3).length;
    
    return {
      totalGames: totalEvents,
      totalEliminations,
      averageScore: Math.round(averageScore * 10) / 10,
      averagePlacement: Math.round(averagePlacement * 10) / 10,
      averageKD: Math.round(averageKD * 100) / 100,
      winRate: Math.round(winRate * 10) / 10,
      winCount: totalWins,
      top3Finishes,
      // Individual sources
      manualEventsCount: eventResults.length,
      thirdPartyEventsCount: thirdPartyResults.length,
      thirdPartyGamesCount: thirdPartyResults.length,
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

// Get all event participations for a player from both tables
// Note: We read from both tables to show complete player history
// - Yunite API auto-sync creates eventResults only
// - Manual admin imports create thirdPartyResults only
// - No duplication occurs because each source writes to only one table
export const getPlayerAllEvents = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Get all events from eventResults table
    const eventResults = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    // Get all events from thirdPartyResults table
    const thirdPartyResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    // Format events from eventResults
    const formattedEventResults = await Promise.all(
      eventResults.map(async (event) => {
        // Fetch linked Event to get isNoMoneyEvent flag
        let isNoMoneyEvent = false;
        if (event.eventId) {
          const linkedEvent = await ctx.db.get(event.eventId);
          isNoMoneyEvent = linkedEvent?.isNoMoneyEvent ?? false;
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
          teammateName: undefined, // Manual events don't have teammate tracking
          isNoMoneyEvent: isNoMoneyEvent,
        };
      })
    );
    
    const player = await ctx.db.get(args.playerId);
    
    // Pre-fetch all import data in one pass to avoid repeated lookups
    const importIds = new Set(thirdPartyResults.map(e => e.importId));
    type ImportInfo = { eventId?: string; eventDate?: string; leaderboardId?: string };
    type EventInfo = { name?: string; type?: string; excludeLowestScore?: boolean; isNoMoneyEvent?: boolean; startDate?: string };
    const importCache = new Map<string, ImportInfo | null>();
    const eventCache = new Map<string, EventInfo | null>();
    
    for (const importId of importIds) {
      const importData = await ctx.db.get(importId);
      const info: ImportInfo | null = importData ? {
        eventId: importData.eventId as string | undefined,
        eventDate: importData.eventDate as string | undefined,
        leaderboardId: importData.leaderboardId as string | undefined,
      } : null;
      importCache.set(importId as string, info);
      if (info?.eventId && !eventCache.has(info.eventId)) {
        const linkedEvent = await ctx.db.get(importData!.eventId!);
        const evInfo: EventInfo | null = linkedEvent ? {
          name: linkedEvent.name as string | undefined,
          type: linkedEvent.type as string | undefined,
          excludeLowestScore: linkedEvent.excludeLowestScore as boolean | undefined,
          isNoMoneyEvent: linkedEvent.isNoMoneyEvent as boolean | undefined,
          startDate: linkedEvent.startDate as string | undefined,
        } : null;
        eventCache.set(info.eventId, evInfo);
      }
    }
    
    // Build a player lookup cache for teammate resolution
    const playerLookupCache = new Map<string, { nickname?: string; discordUsername: string; epicUsername: string }>();
    
    // Format events from thirdPartyResults using cached data
    const formattedThirdPartyResults = await Promise.all(
      thirdPartyResults.map(async (event) => {
        const importData = importCache.get(event.importId as string);
        
        // Use cached event data
        let groupEventName: string | undefined;
        let eventType: string | null = null;
        let excludeLowestScore: boolean | undefined;
        let isNoMoneyEvent = false;
        let linkedEventStartDate: string | undefined;
        if (importData?.eventId) {
          const linkedEvent = eventCache.get(importData.eventId);
          if (linkedEvent) {
            groupEventName = linkedEvent.name;
            eventType = linkedEvent.type || null;
            excludeLowestScore = linkedEvent.excludeLowestScore;
            isNoMoneyEvent = linkedEvent.isNoMoneyEvent ?? false;
            linkedEventStartDate = linkedEvent.startDate;
          }
        }
        
        // Construct proper Yunite leaderboard URL from leaderboardId
        let leaderboardUrl = event.leaderboardUrl;
        if (importData?.leaderboardId) {
          const uuid = importData.leaderboardId.replace(/^yunite-/, "");
          leaderboardUrl = `https://yunite.xyz/leaderboard/${uuid}`;
        }
        
        // Get teammate names from teamMembers array (lightweight - use cache)
        let teammateNames: string[] = [];
        
        if (event.teamMembers && player) {
          for (const teammateEpic of event.teamMembers) {
            if (teammateEpic === player.epicUsername) continue;
            
            // Check cache first
            if (playerLookupCache.has(teammateEpic)) {
              const cached = playerLookupCache.get(teammateEpic)!;
              teammateNames.push(cached.nickname || cached.discordUsername || cached.epicUsername);
            } else {
              const teammate = await ctx.db
                .query("players")
                .withIndex("by_epic_username", (q) => q.eq("epicUsername", teammateEpic))
                .first();
              
              if (teammate) {
                playerLookupCache.set(teammateEpic, { nickname: teammate.nickname, discordUsername: teammate.discordUsername, epicUsername: teammate.epicUsername });
                teammateNames.push(teammate.nickname || teammate.discordUsername || teammate.epicUsername);
              } else {
                teammateNames.push(teammateEpic);
              }
            }
          }
        }
        
        return {
          _id: event._id,
          _creationTime: event._creationTime,
          eventName: event.eventName,
          groupEventName: groupEventName,
          eventId: importData?.eventId,
          eventDate: linkedEventStartDate || importData?.eventDate || undefined,
          placement: event.placement,
          cumulativePlacement: null as number | null, // Computed separately to avoid heavy leaderboard lookups
          eliminations: event.eliminations || 0,
          kdRatio: undefined,
          eventScore: event.points,
          source: "thirdParty" as const,
          leaderboardUrl: leaderboardUrl,
          yuniteLeaderboardUrl: undefined,
          teammateName: teammateNames.length > 0 ? teammateNames.join(", ") : undefined,
          eventType: eventType,
          excludeLowestScore: excludeLowestScore,
          isNoMoneyEvent: isNoMoneyEvent,
        };
      })
    );
    
    // Combine and sort by event date (most recent first)
    const allEvents = [...formattedEventResults, ...formattedThirdPartyResults].sort((a, b) => {
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
      return dateB - dateA;
    });
    
    return allEvents;
  },
});

// Get duo performance analysis for a player
// Compares performance with consistent duo partner vs without
export const getPlayerDuoPerformance = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
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

    // Split matches into "with duo" and "without duo"
    const withDuoMatches: typeof playerMatches = [];
    const withoutDuoMatches: typeof playerMatches = [];

    for (const match of playerMatches) {
      // Check if consistent duo was on the team in this match
      const duoInMatch = await ctx.db
        .query("matchPlayerStats")
        .withIndex("by_match", (q) =>
          q.eq("importId", match.importId).eq("sessionId", match.sessionId)
        )
        .filter((q) => 
          q.and(
            q.eq(q.field("playerId"), duoPlayer?._id),
            q.eq(q.field("teamId"), match.teamId)
          )
        )
        .first();

      if (duoInMatch) {
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

// Get player match-level statistics
export const getPlayerMatchStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Get all match stats for this player
    const matchStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    if (matchStats.length === 0) {
      return null;
    }

    // Calculate aggregate stats
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
  },
});
