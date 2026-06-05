"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";
import { processMatchKillCredits, extractRawKillEvents } from "./killCreditHelpers";

/**
 * Self-scheduling backfill action for kill events.
 * Processes one batch of imports, updates progress, and schedules itself for the next batch.
 * Runs entirely server-side so it doesn't depend on the client connection staying alive.
 */
export const backfillKillEventsBatch = internalAction({
  args: {
    jobId: v.id("backfillJobStatus"),
    batchSize: v.number(),
    startFromIndex: v.number(),
    forceRefresh: v.boolean(),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      // Check if job is still running (may have been cancelled)
      const job = await ctx.runQuery(
        internal.yunite.backfillJobManager.getJobById,
        { jobId: args.jobId }
      );
      if (!job || job.status !== "running") {
        console.log("Job cancelled or not found, stopping");
        return;
      }

      const yuniteApiKey = process.env.YUNITE_API_KEY;
      const yuniteGuildId = process.env.YUNITE_GUILD_ID;

      if (!yuniteApiKey || !yuniteGuildId) {
        await ctx.runMutation(
          internal.yunite.backfillJobManager.failJob,
          {
            jobId: args.jobId,
            error: "YUNITE_API_KEY and YUNITE_GUILD_ID must be set",
          }
        );
        return;
      }

      const batchSize = args.batchSize;
      const startIndex = args.startFromIndex;
      const forceRefresh = args.forceRefresh;

      console.log(
        `🔄 Batch: start=${startIndex}, size=${batchSize}, forceRefresh=${forceRefresh}`
      );

      // Get imports to process
      let importsToProcess: Array<{
        _id: Id<"thirdPartyImports">;
        leaderboardId: string;
        eventName?: string;
        matchDataSynced?: boolean;
      }>;
      let totalSynced: number;
      let alreadyProcessed: number;

      if (forceRefresh) {
        const allImports = await ctx.runQuery(
          api.yunite.fixPlacementsHelpers.getAllYuniteImports,
          {}
        );
        const syncedImports = allImports.filter(
          (imp: { matchDataSynced?: boolean }) => imp.matchDataSynced
        );
        importsToProcess = syncedImports;
        totalSynced = syncedImports.length;
        alreadyProcessed = 0;
        console.log(
          `📊 Force refresh: ${syncedImports.length} synced imports total`
        );
      } else {
        const backfillData = await ctx.runQuery(
          api.upsetKills.getImportsNeedingBackfill,
          {}
        );
        importsToProcess = backfillData.needsBackfill;
        totalSynced = backfillData.totalSynced;
        alreadyProcessed = backfillData.alreadyProcessed;
        console.log(
          `📊 ${importsToProcess.length} imports needing backfill (${alreadyProcessed} already done)`
        );
      }

      // Get current batch
      const batch = importsToProcess.slice(startIndex, startIndex + batchSize);

      if (batch.length === 0) {
        // No more work - complete the job
        console.log("✅ No more imports to process, completing job");
        await ctx.runMutation(
          internal.yunite.backfillJobManager.updateProgress,
          {
            jobId: args.jobId,
            processed: 0,
            remaining: 0,
            total: totalSynced,
            alreadyProcessed: forceRefresh ? startIndex : alreadyProcessed,
            eventsStored: 0,
            upsetsFound: 0,
            errors: [],
          }
        );
        await ctx.runMutation(
          internal.yunite.backfillJobManager.completeJob,
          { jobId: args.jobId }
        );
        // Auto-rebuild stats cache
        try {
          await ctx.runMutation(internal.upsetKills.rebuildStatsCacheInternal, {});
          console.log("📊 Stats cache rebuilt automatically");
        } catch (e) {
          console.error("Failed to auto-rebuild stats cache:", e);
        }
        return;
      }

      // Pre-fetch all players for tier lookup
      const allPlayers = (await ctx.runQuery(
        api.players.getPlayers,
      )) as import("../_generated/dataModel.d.ts").Doc<"players">[];
      const playerLookupByDiscordId = new Map<
        string,
        { playerId: Id<"players">; tier?: string }
      >(
        allPlayers
          .filter((p) => p.discordUserId)
          .map((p) => [p.discordUserId, { playerId: p._id, tier: p.tier }]),
      );

      let totalEventsStored = 0;
      let totalUpsetsFound = 0;
      const errors: Array<{ eventName: string; error: string }> = [];

      for (let i = 0; i < batch.length; i++) {
        // Re-check job status periodically (in case it was cancelled mid-batch)
        if (i > 0) {
          const currentJob = await ctx.runQuery(
            internal.yunite.backfillJobManager.getJobById,
            { jobId: args.jobId }
          );
          if (!currentJob || currentJob.status !== "running") {
            console.log("Job cancelled mid-batch, stopping");
            return;
          }
        }

        const imp = batch[i];
        const eventName = imp.eventName || "Unknown";

        console.log(
          `[${i + 1}/${batch.length}] Processing: ${eventName}`
        );

        // Add delay between API calls
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        try {
          // Extract tournament ID from leaderboardId
          const tournamentId = imp.leaderboardId.replace("yunite-", "");

          // Fetch matches for this tournament
          const matchesUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/matches`;

          let matchesResponse = await fetch(matchesUrl, {
            headers: { "Y-Api-Token": yuniteApiKey },
          });

          // Handle rate limiting with retry
          if (matchesResponse.status === 429) {
            const resetIn = matchesResponse.headers.get("Y-RateLimit-ResetIn");
            const waitTime = resetIn
              ? parseInt(resetIn) * 1000 + 500
              : 3500;
            console.log(`  ⏳ Rate limited, waiting ${waitTime}ms...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            matchesResponse = await fetch(matchesUrl, {
              headers: { "Y-Api-Token": yuniteApiKey },
            });
          }

          if (!matchesResponse.ok) {
            errors.push({
              eventName,
              error: `Failed to fetch matches: ${matchesResponse.status}`,
            });
            continue;
          }

          const matches = await matchesResponse.json();
          console.log(`  📋 Found ${matches.length} matches`);

          // Collect kill events
          type KillEventData = {
            importId: Id<"thirdPartyImports">;
            sessionId: string;
            killerDiscordId: string;
            killerPlayerId: Id<"players"> | undefined;
            killerTier: string | undefined;
            victimDiscordId: string;
            victimPlayerId: Id<"players"> | undefined;
            victimTier: string | undefined;
            eventType: "elimination" | "knock";
            weapon: string | undefined;
            timeInMatch: number | undefined;
            knockedBy: string | undefined;
          };
          const killEvents: KillEventData[] = [];

          // Process each match
          for (let m = 0; m < matches.length; m++) {
            const match = matches[m];
            const sessionId =
              match.sessionId || match.session || match.id;

            if (!sessionId) continue;

            // Add delay between match requests
            if (m > 0) {
              await new Promise((resolve) => setTimeout(resolve, 600));
            }

            const matchUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}/matches/${sessionId}`;

            let matchResponse = await fetch(matchUrl, {
              headers: { "Y-Api-Token": yuniteApiKey },
            });

            // Handle rate limiting with retry
            if (matchResponse.status === 429) {
              const resetIn =
                matchResponse.headers.get("Y-RateLimit-ResetIn");
              const waitTime = resetIn
                ? parseInt(resetIn) * 1000 + 500
                : 3500;
              console.log(
                `  ⏳ Rate limited on match ${m + 1}, waiting ${waitTime}ms...`
              );
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              matchResponse = await fetch(matchUrl, {
                headers: { "Y-Api-Token": yuniteApiKey },
              });
            }

            if (!matchResponse.ok) {
              console.warn(
                `  ⚠️ Failed to fetch match ${sessionId}: ${matchResponse.status}`
              );
              continue;
            }

            const matchData = await matchResponse.json();

            // Extract raw killfeed events (knocks + eliminations with knockedBy attribution)
            const rawEvents = extractRawKillEvents(matchData);

            // Also run original credit algorithm for upset detection
            const credits = processMatchKillCredits(matchData);
            // Build a set of credited kills for upset flagging
            const creditSet = new Set(
              credits.map(c => `${c.killerDiscordId}|${c.victimDiscordId}|${c.timeInMatch}`)
            );

            for (const rawEvt of rawEvents) {
              const killerData = playerLookupByDiscordId.get(
                rawEvt.killerDiscordId
              );
              const victimData = playerLookupByDiscordId.get(
                rawEvt.victimDiscordId
              );

              killEvents.push({
                importId: imp._id,
                sessionId,
                killerDiscordId: rawEvt.killerDiscordId,
                killerPlayerId: killerData?.playerId,
                killerTier: killerData?.tier,
                victimDiscordId: rawEvt.victimDiscordId,
                victimPlayerId: victimData?.playerId,
                victimTier: victimData?.tier,
                eventType: rawEvt.eventType,
                weapon: rawEvt.weapon,
                timeInMatch: rawEvt.timeInMatch,
                knockedBy: rawEvt.knockedBy ?? undefined,
              });
            }
          }

          // Store collected kill events
          if (killEvents.length > 0) {
            // Delete existing events first (only for force refresh)
            if (forceRefresh) {
              await ctx.runMutation(
                internal.upsetKills.deleteKillEventsForImport,
                { importId: imp._id }
              );
            }

            // Store in batches of 100
            const BATCH_SIZE = 100;
            let batchInserted = 0;
            let batchSkipped = 0;

            for (let b = 0; b < killEvents.length; b += BATCH_SIZE) {
              const eventBatch = killEvents.slice(b, b + BATCH_SIZE);
              const result = await ctx.runMutation(
                internal.upsetKills.storeKillEventsBatch,
                {
                  events: eventBatch,
                  skipDuplicateCheck: forceRefresh,
                }
              );
              batchInserted += result.inserted;
              batchSkipped += result.skipped;
            }

            // Count upsets
            const upsetCount = killEvents.filter((e) => {
              const killerNum =
                e.killerTier === "S"
                  ? 4
                  : e.killerTier === "A"
                    ? 3
                    : e.killerTier === "B"
                      ? 2
                      : e.killerTier === "C"
                        ? 1
                        : 0;
              const victimNum =
                e.victimTier === "S"
                  ? 4
                  : e.victimTier === "A"
                    ? 3
                    : e.victimTier === "B"
                      ? 2
                      : e.victimTier === "C"
                        ? 1
                        : 0;
              return killerNum > 0 && victimNum > 0 && killerNum < victimNum;
            }).length;

            totalEventsStored += batchInserted;
            totalUpsetsFound += upsetCount;

            if (batchSkipped > 0) {
              console.log(
                `  ✅ Stored ${batchInserted} events (${batchSkipped} duplicates skipped, ${upsetCount} upsets)`
              );
            } else {
              console.log(
                `  ✅ Stored ${batchInserted} events (${upsetCount} upsets)`
              );
            }
          } else {
            console.log(`  ⚠️ No kill events found`);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push({ eventName, error: errorMessage });
          console.error(`  ❌ Error: ${errorMessage}`);
        }
      }

      // Calculate remaining and update progress
      const remaining = importsToProcess.length - startIndex - batch.length;
      const newAlreadyProcessed = forceRefresh
        ? startIndex + batch.length
        : alreadyProcessed + batch.length;

      console.log(`\n✅ Batch complete!`);
      console.log(`   Processed: ${batch.length} imports`);
      console.log(`   Events stored: ${totalEventsStored}`);
      console.log(`   Upsets found: ${totalUpsetsFound}`);
      console.log(`   Errors: ${errors.length}`);
      console.log(`   Remaining: ${remaining}`);

      await ctx.runMutation(
        internal.yunite.backfillJobManager.updateProgress,
        {
          jobId: args.jobId,
          processed: batch.length,
          remaining,
          total: totalSynced,
          alreadyProcessed: newAlreadyProcessed,
          eventsStored: totalEventsStored,
          upsetsFound: totalUpsetsFound,
          errors,
        }
      );

      // Schedule next batch or complete
      if (remaining > 0) {
        // For normal backfill, always start from 0 (processed imports drop off the list)
        // For force refresh, advance the index
        const nextIndex = forceRefresh ? startIndex + batch.length : 0;

        await ctx.scheduler.runAfter(
          2000,
          internal.yunite.backfillKillEvents.backfillKillEventsBatch,
          {
            jobId: args.jobId,
            batchSize: args.batchSize,
            startFromIndex: nextIndex,
            forceRefresh: args.forceRefresh,
          }
        );
      } else {
        // All done - complete the job
        await ctx.runMutation(
          internal.yunite.backfillJobManager.completeJob,
          { jobId: args.jobId }
        );
        // Auto-rebuild stats cache
        try {
          await ctx.runMutation(internal.upsetKills.rebuildStatsCacheInternal, {});
          console.log("📊 Stats cache rebuilt automatically");
        } catch (e) {
          console.error("Failed to auto-rebuild stats cache:", e);
        }
      }
    } catch (error) {
      // Catch-all: mark job as failed so the frontend shows an error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`💥 Fatal error in backfill batch: ${errorMessage}`);

      try {
        await ctx.runMutation(
          internal.yunite.backfillJobManager.failJob,
          {
            jobId: args.jobId,
            error: `Fatal: ${errorMessage}`,
          }
        );
      } catch {
        console.error("Could not mark job as failed");
      }
    }
  },
});
