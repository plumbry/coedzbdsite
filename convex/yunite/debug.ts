"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";
import type { Id } from "../_generated/dataModel.d.ts";

/**
 * Fetch with automatic retry on 429 rate limit errors.
 * Uses exponential backoff starting at 2s, doubling each retry.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response;
    }

    lastResponse = response;

    if (attempt < maxRetries) {
      // Use Yunite's reset header if available, otherwise exponential backoff
      const resetIn = response.headers.get("Y-RateLimit-ResetIn");
      const waitMs = resetIn
        ? Math.max(parseInt(resetIn, 10) * 1000, 1000)
        : 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
      console.log(
        `Rate limited (429). Retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // All retries exhausted - return the last 429 response so caller can handle
  return lastResponse!;
}

/**
 * Diagnostic: Fetch the raw tournament object from Yunite API
 * and log every field so we can see what settings/details are available.
 */
export const inspectTournamentRaw = action({
  args: {
    tournamentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;

    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }

    const headers = { "Y-Api-Token": yuniteApiKey };

    // 1. Fetch single tournament detail
    const tournamentUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}`;
    console.log("Fetching tournament detail:", tournamentUrl);

    const tournamentResponse = await fetchWithRetry(tournamentUrl, { headers });

    if (!tournamentResponse.ok) {
      const errorText = await tournamentResponse.text();
      throw new Error(
        `Failed to fetch tournament: ${tournamentResponse.status} - ${errorText}`,
      );
    }

    const rawTournament = await tournamentResponse.json();

    // Log the full raw object so we can inspect every field
    console.log("=== RAW TOURNAMENT OBJECT ===");
    console.log(JSON.stringify(rawTournament, null, 2));
    console.log("=== END RAW TOURNAMENT OBJECT ===");

    // Extract all top-level keys for a quick summary
    const topLevelKeys = Object.keys(rawTournament);
    console.log("Top-level keys:", topLevelKeys.join(", "));

    // If there are nested objects, list their keys too
    const nestedSummary: Record<string, string[]> = {};
    for (const key of topLevelKeys) {
      const val = rawTournament[key];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        nestedSummary[key] = Object.keys(val);
      }
    }
    if (Object.keys(nestedSummary).length > 0) {
      console.log("Nested object keys:", JSON.stringify(nestedSummary, null, 2));
    }

    return {
      tournamentId: args.tournamentId,
      topLevelKeys,
      nestedSummary,
      raw: rawTournament,
    };
  },
});

export const fetchTournamentLeaderboard = action({
  args: {
    tournamentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }

    const headers = { "Y-Api-Token": yuniteApiKey };
    
    // Fetch tournament info (with retry)
    const tournamentUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}`;
    const tournamentResponse = await fetchWithRetry(tournamentUrl, { headers });
    
    if (!tournamentResponse.ok) {
      const errorText = await tournamentResponse.text();
      throw new Error(`Failed to fetch tournament: ${tournamentResponse.status} - ${errorText}`);
    }
    
    const tournament = await tournamentResponse.json();

    // Small gap between the two requests to ease rate pressure
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    // Fetch leaderboard (with retry)
    const leaderboardUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}/leaderboard`;
    const response = await fetchWithRetry(leaderboardUrl, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch leaderboard: ${response.status} - ${errorText}`);
    }
    
    const leaderboard = await response.json();
    
    return {
      tournamentId: args.tournamentId,
      tournamentName: tournament.name,
      tournamentStartedAt: tournament.startedAt,
      leaderboardUrl,
      totalEntries: leaderboard.length,
      leaderboard,
    };
  },
});

