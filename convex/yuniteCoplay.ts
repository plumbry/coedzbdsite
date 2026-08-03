import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";
import {
  collectDiscordIdsForPlayer,
  fetchThirdPartyResultsForPlayer,
} from "./helpers/playerResults";
import { filterThirdPartyResultsToYunite } from "./lib/stats/filterYuniteResults";
import { normalizeDiscordId } from "./lib/playerIdentity";

type TeammateCaches = {
  epicToDiscord: Map<string, string | null>;
  teamByImportTeamId: Map<string, string[]>;
};

async function resolveEpicToDiscordId(
  ctx: QueryCtx,
  epicUsername: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const key = epicUsername.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const player = await ctx.db
    .query("players")
    .withIndex("by_epic_username", (q) => q.eq("epicUsername", epicUsername))
    .first();
  const discordId = player?.discordUserId ?? null;
  cache.set(key, discordId);
  if (player?.epicUsername) {
    cache.set(player.epicUsername.trim().toLowerCase(), discordId);
  }
  return discordId;
}

async function loadTeammateDiscordIds(
  ctx: QueryCtx,
  result: Doc<"thirdPartyResults">,
  self: { discordId: string | null; epicUsername: string | null },
  caches: TeammateCaches,
): Promise<string[]> {
  if (result.teamMembers && result.teamMembers.length > 0) {
    const ids: string[] = [];
    for (const epic of result.teamMembers) {
      if (
        self.epicUsername &&
        epic.trim().toLowerCase() === self.epicUsername.trim().toLowerCase()
      ) {
        continue;
      }
      const discordId = await resolveEpicToDiscordId(ctx, epic, caches.epicToDiscord);
      if (discordId && discordId !== self.discordId) ids.push(discordId);
    }
    return [...new Set(ids)];
  }

  if (!result.teamId) return [];

  const cacheKey = `${result.importId}:${result.teamId}`;
  let teamDiscordIds = caches.teamByImportTeamId.get(cacheKey);
  if (!teamDiscordIds) {
    const importResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", result.importId))
      .collect();
    teamDiscordIds = importResults
      .filter((row) => row.teamId === result.teamId && row.discordId)
      .map((row) => row.discordId!);
    caches.teamByImportTeamId.set(cacheKey, teamDiscordIds);
  }
  return [...new Set(teamDiscordIds.filter((id) => id !== self.discordId))];
}

function epicInTeamMembers(
  teamMembers: string[] | undefined,
  epicUsername: string | undefined,
): boolean {
  if (!teamMembers?.length || !epicUsername?.trim()) return false;
  const needle = epicUsername.trim().toLowerCase();
  return teamMembers.some((member) => member.trim().toLowerCase() === needle);
}

function playerDiscordIdsInclude(
  playerDiscordIds: Set<string>,
  teammateDiscordIds: string[],
): boolean {
  return teammateDiscordIds.some((id) => playerDiscordIds.has(normalizeDiscordId(id)));
}

function playedTogetherOnImport(
  player1Result: Doc<"thirdPartyResults">,
  player2Results: Doc<"thirdPartyResults">[],
  player1: Doc<"players">,
  player2: Doc<"players">,
  player2DiscordIds: Set<string>,
  teammateDiscordIds: string[],
): boolean {
  if (
    player1Result.teamId &&
    player2Results.some((result) => result.teamId === player1Result.teamId)
  ) {
    return true;
  }

  if (epicInTeamMembers(player1Result.teamMembers, player2.epicUsername)) {
    return true;
  }

  if (
    player2Results.some((result) =>
      epicInTeamMembers(result.teamMembers, player1.epicUsername),
    )
  ) {
    return true;
  }

  return playerDiscordIdsInclude(player2DiscordIds, teammateDiscordIds);
}

function pickPlayer2Result(
  player1Result: Doc<"thirdPartyResults">,
  player2Results: Doc<"thirdPartyResults">[],
): Doc<"thirdPartyResults"> {
  if (player1Result.teamId) {
    const sameTeam = player2Results.find(
      (result) => result.teamId === player1Result.teamId,
    );
    if (sameTeam) return sameTeam;
  }
  return player2Results[0]!;
}

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

    const player2DiscordIds = new Set(
      collectDiscordIdsForPlayer(player2).map((id) => normalizeDiscordId(id)),
    );

    const caches: TeammateCaches = {
      epicToDiscord: new Map(),
      teamByImportTeamId: new Map(),
    };

    const sharedResults: Array<{
      importId: Id<"thirdPartyImports">;
      eventName: string;
      eventDate: string | null;
      leaderboardUrl: string | null;
      teamId: string | null;
      teamName: string | null;
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

      const teammateDiscordIds = await loadTeammateDiscordIds(
        ctx,
        player1Result,
        {
          discordId: player1.discordUserId,
          epicUsername: player1.epicUsername,
        },
        caches,
      );

      if (
        !playedTogetherOnImport(
          player1Result,
          player2OnImport,
          player1,
          player2,
          player2DiscordIds,
          teammateDiscordIds,
        )
      ) {
        continue;
      }

      seenImports.add(importKey);

      const importRecord = await ctx.db.get(player1Result.importId);
      if (!importRecord) continue;

      const player2Result = pickPlayer2Result(player1Result, player2OnImport);

      sharedResults.push({
        importId: player1Result.importId,
        eventName: importRecord.eventName,
        eventDate: formatImportDate(importRecord),
        leaderboardUrl: importRecord.leaderboardUrl ?? null,
        teamId: player1Result.teamId ?? player2Result.teamId ?? null,
        teamName: player1Result.teamName ?? player2Result.teamName ?? null,
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
