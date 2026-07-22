/** Competitive tiers used for recommendations (excludes D / Unranked). */
export const REVIEW_TIERS = ["S", "A", "B", "C"] as const;
export type ReviewTier = (typeof REVIEW_TIERS)[number];

export type ConfidenceLevel = "high" | "medium" | "low";

export type TierFit =
  | { kind: "best_fit"; tier: ReviewTier; label: string }
  | {
      kind: "borderline";
      higher: ReviewTier;
      lower: ReviewTier;
      label: string;
    };

export type OverallFit =
  | TierFit
  | { kind: "disagreement"; label: string };

export type ActionKind =
  | "no_change"
  | "optional_review"
  | "review_recommended"
  | "review_move"
  | "review_required";

/**
 * How close to a midpoint (as a fraction of the gap between adjacent
 * tier centers) counts as borderline. Derived from distributions — not
 * absolute score cutoffs.
 */
export const BORDERLINE_GAP_FRACTION = 0.2;

/** Numeric tier scale matching avgTeammateTier (S=4 … C=1). */
const TIER_STRENGTH: Record<ReviewTier, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

const TIER_RANK: Record<ReviewTier, number> = {
  S: 3,
  A: 2,
  B: 1,
  C: 0,
};

export function isReviewTier(tier: string | undefined | null): tier is ReviewTier {
  return tier === "S" || tier === "A" || tier === "B" || tier === "C";
}

export function tierRank(tier: ReviewTier): number {
  return TIER_RANK[tier];
}

/** Median of a numeric list. Returns undefined for empty input. */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid];
}

/** Per-tier centers (medians) from score distributions. */
export function buildTierCenters(
  scoresByTier: Partial<Record<ReviewTier, readonly number[]>>,
): Partial<Record<ReviewTier, number>> {
  const centers: Partial<Record<ReviewTier, number>> = {};
  for (const tier of REVIEW_TIERS) {
    const m = median(scoresByTier[tier] ?? []);
    if (m !== undefined) centers[tier] = m;
  }
  return centers;
}

function borderlineLabel(a: ReviewTier, b: ReviewTier): string {
  const [first, second] = [a, b].sort((x, y) => x.localeCompare(y));
  return `Borderline ${first}/${second}`;
}

/**
 * Classify a score against data-driven tier centers.
 * Independent of the player's assigned tier — only the score and the
 * population centers matter.
 */
export function classifyScoreAgainstCenters(
  score: number,
  centers: Partial<Record<ReviewTier, number>>,
): TierFit {
  const entries = (
    Object.entries(centers) as [ReviewTier, number][]
  ).filter(([, value]) => Number.isFinite(value));

  // Highest score center first (typically S → A → B → C).
  entries.sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return { kind: "best_fit", tier: "C", label: "Best Fit: C" };
  }
  if (entries.length === 1) {
    const tier = entries[0]![0];
    return { kind: "best_fit", tier, label: `Best Fit: ${tier}` };
  }

  let nearestIdx = 0;
  let nearestDist = Math.abs(score - entries[0]![1]);
  for (let i = 1; i < entries.length; i++) {
    const dist = Math.abs(score - entries[i]![1]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }

  const neighborIdxs = [nearestIdx];
  if (nearestIdx > 0) neighborIdxs.push(nearestIdx - 1);
  if (nearestIdx < entries.length - 1) neighborIdxs.push(nearestIdx + 1);

  let bestPair: { i: number; j: number; distToMid: number; gap: number } | null =
    null;

  for (const i of neighborIdxs) {
    for (const j of neighborIdxs) {
      if (j <= i) continue;
      if (Math.abs(i - j) !== 1) continue; // only adjacent centers
      const gap = Math.abs(entries[i]![1] - entries[j]![1]);
      if (gap <= 0) continue;
      const midpoint = (entries[i]![1] + entries[j]![1]) / 2;
      const distToMid = Math.abs(score - midpoint);
      if (
        distToMid <= BORDERLINE_GAP_FRACTION * gap &&
        (!bestPair || distToMid < bestPair.distToMid)
      ) {
        bestPair = { i, j, distToMid, gap };
      }
    }
  }

  if (bestPair) {
    const t1 = entries[bestPair.i]![0];
    const t2 = entries[bestPair.j]![0];
    const higher = tierRank(t1) >= tierRank(t2) ? t1 : t2;
    const lower = higher === t1 ? t2 : t1;
    return {
      kind: "borderline",
      higher,
      lower,
      label: borderlineLabel(higher, lower),
    };
  }

  const tier = entries[nearestIdx]![0];
  return { kind: "best_fit", tier, label: `Best Fit: ${tier}` };
}

export function confidenceStars(level: ConfidenceLevel): number {
  switch (level) {
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 1;
  }
}

export function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

