import { describe, expect, test } from "vitest";
import {
  bestNCellKey,
  buildScrimSeriesScoreGrid,
  computeScrimSeriesBestN,
  countedBestNCellKeySet,
} from "./scrimSeriesBestN";

describe("scrim series Best N", () => {
  test("sums the highest N in-grid game scores", () => {
    const { cells } = buildScrimSeriesScoreGrid(
      [
        { sessionIndex: 0, gameIndex: 0, score: 40 },
        { sessionIndex: 0, gameIndex: 1, score: 10 },
        { sessionIndex: 1, gameIndex: 0, score: 30 },
        { sessionIndex: 1, gameIndex: 1, score: 20 },
      ],
      [2, 2],
    );

    expect(computeScrimSeriesBestN(cells, 3)).toEqual({
      gamesPlayed: 4,
      bestNTotal: 90,
      countedCellKeys: [
        bestNCellKey(0, 0),
        bestNCellKey(1, 0),
        bestNCellKey(1, 1),
      ],
    });
  });

  test("ignores duplicate rows and out-of-grid scores", () => {
    const { sessionScores, cells } = buildScrimSeriesScoreGrid(
      [
        { sessionIndex: 0, gameIndex: 0, score: 12 },
        { sessionIndex: 0, gameIndex: 0, score: 18 },
        { sessionIndex: 0, gameIndex: 1, score: 7 },
        { sessionIndex: 2, gameIndex: 0, score: 99 },
        { sessionIndex: 0, gameIndex: 5, score: 99 },
      ],
      [2],
    );

    expect(sessionScores).toEqual([[18, 7]]);
    expect(computeScrimSeriesBestN(cells, 2)).toMatchObject({
      gamesPlayed: 2,
      bestNTotal: 25,
    });
  });

  test("counts every game when the player has fewer than N scores", () => {
    const { cells } = buildScrimSeriesScoreGrid(
      [{ sessionIndex: 0, gameIndex: 0, score: 15 }],
      [3],
    );

    expect(computeScrimSeriesBestN(cells, 18)).toEqual({
      gamesPlayed: 1,
      bestNTotal: 15,
      countedCellKeys: [bestNCellKey(0, 0)],
    });
  });

  test("marks the same cells the leaderboard total uses", () => {
    const { sessionScores } = buildScrimSeriesScoreGrid(
      [
        { sessionIndex: 0, gameIndex: 0, score: 8 },
        { sessionIndex: 0, gameIndex: 1, score: 6 },
        { sessionIndex: 0, gameIndex: 2, score: 9 },
      ],
      [3],
    );

    expect(countedBestNCellKeySet(sessionScores, 2)).toEqual(
      new Set([bestNCellKey(0, 2), bestNCellKey(0, 0)]),
    );
  });
});
