"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";
import { matchPlayerForImport } from "../lib/playerIdentity";
import type { PlayerMatchFields } from "../lib/playerIdentity";
import type { Id } from "../_generated/dataModel.d.ts";
import {
  normalizeYuniteLeaderboardPayload,
  yuniteTournamentHasImportableData,
} from "../lib/yunite";
import {
  yuniteFetch,
  yuniteFetchOrThrow,
  yuniteResponseJson,
} from "../lib/yuniteRateLimit";
import {
  calculateEliminationsFromEvents,
  collectMatchKillFeedEvents,
  countKnocksInFeed,
  getPlayerKillFeedEntries,
  sumTeamPlayerEliminations,
  type KillFeedEvent,
  type RawKillFeedEntry,
} from "./killFeedStats";

interface YuniteTournament {
  id: string;
  name: string;
  startedAt: string;
  status?: string;
  teamSize?: number;
  region?: string;
  // Add more fields as needed from Yunite API
}

interface YuniteUser {
  index: number;
  discordId: string;
  epicId: string;
  name?: string; // Player display name from Yunite
  eliminations?: number; // Individual player eliminations
  kills?: number; // Individual player kills
  deaths?: number; // Individual player deaths
}

interface YuniteLeaderboardEntry {
  teamId?: string;
  teamName?: string;
  users?: YuniteUser[];
  // Solo tournament fields (if not team-based)
  discordId?: string;
  epicName?: string;
  username?: string;
  displayName?: string;
  // Common fields
  placement: number;
  kills?: number; // Team kills
  eliminations?: number;
  deaths?: number;
  points?: number;
  score?: number;
  kdRatio?: number;
}

