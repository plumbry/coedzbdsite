import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";
import { applyLinkedScrimSeries } from "../lib/scrimSeriesEventLink";

// ─── Series CRUD ────────────────────────────────────────────────────────────

// Helper to generate URL slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Create a scrim series from a calendar scrim-series event and link it (one-time). */
export const createAndLinkToEvent = mutation({
  args: {
    eventId: v.id("events"),
    bestN: v.optional(v.number()),
    seriesDurationWeeks: v.optional(v.union(v.literal(3), v.literal(6))),
    gamesPerScrim: v.optional(v.number()),
    penaltyAmount: v.optional(v.number()),
    participationThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    if (event.type !== "scrim-series") {
      throw new ConvexError({
        message: "Only scrim-series calendar events can link a series",
        code: "INVALID_TYPE",
      });
    }
    if (event.linkedScrimSeriesId) {
      throw new ConvexError({
        message: "This event already has a linked scrim series",
        code: "ALREADY_LINKED",
      });
    }

    const sessionCount =
      args.seriesDurationWeeks ?? event.seriesDurationWeeks ?? 3;
    const gamesPerScrim = args.gamesPerScrim ?? 6;
    const gamesPerSession = Array.from({ length: sessionCount }, () => gamesPerScrim);
    const bestN = args.bestN ?? event.bestNGames ?? 18;

    const eventPatches: Record<string, unknown> = {};
    if (args.bestN !== undefined) eventPatches.bestNGames = args.bestN;
    if (args.seriesDurationWeeks !== undefined) {
      eventPatches.seriesDurationWeeks = args.seriesDurationWeeks;
    }
    if (Object.keys(eventPatches).length > 0) {
      await ctx.db.patch(args.eventId, eventPatches);
    }

    const seriesId = await ctx.db.insert("scrimSeries", {
      name: event.name,
      slug: generateSlug(event.name),
      bestN,
      gamesPerSession,
      penaltyAmount: args.penaltyAmount ?? 5,
      participationThreshold: args.participationThreshold ?? 60,
      isActive: true,
    });

    await applyLinkedScrimSeries(ctx, args.eventId, seriesId);
    return seriesId;
  },
});

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

