import { forwardRef } from "react";
import type { ScrimSeriesLeaderboardEntry } from "@/components/scrim-series-leaderboard-table.tsx";
import type { ScrimSeriesLeaderboardExportOptions } from "@/lib/scrim-series-leaderboard-export.ts";

interface ScrimSeriesLeaderboardImageExportProps {
  seriesName: string;
  bestN: number;
  participationThreshold: number;
  penaltyAmount: number;
  totalGames: number;
  entries: ScrimSeriesLeaderboardEntry[];
  playerLimit?: number;
  options: ScrimSeriesLeaderboardExportOptions;
}

function rankLabel(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

const cellStyle = { padding: "10px 14px" } as const;
const headerCellStyle = {
  ...cellStyle,
  fontSize: "15px",
  fontWeight: 600,
  color: "#4b5563",
} as const;

const ScrimSeriesLeaderboardImageExport = forwardRef<
  HTMLDivElement,
  ScrimSeriesLeaderboardImageExportProps
>(function ScrimSeriesLeaderboardImageExport(
  {
    seriesName,
    bestN,
    participationThreshold,
    penaltyAmount,
    totalGames,
    entries,
    playerLimit,
    options,
  },
  ref,
) {
  const playersLabel = playerLimit
    ? `Top ${playerLimit} · ${entries.length} players shown`
    : `${entries.length} players shown`;

  return (
    <div
      ref={ref}
      className="bg-white text-gray-900"
      style={{
        width: 1080,
        padding: 32,
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>
          {seriesName}
        </h1>
        {options.showScoringRules && (
          <p style={{ fontSize: 18, color: "#4b5563", marginTop: 8, marginBottom: 0 }}>
            Best {bestN} of {totalGames} games · {participationThreshold}% min participation · −
            {penaltyAmount} pts per penalty
          </p>
        )}
        {options.showPlayerCount && (
          <p style={{ fontSize: 16, color: "#6b7280", marginTop: 6, marginBottom: 0 }}>
            {playersLabel}
          </p>
        )}
      </div>

      <div style={{ overflow: "hidden", borderRadius: 12, border: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
              <th style={{ ...headerCellStyle, textAlign: "left", width: 56 }}>#</th>
              <th style={{ ...headerCellStyle, textAlign: "left" }}>Player</th>
              {options.showGamesColumn && (
                <th style={{ ...headerCellStyle, textAlign: "center", width: 120 }}>Games</th>
              )}
              <th style={{ ...headerCellStyle, textAlign: "center", width: 120 }}>
                Best {bestN}
              </th>
              {options.showPenaltiesColumn && (
                <th style={{ ...headerCellStyle, textAlign: "center", width: 120 }}>Penalties</th>
              )}
              <th style={{ ...headerCellStyle, textAlign: "center", width: 96, color: "#111827" }}>
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
                <tr
                  key={entry.playerId}
                  style={{
                    borderBottom:
                      index === entries.length - 1 ? "none" : "1px solid #e5e7eb",
                  }}
                >
                  <td
                    style={{
                      ...cellStyle,
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 16,
                      color: "#374151",
                    }}
                  >
                    {rankLabel(rank)}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 17, fontWeight: 600, color: "#111827" }}>
                    {entry.playerName}
                  </td>
                  {options.showGamesColumn && (
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 16,
                          color: "#374151",
                        }}
                      >
                        {entry.gamesPlayed}/{entry.totalGames}
                      </div>
                      {options.showParticipationPercent && (
                        <div style={{ fontSize: 14, color: "#6b7280", marginTop: 2 }}>
                          {participationPct}%
                        </div>
                      )}
                    </td>
                  )}
                  <td
                    style={{
                      ...cellStyle,
                      textAlign: "center",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 17,
                      fontWeight: 600,
                      color: "#111827",
                    }}
                  >
                    {entry.bestNTotal}
                  </td>
                  {options.showPenaltiesColumn && (
                    <td
                      style={{
                        ...cellStyle,
                        textAlign: "center",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 16,
                        color: "#374151",
                      }}
                    >
                      {entry.penaltyCount > 0
                        ? `−${entry.penaltyTotal} (${entry.penaltyCount})`
                        : "0"}
                    </td>
                  )}
                  <td
                    style={{
                      ...cellStyle,
                      textAlign: "center",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
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