export const syncYuniteTournaments = action({
  args: {
    tournamentIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey) {
      throw new Error("YUNITE_API_KEY environment variable is not set");
    }
    
    if (!yuniteGuildId) {
      throw new Error("YUNITE_GUILD_ID environment variable is not set");
    }
    
    try {
      // Log debug info (without exposing full key)
      console.log("Yunite Sync Started");
      console.log("Guild ID:", yuniteGuildId);
      console.log("API Key present:", !!yuniteApiKey);
      console.log("API Key length:", yuniteApiKey?.length);
      console.log("API Key first 4 chars:", yuniteApiKey?.substring(0, 4));
      
      // Update sync status to in_progress
      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "yunite",
        status: "in_progress",
      });

      let playersForMatching: PlayerMatchFields[] = await ctx.runQuery(
        internal.players.importMatching.listPlayersForImportMatching,
        {},
      );
      if (playersForMatching.length === 0) {
        await ctx.runMutation(internal.players.importLookup.rebuildCache, {});
        playersForMatching = await ctx.runQuery(
          internal.players.importMatching.listPlayersForImportMatching,
          {},
        );
      }

      let tournaments: YuniteTournament[] = [];
      
      if (args.tournamentIds && args.tournamentIds.length > 0) {
        // Fetch specific tournaments
        for (const tournamentId of args.tournamentIds) {
          const url = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}`;
          console.log("Fetching tournament:", url);
          
          const response = await yuniteFetchOrThrow(url, yuniteApiKey);
          
          console.log("Response status:", response.status);
          console.log("Response content-type:", response.headers.get("content-type"));
          
          const tournament = await response.json();
          tournaments.push(tournament);
        }
      } else {
        // Fetch all recent tournaments
        const url = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments`;
        console.log("Fetching tournaments:", url);
        
        const response = await yuniteFetchOrThrow(url, yuniteApiKey, {}, { skipSpacing: true });
        
        console.log("Response status:", response.status);
        console.log("Response content-type:", response.headers.get("content-type"));
        
        tournaments = await response.json();
        console.log("Fetched tournaments count:", tournaments.length);
      }
      
      let added = 0;
      let updated = 0;
      let successfulTournaments = 0;
      let failedTournaments = 0;
      const affectedPlayerIds = new Set<Id<"players">>();
      
      // Get current user for audit logs
      const identity = await ctx.auth.getUserIdentity();
      const currentUser = identity 
        ? await ctx.runQuery(api.users.getUserByToken, { tokenIdentifier: identity.tokenIdentifier })
        : null;
      
      // Process each tournament with rate limiting
      for (let i = 0; i < tournaments.length; i++) {
        const tournament = tournaments[i];
        
        // Check if sync should be stopped
        const syncStatus = await ctx.runQuery(api.sync.getSyncStatus, { syncType: "yunite" });
        if (syncStatus?.status === "stopping") {
          console.log("🛑 Sync stopped by user");
          await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
            syncType: "yunite",
            status: "success",
            recordsAdded: added,
            recordsUpdated: updated,
          });
          return {
            success: true,
            tournamentsProcessed: i,
            successfulTournaments,
            failedTournaments,
            added,
            updated,
            stopped: true,
          };
        }
        
        // Fetch leaderboard for this tournament
        const leaderboardUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournament.id}/leaderboard`;
        console.log(`[${i + 1}/${tournaments.length}] Fetching: ${tournament.name}`);
        
        let leaderboard: YuniteLeaderboardEntry[];
        const leaderboardResponse = await yuniteFetch(leaderboardUrl, yuniteApiKey);
        
        console.log(`Response status: ${leaderboardResponse.status}`);
        
        if (!leaderboardResponse.ok) {
          const errorText = await leaderboardResponse.text();
          console.error(`Failed to fetch leaderboard for tournament ${tournament.id}:`);
          console.error(`Status: ${leaderboardResponse.status}`);
          console.error(`Response: ${errorText}`);
          failedTournaments++;
          continue;
        }
        
        const leaderboardPayload = await leaderboardResponse.json();

        if (!yuniteTournamentHasImportableData(tournament, leaderboardPayload)) {
          console.log(
            `⏭️  Skipping tournament with no player or tournament data: ${tournament.name || tournament.id}`,
          );
          continue;
        }

        leaderboard = normalizeYuniteLeaderboardPayload(
          leaderboardPayload,
        ) as YuniteLeaderboardEntry[];

        successfulTournaments++;
        
        console.log(`✓ Successfully fetched tournament: ${tournament.name} with ${leaderboard.length} entries`);
        
        // Debug: Log first entry structure to see what data is available
        if (leaderboard.length > 0) {
          console.log("🔍 FIRST ENTRY STRUCTURE:");
          console.log(JSON.stringify(leaderboard[0], null, 2));
          
          if (leaderboard[0].users && leaderboard[0].users.length > 0) {
            console.log("🔍 FIRST USER IN TEAM:");
            console.log(JSON.stringify(leaderboard[0].users[0], null, 2));
          }
        }
        
        // Parse tournament date safely
        let eventDate: string;
        try {
          if (tournament.startedAt) {
            eventDate = new Date(tournament.startedAt).toISOString().split('T')[0];
          } else {
            console.warn(`Tournament ${tournament.id} has no startedAt date, using today's date`);
            eventDate = new Date().toISOString().split('T')[0];
          }
        } catch (error) {
          console.error(`Invalid date for tournament ${tournament.id}: ${tournament.startedAt}, using today's date`);
          eventDate = new Date().toISOString().split('T')[0];
        }
        
        // Create thirdPartyImport record for this tournament
        const tournamentPageUrl = `https://yunite.xyz/leaderboard/${tournament.id}`;
        const leaderboardId = `yunite-${tournament.id}`;
        
        // Check if this tournament was already imported
        const existingImport = await ctx.runQuery(api.thirdParty.checkExistingImport, {
          leaderboardId,
        });
        
        // Skip if already imported
        if (existingImport) {
          console.log(`⏭️  Skipping already imported tournament: ${tournament.name}`);
          continue;
        }
        
        let playersMatched = 0;
        let playersUnmatched = 0;
        
        // Create new import record
        if (!currentUser) {
          console.warn(`No current user found, skipping tournament: ${tournament.name}`);
          continue;
        }
        
        const importId = await ctx.runMutation(api.thirdPartyMutations.createImportRecord, {
          leaderboardUrl: tournamentPageUrl,
          leaderboardId,
          eventName: tournament.name,
          eventDate,
          source: "Yunite",
          importMethod: "api",
          totalPlayers: leaderboard.length,
          importedBy: currentUser._id,
          importedByName: currentUser.name || "System",
        });
        
        // Process each leaderboard entry
        // Note: At this stage, we store team kills from the leaderboard
        // Individual player kills will be updated later via "Sync Match Data" button
        // IMPORTANT: The leaderboard array is sorted by points/score, so the array index + 1 
        // is the team's actual rank. The entry.placement field is the AVERAGE placement 
        // across matches, not their leaderboard rank.
        for (let leaderboardIndex = 0; leaderboardIndex < leaderboard.length; leaderboardIndex++) {
          const entry = leaderboard[leaderboardIndex];
          // The actual team rank is their position in the sorted leaderboard (index + 1)
          const teamRank = leaderboardIndex + 1;
          
          // Determine if this is a team or solo entry
          const isTeam = entry.users && entry.users.length > 0;
          const usersToProcess: Array<{discordId?: string, epicName?: string, epicId?: string, eliminations?: number, kills?: number}> = [];
          
          if (isTeam && entry.users) {
            // Team tournament - process each user
            // Initially use team total for eliminations (will be updated with match data)
            usersToProcess.push(...entry.users.map(u => ({ 
              discordId: u.discordId, 
              epicName: u.name,
              epicId: u.epicId,
              eliminations: u.eliminations,
              kills: u.kills
            })));
          } else {
            // Solo tournament - process single player
            const epicUsername = entry.epicName || entry.username || entry.displayName;
            usersToProcess.push({ 
              discordId: entry.discordId, 
              epicName: epicUsername,
              epicId: undefined,
              eliminations: entry.eliminations,
              kills: entry.kills
            });
          }
          
          // Process each user in the entry
          // Note: Player matching includes ALL players (active and archived) 
          // to ensure historical data stays linked even after archiving
          for (const user of usersToProcess) {
            const { player: matchedPlayerDoc } = matchPlayerForImport(
              playersForMatching,
              {
                discordId: user.discordId,
                epicId: user.epicId,
                epicUsername: user.epicName,
              },
            );

            const player = matchedPlayerDoc;
            const matched = !!player;
            let epicUsername: string | undefined = user.epicName;

            if (player) {
              epicUsername = player.epicUsername || user.epicName;
            }
            
            // If matched and we have an epicId from Yunite, update the player's epicId (with history tracking)
            if (matched && player && user.epicId && player.epicId !== user.epicId) {
              await ctx.runMutation(api.yunite.updatePlayerEpicId, {
                playerId: player._id,
                epicId: user.epicId,
              });
            }
            
            if (matched) {
              playersMatched++;
              if (player?._id) {
                affectedPlayerIds.add(player._id);
              }
            } else {
              playersUnmatched++;
            }
          
            // Store in thirdPartyResults (same path as manual Tournament ID import)
            const eliminationsValue = user.eliminations || user.kills || entry.kills || entry.eliminations || 0;
            const teamKillsValue = entry.kills || entry.eliminations || 0;
            const pointsValue = entry.score || entry.points || 0;
            
            await ctx.runMutation(api.thirdPartyMutations.createResult, {
              importId,
              playerId: player?._id,
              eventName: tournament.name,
              source: "Yunite",
              leaderboardUrl: tournamentPageUrl,
              epicUsername: epicUsername || `Discord:${user.discordId}`,
              epicId: user.epicId,
              discordUsername: undefined,
              discordId: user.discordId,
              placement: teamRank,
              points: pointsValue,
              eliminations: eliminationsValue,
              teamKills: teamKillsValue,
              damage: undefined,
              deaths: undefined,
              knocks: undefined,
              teamId: entry.teamId,
              teamName: entry.teamName,
              matched,
            });
            added++;
          }
        }
        
        // Update import record with match counts
        if (importId && !existingImport) {
          await ctx.runMutation(api.thirdPartyMutations.updateImportMatchCounts, {
            importId,
            playersMatched,
            playersUnmatched,
          });
        }
      }
      
      console.log(`\n=== Sync Summary ===`);
      console.log(`Total tournaments found: ${tournaments.length}`);
      console.log(`Successfully processed: ${successfulTournaments}`);
      console.log(`Failed to process: ${failedTournaments}`);
      console.log(`Events added: ${added}`);
      console.log(`Events updated: ${updated}`);
      
      // Update sync status to success
      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "yunite",
        status: "success",
        recordsAdded: added,
        recordsUpdated: updated,
      });

      if (affectedPlayerIds.size > 0) {
        await ctx.runMutation(
          internal.helpers.eventDrivenRebuilds.scheduleStatsForAffectedPlayers,
          { playerIds: [...affectedPlayerIds] },
        );
      }
      
      return {
        success: true,
        tournamentsProcessed: tournaments.length,
        successfulTournaments,
        failedTournaments,
        added,
        updated,
      };
      
    } catch (error) {
      // Update sync status to error
      await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
        syncType: "yunite",
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      
      throw error;
    }
  },
});

