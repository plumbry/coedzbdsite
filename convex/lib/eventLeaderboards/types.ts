/** Member row shown on event leaderboard tables. */
export type EventLeaderboardMember = {
  epicUsername: string;
  playerId: string | null;
  playerName: string;
  discordUsername: string | null;
  tier?: string | null;
};

/** Team row aggregated for one import (weekly tab). */
export type WeeklyTeamResult = {
  teamId: string;
  teamName: string;
  placement: number;
  totalPoints: number;
  eliminations: number;
  wins: number;
  members: EventLeaderboardMember[];
};

/** Team aggregated across imports before rank assignment. */
export type CumulativeTeamResult = {
  rank: number;
  teamId: string;
  teamName: string;
  totalPoints: number;
  bestPlacement: number;
  totalEliminations: number;
  gamesPlayed: number;
  members: EventLeaderboardMember[];
};
