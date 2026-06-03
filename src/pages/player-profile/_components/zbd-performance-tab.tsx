import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.tsx";
import { Trophy, Plus, Calendar, Target, Crosshair, TrendingUp, ExternalLink, Activity, ChevronDown, Medal, Users, TrendingDown, Minus, Zap, Maximize2 } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import ExpandedPerformanceDialog from "./expanded-performance-dialog.tsx";

interface ZBDPerformanceTabProps {
  playerId: Id<"players">;
  onAddEvent: () => void;
}

interface EventResult {
  _id: string;
  _creationTime: number;
  eventName: string;
  groupEventName?: string;
  eventId?: string;
  eventDate?: string;
  placement: number;
  cumulativePlacement?: number | null; // Overall season standings
  eliminations: number;
  eventScore?: number;
  kdRatio?: number;
  wins?: number;
  source: "manual" | "yunite" | "csv";
  yuniteLeaderboardUrl?: string;
  leaderboardUrl?: string;
  teammateName?: string;
  eventType?: string | null;
  excludeLowestScore?: boolean;
  isNoMoneyEvent?: boolean;
}

function EventResultsGrouped({ events }: { events: EventResult[] }) {
  // Group events
  // Manual events: group by eventName
  // Yunite imports: group by linked ZBD event name
  const grouped = events.reduce((acc: Record<string, EventResult[]>, event) => {
    const groupKey = event.source === "manual" ? event.eventName : (event.groupEventName || event.eventName);
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(event);
    return acc;
  }, {});

  // Sort groups by event date (use earliest date in group for multi-leaderboard events)
  const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
    const aEarliest = Math.min(...grouped[a].map(e => e.eventDate ? new Date(e.eventDate).getTime() : Infinity));
    const bEarliest = Math.min(...grouped[b].map(e => e.eventDate ? new Date(e.eventDate).getTime() : Infinity));
    return bEarliest - aEarliest;
  });

  return (
    <div className="space-y-3">
      {sortedGroupKeys.map((groupKey) => {
        const groupEvents = grouped[groupKey];
        
        // Calculate points - apply "best 3" logic for Random events with excludeLowestScore
        const firstEvent = groupEvents[0];
        const isRandomEvent = firstEvent.eventType === "random" || 
                              firstEvent.eventType === "random-squads" || 
                              firstEvent.eventType === "random-trios";
        const isSeasonEvent = firstEvent.eventType === "season" || 
                              firstEvent.eventType === "mini-season";
        const isCumulativeEvent = isRandomEvent || isSeasonEvent;
        
        let totalPoints = 0;
        if (isRandomEvent && firstEvent.excludeLowestScore) {
          // Apply the same logic as third-party tab
          const gameScores = groupEvents.map(e => e.eventScore || 0);
          const sortedScores = [...gameScores].sort((a, b) => b - a); // Sort descending
          
          // If 4+ games, take top 3
          const scoresToCount = sortedScores.length >= 4
            ? sortedScores.slice(0, 3)
            : sortedScores;
          totalPoints = scoresToCount.reduce((sum, score) => sum + score, 0);
        } else {
          // For non-random events or when excludeLowestScore is off, sum all points
          totalPoints = groupEvents.reduce((sum, e) => sum + (e.eventScore || 0), 0);
        }
        
        // For individual event rows, use original placement
        // For cumulative summary, use cumulativePlacement if available
        const cumulativePlacement = groupEvents[0].cumulativePlacement;
        
        const totalElims = groupEvents.reduce((sum, e) => sum + e.eliminations, 0);
        const isSingleEvent = groupEvents.length === 1;

        return (
          <Collapsible key={groupKey} defaultOpen={false}>
            <div className="rounded-lg border">
              <CollapsibleTrigger className="w-full">
                <div className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=closed]:-rotate-90" />
                      <div className="text-left">
                        <div className="font-medium text-sm">{groupKey}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {groupEvents.length} {groupEvents.length === 1 ? "result" : "results"}
                          </Badge>
                          <Badge variant={groupEvents[0].source === "manual" ? "secondary" : "outline"} className="text-xs">
                            {groupEvents[0].source === "manual" ? "Manual" : "Yunite"}
                          </Badge>
                          {isCumulativeEvent && firstEvent.excludeLowestScore && groupEvents.length >= 4 && (
                            <Badge variant="outline" className="text-xs">
                              Best 3
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm mr-2">
                      {isCumulativeEvent && cumulativePlacement ? (
                        <>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Cumulative</div>
                            <div className="font-bold">#{cumulativePlacement}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Total Pts</div>
                            <div className="font-bold">{totalPoints}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Place</div>
                            <div className="font-bold">#{groupEvents[0].placement}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Points</div>
                            <div className="font-bold">{totalPoints}</div>
                          </div>
                        </>
                      )}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Elims</div>
                        <div className="font-bold">{totalElims}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Event Name</TableHead>
                        <TableHead className="text-xs">Teammate(s)</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs text-right">Place</TableHead>
                        <TableHead className="text-xs text-right">Elims</TableHead>
                        <TableHead className="text-xs text-right">Points</TableHead>
                        <TableHead className="text-xs"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupEvents
                        .sort((a, b) => {
                          const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
                          const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
                          return dateB - dateA;
                        })
                        .map((event) => {
                        const isManual = event.source === "manual";
                        return (
                          <TableRow key={event._id}>
                            <TableCell className="text-sm">{event.eventName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {event.teammateName || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : "N/A"}
                            </TableCell>
                            <TableCell className="text-sm text-right">
                              {event.placement === 1 && <Trophy className="h-3.5 w-3.5 text-yellow-500 inline mr-1" />}
                              #{event.placement}
                            </TableCell>
                            <TableCell className="text-sm text-right">{event.eliminations}</TableCell>
                            <TableCell className="text-sm text-right font-bold">
                              {event.eventScore || 0}
                            </TableCell>
                            <TableCell>
                              {((isManual && event.yuniteLeaderboardUrl) || (!isManual && event.leaderboardUrl)) && (
                                <a
                                  href={isManual ? event.yuniteLeaderboardUrl : event.leaderboardUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}

export default function ZBDPerformanceTab({ playerId, onAddEvent }: ZBDPerformanceTabProps) {
  const bundle = useQuery(api.playerStats.getPlayerZBDPerformanceBundle, { playerId });
  const allEvents = bundle?.events;
  const stats = bundle?.stats;
  const duoPerf = useQuery(api.playerStats.getPlayerDuoPerformance, { playerId });
  const cs = useQuery(api.calculateContributionScore.getPlayerCS, { playerId });
  const matchStats = useQuery(api.playerStats.getPlayerMatchStats, { playerId });
  const { isAdmin, isModeratorOrAdmin } = useUserRole();
  const [hideNoMoney, setHideNoMoney] = useState(false);
  const [showTop5Only, setShowTop5Only] = useState(false);
  const [expandedDialogOpen, setExpandedDialogOpen] = useState(false);
  const [expandedChartType, setExpandedChartType] = useState<"placement" | "kills">("placement");
  
  if (bundle === undefined || allEvents === undefined || stats === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  // Filter events if needed
  let filteredEvents = allEvents;
  
  if (hideNoMoney) {
    filteredEvents = filteredEvents.filter(event => !event.isNoMoneyEvent);
  }
  
  if (showTop5Only) {
    filteredEvents = filteredEvents.filter(event => event.placement <= 5);
  }
  
  // Prepare chart data - ALL events and last 10 events
  // For cumulative events (random, season, mini-season), group by eventId and aggregate
  // For non-cumulative events, show each individually
  const eventGroups = new Map<string, typeof filteredEvents>();
  const eventOrder: string[] = [];
  
  for (const event of filteredEvents) {
    const eventType = "eventType" in event ? event.eventType : null;
    const isCumulative = eventType === "random" || 
                        eventType === "random-squads" || 
                        eventType === "random-trios" ||
                        eventType === "season" || 
                        eventType === "mini-season";
    
    // For cumulative events, group by eventId. For others, use unique key per result
    const eventId = "eventId" in event ? event.eventId : undefined;
    const key = isCumulative && eventId ? eventId : `${event._id}`;
    
    if (!eventGroups.has(key)) {
      eventGroups.set(key, []);
      eventOrder.push(key);
    }
    eventGroups.get(key)!.push(event);
  }
  
  // Convert groups to chart data points (ALL events for expanded view)
  const allChartData = eventOrder
    .slice()
    .reverse()
    .map((key) => {
      const events = eventGroups.get(key)!;
      const firstEvent = events[0];
      const isManual = firstEvent.source === "manual";
      const eventType = "eventType" in firstEvent ? firstEvent.eventType : null;
      const isCumulative = eventType === "random" || 
                          eventType === "random-squads" || 
                          eventType === "random-trios" ||
                          eventType === "season" || 
                          eventType === "mini-season";
      
      // For cumulative events, use cumulative placement and sum kills
      // For non-cumulative, use the single event's data
      const cumulativePlacement = "cumulativePlacement" in firstEvent ? firstEvent.cumulativePlacement : null;
      const placement = isCumulative && cumulativePlacement 
        ? cumulativePlacement 
        : firstEvent.placement;
      const kills = events.reduce((sum, e) => sum + e.eliminations, 0);
      const groupEventName = "groupEventName" in firstEvent ? firstEvent.groupEventName : undefined;
      const displayName = groupEventName || firstEvent.eventName;
      
      return {
        name: displayName,
        placement: placement,
        kills: kills,
        kd: isManual && firstEvent.kdRatio ? parseFloat(firstEvent.kdRatio.toFixed(2)) : 0,
        score: events.reduce((sum, e) => sum + (e.eventScore || 0), 0),
        date: firstEvent.eventDate ? new Date(firstEvent.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A",
      };
    });
  
  // Last 10 for preview charts
  const chartData = allChartData.slice(-10).map(data => ({
    ...data,
    name: data.name.length > 15 ? data.name.slice(0, 15) + "..." : data.name,
  }));
  
  return (
    <div className="space-y-4">
      {/* Data Disclaimer */}
      <div className="rounded-lg border border-muted bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold">Note:</span> ZBD event records come from Yunite imports and manually added events. Kill data may have minor discrepancies due to Yunite API limitations.
        </p>
      </div>
      
      {/* Stats Cards */}
      <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
            <CardTitle className="text-[10px] font-medium">Total Events</CardTitle>
            <Calendar className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-1 pb-2">
            <div className="text-base font-bold">{stats.totalGames}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
            <CardTitle className="text-[10px] font-medium">Win Rate</CardTitle>
            <Trophy className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-1 pb-2">
            <div className="text-base font-bold">{stats.winRate}%</div>
            <p className="text-[10px] text-muted-foreground">
              {stats.winCount} {stats.winCount === 1 ? "win" : "wins"}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
            <CardTitle className="text-[10px] font-medium">Avg Place</CardTitle>
            <Target className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-1 pb-2">
            <div className="text-base font-bold">{stats.averagePlacement}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
            <CardTitle className="text-[10px] font-medium">Avg Kills per Match</CardTitle>
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-1 pb-2">
            <div className="text-base font-bold">{stats.averageKD}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
            <CardTitle className="text-[10px] font-medium">Total Elims</CardTitle>
            <Crosshair className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-1 pb-2">
            <div className="text-base font-bold">{stats.totalEliminations}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
            <CardTitle className="text-[10px] font-medium">Avg Points per Event</CardTitle>
            <Activity className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-1 pb-2">
            <div className="text-base font-bold">{stats.averageScore}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
            <CardTitle className="text-[10px] font-medium">Top 3</CardTitle>
            <Medal className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-1 pb-2">
            <div className="text-base font-bold">{stats.top3Finishes}</div>
          </CardContent>
        </Card>
        
        {matchStats && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Deaths per Match</CardTitle>
              <TrendingDown className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{matchStats.deathsPerMatch}</div>
              <p className="text-[10px] text-muted-foreground">
                {Math.round(matchStats.deathsPerMatch * matchStats.totalMatches)} total in {matchStats.totalMatches} match{matchStats.totalMatches !== 1 ? "es" : ""}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Duo Performance Analysis - Admin/Mod Only */}
      {isModeratorOrAdmin && duoPerf && (
        <Collapsible defaultOpen={false}>
          <Card className="border-dashed">
            <CollapsibleTrigger className="w-full">
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=closed]:-rotate-90" />
                      <Users className="h-4 w-4" />
                      Duo Performance Analysis
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Admin/Mod Only - Performance comparison with/without consistent duo partner
                    </p>
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
            {/* Consistent Duo Partner */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Consistent Duo Partner</p>
                  <p className="font-semibold text-sm mt-0.5">{duoPerf.consistentDuo.epicUsername}</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {duoPerf.consistentDuo.eventsWithDuo} events together
                </Badge>
              </div>
            </div>

            {/* Performance Comparison */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* With Duo */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold">With Duo</p>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {duoPerf.withDuo?.eventCount || 0} events
                  </Badge>
                </div>
                {duoPerf.withDuo ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Avg Kills</span>
                      <span className="font-medium">{duoPerf.withDuo.avgKD}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Avg Placement</span>
                      <span className="font-medium">#{duoPerf.withDuo.avgPlacement}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>

              {/* Without Duo */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold">Without Duo</p>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {duoPerf.withoutDuo?.eventCount || 0} events
                  </Badge>
                </div>
                {duoPerf.withoutDuo ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Avg Kills</span>
                      <span className="font-medium">{duoPerf.withoutDuo.avgKD}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Avg Placement</span>
                      <span className="font-medium">#{duoPerf.withoutDuo.avgPlacement}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            </div>

            {/* Drop Ratios */}
            {duoPerf.withDuo && duoPerf.withoutDuo && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                {/* Clear Performance Indicator */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold">Performance Analysis</p>
                  {duoPerf.performanceRatio < 1.0 ? (
                    <Badge className="bg-primary text-primary-foreground font-bold">
                      BETTER WITH DUO
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="font-bold">
                      BETTER WITHOUT DUO
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Kills Ratio</span>
                    <span className={`font-semibold flex items-center gap-1 ${
                      duoPerf.dropRatios.kd < 0.9 ? "text-destructive" : 
                      duoPerf.dropRatios.kd < 1.0 ? "text-orange-500" : "text-primary"
                    }`}>
                      {duoPerf.dropRatios.kd < 1.0 && <TrendingDown className="h-3 w-3" />}
                      {duoPerf.dropRatios.kd}x
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Place Ratio</span>
                    <span className={`font-semibold flex items-center gap-1 ${
                      duoPerf.dropRatios.placement < 0.9 ? "text-destructive" : 
                      duoPerf.dropRatios.placement < 1.0 ? "text-orange-500" : "text-primary"
                    }`}>
                      {duoPerf.dropRatios.placement < 1.0 && <TrendingDown className="h-3 w-3" />}
                      {duoPerf.dropRatios.placement}x
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Combined Performance Ratio</span>
                  <span className={`text-sm font-bold ${
                    duoPerf.performanceRatio < 0.9 ? "text-destructive" : 
                    duoPerf.performanceRatio < 1.0 ? "text-orange-500" : "text-primary"
                  }`}>
                    {duoPerf.performanceRatio}x
                  </span>
                </div>
                {duoPerf.performanceRatio < 1.0 ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Player performs <span className="font-semibold text-destructive">{Math.round((1 - duoPerf.performanceRatio) * 100)}% worse</span> without their consistent duo partner
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    Player performs <span className="font-semibold text-primary">{Math.round((duoPerf.performanceRatio - 1) * 100)}% better</span> without their consistent duo partner
                  </p>
                )}
                
                {/* DCA Display */}
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Duo Carry Adjustment (DCA)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ranking score multiplier
                      </p>
                    </div>
                    <div className="text-right">
                      {duoPerf.dca !== null && duoPerf.dca !== undefined ? (
                        <div className="space-y-1">
                          <span className={`text-lg font-bold block ${
                            duoPerf.dca > 1.00 ? "text-green-600" :
                            duoPerf.dca < 1.00 ? "text-destructive" :
                            "text-muted-foreground"
                          }`}>
                            {duoPerf.dca.toFixed(3)}
                          </span>
                          <span className="text-xs text-muted-foreground block">
                            {duoPerf.dca < 1.00 ? "Penalty" : 
                             duoPerf.dca > 1.00 ? "Boost" : 
                             "Neutral"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {duoPerf.totalMatches < 5 ? "Not enough data" : "N/A"}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* DCA Confidence Warning */}
                  {duoPerf.dcaConfidence && duoPerf.dcaConfidence !== "high" && duoPerf.withoutDuo && (
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                      <div className="flex items-center gap-1 mb-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {duoPerf.dcaConfidence === "medium" ? "Medium" : "Low"} Confidence
                        </Badge>
                        <span className="text-muted-foreground">
                          ({duoPerf.withoutDuo.filteredCount} event{duoPerf.withoutDuo.filteredCount !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {duoPerf.dcaConfidence === "medium" 
                          ? "DCA reduced to 60% weight due to limited comparison events (need 3+)."
                          : "DCA reduced to 30% weight due to very limited comparison events (need 3+)."}
                      </p>
                    </div>
                  )}
                </div>

                {/* Team Contribution (TC) Display */}
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        Team Contribution (TC)
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Individual contribution across all teammates
                      </p>
                    </div>
                    <div className="text-right">
                      {cs ? (
                        <div className="space-y-1">
                          <span className={`text-lg font-bold block ${
                            cs.score >= 0.75 ? "text-green-600" :
                            cs.score >= 0.50 ? "text-primary" :
                            cs.score >= 0.30 ? "text-orange-500" :
                            "text-destructive"
                          }`}>
                            {cs.score.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground block">
                            {cs.score >= 0.75 ? "High" :
                             cs.score >= 0.50 ? "Good" :
                             cs.score >= 0.30 ? "Fair" :
                             "Low"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">N/A</span>
                      )}
                    </div>
                  </div>

                  {/* TC Breakdown */}
                  {cs && (
                    <div className="space-y-1.5 mt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Kill Share (25%)</span>
                        <span className="font-medium">{(cs.breakdown.killShare * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Top-5 Rate (25%)</span>
                        <span className="font-medium">{((cs.breakdown.top5Rate ?? 0) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Survival Rate (25%)</span>
                        <span className="font-medium">{(cs.breakdown.survivalRate * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Clutch Factor (25%)</span>
                        <span className="font-medium">{(cs.breakdown.clutchScore * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Matches Analyzed</span>
                        <span className="font-medium">{cs.matchesAnalyzed}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      
      {/* Performance Charts */}
      {chartData.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Card 
              className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50"
              onClick={() => {
                setExpandedChartType("placement");
                setExpandedDialogOpen(true);
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Placement Trend (Last 10 Events)</CardTitle>
                  <Maximize2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Click to see all events</p>
              </CardHeader>
              <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis 
                      reversed
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px"
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="placement" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card 
              className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50"
              onClick={() => {
                setExpandedChartType("kills");
                setExpandedDialogOpen(true);
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Eliminations per Event (Last 10)</CardTitle>
                  <Maximize2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Click to see all events</p>
              </CardHeader>
              <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px"
                      }}
                    />
                    <Bar 
                      dataKey="kills" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          {/* Expanded Performance Dialog */}
          <ExpandedPerformanceDialog
            open={expandedDialogOpen}
            onOpenChange={setExpandedDialogOpen}
            chartType={expandedChartType}
            allChartData={allChartData}
          />
        </>
      )}
      
      {/* ZBD event records (Yunite + manual) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">ZBD Event Records</CardTitle>
            {isAdmin && (
              <Button size="sm" onClick={onAddEvent}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Event
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Filter Controls */}
          <div className="flex items-center gap-4 mb-3 p-2 bg-muted/50 rounded-lg flex-wrap">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={hideNoMoney}
                onChange={(e) => setHideNoMoney(e.target.checked)}
                className="rounded border-muted-foreground"
              />
              <span>Hide "No Money" scrims</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showTop5Only}
                onChange={(e) => setShowTop5Only(e.target.checked)}
                className="rounded border-muted-foreground"
              />
              <span>Top 5 Only</span>
            </label>
          </div>
          
          {filteredEvents.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Trophy />
                </EmptyMedia>
                <EmptyTitle>No ZBD event records yet</EmptyTitle>
                <EmptyDescription>
                  {isAdmin
                    ? "Add a manual event or import tournaments from Yunite to track performance"
                    : "No Yunite imports or manual events for this player yet"}
                </EmptyDescription>
              </EmptyHeader>
              {isAdmin && (
                <EmptyContent>
                  <Button size="sm" onClick={onAddEvent}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add First Event
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <EventResultsGrouped events={filteredEvents} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