interface YuniteMatch {
  id: string;
  session?: string;
  sessionId?: string;
}

const DISCORD_LOOKUP_BATCH_SIZE = 75;
const MATCH_STATS_BATCH_SIZE = 75;
const RESULT_UPDATE_BATCH_SIZE = 100;

type PendingMatchPlayerStats = {
  sessionId: string;
  discordId: string;
  teamId?: string;
  duoDiscordId?: string;
  placement: number;
  eliminations: number;
  knocks: number;
  deaths: number;
  teamTotalKills: number;
  teamKillDiscrepancy?: number;
  deathTime?: number;
  duoDeathTime?: number;
  killsAfterDuoDeath?: number;
  timeAliveAfterDuoDeath?: number;
};

interface YuniteMatchLeaderboardEntry {
  team: {
    id?: string;
    players: Array<{
      index: number;
      discordId: string;
      epicId: string;
    }>;
  };
  teamId?: string;
  placement: number;
  kills: number; // Team total
  survivalTime: number;
  score: number;
  deathLocations?: Record<string, {
    x: number;
    y: number;
    time: number;
  }>;
  killFeeds?: Record<string, Array<{
    player?: string; // Discord ID (legacy/optional)
    victim?: {
      discordId: string;
      epicId?: string;
    };
    cause: number;
    strCause: string;
    knock: boolean;
    finish: boolean;
    time: number;
  }>>;
}

