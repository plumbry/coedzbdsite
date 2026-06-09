import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import type { MutationCtx } from "../../_generated/server";

export type ContributionScorePayload = NonNullable<
  Doc<"players">["contributionScore"]
>;

export type ContributionScoreUpdateResult =
  | { action: "calculated"; score: number; matchesAnalyzed: number }
  | { action: "skipped_no_change"; score: number; matchesAnalyzed: number }
  | { action: "skipped_no_trigger" }
  | { action: "skipped_ineligible" }
  | { action: "skipped_no_match_data" }
  | { action: "skipped_not_found" };

export function contributionScorePayloadEqual(
  a: ContributionScorePayload,
  b: ContributionScorePayload,
): boolean {
  return (
    a.score === b.score &&
    a.matchesAnalyzed === b.matchesAnalyzed &&
    a.averageKillsPerMatch === b.averageKillsPerMatch &&
    a.averageDeathsPerMatch === b.averageDeathsPerMatch &&
    a.profileKillsPerMatch === b.profileKillsPerMatch &&
    a.breakdown.killShare === b.breakdown.killShare &&
    a.breakdown.top5Rate === b.breakdown.top5Rate &&
    a.breakdown.survivalRate === b.breakdown.survivalRate &&
    a.breakdown.clutchScore === b.breakdown.clutchScore
  );
}

export async function computeContributionScorePayload(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<ContributionScorePayload | null> {
  const allMatchStats = await ctx.db
    .query("matchPlayerStats")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();

  if (allMatchStats.length === 0) {
    return {
      score: 0,
      breakdown: {
        killShare: 0,
        top5Rate: 0,
        survivalRate: 0,
        clutchScore: 0,
      },
      matchesAnalyzed: 0,
      lastUpdated: Date.now(),
    };
  }

  let killShareSum = 0;
  let top5Placements = 0;
  let earlyDeathCount = 0;
  let clutchScoreSum = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let validMatches = 0;

  for (const match of allMatchStats) {
    validMatches++;
    totalKills += match.eliminations;
    totalDeaths += match.deaths;

    if (match.teamTotalKills > 0) {
      killShareSum += match.eliminations / match.teamTotalKills;
    }

    if (match.placement <= 5) {
      top5Placements++;
    }

    const teammateStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_match", (q) =>
        q.eq("importId", match.importId).eq("sessionId", match.sessionId),
      )
      .filter((q) => q.neq(q.field("playerId"), playerId))
      .collect();

    if (teammateStats.length > 0 && match.deathTime !== undefined) {
      const playerDeathTime = match.deathTime;
      const diedBeforeTeammate = teammateStats.some(
        (t) => t.deathTime !== undefined && playerDeathTime < t.deathTime,
      );
      if (diedBeforeTeammate) {
        earlyDeathCount++;
      }
    }

    if (teammateStats.length > 0) {
      const earliestTeammateDeathTime = Math.min(
        ...teammateStats
          .filter((t) => t.deathTime !== undefined)
          .map((t) => t.deathTime as number),
      );

      if (earliestTeammateDeathTime !== Infinity) {
        let timeAliveAfterTeammateDeath = 0;
        if (
          match.deathTime !== undefined &&
          match.deathTime > earliestTeammateDeathTime
        ) {
          timeAliveAfterTeammateDeath =
            match.deathTime - earliestTeammateDeathTime;
        } else if (match.deathTime === undefined) {
          timeAliveAfterTeammateDeath = 1500 - earliestTeammateDeathTime;
        }

        const clutchSurvivalScore = Math.min(
          timeAliveAfterTeammateDeath / 300,
          1.0,
        );
        clutchScoreSum += clutchSurvivalScore;
      }
    }
  }

  if (validMatches === 0) {
    return null;
  }

  const avgKillShare = killShareSum / validMatches;
  const top5Rate = top5Placements / validMatches;
  const survivalRate = 1 - earlyDeathCount / validMatches;
  const avgClutchScore = clutchScoreSum / validMatches;

  const contributionScore =
    avgKillShare * 0.25 +
    top5Rate * 0.25 +
    survivalRate * 0.25 +
    avgClutchScore * 0.25;
  const finalTC = Math.round(contributionScore * 100) / 100;
  const avgKillsPerMatch = Math.round((totalKills / validMatches) * 100) / 100;
  const avgDeathsPerMatch = Math.round((totalDeaths / validMatches) * 100) / 100;

  const thirdPartyResults = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  const eventResults = await ctx.db
    .query("eventResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  const profileTotalElims =
    thirdPartyResults.reduce((sum, e) => sum + (e.eliminations || 0), 0) +
    eventResults.reduce((sum, e) => sum + e.eliminations, 0);
  const profileTotalMatches = thirdPartyResults.reduce(
    (sum, e) => sum + (e.matchesPlayed || 0),
    0,
  );
  const profileKillsPerMatch =
    profileTotalMatches > 0
      ? Math.round((profileTotalElims / profileTotalMatches) * 100) / 100
      : avgKillsPerMatch;

  return {
    score: finalTC,
    breakdown: {
      killShare: Math.round(avgKillShare * 100) / 100,
      top5Rate: Math.round(top5Rate * 100) / 100,
      survivalRate: Math.round(survivalRate * 100) / 100,
      clutchScore: Math.round(avgClutchScore * 100) / 100,
    },
    matchesAnalyzed: validMatches,
    averageKillsPerMatch: avgKillsPerMatch,
    averageDeathsPerMatch: avgDeathsPerMatch,
    profileKillsPerMatch,
    lastUpdated: Date.now(),
  };
}

export async function computeAndStoreContributionScore(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<ContributionScoreUpdateResult> {
  const player = await ctx.db.get(playerId);
  if (!player) {
    return { action: "skipped_not_found" };
  }

  const next = await computeContributionScorePayload(ctx, playerId);
  if (!next) {
    return { action: "skipped_no_match_data" };
  }

  const existing = player.contributionScore;
  if (existing && contributionScorePayloadEqual(existing, next)) {
    return {
      action: "skipped_no_change",
      score: next.score,
      matchesAnalyzed: next.matchesAnalyzed,
    };
  }

  await ctx.db.patch(playerId, { contributionScore: next });

  return {
    action: "calculated",
    score: next.score,
    matchesAnalyzed: next.matchesAnalyzed,
  };
}

export async function maybeRecalculateContributionScore(
  ctx: MutationCtx,
  playerId: Id<"players">,
  triggers: { statsCacheChanged: boolean; matchDataChanged: boolean },
  cacheRow: Doc<"playerStatsCache"> | null,
): Promise<ContributionScoreUpdateResult> {
  if (!triggers.statsCacheChanged && !triggers.matchDataChanged) {
    return { action: "skipped_no_trigger" };
  }

  if (!cacheRow?.statsEligible) {
    return { action: "skipped_ineligible" };
  }

  const hasMatchStats = await ctx.db
    .query("matchPlayerStats")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();

  if (!hasMatchStats) {
    return { action: "skipped_no_match_data" };
  }

  return computeAndStoreContributionScore(ctx, playerId);
}
