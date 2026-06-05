/** Canonical internal (ZBD / Yunite) player statistics — excludes external CSV imports. */
export type InternalPlayerStats = {
  /** Distinct Yunite leaderboard imports (`thirdPartyImports`) for this player. */
  eventsPlayed: number;
  totalMatches: number;
  matchWins: number;
  winRate: number;
  killsPerMatch: number;
  deathsPerMatch: number;
  averageKd: number;
  averagePlacement: number;
  top3Finishes: number;
  totalEliminations: number;
};

export const EMPTY_INTERNAL_PLAYER_STATS: InternalPlayerStats = {
  eventsPlayed: 0,
  totalMatches: 0,
  matchWins: 0,
  winRate: 0,
  killsPerMatch: 0,
  deathsPerMatch: 0,
  averageKd: 0,
  averagePlacement: 0,
  top3Finishes: 0,
  totalEliminations: 0,
};
