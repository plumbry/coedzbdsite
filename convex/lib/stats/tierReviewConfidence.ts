/** Competitive tiers used for review confidence (excludes D / Unranked). */
export const REVIEW_CONFIDENCE_TIERS = ["S", "A", "B", "C"] as const;
export type ReviewConfidenceTier = (typeof REVIEW_CONFIDENCE_TIERS)[number];

export type PositionBand = "top" | "middle" | "bottom";

export type ConfidenceLevel = "very_high" | "high" | "moderate" | "low";

export type ReviewRecommendation =
  | "no_review"
  | "borderline_promotion"
  | "borderline_demotion"
  | "review_required";

/** Percentile cutoffs for within-tier position bands. */
export const TOP_BAND_MIN_PERCENTILE = 75;
export const BOTTOM_BAND_MAX_PERCENTILE = 25;

/** Absolute percentile gap treated as substantial disagreement. */
export const DISAGREEMENT_PERCENTILE_GAP = 35;

/** Max gap for "very high" agreement in a comfortable zone. */
export const VERY_HIGH_MAX_GAP = 15;

/** Minimum percentile for both scores to count as comfortably mid/upper. */
export const COMFORTABLE_MIN_PERCENTILE = 40;

export function isReviewConfidenceTier(
  tier: string | undefined | null,
): tier is ReviewConfidenceTier {
  return (
    tier === "S" || tier === "A" || tier === "B" || tier === "C"
  );
}

/**
 * Percentile rank of `score` among `peerScores` (higher score = higher %).
 * Uses midrank ties. Returns 50 when the peer set is empty or singleton.
 */
export function computePercentileRank(
  score: number,
  peerScores: readonly number[],
): number {
  if (peerScores.length === 0) return 50;
  if (peerScores.length === 1) return 50;

  let below = 0;
  let equal = 0;
  for (const peer of peerScores) {
    if (peer < score) below += 1;
    else if (peer === score) equal += 1;
  }

  return ((below + 0.5 * equal) / peerScores.length) * 100;
}

export function bandFromPercentile(percentile: number): PositionBand {
  if (percentile >= TOP_BAND_MIN_PERCENTILE) return "top";
  if (percentile <= BOTTOM_BAND_MAX_PERCENTILE) return "bottom";
  return "middle";
}

/**
 * Human-readable placement within a tier.
 * Examples: "Top 8% of B", "Bottom 18% of A", "Middle 65% of A"
 */
export function formatPositionLabel(percentile: number, tier: string): string {
  const rounded = Math.round(percentile);
  if (percentile >= TOP_BAND_MIN_PERCENTILE) {
    const topPct = Math.max(1, Math.round(100 - percentile));
    return `Top ${topPct}% of ${tier}`;
  }
  if (percentile <= BOTTOM_BAND_MAX_PERCENTILE) {
    const bottomPct = Math.max(1, rounded);
    return `Bottom ${bottomPct}% of ${tier}`;
  }
  return `Middle ${rounded}% of ${tier}`;
}

export function confidenceStars(level: ConfidenceLevel): number {
  switch (level) {
    case "very_high":
      return 5;
    case "high":
      return 4;
    case "moderate":
      return 3;
    case "low":
      return 1;
  }
}

export function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "very_high":
      return "Very High";
    case "high":
      return "High";
    case "moderate":
      return "Moderate";
    case "low":
      return "Low";
  }
}

export function recommendationLabel(recommendation: ReviewRecommendation): string {
  switch (recommendation) {
    case "no_review":
      return "No Review Required";
    case "borderline_promotion":
      return "Borderline — Promotion Candidate";
    case "borderline_demotion":
      return "Borderline — Optional Review";
    case "review_required":
      return "Review Required";
  }
}

export type ConfidenceResult = {
  confidence: ConfidenceLevel;
  stars: number;
  recommendation: ReviewRecommendation;
  reason: string;
  evaluationBand: PositionBand;
  holisticBand: PositionBand;
  percentileGap: number;
};

