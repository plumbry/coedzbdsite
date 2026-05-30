import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Trophy, ArrowLeft, Columns3, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import SiteHeader from "@/components/site-header.tsx";

export default function ScrimSeriesLeaderboardPage() {
  const { slug } = useParams<{ slug: string }>();

  // Try slug lookup first
  const seriesBySlug = useQuery(
    api.scrimSeries.queries.getSeriesBySlug,
    slug ? { slug } : "skip"
  );

  // Fallback: try direct ID lookup if slug didn't match
  const seriesById = useQuery(
    api.scrimSeries.queries.getSeries,
    slug && seriesBySlug === null
      ? { seriesId: slug as Id<"scrimSeries"> }
      : "skip"
  );

  const series = seriesBySlug || seriesById;

  const leaderboard = useQuery(
    api.scrimSeries.queries.getLeaderboard,
    series ? { seriesId: series._id } : "skip"
  );

  if (!slug) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-7xl px-6 py-16">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy />
              </EmptyMedia>
              <EmptyTitle>No Series Selected</EmptyTitle>
              <EmptyDescription>
                Go back to view all series.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  // Loading state
  if (series === undefined || leaderboard === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="border-b bg-card">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <Skeleton className="h-10 w-64" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-7xl px-6 py-16">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy />
              </EmptyMedia>
              <EmptyTitle>Series Not Found</EmptyTitle>
              <EmptyDescription>
                This series may have been deleted.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Link
              to="/scrim-series"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Trophy className="h-7 w-7 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {series.name}
            </h1>
            <Badge variant={series.isActive ? "default" : "secondary"}>
              {series.isActive ? "Active" : "Completed"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm ml-8 sm:ml-11">
            Best {series.bestN} of{" "}
            {series.gamesPerSession.reduce((a: number, b: number) => a + b, 0)}{" "}
            games
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {leaderboard.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy />
              </EmptyMedia>
              <EmptyTitle>No Scores Yet</EmptyTitle>
              <EmptyDescription>
                No players have scores recorded for this series.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <LeaderboardTable
            entries={leaderboard}
            bestN={series.bestN}
            penaltyAmount={series.penaltyAmount}
            gamesPerSession={series.gamesPerSession}
          />
        )}
      </div>
    </div>
  );
}

type LeaderboardEntry = {
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

function LeaderboardTable({
  entries,
  bestN,
  penaltyAmount,
  gamesPerSession,
}: {
  entries: LeaderboardEntry[];
  bestN: number;
  penaltyAmount: number;
  gamesPerSession: number[];
}) {
  const [showDetails, setShowDetails] = useState(false);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const topSpacerRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  // Sync the top scrollbar spacer width to the actual table scroll width
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

  // Build flat list of game labels: "S1G1", "S1G2", "S2G1", etc.
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
        {/* Top scrollbar */}
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto"
        >
          <div ref={topSpacerRef} style={{ height: 1 }} />
        </div>

        {/* Table with bottom scrollbar */}
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
                          {entry.totalGames > 0 ? Math.round((entry.gamesPlayed / entry.totalGames) * 100) : 0}%
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