export function tierFitStrength(fit: TierFit): number {
  if (fit.kind === "best_fit") return TIER_STRENGTH[fit.tier];
  return (TIER_STRENGTH[fit.higher] + TIER_STRENGTH[fit.lower]) / 2;
}

export type HolisticConfidenceInput = {
  totalEvents: number;
  /** Average unique-teammate tier strength (S=4 … C=1). */
  avgTeammateTier?: number;
  /** Player ability anchor for gap (typically evaluation best-fit strength). */
  playerAbilityStrength: number;
  /** Matches analyzed for TC / duo context. */
  matchesAnalyzed?: number;
  /** Matches without the consistent duo partner. */
  withoutDuoCount?: number;
  hasConsistentDuo?: boolean;
  hasMutualDependency?: boolean;
};

export type HolisticConfidenceResult = {
  level: ConfidenceLevel;
  label: string;
  stars: number;
  /** 0–1 composite reliability. */
  score: number;
  teammateGap?: number;
  /** Estimated fraction of matches with the consistent duo (0–1). */
  duoShare?: number;
  reasons: string[];
  summary: string;
};

function sampleSizeFactor(totalEvents: number): number {
  if (totalEvents >= 20) return 1;
  if (totalEvents >= 13) return 0.8;
  if (totalEvents >= 8) return 0.6;
  return 0.35;
}

function teammateGapFactor(gap: number | undefined): {
  factor: number;
  reason?: string;
} {
  if (gap === undefined) {
    return { factor: 0.7 };
  }
  if (gap < 0.4) return { factor: 1 };
  if (gap < 0.85) {
    return {
      factor: 0.75,
      reason: "Average teammates differ somewhat from evaluation level.",
    };
  }
  if (gap < 1.35) {
    return {
      factor: 0.45,
      reason: "Average teammates differ by about a tier from evaluation level.",
    };
  }
  return {
    factor: 0.2,
    reason: "Average teammates differ by well over a tier from evaluation level.",
  };
}

function duoConcentrationFactor(input: {
  matchesAnalyzed?: number;
  withoutDuoCount?: number;
  hasConsistentDuo?: boolean;
  hasMutualDependency?: boolean;
  teammateGap?: number;
}): { factor: number; duoShare?: number; reason?: string } {
  const { matchesAnalyzed, withoutDuoCount, hasConsistentDuo, hasMutualDependency } =
    input;

  if (
    matchesAnalyzed === undefined ||
    matchesAnalyzed <= 0 ||
    withoutDuoCount === undefined
  ) {
    if (hasConsistentDuo && hasMutualDependency) {
      return {
        factor: 0.65,
        reason: "Consistent mutual duo may concentrate performance.",
      };
    }
    return { factor: 0.85 };
  }

  const withDuo = Math.max(0, matchesAnalyzed - withoutDuoCount);
  const duoShare = Math.min(1, withDuo / matchesAnalyzed);

  if (!hasConsistentDuo || duoShare < 0.45) {
    return { factor: 1, duoShare };
  }

  if (duoShare >= 0.8) {
    const direction =
      input.teammateGap !== undefined && input.teammateGap >= 0.85
        ? "stronger"
        : "the same";
    return {
      factor: hasMutualDependency ? 0.3 : 0.4,
      duoShare,
      reason: `Played ${Math.round(duoShare * 100)}% of matches with a consistent duo${
        direction === "stronger" ? " (often stronger teammates)" : ""
      }.`,
    };
  }

  if (duoShare >= 0.6) {
    return {
      factor: 0.6,
      duoShare,
      reason: `Played ${Math.round(duoShare * 100)}% of matches with a consistent duo.`,
    };
  }

  return { factor: 0.8, duoShare };
}

/**
 * How trustworthy the Holistic Score is as an individual-ability signal.
 * Separate from recommendation agreement confidence.
 */