export const syncTournamentMatchDataInternal = internalAction({
  args: {
    importId: v.id("thirdPartyImports"),
    jobId: v.optional(v.id("importProcessingJobs")),
  },
  handler: async (ctx, args) => {
    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID environment variables must be set");
    }
    
    try {
      // Get the import record to find the tournament ID
      const importRecord = await ctx.runQuery(api.thirdParty.getImportById, {
        importId: args.importId,
      });
      
      if (!importRecord) {
        throw new Error("Import record not found");
      }
      
      // Extract tournament ID from leaderboardId (format: "yunite-{tournamentId}")
      const tournamentId = importRecord.leaderboardId.replace("yunite-", "");
      
      console.log(`🎯 Fetching match data for tournament: ${importRecord.eventName}`);
      
      // Fetch list of matches for this tournament
      const matchesUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/matches`;
      console.log(`Fetching matches from: ${matchesUrl}`);
      
      const matchesResponse = await yuniteFetchOrThrow(matchesUrl, yuniteApiKey, {}, { skipSpacing: true });
      const matches = await yuniteResponseJson<YuniteMatch[]>(matchesResponse);
      console.log(`✓ Found ${matches.length} matches`);
      console.log(`📋 Match IDs:`, matches.map(m => m.sessionId || m.session || m.id));

      const { resultRows } = await ctx.runQuery(
        internal.yunite.matchDataHelpers.getImportResultsForMatchSync,
        { importId: args.importId },
      );
      const resultsByDiscord = new Map(
        resultRows.map((row) => [row.discordId, row]),
      );
      console.log(
        `📋 Preloaded ${resultsByDiscord.size} result refs for import`,
      );
      
      // Aggregate stats per player (keyed by Discord ID)
      // Note: We only track individual player kills here, NOT team kills
      // Team kills come from the tournament leaderboard and should not be recalculated
      const playerStats = new Map<string, { eliminations: number; kills: number; deaths: number; matches: number; wins: number }>();
      const pendingMatchStats: PendingMatchPlayerStats[] = [];
      
      // Track total match kills (sum of all team kills across all matches)
      let totalMatchKills = 0;
      let totalKillDiscrepancy = 0;

      // Fetch each match's leaderboard
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const sessionId = match.sessionId || match.session || match.id;
        
        const matchLeaderboardUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/matches/${sessionId}`;
        console.log(`[${i + 1}/${matches.length}] Fetching match leaderboard...`);
        
        const matchResponse = await yuniteFetch(matchLeaderboardUrl, yuniteApiKey);
        
        if (!matchResponse.ok) {
          console.warn(`Failed to fetch match ${sessionId}: ${matchResponse.status}`);
          continue;
        }

        let matchData: YuniteMatchLeaderboardEntry[];
        try {
          matchData = await yuniteResponseJson<YuniteMatchLeaderboardEntry[]>(
            matchResponse,
          );
        } catch (parseError) {
          const msg =
            parseError instanceof Error ? parseError.message : String(parseError);
          console.warn(`Failed to parse match ${sessionId}: ${msg}`);
          continue;
        }
        
        console.log(`  📦 Match ${i + 1} raw data structure:`, JSON.stringify(matchData).substring(0, 500));
        console.log(`  📦 Number of teams in match: ${matchData.length}`);
        
        // The match data is an array of team entries
        // Each entry has: team, placement, kills (team total), killFeeds (per player), deathLocations
        
        // FIRST PASS: Count deaths per player by scanning all kill feeds
        // A player can die multiple times if they respawn
        const playerDeathCounts = new Map<string, number>();
        
        for (const entry of matchData) {
          const killFeeds = entry.killFeeds || {};
          
          // Scan all kill feeds to count how many times each player was eliminated
          for (const killerId of Object.keys(killFeeds)) {
            const killerFeed = killFeeds[killerId] || [];
            
            for (const kill of killerFeed) {
              // Only count finishes (actual eliminations, not just knocks)
              if (kill.finish === true) {
                // Get victim Discord ID from either victim object or legacy player field
                const victimId = kill.victim?.discordId || kill.player;
                
                if (victimId) {
                  playerDeathCounts.set(victimId, (playerDeathCounts.get(victimId) || 0) + 1);
                }
              }
            }
          }
        }
        
        console.log(`  💀 Death counts in match ${i + 1}:`, Object.fromEntries(playerDeathCounts));

        const matchKillFeedEvents: KillFeedEvent[] = [];
        for (const entry of matchData) {
          const players = entry.team?.players || [];
          const killFeeds = (entry.killFeeds || {}) as Record<string, RawKillFeedEntry[]>;
          matchKillFeedEvents.push(...collectMatchKillFeedEvents(players, killFeeds));
        }
        const matchEliminations = calculateEliminationsFromEvents(matchKillFeedEvents);

        // SECOND PASS: Process team stats
        for (const entry of matchData) {
          // Get the list of players in this team
          const players = entry.team?.players || [];
          const killFeeds = (entry.killFeeds || {}) as Record<string, RawKillFeedEntry[]>;
          const deathLocations = entry.deathLocations || {};
          const teamKillsFromMatch = entry.kills || 0;
          const placement = entry.placement;
          const teamId = entry.team?.id || entry.teamId;
          
          // Accumulate total match kills across all teams and matches
          totalMatchKills += teamKillsFromMatch;
          
          const sumOfPlayerKills = sumTeamPlayerEliminations(players, matchEliminations);
          const teamKillDiscrepancy = teamKillsFromMatch - sumOfPlayerKills;
          if (teamKillDiscrepancy !== 0) {
            totalKillDiscrepancy += Math.abs(teamKillDiscrepancy);
            console.log(
              `    ⚠️ Team kill discrepancy: API=${teamKillsFromMatch}, verified=${sumOfPlayerKills} (Δ${teamKillDiscrepancy})`,
            );
          }

          // Log detailed info about this team
          console.log(`  🎮 Match ${i + 1}, Placement ${placement}, Team Total Kills: ${teamKillsFromMatch}`);
          console.log(`    Players in team:`, players.map((p: { discordId: string }) => p.discordId));
          console.log(`    KillFeeds keys:`, Object.keys(killFeeds));
          
          // Process each player in the team
          for (const player of players) {
            if (!player.discordId) continue;
            
            const playerKillFeed = getPlayerKillFeedEntries(killFeeds, player.discordId);
            
            // Log the raw killfeed for this player
            if (playerKillFeed.length > 0) {
              console.log(`    📊 Raw killFeed for ${player.discordId}:`, JSON.stringify(playerKillFeed));
            }
            
            const eliminations = matchEliminations[player.discordId] || 0;
            const knocks = countKnocksInFeed(playerKillFeed);
            
            // Get player death count from kill feed analysis (not just deathLocation)
            let deathCount = playerDeathCounts.get(player.discordId) || 0;
            const deathLocation = deathLocations[player.discordId];
            const deathTime = deathLocation?.time;
            
            // Death fallback logic:
            // - If placement === 1 (won the match) and deathCount === 0: player survived, no death counted
            // - If placement > 1 (didn't win) and deathCount === 0: player must have died somehow (storm, fall damage, missing data), assume 1 death
            if (deathCount === 0 && placement > 1) {
              deathCount = 1;
              console.log(`    ⚠️ Player ${player.discordId}: Assumed 1 death (placement ${placement}, no kill feed data)`);
            } else if (deathCount === 0 && placement === 1) {
              console.log(`    ✅ Player ${player.discordId}: Victory with 0 deaths (placement ${placement})`);
            }
            
            // Log per-player stats
            console.log(`    👤 Player ${player.discordId}: ${eliminations} finishes, ${knocks} knocks, ${deathCount} deaths (${playerKillFeed.length} total entries)`);
            
            // Aggregate individual player stats across all matches
            const stats = playerStats.get(player.discordId) || { eliminations: 0, kills: 0, deaths: 0, matches: 0, wins: 0 };
            stats.eliminations += eliminations;
            stats.kills += eliminations;
            stats.matches += 1;
            
            // Check if team won this match (placement === 1)
            if (placement === 1) {
              stats.wins += 1;
            }
            
            // Add death count (can be 0, 1, or more)
            stats.deaths += deathCount;
            
            playerStats.set(player.discordId, stats);

            // Identify duo partner (if team has exactly 2 players)
            let duoDiscordId: string | undefined;
            let duoDeathTime: number | undefined;
            let killsAfterDuoDeath = 0;
            let timeAliveAfterDuoDeath = 0;

            if (players.length === 2) {
              const duoPlayer = players.find(
                (p: { discordId: string }) => p.discordId !== player.discordId,
              );
              if (duoPlayer) {
                duoDiscordId = duoPlayer.discordId;
                const duoDeathLocation = deathLocations[duoPlayer.discordId];
                duoDeathTime = duoDeathLocation?.time;

                if (duoDeathTime !== undefined) {
                  const safeDuoDeathTime = duoDeathTime;
                  killsAfterDuoDeath = playerKillFeed.filter(
                    (k) =>
                      k.finish === true &&
                      (k.time ?? 0) > safeDuoDeathTime,
                  ).length;

                  if (deathTime !== undefined && deathTime > safeDuoDeathTime) {
                    timeAliveAfterDuoDeath = deathTime - safeDuoDeathTime;
                  } else if (deathTime === undefined) {
                    timeAliveAfterDuoDeath = 1500 - safeDuoDeathTime;
                  }
                }
              }
            }

            pendingMatchStats.push({
              sessionId,
              discordId: player.discordId,
              teamId,
              duoDiscordId,
              placement,
              eliminations,
              knocks,
              deaths: deathCount,
              teamTotalKills: teamKillsFromMatch,
              teamKillDiscrepancy:
                teamKillDiscrepancy !== 0 ? teamKillDiscrepancy : undefined,
              deathTime,
              duoDeathTime,
              killsAfterDuoDeath:
                killsAfterDuoDeath > 0 ? killsAfterDuoDeath : undefined,
              timeAliveAfterDuoDeath:
                timeAliveAfterDuoDeath > 0 ? timeAliveAfterDuoDeath : undefined,
            });
          }
        }
      }

      const uniqueDiscordIds = [
        ...new Set([
          ...playerStats.keys(),
          ...pendingMatchStats.map((row) => row.discordId),
        ]),
      ];
      const playersByDiscord = new Map<string, Id<"players">>();
      for (let i = 0; i < uniqueDiscordIds.length; i += DISCORD_LOOKUP_BATCH_SIZE) {
        const chunk = uniqueDiscordIds.slice(i, i + DISCORD_LOOKUP_BATCH_SIZE);
        const lookup = await ctx.runQuery(
          internal.yunite.matchDataHelpers.resolvePlayersByDiscordIds,
          { discordIds: chunk },
        );
        for (const ref of lookup.playerRefs) {
          playersByDiscord.set(ref.discordId, ref.playerId);
        }
      }
      console.log(
        `👤 Resolved ${playersByDiscord.size}/${uniqueDiscordIds.length} Discord IDs to players (${Math.ceil(uniqueDiscordIds.length / DISCORD_LOOKUP_BATCH_SIZE) || 0} lookup batches)`,
      );

      const matchStatsRows = pendingMatchStats
        .filter((row) => playersByDiscord.has(row.discordId))
        .map((row) => ({
          ...row,
          playerId: playersByDiscord.get(row.discordId)!,
        }));

      let matchStatsWritten = 0;
      let matchStatsSkipped = 0;
      const matchStatsAffectedPlayerIds = new Set<Id<"players">>();
      for (let i = 0; i < matchStatsRows.length; i += MATCH_STATS_BATCH_SIZE) {
        const chunk = matchStatsRows.slice(i, i + MATCH_STATS_BATCH_SIZE);
        const result = await ctx.runMutation(
          internal.yunite.matchDataHelpers.bulkStoreMatchPlayerStats,
          { importId: args.importId, rows: chunk },
        );
        matchStatsWritten += result.written;
        matchStatsSkipped += result.skippedNoChange;
        for (const playerId of result.writtenPlayerIds) {
          matchStatsAffectedPlayerIds.add(playerId);
        }
      }
      console.log(
        `📊 Match stats: ${matchStatsWritten} written, ${matchStatsSkipped} skipped (unchanged), ${pendingMatchStats.length - matchStatsRows.length} unmatched players`,
      );

      console.log(`📊 Aggregated stats for ${playerStats.size} unique players`);
      
      // Log ALL aggregated data for debugging
      console.log('=== FULL AGGREGATED PLAYER STATS ===');
      for (const [discordId, stats] of playerStats.entries()) {
        console.log(`Player ${discordId}:`);
        console.log(`  - Total eliminations: ${stats.eliminations}`);
        console.log(`  - Total deaths: ${stats.deaths}`);
        console.log(`  - Matches played: ${stats.matches}`);
        console.log(`  - Wins: ${stats.wins}`);
      }
      console.log('=== END AGGREGATED STATS ===');
      
      // Update existing thirdPartyResults with individual player eliminations and wins
      // Note: We DO NOT update teamKills here - those come from the tournament leaderboard
      const resultUpdates = [];
      for (const [discordId, stats] of playerStats.entries()) {
        const resultRef = resultsByDiscord.get(discordId);
        if (resultRef) {
          resultUpdates.push({
            resultId: resultRef.resultId,
            eliminations: stats.eliminations,
            deaths: stats.deaths,
            wins: stats.wins,
            matchesPlayed: stats.matches,
          });
        }
      }

      let updated = 0;
      let resultUpdatesSkipped = 0;
      for (let i = 0; i < resultUpdates.length; i += RESULT_UPDATE_BATCH_SIZE) {
        const chunk = resultUpdates.slice(i, i + RESULT_UPDATE_BATCH_SIZE);
        const result = await ctx.runMutation(
          internal.yunite.matchDataHelpers.bulkUpdateResultWithMatchData,
          { updates: chunk },
        );
        updated += result.updated;
        resultUpdatesSkipped += result.skippedNoChange;
      }

      console.log(
        `✅ Updated ${updated} player records with match data (${resultUpdatesSkipped} skipped unchanged)`,
      );
      console.log(`📊 Total match kills across all matches: ${totalMatchKills}`);
      if (totalKillDiscrepancy > 0) {
        console.log(
          `⚠️ Total kill discrepancy across import: ${totalKillDiscrepancy}`,
        );
      }
      
      // Mark import as having match data synced and store total match kills
      await ctx.runMutation(internal.thirdPartyMutations.updateImportMatchDataSyncedInternal, {
        importId: args.importId,
        matchDataSynced: true,
        totalMatchKills,
        totalKillDiscrepancy,
      });

      const affectedPlayerIds = [...matchStatsAffectedPlayerIds];
      if (args.jobId && affectedPlayerIds.length > 0) {
        await ctx.runMutation(internal.importProcessing.recordMatchSyncAffectedPlayers, {
          jobId: args.jobId,
          playerIds: affectedPlayerIds,
        });
      }

      const tournamentPlayerIds = [
        ...new Set(matchStatsRows.map((row) => row.playerId)),
      ];

      return {
        success: true,
        matchesFetched: matches.length,
        updated,
        resultUpdatesSkipped,
        matchStatsWritten,
        matchStatsSkipped,
        totalMatchKills,
        matchStatsAffectedPlayerIds: affectedPlayerIds,
        tournamentPlayerIds,
      };
      
    } catch (error) {
      console.error("Error syncing match data:", error);
      throw error;
    }
  },
});

