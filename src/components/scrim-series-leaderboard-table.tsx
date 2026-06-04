import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Columns3, EyeOff } from "lucide-react";

export type ScrimSeriesLeaderboardEntry = {
  playerId: string;
  playerName: string;
  epicId: string;
  sessionScores: (number | null)[][];
  gamesPlayed: number;
  totalGames: number;
  bestNTotal: number;
  isValid: boolean;
  penaltyTotal: number;
  penaltyCount: number;
  finalTotal: number;
};

export default function ScrimSeriesLeaderboardTable({
  entries,
  bestN,
  penaltyAmount,
  gamesPerSession,
}: {
  entries: ScrimSeriesLeaderboardEntry[];
  bestN: number;
  penaltyAmount: number;
  gamesPerSession: number[];
}) {
  const [showDetails, setShowDetails] = useState(false);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const topSpacerRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    if (!tableEl || !topSpacerRef.current) return;

    const syncWidth = () => {
      if (topSpacerRef.current && tableEl) {
        topSpacerRef.current.style.width = `${tableEl.scrollWidth}px`;
      }
    };

    syncWidth();

    const observer = new ResizeObserver(syncWidth);
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [showDetails]);

  const handleTopScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
    isSyncing.current = false;
  }, []);

  const handleTableScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (topScrollRef.current && tableScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
    isSyncing.current = false;
  }, []);

  const gameColumns: { session: number; game: number; label: string }[] = [];
  for (let s = 0; s < gamesPerSession.length; s++) {
    for (let g = 0; g < gamesPerSession[s]; g++) {
      gameColumns.push({
        session: s,
        game: g,
        label: `S${s + 1}G${g + 1}`,
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="gap-2 cursor-pointer"
        >
          {showDetails ? (
            <>
              <EyeOff className="h-4 w-4" />
              Hide Details
            </>
          ) : (
            <>
              <Columns3 className="h-4 w-4" />
              Show Details
            </>
          )}
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto"
        >
          <div ref={topSpacerRef} style={{ height: 1 }} />
        </div>

        <div
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className="overflow-x-auto"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-3 text-left font-semibold text-muted-foreground w-10">
                  #
                </th>
                <th className="sticky left-[40px] z-10 bg-muted/50 px-3 py-3 text-left font-semibold text-muted-foreground min-w-[140px]">
                  Player
                </th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground min-w-[120px]">
                  Epic ID
                </th>
                {showDetails && gameColumns.map((col) => (
                  <th
                    key={col.label}
                    className="px-2 py-3 text-center font-semibold text-muted-foreground min-w-[45px] text-xs"
                  >
                    {col.label}
                  </th>
                ))}
                {showDetails && (
                  <th className="px-3 py-3 text-center font-semibold text-muted-foreground min-w-[60px]">
                    Games
                  </th>
                )}
                <th className="px-3 py-3 text-center font-semibold text-muted-foreground min-w-[80px]">
                  Best {bestN}
                </th>
                {showDetails && (
                  <th className="px-3 py-3 text-center font-semibold text-muted-foreground min-w-[80px]">
                    Penalties
                  </th>
                )}
                <th className="px-3 py-3 text-center font-bold text-foreground min-w-[70px]">
                  Final
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, rank) => {
                const isTopThree = rank < 3;
                const rankDisplay = rank + 1;

                return (
                  <tr
                    key={entry.playerId}
                    className="border-b last:border-b-0 transition-colors hover:bg-muted/30"
                  >
                    <td className="sticky left-0 z-10 bg-card px-3 py-2.5 font-mono text-sm">
                      {isTopThree ? (
                        <span>
                          {rankDisplay === 1 && "🥇"}
                          {rankDisplay === 2 && "🥈"}
                          {rankDisplay === 3 && "🥉"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{rankDisplay}</span>
                      )}
                    </td>

                    <td className="sticky left-[40px] z-10 bg-card px-3 py-2.5">
                      <div className="font-medium text-foreground">{entry.playerName}</div>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="text-muted-foreground text-xs font-mono truncate max-w-[160px]">
                        {entry.epicId}
                      </div>
                    </td>

                    {showDetails && gameColumns.map((col) => {
                      const score = entry.sessionScores[col.session]?.[col.game];
                      return (
                        <td
                          key={col.label}
                          className="px-2 py-2.5 text-center font-mono text-xs"
                        >
                          {score !== null && score !== undefined ? (
                            <span className="text-foreground">{score}</span>
                          ) : (
                            <span className="text-muted-foreground/30">-</span>
                          )}
                        </td>
                      );
                    })}

                    {showDetails && (
                      <td className="px-3 py-2.5 text-center text-muted-foreground font-mono text-xs">
                        {entry.gamesPlayed}/{entry.totalGames}
                        <div className="text-xs">
                          {entry.totalGames > 0
                            ? Math.round((entry.gamesPlayed / entry.totalGames) * 100)
                            : 0}
                          %
                        </div>
                      </td>
                    )}

                    <td className="px-3 py-2.5 text-center font-mono font-medium text-foreground">
                      {entry.bestNTotal}
                    </td>

                    {showDetails && (
                      <td className="px-3 py-2.5 text-center">
                        {entry.penaltyCount > 0 ? (
                          <span className="text-destructive font-medium text-xs">
                            -{entry.penaltyCount * penaltyAmount} ({entry.penaltyCount})
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">0</span>
                        )}
                      </td>
                    )}

                    <td className="px-3 py-2.5 text-center font-mono text-sm font-bold text-foreground">
                      {entry.finalTotal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
