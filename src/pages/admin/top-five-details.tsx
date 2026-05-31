import { useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PageHeader from "@/components/page-header.tsx";

function TopFiveDetailsContent() {
  const [searchParams] = useSearchParams();
  const discordUsername = searchParams.get("player");

  const topFiveData = useQuery(
    api.topFiveCache.getPlayerTopFiveDetails,
    discordUsername ? { discordUsername } : "skip",
  );

  if (!discordUsername) {
    return (
      <PageHeader
        title="Missing Player"
        description="No player specified."
        back={{ label: "Back to Leaderboard Stats", href: "/admin/leaderboard-stats" }}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Stats", href: "/admin/stats" },
          { label: "Leaderboard Stats", href: "/admin/leaderboard-stats" },
          { label: "Top 5 Details" },
        ]}
        variant="compact"
      />
    );
  }

  if (topFiveData === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (topFiveData === null) {
    return (
      <PageHeader
        title="Player Not Found"
        description={`Could not find player: ${discordUsername}`}
        back={{ label: "Back to Leaderboard Stats", href: "/admin/leaderboard-stats" }}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Stats", href: "/admin/stats" },
          { label: "Leaderboard Stats", href: "/admin/leaderboard-stats" },
          { label: "Top 5 Details" },
        ]}
        variant="compact"
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Top 5 Performance Details"
        description={`${topFiveData.playerName} · ${topFiveData.epicUsername}`}
        icon={Trophy}
        back={{ label: "Back to Leaderboard Stats", href: "/admin/leaderboard-stats" }}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Stats", href: "/admin/stats" },
          { label: "Leaderboard Stats", href: "/admin/leaderboard-stats" },
          { label: topFiveData.playerName },
        ]}
        variant="compact"
      />

      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
          <CardDescription>
            Last 5 leaderboards (excludes "No Money" scrims)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Top 5 Finishes</div>
              <div className="text-2xl font-bold">{topFiveData.recentTop5Count}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Top 3 Finishes</div>
              <div className="text-2xl font-bold text-green-600">{topFiveData.recentTop3Count}</div>
            </div>
          </div>

          {topFiveData.consistentTeammateName && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Users className="h-4 w-4" />
                Most Frequent Teammate
              </div>
              <div className="text-lg font-semibold">{topFiveData.consistentTeammateName}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {topFiveData.recentTop5WithTeammate} of {topFiveData.recentTop5Count} top 5 finishes together
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last 5 Events</CardTitle>
          <CardDescription>
            Recent event placements and teammates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topFiveData.events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent events found
            </div>
          ) : (
            <div className="space-y-4">
              {topFiveData.events.map((event, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg space-y-2"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold">{event.eventName}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(event.eventDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={event.placement <= 3 ? "default" : "secondary"}
                        className="text-lg px-3 py-1"
                      >
                        #{event.placement}
                      </Badge>
                    </div>
                  </div>

                  {event.teammates.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-1.5">
                        Teammates:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {event.teammates.map((teammate, idx) => (
                          <Badge key={idx} variant="outline">
                            {teammate}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TopFiveDetails() {
  return (
    <AdminPageLayout skipHeader requireAdmin authTitle="Sign in to view top 5 details">
      <TopFiveDetailsContent />
    </AdminPageLayout>
  );
}
