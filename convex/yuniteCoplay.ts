import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";
import { fetchThirdPartyResultsForPlayer } from "./helpers/playerResults";
import {
  playedTogetherOnResults,
  sharedTeamRoster,
} from "./helpers/yuniteTeammates";
import { filterThirdPartyResultsToYunite } from "./lib/stats/filterYuniteResults";

function formatImportDate(importRecord: Doc<"thirdPartyImports">): string | null {
  if (importRecord.eventDate) return importRecord.eventDate;
  if (importRecord.tournamentStartedAt) {
    return importRecord.tournamentStartedAt.slice(0, 10);
  }
  return null;
}

export const getSharedYuniteResults = query({
  args: {
    player1Id: v.id("players"),
    player2Id: v.id("players"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.player1Id === args.player2Id) {
      return {
        player1: null,
        player2: null,
        sharedResults: [],
        totalCount: 0,
        error: "Select two different players.",
      };
    }

    const [player1, player2] = await Promise.all([
      ctx.db.get(args.player1Id),
      ctx.db.get(args.player2Id),
    ]);

    if (!player1 || !player2) {
      return {
        player1: null,
        player2: null,
        sharedResults: [],
        totalCount: 0,
        error: "One or both players could not be found.",
      };
    }

    const [rawResults1, rawResults2] = await Promise.all([
      fetchThirdPartyResultsForPlayer(ctx, args.player1Id),
      fetchThirdPartyResultsForPlayer(ctx, args.player2Id),
    ]);

    const [player1Results, player2Results] = await Promise.all([
      filterThirdPartyResultsToYunite(ctx, rawResults1),
      filterThirdPartyResultsToYunite(ctx, rawResults2),
    ]);

    const player2ByImport = new Map<Id<"thirdPartyImports">, Doc<"thirdPartyResults">[]>();
    for (const result of player2Results) {
      const existing = player2ByImport.get(result.importId) ?? [];
      existing.push(result);
      player2ByImport.set(result.importId, existing);
    }

    const sharedResults: Array<{
      importId: Id<"thirdPartyImports">;
      eventName: string;
      eventDate: string | null;
      leaderboardUrl: string | null;
      teamId: string | null;
      teamRoster: string[];
      player1Placement: number | null;
      player2Placement: number | null;
      player1Points: number | null;
      player2Points: number | null;
      seasonalCampaignSlug: string | null;
    }> = [];

    const seenImports = new Set<string>();

    for (const player1Result of player1Results) {
      const importKey = player1Result.importId as string;
      if (seenImports.has(importKey)) continue;

      const player2OnImport = player2ByImport.get(player1Result.importId);
      if (!player2OnImport?.length) continue;

      const player2Result = player2OnImport.find((result) =>
        playedTogetherOnResults(player1Result, result, player1, player2),
      );
      if (!player2Result) continue;

      seenImports.add(importKey);

      const importRecord = await ctx.db.get(player1Result.importId);
      if (!importRecord) continue;

      sharedResults.push({
        importId: player1Result.importId,
        eventName: importRecord.eventName,
        eventDate: formatImportDate(importRecord),
        leaderboardUrl: importRecord.leaderboardUrl ?? null,
        teamId: player1Result.teamId ?? player2Result.teamId ?? null,
        teamRoster: sharedTeamRoster(player1Result, player2Result),
        player1Placement: player1Result.placement ?? null,
        player2Placement: player2Result.placement ?? null,
        player1Points: player1Result.points ?? null,
        player2Points: player2Result.points ?? null,
        seasonalCampaignSlug: importRecord.seasonalCampaignSlug ?? null,
      });
    }

    sharedResults.sort((a, b) => {
      const dateA = a.eventDate ?? "";
      const dateB = b.eventDate ?? "";
      return dateB.localeCompare(dateA);
    });

    return {
      player1: {
        _id: player1._id,
        discordUsername: player1.discordUsername,
        epicUsername: player1.epicUsername,
      },
      player2: {
        _id: player2._id,
        discordUsername: player2.discordUsername,
        epicUsername: player2.epicUsername,
      },
      sharedResults,
      totalCount: sharedResults.length,
      error: null,
    };
  },
});
