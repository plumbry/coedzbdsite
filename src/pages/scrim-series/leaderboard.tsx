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
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Trophy } from "lucide-react";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import ScrimSeriesLeaderboardTable from "@/components/scrim-series-leaderboard-table.tsx";

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
      <PageShell>
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
      </PageShell>
    );
  }

  // Loading state
  if (series === undefined || leaderboard === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </PageShell>
    );
  }

  if (!series) {
    return (
      <PageShell>
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
      </PageShell>
    );
  }

  const totalGames = series.gamesPerSession.reduce((a: number, b: number) => a + b, 0);

  return (
    <PageShell>
      <PageHeader
        title={series.name}
        icon={Trophy}
        description={`Best ${series.bestN} of ${totalGames} games`}
        back={{ label: "Back to Scrim Series", href: "/scrim-series" }}
        actions={
          <Badge variant={series.isActive ? "default" : "secondary"}>
            {series.isActive ? "Active" : "Completed"}
          </Badge>
        }
      />

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
        <ScrimSeriesLeaderboardTable
          entries={leaderboard}
          bestN={series.bestN}
          participationThreshold={series.participationThreshold}
          penaltyAmount={series.penaltyAmount}
          gamesPerSession={series.gamesPerSession}
        />
      )}
    </PageShell>
  );
}