type SyncTournamentMatchDataResult = {
  success: boolean;
  matchesFetched: number;
  updated: number;
  resultUpdatesSkipped: number;
  matchStatsWritten: number;
  matchStatsSkipped: number;
  totalMatchKills: number;
  matchStatsAffectedPlayerIds: Id<"players">[];
  tournamentPlayerIds: Id<"players">[];
};

export const syncTournamentMatchData = action({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args): Promise<SyncTournamentMatchDataResult> => {
    await requireAdminAction(ctx);
    const result = await ctx.runAction(
      internal.yunite.sync.syncTournamentMatchDataInternal,
      args,
    );

    if (
      result.tournamentPlayerIds.length > 0 ||
      result.matchStatsAffectedPlayerIds.length > 0 ||
      result.updated > 0
    ) {
      const playerIds =
        result.tournamentPlayerIds.length > 0
          ? result.tournamentPlayerIds
          : result.matchStatsAffectedPlayerIds;

      await ctx.runMutation(internal.playerStatsCache.scheduleStatsUpdateForPlayers, {
        playerIds,
        matchDataChangedPlayerIds: result.matchStatsAffectedPlayerIds,
      });
    }

    return result;
  },
});

/**
 * Sync match data for all unsynced tournaments that a player participated in
 * This enables TC calculation by populating matchPlayerStats table
 */
