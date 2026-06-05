"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { api, internal } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";

interface KillFeedEntry {
  killerDiscordId: string;
  killerEpicId: string;
  killerName?: string;
  victimEpicId?: string; // Contains victim's player name (if matched) or Discord ID as fallback
  victimDiscordId?: string; // Raw victim Discord ID for elimination tracking
  finish: boolean;
  knock: boolean;
  // Additional fields that may be present
  gun?: string; // Weapon name from strCause field
  distance?: number;
  timestamp?: string;
  time?: number; // Time in seconds since match start
  [key: string]: unknown; // Catch all other fields
}

interface MatchBreakdownResult {
  tournamentName: string;
  totalMatches: number;
  matches: Array<{
    matchNumber: number;
    sessionId: string;
    killFeed: KillFeedEntry[];
    teams: Array<{
      placement: number;
      teamKills: number;
      sumOfPlayerKills: number;
      discrepancy: number;
      players: Array<{
        discordId: string;
        epicId: string;
        playerName?: string;
        playerTier?: string;
        matched: boolean;
        eliminations: number;
        totalKillFeedEntries: number;
      }>;
    }>;
  }>;
}

export const fetchTournamentMatchBreakdown = action({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args): Promise<MatchBreakdownResult> => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID environment variables must be set");
    }
    
    // Get the import record to find the tournament ID
    const importRecord: {
      _id: Id<"thirdPartyImports">;
      leaderboardId: string;
      eventName: string;
    } | null = await ctx.runQuery(api.thirdParty.getImportById, {
      importId: args.importId,
    });
    
    if (!importRecord) {
      throw new Error("Import record not found");
    }
    
    // Get all players to match Discord IDs
    const allPlayers = (await ctx.runQuery(
      api.players.getPlayers,
    )) as import("../_generated/dataModel.d.ts").Doc<"players">[];
    
    // Create a lookup map for quick Discord ID matching (using discordUserId from player schema)
    const playerLookup = new Map<string, { name: string; tier?: string }>(
      allPlayers
        .filter((p) => p.discordUserId)
        .map((p) => [p.discordUserId, { name: p.discordUsername, tier: p.tier }]),
    );
    
    // Extract tournament ID from leaderboardId (format: "yunite-{tournamentId}")
    const tournamentId = importRecord.leaderboardId.replace("yunite-", "");
    
    console.log(`\n📊 Fetching match breakdown for tournament:`);
    console.log(`  Event Name: ${importRecord.eventName}`);
    console.log(`  Leaderboard ID: ${importRecord.leaderboardId}`);
    console.log(`  Extracted Tournament ID: ${tournamentId}`);
    
    // Fetch list of matches for this tournament
    const matchesUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/matches`;
    
    const matchesResponse = await fetch(matchesUrl, {
      headers: {
        "Y-Api-Token": yuniteApiKey,
      },
    });
    
    if (!matchesResponse.ok) {
      const errorText = await matchesResponse.text();
      throw new Error(`Failed to fetch matches: ${matchesResponse.status} - ${errorText}`);
    }
    
    const matches: Array<{ id?: string; session?: string; sessionId?: string }> = await matchesResponse.json();
    console.log(`✓ Found ${matches.length} matches from API for tournament ${tournamentId}`);
    console.log(`🔍 Match Session IDs:`, matches.map((m, i) => {
      const sessionId = m.sessionId || m.session || m.id || 'NO_ID';
      return `\n  ${i + 1}. ${sessionId}`;
    }).join(""));
    
    const matchBreakdowns = [];
    
    // Fetch each match's data
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const sessionId = match.sessionId || match.session || match.id;
      
      if (!sessionId) {
        console.warn(`⚠️ Skipping match ${i + 1}: No session ID found`);
        continue;
      }
      
      // Add delay to avoid rate limits (1 second between requests)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const matchLeaderboardUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/matches/${sessionId}`;
      console.log(`\n[${i + 1}/${matches.length}] Fetching match data for session: ${sessionId}`);
      
      // Retry logic for rate limits
      let matchResponse: Response | null = null;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries <= maxRetries) {
        matchResponse = await fetch(matchLeaderboardUrl, {
          headers: {
            "Y-Api-Token": yuniteApiKey,
          },
        });
        
        if (matchResponse.ok) {
          break; // Success, exit retry loop
        }
        
        if (matchResponse.status === 429 && retries < maxRetries) {
          // Rate limited - wait longer and retry
          const waitTime = 2000 * (retries + 1); // 2s, 4s, 6s
          console.warn(`⚠️ Rate limited on match ${sessionId}, waiting ${waitTime}ms before retry ${retries + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
        } else {
          // Other error or max retries reached
          console.warn(`❌ Failed to fetch match ${sessionId}: ${matchResponse.status}`);
          break;
        }
      }
      
      if (!matchResponse || !matchResponse.ok) {
        console.warn(`⏭️ Skipping match ${sessionId} after ${retries} retries`);
        continue;
      }
      
      const matchData: Array<{
        team: {
          players: Array<{
            discordId: string;
            epicId: string;
          }>;
        };
        placement: number;
        kills: number;
        killFeeds?: Record<string, unknown[]>;
      }> = await matchResponse.json();
      
      // Log raw API response structure for first match
      if (i === 0 && matchData.length > 0) {
        console.log(`\n🔍 RAW API RESPONSE for first team:`);
        console.log(`  Response has ${matchData.length} teams`);
        const firstTeam = matchData[0];
        console.log(`  First team structure keys:`, Object.keys(firstTeam));
        console.log(`  First team kills value:`, firstTeam.kills);
        console.log(`  First team has killFeeds:`, !!firstTeam.killFeeds);
        if (firstTeam.killFeeds) {
          console.log(`  killFeeds keys (player IDs):`, Object.keys(firstTeam.killFeeds).slice(0, 5));
          const firstPlayerId = Object.keys(firstTeam.killFeeds)[0];
          if (firstPlayerId) {
            const firstPlayerKillFeed = firstTeam.killFeeds[firstPlayerId] as unknown[];
            console.log(`  First player (${firstPlayerId.slice(0, 8)}) killfeed length:`, firstPlayerKillFeed.length);
            if (firstPlayerKillFeed.length > 0) {
              console.log(`  First killfeed entry structure:`, Object.keys(firstPlayerKillFeed[0] as Record<string, unknown>));
            }
          }
        }
      }
      
      // Log killfeed structure to understand all available fields
      if (i === 0 && matchData.length > 0 && matchData[0].killFeeds) {
        const allKillFeeds = matchData[0].killFeeds;
        const firstPlayerDiscordId = Object.keys(allKillFeeds)[0];
        if (firstPlayerDiscordId) {
          const firstPlayerKillFeed = allKillFeeds[firstPlayerDiscordId];
          if (firstPlayerKillFeed && firstPlayerKillFeed.length > 0) {
            console.log("🔍 KILLFEED STRUCTURE - First 3 entries:");
            firstPlayerKillFeed.slice(0, 3).forEach((entry, idx) => {
              console.log(`Entry ${idx + 1}:`, JSON.stringify(entry, null, 2));
            });
            const firstEntry = firstPlayerKillFeed[0] as Record<string, unknown>;
            console.log("🔑 Available fields:", Object.keys(firstEntry).join(", "));
          }
        }
      }
      
      // Collect all killfeed entries for this match
      const matchKillFeed: KillFeedEntry[] = [];
      
      // Log match overview
      if (i === 0) {
        console.log(`📋 Match ${i + 1} Overview (session: ${sessionId}):`);
        console.log(`  Total teams in response: ${matchData.length}`);
        matchData.slice(0, 3).forEach((entry, idx) => {
          console.log(`  Team ${idx + 1}: Placement ${entry.placement}, Team Kills: ${entry.kills || 0}, Players: ${entry.team?.players?.length || 0}`);
        });
      }
      
      // Get first team's Discord IDs for logging (calculate before processing teams)
      const firstTeamDiscordIds = matchData.length > 0 && matchData[0].team?.players 
        ? matchData[0].team.players.map((p: { discordId: string }) => p.discordId) 
        : [];
      
      // Process each team in this match
      const teams: Array<{
        placement: number;
        teamKills: number;
        players: Array<{
          discordId: string;
          epicId: string;
          playerName?: string;
          playerTier?: string;
          matched: boolean;
          eliminations: number;
          totalKillFeedEntries: number;
        }>;
        sumOfPlayerKills: number;
        discrepancy: number;
      }> = matchData.map((entry, teamIdx) => {
        const players = entry.team?.players || [];
        const killFeeds = entry.killFeeds || {};
        const teamKillsFromMatch = entry.kills || 0;
        
        // Create mapping between partial Discord IDs (kill feed keys) and full Discord IDs (player.discordId)
        // The API uses abbreviated IDs (first 8 digits) as keys in killFeeds
        const partialToFullIdMap: Record<string, string> = {};
        for (const player of players) {
          for (const partialId of Object.keys(killFeeds)) {
            // Check if the full Discord ID starts with this partial ID
            if (player.discordId.startsWith(partialId)) {
              partialToFullIdMap[partialId] = player.discordId;
              break;
            }
          }
        }
        
        // Log first team's structure
        if (i === 0 && teamIdx === 0) {
          console.log(`\n🔍 First team kill feeds structure:`);
          console.log(`  Players in team:`, players.map(p => p.discordId));
          console.log(`  Kill feed keys:`, Object.keys(killFeeds));
          console.log(`  Partial→Full ID mapping:`, partialToFullIdMap);
          console.log(`  Kill feed entry counts:`, Object.entries(killFeeds).map(([k, v]) => 
            `${k} (${partialToFullIdMap[k] || 'unmapped'}): ${(v as unknown[]).length}`
          ));
        }
        
        // Calculate individual player stats
        const playerStats = players.map(player => {
          // Find the partial ID that maps to this player
          const partialId = Object.keys(partialToFullIdMap).find(
            partial => partialToFullIdMap[partial] === player.discordId
          );
          const playerKillFeed = (partialId && killFeeds[partialId] ? killFeeds[partialId] : []) as Array<Record<string, unknown>>;
          
          // Log first team's kill feed data
          if (i === 0 && firstTeamDiscordIds.includes(player.discordId)) {
            console.log(`\n📊 Kill feed for player ${player.discordId.slice(0, 8)}:`);
            console.log(`  Total entries: ${playerKillFeed.length}`);
            console.log(`  Knocks: ${playerKillFeed.filter(k => k.knock === true).length}`);
            console.log(`  Finishes: ${playerKillFeed.filter(k => k.finish === true).length}`);
            console.log(`  First 3 entries:`, playerKillFeed.slice(0, 3));
          }
          
          // Look up player in database
          const matchedPlayer: { name: string; tier?: string } | undefined = playerLookup.get(player.discordId);
          
          // Add this player's kills to the match killfeed with all available data
          playerKillFeed.forEach(kill => {
            // The 'player' field contains the victim's Discord ID
            const victimDiscordId = kill.player as string | undefined;
            // Look up victim's name
            const victimPlayer: { name: string; tier?: string } | undefined = victimDiscordId ? playerLookup.get(victimDiscordId) : undefined;
            
            matchKillFeed.push({
              killerDiscordId: player.discordId,
              killerEpicId: player.epicId,
              killerName: matchedPlayer?.name,
              victimEpicId: victimPlayer?.name || victimDiscordId, // Show victim name or discord ID as fallback
              victimDiscordId: victimDiscordId, // Store raw victim ID for elimination calculation
              finish: kill.finish as boolean,
              knock: kill.knock as boolean,
              // Include all other fields from the killfeed
              gun: (kill.strCause || kill.gun) as string | undefined, // strCause is the weapon name
              distance: kill.distance as number | undefined,
              timestamp: kill.timestamp as string | undefined,
              time: kill.time as number | undefined,
              ...kill, // Spread to capture any other fields
            });
          });
          
          return {
            discordId: player.discordId,
            epicId: player.epicId,
            playerName: matchedPlayer?.name,
            playerTier: matchedPlayer?.tier,
            matched: !!matchedPlayer,
            eliminations: 0, // Will be calculated from killfeed
            totalKillFeedEntries: playerKillFeed.length,
          };
        });
        
        return {
          placement: entry.placement,
          teamKills: teamKillsFromMatch,
          players: playerStats,
          sumOfPlayerKills: 0, // Will be calculated from killfeed
          discrepancy: 0, // Will be calculated after processing killfeed
        };
      });
      
      // Process killfeed to calculate eliminations following Fortnite's knock/elim rules
      // Sort killfeed by time to process in chronological order
      matchKillFeed.sort((a, b) => (a.time || 0) - (b.time || 0));
      
      // Log all first-team killfeed entries with timestamps for first match
      if (i === 0) {
        console.log(`\n⏱️  ALL FIRST-TEAM KILL-FEED ENTRIES (with timestamps):`);
        const firstTeamKills = matchKillFeed.filter(k => firstTeamDiscordIds.includes(k.killerDiscordId));
        console.log(`  Total entries for first team: ${firstTeamKills.length}`);
        firstTeamKills.forEach((kill, idx) => {
          const timeInSeconds = kill.time || 0;
          const minutes = Math.floor(timeInSeconds / 60);
          const seconds = Math.floor(timeInSeconds % 60);
          const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
          const knockStr = kill.knock ? 'KNOCK' : '';
          const finishStr = kill.finish ? 'FINISH' : '';
          const actionStr = knockStr && finishStr ? 'KNOCK+FINISH' : knockStr || finishStr || 'SOLO_ELIM';
          console.log(`  ${idx + 1}. [${timeStr}] ${actionStr} - Killer: ${kill.killerDiscordId.slice(0, 8)}, Victim: ${kill.victimDiscordId?.slice(0, 8) || 'unknown'}`);
        });
      }
      
      // knockMap: victim Discord ID -> { knocker: Discord ID, timestamp: number }
      const knockMap: Record<string, { knocker: string; timestamp: number }> = {};
      // eliminations: player Discord ID -> elimination count
      const eliminations: Record<string, number> = {};
      
      // Fortnite rule: Players can only be knocked for max 45 seconds before being revived or eliminated
      const KNOCK_TIMEOUT_SECONDS = 45;
      
      // Track events for first team debugging
      const firstTeamEvents: Array<{
        time: number;
        action: string;
        killer: string;
        victim: string;
        credited: string;
      }> = [];
      
      // Process each event in chronological order
      for (const event of matchKillFeed) {
        const victim = event.victimDiscordId;
        const killer = event.killerDiscordId;
        
        // Skip events with no victim (shouldn't happen but be safe)
        if (!victim) continue;
        
        // Skip self-eliminations (storm, fall damage, etc.) - no credit
        if (killer === victim) {
          // Remove any pending knock since victim is now eliminated
          delete knockMap[victim];
          continue;
        }
        
        // Determine the action type based on knock/finish booleans
        const isKnock = event.knock && !event.finish;  // KNOCK action
        const isElim = event.finish || (!event.knock && !event.finish);  // ELIM action
        // ELIM includes:
        // - finish=true (any elimination)
        // - knock=false, finish=false (solo player elim - teammates already dead)
        
        if (isKnock) {
          // 🔥 KNOCK EVENT: Store who knocked the victim with timestamp
          // Latest knock overwrites any previous knock (handles re-knocks)
          knockMap[victim] = { knocker: killer, timestamp: event.time || 0 };
          
          // Log first team knocks
          if (i === 0 && firstTeamDiscordIds.includes(killer)) {
            firstTeamEvents.push({
              time: event.time || 0,
              action: 'KNOCK',
              killer: killer.slice(0, 8),
              victim: victim.slice(0, 8),
              credited: 'pending'
            });
          }
        } 
        else if (isElim) {
          // 🔥 ELIM EVENT: Award elimination point
          
          // Check if victim was previously knocked
          const knockData = knockMap[victim];
          if (knockData) {
            // Check if knock is still valid (< 45 seconds ago)
            const timeSinceKnock = (event.time || 0) - knockData.timestamp;
            
            if (timeSinceKnock <= KNOCK_TIMEOUT_SECONDS) {
              // A. Victim was knocked recently → credit the knocker
              const knocker = knockData.knocker;
              eliminations[knocker] = (eliminations[knocker] || 0) + 1;
              
              // Log first team eliminations
              if (i === 0 && firstTeamDiscordIds.includes(knocker)) {
                const eventType = event.knock && event.finish ? 'INSTANT_ELIM' : 
                                 event.finish ? 'FINISH_AFTER_KNOCK' : 'SOLO_ELIM_AFTER_KNOCK';
                firstTeamEvents.push({
                  time: event.time || 0,
                  action: eventType,
                  killer: killer.slice(0, 8),
                  victim: victim.slice(0, 8),
                  credited: `${knocker.slice(0, 8)} (knocker)`
                });
              }
              
              // Remove from knock map (victim is now eliminated)
              delete knockMap[victim];
            } else {
              // B. Knock is stale (>45 seconds) → victim was revived, credit the finisher
              eliminations[killer] = (eliminations[killer] || 0) + 1;
              
              // Log first team eliminations
              if (i === 0 && firstTeamDiscordIds.includes(killer)) {
                firstTeamEvents.push({
                  time: event.time || 0,
                  action: 'FINISH_AFTER_REVIVE',
                  killer: killer.slice(0, 8),
                  victim: victim.slice(0, 8),
                  credited: `${killer.slice(0, 8)} (stale knock, revived)`
                });
              }
              
              // Clear stale knock
              delete knockMap[victim];
            }
          } else {
            // C. Victim was NOT knocked → credit the eliminator
            // This covers: instant elims (knock=true, finish=true), 
            // solo player elims (knock=false, finish=false), team wipes, etc.
            eliminations[killer] = (eliminations[killer] || 0) + 1;
            
            // Log first team eliminations
            if (i === 0 && firstTeamDiscordIds.includes(killer)) {
              const eventType = event.knock && event.finish ? 'INSTANT_ELIM' : 
                               event.finish ? 'FINISH_NO_KNOCK' : 'SOLO_ELIM';
              firstTeamEvents.push({
                time: event.time || 0,
                action: eventType,
                killer: killer.slice(0, 8),
                victim: victim.slice(0, 8),
                credited: `${killer.slice(0, 8)} (eliminator)`
              });
            }
          }
        }
      }
      
      // Apply calculated eliminations to player stats
      for (const team of teams) {
        for (const player of team.players) {
          player.eliminations = eliminations[player.discordId] || 0;
        }
        team.sumOfPlayerKills = team.players.reduce((sum, p) => sum + p.eliminations, 0);
        team.discrepancy = team.teamKills - team.sumOfPlayerKills;
      }
      
      // Apply manual overrides if any exist
      const overrides = await ctx.runQuery(internal.yunite.eliminationOverrides.getMatchOverrides, {
        importId: args.importId,
        sessionId,
      });
      
      if (Object.keys(overrides).length > 0) {
        console.log(`🔧 Applying ${Object.keys(overrides).length} manual overrides for match ${sessionId}`);
        for (const team of teams) {
          for (const player of team.players) {
            if (overrides[player.discordId] !== undefined) {
              console.log(`  Overriding ${player.discordId.slice(0, 8)}: ${player.eliminations} → ${overrides[player.discordId]}`);
              player.eliminations = overrides[player.discordId];
            }
          }
          // Recalculate team totals with overrides
          team.sumOfPlayerKills = team.players.reduce((sum, p) => sum + p.eliminations, 0);
          team.discrepancy = team.teamKills - team.sumOfPlayerKills;
        }
      }
      
      // Log first match's first team for debugging
      if (i === 0 && teams.length > 0) {
        const firstTeam = teams[0];
        console.log(`\n🔍 Match 1, Team 1:`);
        console.log(`  API Team Kills: ${firstTeam.teamKills}`);
        console.log(`  Calculated Elims: ${firstTeam.sumOfPlayerKills}`);
        console.log(`  Discrepancy: ${firstTeam.discrepancy}`);
        console.log(`  Players:`, firstTeam.players.map(p => ({
          name: p.playerName || p.discordId.slice(0, 8),
          elims: p.eliminations,
          killFeedEntries: p.totalKillFeedEntries
        })));
        
        console.log(`\n🔥 First Team Events (chronological):`);
        console.log(`  Total events: ${firstTeamEvents.length}`);
        firstTeamEvents.forEach((evt, idx) => {
          const timeStr = `${Math.floor(evt.time / 60)}:${String(Math.floor(evt.time % 60)).padStart(2, '0')}`;
          console.log(`  ${idx + 1}. [${timeStr}] ${evt.action} - Killer: ${evt.killer}, Victim: ${evt.victim}, Credited: ${evt.credited}`);
        });
        
        // Log 4th place team (index 3)
        if (teams.length >= 4) {
          const fourthTeam = teams[3];
          console.log(`\n🔍 Match 1, Team 4 (4th place):`);
          console.log(`  Placement: ${fourthTeam.placement}`);
          console.log(`  API Team Kills: ${fourthTeam.teamKills}`);
          console.log(`  Calculated Elims: ${fourthTeam.sumOfPlayerKills}`);
          console.log(`  Discrepancy: ${fourthTeam.discrepancy}`);
          console.log(`  Players:`, fourthTeam.players.map(p => ({
            discordId: p.discordId.slice(0, 8),
            name: p.playerName || 'unmatched',
            elims: p.eliminations,
            killFeedEntries: p.totalKillFeedEntries
          })));
          
          // Show all killfeed entries for 4th place team
          const fourthTeamDiscordIds = fourthTeam.players.map(p => p.discordId);
          const fourthTeamKills = matchKillFeed.filter(k => fourthTeamDiscordIds.includes(k.killerDiscordId));
          console.log(`\n⏱️  4TH PLACE TEAM KILL-FEED ENTRIES:`);
          console.log(`  Total entries: ${fourthTeamKills.length}`);
          fourthTeamKills.forEach((kill, idx) => {
            const timeInSeconds = kill.time || 0;
            const minutes = Math.floor(timeInSeconds / 60);
            const seconds = Math.floor(timeInSeconds % 60);
            const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
            const knockStr = kill.knock ? 'KNOCK' : '';
            const finishStr = kill.finish ? 'FINISH' : '';
            const actionStr = knockStr && finishStr ? 'KNOCK+FINISH' : knockStr || finishStr || 'SOLO_ELIM';
            console.log(`  ${idx + 1}. [${timeStr}] ${actionStr} - Killer: ${kill.killerDiscordId.slice(0, 8)}, Victim: ${kill.victimDiscordId?.slice(0, 8) || 'unknown'}`);
          });
        }
      }
      
      matchBreakdowns.push({
        matchNumber: i + 1,
        sessionId,
        killFeed: matchKillFeed,
        teams: teams.sort((a, b) => a.placement - b.placement),
      });
    }
    
    console.log(`✅ Successfully processed ${matchBreakdowns.length} out of ${matches.length} matches`);
    
    return {
      tournamentName: importRecord.eventName,
      totalMatches: matches.length,
      matches: matchBreakdowns,
    };
  },
});
