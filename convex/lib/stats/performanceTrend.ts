/**
 * Recent Performance Trend.
 *
 * Compares a player's recent events to their own earlier baseline
 * (placement, kills, and optional Performance vs Expected residuals).
 * Detects sustained improving / stable / declining form — not absolute skill.
 */

import {
  lookupExpectation,
  mean,
  type StrengthBucketExpectation,
  type TeamPerfSample,
} from "./teamAdjustedPerformance";

export type TrendSample = {
  /** Event play time (ms). Required for chronological trend. */
  asOfMs: number;
  placement: number;
  /** Optional — enables PvE residual trend when present. */
  strength?: number;
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
  // Prefer ~35% recent, clamped so both windows can meet TREND_MIN_WINDOW.
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

function pveResidual(
  sample: TrendSample,
  expectations: readonly StrengthBucketExpectation[],
): number | undefined {
  if (typeof sample.strength !== "number" || !Number.isFinite(sample.strength)) {
    return undefined;
  }
  const expected = lookupExpectation(sample.strength, expectations);
  if (!expected) return undefined;

  const placementComponent =
    expected.medianPlacement > 0
      ? (expected.medianPlacement - sample.placement) / expected.medianPlacement
      : 0;

  if (
    typeof sample.teamKills === "number" &&
    expected.medianTeamKills !== undefined &&
    expected.medianTeamKills > 0
  ) {
    const killsComponent =
      (sample.teamKills - expected.medianTeamKills) / expected.medianTeamKills;
    return placementComponent * 0.65 + killsComponent * 0.35;
  }

  return placementComponent;
}

export function toTrendSamples(
  samples: readonly TeamPerfSample[],
): TrendSample[] {
  return samples.filter(
    (s): s is TrendSample =>
      typeof s.asOfMs === "number" &&
      Number.isFinite(s.asOfMs) &&
      Number.isFinite(s.placement),
  );
}

/**
 * Classify recent form vs the same player's earlier events.
 * Placement/kills trends do not require team strength; PvE is optional.
 * Returns null when dated sample size is insufficient.
 */
export function computePerformanceTrend(
  samples: readonly TrendSample[],
  expectations: readonly StrengthBucketExpectation[] = [],
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

  let pveZ: number | null = null;
  if (expectations.length > 0) {
    const recentPve = recent
      .map((s) => pveResidual(s, expectations))
      .filter((v): v is number => v !== undefined);
    const baselinePve = baseline
      .map((s) => pveResidual(s, expectations))
      .filter((v): v is number => v !== undefined);
    if (recentPve.length >= minWindow && baselinePve.length >= minWindow) {
      pveZ = meanDiffZ(recentPve, baselinePve, true, minWindow);
    }
  }

  const components: { key: string; z: number }[] = [];
  if (placementZ !== null) components.push({ key: "placement", z: placementZ });
  if (killsZ !== null) components.push({ key: "kills", z: killsZ });
  if (pveZ !== null) components.push({ key: "pve", z: pveZ });
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
  const pveImproving = pveZ !== null && pveZ >= zThreshold;
  const pveDeclining = pveZ !== null && pveZ <= -zThreshold;

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
    }
    if (pveImproving) {
      reasons.push("Performance vs expected also trending up recently.");
    }
    if (reasons.length === 0) {
      reasons.push(
        `Recent form (${recent.length} events) exceeds the player's earlier baseline.`,
      );
    }
  } else {
    if (placementDeclining && killsDeclining) {
      reasons.push(
        `Placings and kills declining over the last ${recent.length} events.`,
      );
    } else if (placementDeclining) {
      reasons.push(
        `Placements declining over the last ${recent.length} events.`,
      );
    } else if (killsDeclining) {
      reasons.push("Average kills falling versus earlier events.");
    }
    if (pveDeclining) {
      reasons.push("Performance vs expected also trending down recently.");
    }
    if (reasons.length === 0) {
      reasons.push(
        `Recent form (${recent.length} events) sits below the player's earlier baseline.`,
      );
    }
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
