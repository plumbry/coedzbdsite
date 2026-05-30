// Greedy pairing algorithm that minimizes repeat matchups across games
// Supports both pure-duo events and mixed duo+solo events
// Enforces tier-based constraints (e.g. S-tier teams cannot be on the same squad)

type Pairing = {
  game: number;
  squads: { duo1Index: number; duo2Index: number }[];
  byeTeamIndex?: number;
};

// A "slot" is an entry in the unified pool: either a duo (team index) or
// a paired-solo group.  We merge solos into temporary teams before pairing.
type Solo = { playerName: string };

type PairingOptions = {
  /** Indices of teams that must NOT be paired with each other (e.g. S-tier teams) */
  forbiddenPairIndices?: Set<number>;
};

export type TierRestrictedOptions = {
  /** Map from team index to sorted tier string for its players (e.g. ["A","C"]) */
  teamTiers: Map<number, string[]>;
};

// ─── Tier Restriction Validation ───────────────────────────────
// Valid squad compositions (4 players) sorted alphabetically.
// Sourced from https://coedzbd.onhercules.app/tier-restrictions
const VALID_SQUAD_COMPOSITIONS: string[] = [
  "BCCS",  // S+B+C+C
  "CCCS",  // S+C+C+C
  "AACC",  // A+A+C+C
  "ABBC",  // A+B+B+C
  "ABCC",  // A+B+C+C
  "ACCC",  // A+C+C+C
  "BBBB",  // B+B+B+B
  "BBBC",  // B+B+B+C
  "BBCC",  // B+B+C+C
  "BCCC",  // B+C+C+C
  "CCCC",  // C+C+C+C
];

/**
 * Check if two duos can form a valid squad under tier restrictions.
 * Combines the tiers from both duos, sorts them, and checks against valid compositions.
 */
function isValidTierComposition(
  duoATiers: string[],
  duoBTiers: string[],
): boolean {
  const combined = [...duoATiers, ...duoBTiers]
    .map((t) => t.toUpperCase().charAt(0))
    .sort()
    .join("");
  return VALID_SQUAD_COMPOSITIONS.includes(combined);
}

/**
 * Check if two teams are forbidden from pairing (simple S-tier rule).
 */
function isForbiddenPair(
  a: number,
  b: number,
  options?: PairingOptions,
): boolean {
  if (!options?.forbiddenPairIndices) return false;
  return (
    options.forbiddenPairIndices.has(a) &&
    options.forbiddenPairIndices.has(b)
  );
}

/**
 * Check if two teams can be paired under tier-restricted mode.
 * Returns false if the combined tiers don't form a valid squad.
 */
function isTierRestricted(
  a: number,
  b: number,
  tierOptions?: TierRestrictedOptions,
): boolean {
  if (!tierOptions) return false;
  const tiersA = tierOptions.teamTiers.get(a);
  const tiersB = tierOptions.teamTiers.get(b);
  // If either team has no tier data, allow (can't enforce)
  if (!tiersA || !tiersB || tiersA.length === 0 || tiersB.length === 0) return false;
  return !isValidTierComposition(tiersA, tiersB);
}

/**
 * Convert solos into temporary duo-style team entries appended after existing teams.
 * Returns the new full team list (original teams + solo-pairs) so indices are stable.
 * Leftover solo (odd count) is tagged as a single-player team.
 * Fill teams (isFill === true) are excluded from the pairing pool.
 */
export function buildUnifiedTeamList(
  teams: { teamName: string; players: string[]; isFill?: boolean }[],
  solos: Solo[],
): { teamName: string; players: string[] }[] {
  // Only include active (non-fill) teams
  const unified = teams
    .filter((t) => !t.isFill)
    .map((t) => ({ teamName: t.teamName, players: t.players }));
  // Shuffle solos for randomness before pairing them
  const shuffled = [...solos];
  shuffleArray(shuffled);
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      unified.push({
        teamName: `${shuffled[i].playerName} & ${shuffled[i + 1].playerName}`,
        players: [shuffled[i].playerName, shuffled[i + 1].playerName],
      });
    } else {
      // Odd solo out — still gets a slot
      unified.push({
        teamName: shuffled[i].playerName,
        players: [shuffled[i].playerName],
      });
    }
  }
  return unified;
}

/**
 * Generate pairings for all games using a greedy algorithm
 * that tries to avoid repeat matchups and respects tier constraints.
 */
