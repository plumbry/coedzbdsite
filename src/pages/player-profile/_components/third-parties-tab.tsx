import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.tsx";
import { Trophy, Users, Target, Crosshair, Calendar, ExternalLink, ChevronDown } from "lucide-react";

interface ThirdPartiesTabProps {
  playerId: Id<"players">;
}

export default function ThirdPartiesTab({ playerId }: ThirdPartiesTabProps) {
  const results = useQuery(api.thirdPartyQueries.getPlayerThirdPartyResults, { 
    playerId,
    linkedToEvent: "unlinked" 
  });
  const [sortBy, setSortBy] = useState<"newest" | "points" | "placement">("newest");
  
  if (results === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  
  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy />
              </EmptyMedia>
              <EmptyTitle>No third-party CSV results yet</EmptyTitle>
              <EmptyDescription>
                Results from external tournaments (Third Party CSV uploads, outside ZBD Yunite events) will appear here when not linked to a calendar event.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }
  
  // Function to extract base event name (remove "Week X" or similar patterns)
  const getBaseEventName = (fullName: string): string => {
    // Remove patterns like "Week 1", "Week 2", "#1", "#2", etc.
    return fullName
      .replace(/\s+Week\s+\d+$/i, "")
      .replace(/\s+#\d+$/i, "")
      .trim();
  };
  
  // Group results by importId for Random events, by base event name for others
  const groupedResults = results.reduce((acc: Record<string, typeof results>, result) => {
    const isRandomEvent = result.eventInfo && 
      (result.eventInfo.type === "random" || 
       result.eventInfo.type === "random-squads" || 
       result.eventInfo.type === "random-trios");
    
    // For Random events, group by importId to properly aggregate games
    // For other events, group by base event name
    const groupKey = isRandomEvent 
      ? result.importId 
      : getBaseEventName(result.eventName);
    
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(result);
    return acc;
  }, {});
  
  // Sort each group's results
  Object.keys(groupedResults).forEach(baseName => {
    groupedResults[baseName].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b._creationTime - a._creationTime;
        case "points":
          return b.points - a.points;
        case "placement":
          return a.placement - b.placement;
        default:
          return 0;
      }
    });
  });
  
  // Sort grouped events by most recent activity
  const sortedGroupNames = Object.keys(groupedResults).sort((a, b) => {
    const aLatest = Math.max(...groupedResults[a].map((r: { _creationTime: number }) => r._creationTime));
    const bLatest = Math.max(...groupedResults[b].map((r: { _creationTime: number }) => r._creationTime));
    return bLatest - aLatest;
  });
  
  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Total Events</CardTitle>
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">{results.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Win Rate</CardTitle>
            <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">
              {(() => {
                const totalWins = results.reduce((sum: number, r: { wins?: number }) => sum + (r.wins || 0), 0);
                const winRate = results.length > 0 ? (totalWins / results.length) * 100 : 0;
                return Math.round(winRate * 10) / 10;
              })()}%
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(() => {
                const totalWins = results.reduce((sum: number, r: { wins?: number }) => sum + (r.wins || 0), 0);
                return `${totalWins} ${totalWins === 1 ? "win" : "wins"}`;
              })()}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Best Placement</CardTitle>
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">
              #{Math.min(...results.map((r: { placement: number }) => r.placement))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Avg. Score</CardTitle>
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">
              {results.length > 0 
                ? Math.round((results.reduce((sum: number, r: { points: number }) => sum + r.points, 0) / results.length) * 10) / 10
                : 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Total Eliminations</CardTitle>
            <Crosshair className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">
              {results.reduce((sum: number, r: { eliminations?: number }) => sum + (r.eliminations || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Sort Control */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Third Party Results</h3>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="points">Highest Points</SelectItem>
            <SelectItem value="placement">Best Placement</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Grouped Event Cards */}
      <div className="space-y-4">
        {sortedGroupNames.map((groupKey) => {
          const events = groupedResults[groupKey];
          const firstEvent = events[0];
          const isRandomEvent = firstEvent.eventInfo && 
            (firstEvent.eventInfo.type === "random" || 
             firstEvent.eventInfo.type === "random-squads" || 
             firstEvent.eventInfo.type === "random-trios");
          
          // Calculate points - use cumulative logic for Random events
          let displayPoints = 0;
          if (isRandomEvent && firstEvent.eventInfo) {
            // For Random events, apply the same logic as event results
            const gameScores = events.map((e: { points: number }) => e.points);
            const sortedScores = [...gameScores].sort((a, b) => b - a); // Sort descending
            
            // If excludeLowestScore is enabled and there are 4+ games, take top 3
            const shouldExcludeLowest = firstEvent.eventInfo.excludeLowestScore;
            const scoresToCount = shouldExcludeLowest && sortedScores.length >= 4
              ? sortedScores.slice(0, 3)
              : sortedScores;
            displayPoints = scoresToCount.reduce((sum, score) => sum + score, 0);
          } else {
            // For non-random events, sum all points
            displayPoints = events.reduce((sum: number, r: { points: number }) => sum + r.points, 0);
          }
          
          const bestPlacement = Math.min(...events.map((r: { placement: number }) => r.placement));
          const totalElims = events.reduce((sum: number, r: { eliminations?: number }) => sum + (r.eliminations || 0), 0);
          
          // Use event name from first event for display
          const displayName = isRandomEvent ? firstEvent.eventName : groupKey;
          
          return (
            <Collapsible key={groupKey} defaultOpen={events.length === 1}>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform data-[state=closed]:-rotate-90" />
                        <div className="flex-1 text-left">
                          <CardTitle className="text-base">{displayName}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {isRandomEvent 
                                ? `${events.length} ${events.length === 1 ? "game" : "games"}` 
                                : `${events.length} ${events.length === 1 ? "event" : "events"}`}
                            </Badge>
                            {isRandomEvent && firstEvent.eventInfo?.excludeLowestScore && events.length >= 4 && (
                              <Badge variant="outline" className="text-xs">
                                Best 3
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm mr-4">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Best</div>
                          <div className="font-bold">#{bestPlacement}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">
                            {isRandomEvent ? "Cumulative" : "Total Pts"}
                          </div>
                          <div className="font-bold">{displayPoints}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Elims</div>
                          <div className="font-bold">{totalElims}</div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    {events.map((result, index) => (
                      <div
                        key={result._id}
                        className={`rounded-lg border p-4 ${index !== events.length - 1 ? "mb-3" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="space-y-1">
                            <div className="font-medium text-sm">{result.eventName}</div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {result.source}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(result._creationTime).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <a
                            href={result.leaderboardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground">Placement</div>
                            <div className="text-lg font-bold flex items-center gap-1">
                              {result.placement === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                              #{result.placement}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Points</div>
                            <div className="text-lg font-bold">{result.points}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Eliminations</div>
                            <div className="text-lg font-bold">{result.eliminations || 0}</div>
                          </div>
                        </div>
                        
                        {result.teamMembers && result.teamMembers.length > 0 && (
                          <div className="pt-3 border-t mt-3">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              Team Members
                            </div>
                            <div className="text-sm">
                              {result.teamMembers.join(", ")}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
