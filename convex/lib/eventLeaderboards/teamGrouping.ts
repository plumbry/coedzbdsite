import type { Doc } from "../../_generated/dataModel.d.ts";
import type { QueryCtx } from "../../_generated/server";
import type { EventLeaderboardMember, WeeklyTeamResult } from "./types";

function placementGroupKey(result: Doc<"thirdPartyResults">): string {
  if (result.duoAssignment && result.duoAssignment !== null) {
    return `duo_${result.duoAssignment}`;
  }
  if (result.teamName) {
    return `team_${result.teamName}`;
  }
  return `placement_${result.placement}_points_${result.points}`;
}

async function enrichMember(
  ctx: QueryCtx,
  member: Doc<"thirdPartyResults">,
): Promise<EventLeaderboardMember> {
  let playerName = member.discordUsername || member.epicUsername;
  let playerId = member.playerId || null;
  let discordUsername: string | null = null;
  let tier: string | null = null;

  if (member.playerId) {
    const player = await ctx.db.get(member.playerId);
    if (player) {
      playerName = player.discordUsername;
      discordUsername = player.discordUsername;
      tier = player.tier || null;
    }
  }

  return {
    epicUsername: member.epicUsername,
    playerId,
    playerName,
    discordUsername,
    tier,
  };
}

/**
 * Group third-party results into teams for one import (weekly tab + cumulative input).
 * Uses teamId when present; otherwise duoAssignment, teamName, or placement+points.
 */
export async function groupImportResultsIntoTeams(
  ctx: QueryCtx,
  results: Doc<"thirdPartyResults">[],
): Promise<Map<string, WeeklyTeamResult>> {
  const teamStatsMap = new Map<string, WeeklyTeamResult>();

  const tempTeamMap = new Map<string, Doc<"thirdPartyResults">[]>();
  for (const result of results) {
    if (result.teamId) {
      if (!tempTeamMap.has(result.teamId)) {
        tempTeamMap.set(result.teamId, []);
      }
      tempTeamMap.get(result.teamId)!.push(result);
    }
  }

  const placementGroups = new Map<string, Doc<"thirdPartyResults">[]>();
  for (const result of results) {
    if (!result.teamId) {
      const key = placementGroupKey(result);
      if (!placementGroups.has(key)) {
        placementGroups.set(key, []);
      }
      placementGroups.get(key)!.push(result);
    }
  }

  for (const result of results) {
    let teamKey: string;
    let teamMembers: Doc<"thirdPartyResults">[];

    if (result.teamId) {
      teamKey = result.teamId;
      teamMembers = tempTeamMap.get(result.teamId) || [result];
    } else {
      const key = placementGroupKey(result);
      teamKey = `team_${key}`;
      teamMembers = placementGroups.get(key) || [result];
    }

    if (teamStatsMap.has(teamKey)) {
      continue;
    }

    const teamDisplayName = result.teamName || result.epicUsername;
    const members: EventLeaderboardMember[] = [];
    for (const member of teamMembers) {
      members.push(await enrichMember(ctx, member));
    }

    const totalTeamEliminations = teamMembers.reduce(
      (sum, member) => sum + (member.eliminations || 0),
      0,
    );

    teamStatsMap.set(teamKey, {
      teamId: result.teamId || teamKey,
      teamName: teamDisplayName,
      placement: result.placement,
      totalPoints: result.points,
      eliminations: totalTeamEliminations,
      wins: result.wins || 0,
      members,
    });
  }

  return teamStatsMap;
}

/** Per-import team map used when building cross-week cumulative standings. */
export type ImportTeamAggregate = {
  teamId: string;
  teamName: string;
  points: number;
  placement: number;
  eliminations: number;
  members: EventLeaderboardMember[];
};

export function toImportTeamAggregates(
  teams: Map<string, WeeklyTeamResult>,
): Map<string, ImportTeamAggregate> {
  const out = new Map<string, ImportTeamAggregate>();
  for (const [teamKey, team] of teams) {
    out.set(teamKey, {
      teamId: team.teamId,
      teamName: team.teamName,
      points: team.totalPoints,
      placement: team.placement,
      eliminations: team.eliminations,
      members: team.members,
    });
  }
  return out;
}
