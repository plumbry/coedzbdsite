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
} from "@/components/ui/empty.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Trophy, ArrowRight } from "lucide-react";
import SiteHeader from "@/components/site-header.tsx";

export default function ScrimSeriesLandingPage() {
  const allSeries = useQuery(api.scrimSeries.queries.listSeries, {});

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="h-7 w-7 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Scrim Series
            </h1>
          </div>
          <p className="text-muted-foreground text-sm ml-10 sm:ml-10">
            View leaderboards for each scrim series
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {allSeries === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allSeries.map((series) => {
              const totalGames = series.gamesPerSession.reduce(
                (a: number, b: number) => a + b,
                0
              );
              return (
                <Link key={series._id} to={`/scrim-series/${series.slug || series._id}`}>
                  <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{series.name}</CardTitle>
                        <Badge variant={series.isActive ? "default" : "secondary"}>
                          {series.isActive ? "Active" : "Completed"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>
                            Best {series.bestN} of {totalGames} games
                          </p>
                          <p>
                            {series.gamesPerSession.length} sessions &middot;{" "}
                            {series.participationThreshold}% min participation
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
