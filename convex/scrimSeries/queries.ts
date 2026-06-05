import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.d.ts";

// ─── Public Queries ───────────────────────────────────────────────────────────

// List all series (public)
export const listSeries = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("scrimSeries").order("desc").collect();
  },
});

/** Calendar event linked via `events.linkedScrimSeriesId` (at most one). */
export const getLinkedCalendarEvent = query({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_linked_scrim_series", (q) =>
        q.eq("linkedScrimSeriesId", args.seriesId),
      )
      .first();

    if (!event) {
      return null;
    }

    return {
      _id: event._id,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      type: event.type,
    };
  },
});

// Get a single series by ID
export const getSeries = query({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.seriesId);
  },
});

// Get a single series by slug
export const getSeriesBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scrimSeries")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

// Get all players for a series
export const getPlayers = query({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scrimSeriesPlayers")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();
  },
});

// Get all scores for a series
export const getScores = query({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scrimSeriesScores")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();
  },
});

// Get all penalties for a series
export const getPenalties = query({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scrimSeriesPenalties")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();
  },
});

// Get import log for a series
export const getImportLog = query({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scrimSeriesImportLog")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .order("desc")
      .collect();
  },
});

// ─── Leaderboard Query (computed) ─────────────────────────────────────────────

type LeaderboardEntry = {
  playerId: Id<"scrimSeriesPlayers">;
  playerName: string;
  epicId: string;
  // Per-session scores: sessionScores[sessionIndex][gameIndex] = score | null
  sessionScores: (number | null)[][];
  // Total games played (non-null scores)
  gamesPlayed: number;
  // Total possible games across all sessions
  totalGames: number;
  // Sum of top N scores
  bestNTotal: number;
  // Whether player meets participation threshold
  isValid: boolean;
  // Total penalty deduction (only non-excluded penalties)
  penaltyTotal: number;
  // Number of active (non-excluded) penalties
  penaltyCount: number;
  // Final total: bestNTotal - penaltyTotal (only if valid, else 0)
  finalTotal: number;
};

export const getLeaderboard = query({
  args: { seriesId: v.id("scrimSeries") },
  handler: async (ctx, args): Promise<LeaderboardEntry[]> => {
    const series = await ctx.db.get(args.seriesId);
    if (!series) return [];

    const players = await ctx.db
      .query("scrimSeriesPlayers")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();

    const allScores = await ctx.db
      .query("scrimSeriesScores")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();

    const allPenalties = await ctx.db
      .query("scrimSeriesPenalties")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .collect();

    // Total possible games = sum of all gamesPerSession values
    const totalGames = series.gamesPerSession.reduce((sum: number, g: number) => sum + g, 0);

    // Build lookup maps
    const scoresByPlayer = new Map<Id<"scrimSeriesPlayers">, Doc<"scrimSeriesScores">[]>();
    for (const score of allScores) {
      const list = scoresByPlayer.get(score.playerId) ?? [];
      list.push(score);
      scoresByPlayer.set(score.playerId, list);
    }

    const penaltiesByPlayer = new Map<Id<"scrimSeriesPlayers">, Doc<"scrimSeriesPenalties">[]>();
    for (const penalty of allPenalties) {
      const list = penaltiesByPlayer.get(penalty.playerId) ?? [];
      list.push(penalty);
      penaltiesByPlayer.set(penalty.playerId, list);
    }

    const leaderboard: LeaderboardEntry[] = players.map((player) => {
      const playerScores = scoresByPlayer.get(player._id) ?? [];
      const playerPenalties = penaltiesByPlayer.get(player._id) ?? [];

      // Build session scores grid using variable games per session
      const sessionScores: (number | null)[][] = series.gamesPerSession.map(
        (gamesInSession: number) => Array(gamesInSession).fill(null) as (number | null)[],
      );
      for (const s of playerScores) {
        if (
          s.sessionIndex >= 0 &&
          s.sessionIndex < sessionScores.length &&
          s.gameIndex >= 0 &&
          s.gameIndex < sessionScores[s.sessionIndex].length
        ) {
          sessionScores[s.sessionIndex][s.gameIndex] = s.score;
        }
      }

      // Count games played (non-null)
      const gamesPlayed = playerScores.length;

      // Calculate Best N: sum of top N individual game scores
      const allScoreValues = playerScores.map((s) => s.score).sort((a, b) => b - a);
      const bestNTotal = allScoreValues.slice(0, series.bestN).reduce((sum: number, val: number) => sum + val, 0);

      // Participation check
      const participationPct = totalGames > 0 ? (gamesPlayed / totalGames) * 100 : 0;
      const isValid = participationPct >= series.participationThreshold;

      // Penalties (only non-excluded count) — use count * series penalty amount
      const activePenalties = playerPenalties.filter((p) => !p.excluded);
      const penaltyCount = activePenalties.length;
      const penaltyTotal = penaltyCount * series.penaltyAmount;

      // Final total: Best N minus penalties (participation is a separate metric, not used here)
      const finalTotal = bestNTotal - penaltyTotal;

      return {
        playerId: player._id,
        playerName: player.playerName,
        epicId: player.epicId,
        sessionScores,
        gamesPlayed,
        totalGames,
        bestNTotal,
        isValid,
        penaltyTotal,
        penaltyCount,
        finalTotal,
      };
    });

    // Sort by finalTotal descending, then fewer penalties as tiebreaker, then bestNTotal
    leaderboard.sort((a, b) => b.finalTotal - a.finalTotal || a.penaltyCount - b.penaltyCount || b.bestNTotal - a.bestNTotal);

    // Only show players who played at least N (bestN) games
    return leaderboard.filter((entry) => entry.gamesPlayed >= series.bestN);
  },
});
