import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
import { Trophy } from "lucide-react";
import ScrimSeriesLeaderboardTable from "@/components/scrim-series-leaderboard-table.tsx";

type LinkedScrimSeriesResultsProps = {
  seriesId: Id<"scrimSeries">;
  seriesName?: string;
};

export default function LinkedScrimSeriesResults({
  seriesId,
}: LinkedScrimSeriesResultsProps) {
  const series = useQuery(api.scrimSeries.queries.getSeries, { seriesId });
  const leaderboard = useQuery(api.scrimSeries.queries.getLeaderboard, { seriesId });

  if (series === undefined || leaderboard === undefined) {
    return <Skeleton className="h-[320px] w-full" />;
  }

  if (!series) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trophy />
          </EmptyMedia>
          <EmptyTitle>Scrim series not found</EmptyTitle>
          <EmptyDescription>
            The linked scrim series may have been deleted. Update the link in Events Manager.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trophy />
          </EmptyMedia>
          <EmptyTitle>No scores yet</EmptyTitle>
          <EmptyDescription>
            Import Yunite sessions from Admin → Scrim Series (open via Events Manager Trophy link when linked).
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrimSeriesLeaderboardTable
      entries={leaderboard}
      bestN={series.bestN}
      participationThreshold={series.participationThreshold}
      penaltyAmount={series.penaltyAmount}
      gamesPerSession={series.gamesPerSession}
    />
  );
}
