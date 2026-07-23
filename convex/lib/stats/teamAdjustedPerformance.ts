/**
 * Team-Adjusted Performance (Performance vs Expected).
 *
 * Compares a player's teams' outcomes to historically similar-strength teams.
 * Team strength = mean of member evaluation scores (totalScore) as of each
 * event (resolved from tierHistory), not current scores.
 * Expectations are learned dynamically from the dataset (bucket medians).
 */

export type TeamPerfSample = {
  /**
   * Mean evaluation score of team members (including self) as of the event.
   * Optional when teammate scores weren't available — still useful for trend.
   */
  strength?: number;
  placement: number;
  /** Team kills for the event when available. */
  teamKills?: number;
  /** Individual eliminations when available. */
  playerKills?: number;
  /** Event play time (ms) for chronological trend analysis. */
  asOfMs?: number;
};

export type StrengthBucketExpectation = {
  strengthMin: number;
  strengthMax: number;
  medianPlacement: number;
  medianTeamKills?: number;
  sampleSize: number;
};

export type PerformanceVsExpectedLevel = "above" | "around" | "below";

export type PerformanceVsExpectedResult = {
  level: PerformanceVsExpectedLevel;
  label: string;
  /** Higher = more above expectation. */
  score: number;
  expectedAvgPlacement: number;
  actualAvgPlacement: number;
  expectedAvgTeamKills?: number;
  actualAvgTeamKills?: number;
  eventCount: number;
  summary: string;
};

/** Default evaluation-score bucket width for team strength. */
export const TEAM_STRENGTH_BUCKET_WIDTH = 75;

/** Cap stored samples per player to keep cache docs small. */
export const MAX_TEAM_PERF_SAMPLES = 60;

export function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid];
}

/**
 * Team strength from evaluation scores of members present on the roster.
 * Returns undefined if fewer than half of seats (or fewer than 2) have scores.
 */
export function teamStrengthFromEvalScores(
  memberScores: readonly number[],
  rosterSize: number,
): number | undefined {
  if (memberScores.length === 0) return undefined;
  const required = Math.max(2, Math.ceil(rosterSize * 0.5));
  if (memberScores.length < required) return undefined;
  return mean(memberScores);
}

export function strengthBucketKey(
  strength: number,
  bucketWidth: number = TEAM_STRENGTH_BUCKET_WIDTH,
): number {
  return Math.floor(strength / bucketWidth) * bucketWidth;
}

/**
 * Learn expected placement/kills by team-strength bucket from historical teams.
 * Deduplicate callers should pass one observation per unique team-event.
 */
export function buildStrengthExpectations(
  teams: readonly TeamPerfSample[],
  bucketWidth: number = TEAM_STRENGTH_BUCKET_WIDTH,
  minBucketSize: number = 8,
): StrengthBucketExpectation[] {
  const buckets = new Map<
    number,
    { placements: number[]; kills: number[] }
  >();

  for (const team of teams) {
    if (
      typeof team.strength !== "number" ||
      !Number.isFinite(team.strength) ||
      !Number.isFinite(team.placement)
    ) {
      continue;
    }
    const key = strengthBucketKey(team.strength, bucketWidth);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { placements: [], kills: [] };
      buckets.set(key, bucket);
    }
    bucket.placements.push(team.placement);
    if (typeof team.teamKills === "number" && Number.isFinite(team.teamKills)) {
      bucket.kills.push(team.teamKills);
    }
  }

  const expectations: StrengthBucketExpectation[] = [];
  for (const [key, data] of buckets) {
    if (data.placements.length < minBucketSize) continue;
    const medianPlacement = median(data.placements);
    if (medianPlacement === undefined) continue;
    expectations.push({
      strengthMin: key,
      strengthMax: key + bucketWidth,
      medianPlacement,
      medianTeamKills: median(data.kills),
      sampleSize: data.placements.length,
    });
  }

  return expectations.sort((a, b) => a.strengthMin - b.strengthMin);
}

