"use node";

import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";
import {
  fetchTournamentLeaderboardDescriptors,
  lookupAccountId,
  scanLeaderboardsForPlayer,
  type TournamentEarning,
} from "./osirionApi";

const LEADERBOARDS_PER_BATCH = 15;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type FetchResult = {
  success: boolean;
  error?: string;
  totalEarnings?: number;
  tournamentCount?: number;
  jobStarted?: boolean;
};

type SaveFn = (data: {
  playerId: Id<"players">;
  epicUsername: string;
  totalEarnings: number;
  tournaments: TournamentEarning[];
}) => Promise<void>;

async function ensureTournamentCache(ctx: Pick<ActionCtx, "runQuery" | "runMutation">) {
  const cache = await ctx.runQuery(internal.inGameEarnings.queries.getTournamentScanCache, {});
  const isFresh = cache && Date.now() - cache.updatedAt < CACHE_MAX_AGE_MS;

  if (isFresh && cache.leaderboards.length > 0) {
    return cache.leaderboards;
  }

  const leaderboards = await fetchTournamentLeaderboardDescriptors();
  await ctx.runMutation(internal.inGameEarnings.mutations.upsertTournamentScanCache, {
    leaderboards,
  });
  return leaderboards;
}

function finalizePlayerTournaments(partial: TournamentEarning[]): {
  tournaments: TournamentEarning[];
  totalEarnings: number;
} {
  const tournaments = [...partial].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.earnings - a.earnings;
  });
  const totalEarnings = tournaments.reduce((sum, t) => sum + t.earnings, 0);
  return { tournaments, totalEarnings };
}

// Fetch earnings for a single player via background job (Osirion API)
export const fetchPlayerEarnings = action({
  args: { epicUsername: v.string(), playerId: v.id("players") },
  handler: async (ctx, args): Promise<FetchResult> => {
    await ctx.runMutation(api.inGameEarnings.mutations.startBulkFetch, {
      playerIds: [args.playerId],
      epicUsernames: [args.epicUsername],
    });
    return {
      success: true,
      jobStarted: true,
    };
  },
});