export function computeHolisticConfidence(
  input: HolisticConfidenceInput,
): HolisticConfidenceResult {
  const teammateGap =
    input.avgTeammateTier !== undefined
      ? Math.abs(input.avgTeammateTier - input.playerAbilityStrength)
      : undefined;

  const sample = sampleSizeFactor(input.totalEvents);
  const gap = teammateGapFactor(teammateGap);
  const duo = duoConcentrationFactor({
    matchesAnalyzed: input.matchesAnalyzed,
    withoutDuoCount: input.withoutDuoCount,
    hasConsistentDuo: input.hasConsistentDuo,
    hasMutualDependency: input.hasMutualDependency,
    teammateGap,
  });

  // Geometric-ish blend: any weak factor pulls reliability down.
  const score = Math.pow(sample * gap.factor * duo.factor, 1 / 1.15);

  const reasons: string[] = [];
  if (input.totalEvents < 13) {
    reasons.push(
      `Small sample (${input.totalEvents} events) limits reliability.`,
    );
  }
  if (gap.reason) reasons.push(gap.reason);
  if (duo.reason) reasons.push(duo.reason);

  // Directional teammate note when gap is large
  if (
    input.avgTeammateTier !== undefined &&
    teammateGap !== undefined &&
    teammateGap >= 0.85
  ) {
    if (input.avgTeammateTier > input.playerAbilityStrength + 0.4) {
      reasons.unshift(
        duo.duoShare !== undefined && duo.duoShare >= 0.6
          ? `Played ${Math.round(duo.duoShare * 100)}% of matches with higher-tier teammates.`
          : "Average teammates are significantly stronger than evaluation level.",
      );
      // Avoid duplicate duo reason when we already said % with higher-tier
      if (duo.reason?.includes("% of matches with a consistent duo")) {
        const idx = reasons.indexOf(duo.reason);
        if (idx >= 0) reasons.splice(idx, 1);
      }
    } else if (input.avgTeammateTier < input.playerAbilityStrength - 0.4) {
      reasons.unshift(
        "Average teammates are significantly weaker than evaluation level.",
      );
    }
  }

  let level: ConfidenceLevel;
  if (score >= 0.72) level = "high";
  else if (score >= 0.45) level = "medium";
  else level = "low";

  // Prefer a clear positive summary when reliability is high and no risk flags fired.
  if (level === "high" && reasons.length === 0) {
    if (input.totalEvents >= 20 && (duo.duoShare === undefined || duo.duoShare < 0.6)) {
      reasons.push("Large sample with varied teammates.");
    } else if (input.totalEvents >= 20) {
      reasons.push("Large event sample supports the holistic score.");
    } else {
      reasons.push(
        "Holistic score looks reasonably representative of individual ability.",
      );
    }
  }

  const summary =
    reasons[0] ??
    (level === "high"
      ? "Holistic score looks reasonably representative of individual ability."
      : "Holistic reliability is uncertain.");

  return {
    level,
    label: confidenceLabel(level),
    stars: confidenceStars(level),
    score,
    teammateGap,
    duoShare: duo.duoShare,
    reasons,
    summary,
  };
}

function tiersInFit(fit: TierFit): ReviewTier[] {
  if (fit.kind === "best_fit") return [fit.tier];
  return [fit.higher, fit.lower];
}

function spanOfTiers(tiers: readonly ReviewTier[]): number {
  if (tiers.length === 0) return 0;
  const ranks = tiers.map(tierRank);
  return Math.max(...ranks) - Math.min(...ranks);
}

function fitFromTier(tiers: ReviewTier[]): OverallFit {
  const unique = [...new Set(tiers)];
  if (unique.length === 1) {
    const tier = unique[0]!;
    return { kind: "best_fit", tier, label: `Best Fit: ${tier}` };
  }
  if (unique.length === 2 && spanOfTiers(unique) === 1) {
    const higher =
      tierRank(unique[0]!) >= tierRank(unique[1]!) ? unique[0]! : unique[1]!;
    const lower = higher === unique[0] ? unique[1]! : unique[0]!;
    return {
      kind: "borderline",
      higher,
      lower,
      label: borderlineLabel(higher, lower),
    };
  }
  return { kind: "disagreement", label: "Review Required" };
}

export type RecommendationResult = {
  evaluationFit: TierFit;
  holisticFit: TierFit;
  overallFit: OverallFit;
  /**
   * Certainty in the recommendation after reliability weighting.
   * High disagreement + high holistic confidence → high certainty (review required).
   * Disagreement + low holistic confidence → lower certainty (soft review).
   */
  recommendationConfidence: ConfidenceLevel;
  recommendationConfidenceLabel: string;
  stars: number;
  holisticConfidence: HolisticConfidenceResult;
  action: ActionKind;
  actionLabel: string;
  reason: string;
  suggestedTier?: ReviewTier;
};

/**
 * Combine evaluation + holistic fits (tier-independent), weighting holistic
 * by Holistic Confidence, then compare to assigned tier for the action only.
 */