/** Bulk import scores for one game from parsed CSV rows. */
export const importSingleGameScores = mutation({
  args: {
    seriesId: v.id("scrimSeries"),
    sessionIndex: v.number(),
    gameIndex: v.number(),
    fileName: v.optional(v.string()),
    entries: v.array(
      v.object({
        epicId: v.string(),
        playerName: v.optional(v.string()),
        score: v.number(),
        teamId: v.optional(v.string()),
      }),
    ),
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

    if (args.entries.length === 0) {
      throw new ConvexError({ message: "No score entries provided", code: "BAD_REQUEST" });
    }

    const seriesPlayers = await ctx.db
      .query("scrimSeriesPlayers")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();

    const epicIdToPlayer = new Map<
      string,
      { _id: typeof seriesPlayers[number]["_id"]; playerName: string }
    >();
    for (const player of seriesPlayers) {
      epicIdToPlayer.set(player.epicId.toLowerCase(), {
        _id: player._id,
        playerName: player.playerName,
      });
    }

    let playersUpdated = 0;
    let playersAdded = 0;
    const processedEpicIds = new Set<string>();
    const affectedScores: Array<{
      scoreId: Id<"scrimSeriesScores">;
      hadPreviousScore: boolean;
      previousScore?: number;
    }> = [];

    for (const entry of args.entries) {
      const epicIdLower = entry.epicId.trim().toLowerCase();
      if (!epicIdLower || processedEpicIds.has(epicIdLower)) continue;
      processedEpicIds.add(epicIdLower);

      let matchedPlayer = epicIdToPlayer.get(epicIdLower);
      if (!matchedPlayer) {
        const playerName = entry.playerName?.trim() || entry.epicId.trim();
        const newPlayerId = await ctx.db.insert("scrimSeriesPlayers", {
          seriesId: args.seriesId,
          playerName,
          epicId: entry.epicId.trim(),
          teamId: entry.teamId,
        });
        matchedPlayer = { _id: newPlayerId, playerName };
        epicIdToPlayer.set(epicIdLower, matchedPlayer);
        playersAdded++;
      } else if (entry.teamId) {
        const existingPlayer = await ctx.db.get(matchedPlayer._id);
        if (existingPlayer && !existingPlayer.teamId) {
          await ctx.db.patch(matchedPlayer._id, { teamId: entry.teamId });
        }
      }

      const existingScores = await ctx.db
        .query("scrimSeriesScores")
        .withIndex("by_series_and_player", (q) =>
          q.eq("seriesId", args.seriesId).eq("playerId", matchedPlayer!._id),
        )
        .collect();

      const existing = existingScores.find(
        (s) =>
          s.sessionIndex === args.sessionIndex && s.gameIndex === args.gameIndex,
      );

      const hadPreviousScore = existing !== undefined;
      const previousScore = existing?.score;

      let scoreId;
      if (existing) {
        await ctx.db.patch(existing._id, { score: entry.score });
        scoreId = existing._id;
      } else {
        scoreId = await ctx.db.insert("scrimSeriesScores", {
          seriesId: args.seriesId,
          playerId: matchedPlayer._id,
          sessionIndex: args.sessionIndex,
          gameIndex: args.gameIndex,
          score: entry.score,
        });
      }

      affectedScores.push({
        scoreId,
        hadPreviousScore,
        previousScore: hadPreviousScore ? previousScore : undefined,
      });

      playersUpdated++;
    }

    await ctx.db.insert("scrimSeriesCsvImportLog", {
      seriesId: args.seriesId,
      sessionNumber: args.sessionIndex + 1,
      gameNumber: args.gameIndex + 1,
      fileName: args.fileName,
      playersUpdated,
      playersAdded,
      affectedScores,
      importedAt: new Date().toISOString(),
    });

    return {
      playersUpdated,
      playersAdded,
      sessionNumber: args.sessionIndex + 1,
      gameNumber: args.gameIndex + 1,
    };
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

// Delete a Yunite import and revert its scores/penalties for that session.
// If this is the only import for the series, all players/scores/penalties are removed too.
export const deleteImportLog = mutation({
  args: { importLogId: v.id("scrimSeriesImportLog") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const importLog = await ctx.db.get(args.importLogId);
    if (!importLog) {
      throw new ConvexError({ message: "Import not found", code: "NOT_FOUND" });
    }

    const importLogs = await ctx.db
      .query("scrimSeriesImportLog")
      .withIndex("by_series", (q) => q.eq("seriesId", importLog.seriesId))
      .collect();

    const csvImportLogs = await ctx.db
      .query("scrimSeriesCsvImportLog")
      .withIndex("by_series", (q) => q.eq("seriesId", importLog.seriesId))
      .collect();

    const isOnlyImport = importLogs.length === 1 && csvImportLogs.length === 0;

    let scoresDeleted = 0;
    let penaltiesDeleted = 0;
    let playersDeleted = 0;

    if (isOnlyImport) {
      const scores = await ctx.db
        .query("scrimSeriesScores")
        .withIndex("by_series", (q) => q.eq("seriesId", importLog.seriesId))
        .collect();
      for (const score of scores) {
        await ctx.db.delete(score._id);
        scoresDeleted++;
      }

      const penalties = await ctx.db
        .query("scrimSeriesPenalties")
        .withIndex("by_series", (q) => q.eq("seriesId", importLog.seriesId))
        .collect();
      for (const penalty of penalties) {
        await ctx.db.delete(penalty._id);
        penaltiesDeleted++;
      }

      const players = await ctx.db
        .query("scrimSeriesPlayers")
        .withIndex("by_series", (q) => q.eq("seriesId", importLog.seriesId))
        .collect();
      for (const player of players) {
        await ctx.db.delete(player._id);
        playersDeleted++;
      }
    } else {
      const sessionIndex = importLog.sessionNumber - 1;
      const penaltyPrefix = `${importLog.tournamentId}|${importLog.sessionNumber}|`;

      const hasOtherImportForSession = importLogs.some(
        (entry) => entry._id !== args.importLogId && entry.sessionNumber === importLog.sessionNumber
      );

      const penalties = await ctx.db
        .query("scrimSeriesPenalties")
        .withIndex("by_series", (q) => q.eq("seriesId", importLog.seriesId))
        .collect();

      for (const penalty of penalties) {
        if (penalty.dedupKey?.startsWith(penaltyPrefix)) {
          await ctx.db.delete(penalty._id);
          penaltiesDeleted++;
        }
      }

      if (!hasOtherImportForSession) {
        const scores = await ctx.db
          .query("scrimSeriesScores")
          .withIndex("by_series", (q) => q.eq("seriesId", importLog.seriesId))
          .collect();

        for (const score of scores) {
          if (score.sessionIndex === sessionIndex) {
            await ctx.db.delete(score._id);
            scoresDeleted++;
          }
        }
      }

      await ctx.db.delete(args.importLogId);

      return {
        success: true,
        sessionNumber: importLog.sessionNumber,
        tournamentId: importLog.tournamentId,
        scoresDeleted,
        penaltiesDeleted,
        playersDeleted,
        fullWipe: false,
        scoresKept: hasOtherImportForSession,
      };
    }

    await ctx.db.delete(args.importLogId);

    return {
      success: true,
      sessionNumber: importLog.sessionNumber,
      tournamentId: importLog.tournamentId,
      scoresDeleted,
      penaltiesDeleted,
      playersDeleted,
      fullWipe: true,
      scoresKept: false,
    };
  },
});

// Delete a CSV single-game import and revert affected scores.
export const deleteCsvImportLog = mutation({
  args: { importLogId: v.id("scrimSeriesCsvImportLog") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const importLog = await ctx.db.get(args.importLogId);
    if (!importLog) {
      throw new ConvexError({ message: "Import not found", code: "NOT_FOUND" });
    }

    let scoresReverted = 0;
    let scoresDeleted = 0;

    for (const affected of importLog.affectedScores) {
      const score = await ctx.db.get(affected.scoreId);
      if (!score) continue;

      if (affected.hadPreviousScore && affected.previousScore !== undefined) {
        await ctx.db.patch(affected.scoreId, { score: affected.previousScore });
        scoresReverted++;
      } else {
        await ctx.db.delete(affected.scoreId);
        scoresDeleted++;
      }
    }

    await ctx.db.delete(args.importLogId);

    return {
      success: true,
      sessionNumber: importLog.sessionNumber,
      gameNumber: importLog.gameNumber,
      fileName: importLog.fileName,
      scoresReverted,
      scoresDeleted,
    };
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
