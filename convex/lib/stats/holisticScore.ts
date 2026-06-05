import type { Doc } from "../../_generated/dataModel.d.ts";

export type HolisticComponentScores = {
  placementScore: number;
  winRateScore: number;
  killsScore: number;
  deathsScore?: number;
};

export function computeHolisticComponentScores(input: {
  avgPlacement: number;
  winRate: number;
  killsPerMatch: number;
  deathsPerMatch?: number;
}): HolisticComponentScores {
  const placementScore = Math.max(0, Math.min(100, (50 - input.avgPlacement) * 2));
  const winRateScore = Math.min(100, input.winRate * 7.5);
  const killsScore = Math.min(100, (input.killsPerMatch / 5) * 100);
  const deathsScore =
    input.deathsPerMatch !== undefined
      ? Math.max(0, Math.min(100, (3 - input.deathsPerMatch) * 33.33))
      : undefined;

  return { placementScore, winRateScore, killsScore, deathsScore };
}

export function averageHolisticComponents(
  components: HolisticComponentScores,
): number {
  const scores = [
    components.placementScore,
    components.winRateScore,
    components.killsScore,
    components.deathsScore,
  ].filter((s): s is number => s !== undefined);

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/** Cached DCA + TC multipliers from player rebuild caches. */
export function getPlayerDcaCpm(
  player: Doc<"players">,
  options?: { applyTCPenalty?: boolean },
): { dca: number; cpm: number } {
  const dca = player.dcaCache?.dca ?? 1.0;
  const applyTCPenalty = options?.applyTCPenalty !== false;
  const cs = player.contributionScore?.score;
  const cpm =
    applyTCPenalty && cs !== undefined ? 0.65 + 0.35 * cs : 1.0;
  return { dca, cpm };
}

export function applyDcaTcToHolistic(
  baseHolistic: number,
  dca: number,
  cpm: number,
): number {
  return baseHolistic * dca * cpm;
}

export function roundHolisticScore(score: number): number {
  return Math.round(score * 10) / 10;
}
