export type ScrimSeriesScoreInput = {
  sessionIndex: number;
  gameIndex: number;
  score: number;
};

export type ScrimSeriesBestNCell = {
  sessionIndex: number;
  gameIndex: number;
  score: number;
};

export function bestNCellKey(sessionIndex: number, gameIndex: number): string {
  return `${sessionIndex}:${gameIndex}`;
}

/**
 * Collapse score rows onto the series grid. Duplicate cells keep the higher
 * score; rows outside gamesPerSession are ignored so Best N matches what the UI shows.
 */
export function buildScrimSeriesScoreGrid(
  playerScores: ScrimSeriesScoreInput[],
  gamesPerSession: number[],
): {
  sessionScores: (number | null)[][];
  cells: ScrimSeriesBestNCell[];
} {
  const sessionScores: (number | null)[][] = gamesPerSession.map(
    (gamesInSession) => Array(gamesInSession).fill(null) as (number | null)[],
  );

  for (const score of playerScores) {
    if (
      score.sessionIndex < 0 ||
      score.sessionIndex >= sessionScores.length ||
      score.gameIndex < 0 ||
      score.gameIndex >= sessionScores[score.sessionIndex].length
    ) {
      continue;
    }

    const current = sessionScores[score.sessionIndex][score.gameIndex];
    if (current === null || score.score > current) {
      sessionScores[score.sessionIndex][score.gameIndex] = score.score;
    }
  }

  const cells: ScrimSeriesBestNCell[] = [];
  for (let sessionIndex = 0; sessionIndex < sessionScores.length; sessionIndex++) {
    for (let gameIndex = 0; gameIndex < sessionScores[sessionIndex].length; gameIndex++) {
      const score = sessionScores[sessionIndex][gameIndex];
      if (score !== null) {
        cells.push({ sessionIndex, gameIndex, score });
      }
    }
  }

  return { sessionScores, cells };
}

export function computeScrimSeriesBestN(
  cells: ScrimSeriesBestNCell[],
  bestN: number,
): {
  gamesPlayed: number;
  bestNTotal: number;
  countedCellKeys: string[];
} {
  const ranked = [...cells].sort(
    (a, b) =>
      b.score - a.score ||
      a.sessionIndex - b.sessionIndex ||
      a.gameIndex - b.gameIndex,
  );
  const counted = ranked.slice(0, Math.max(0, bestN));

  return {
    gamesPlayed: cells.length,
    bestNTotal: counted.reduce((sum, cell) => sum + cell.score, 0),
    countedCellKeys: counted.map((cell) => bestNCellKey(cell.sessionIndex, cell.gameIndex)),
  };
}

export function countedBestNCellKeySet(
  sessionScores: (number | null)[][],
  bestN: number,
): Set<string> {
  const cells: ScrimSeriesBestNCell[] = [];
  for (let sessionIndex = 0; sessionIndex < sessionScores.length; sessionIndex++) {
    for (let gameIndex = 0; gameIndex < sessionScores[sessionIndex].length; gameIndex++) {
      const score = sessionScores[sessionIndex][gameIndex];
      if (score !== null) {
        cells.push({ sessionIndex, gameIndex, score });
      }
    }
  }
  return new Set(computeScrimSeriesBestN(cells, bestN).countedCellKeys);
}