export const syncPlayerMatchData = action({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    totalImports: number;
    alreadySynced: number;
    synced: number;
    failed: number;
    errors: Array<{ importName: string; error: string }>;
  }> => {
    await requireAdminAction(ctx);

    console.log(`🎯 Starting match data sync for player ${args.playerId}`);
    
    // Get all third party results for this player
    const playerResults = await ctx.runQuery(api.thirdPartyQueries.getPlayerThirdPartyResults, {
      playerId: args.playerId,
      linkedToEvent: "all",
    });
    
    console.log(`📊 Found ${playerResults.length} tournament results for player`);
    
    // Get unique import IDs
    const uniqueImportIds = [
      ...new Set(
        (playerResults as Array<{ importId: import("../_generated/dataModel.d.ts").Id<"thirdPartyImports"> }>).map(
          (r) => r.importId,
        ),
      ),
    ];
    console.log(`📦 Found ${uniqueImportIds.length} unique imports`);
    
    // Check which imports need syncing
    const importsToSync = [];
    for (const importId of uniqueImportIds) {
      const importRecord = await ctx.runQuery(api.thirdParty.getImportById, { importId });
      if (importRecord && !importRecord.matchDataSynced) {
        importsToSync.push({
          id: importId,
          name: importRecord.eventName,
        });
      }
    }
    
    console.log(`🔄 Need to sync ${importsToSync.length} imports`);
    
    if (importsToSync.length === 0) {
      return {
        success: true,
        totalImports: uniqueImportIds.length,
        alreadySynced: uniqueImportIds.length,
        synced: 0,
        failed: 0,
        errors: [],
      };
    }
    
    // Sync each import
    let synced = 0;
    let failed = 0;
    const errors: Array<{ importName: string; error: string }> = [];
    
    for (let i = 0; i < importsToSync.length; i++) {
      const imp = importsToSync[i];
      console.log(`[${i + 1}/${importsToSync.length}] Syncing: ${imp.name}`);
      
      try {
        await ctx.runAction(api.yunite.sync.syncTournamentMatchData, {
          importId: imp.id,
        });
        synced++;
        console.log(`  ✓ Successfully synced`);
        
        // Add delay between syncs to avoid rate limits
        if (i < importsToSync.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          importName: imp.name,
          error: errorMessage,
        });
        console.error(`  ❌ Failed:`, errorMessage);
      }
    }
    
    console.log(`\n✅ Sync complete!`);
    console.log(`   Total imports: ${uniqueImportIds.length}`);
    console.log(`   Already synced: ${uniqueImportIds.length - importsToSync.length}`);
    console.log(`   Newly synced: ${synced}`);
    console.log(`   Failed: ${failed}`);
    
    return {
      success: true,
      totalImports: uniqueImportIds.length,
      alreadySynced: uniqueImportIds.length - importsToSync.length,
      synced,
      failed,
      errors,
    };
  },
});