export function generateAllPairings(
  teamCount: number,
  gameCount: number,
  options?: PairingOptions,
  tierOptions?: TierRestrictedOptions,
): Pairing[] {
  const pairCounts: Record<string, number> = {};

  const getPairKey = (a: number, b: number): string => {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return `${min}-${max}`;
  };

  const getPairCount = (a: number, b: number): number => {
    return pairCounts[getPairKey(a, b)] || 0;
  };

  const incrementPairCount = (a: number, b: number): void => {
    const key = getPairKey(a, b);
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  };

  const pairings: Pairing[] = [];

  for (let game = 0; game < gameCount; game++) {
    const indices = Array.from({ length: teamCount }, (_, i) => i);
    shuffleArray(indices);

    const available = new Set(indices);
    const squads: { duo1Index: number; duo2Index: number }[] = [];
    let byeTeamIndex: number | undefined;

    if (teamCount % 2 !== 0) {
      const byeIdx = game % teamCount;
      byeTeamIndex = indices[byeIdx];
      available.delete(byeTeamIndex);
    }

    while (available.size >= 2) {
      const iter = available.values();
      const first = iter.next().value as number;
      available.delete(first);

      let bestPartner = -1;
      let bestCount = Infinity;

      for (const candidate of available) {
        // Skip forbidden pairs (e.g. both S-tier) in random mode
        if (isForbiddenPair(first, candidate, options)) continue;
        // Skip tier-invalid compositions in tier-restricted mode
        if (isTierRestricted(first, candidate, tierOptions)) continue;

        const count = getPairCount(first, candidate);
        if (count < bestCount) {
          bestCount = count;
          bestPartner = candidate;
        }
      }

      // Fallback: if no valid partner found, relax constraints
      if (bestPartner === -1) {
        for (const candidate of available) {
          const count = getPairCount(first, candidate);
          if (count < bestCount) {
            bestCount = count;
            bestPartner = candidate;
          }
        }
      }

      if (bestPartner !== -1) {
        available.delete(bestPartner);
        squads.push({ duo1Index: first, duo2Index: bestPartner });
        incrementPairCount(first, bestPartner);
      }
    }

    pairings.push({
      game: game + 1,
      squads,
      byeTeamIndex,
    });
  }

  return pairings;
}

/**
 * Generate pairings for a single game, considering history from existing pairings.
 * Used both for generating the next game and for rerolling a specific game.
 * Respects tier constraints (S-tier or full tier-restricted mode).
 */
export function generateSingleGamePairing(
  teamCount: number,
  gameNumber: number,
  existingPairings: Pairing[],
  options?: PairingOptions,
  tierOptions?: TierRestrictedOptions,
): Pairing {
  const pairCounts: Record<string, number> = {};

  const getPairKey = (a: number, b: number): string => {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return `${min}-${max}`;
  };

  const getPairCount = (a: number, b: number): number => {
    return pairCounts[getPairKey(a, b)] || 0;
  };

  for (const p of existingPairings) {
    if (p.game === gameNumber) continue;
    for (const squad of p.squads) {
      const key = getPairKey(squad.duo1Index, squad.duo2Index);
      pairCounts[key] = (pairCounts[key] || 0) + 1;
    }
  }

  const indices = Array.from({ length: teamCount }, (_, i) => i);
  shuffleArray(indices);

  const available = new Set(indices);
  const squads: { duo1Index: number; duo2Index: number }[] = [];
  let byeTeamIndex: number | undefined;

  if (teamCount % 2 !== 0) {
    const byeIdx = Math.floor(Math.random() * indices.length);
    byeTeamIndex = indices[byeIdx];
    available.delete(byeTeamIndex);
  }

  while (available.size >= 2) {
    const iter = available.values();
    const first = iter.next().value as number;
    available.delete(first);

    let bestPartner = -1;
    let bestCount = Infinity;

    for (const candidate of available) {
      // Skip forbidden pairs (e.g. both S-tier) in random mode
      if (isForbiddenPair(first, candidate, options)) continue;
      // Skip tier-invalid compositions in tier-restricted mode
      if (isTierRestricted(first, candidate, tierOptions)) continue;

      const count = getPairCount(first, candidate);
      if (count < bestCount) {
        bestCount = count;
        bestPartner = candidate;
      }
    }

    // Fallback if all remaining are restricted
    if (bestPartner === -1) {
      for (const candidate of available) {
        const count = getPairCount(first, candidate);
        if (count < bestCount) {
          bestCount = count;
          bestPartner = candidate;
        }
      }
    }

    if (bestPartner !== -1) {
      available.delete(bestPartner);
      squads.push({ duo1Index: first, duo2Index: bestPartner });
    }
  }

  return { game: gameNumber, squads, byeTeamIndex };
}

/**
 * @deprecated Use generateSingleGamePairing instead
 */
export const regenerateGamePairings = generateSingleGamePairing;

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}
