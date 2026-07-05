"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import {
  extractTournamentIdFromLeaderboardId,
  extractTournamentIdFromUrl,
  yuniteStartFieldsFromTournament,
  type YuniteTournamentMetadataLike,
} from "../lib/yunite";
import { yuniteFetch, yuniteFetchOrThrow } from "../lib/yuniteRateLimit";

const BATCH_SIZE = 5;

type BackfillBatchResult = {
  success: boolean;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  nextIndex: number | null;
  isComplete: boolean;
  totalImports: number;
  errors: Array<{ importName: string; error: string }>;
};

function tournamentIdForImport(importRecord: {
  leaderboardId: string;
  leaderboardUrl: string;
}): string | null {
  return (
    extractTournamentIdFromLeaderboardId(importRecord.leaderboardId) ??
    extractTournamentIdFromUrl(importRecord.leaderboardUrl)
  );
}

/**
 * Backfill `tournamentStartedAt` from the Yunite API for imports missing it.
 * Processes in small batches; call repeatedly until `isComplete` is true.
 */
export const backfillTournamentStartedAtBatch = action({
  args: {
    startIndex: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BackfillBatchResult> => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;

    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }

    const startIndex = args.startIndex ?? 0;
    const allImports: Doc<"thirdPartyImports">[] = await ctx.runQuery(
      api.yunite.backfillTournamentStartedAtHelpers.listImportsMissingTournamentStartedAt,
      {},
    );
    const totalImports = allImports.length;

    if (startIndex >= totalImports) {
      return {
        success: true,
        processed: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        nextIndex: null,
        isComplete: true,
        totalImports,
        errors: [] as Array<{ importName: string; error: string }>,
      };
    }

    const endIndex = Math.min(startIndex + BATCH_SIZE, totalImports);
    const batchImports = allImports.slice(startIndex, endIndex);

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ importName: string; error: string }> = [];

    for (const importRecord of batchImports) {
      processed++;

      const tournamentId = tournamentIdForImport(importRecord);
      if (!tournamentId) {
        skipped++;
        errors.push({
          importName: importRecord.eventName,
          error: "Could not resolve Yunite tournament ID",
        });
        continue;
      }

      try {
        const tournamentUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}`;
        const response = await yuniteFetch(tournamentUrl, yuniteApiKey);

        if (response.status === 429) {
          failed++;
          errors.push({
            importName: importRecord.eventName,
            error: "Rate limited",
          });
          continue;
        }

        if (!response.ok) {
          failed++;
          errors.push({
            importName: importRecord.eventName,
            error: `Yunite API ${response.status}`,
          });
          continue;
        }

        const tournament = (await response.json()) as YuniteTournamentMetadataLike;
        const { eventDate, tournamentStartedAt } =
          yuniteStartFieldsFromTournament(tournament);

        if (!tournamentStartedAt) {
          skipped++;
          errors.push({
            importName: importRecord.eventName,
            error: "Tournament has no start date in Yunite",
          });
          continue;
        }

        await ctx.runMutation(
          internal.yunite.backfillTournamentStartedAtHelpers.setTournamentStartedAt,
          {
            importId: importRecord._id,
            tournamentStartedAt,
            eventDate,
          },
        );
        updated++;
      } catch (error) {
        failed++;
        errors.push({
          importName: importRecord.eventName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const nextIndex = endIndex < totalImports ? endIndex : null;

    return {
      success: true,
      processed,
      updated,
      skipped,
      failed,
      nextIndex,
      isComplete: nextIndex === null,
      totalImports,
      errors,
    };
  },
});

/** Backfill a single import by ID (admin tool). */
export const backfillTournamentStartedAtForImport = action({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    updated: boolean;
    tournamentStartedAt: string;
    eventDate?: string;
    message: string;
  }> => {
    await requireAdminAction(ctx);

    const yuniteApiKey = process.env.YUNITE_API_KEY;
    const yuniteGuildId = process.env.YUNITE_GUILD_ID;

    if (!yuniteApiKey || !yuniteGuildId) {
      throw new Error("YUNITE_API_KEY and YUNITE_GUILD_ID must be set");
    }

    const importRecord: {
      _id: Id<"thirdPartyImports">;
      leaderboardId: string;
      leaderboardUrl: string;
      tournamentStartedAt?: string;
    } | null = await ctx.runQuery(api.thirdParty.getImportById, {
      importId: args.importId,
    });

    if (!importRecord) {
      throw new Error("Import not found");
    }

    if (importRecord.tournamentStartedAt?.trim()) {
      return {
        updated: false,
        tournamentStartedAt: importRecord.tournamentStartedAt,
        message: "Import already has tournamentStartedAt",
      };
    }

    const tournamentId = tournamentIdForImport(importRecord);
    if (!tournamentId) {
      throw new Error("Could not resolve Yunite tournament ID for this import");
    }

    const tournamentUrl = `https://yunite.xyz/api/v3/guild/${yuniteGuildId}/tournaments/${tournamentId}`;
    const response = await yuniteFetchOrThrow(tournamentUrl, yuniteApiKey, {}, {
      skipSpacing: true,
    });
    const tournament = (await response.json()) as YuniteTournamentMetadataLike;
    const { eventDate, tournamentStartedAt } =
      yuniteStartFieldsFromTournament(tournament);

    if (!tournamentStartedAt) {
      throw new Error("Tournament has no start date in Yunite");
    }

    await ctx.runMutation(
      internal.yunite.backfillTournamentStartedAtHelpers.setTournamentStartedAt,
      {
        importId: args.importId,
        tournamentStartedAt,
        eventDate,
      },
    );

    return {
      updated: true,
      tournamentStartedAt,
      eventDate,
      message: "Backfilled tournamentStartedAt from Yunite",
    };
  },
});