export function computeTierRecommendation(
  evaluationFit: TierFit,
  holisticFit: TierFit,
  currentTier: ReviewTier,
  holisticConfidence: HolisticConfidenceResult,
): RecommendationResult {
  const evalTiers = tiersInFit(evaluationFit);
  const holisticTiers = tiersInFit(holisticFit);
  const union = [...new Set([...evalTiers, ...holisticTiers])];
  const overlap = evalTiers.filter((t) => holisticTiers.includes(t));
  const span = spanOfTiers(union);
  const hc = holisticConfidence.level;

  let overallFit: OverallFit;
  let recommendationConfidence: ConfidenceLevel;
  let reason: string;

  const sameBestFit =
    evaluationFit.kind === "best_fit" &&
    holisticFit.kind === "best_fit" &&
    evaluationFit.tier === holisticFit.tier;

  const sameBorderline =
    evaluationFit.kind === "borderline" &&
    holisticFit.kind === "borderline" &&
    evaluationFit.higher === holisticFit.higher &&
    evaluationFit.lower === holisticFit.lower;

  if (sameBestFit || sameBorderline) {
    overallFit = evaluationFit;
    // Agreement is strong; low holistic confidence still slightly softens certainty.
    recommendationConfidence = hc === "low" ? "medium" : "high";
    reason =
      evaluationFit.kind === "best_fit"
        ? "Evaluation and performance agree on the same best-fit tier."
        : "Evaluation and performance agree the player sits on the same boundary.";
    if (hc === "low") {
      reason += ` Holistic confidence is low (${holisticConfidence.summary}).`;
    }
  } else if (hc === "low" && span >= 1) {
    // Unreliable holistic: lean on evaluation; soften disagreement.
    overallFit = evaluationFit;
    recommendationConfidence = span >= 2 ? "low" : "medium";
    reason = `Holistic performance may be inflated by teammate strength (${holisticConfidence.summary}). Evaluation should carry more weight (${evaluationFit.label}).`;
  } else if (overlap.length > 0 && span <= 1) {
    overallFit = fitFromTier(union);
    recommendationConfidence = "medium";
    reason =
      "Evaluation and performance partially agree; player sits near a tier boundary.";
  } else if (span <= 1) {
    overallFit = fitFromTier(union);
    recommendationConfidence = hc === "high" ? "high" : "medium";
    reason =
      hc === "high"
        ? "Evaluation and performance point to adjacent tiers — meaningful borderline case."
        : `Adjacent-tier signals with ${hc} holistic confidence — ${holisticConfidence.summary}`;
  } else if (hc === "high") {
    // Strong, reliable disagreement → high certainty that review is needed.
    overallFit = { kind: "disagreement", label: "Review Required" };
    recommendationConfidence = "high";
    reason = "Evaluation and performance disagree.";
  } else {
    // Medium HC + large span: review, but less certain.
    overallFit = fitFromTier(evalTiers);
    recommendationConfidence = "medium";
    reason = `Evaluation and holistic disagree across non-adjacent tiers, but holistic confidence is only ${hc}. ${holisticConfidence.summary}`;
  }

  const { action, actionLabel } = deriveAction(
    overallFit,
    currentTier,
    hc,
    span,
  );

  return {
    evaluationFit,
    holisticFit,
    overallFit,
    recommendationConfidence,
    recommendationConfidenceLabel: confidenceLabel(recommendationConfidence),
    stars: confidenceStars(recommendationConfidence),
    holisticConfidence,
    action,
    actionLabel,
    reason,
    suggestedTier:
      overallFit.kind === "best_fit" ? overallFit.tier : undefined,
  };
}

function deriveAction(
  overallFit: OverallFit,
  currentTier: ReviewTier,
  holisticConfidence: ConfidenceLevel,
  fitSpan: number,
): { action: ActionKind; actionLabel: string } {
  if (overallFit.kind === "disagreement") {
    return { action: "review_required", actionLabel: "Review Required" };
  }

  // Soften hard disagreement when holistic is unreliable.
  if (holisticConfidence === "low" && fitSpan >= 1) {
    if (overallFit.kind === "best_fit" && overallFit.tier !== currentTier) {
      return {
        action: "review_recommended",
        actionLabel: `Review Recommended (${currentTier} → ${overallFit.tier}?)`,
      };
    }
    return {
      action: "review_recommended",
      actionLabel: "Review Recommended",
    };
  }

  if (overallFit.kind === "best_fit") {
    if (overallFit.tier === currentTier) {
      return { action: "no_change", actionLabel: "No Change" };
    }
    return {
      action: "review_move",
      actionLabel: `Review ${currentTier} → ${overallFit.tier}`,
    };
  }

  if (
    currentTier === overallFit.higher ||
    currentTier === overallFit.lower
  ) {
    return { action: "optional_review", actionLabel: "Optional Review" };
  }

  const target =
    Math.abs(tierRank(currentTier) - tierRank(overallFit.higher)) <=
    Math.abs(tierRank(currentTier) - tierRank(overallFit.lower))
      ? overallFit.higher
      : overallFit.lower;
  return {
    action: "review_move",
    actionLabel: `Review ${currentTier} → ${target}`,
  };
}

/** Sort priority: actionable reviews first. */
export function actionSortRank(action: ActionKind): number {
  switch (action) {
    case "review_required":
      return 0;
    case "review_move":
      return 1;
    case "review_recommended":
      return 2;
    case "optional_review":
      return 3;
    case "no_change":
      return 4;
  }
}

export function confidenceSortRank(level: ConfidenceLevel): number {
  switch (level) {
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
  }
}

export function overallFitLabel(fit: OverallFit): string {
  return fit.label;
}