export function lookupExpectation(
  strength: number,
  expectations: readonly StrengthBucketExpectation[],
  bucketWidth: number = TEAM_STRENGTH_BUCKET_WIDTH,
): StrengthBucketExpectation | undefined {
  if (expectations.length === 0) return undefined;
  const key = strengthBucketKey(strength, bucketWidth);
  const exact = expectations.find((e) => e.strengthMin === key);
  if (exact) return exact;

  // Nearest bucket by center distance
  let best: StrengthBucketExpectation | undefined;
  let bestDist = Infinity;
  for (const e of expectations) {
    const center = (e.strengthMin + e.strengthMax) / 2;
    const dist = Math.abs(strength - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  // Only use nearest if within 1.5 buckets
  if (best && bestDist <= bucketWidth * 1.5) return best;
  return undefined;
}

export function performanceVsExpectedLabel(
  level: PerformanceVsExpectedLevel,
): string {
  switch (level) {
    case "above":
      return "Above Expected";
    case "around":
      return "Around Expected";
    case "below":
      return "Below Expected";
  }
}

/**
 * Aggregate a player's team-events vs learned strength expectations.
 */
export function computePerformanceVsExpected(
  samples: readonly TeamPerfSample[],
  expectations: readonly StrengthBucketExpectation[],
  options?: {
    bucketWidth?: number;
    /** Composite threshold for above/below (fractional). */
    threshold?: number;
  },
): PerformanceVsExpectedResult | null {
  const bucketWidth = options?.bucketWidth ?? TEAM_STRENGTH_BUCKET_WIDTH;
  const threshold = options?.threshold ?? 0.1;

  if (samples.length < 3 || expectations.length === 0) return null;

  const placementResiduals: number[] = [];
  const killsResiduals: number[] = [];
  const expectedPlacements: number[] = [];
  const actualPlacements: number[] = [];
  const expectedKills: number[] = [];
  const actualKills: number[] = [];

  for (const sample of samples) {
    if (typeof sample.strength !== "number" || !Number.isFinite(sample.strength)) {
      continue;
    }
    const expected = lookupExpectation(sample.strength, expectations, bucketWidth);
    if (!expected) continue;

    expectedPlacements.push(expected.medianPlacement);
    actualPlacements.push(sample.placement);
    // Lower placement is better → positive residual means better than expected
    placementResiduals.push(expected.medianPlacement - sample.placement);

    if (
      typeof sample.teamKills === "number" &&
      expected.medianTeamKills !== undefined
    ) {
      expectedKills.push(expected.medianTeamKills);
      actualKills.push(sample.teamKills);
      killsResiduals.push(sample.teamKills - expected.medianTeamKills);
    }
  }

  if (placementResiduals.length < 3) return null;

  const actualAvgPlacement = mean(actualPlacements)!;
  const expectedAvgPlacement = mean(expectedPlacements)!;
  const actualAvgTeamKills = mean(actualKills);
  const expectedAvgTeamKills = mean(expectedKills);

  const avgPlacementResidual = mean(placementResiduals)!;
  const placementComponent =
    expectedAvgPlacement > 0
      ? avgPlacementResidual / expectedAvgPlacement
      : 0;

  let killsComponent = 0;
  if (
    killsResiduals.length >= 3 &&
    expectedAvgTeamKills !== undefined &&
    expectedAvgTeamKills > 0
  ) {
    killsComponent = mean(killsResiduals)! / expectedAvgTeamKills;
  }

  // Placement weighted higher — primary ZBD outcome signal
  const hasKills = killsResiduals.length >= 3;
  const score = hasKills
    ? placementComponent * 0.65 + killsComponent * 0.35
    : placementComponent;

  let level: PerformanceVsExpectedLevel;
  if (score >= threshold) level = "above";
  else if (score <= -threshold) level = "below";
  else level = "around";

  const label = performanceVsExpectedLabel(level);
  const summary =
    level === "above"
      ? "Teams consistently outperform similar-strength teams."
      : level === "below"
        ? "Teams consistently underperform similar-strength teams."
        : "Teams perform roughly in line with similar-strength teams.";

  return {
    level,
    label,
    score,
    expectedAvgPlacement,
    actualAvgPlacement,
    expectedAvgTeamKills,
    actualAvgTeamKills,
    eventCount: placementResiduals.length,
    summary,
  };
}
