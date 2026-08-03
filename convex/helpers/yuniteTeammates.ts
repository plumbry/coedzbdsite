import type { Doc } from "../_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "../_generated/server.d.ts";

export function normalizeEpic(epic: string): string {
  return epic.trim().toLowerCase();
}

export function epicLabelsForResult(
  result: Pick<Doc<"thirdPartyResults">, "epicUsername">,
  player: Pick<Doc<"players">, "epicUsername">,
): string[] {
  const labels = new Set<string>();
  for (const epic of [result.epicUsername, player.epicUsername]) {
    if (epic?.trim()) {
      labels.add(normalizeEpic(epic));
    }
  }
  return [...labels];
}

export function teamMemberSet(teamMembers: string[] | undefined): Set<string> {
  return new Set((teamMembers ?? []).map(normalizeEpic));
}

export function playerOnRoster(
  result: Pick<Doc<"thirdPartyResults">, "epicUsername">,
  player: Pick<Doc<"players">, "epicUsername">,
  roster: Set<string>,
): boolean {
  return epicLabelsForResult(result, player).some((label) => roster.has(label));
}

/** True when two result rows are on the same Yunite team for an import. */
export function playedTogetherOnResults(
  player1Result: Doc<"thirdPartyResults">,
  player2Result: Doc<"thirdPartyResults">,
  player1: Doc<"players">,
  player2: Doc<"players">,
): boolean {
  const teamId1 = player1Result.teamId?.trim();
  const teamId2 = player2Result.teamId?.trim();

  if (teamId1 && teamId2) {
    return teamId1 === teamId2;
  }

  if (teamId1 || teamId2) {
    return false;
  }

  const roster1 = teamMemberSet(player1Result.teamMembers);
  const roster2 = teamMemberSet(player2Result.teamMembers);

  if (roster1.size === 0 || roster2.size === 0 || roster1.size !== roster2.size) {
    return false;
  }

  for (const epic of roster1) {
    if (!roster2.has(epic)) {
      return false;
    }
  }

  return (
    playerOnRoster(player1Result, player1, roster1) &&
    playerOnRoster(player2Result, player2, roster1)
  );
}

export function sharedTeamRoster(
  player1Result: Doc<"thirdPartyResults">,
  player2Result: Doc<"thirdPartyResults">,
): string[] {
  const roster =
    (player1Result.teamMembers?.length ?? 0) >= (player2Result.teamMembers?.length ?? 0)
      ? player1Result.teamMembers
      : player2Result.teamMembers;
  return roster ?? [];
}

export async function resolveEpicToDiscordId(
  ctx: QueryCtx | MutationCtx,
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

type TeammateLookupCaches = {
  epicToDiscord: Map<string, string | null>;
  teamByImportTeamId: Map<string, string[]>;
};

/** Teammate Discord IDs for one import result row (Summer Slam quests + coplay). */
export async function loadTeammateDiscordIdsForResult(
  ctx: QueryCtx | MutationCtx,
  result: Doc<"thirdPartyResults">,
  player: Pick<Doc<"players">, "discordUserId" | "epicUsername">,
  caches: TeammateLookupCaches,
): Promise<string[]> {
  const selfLabels = new Set(epicLabelsForResult(result, player));

  if (result.teamMembers && result.teamMembers.length > 0) {
    const ids: string[] = [];
    for (const epic of result.teamMembers) {
      if (selfLabels.has(normalizeEpic(epic))) continue;
      const discordId = await resolveEpicToDiscordId(ctx, epic, caches.epicToDiscord);
      if (discordId && discordId !== player.discordUserId) ids.push(discordId);
    }
    return [...new Set(ids)];
  }

  const teamId = result.teamId?.trim();
  if (!teamId) return [];

  const cacheKey = `${result.importId}:${teamId}`;
  let teamDiscordIds = caches.teamByImportTeamId.get(cacheKey);
  if (!teamDiscordIds) {
    const importResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", result.importId))
      .collect();
    teamDiscordIds = importResults
      .filter((row) => row.teamId?.trim() === teamId && row.discordId)
      .map((row) => row.discordId!);
    caches.teamByImportTeamId.set(cacheKey, teamDiscordIds);
  }
  return [...new Set(teamDiscordIds.filter((id) => id !== player.discordUserId))];
}

export type { TeammateLookupCaches };
