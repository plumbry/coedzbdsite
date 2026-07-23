/**
 * Recent Performance Trend.
 *
 * Compares a player's recent placement/kills to their own earlier baseline.
 * Independent of team strength and Performance vs Expected.
 */

import { mean, type TeamPerfSample } from "./teamAdjustedPerformance";

export type TrendSample = {
  /** Event play time (ms). Required for chronological trend. */
  asOfMs: number;
  placement: number;
  teamKills?: number;
  playerKills?: number;
};

export type PerformanceTrendLevel = "improving" | "stable" | "declining";

export type PerformanceTrendResult = {
  level: PerformanceTrendLevel;
  label: string;
  displayLabel: string;
  /** Positive = improving vs own baseline. */
  score: number;
  recentEventCount: number;
  baselineEventCount: number;
  summary: string;
  reasons: string[];
};

/** Minimum events in each window before classifying a trend. */
export const TREND_MIN_WINDOW = 8;

/** Effect-size threshold on mean-difference z (accounts for variance). */
export const TREND_Z_THRESHOLD = 0.85;

export function performanceTrendLabel(level: PerformanceTrendLevel): string {
  switch (level) {
    case "improving":
      return "Improving";
    case "stable":
      return "Stable";
    case "declining":
      return "Declining";
  }
}

export function performanceTrendDisplayLabel(
  level: PerformanceTrendLevel,
): string {
  switch (level) {
    case "improving":
      return "📈 Improving";
    case "stable":
      return "➡ Stable";
    case "declining":
      return "📉 Declining";
  }
}

function sampleStd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values)!;
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Standardized recent-vs-baseline mean difference.
 * Positive always means "better" for the metric.
 */
export function meanDiffZ(
  recent: readonly number[],
  baseline: readonly number[],
  higherIsBetter: boolean,
  minWindow: number = TREND_MIN_WINDOW,
): number | null {
  if (recent.length < minWindow || baseline.length < minWindow) return null;

  const mr = mean(recent)!;
  const mb = mean(baseline)!;
  const sr = sampleStd(recent);
  const sb = sampleStd(baseline);
  const se = Math.sqrt((sr * sr) / recent.length + (sb * sb) / baseline.length);
  const rawDiff = mr - mb;

  if (se < 1e-9) {
    if (Math.abs(rawDiff) < 1e-9) return 0;
    const sign = higherIsBetter ? Math.sign(rawDiff) : -Math.sign(rawDiff);
    return sign * 3;
  }

  const z = rawDiff / se;
  return higherIsBetter ? z : -z;
}

function recentWindowSize(total: number): number {
  const preferred = Math.min(
    20,
    Math.max(TREND_MIN_WINDOW, Math.floor(total * 0.35)),
  );
  const maxRecent = total - TREND_MIN_WINDOW;
  return Math.min(preferred, maxRecent);
}

function killsForSample(sample: TrendSample): number | undefined {
  if (
    typeof sample.playerKills === "number" &&
    Number.isFinite(sample.playerKills)
  ) {
    return sample.playerKills;
  }
  if (
    typeof sample.teamKills === "number" &&
    Number.isFinite(sample.teamKills)
  ) {
    return sample.teamKills;
  }
  return undefined;
}

export function toTrendSamples(
  samples: readonly TeamPerfSample[],
): TrendSample[] {
  return samples
    .filter(
      (s) =>
        typeof s.asOfMs === "number" &&
        Number.isFinite(s.asOfMs) &&
        Number.isFinite(s.placement),
    )
    .map((s) => ({
      asOfMs: s.asOfMs!,
      placement: s.placement,
      teamKills: s.teamKills,
      playerKills: s.playerKills,
    }));
}

/**
 * Classify recent form vs the same player's earlier events using placement
 * and kills only (not team strength / Performance vs Expected).
 */
export function computePerformanceTrend(
  samples: readonly TrendSample[],
  options?: {
    minWindow?: number;
    zThreshold?: number;
  },
): PerformanceTrendResult | null {
  const minWindow = options?.minWindow ?? TREND_MIN_WINDOW;
  const zThreshold = options?.zThreshold ?? TREND_Z_THRESHOLD;

  const dated = samples.filter(
    (s) => Number.isFinite(s.asOfMs) && Number.isFinite(s.placement),
  );
  if (dated.length < minWindow * 2) return null;

  const sorted = [...dated].sort((a, b) => a.asOfMs - b.asOfMs);
  const recentN = recentWindowSize(sorted.length);
  if (recentN < minWindow || sorted.length - recentN < minWindow) return null;

  const baseline = sorted.slice(0, sorted.length - recentN);
  const recent = sorted.slice(sorted.length - recentN);

  const placementZ = meanDiffZ(
    recent.map((s) => s.placement),
    baseline.map((s) => s.placement),
    false,
    minWindow,
  );

  const recentKills = recent
    .map(killsForSample)
    .filter((v): v is number => v !== undefined);
  const baselineKills = baseline
    .map(killsForSample)
    .filter((v): v is number => v !== undefined);
  const killsZ =
    recentKills.length >= minWindow && baselineKills.length >= minWindow
      ? meanDiffZ(recentKills, baselineKills, true, minWindow)
      : null;

  const components: { key: string; z: number }[] = [];
  if (placementZ !== null) components.push({ key: "placement", z: placementZ });
  if (killsZ !== null) components.push({ key: "kills", z: killsZ });
  if (components.length === 0) return null;

  const score = mean(components.map((c) => c.z))!;

  let level: PerformanceTrendLevel;
  if (score >= zThreshold) level = "improving";
  else if (score <= -zThreshold) level = "declining";
  else level = "stable";

  const reasons: string[] = [];
  const placementImproving = placementZ !== null && placementZ >= zThreshold;
  const placementDeclining = placementZ !== null && placementZ <= -zThreshold;
  const killsImproving = killsZ !== null && killsZ >= zThreshold;
  const killsDeclining = killsZ !== null && killsZ <= -zThreshold;

  if (level === "stable") {
    reasons.push(
      "No statistically meaningful change versus own historical baseline.",
    );
  } else if (level === "improving") {
    if (placementImproving && killsImproving) {
      reasons.push(
        `Placements and kills improving over the last ${recent.length} events.`,
      );
    } else if (placementImproving) {
      reasons.push(
        `Placements improving over the last ${recent.length} events.`,
      );
    } else if (killsImproving) {
      reasons.push("Average kills increasing versus earlier events.");
    } else {
      reasons.push(
        `Recent form (${recent.length} events) exceeds the player's earlier baseline.`,
      );
    }
  } else if (placementDeclining && killsDeclining) {
    reasons.push(
      `Placings and kills declining over the last ${recent.length} events.`,
    );
  } else if (placementDeclining) {
    reasons.push(
      `Placements declining over the last ${recent.length} events.`,
    );
  } else if (killsDeclining) {
    reasons.push("Average kills falling versus earlier events.");
  } else {
    reasons.push(
      `Recent form (${recent.length} events) sits below the player's earlier baseline.`,
    );
  }

  const label = performanceTrendLabel(level);
  const summary = reasons[0]!;

  return {
    level,
    label,
    displayLabel: performanceTrendDisplayLabel(level),
    score,
    recentEventCount: recent.length,
    baselineEventCount: baseline.length,
    summary,
    reasons,
  };
}
