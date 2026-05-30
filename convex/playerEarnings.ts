import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";

// Calculate and store earnings for an event
export const calculateEventEarnings = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<{ success: boolean; earningsCount: number }> => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      console.log("Event not found:", args.eventId);
      return { success: false, earningsCount: 0 };
    }

    // Only process events with earnings tracking enabled
    if (!event.placementEarningsTopN && !event.matchWinEarnings && 
        !event.duoPlacementEarningsTopN && !event.soloPlacementEarningsTopN) {
      console.log("Event has no earnings tracking:", event.name);
      return { success: false, earningsCount: 0 };
    }

    // Clear existing earnings for this event
    const existingEarnings = await ctx.db
      .query("playerEarnings")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    
    for (const earning of existingEarnings) {
      await ctx.db.delete(earning._id);
    }

    let earningsCount = 0;
    
    const isScrimOrMinicup = event.type === "scrim" || event.type === "minicup";
    const isCumulativeEvent = event.type === "season" || event.type === "mini-season" || 
                              event.type === "random" || event.type === "random-squads" || 
                              event.type === "random-trios" || event.type === "scrim-series" ||
                              event.type === "showdown";

    // Process placement earnings (Top N teams)
    if (event.placementEarningsTopN) {
      const maxPlacement = event.placementEarningsTopN;
      
      if (isScrimOrMinicup) {
        // For scrim/minicup: use direct placement from thirdPartyResults
        const imports = await ctx.db
          .query("thirdPartyImports")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .collect();

        for (const imp of imports) {
          const results = await ctx.db
            .query("thirdPartyResults")
            .withIndex("by_import", (q) => q.eq("importId", imp._id))
            .collect();

          // Filter for top N teams
          const earningResults = results.filter(
            (r) => r.playerId && r.placement <= maxPlacement
          );

          // Group by team
          const teamMap = new Map<string, typeof results>();
          for (const result of earningResults) {
            const teamKey = result.teamId || 
              `${result.placement}-${result.teamMembers?.sort().join("-") || ""}`;
            if (!teamMap.has(teamKey)) {
              teamMap.set(teamKey, []);
            }
            teamMap.get(teamKey)!.push(result);
          }

          // Create earnings records
          for (const [, teamMembers] of teamMap) {
            for (const result of teamMembers) {
              if (result.playerId) {
                await ctx.db.insert("playerEarnings", {
                  playerId: result.playerId,
                  eventId: args.eventId,
                  importId: imp._id,
                  eventName: event.name,
                  eventDate: imp.eventDate || event.startDate,
                  earningType: "placement",
                  placement: result.placement,
                  topN: maxPlacement,
                  teammates: result.teamMembers,
                });
                earningsCount++;
              }
            }
          }
        }
      } else if (isCumulativeEvent) {
        // For random-trios events: award to top N duos and top N solos (using separate settings)
        if (event.type === "random-trios") {
          // Use separate duo/solo earnings settings, fall back to general placementEarningsTopN
          const duoTopN = event.duoPlacementEarningsTopN || event.placementEarningsTopN || 3;
          const soloTopN = event.soloPlacementEarningsTopN || event.placementEarningsTopN || 3;
          
          const imports = await ctx.db
            .query("thirdPartyImports")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .collect();

          // Build duo leaderboard
          const duoPairs = new Map<string, {
            player1: { epicUsername: string; playerId: string | null; discordUsername: string | null };
            player2: { epicUsername: string; playerId: string | null; discordUsername: string | null };
            totalPoints: number;
          }>();

          // Build solo leaderboard
          const soloStats = new Map<string, {
            epicUsername: string;
            playerId: string | null;
            discordUsername: string | null;
            totalPoints: number;
          }>();

          for (const imp of imports) {
            const results = await ctx.db
              .query("thirdPartyResults")
              .withIndex("by_import", (q) => q.eq("importId", imp._id))
              .collect();

            const gamesMap = new Map<string, typeof results>();
            for (const result of results) {
              const gameKey = result.teamId || `game_${result.placement}_${result.epicUsername}`;
              if (!gamesMap.has(gameKey)) {
                gamesMap.set(gameKey, []);
              }
              gamesMap.get(gameKey)!.push(result);
            }

            // Process each game
            for (const [, gameResults] of gamesMap.entries()) {
              const duo1Members = gameResults.filter(r => r.duoAssignment === "duo1");
              const soloMembers = gameResults.filter(r => !r.duoAssignment || r.duoAssignment === null);

              // Process Duo #1
              if (duo1Members.length === 2) {
                const sorted = [...duo1Members].sort((a, b) => a.epicUsername.localeCompare(b.epicUsername));
                const pairKey = `${sorted[0].epicUsername}|${sorted[1].epicUsername}`;

                if (!duoPairs.has(pairKey)) {
                  duoPairs.set(pairKey, {
                    player1: {
                      epicUsername: sorted[0].epicUsername,
                      playerId: sorted[0].playerId || null,
                      discordUsername: sorted[0].discordUsername || null,
                    },
                    player2: {
                      epicUsername: sorted[1].epicUsername,
                      playerId: sorted[1].playerId || null,
                      discordUsername: sorted[1].discordUsername || null,
                    },
                    totalPoints: 0,
                  });
                }
                duoPairs.get(pairKey)!.totalPoints += sorted[0].points;
              }

              // Process solos
              for (const solo of soloMembers) {
                if (!soloStats.has(solo.epicUsername)) {
                  soloStats.set(solo.epicUsername, {
                    epicUsername: solo.epicUsername,
                    playerId: solo.playerId || null,
                    discordUsername: solo.discordUsername || null,
                    totalPoints: 0,
                  });
                }
                soloStats.get(solo.epicUsername)!.totalPoints += solo.points;
              }
            }
          }

          // Sort duos and award earnings to top N (using duoTopN)
          const sortedDuos = Array.from(duoPairs.values())
            .filter(duo => duo.totalPoints > 0)
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .slice(0, duoTopN);

          for (let i = 0; i < sortedDuos.length; i++) {
            const duo = sortedDuos[i];
            const placement = i + 1;

            // Award to both players in the duo
            if (duo.player1.playerId) {
              await ctx.db.insert("playerEarnings", {
                playerId: duo.player1.playerId as Id<"players">,
                eventId: args.eventId,
                eventName: event.name,
                eventDate: event.startDate,
                earningType: "placement",
                placement: placement,
                topN: duoTopN,
                teammates: [
                  duo.player1.discordUsername || duo.player1.epicUsername,
                  duo.player2.discordUsername || duo.player2.epicUsername,
                ].filter(Boolean),
              });
              earningsCount++;
            }
            if (duo.player2.playerId) {
              await ctx.db.insert("playerEarnings", {
                playerId: duo.player2.playerId as Id<"players">,
                eventId: args.eventId,
                eventName: event.name,
                eventDate: event.startDate,
                earningType: "placement",
                placement: placement,
                topN: duoTopN,
                teammates: [
                  duo.player1.discordUsername || duo.player1.epicUsername,
                  duo.player2.discordUsername || duo.player2.epicUsername,
                ].filter(Boolean),
              });
              earningsCount++;
            }
          }

          // Sort solos and award earnings to top N (using soloTopN)
          const sortedSolos = Array.from(soloStats.values())
            .filter(solo => solo.totalPoints > 0)
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .slice(0, soloTopN);

          for (let i = 0; i < sortedSolos.length; i++) {
            const solo = sortedSolos[i];
            const placement = i + 1;

            if (solo.playerId) {
              await ctx.db.insert("playerEarnings", {
                playerId: solo.playerId as Id<"players">,
                eventId: args.eventId,
                eventName: event.name,
                eventDate: event.startDate,
                earningType: "placement",
                placement: placement,
                topN: soloTopN,
                teammates: [solo.discordUsername || solo.epicUsername].filter(Boolean),
              });
              earningsCount++;
            }
          }
        } else {
          // For other cumulative events (season, mini-season, random, random-squads): 
          // use cumulative leaderboard placement (sum of all points across all weeks/games)
          const imports = await ctx.db
            .query("thirdPartyImports")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .collect();

          // Build cumulative team stats (simplified version of what's in results.ts)
          const teamStatsMap = new Map<string, {
            teamId: string;
            teamName: string;
            totalPoints: number;
            members: Array<{ epicUsername: string; playerId: string | null; discordUsername: string | null }>;
          }>();

          for (const imp of imports) {
            const results = await ctx.db
              .query("thirdPartyResults")
              .withIndex("by_import", (q) => q.eq("importId", imp._id))
              .collect();

            for (const result of results) {
              const teamKey = result.teamId || result.teamName || `team_${result.placement}`;
              
              if (!teamStatsMap.has(teamKey)) {
                teamStatsMap.set(teamKey, {
                  teamId: teamKey,
                  teamName: result.teamName || teamKey,
                  totalPoints: 0,
                  members: [],
                });
              }

              const teamData = teamStatsMap.get(teamKey)!;
              teamData.totalPoints += result.points;

              // Add member if not already in list
              if (result.playerId && !teamData.members.find(m => m.epicUsername === result.epicUsername)) {
                teamData.members.push({
                  epicUsername: result.epicUsername,
                  playerId: result.playerId,
                  discordUsername: result.discordUsername || null,
                });
              }
            }
          }

          // Sort by total points and assign cumulative placements
          const cumulativeLeaderboard = Array.from(teamStatsMap.values())
            .filter(entry => entry.totalPoints > 0)
            .sort((a, b) => b.totalPoints - a.totalPoints);

          // Award earnings to top N teams on cumulative leaderboard
          for (let i = 0; i < Math.min(maxPlacement, cumulativeLeaderboard.length); i++) {
            const team = cumulativeLeaderboard[i];
            const placement = i + 1;

            for (const member of team.members) {
              if (member.playerId) {
                await ctx.db.insert("playerEarnings", {
                  playerId: member.playerId as Id<"players">,
                  eventId: args.eventId,
                  eventName: event.name,
                  eventDate: event.startDate,
                  earningType: "placement",
                  placement: placement,
                  topN: maxPlacement,
                  teammates: team.members.map(m => m.discordUsername || m.epicUsername).filter(Boolean),
                });
                earningsCount++;
              }
            }
          }

          // For season events: ALSO award earnings to the top team from each individual week
          // (in addition to the cumulative leaderboard awards above)
          if (event.type === "season") {
            for (const imp of imports) {
              const results = await ctx.db
                .query("thirdPartyResults")
                .withIndex("by_import", (q) => q.eq("importId", imp._id))
                .collect();

              // Group by team for this import
              const weekTeamStatsMap = new Map<string, {
                teamId: string;
                teamName: string;
                totalPoints: number;
                placement: number;
                members: Array<{ epicUsername: string; playerId: string | null; discordUsername: string | null }>;
              }>();

              for (const result of results) {
                const teamKey = result.teamId || result.teamName || `team_${result.placement}`;
                
                if (!weekTeamStatsMap.has(teamKey)) {
                  weekTeamStatsMap.set(teamKey, {
                    teamId: teamKey,
                    teamName: result.teamName || teamKey,
                    totalPoints: 0,
                    placement: result.placement,
                    members: [],
                  });
                }

                const teamData = weekTeamStatsMap.get(teamKey)!;
                teamData.totalPoints += result.points;

                // Add member if not already in list
                if (result.playerId && !teamData.members.find(m => m.epicUsername === result.epicUsername)) {
                  teamData.members.push({
                    epicUsername: result.epicUsername,
                    playerId: result.playerId,
                    discordUsername: result.discordUsername || null,
                  });
                }
              }

              // Find the top team for this week
              const weekLeaderboard = Array.from(weekTeamStatsMap.values())
                .filter(entry => entry.totalPoints > 0)
                .sort((a, b) => {
                  // Sort by placement first, then by points
                  if (a.placement !== b.placement) {
                    return a.placement - b.placement;
                  }
                  return b.totalPoints - a.totalPoints;
                });

              // Award earnings to the top team of this week
              if (weekLeaderboard.length > 0) {
                const topTeam = weekLeaderboard[0];
                
                for (const member of topTeam.members) {
                  if (member.playerId) {
                    await ctx.db.insert("playerEarnings", {
                      playerId: member.playerId as Id<"players">,
                      eventId: args.eventId,
                      importId: imp._id,
                      eventName: event.name,
                      eventDate: imp.eventDate || event.startDate,
                      earningType: "placement",
                      placement: 1,
                      topN: 1,
                      teammates: topTeam.members.map(m => m.discordUsername || m.epicUsername).filter(Boolean),
                    });
                    earningsCount++;
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Process match win earnings (Game Winners)
    if (event.matchWinEarnings) {
      // Get all match stats where placement = 1
      const imports = await ctx.db
        .query("thirdPartyImports")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();

      for (const imp of imports) {
        const winningMatches = await ctx.db
          .query("matchPlayerStats")
          .withIndex("by_import", (q) => q.eq("importId", imp._id))
          .collect();

        // Group by sessionId to get unique matches
        const matchMap = new Map<string, typeof winningMatches>();
        for (const match of winningMatches) {
          if (match.placement === 1) {
            if (!matchMap.has(match.sessionId)) {
              matchMap.set(match.sessionId, []);
            }
            matchMap.get(match.sessionId)!.push(match);
          }
        }

        // Create earnings records for each player in each winning match
        for (const [sessionId, matches] of matchMap) {
          // Get teammate names from the winning team
          const teammateIds = matches.map((m) => m.discordId);
          const teammates: string[] = [];
          
          for (const match of matches) {
            const player = await ctx.db.get(match.playerId);
            if (player) {
              teammates.push(player.discordUsername);
            }
          }

          for (const match of matches) {
            await ctx.db.insert("playerEarnings", {
              playerId: match.playerId,
              eventId: args.eventId,
              importId: imp._id,
              sessionId: sessionId,
              eventName: event.name,
              eventDate: imp.eventDate || event.startDate,
              earningType: "gamewinner",
              teammates: teammates,
            });
            earningsCount++;
          }
        }
      }
    }

    console.log(`Created ${earningsCount} earnings records for event ${event.name}`);
    return { success: true, earningsCount };
  },
});

// Recalculate all earnings for all events
export const recalculateAllEarnings = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Get all events with earnings tracking enabled
    const events = await ctx.db.query("events").collect();
    const eventsWithEarnings = events.filter(
      (e) => e.placementEarningsTopN || e.matchWinEarnings || e.duoPlacementEarningsTopN || e.soloPlacementEarningsTopN
    );

    let totalEarnings = 0;
    for (const event of eventsWithEarnings) {
      const result = await ctx.scheduler.runAfter(0, internal.playerEarnings.calculateEventEarnings, {
        eventId: event._id,
      });
    }

    return { 
      success: true, 
      message: `Scheduled earnings calculation for ${eventsWithEarnings.length} events`
    };
  },
});

// Get all earnings for a player
export const getPlayerEarnings = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args): Promise<Array<{
    _id: Id<"playerEarnings">;
    eventName: string;
    eventDate: string;
    earningType: "placement" | "gamewinner" | "top2teams" | "top3teams" | "top5teams";
    placement?: number;
    topN?: number;
    teammates?: string[];
  }>> => {
    const earnings = await ctx.db
      .query("playerEarnings")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    return earnings.map((e) => ({
      _id: e._id,
      eventName: e.eventName,
      eventDate: e.eventDate,
      earningType: e.earningType,
      placement: e.placement,
      topN: e.topN,
      teammates: e.teammates,
    }));
  },
});

