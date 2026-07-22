import {
  classifyCompositionResidual,
  compositionBiasLabel,
  type CompositionBias,
} from "./tierRestrictions";

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

/** Primary evaluation tier used for restriction priors (borderline → higher). */
export function primaryAbilityTier(fit: TierFit): ReviewTier {
  if (fit.kind === "best_fit") return fit.tier;
  return fit.higher;
}

export type HolisticConfidenceInput = {
  totalEvents: number;
  /** Observed average teammate strength (S=4 … C=1). */
  actualTeammateStrength?: number;
  /**
   * Expected teammate strength given evaluation ability + tier restrictions
   * (optionally blended with historical composition for that ability band).
   */
  expectedTeammateStrength?: number;
  matchesAnalyzed?: number;
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
  /** actual − expected teammate strength. */
  compositionResidual?: number;
  compositionBias?: CompositionBias;
  compositionBiasLabel?: string;
  actualTeammateStrength?: number;
  expectedTeammateStrength?: number;
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

/**
 * Only penalize *unexpected* composition (large residual vs restriction/
 * empirical expectation). Expected strong/weak teammates under the rules
 * do not reduce confidence by themselves.
 */
function compositionResidualFactor(residual: number | undefined): {
  factor: number;
  reason?: string;
} {
  if (residual === undefined) {
    return { factor: 0.75 };
  }
  const abs = Math.abs(residual);
  if (abs < 0.35) return { factor: 1 };
  if (abs < 0.7) {
    return {
      factor: 0.85,
      reason:
        residual > 0
          ? "Teammates somewhat stronger than restriction/historical expectation."
          : "Teammates somewhat weaker than restriction/historical expectation.",
    };
  }
  if (abs < 1.1) {
    return {
      factor: 0.65,
      reason:
        residual > 0
          ? "Teammates stronger than expected under tier restrictions."
          : "Teammates weaker than expected under tier restrictions.",
    };
  }
  return {
    factor: 0.45,
    reason:
      residual > 0
        ? "Teammate strength well above what restrictions predict for this ability."
        : "Teammate strength well below what restrictions predict for this ability.",
  };
}

function duoConcentrationFactor(input: {
  matchesAnalyzed?: number;
  withoutDuoCount?: number;
  hasConsistentDuo?: boolean;
  hasMutualDependency?: boolean;
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
    return {
      factor: hasMutualDependency ? 0.3 : 0.4,
      duoShare,
      reason: `Played ${Math.round(duoShare * 100)}% of matches with a consistent duo.`,
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
 * Teammate strength only reduces confidence when it differs from what the
 * restriction system + historical mix predict for the player's ability.
 */
export function computeHolisticConfidence(
  input: HolisticConfidenceInput,
): HolisticConfidenceResult {
  const residual =
    input.actualTeammateStrength !== undefined &&
    input.expectedTeammateStrength !== undefined
      ? input.actualTeammateStrength - input.expectedTeammateStrength
      : undefined;

  const bias =
    residual !== undefined ? classifyCompositionResidual(residual) : undefined;

  const sample = sampleSizeFactor(input.totalEvents);
  const composition = compositionResidualFactor(residual);
  const duo = duoConcentrationFactor({
    matchesAnalyzed: input.matchesAnalyzed,
    withoutDuoCount: input.withoutDuoCount,
    hasConsistentDuo: input.hasConsistentDuo,
    hasMutualDependency: input.hasMutualDependency,
  });

  const score = Math.pow(
    sample * composition.factor * duo.factor,
    1 / 1.15,
  );

  const reasons: string[] = [];
  if (input.totalEvents < 13) {
    reasons.push(
      `Small sample (${input.totalEvents} events) limits reliability.`,
    );
  }
  if (composition.reason) reasons.push(composition.reason);
  if (duo.reason) reasons.push(duo.reason);

  if (bias === "as_expected" && residual !== undefined) {
    reasons.unshift(
      "Teammate strength matches what tier restrictions predict for this ability.",
    );
  } else if (bias === "stronger_than_expected") {
    reasons.unshift(
      "Stronger teammates than expected for this evaluation level under ZBD restrictions.",
    );
  } else if (bias === "weaker_than_expected") {
    reasons.unshift(
      "Weaker teammates than expected for this evaluation level under ZBD restrictions.",
    );
  }

  // Dedupe near-identical composition reasons
  const uniqueReasons = [...new Set(reasons)];

  let level: ConfidenceLevel;
  if (score >= 0.72) level = "high";
  else if (score >= 0.45) level = "medium";
  else level = "low";

  if (level === "high" && uniqueReasons.length <= 1 && bias === "as_expected") {
    if (
      input.totalEvents >= 20 &&
      (duo.duoShare === undefined || duo.duoShare < 0.6)
    ) {
      uniqueReasons.push("Large sample with varied teammates.");
    } else if (input.totalEvents >= 20) {
      uniqueReasons.push("Large event sample supports the holistic score.");
    }
  }

  const summary =
    uniqueReasons[0] ??
    (level === "high"
      ? "Holistic score looks reasonably representative of individual ability."
      : "Holistic reliability is uncertain.");

  return {
    level,
    label: confidenceLabel(level),
    stars: confidenceStars(level),
    score,
    compositionResidual: residual,
    compositionBias: bias,
    compositionBiasLabel: bias ? compositionBiasLabel(bias) : undefined,
    actualTeammateStrength: input.actualTeammateStrength,
    expectedTeammateStrength: input.expectedTeammateStrength,
    duoShare: duo.duoShare,
    reasons: uniqueReasons,
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
 * by Holistic Confidence and composition residual (actual vs expected
 * teammates under tier restrictions), then compare to assigned tier for action.
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
  const bias = holisticConfidence.compositionBias;
  const holisticStrength = tierFitStrength(holisticFit);
  const evalStrength = tierFitStrength(evaluationFit);
  const holisticHigher = holisticStrength > evalStrength + 0.25;
  const holisticLower = holisticStrength < evalStrength - 0.25;

  let overallFit: OverallFit;
  let recommendationConfidence: ConfidenceLevel;
  let reason: string;
  let softReview = false;

  const sameBestFit =
    evaluationFit.kind === "best_fit" &&
    holisticFit.kind === "best_fit" &&
    evaluationFit.tier === holisticFit.tier;

  const sameBorderline =
    evaluationFit.kind === "borderline" &&
    holisticFit.kind === "borderline" &&
    evaluationFit.higher === holisticFit.higher &&
    evaluationFit.lower === holisticFit.lower;

  // Directional composition effects when signals disagree.
  const inflatedUp =
    span >= 1 &&
    holisticHigher &&
    bias === "stronger_than_expected";
  const outperformance =
    span >= 1 &&
    holisticHigher &&
    bias === "weaker_than_expected";
  const teammateDrag =
    span >= 1 &&
    holisticLower &&
    bias === "weaker_than_expected";
  const underperformedWithHelp =
    span >= 1 &&
    holisticLower &&
    bias === "stronger_than_expected";

  if (sameBestFit || sameBorderline) {
    overallFit = evaluationFit;
    recommendationConfidence = hc === "low" ? "medium" : "high";
    reason =
      evaluationFit.kind === "best_fit"
        ? "Evaluation and performance agree on the same best-fit tier."
        : "Evaluation and performance agree the player sits on the same boundary.";
    if (bias && bias !== "as_expected") {
      reason += ` ${holisticConfidence.compositionBiasLabel}.`;
    }
  } else if (inflatedUp) {
    // Holistic looks higher but teammates stronger than restrictions predict.
    overallFit = evaluationFit;
    softReview = true;
    recommendationConfidence = span >= 2 ? "low" : "medium";
    reason =
      "Holistic performance may be inflated by stronger-than-expected teammates under ZBD restrictions. Evaluation should carry more weight.";
  } else if (outperformance) {
    // Holistic higher despite weaker-than-expected teammates — credit it.
    overallFit = fitFromTier(union.length <= 2 ? union : holisticTiers);
    recommendationConfidence = hc === "high" ? "high" : "medium";
    reason =
      "Holistic exceeds evaluation despite weaker-than-expected teammates — performance deserves extra weight.";
  } else if (teammateDrag) {
    overallFit = evaluationFit;
    softReview = true;
    recommendationConfidence = "medium";
    reason =
      "Holistic sits below evaluation with weaker-than-expected teammates — results may reflect team drag more than individual decline.";
  } else if (underperformedWithHelp) {
    overallFit = fitFromTier(union.length <= 2 ? union : holisticTiers);
    recommendationConfidence = hc === "high" ? "high" : "medium";
    reason =
      "Holistic sits below evaluation despite stronger-than-expected teammates — underperformance looks more individual.";
  } else if (hc === "low" && span >= 1) {
    overallFit = evaluationFit;
    softReview = true;
    recommendationConfidence = span >= 2 ? "low" : "medium";
    reason = `Holistic reliability is low (${holisticConfidence.summary}). Evaluation should carry more weight (${evaluationFit.label}).`;
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
    overallFit = { kind: "disagreement", label: "Review Required" };
    recommendationConfidence = "high";
    reason = "Evaluation and performance disagree.";
  } else {
    overallFit = fitFromTier(evalTiers);
    softReview = true;
    recommendationConfidence = "medium";
    reason = `Evaluation and holistic disagree across non-adjacent tiers, but holistic confidence is only ${hc}. ${holisticConfidence.summary}`;
  }

  const { action, actionLabel } = deriveAction(
    overallFit,
    currentTier,
    softReview,
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
  softReview: boolean,
  fitSpan: number,
): { action: ActionKind; actionLabel: string } {
  if (overallFit.kind === "disagreement") {
    return { action: "review_required", actionLabel: "Review Required" };
  }

  if (softReview && fitSpan >= 1) {
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
