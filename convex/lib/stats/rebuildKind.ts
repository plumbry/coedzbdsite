export const PLAYER_STATS_REBUILD_KINDS = [
  "full",
  "through_tier_eval",
  "event_participation",
  "tc_dca",
  "top_five",
  "tier_eval",
  "aggregate_stats",
] as const;

export type PlayerStatsRebuildKind = (typeof PLAYER_STATS_REBUILD_KINDS)[number];

export function resolvePlayerStatsRebuildKind(args: {
  tierEvalOnly?: boolean;
  tcDcaOnly?: boolean;
  topFiveOnly?: boolean;
  aggregateStatsOnly?: boolean;
  stopAfterPhase?: string;
  includeAggregateStats?: boolean;
}): PlayerStatsRebuildKind {
  if (args.tierEvalOnly) return "tier_eval";
  if (args.tcDcaOnly) return "tc_dca";
  if (args.topFiveOnly) return "top_five";
  if (args.aggregateStatsOnly) return "aggregate_stats";
  if (args.stopAfterPhase === "event_participation") return "event_participation";
  if (args.includeAggregateStats === false) return "through_tier_eval";
  return "full";
}

export function rebuildKindLabel(kind: PlayerStatsRebuildKind): string {
  switch (kind) {
    case "full":
      return "Full player stats rebuild";
    case "through_tier_eval":
      return "Rebuild through tier evaluation";
    case "event_participation":
      return "Yunite event count sync";
    case "tc_dca":
      return "TC/DCA rebuild";
    case "top_five":
      return "Top 5 cache rebuild";
    case "tier_eval":
      return "Tier-eval cache rebuild";
    case "aggregate_stats":
      return "Population average stats rebuild";
  }
}

/** True for the canonical post-migration full pipeline (includes population averages). */
export function isFullPlayerStatsRebuild(job: {
  rebuildKind?: PlayerStatsRebuildKind;
  stopAfterPhase?: string;
  includeAggregateStats: boolean;
}): boolean {
  if (job.rebuildKind) {
    return job.rebuildKind === "full";
  }
  return !job.stopAfterPhase && job.includeAggregateStats;
}