export const saveTournamentImport = action({
  args: {
    tournamentId: v.string(),
    tournamentName: v.string(),
    tournamentStartedAt: v.optional(v.string()),
    leaderboard: v.array(v.any()),
    fetchMatchData: v.optional(v.boolean()), // If true, fetch and aggregate match data
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    importId: Id<"thirdPartyImports">;
    playersMatched: number;
    playersUnmatched: number;
    matchesFetched?: number;
  }> => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteGuildId) {
      throw new Error("YUNITE_GUILD_ID must be set");
    }
    
    // Get current user for audit logs
    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      throw new Error("Authentication required: Please sign in to save tournament imports");
    }
    
    const currentUser: { _id: Id<"users">; name?: string; role?: string } | null = 
      await ctx.runQuery(api.users.getUserByToken, { tokenIdentifier: identity.tokenIdentifier });
    
    if (!currentUser) {
      throw new Error("User account not found: Please contact support if this issue persists");
    }
    
    // Verify admin access
    if (currentUser.role !== "admin") {
      throw new Error("Admin access required: Only administrators can use the manual import tool");
    }
    
    // Parse tournament date
    let eventDate: string;
    try {
      if (args.tournamentStartedAt && args.tournamentStartedAt.trim()) {
        eventDate = new Date(args.tournamentStartedAt).toISOString().split('T')[0];
      } else {
        eventDate = new Date().toISOString().split('T')[0];
      }
    } catch (error) {
      console.warn("Failed to parse tournament date, using current date:", error);
      eventDate = new Date().toISOString().split('T')[0];
    }
    
    const tournamentPageUrl = `https://yunite.xyz/leaderboard/${args.tournamentId}`;
    const leaderboardId = `yunite-${args.tournamentId}`;
    
    // Check if this tournament was already imported
    const existingImport = await ctx.runQuery(api.thirdParty.checkExistingImport, {
      leaderboardId,
    });
    
    if (existingImport) {
      throw new Error("This tournament has already been imported");
    }
    
    console.log("📥 Starting manual tournament import:", args.tournamentName);
    
    // Fetch match data if requested
    let matchStats: Record<string, {
      eliminations: number;
      teamKills: number;
      deaths: number;
      knocks: number;
    }> = {};
    let matchesFetched = 0;
    
    if (args.fetchMatchData && yuniteApiKey) {
      console.log("🎮 Fetching match data...");
      
      try {
        // Fetch match list
        const matchesUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}/matches`;
        const matchesResponse = await fetch(matchesUrl, {
          headers: { "Y-Api-Token": yuniteApiKey },
        });
        
        if (matchesResponse.ok) {
          const matches = await matchesResponse.json();
          console.log(`📋 Found ${matches.length} matches`);
          
          // Fetch each match's data
          for (const match of matches) {
            const sessionId = match.sessionId || match.session || match.id;
            if (!sessionId) continue;
            
            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
            
            const matchUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}/matches/${sessionId}`;
            const matchResponse = await fetch(matchUrl, {
              headers: { "Y-Api-Token": yuniteApiKey },
            });
            
            if (!matchResponse.ok) {
              console.warn(`⚠️ Failed to fetch match ${sessionId}`);
              continue;
            }
            
            const matchData = await matchResponse.json();
            matchesFetched++;
            
            // Aggregate stats per player
            for (const entry of matchData) {
              const players = entry.team?.players || [];
              const killFeeds = entry.killFeeds || {};
              const deathPositions = entry.deathPositions || {};
              
              // Calculate team kills
              let teamTotalKills = 0;
              for (const player of players) {
                if (!player.discordId) continue;
                const killFeed = killFeeds[player.discordId] || [];
                teamTotalKills += killFeed.filter((k: { finish: boolean }) => k.finish === true).length;
              }
              
              for (const player of players) {
                if (!player.discordId) continue;
                
                const killFeed = killFeeds[player.discordId] || [];
                const finishes = killFeed.filter((k: { finish: boolean }) => k.finish === true).length;
                const knocks = killFeed.filter((k: { knock: boolean; finish: boolean }) => k.knock === true && k.finish !== true).length;
                const deaths = deathPositions[player.discordId] ? 1 : 0;
                
                if (!matchStats[player.discordId]) {
                  matchStats[player.discordId] = {
                    eliminations: 0,
                    teamKills: 0,
                    deaths: 0,
                    knocks: 0,
                  };
                }
                
                matchStats[player.discordId].eliminations += finishes;
                matchStats[player.discordId].teamKills += teamTotalKills;
                matchStats[player.discordId].deaths += deaths;
                matchStats[player.discordId].knocks += knocks;
              }
            }
          }
          
          console.log(`✅ Aggregated stats from ${matchesFetched} matches for ${Object.keys(matchStats).length} players`);
        }
      } catch (error) {
        console.error("❌ Error fetching match data:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error details:", errorMessage);
        // Continue with leaderboard-only import
        console.log("⚠️ Continuing import with leaderboard data only");
      }
    }
    
    let playersMatched = 0;
    let playersUnmatched = 0;
    
    // Create import record
    const importId: Id<"thirdPartyImports"> = await ctx.runMutation(api.thirdPartyMutations.createImportRecord, {
      leaderboardUrl: tournamentPageUrl,
      leaderboardId,
      eventName: args.tournamentName,
      eventDate,
      source: "Yunite",
      importMethod: "manual",
      totalPlayers: args.leaderboard.length,
      importedBy: currentUser._id,
      importedByName: currentUser.name || "Admin",
      isManualImport: true,
      matchDataSynced: args.fetchMatchData || false,
    });
    
    // Process each leaderboard entry
    // IMPORTANT: The leaderboard array is sorted by points/score, so the array index + 1 
    // is the team's actual rank. The entry.placement field is the AVERAGE placement 
    // across matches, not their leaderboard rank.
    for (let leaderboardIndex = 0; leaderboardIndex < args.leaderboard.length; leaderboardIndex++) {
      const entry = args.leaderboard[leaderboardIndex];
      // The actual team rank is their position in the sorted leaderboard (index + 1)
      const teamRank = leaderboardIndex + 1;
      
      const isTeam = entry.users && entry.users.length > 0;
      const usersToProcess: Array<{discordId?: string, epicName?: string, eliminations?: number, kills?: number}> = [];
      
      if (isTeam && entry.users) {
        usersToProcess.push(...entry.users.map((u: { discordId: string; epicId?: string; eliminations?: number; kills?: number }) => ({ 
          discordId: u.discordId, 
          epicName: undefined,
          eliminations: u.eliminations,
          kills: u.kills
        })));
      } else {
        const epicUsername = entry.epicName || entry.username || entry.displayName;
        usersToProcess.push({ 
          discordId: entry.discordId, 
          epicName: epicUsername,
          eliminations: entry.eliminations,
          kills: entry.kills
        });
      }
      
      // Process each user in the entry
      for (const user of usersToProcess) {
        let player = null;
        let matched = false;
        let epicUsername: string | undefined = user.epicName;
        
        // Try to find player by Discord ID first
        if (user.discordId) {
          player = await ctx.runQuery(api.yunite.findPlayerByDiscordId, {
            discordUserId: user.discordId,
          });
          if (player) {
            matched = true;
            epicUsername = player.epicUsername || undefined;
          }
        }
        
        // If not found by Discord ID and we have Epic username, try that
        if (!player && user.epicName) {
          player = await ctx.runQuery(api.yunite.findPlayerByEpicUsername, {
            epicUsername: user.epicName,
          });
          matched = !!player;
          epicUsername = user.epicName;
        }
        
        if (matched) {
          playersMatched++;
        } else {
          playersUnmatched++;
        }
        
        // Get match stats if available
        const playerMatchStats = user.discordId ? matchStats[user.discordId] : undefined;
        
        const eliminationsValue = playerMatchStats?.eliminations || user.eliminations || user.kills || entry.kills || entry.eliminations || 0;
        const teamKillsValue = playerMatchStats?.teamKills || entry.kills || entry.eliminations || 0;
        const deathsValue = playerMatchStats?.deaths;
        const knocksValue = playerMatchStats?.knocks;
        const pointsValue = entry.score || entry.points || 0;
        
        // Store in thirdPartyResults for admin tournament management
        // Note: We don't create eventResults here - that's done by the auto-sync
        await ctx.runMutation(api.thirdPartyMutations.createResult, {
          importId,
          playerId: player?._id,
          eventName: args.tournamentName,
          source: "Yunite",
          leaderboardUrl: tournamentPageUrl,
          epicUsername: epicUsername || `Discord:${user.discordId}`,
          discordUsername: undefined,
          discordId: user.discordId,
          placement: teamRank,
          points: pointsValue,
          eliminations: eliminationsValue,
          teamKills: teamKillsValue,
          deaths: deathsValue,
          knocks: knocksValue,
          damage: undefined,
          teamId: entry.teamId,
          teamName: entry.teamName,
          matched,
        });
      }
    }
    
    // Update import record with match counts
    await ctx.runMutation(api.thirdPartyMutations.updateImportMatchCounts, {
      importId,
      playersMatched,
      playersUnmatched,
    });
    
    console.log("✅ Import complete:", { playersMatched, playersUnmatched, matchesFetched });
    
    return {
      success: true,
      importId,
      playersMatched,
      playersUnmatched,
      matchesFetched: args.fetchMatchData ? matchesFetched : undefined,
    };
  },
});

