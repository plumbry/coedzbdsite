import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { requireModeratorOrAdmin } from "../auth_helpers";

// Get all games for an event for duo selection
export const getEventGamesForDuoSelection = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Get all imports for this event
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("asc")
      .collect();
    
    if (imports.length === 0) {
      return [];
    }
    
    // Get all results for these imports
    const games = [];
    
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();
      
      // Group by teamId to get games
      const gamesMap = new Map<string, Array<{
        resultId: string;
        epicUsername: string;
        discordUsername: string | null;
        playerName: string;
        playerId: string | null;
        duoAssignment: "duo1" | "duo2" | null;
      }>>();
      
      for (const result of results) {
        const gameKey = result.teamId || `game_${result.placement}_${result.epicUsername}`;
        
        let playerName = result.discordUsername || result.epicUsername;
        let playerId = result.playerId || null;
        
        if (result.playerId) {
          const player = await ctx.db.get(result.playerId);
          if (player) {
            playerName = player.discordUsername;
          }
        }
        
        if (!gamesMap.has(gameKey)) {
          gamesMap.set(gameKey, []);
        }
        
        gamesMap.get(gameKey)!.push({
          resultId: result._id,
          epicUsername: result.epicUsername,
          discordUsername: result.discordUsername || null,
          playerName,
          playerId,
          duoAssignment: result.duoAssignment || null,
        });
      }
      
      // Convert to array
      for (const [gameKey, players] of gamesMap.entries()) {
        // Get game info from first player
        const firstResult = results.find(r => 
          (r.teamId || `game_${r.placement}_${r.epicUsername}`) === gameKey
        );
        
        if (firstResult) {
          games.push({
            gameKey,
            importId: imp._id,
            importName: imp.eventName,
            placement: firstResult.placement,
            points: firstResult.points,
            eliminations: firstResult.eliminations || 0,
            teamSize: players.length,
            players,
          });
        }
      }
    }
    
    return games;
  },
});

// Mark players as duo members
export const setDuoAssignment = mutation({
  args: {
    resultIds: v.array(v.id("thirdPartyResults")),
    assignment: v.union(v.literal("duo1"), v.literal("duo2"), v.null()),
  },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);
    
    // Update all specified results
    for (const resultId of args.resultIds) {
      await ctx.db.patch(resultId, {
        duoAssignment: args.assignment,
      });
    }
    
    return { success: true };
  },
});

// Clear all duo selections for an event
export const clearEventDuoSelections = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);
    
    // Get all imports for this event
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    
    // Clear duo selections for all results in these imports
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();
      
      for (const result of results) {
        if (result.duoAssignment !== undefined && result.duoAssignment !== null) {
          await ctx.db.patch(result._id, {
            duoAssignment: null,
          });
        }
      }
    }
    
    return { success: true };
  },
});

// Auto-detect duos based on game history
export const autoDetectDuos = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);
    
    // Get all imports for this event
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("asc")
      .collect();
    
    if (imports.length === 0) {
      return { success: false, message: "No imports found" };
    }
    
    // Track who plays with whom across all games
    const pairFrequency = new Map<string, number>();
    const allGames: Array<{ players: string[]; importId: Id<"thirdPartyImports">; teamId: string }> = [];
    
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();
      
      // Group by teamId
      const gamesMap = new Map<string, string[]>();
      
      for (const result of results) {
        const gameKey = result.teamId || `game_${result.placement}_${result.epicUsername}`;
        if (!gamesMap.has(gameKey)) {
          gamesMap.set(gameKey, []);
        }
        gamesMap.get(gameKey)!.push(result.epicUsername);
      }
      
      // Record each game
      for (const [teamId, players] of gamesMap.entries()) {
        allGames.push({ players, importId: imp._id, teamId });
        
        // Count all pairs in this game
        if (players.length >= 2) {
          for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
              const pair = [players[i], players[j]].sort().join("|");
              pairFrequency.set(pair, (pairFrequency.get(pair) || 0) + 1);
            }
          }
        }
      }
    }
    
    // Now identify the most frequent pairs for each player
    const playerPrimaryPartner = new Map<string, string>();
    
    for (const [pair, frequency] of pairFrequency.entries()) {
      if (frequency >= 2) {
        const [p1, p2] = pair.split("|");
        
        // Track primary partners (most frequent teammate)
        if (!playerPrimaryPartner.has(p1)) {
          playerPrimaryPartner.set(p1, p2);
        }
        if (!playerPrimaryPartner.has(p2)) {
          playerPrimaryPartner.set(p2, p1);
        }
      }
    }
    
    // Apply duo assignments to each game
    let gamesProcessed = 0;
    
    for (const game of allGames) {
      if (game.players.length < 2) continue;
      
      // Get all results for this game
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", game.importId))
        .collect();
      
      const gameResults = results.filter(r => 
        (r.teamId || `game_${r.placement}_${r.epicUsername}`) === game.teamId
      );
      
      // For squads (4 players): identify two duos
      if (game.players.length === 4) {
        const assigned = new Set<string>();
        const duo1: string[] = [];
        const duo2: string[] = [];
        
        // Find the first duo pair
        for (const player of game.players) {
          if (assigned.has(player)) continue;
          
          const partner = playerPrimaryPartner.get(player);
          if (partner && game.players.includes(partner) && !assigned.has(partner)) {
            duo1.push(player, partner);
            assigned.add(player);
            assigned.add(partner);
            break;
          }
        }
        
        // Remaining players form duo2
        for (const player of game.players) {
          if (!assigned.has(player)) {
            duo2.push(player);
          }
        }
        
        // Apply assignments
        for (const result of gameResults) {
          if (duo1.includes(result.epicUsername)) {
            await ctx.db.patch(result._id, { duoAssignment: "duo1" });
          } else if (duo2.includes(result.epicUsername)) {
            await ctx.db.patch(result._id, { duoAssignment: "duo2" });
          }
        }
        
        gamesProcessed++;
      }
      // For trios (3 players): identify one duo and one solo
      else if (game.players.length === 3) {
        const assigned = new Set<string>();
        const duo: string[] = [];
        
        // Find the duo pair
        for (const player of game.players) {
          if (assigned.has(player)) continue;
          
          const partner = playerPrimaryPartner.get(player);
          if (partner && game.players.includes(partner) && !assigned.has(partner)) {
            duo.push(player, partner);
            assigned.add(player);
            assigned.add(partner);
            break;
          }
        }
        
        // Apply assignments
        for (const result of gameResults) {
          if (duo.includes(result.epicUsername)) {
            await ctx.db.patch(result._id, { duoAssignment: "duo1" });
          } else {
            await ctx.db.patch(result._id, { duoAssignment: null });
          }
        }
        
        gamesProcessed++;
      }
    }
    
    return { success: true, gamesProcessed };
  },
});
