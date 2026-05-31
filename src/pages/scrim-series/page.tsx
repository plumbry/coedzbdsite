import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Trophy, ArrowRight } from "lucide-react";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";

export default function ScrimSeriesLandingPage() {
  const allSeries = useQuery(api.scrimSeries.queries.listSeries, {});

  return (
    <PageShell>
      <PageHeader
        title="Scrim Series"
        icon={Trophy}
        description="View leaderboards for each scrim series"
      />

      {allSeries === undefined ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : allSeries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trophy />
            </EmptyMedia>
            <EmptyTitle>No Scrim Series Available</EmptyTitle>
            <EmptyDescription>
              Check back later for leaderboard results.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allSeries.map((series) => {
            const totalGames = series.gamesPerSession.reduce(
              (a: number, b: number) => a + b,
              0
            );
            return (
              <Link key={series._id} to={`/scrim-series/${series.slug || series._id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer h-full py-0">
                  <CardHeader className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{series.name}</CardTitle>
                      <Badge variant={series.isActive ? "default" : "secondary"}>
                        {series.isActive ? "Active" : "Completed"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 text-sm text-muted-foreground">
                        <p>
                          Best {series.bestN} of {totalGames} games
                        </p>
                        <p>
                          {series.gamesPerSession.length} sessions ·{" "}
                          {series.participationThreshold}% min participation
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
