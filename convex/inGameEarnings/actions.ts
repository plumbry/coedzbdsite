"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";

const BATCH_SIZE = 8; // Stay under 10 calls/min rate limit

interface CitoTournament {
  name: string;
  placement: number;
  earnings: number;
  date: string;
}

interface CitoPlayerResponse {
  data?: {
    id?: string;
    name?: string;
    country?: string;
    totalEarnings?: number;
    tournaments?: CitoTournament[];
  };
  error?: string;
}

type FetchResult = { success: boolean; error?: string; totalEarnings?: number; tournamentCount?: number };

type SaveFn = (data: {
  playerId: Id<"players">;
  epicUsername: string;
  totalEarnings: number;
  tournaments: Array<{ name: string; placement: number; earnings: number; date: string }>;
}) => Promise<void>;

// Shared fetch logic
async function fetchFromCitoAPI(
  saveFn: SaveFn,
  epicUsername: string,
  playerId: Id<"players">
): Promise<FetchResult> {
  const apiKey = process.env.CITO_API_KEY;
  if (!apiKey) {
    return { success: false, error: "CITO_API_KEY secret is not set" };
  }

  try {
    const encodedName = encodeURIComponent(epicUsername);
    const url = `https://api.citoapi.com/api/v1/fortnite/players/${encodedName}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Cito API ${response.status}:`, errorText);

      if (response.status === 404) {
        return { success: false, error: "Player not found on Cito API" };
      }
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Cito API authentication failed. Check your API key." };
      }
      if (response.status === 429) {
        return { success: false, error: "Rate limit reached. Try again later." };
      }
      return { success: false, error: `Cito API error (${response.status})` };
    }

    const result: CitoPlayerResponse = await response.json();
    const data = result.data ?? result;

    const totalEarnings = (data as Record<string, unknown>).totalEarnings as number | undefined ?? 0;
    const rawTournaments = (data as Record<string, unknown>).tournaments as CitoTournament[] | undefined ?? [];

    const tournaments = rawTournaments.map((t: CitoTournament) => ({
      name: t.name || "Unknown Event",
      placement: t.placement || 0,
      earnings: t.earnings || 0,
      date: t.date || "",
    }));

    await saveFn({ playerId, epicUsername, totalEarnings, tournaments });

    return { success: true, totalEarnings, tournamentCount: tournaments.length };
  } catch (error) {
    console.error("Cito API error:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch earnings" };
  }
}

// Fetch earnings for a single player from Cito API (public - for individual refresh)
export const fetchPlayerEarnings = action({
  args: { epicUsername: v.string(), playerId: v.id("players") },
  handler: async (ctx, args): Promise<FetchResult> => {
    const saveFn: SaveFn = async (data) => {
      await ctx.runMutation(api.inGameEarnings.mutations.upsertEarnings, data);
    };
    return await fetchFromCitoAPI(saveFn, args.epicUsername, args.playerId);
  },
});

// Process a batch of players (internal - called by scheduler)
export const processBatch = internalAction({
  args: { jobId: v.id("earningsFetchJob") },
  handler: async (ctx, args): Promise<void> => {
    // Read current job state
    const job = await ctx.runQuery(internal.inGameEarnings.queries.getJobById, { jobId: args.jobId });
    if (!job || job.status !== "running") {
      console.log("Job cancelled or not found, stopping");
      return;
    }

    const playerIds = job.remainingPlayerIds;
    const epicUsernames = job.remainingEpicUsernames;

    if (playerIds.length === 0) {
      await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
        jobId: args.jobId,
        batchSucceeded: 0,
        batchFailed: 0,
        remainingPlayerIds: [],
        remainingEpicUsernames: [],
      });
      return;
    }

    // Take the next batch
    const batchPlayerIds = playerIds.slice(0, BATCH_SIZE);
    const batchEpicUsernames = epicUsernames.slice(0, BATCH_SIZE);
    const remainingPlayerIds = playerIds.slice(BATCH_SIZE);
    const remainingEpicUsernames = epicUsernames.slice(BATCH_SIZE);

    let batchSucceeded = 0;
    let batchFailed = 0;
    let lastError: string | undefined;

    const saveFn: SaveFn = async (data) => {
      await ctx.runMutation(api.inGameEarnings.mutations.upsertEarnings, data);
    };

    for (let i = 0; i < batchPlayerIds.length; i++) {
      const playerId = batchPlayerIds[i] as Id<"players">;
      const epicUsername = batchEpicUsernames[i];

      try {
        const result = await fetchFromCitoAPI(saveFn, epicUsername, playerId);
        if (result.success) {
          batchSucceeded++;
          console.log(`[${batchSucceeded + batchFailed}/${batchPlayerIds.length}] ${epicUsername}: $${result.totalEarnings}`);
        } else {
          batchFailed++;
          lastError = `${epicUsername}: ${result.error}`;
          console.log(`[${batchSucceeded + batchFailed}/${batchPlayerIds.length}] ${epicUsername}: FAILED - ${result.error}`);
        }
      } catch (err) {
        batchFailed++;
        lastError = `${epicUsername}: ${err instanceof Error ? err.message : "Unknown error"}`;
        console.error(`Error fetching ${epicUsername}:`, err);
      }
    }

    // Update job progress and schedule next batch
    await ctx.runMutation(internal.inGameEarnings.mutations.updateJobProgress, {
      jobId: args.jobId,
      batchSucceeded,
      batchFailed,
      remainingPlayerIds,
      remainingEpicUsernames,
      lastError,
    });
  },
});