// Process a batch of leaderboard scans (internal - called by scheduler)
export const processBatch = internalAction({
  args: { jobId: v.id("earningsFetchJob") },
  handler: async (ctx, args): Promise<void> => {
    const job = await ctx.runQuery(internal.inGameEarnings.queries.getJobById, { jobId: args.jobId });
    if (!job || job.status !== "running") {
      console.log("Job cancelled or not found, stopping");
      return;
    }

    const saveFn: SaveFn = async (data) => {
      await ctx.runMutation(api.inGameEarnings.mutations.upsertEarnings, data);
    };

    let leaderboards;
    try {
      leaderboards = await ensureTournamentCache(ctx);
    } catch (error) {
      console.error("Failed to refresh tournament cache:", error);
      await ctx.runMutation(internal.inGameEarnings.mutations.failFetchJob, {
        jobId: args.jobId,
        lastError: error instanceof Error ? error.message : "Failed to load tournament data",
      });
      return;
    }

    let remainingPlayerIds = [...job.remainingPlayerIds];
    let remainingEpicUsernames = [...job.remainingEpicUsernames];
    let currentPlayerId = job.currentPlayerId;
    let currentEpicUsername = job.currentEpicUsername;
    let scanAccountId = job.scanAccountId;
    let scanLeaderboardIndex = job.scanLeaderboardIndex ?? 0;
    let partialTournaments = job.partialTournaments ?? [];

    if (!currentPlayerId) {
      if (remainingPlayerIds.length === 0) {
        await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
          jobId: args.jobId,
          batchSucceeded: 0,
          batchFailed: 0,
          remainingPlayerIds: [],
          remainingEpicUsernames: [],
          clearCurrentPlayer: true,
        });
        return;
      }

      currentPlayerId = remainingPlayerIds.shift()!;
      currentEpicUsername = remainingEpicUsernames.shift()!;
      scanLeaderboardIndex = 0;
      partialTournaments = [];
      scanAccountId = undefined;
    }

    if (!scanAccountId && currentEpicUsername) {
      const lookup = await lookupAccountId(currentEpicUsername);
      if ("error" in lookup) {
        console.log(`Account lookup failed for ${currentEpicUsername}: ${lookup.error}`);
        await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
          jobId: args.jobId,
          batchSucceeded: 0,
          batchFailed: 1,
          remainingPlayerIds,
          remainingEpicUsernames,
          lastError: `${currentEpicUsername}: ${lookup.error}`,
          clearCurrentPlayer: true,
        });
        return;
      }
      scanAccountId = lookup.accountId;
    }

    if (!scanAccountId || !currentPlayerId || !currentEpicUsername) {
      return;
    }

    if (scanLeaderboardIndex >= leaderboards.length) {
      const { tournaments, totalEarnings } = finalizePlayerTournaments(partialTournaments);
      await saveFn({
        playerId: currentPlayerId as Id<"players">,
        epicUsername: currentEpicUsername,
        totalEarnings,
        tournaments,
      });
      console.log(`Completed ${currentEpicUsername}: $${totalEarnings} from ${tournaments.length} events`);

      const isDone = remainingPlayerIds.length === 0;
      await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
        jobId: args.jobId,
        batchSucceeded: 1,
        batchFailed: 0,
        remainingPlayerIds,
        remainingEpicUsernames,
        clearCurrentPlayer: true,
        lastError: isDone ? undefined : job.lastError,
      });
      return;
    }

    try {
      const scanResult = await scanLeaderboardsForPlayer(
        scanAccountId,
        leaderboards,
        scanLeaderboardIndex,
        LEADERBOARDS_PER_BATCH
      );

      partialTournaments = [...partialTournaments, ...scanResult.tournaments];
      scanLeaderboardIndex = scanResult.nextIndex;

      const playerComplete = scanLeaderboardIndex >= leaderboards.length;
      if (playerComplete) {
        const { tournaments, totalEarnings } = finalizePlayerTournaments(partialTournaments);
        await saveFn({
          playerId: currentPlayerId as Id<"players">,
          epicUsername: currentEpicUsername,
          totalEarnings,
          tournaments,
        });
        console.log(`Completed ${currentEpicUsername}: $${totalEarnings} from ${tournaments.length} events`);

        const isDone = remainingPlayerIds.length === 0;
        await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
          jobId: args.jobId,
          batchSucceeded: 1,
          batchFailed: 0,
          remainingPlayerIds,
          remainingEpicUsernames,
          clearCurrentPlayer: true,
          lastError: isDone ? undefined : job.lastError,
        });
        return;
      }

      await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
        jobId: args.jobId,
        batchSucceeded: 0,
        batchFailed: 0,
        remainingPlayerIds,
        remainingEpicUsernames,
        currentPlayerId,
        currentEpicUsername,
        scanAccountId,
        scanLeaderboardIndex,
        partialTournaments,
      });
    } catch (error) {
      console.error(`Scan failed for ${currentEpicUsername}:`, error);
      await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
        jobId: args.jobId,
        batchSucceeded: 0,
        batchFailed: 1,
        remainingPlayerIds,
        remainingEpicUsernames,
        lastError: `${currentEpicUsername}: ${error instanceof Error ? error.message : "Unknown error"}`,
        clearCurrentPlayer: true,
      });
    }
  },
});

// Refresh tournament scan cache (can be called from cron)
export const refreshTournamentCache = internalAction({
  args: {},
  handler: async (ctx): Promise<{ leaderboardCount: number }> => {
    const leaderboards = await fetchTournamentLeaderboardDescriptors();
    await ctx.runMutation(internal.inGameEarnings.mutations.upsertTournamentScanCache, {
      leaderboards,
    });
    return { leaderboardCount: leaderboards.length };
  },
});