/**
 * List recent tournaments from the Yunite API without importing them.
 * Returns tournament metadata and whether each has already been imported.
 */
export const listRecentTournaments = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    error?: string;
    tournaments: Array<{
      id: string;
      name: string;
      startedAt: string;
      status?: string;
      teamSize?: number;
      region?: string;
      alreadyImported: boolean;
    }>;
    skippedEmpty: number;
  }> => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;

    if (!yuniteApiKey) {
      return {
        success: false,
        error: "YUNITE_API_KEY is not set in Convex environment variables.",
        tournaments: [],
        skippedEmpty: 0,
      };
    }
    if (!yuniteGuildId) {
      return {
        success: false,
        error: "YUNITE_GUILD_ID is not set in Convex environment variables.",
        tournaments: [],
        skippedEmpty: 0,
      };
    }

    const url = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments`;
    console.log("Fetching tournament list:", url);

    const response = await yuniteFetchOrThrow(url, yuniteApiKey, {}, { skipSpacing: true });

    const tournaments: YuniteTournament[] = await response.json();
    console.log(`Fetched ${tournaments.length} tournaments from Yunite`);

    // Sort by startedAt descending (most recent first)
    tournaments.sort((a, b) => {
      const dateA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const dateB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return dateB - dateA;
    });

    // Check import status and leaderboard data; skip empty tournaments.
    const results = [];
    let skippedEmpty = 0;

    for (let i = 0; i < tournaments.length; i++) {
      const t = tournaments[i];

      let leaderboardPayload: unknown = [];
      try {
        const leaderboardUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${t.id}/leaderboard`;
        const leaderboardResponse = await yuniteFetch(leaderboardUrl, yuniteApiKey);
        if (leaderboardResponse.ok) {
          leaderboardPayload = await leaderboardResponse.json();
        }
      } catch (error) {
        console.warn(`Could not fetch leaderboard for tournament ${t.id}:`, error);
      }

      if (!yuniteTournamentHasImportableData(t, leaderboardPayload)) {
        skippedEmpty++;
        continue;
      }

      const leaderboardId = `yunite-${t.id}`;
      const existing = await ctx.runQuery(api.thirdParty.checkExistingImport, {
        leaderboardId,
      });
      results.push({
        id: t.id,
        name: t.name,
        startedAt: t.startedAt,
        status: t.status,
        teamSize: t.teamSize,
        region: t.region,
        alreadyImported: !!existing,
      });
    }

    console.log(
      `Listed ${results.length} importable tournaments (${skippedEmpty} empty tournaments skipped)`,
    );

    return { success: true, tournaments: results, skippedEmpty };
  },
});
