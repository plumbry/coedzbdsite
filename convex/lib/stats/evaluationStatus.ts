export type EvaluationStatus =
  | "Strong Promotion Outlier"
  | "Eligible for Promotion Evaluation"
  | "Stable"
  | "Eligible for Demotion Evaluation"
  | "Strong Demotion Outlier"
  | "Insufficient Data";

export function deriveEvaluationStatus(input: {
  totalEvents: number;
  promotionDiff?: number;
  demotionDiff?: number;
  /** Minimum events required before tier comparison applies. */
  minEvents?: number;
  /** When set, require at least one recent event before comparing. */
  recentEvents?: number;
}): EvaluationStatus {
  const minEvents = input.minEvents ?? 8;

  if (input.totalEvents < minEvents) {
    return "Insufficient Data";
  }
  if (input.recentEvents === 0) {
    return "Insufficient Data";
  }

  const { promotionDiff, demotionDiff } = input;

  if (promotionDiff !== undefined && promotionDiff > 5) {
    return "Strong Promotion Outlier";
  }
  if (promotionDiff !== undefined && promotionDiff > 0) {
    return "Eligible for Promotion Evaluation";
  }
  if (demotionDiff !== undefined && demotionDiff < -5) {
    return "Strong Demotion Outlier";
  }
  if (demotionDiff !== undefined && demotionDiff < 0) {
    return "Eligible for Demotion Evaluation";
  }
  return "Stable";
}