export const fetchTournamentMatches = action({
  args: {
    tournamentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }
    
    const matchesUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}/matches`;
    
    const response = await fetch(matchesUrl, {
      headers: {
        "Y-Api-Token": yuniteApiKey,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch matches: ${response.status} - ${errorText}`);
    }
    
    const matches = await response.json();

    // Log the full raw match list so we can see all available fields
    console.log("=== RAW MATCHES LIST ===");
    console.log(JSON.stringify(matches, null, 2));
    console.log("=== END RAW MATCHES LIST ===");
    if (matches.length > 0) {
      console.log("Match object keys:", Object.keys(matches[0]).join(", "));
    }
    
    return {
      tournamentId: args.tournamentId,
      matchesUrl,
      totalMatches: matches.length,
      matches,
    };
  },
});

export const fetchMatchData = action({
  args: {
    tournamentId: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;
    
    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }
    
    const matchUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${args.tournamentId}/matches/${args.sessionId}`;
    
    const response = await fetch(matchUrl, {
      headers: {
        "Y-Api-Token": yuniteApiKey,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch match data: ${response.status} - ${errorText}`);
    }
    
    const matchData = await response.json();
    
    // Parse killFeeds to show per-player stats
    const playerStats: Record<string, { finishes: number; knocks: number; total: number }> = {};
    
    for (const entry of matchData) {
      const players = entry.team?.players || [];
      const killFeeds = entry.killFeeds || {};
      
      for (const player of players) {
        if (!player.discordId) continue;
        
        const killFeed = killFeeds[player.discordId] || [];
        const finishes = killFeed.filter((k: { finish: boolean }) => k.finish === true).length;
        const knocks = killFeed.filter((k: { knock: boolean; finish: boolean }) => k.knock === true && k.finish !== true).length;
        
        playerStats[player.discordId] = {
          finishes,
          knocks,
          total: killFeed.length,
        };
      }
    }
    
    return {
      tournamentId: args.tournamentId,
      sessionId: args.sessionId,
      matchUrl,
      totalTeams: matchData.length,
      matchData,
      playerStats,
    };
  },
});
