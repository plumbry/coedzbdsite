import { forwardRef } from "react";
import type { ScrimSeriesLeaderboardEntry } from "@/components/scrim-series-leaderboard-table.tsx";

interface ScrimSeriesLeaderboardImageExportProps {
  seriesName: string;
  bestN: number;
  participationThreshold: number;
  penaltyAmount: number;
  totalGames: number;
  entries: ScrimSeriesLeaderboardEntry[];
  playerLimit?: number;
}

function rankLabel(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

const ScrimSeriesLeaderboardImageExport = forwardRef<
  HTMLDivElement,
  ScrimSeriesLeaderboardImageExportProps
>(function ScrimSeriesLeaderboardImageExport(
  { seriesName, bestN, participationThreshold, penaltyAmount, totalGames, entries, playerLimit },
  ref,
) {
  const playersLabel = playerLimit
    ? `Top ${playerLimit} · ${entries.length} players shown`
    : `${entries.length} players shown`;

  return (
    <div
      ref={ref}
      className="w-[920px] bg-white p-6 text-gray-900"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <div className="mb-4 space-y-1">
        <h1 className="text-xl font-semibold">{seriesName}</h1>
        <p className="text-sm text-gray-600">
          Best {bestN} of {totalGames} games · {participationThreshold}% min participation · −
          {penaltyAmount} pts per penalty
        </p>
        <p className="text-xs text-gray-500">{playersLabel}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 w-10">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Player</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 w-24">Games</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 w-24">
                Best {bestN}
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 w-24">
                Penalties
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 w-20">
                Final
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const rank = index + 1;
              const participationPct =
                entry.totalGames > 0
                  ? Math.round((entry.gamesPlayed / entry.totalGames) * 100)
                  : 0;

              return (
                <tr key={entry.playerId} className="border-b border-gray-200 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-sm text-gray-700">{rankLabel(rank)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{entry.playerName}</div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-gray-700">
                    <div>
                      {entry.gamesPlayed}/{entry.totalGames}
                    </div>
                    <div className="text-[11px] text-gray-500">{participationPct}%</div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono font-medium text-gray-900">
                    {entry.bestNTotal}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-gray-700">
                    {entry.penaltyCount > 0
                      ? `−${entry.penaltyCount * penaltyAmount} (${entry.penaltyCount})`
                      : "0"}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-sm font-bold text-gray-900">
                    {entry.finalTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default ScrimSeriesLeaderboardImageExport;