/** S cannot promote; C cannot demote. Other edge boundaries remain review-worthy. */
export function hasPromotionOpportunity(tier: string): boolean {
  return tier !== "S";
}

export function hasDemotionOpportunity(tier: string): boolean {
  return tier !== "C";
}

/**
 * Compare evaluation vs holistic within-tier positions.
 * Agreement matters more than absolute score — final tier calls stay with admins.
 */
export function computeReviewConfidence(
  evaluationPercentile: number,
  holisticPercentile: number,
  currentTier: string,
): ConfidenceResult {
  const evaluationBand = bandFromPercentile(evaluationPercentile);
  const holisticBand = bandFromPercentile(holisticPercentile);
  const percentileGap = Math.abs(evaluationPercentile - holisticPercentile);

  const oppositeBoundaries =
    (evaluationBand === "top" && holisticBand === "bottom") ||
    (evaluationBand === "bottom" && holisticBand === "top");

  if (oppositeBoundaries || percentileGap >= DISAGREEMENT_PERCENTILE_GAP) {
    return {
      confidence: "low",
      stars: confidenceStars("low"),
      recommendation: "review_required",
      reason: "Evaluation and performance disagree.",
      evaluationBand,
      holisticBand,
      percentileGap,
    };
  }

  if (
    evaluationBand === holisticBand &&
    (evaluationBand === "top" || evaluationBand === "bottom")
  ) {
    const isPromotionEdge = evaluationBand === "top";
    const actionableBoundary = isPromotionEdge
      ? hasPromotionOpportunity(currentTier)
      : hasDemotionOpportunity(currentTier);

    // Top of S / bottom of C are not tier-move boundaries — treat as settled agreement.
    if (!actionableBoundary) {
      if (percentileGap <= VERY_HIGH_MAX_GAP) {
        return {
          confidence: "very_high",
          stars: confidenceStars("very_high"),
          recommendation: "no_review",
          reason: isPromotionEdge
            ? "Both systems place the player near the top of S (no promotion tier)."
            : "Both systems place the player near the bottom of C (no demotion tier).",
          evaluationBand,
          holisticBand,
          percentileGap,
        };
      }
      return {
        confidence: "high",
        stars: confidenceStars("high"),
        recommendation: "no_review",
        reason: isPromotionEdge
          ? "Both systems place the player near the top of S (no promotion tier)."
          : "Both systems place the player near the bottom of C (no demotion tier).",
        evaluationBand,
        holisticBand,
        percentileGap,
      };
    }

    return {
      confidence: "moderate",
      stars: confidenceStars("moderate"),
      recommendation: isPromotionEdge
        ? "borderline_promotion"
        : "borderline_demotion",
      reason: isPromotionEdge
        ? "Both systems place the player near the top of their tier."
        : "Both systems place the player near the bottom of their tier.",
      evaluationBand,
      holisticBand,
      percentileGap,
    };
  }

  if (
    percentileGap <= VERY_HIGH_MAX_GAP &&
    evaluationPercentile >= COMFORTABLE_MIN_PERCENTILE &&
    holisticPercentile >= COMFORTABLE_MIN_PERCENTILE
  ) {
    return {
      confidence: "very_high",
      stars: confidenceStars("very_high"),
      recommendation: "no_review",
      reason: "Both systems place the player comfortably in their tier.",
      evaluationBand,
      holisticBand,
      percentileGap,
    };
  }

  return {
    confidence: "high",
    stars: confidenceStars("high"),
    recommendation: "no_review",
    reason: "Evaluation and performance generally agree.",
    evaluationBand,
    holisticBand,
    percentileGap,
  };
}

/** Sort priority: review-needed first, then borderline, then stable. */
export function confidenceSortRank(level: ConfidenceLevel): number {
  switch (level) {
    case "low":
      return 0;
    case "moderate":
      return 1;
    case "high":
      return 2;
    case "very_high":
      return 3;
  }
}
