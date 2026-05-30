import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// ─── Series CRUD ────────────────────────────────────────────────────────────

// Helper to generate URL slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const createSeries = mutation({
  args: {
    name: v.string(),
    bestN: v.number(),
    gamesPerSession: v.array(v.number()),
    penaltyAmount: v.number(),
    participationThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const slug = generateSlug(args.name);

    return await ctx.db.insert("scrimSeries", {
      name: args.name,
      slug,
      bestN: args.bestN,
      gamesPerSession: args.gamesPerSession,
      penaltyAmount: args.penaltyAmount,
      participationThreshold: args.participationThreshold,
      isActive: true,
    });
  },
});

export const updateSeries = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    name: v.optional(v.string()),
    bestN: v.optional(v.number()),
    gamesPerSession: v.optional(v.array(v.number())),
    penaltyAmount: v.optional(v.number()),
    participationThreshold: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const series = await ctx.db.get(args.seriesId);
    if (!series) {
      throw new ConvexError({ message: "Series not found", code: "NOT_FOUND" });
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      updates.name = args.name;
      updates.slug = generateSlug(args.name);
    }
    if (args.bestN !== undefined) updates.bestN = args.bestN;
    if (args.gamesPerSession !== undefined) updates.gamesPerSession = args.gamesPerSession;
    if (args.penaltyAmount !== undefined) updates.penaltyAmount = args.penaltyAmount;
    if (args.participationThreshold !== undefined) updates.participationThreshold = args.participationThreshold;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.seriesId, updates);
  },
});

export const deleteSeries = mutation({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const series = await ctx.db.get(args.seriesId);
    if (!series) {
      throw new ConvexError({ message: "Series not found", code: "NOT_FOUND" });
    }

    // Delete all related records: players, scores, penalties
    const players = await ctx.db
      .query("scrimSeriesPlayers")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();

    for (const player of players) {
      // Delete scores for this player
      const scores = await ctx.db
        .query("scrimSeriesScores")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      for (const score of scores) {
        await ctx.db.delete(score._id);
      }
      // Delete penalties for this player
      const penalties = await ctx.db
        .query("scrimSeriesPenalties")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      for (const penalty of penalties) {
        await ctx.db.delete(penalty._id);
      }
      // Delete the player record
      await ctx.db.delete(player._id);
    }

    // Delete the series itself
    await ctx.db.delete(args.seriesId);
  },
});

// ─── Player Management ──────────────────────────────────────────────────────

export const addPlayer = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    playerName: v.string(),
    epicId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const series = await ctx.db.get(args.seriesId);
    if (!series) {
      throw new ConvexError({ message: "Series not found", code: "NOT_FOUND" });
    }

    return await ctx.db.insert("scrimSeriesPlayers", {
      seriesId: args.seriesId,
      playerName: args.playerName,
      epicId: args.epicId,
    });
  },
});

export const updatePlayer = mutation({
  args: {
    playerId: v.id("scrimSeriesPlayers"),
    playerName: v.optional(v.string()),
    epicId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({ message: "Player not found", code: "NOT_FOUND" });
    }

    const updates: Record<string, unknown> = {};
    if (args.playerName !== undefined) updates.playerName = args.playerName;
    if (args.epicId !== undefined) updates.epicId = args.epicId;

    await ctx.db.patch(args.playerId, updates);
  },
});

export const removePlayer = mutation({
  args: { playerId: v.id("scrimSeriesPlayers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({ message: "Player not found", code: "NOT_FOUND" });
    }

    // Delete scores for this player
    const scores = await ctx.db
      .query("scrimSeriesScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    for (const score of scores) {
      await ctx.db.delete(score._id);
    }

    // Delete penalties for this player
    const penalties = await ctx.db
      .query("scrimSeriesPenalties")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    for (const penalty of penalties) {
      await ctx.db.delete(penalty._id);
    }

    // Delete the player
    await ctx.db.delete(args.playerId);
  },
});

// ─── Score Management ───────────────────────────────────────────────────────

