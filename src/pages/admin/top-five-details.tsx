import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeft, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import SiteHeader from "@/components/site-header.tsx";

export default function TopFiveDetails() {
  const [searchParams] = useSearchParams();
  const discordUsername = searchParams.get("player");
  
  const topFiveData = useQuery(
    api.topFiveCache.getPlayerTopFiveDetails,
    discordUsername ? { discordUsername } : "skip"
  );
  
  if (!discordUsername) {
    return (
      <>
        <SiteHeader />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Missing Player</h1>
            <p className="text-muted-foreground mb-6">No player specified.</p>
            <Link to="/admin/leaderboard-stats">
              <Button>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Leaderboard Stats
              </Button>
            </Link>
          </div>
        </div>
      </>
    );
  }
  
  return (
    <>
      <SiteHeader />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/admin/leaderboard-stats">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Leaderboard Stats
          </Button>
        </Link>
        
        {topFiveData === undefined ? (
          <Skeleton className="h-96 w-full" />
        ) : topFiveData === null ? (
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Player Not Found</h1>
            <p className="text-muted-foreground">Could not find player: {discordUsername}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                <Trophy className="h-8 w-8 text-yellow-500" />
                Top 5 Performance Details
              </h1>
              <p className="text-xl text-muted-foreground">
                {topFiveData.playerName}
              </p>
              <p className="text-sm text-muted-foreground">
                {topFiveData.epicUsername}
              </p>
            </div>
            
            {/* Summary Card */}
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
            
            {/* Events List */}
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
        )}
      </div>
    </>
  );
}