// Get all players with earnings (for admin page)
export const getAllPlayersWithEarnings = query({
  args: {},
  handler: async (ctx): Promise<Array<{
    playerId: Id<"players">;
    playerName: string;
    discordUsername: string;
    epicUsername: string;
    totalEarnings: number;
    earningsByType: Record<string, number>; // Dynamic keys for "placement_2", "placement_3", etc.
    placementEarnings: number; // Total placement earnings
    gameWinnerEarnings: number; // Total game winner earnings
    events: Array<{
      eventName: string;
      eventDate: string;
      earningType: "placement" | "gamewinner" | "top2teams" | "top3teams" | "top5teams";
      placement?: number;
      topN?: number;
    }>;
  }>> => {
    // Get all earnings
    const allEarnings = await ctx.db.query("playerEarnings").collect();

    // Group by player
    const playerEarningsMap = new Map<Id<"players">, typeof allEarnings>();
    for (const earning of allEarnings) {
      if (!playerEarningsMap.has(earning.playerId)) {
        playerEarningsMap.set(earning.playerId, []);
      }
      playerEarningsMap.get(earning.playerId)!.push(earning);
    }

    // Build result array
    const result = [];
    for (const [playerId, earnings] of playerEarningsMap) {
      const player = await ctx.db.get(playerId);
      
      // Include earnings even if player record is missing/archived
      // This prevents earnings from disappearing when players are archived

      // Build earnings by type map dynamically
      const earningsByType: Record<string, number> = {};
      let placementEarnings = 0;
      let gameWinnerEarnings = 0;

      for (const earning of earnings) {
        if (earning.earningType === "placement" && earning.topN) {
          const key = `placement_${earning.topN}`;
          earningsByType[key] = (earningsByType[key] || 0) + 1;
          placementEarnings++;
        } else if (earning.earningType === "gamewinner") {
          earningsByType["gamewinner"] = (earningsByType["gamewinner"] || 0) + 1;
          gameWinnerEarnings++;
        } else if (earning.earningType.startsWith("top")) {
          // Handle legacy types (top2teams, top3teams, top5teams)
          earningsByType[earning.earningType] = (earningsByType[earning.earningType] || 0) + 1;
          placementEarnings++;
        }
      }

      result.push({
        playerId: playerId,
        playerName: player ? (player.name || player.discordUsername) : "Unknown Player",
        discordUsername: player?.discordUsername || "unknown",
        epicUsername: player?.epicUsername || "unknown",
        totalEarnings: earnings.length,
        earningsByType,
        placementEarnings,
        gameWinnerEarnings,
        events: earnings.map((e) => ({
          eventName: e.eventName,
          eventDate: e.eventDate,
          earningType: e.earningType,
          placement: e.placement,
          topN: e.topN,
        })),
      });
    }

    // Sort by total earnings descending
    result.sort((a, b) => b.totalEarnings - a.totalEarnings);

    return result;
  },
});