export const submitScore = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    playerId: v.id("scrimSeriesPlayers"),
    sessionIndex: v.number(),
    gameIndex: v.number(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const series = await ctx.db.get(args.seriesId);
    if (!series) {
      throw new ConvexError({ message: "Series not found", code: "NOT_FOUND" });
    }

    // Validate session/game bounds
    if (args.sessionIndex < 0 || args.sessionIndex >= series.gamesPerSession.length) {
      throw new ConvexError({ message: "Invalid session index", code: "BAD_REQUEST" });
    }
    const maxGames = series.gamesPerSession[args.sessionIndex];
    if (args.gameIndex < 0 || args.gameIndex >= maxGames) {
      throw new ConvexError({ message: "Invalid game index", code: "BAD_REQUEST" });
    }

    // Check if a score already exists for this player/session/game
    const existingScores = await ctx.db
      .query("scrimSeriesScores")
      .withIndex("by_series_and_player", (q) =>
        q.eq("seriesId", args.seriesId).eq("playerId", args.playerId)
      )
      .collect();

    const existing = existingScores.find(
      (s) => s.sessionIndex === args.sessionIndex && s.gameIndex === args.gameIndex
    );

    if (existing) {
      // Update existing score
      await ctx.db.patch(existing._id, { score: args.score });
      return existing._id;
    }

    // Insert new score
    return await ctx.db.insert("scrimSeriesScores", {
      seriesId: args.seriesId,
      playerId: args.playerId,
      sessionIndex: args.sessionIndex,
      gameIndex: args.gameIndex,
      score: args.score,
    });
  },
});

// Submit a score for a player AND auto-fill the same score for all teammates (same teamId)
// in the same session/game. Only fills teammates who don't already have a score for that game.
export const submitScoreWithTeamFill = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    playerId: v.id("scrimSeriesPlayers"),
    sessionIndex: v.number(),
    gameIndex: v.number(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const series = await ctx.db.get(args.seriesId);
    if (!series) {
      throw new ConvexError({ message: "Series not found", code: "NOT_FOUND" });
    }

    if (args.sessionIndex < 0 || args.sessionIndex >= series.gamesPerSession.length) {
      throw new ConvexError({ message: "Invalid session index", code: "BAD_REQUEST" });
    }
    const maxGames = series.gamesPerSession[args.sessionIndex];
    if (args.gameIndex < 0 || args.gameIndex >= maxGames) {
      throw new ConvexError({ message: "Invalid game index", code: "BAD_REQUEST" });
    }

    // Get the player to find their teamId
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({ message: "Player not found", code: "NOT_FOUND" });
    }

    // Collect all players to update: the target player + teammates
    const playerIds = [args.playerId];
    if (player.teamId) {
      const allPlayers = await ctx.db
        .query("scrimSeriesPlayers")
        .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
        .collect();
      const teammates = allPlayers.filter(
        (p) => p._id !== args.playerId && p.teamId === player.teamId
      );
      for (const tm of teammates) {
        playerIds.push(tm._id);
      }
    }

    // For each player, upsert score for this session/game
    for (const pid of playerIds) {
      const existingScores = await ctx.db
        .query("scrimSeriesScores")
        .withIndex("by_series_and_player", (q) =>
          q.eq("seriesId", args.seriesId).eq("playerId", pid)
        )
        .collect();

      const existing = existingScores.find(
        (s) => s.sessionIndex === args.sessionIndex && s.gameIndex === args.gameIndex
      );

      if (existing) {
        // Only update if it's the original player (don't overwrite existing teammate scores)
        if (pid === args.playerId) {
          await ctx.db.patch(existing._id, { score: args.score });
        }
      } else {
        await ctx.db.insert("scrimSeriesScores", {
          seriesId: args.seriesId,
          playerId: pid,
          sessionIndex: args.sessionIndex,
          gameIndex: args.gameIndex,
          score: args.score,
        });
      }
    }
  },
});

