/** Frontend mirror of `convex/lib/stats/types.ts` — keep in sync when changing internal stats shape. */
export type InternalPlayerStats = {
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

/** ZBD performance tab summary — see `convex/lib/stats/zbdPerformanceStats.ts`. */
export type ZbdPerformanceStats = {
  totalGames: number;
  eventsPlayed: number;
  totalMatches: number;
  matchWins: number;
  winRate: number;
  winCount: number;
  averagePlacement: number;
  averageKD: number;
  killsPerMatch: number;
  deathsPerMatch: number;
  averageKd: number;
  totalEliminations: number;
  top3Finishes: number;
  averageScore: number;
  manualEventsCount: number;
  yuniteTournamentRows: number;
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
