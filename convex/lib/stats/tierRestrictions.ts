/**
 * Canonical ZBD tier restriction combos and expected teammate-strength priors.
 * Kept in sync with /tier-restrictions (Duos / Trios / Squads allow-lists).
 *
 * Strength scale: S=4, A=3, B=2, C=1 (matches avgTeammateTier).
 */

export type RestrictionTier = "S" | "A" | "B" | "C";
export type TeamFormat = "duos" | "trios" | "squads";

export const TIER_STRENGTH: Record<RestrictionTier, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

export const DUOS_COMBOS: RestrictionTier[][] = [
  ["S", "C"],
  ["A", "B"],
  ["A", "C"],
  ["B", "B"],
  ["B", "C"],
  ["C", "C"],
];

export const TRIOS_COMBOS: RestrictionTier[][] = [
  ["S", "B", "C"],
  ["S", "C", "C"],
  ["A", "A", "C"],
  ["A", "B", "B"],
  ["A", "B", "C"],
  ["A", "C", "C"],
  ["B", "B", "B"],
  ["B", "B", "C"],
  ["B", "C", "C"],
  ["C", "C", "C"],
];

export const SQUADS_COMBOS: RestrictionTier[][] = [
  ["S", "B", "C", "C"],
  ["S", "C", "C", "C"],
  ["A", "A", "C", "C"],
  ["A", "B", "B", "C"],
  ["A", "B", "C", "C"],
  ["A", "C", "C", "C"],
  ["B", "B", "B", "B"],
  ["B", "B", "B", "C"],
  ["B", "B", "C", "C"],
  ["B", "C", "C", "C"],
  ["C", "C", "C", "C"],
];

const COMBOS_BY_FORMAT: Record<TeamFormat, RestrictionTier[][]> = {
  duos: DUOS_COMBOS,
  trios: TRIOS_COMBOS,
  squads: SQUADS_COMBOS,
};

export function isRestrictionTier(
  tier: string | undefined | null,
): tier is RestrictionTier {
  return tier === "S" || tier === "A" || tier === "B" || tier === "C";
}

export function inferTeamFormat(
  teamSize: number | undefined | null,
): TeamFormat | null {
  if (teamSize === 2) return "duos";
  if (teamSize === 3) return "trios";
  if (teamSize === 4) return "squads";
  return null;
}

/**
 * Mean teammate strength for a player of `playerTier` under uniform draw
 * over allowed combos that include that tier (one seat occupied by the player).
 */
export function expectedTeammateStrengthFromRestrictions(
  playerTier: RestrictionTier,
  format: TeamFormat,
): number | undefined {
  const combos = COMBOS_BY_FORMAT[format];
  const slotAverages: number[] = [];

  for (const combo of combos) {
    const seats = [...combo];
    const idx = seats.indexOf(playerTier);
    if (idx < 0) continue;
    seats.splice(idx, 1);
    if (seats.length === 0) continue;
    const avg =
      seats.reduce((sum, t) => sum + TIER_STRENGTH[t], 0) / seats.length;
    slotAverages.push(avg);
  }

  if (slotAverages.length === 0) return undefined;
  return slotAverages.reduce((a, b) => a + b, 0) / slotAverages.length;
}

/**
 * Restriction prior averaged across formats.
 * Optional weights (e.g. from historical team-size mix); defaults to equal.
 */
export function restrictionPriorTeammateStrength(
  playerTier: RestrictionTier,
  formatWeights?: Partial<Record<TeamFormat, number>>,
): number {
  const formats: TeamFormat[] = ["duos", "trios", "squads"];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const format of formats) {
    const expected = expectedTeammateStrengthFromRestrictions(
      playerTier,
      format,
    );
    if (expected === undefined) continue;
    const weight = formatWeights?.[format] ?? 1;
    if (weight <= 0) continue;
    weightedSum += expected * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) {
    // Fallback: mid-pool
    return TIER_STRENGTH[playerTier];
  }
  return weightedSum / weightTotal;
}

/** Empirical-Bayes blend of observed median toward restriction prior. */
export function blendExpectedTeammateStrength(input: {
  empiricalMedian?: number;
  empiricalCount: number;
  restrictionPrior: number;
  /** Prior strength in "pseudo-observations". */
  priorStrength?: number;
}): number {
  const k = input.priorStrength ?? 10;
  const n = Math.max(0, input.empiricalCount);
  if (input.empiricalMedian === undefined || n === 0) {
    return input.restrictionPrior;
  }
  const w = n / (n + k);
  return w * input.empiricalMedian + (1 - w) * input.restrictionPrior;
}

export type CompositionBias =
  | "stronger_than_expected"
  | "as_expected"
  | "weaker_than_expected";

/**
 * Classify actual vs expected teammate strength.
 * Thresholds are in tier-strength units (1.0 ≈ one full tier).
 */
export function classifyCompositionResidual(
  residual: number,
  options?: { soft?: number; strong?: number },
): CompositionBias {
  const soft = options?.soft ?? 0.35;
  if (residual >= soft) return "stronger_than_expected";
  if (residual <= -soft) return "weaker_than_expected";
  return "as_expected";
}

export function compositionBiasLabel(bias: CompositionBias): string {
  switch (bias) {
    case "stronger_than_expected":
      return "Stronger teammates than expected";
    case "weaker_than_expected":
      return "Weaker teammates than expected";
    case "as_expected":
      return "Teammates in line with restrictions";
  }
}

/**
 * How many holistic points to move per +1 teammate-strength residual,
 * derived from adjacent raw holistic tier-center gaps.
 * One strength unit ≈ one tier; we attribute ~half a tier-gap to composition.
 */
export function estimateHolisticPointsPerTeammateStrength(
  holisticCenters: Partial<Record<RestrictionTier, number>>,
): number {
  const order: RestrictionTier[] = ["S", "A", "B", "C"];
  const gaps: number[] = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = holisticCenters[order[i]!];
    const b = holisticCenters[order[i + 1]!];
    if (a !== undefined && b !== undefined) {
      gaps.push(Math.abs(a - b));
    }
  }
  if (gaps.length === 0) return 5;
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  return avgGap * 0.5;
}

/**
 * Restriction-adjusted holistic for comparisons/recommendations.
 * Does not replace the stored raw holistic score.
 *
 * Positive residual (stronger teammates than expected) → lower adjusted score.
 * Negative residual (weaker teammates than expected) → higher adjusted score.
 */
export function adjustHolisticForTeammateComposition(input: {
  rawHolistic: number;
  residual?: number;
  pointsPerStrengthUnit: number;
  /** Cap |delta| at this many strength-units × pointsPerStrengthUnit. */
  maxStrengthUnits?: number;
}): { adjustedHolistic: number; adjustmentDelta: number } {
  if (input.residual === undefined || !Number.isFinite(input.residual)) {
    return { adjustedHolistic: input.rawHolistic, adjustmentDelta: 0 };
  }

  let delta = -input.residual * input.pointsPerStrengthUnit;
  const maxAbs =
    input.pointsPerStrengthUnit * (input.maxStrengthUnits ?? 1.5);
  if (delta > maxAbs) delta = maxAbs;
  if (delta < -maxAbs) delta = -maxAbs;

  const adjustedHolistic = Math.round((input.rawHolistic + delta) * 10) / 10;
  const adjustmentDelta = Math.round(delta * 10) / 10;
  return { adjustedHolistic, adjustmentDelta };
}