// Bulk submit scores for a player across a session
export const submitSessionScores = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    playerId: v.id("scrimSeriesPlayers"),
    sessionIndex: v.number(),
    scores: v.array(v.object({
      gameIndex: v.number(),
      score: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const series = await ctx.db.get(args.seriesId);
    if (!series) {
      throw new ConvexError({ message: "Series not found", code: "NOT_FOUND" });
    }

    if (args.sessionIndex < 0 || args.sessionIndex >= series.gamesPerSession.length) {
      throw new ConvexError({ message: "Invalid session index", code: "BAD_REQUEST" });
    }

    const maxGames = series.gamesPerSession[args.sessionIndex];

    // Get existing scores for this player in this series
    const existingScores = await ctx.db
      .query("scrimSeriesScores")
      .withIndex("by_series_and_player", (q) =>
        q.eq("seriesId", args.seriesId).eq("playerId", args.playerId)
      )
      .collect();

    for (const { gameIndex, score } of args.scores) {
      if (gameIndex < 0 || gameIndex >= maxGames) continue;

      const existing = existingScores.find(
        (s) => s.sessionIndex === args.sessionIndex && s.gameIndex === gameIndex
      );

      if (existing) {
        await ctx.db.patch(existing._id, { score });
      } else {
        await ctx.db.insert("scrimSeriesScores", {
          seriesId: args.seriesId,
          playerId: args.playerId,
          sessionIndex: args.sessionIndex,
          gameIndex: gameIndex,
          score: score,
        });
      }
    }
  },
});

export const deleteScore = mutation({
  args: { scoreId: v.id("scrimSeriesScores") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const score = await ctx.db.get(args.scoreId);
    if (!score) {
      throw new ConvexError({ message: "Score not found", code: "NOT_FOUND" });
    }

    await ctx.db.delete(args.scoreId);
  },
});

// ─── Penalty Management ─────────────────────────────────────────────────────

export const addPenalty = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    playerId: v.id("scrimSeriesPlayers"),
    reason: v.string(),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const series = await ctx.db.get(args.seriesId);
    if (!series) {
      throw new ConvexError({ message: "Series not found", code: "NOT_FOUND" });
    }

    // Default amount to series penalty amount
    const amount = args.amount ?? series.penaltyAmount;

    return await ctx.db.insert("scrimSeriesPenalties", {
      seriesId: args.seriesId,
      playerId: args.playerId,
      reason: args.reason,
      amount,
      excluded: false,
    });
  },
});

export const updatePenalty = mutation({
  args: {
    penaltyId: v.id("scrimSeriesPenalties"),
    reason: v.optional(v.string()),
    amount: v.optional(v.number()),
    excluded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const penalty = await ctx.db.get(args.penaltyId);
    if (!penalty) {
      throw new ConvexError({ message: "Penalty not found", code: "NOT_FOUND" });
    }

    const updates: Record<string, unknown> = {};
    if (args.reason !== undefined) updates.reason = args.reason;
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.excluded !== undefined) updates.excluded = args.excluded;

    await ctx.db.patch(args.penaltyId, updates);
  },
});

export const removePenalty = mutation({
  args: { penaltyId: v.id("scrimSeriesPenalties") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const penalty = await ctx.db.get(args.penaltyId);
    if (!penalty) {
      throw new ConvexError({ message: "Penalty not found", code: "NOT_FOUND" });
    }

    await ctx.db.delete(args.penaltyId);
  },
});

// Add penalty with dedup key (used by Yunite import)
export const addPenaltyWithDedup = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    playerId: v.id("scrimSeriesPlayers"),
    reason: v.string(),
    amount: v.number(),
    dedupKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    return await ctx.db.insert("scrimSeriesPenalties", {
      seriesId: args.seriesId,
      playerId: args.playerId,
      reason: args.reason,
      amount: args.amount,
      excluded: false,
      dedupKey: args.dedupKey,
    });
  },
});

// Log a Yunite import for the import history
export const logImport = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    tournamentId: v.string(),
    sessionNumber: v.number(),
    playersUpdated: v.number(),
    penaltiesLogged: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    return await ctx.db.insert("scrimSeriesImportLog", {
      seriesId: args.seriesId,
      tournamentId: args.tournamentId,
      sessionNumber: args.sessionNumber,
      playersUpdated: args.playersUpdated,
      penaltiesLogged: args.penaltiesLogged,
      importedAt: new Date().toISOString(),
    });
  },
});

// ─── Internal: Add player from import (no auth check) ────────────────────────

export const addPlayerFromImport = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    playerName: v.string(),
    epicId: v.string(),
    teamId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scrimSeriesPlayers", {
      seriesId: args.seriesId,
      playerName: args.playerName,
      epicId: args.epicId,
      teamId: args.teamId,
    });
  },
});

// Update a player's teamId (used during import to backfill existing players)
export const updatePlayerTeamId = mutation({
  args: {
    playerId: v.id("scrimSeriesPlayers"),
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.playerId, { teamId: args.teamId });
  },
});
