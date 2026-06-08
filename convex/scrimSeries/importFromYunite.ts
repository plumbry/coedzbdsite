"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";
import { yuniteFetchOrThrow } from "../lib/yuniteRateLimit";

// ─── Yunite Leaderboard Types ────────────────────────────────────────────────

interface YuniteGame {
  timestamp: string;
  score: number | null;
}

interface YuniteUser {
  epicId?: string;
  id?: string;
  name?: string;
}

interface YuniteCorrection {
  id?: string;
  amount?: number;
  reason?: string;
  timestamp?: string;
  // Target fields - if present, applies to specific player
  epicId?: string;
  userEpicId?: string;
  userId?: string;
  playerEpicId?: string;
  playerId?: string;
}

interface YuniteTeam {
  teamId?: string;
  gameList?: YuniteGame[];
  users?: YuniteUser[];
  corrections?: YuniteCorrection[];
}

/**
 * Import scores from a Yunite tournament leaderboard into a Scrim Series.
 *
 * Staff enters a Tournament ID and Session number (1–12).
 * The system fetches the Yunite leaderboard, extracts game scores for that session,
 * and upserts them into scrimSeriesScores. Penalties from Yunite corrections are
 * saved with deduplication.
 */
export const importYuniteScores = action({
  args: {
    seriesId: v.id("scrimSeries"),
    tournamentId: v.string(),
    sessionNumber: v.number(), // 1-based (1–12)
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersUpdated: number;
    playersAutoAdded: number;
    penaltiesLogged: number;
    penaltiesSkipped: number;
    message: string;
  }> => {
    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID || "1371615693392576580";

    if (!yuniteApiKey) {
      throw new Error("YUNITE_API_KEY environment variable is not set. Please add it in the Secrets tab.");
    }

    // Validate session number (1-12)
    if (args.sessionNumber < 1 || args.sessionNumber > 12) {
      throw new Error("Session number must be between 1 and 12");
    }

    // Extract UUID from tournament ID or full URL
    // Accepts: full URL like "https://yunite.xyz/leaderboard/UUID" or just "UUID"
    let tournamentId = args.tournamentId.trim();
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const uuidMatch = tournamentId.match(uuidRegex);
    if (uuidMatch) {
      tournamentId = uuidMatch[0];
    } else {
      throw new Error(
        "Invalid Tournament ID. Please enter a valid UUID or Yunite leaderboard URL."
      );
    }

    // Get the series to validate session bounds
    const series = await ctx.runQuery(api.scrimSeries.queries.getSeries, {
      seriesId: args.seriesId,
    });
    if (!series) {
      throw new Error("Series not found");
    }

    // Session index is 0-based internally
    const sessionIndex = args.sessionNumber - 1;
    if (sessionIndex >= series.gamesPerSession.length) {
      throw new Error(
        `Session ${args.sessionNumber} does not exist. This series has ${series.gamesPerSession.length} sessions.`
      );
    }

    const gamesInSession = series.gamesPerSession[sessionIndex];

    // ─── Fetch Yunite Leaderboard ─────────────────────────────────────────────

    const url = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/leaderboard`;
    console.log(`Fetching Yunite leaderboard: ${url}`);

    const response = await yuniteFetchOrThrow(url, yuniteApiKey, {}, { skipSpacing: true });

    const rawData = await response.json();

    // Normalize response: could be an array or { data: [...] }
    let teams: YuniteTeam[];
    if (Array.isArray(rawData)) {
      teams = rawData;
    } else if (rawData && Array.isArray(rawData.data)) {
      teams = rawData.data;
    } else {
      throw new Error("No teams found for that tournament ID.");
    }

    if (teams.length === 0) {
      throw new Error("No teams found for that tournament ID.");
    }

    console.log(`Found ${teams.length} teams in tournament ${tournamentId}`);

    // ─── Get existing players in series ───────────────────────────────────────

    const seriesPlayers = await ctx.runQuery(api.scrimSeries.queries.getPlayers, {
      seriesId: args.seriesId,
    });

    if (seriesPlayers.length === 0) {
      console.log("No players enrolled yet — will auto-add from Yunite data.");
    }

    console.log(`Series has ${seriesPlayers.length} enrolled players`);

    // Build epicId → player lookup (case-insensitive)
    const epicIdToPlayer = new Map<string, { _id: Id<"scrimSeriesPlayers">; playerName: string }>();
    for (const p of seriesPlayers) {
      epicIdToPlayer.set(p.epicId.toLowerCase(), { _id: p._id, playerName: p.playerName });
    }

    // ─── Get existing penalties for dedup ─────────────────────────────────────

    const existingPenalties = (await ctx.runQuery(
      api.scrimSeries.queries.getPenalties,
      { seriesId: args.seriesId },
    )) as Array<{ dedupKey?: string }>;
    const existingDedupKeys = new Set(
      existingPenalties
        .filter((p) => p.dedupKey)
        .map((p) => p.dedupKey as string),
    );

    // ─── Process teams ────────────────────────────────────────────────────────

    const processedEpicIds = new Set<string>();
    let playersUpdated = 0;
    let playersAutoAdded = 0;
    let penaltiesLogged = 0;
    let penaltiesSkipped = 0;
    const newDedupKeys = new Set<string>(); // Track keys added in this run

    for (const team of teams) {
      const users = team.users ?? [];
      if (users.length === 0) continue;

      // ─── Compute 4 game scores from gameList ──────────────────────────────

      const gameList = team.gameList ?? [];
      // Sort by timestamp ascending
      const sortedGames = [...gameList].sort((a, b) =>
        (a.timestamp || "").localeCompare(b.timestamp || "")
      );

      // Take the first N games (where N = gamesInSession)
      const gameScores: (number | null)[] = [];
      for (let i = 0; i < gamesInSession; i++) {
        if (i < sortedGames.length) {
          gameScores.push(sortedGames[i].score ?? null);
        } else {
          gameScores.push(null); // Pad with null if fewer games
        }
      }

      // ─── Process each player on this team ─────────────────────────────────

      for (const user of users) {
        const epicId = user.epicId;
        if (!epicId) continue;

        const epicIdLower = epicId.toLowerCase();

        // Dedup within one submit - only process first occurrence
        if (processedEpicIds.has(epicIdLower)) continue;
        processedEpicIds.add(epicIdLower);

        // Find matching player in the series, or auto-add them
        let matchedPlayer = epicIdToPlayer.get(epicIdLower);
        if (!matchedPlayer) {
          // Auto-add the player to the series
          const playerName = user.name || epicId;
          const newPlayerId = await ctx.runMutation(api.scrimSeries.mutations.addPlayerFromImport, {
            seriesId: args.seriesId,
            playerName,
            epicId,
            teamId: team.teamId,
          });
          matchedPlayer = { _id: newPlayerId, playerName };
          epicIdToPlayer.set(epicIdLower, matchedPlayer);
          playersAutoAdded++;
          console.log(`Auto-added player: ${playerName} (${epicId})`);
        } else if (team.teamId) {
          // Backfill teamId on existing players that don't have one
          await ctx.runMutation(api.scrimSeries.mutations.updatePlayerTeamId, {
            playerId: matchedPlayer._id,
            teamId: team.teamId,
          });
        }

        // ─── Submit scores for this player/session ────────────────────────────

        const scoresToSubmit: Array<{ gameIndex: number; score: number }> = [];
        for (let g = 0; g < gameScores.length; g++) {
          const score = gameScores[g];
          if (score !== null && score !== undefined) {
            scoresToSubmit.push({ gameIndex: g, score });
          }
        }

        if (scoresToSubmit.length > 0) {
          await ctx.runMutation(api.scrimSeries.mutations.submitSessionScores, {
            seriesId: args.seriesId,
            playerId: matchedPlayer._id,
            sessionIndex: sessionIndex,
            scores: scoresToSubmit,
          });
          playersUpdated++;
        }

        // ─── Process corrections (penalties) ──────────────────────────────────

        const corrections = team.corrections ?? [];
        for (let idx = 0; idx < corrections.length; idx++) {
          const correction = corrections[idx];

          // Check if this correction applies to this player
          const targetFields = [
            correction.epicId,
            correction.userEpicId,
            correction.userId,
            correction.playerEpicId,
            correction.playerId,
          ].filter(Boolean);

          const isTargeted = targetFields.length > 0;
          const appliesToPlayer = !isTargeted || targetFields.some(
            (t) => t?.toLowerCase() === epicIdLower || t === user.id
          );

          if (!appliesToPlayer) continue;

          // Generate correction ID for dedup
          const correctionId = correction.id
            || `${tournamentId}-${args.sessionNumber}-${team.teamId || "noteam"}-${idx}-${correction.timestamp || ""}-${(correction.reason || "").substring(0, 20)}`;

          const dedupKey = `${tournamentId}|${args.sessionNumber}|${correctionId}|${epicId}`;

          // Skip if already exists
          if (existingDedupKeys.has(dedupKey) || newDedupKeys.has(dedupKey)) {
            penaltiesSkipped++;
            continue;
          }

          // Parse amount
          let amount = series.penaltyAmount; // Default to series penalty amount
          if (correction.amount !== undefined && correction.amount !== null) {
            const parsed = Number(correction.amount);
            amount = isNaN(parsed) ? series.penaltyAmount : Math.abs(parsed);
          }

          // Insert penalty with dedup key
          await ctx.runMutation(api.scrimSeries.mutations.addPenaltyWithDedup, {
            seriesId: args.seriesId,
            playerId: matchedPlayer._id,
            reason: correction.reason || "Yunite correction",
            amount,
            dedupKey,
          });

          newDedupKeys.add(dedupKey);
          penaltiesLogged++;
        }
      }
    }

    // ─── Log the import ─────────────────────────────────────────────────────────

    await ctx.runMutation(api.scrimSeries.mutations.logImport, {
      seriesId: args.seriesId,
      tournamentId: tournamentId,
      sessionNumber: args.sessionNumber,
      playersUpdated,
      penaltiesLogged,
    });

    let message: string;
    if (playersUpdated === 0 && playersAutoAdded === 0) {
      message = `Session ${args.sessionNumber} imported for tournament ${tournamentId}, but no players were found in the Yunite data.`;
    } else {
      const parts: string[] = [];
      if (playersAutoAdded > 0) parts.push(`${playersAutoAdded} players auto-added`);
      parts.push(`${playersUpdated} players scored`);
      if (penaltiesLogged > 0) parts.push(`${penaltiesLogged} penalties`);
      if (penaltiesSkipped > 0) parts.push(`${penaltiesSkipped} penalties skipped (duplicates)`);
      message = `Session ${args.sessionNumber} imported. ${parts.join(", ")}.`;
    }

    return {
      success: true,
      playersUpdated,
      playersAutoAdded,
      penaltiesLogged,
      penaltiesSkipped,
      message,
    };
  },
});
