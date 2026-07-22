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
  | "review_move"
  | "review_required";

/**
 * How close to a midpoint (as a fraction of the gap between adjacent
 * tier centers) counts as borderline. Derived from distributions — not
 * absolute score cutoffs.
 */
export const BORDERLINE_GAP_FRACTION = 0.2;

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
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  stars: number;
  action: ActionKind;
  actionLabel: string;
  reason: string;
  /** Clear single-tier suggestion when overall is a best fit. */
  suggestedTier?: ReviewTier;
};

/**
 * Combine evaluation + holistic fits (tier-independent), then compare to
 * assigned tier only for the action label.
 */
export function computeTierRecommendation(
  evaluationFit: TierFit,
  holisticFit: TierFit,
  currentTier: ReviewTier,
): RecommendationResult {
  const evalTiers = tiersInFit(evaluationFit);
  const holisticTiers = tiersInFit(holisticFit);
  const union = [...new Set([...evalTiers, ...holisticTiers])];
  const overlap = evalTiers.filter((t) => holisticTiers.includes(t));
  const span = spanOfTiers(union);

  let overallFit: OverallFit;
  let confidence: ConfidenceLevel;
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
    confidence = "high";
    reason =
      evaluationFit.kind === "best_fit"
        ? "Evaluation and performance agree on the same best-fit tier."
        : "Evaluation and performance agree the player sits on the same boundary.";
  } else if (overlap.length > 0 && span <= 1) {
    overallFit = fitFromTier(union);
    confidence = "medium";
    reason =
      "Evaluation and performance partially agree; player sits near a tier boundary.";
  } else if (span <= 1) {
    overallFit = fitFromTier(union);
    confidence = "medium";
    reason =
      "Evaluation and performance point to adjacent tiers — borderline case.";
  } else {
    overallFit = { kind: "disagreement", label: "Review Required" };
    confidence = "low";
    reason =
      "Large disagreement between evaluation and performance.";
  }

  const { action, actionLabel } = deriveAction(
    overallFit,
    confidence,
    currentTier,
  );

  return {
    evaluationFit,
    holisticFit,
    overallFit,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    stars: confidenceStars(confidence),
    action,
    actionLabel,
    reason,
    suggestedTier:
      overallFit.kind === "best_fit" ? overallFit.tier : undefined,
  };
}

function deriveAction(
  overallFit: OverallFit,
  confidence: ConfidenceLevel,
  currentTier: ReviewTier,
): { action: ActionKind; actionLabel: string } {
  if (confidence === "low" || overallFit.kind === "disagreement") {
    return { action: "review_required", actionLabel: "Review Required" };
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

  // Borderline between two tiers
  if (
    currentTier === overallFit.higher ||
    currentTier === overallFit.lower
  ) {
    return { action: "optional_review", actionLabel: "Optional Review" };
  }

  // Assigned tier is outside the indicated band — suggest moving toward it.
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
    case "optional_review":
      return 2;
    case "no_change":
      return 3;
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
