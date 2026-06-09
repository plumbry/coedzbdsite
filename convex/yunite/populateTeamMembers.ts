"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";
import { yuniteFetchOrThrow, yuniteResponseJson } from "../lib/yuniteRateLimit";
import { logImportPipelineEvent } from "../lib/importPipelineLogging";
import type { Id } from "../_generated/dataModel.d.ts";

const BULK_UPDATE_CHUNK_SIZE = 100;
const DISCORD_LOOKUP_BATCH_SIZE = 75;

interface LeaderboardUser {
  discordId: string;
  epicId: string;
}

interface LeaderboardEntry {
  users?: LeaderboardUser[];
  placement: number;
}

export const populateForImportInternal = internalAction({
  args: {
    importId: v.id("thirdPartyImports"),
    jobId: v.optional(v.id("importProcessingJobs")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; updated: number }> => {
    const step = "populate_team_members";
    const pipelineStart = Date.now();

    const apiKey = process.env.YUNITE_API_KEY;
    const guildId = process.env.YUNITE_GUILD_ID;

    if (!apiKey || !guildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }

    const imp = await ctx.runQuery(api.thirdParty.getImportById, { importId: args.importId });
    if (!imp) {
      throw new Error("Import not found");
    }

    logImportPipelineEvent({
      importId: args.importId,
      jobId: args.jobId,
      step,
      message: "populate_start",
    });

    const { resultsByDiscord } = await ctx.runQuery(
      internal.yunite.populateTeamMembersHelpers.getImportResultRefsByDiscord,
      { importId: args.importId },
    );

    const tournamentId = imp.leaderboardId.replace("yunite-", "");
    const url = `https://yunite.xyz/api/v3/guild/${guildId}/tournaments/${tournamentId}/leaderboard`;

    const fetchStart = Date.now();
    const res = await yuniteFetchOrThrow(url, apiKey, {}, { skipSpacing: true });
    const data = await yuniteResponseJson<LeaderboardEntry[]>(res);
    logImportPipelineEvent({
      importId: args.importId,
      jobId: args.jobId,
      step,
      batchNumber: 0,
      rowsInBatch: data.length,
      elapsedMs: Date.now() - fetchStart,
      message: "yunite_leaderboard_fetched",
    });

    const leaderboardDiscordIds = new Set<string>();
    for (const entry of data) {
      for (const user of entry.users ?? []) {
        leaderboardDiscordIds.add(user.discordId);
      }
    }

    const discordToEpic: Record<string, string> = {};
    const discordIdList = [...leaderboardDiscordIds];
    let lookupBatchNumber = 0;
    for (let i = 0; i < discordIdList.length; i += DISCORD_LOOKUP_BATCH_SIZE) {
      lookupBatchNumber += 1;
      const chunk = discordIdList.slice(i, i + DISCORD_LOOKUP_BATCH_SIZE);
      const batchStart = Date.now();
      const lookup = await ctx.runQuery(
        internal.yunite.populateTeamMembersHelpers.lookupEpicUsernamesByDiscordIds,
        { discordIds: chunk },
      );
      Object.assign(discordToEpic, lookup.discordToEpic);
      logImportPipelineEvent({
        importId: args.importId,
        jobId: args.jobId,
        step,
        batchNumber: lookupBatchNumber,
        rowsInBatch: chunk.length,
        elapsedMs: Date.now() - batchStart,
        message: "discord_epic_lookup_batch",
      });
    }

    const updatesByResult = new Map<Id<"thirdPartyResults">, string[]>();

    for (const entry of data) {
      if (!entry.users || entry.users.length === 0) {
        continue;
      }

      const epics: string[] = [];
      for (const user of entry.users) {
        const epic = discordToEpic[user.discordId];
        if (epic) {
          epics.push(epic);
        }
      }

      for (const user of entry.users) {
        const resultRef = resultsByDiscord[user.discordId];
        if (!resultRef) {
          continue;
        }
        updatesByResult.set(resultRef.resultId, epics);
      }
    }

    const pendingUpdates = [...updatesByResult.entries()].map(([resultId, teamMembers]) => ({
      resultId,
      teamMembers,
    }));

    let updated = 0;
    let updateBatchNumber = 0;
    for (let i = 0; i < pendingUpdates.length; i += BULK_UPDATE_CHUNK_SIZE) {
      updateBatchNumber += 1;
      const chunk = pendingUpdates.slice(i, i + BULK_UPDATE_CHUNK_SIZE);
      const batchStart = Date.now();
      const result = await ctx.runMutation(
        internal.yunite.populateTeamMembersHelpers.bulkUpdateResultTeamMembers,
        { updates: chunk },
      );
      updated += result.updated;
      logImportPipelineEvent({
        importId: args.importId,
        jobId: args.jobId,
        step,
        batchNumber: updateBatchNumber,
        rowsInBatch: chunk.length,
        elapsedMs: Date.now() - batchStart,
        message: "team_members_update_batch",
      });
    }

    logImportPipelineEvent({
      importId: args.importId,
      jobId: args.jobId,
      step,
      rowsInBatch: updated,
      elapsedMs: Date.now() - pipelineStart,
      message: "populate_complete",
    });

    return { success: true, updated };
  },
});

export const populateForImport = action({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args): Promise<{ success: boolean; updated: number }> => {
    await requireAdminAction(ctx);
    return await ctx.runAction(internal.yunite.populateTeamMembers.populateForImportInternal, args);
  },
});

export const populateAllImports = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    totalImports: number;
    successCount: number;
    failureCount: number;
    totalUpdated: number;
    failedImports: string[];
  }> => {
    await requireAdminAction(ctx);

    console.log("🔄 Starting to populate team members for all Yunite imports...");

    const imports = await ctx.runQuery(api.yuniteQueries.getAllYuniteTournaments);
    console.log(`Found ${imports.length} Yunite imports`);

    let totalUpdated = 0;
    let successCount = 0;
    let failureCount = 0;
    const failedImports: string[] = [];

    for (let i = 0; i < imports.length; i++) {
      const imp = imports[i];
      console.log(`[${i + 1}/${imports.length}] ${imp.eventName}`);

      try {
        const result = await ctx.runAction(api.yunite.populateTeamMembers.populateForImport, {
          importId: imp._id,
        });

        totalUpdated += result.updated;
        successCount++;
        console.log(`  ✓ Updated ${result.updated} records`);

        if (i < imports.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`  ❌ Failed:`, error);
        failureCount++;
        failedImports.push(imp.eventName);
      }
    }

    console.log(`\n✅ Completed!`);
    console.log(`   Total: ${imports.length}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failureCount}`);
    console.log(`   Records updated: ${totalUpdated}`);

    if (failedImports.length > 0) {
      console.log(`   Failed imports:`, failedImports);
    }

    return {
      success: true,
      totalImports: imports.length,
      successCount,
      failureCount,
      totalUpdated,
      failedImports,
    };
  },
});
