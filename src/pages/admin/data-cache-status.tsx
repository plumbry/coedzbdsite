import { Component, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeft, Database, CheckCircle2, XCircle, Clock, RefreshCw, Crosshair } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import RoleGate from "@/components/role-gate.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { toast } from "sonner";

class DataCacheStatusErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Data cache status failed to load</AlertTitle>
          <AlertDescription>
            {this.state.error.message || "Refresh the page or check the Convex logs for the failed query."}
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

function DataCacheStatusContent() {
  const { isAdmin } = useUserRole();
  // Split into separate queries to avoid exceeding Convex scan/time limits
  const playerStats = useQuery(api.cacheStatus.getPlayerStats, {});
  const eventStats = useQuery(api.cacheStatus.getEventStats, {});
  const importStats = useQuery(api.cacheStatus.getImportStats, {});
  const matchStatsData = useQuery(api.cacheStatus.getMatchStatsCount, {});
  const killEventsData = useQuery(api.cacheStatus.getKillEventsCount, {});
  const resultStats = useQuery(api.cacheStatus.getResultStats, {});
  const cacheMetadata = useQuery(api.cacheStatus.getCacheMetadata, {});
  const recentPlayerSyncs = useQuery(api.cacheStatus.getRecentPlayerCacheUpdates, { limit: 10 });
  const recentEventSyncs = useQuery(api.cacheStatus.getRecentEventSyncs, { limit: 10 });
  const recentImportSyncs = useQuery(api.cacheStatus.getRecentImportSyncs, { limit: 10 });
  
  const rebuildPlayerCache = useMutation(api.cacheStatus.rebuildPlayerCache);
  const rebuildEventCache = useMutation(api.cacheStatus.rebuildEventCache);
  const rebuildImportCache = useMutation(api.cacheStatus.rebuildImportCache);
  const rebuildMatchStatsCache = useMutation(api.cacheStatus.rebuildMatchStatsCache);
  const rebuildAggregateStatsCache = useMutation(api.cacheStatus.rebuildAggregateStatsCache);
  const rebuildHolisticScoresCache = useMutation(api.cacheStatus.rebuildHolisticScoresCache);
  const backfillKillEventsMetadata = useMutation(api.cacheStatus.backfillKillEventsMetadata);
  const backfillPlayerEventStats = useMutation(api.cacheStatus.backfillPlayerEventParticipationStats);
  const rebuildUpsetKillEventsCache = useMutation(api.cacheStatus.rebuildUpsetKillEventsCache);

  const [rebuildingCache, setRebuildingCache] = useState<string | null>(null);

  const handleRebuildCache = async (cacheType: "players" | "events" | "imports" | "matchStats" | "aggregateStats" | "holisticScores" | "killEventsMetadata" | "upsetKillStats" | "playerEventStats") => {
    setRebuildingCache(cacheType);
    try {
      let result;
      switch (cacheType) {
        case "players":
          result = await rebuildPlayerCache();
          break;
        case "events":
          result = await rebuildEventCache();
          break;
        case "imports":
          result = await rebuildImportCache();
          break;
        case "matchStats":
          result = await rebuildMatchStatsCache();
          break;
        case "aggregateStats":
          result = await rebuildAggregateStatsCache();
          break;
        case "holisticScores":
          result = await rebuildHolisticScoresCache();
          break;
        case "killEventsMetadata":
          result = await backfillKillEventsMetadata();
          break;
        case "upsetKillStats":
          result = await rebuildUpsetKillEventsCache();
          break;
        case "playerEventStats":
          result = await backfillPlayerEventStats();
          break;
      }
      toast.success(result.message);
    } catch (error) {
      toast.error("Failed to rebuild cache: " + (error as Error).message);
    } finally {
      setRebuildingCache(null);
    }
  };

  if (isAdmin === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!isAdmin) {
    return (
      <RoleGate
        allowed={false}
        description="This page is only accessible to administrators."
      />
    );
  }

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return "< 1h ago";
  };

  const getPercentage = (count: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  const formatCount = (count: number, sampled?: boolean) =>
    `${count.toLocaleString()}${sampled ? "+" : ""}`;

  return (
    <div className="space-y-4">
      {playerStats === undefined || eventStats === undefined || importStats === undefined || matchStatsData === undefined || killEventsData === undefined || resultStats === undefined || cacheMetadata === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Players */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Players</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRebuildCache("players")}
                    disabled={rebuildingCache === "players"}
                  >
                    {rebuildingCache === "players" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Backfill events played counts"
                    onClick={() => handleRebuildCache("playerEventStats")}
                    disabled={rebuildingCache === "playerEventStats"}
                  >
                    {rebuildingCache === "playerEventStats" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <Database className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{playerStats.total}</div>
                <div className="space-y-1 mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PowerScore</span>
                    <span className="font-medium">
                      {getPercentage(playerStats.withPowerScore, playerStats.total)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Top 5 Cache</span>
                    <span className="font-medium">
                      {getPercentage(playerStats.withTopFiveCache, playerStats.total)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discord Sync</span>
                    <span className="font-medium">
                      {getPercentage(playerStats.withLastDiscordSync, playerStats.total)}%
                    </span>
                  </div>
                  {playerStats.lastUpdated && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">
                        {formatRelativeTime(playerStats.lastUpdated)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Events */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Events</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRebuildCache("events")}
                    disabled={rebuildingCache === "events"}
                  >
                    {rebuildingCache === "events" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{eventStats.total}</div>
                <div className="space-y-1 mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium">
                      {eventStats.completed}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">With Teams/Players</span>
                    <span className="font-medium">
                      {getPercentage(eventStats.withTotalPlayers, eventStats.total)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Yunite Synced</span>
                    <span className="font-medium">
                      {getPercentage(eventStats.withLastYunitSync, eventStats.total)}%
                    </span>
                  </div>
                  {eventStats.lastUpdated && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">
                        {formatRelativeTime(eventStats.lastUpdated)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Imports */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Imports</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRebuildCache("imports")}
                    disabled={rebuildingCache === "imports"}
                  >
                    {rebuildingCache === "imports" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{importStats.total}</div>
                <div className="space-y-1 mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Match Data Synced</span>
                    <span className="font-medium">
                      {getPercentage(importStats.withMatchDataSynced, importStats.total)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From Yunite API</span>
                    <span className="font-medium">
                      {importStats.fromYuniteAPI}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From CSV</span>
                    <span className="font-medium">
                      {importStats.fromCSV}
                    </span>
                  </div>
                  {importStats.lastUpdated && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">
                        {formatRelativeTime(importStats.lastUpdated)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Match Stats */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Match Stats</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRebuildCache("matchStats")}
                    disabled={rebuildingCache === "matchStats"}
                  >
                    {rebuildingCache === "matchStats" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCount(matchStatsData.matchStatsCount, matchStatsData.matchStatsCountIsSampled)}
                </div>
                <div className="space-y-1 mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Results</span>
                    <span className="font-medium">
                      {formatCount(resultStats.total, resultStats.totalIsSampled)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Matched</span>
                    <span className="font-medium">
                      {getPercentage(resultStats.matched, resultStats.total)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">With Match Data</span>
                    <span className="font-medium">
                      {getPercentage(resultStats.withMatchData, resultStats.total)}%
                    </span>
                  </div>
                  {matchStatsData.matchStatsLastUpdated && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">
                        {formatRelativeTime(matchStatsData.matchStatsLastUpdated)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Kill Events */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Link to="/admin/upset-kills">
                    <CardTitle className="text-sm font-medium hover:underline cursor-pointer flex items-center gap-1">
                      <Crosshair className="h-3.5 w-3.5" />
                      Kill Events →
                    </CardTitle>
                  </Link>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Sync metadata counts"
                      onClick={() => handleRebuildCache("killEventsMetadata")}
                      disabled={rebuildingCache === "killEventsMetadata"}
                    >
                      {rebuildingCache === "killEventsMetadata" ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <Database className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Rebuild upset kill stats cache"
                      onClick={() => handleRebuildCache("upsetKillStats")}
                      disabled={rebuildingCache === "upsetKillStats"}
                    >
                      {rebuildingCache === "upsetKillStats" ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-xs">Match kill feed analytics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{killEventsData.killEventsCount.toLocaleString()}</div>
                <div className="space-y-1 mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Upset kills</span>
                    <span className="font-medium">
                      {killEventsData.upsetKillEventsCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Upset rate</span>
                    <span className="font-medium">
                      {killEventsData.killEventsCount > 0
                        ? `${Math.round((killEventsData.upsetKillEventsCount / killEventsData.killEventsCount) * 100)}%`
                        : "—"}
                    </span>
                  </div>
                  {killEventsData.lastUpdated && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">
                        {formatRelativeTime(killEventsData.lastUpdated)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Aggregate Stats Cache */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Aggregate Stats</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRebuildCache("aggregateStats")}
                    disabled={rebuildingCache === "aggregateStats"}
                  >
                    {rebuildingCache === "aggregateStats" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {cacheMetadata.aggregateStatsCache ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Cached
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <XCircle className="mr-1 h-3 w-3" />
                      Empty
                    </Badge>
                  )}
                </div>
                {cacheMetadata.aggregateStatsCache && (
                  <div className="space-y-1 mt-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Players</span>
                      <span className="font-medium">
                        {cacheMetadata.aggregateStatsCache.playerCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">
                        {formatRelativeTime(cacheMetadata.aggregateStatsCache.lastUpdated)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Tier Re-Evaluation Cache */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Link to="/admin/holistic-score-stats">
                    <CardTitle className="text-sm font-medium hover:underline cursor-pointer">
                      Holistic Scores →
                    </CardTitle>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRebuildCache("holisticScores")}
                    disabled={rebuildingCache === "holisticScores"}
                  >
                    {rebuildingCache === "holisticScores" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <CardDescription className="text-xs">Tier evaluations & scores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {cacheMetadata.tierReEvaluationCache.evaluationCount > 0 ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Cached
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <XCircle className="mr-1 h-3 w-3" />
                      Empty
                    </Badge>
                  )}
                </div>
                {cacheMetadata.tierReEvaluationCache.evaluationCount > 0 && (
                  <div className="space-y-1 mt-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Players</span>
                      <span className="font-medium">
                        {cacheMetadata.tierReEvaluationCache.evaluationCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">
                        {formatRelativeTime(cacheMetadata.tierReEvaluationCache.lastUpdated || undefined)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed Player Cache */}
          <Card>
            <CardHeader>
              <CardTitle>Player Cache Details</CardTitle>
              <CardDescription>
                Breakdown of cached player data ({playerStats.total} total)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Epic Account IDs</div>
                  <div className="text-2xl font-bold">{playerStats.withEpicId}</div>
                  <div className="text-xs text-muted-foreground">
                    {getPercentage(playerStats.withEpicId, playerStats.total)}% cached
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Display Names</div>
                  <div className="text-2xl font-bold">{playerStats.withName}</div>
                  <div className="text-xs text-muted-foreground">
                    {getPercentage(playerStats.withName, playerStats.total)}% cached
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Avatar URLs</div>
                  <div className="text-2xl font-bold">{playerStats.withAvatarUrl}</div>
                  <div className="text-xs text-muted-foreground">
                    {getPercentage(playerStats.withAvatarUrl, playerStats.total)}% cached
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Contribution Scores</div>
                  <div className="text-2xl font-bold">{playerStats.withContributionScore}</div>
                  <div className="text-xs text-muted-foreground">
                    {getPercentage(playerStats.withContributionScore, playerStats.total)}% cached
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Player Syncs */}
          {recentPlayerSyncs && recentPlayerSyncs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Player Syncs</CardTitle>
                <CardDescription>Last 10 players synced from Discord</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Epic ID</TableHead>
                      <TableHead>Avatar</TableHead>
                      <TableHead>Power Score</TableHead>
                      <TableHead>Top 5 Cache</TableHead>
                      <TableHead className="text-right">Last Synced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentPlayerSyncs.map((player) => (
                      <TableRow key={player.playerId}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{player.discordUsername}</div>
                            <div className="text-xs text-muted-foreground">{player.epicUsername}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {player.hasEpicId ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {player.hasAvatar ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {player.hasPowerScore ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {player.hasTopFiveCache ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <div>{formatRelativeTime(player.lastDiscordSync)}</div>
                          <div className="text-muted-foreground">{formatTimestamp(player.lastDiscordSync)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Recent Event Syncs */}
          {recentEventSyncs && recentEventSyncs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Event Syncs</CardTitle>
                <CardDescription>Last 10 events synced from Yunite API</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Teams</TableHead>
                      <TableHead className="text-right">Players</TableHead>
                      <TableHead className="text-right">Last Synced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentEventSyncs.map((event) => (
                      <TableRow key={event.eventId}>
                        <TableCell className="font-medium">{event.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{event.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={event.status === "completed" ? "default" : "secondary"}>
                            {event.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{event.totalTeams || "—"}</TableCell>
                        <TableCell className="text-right">{event.totalPlayers || "—"}</TableCell>
                        <TableCell className="text-right text-xs">
                          <div>{formatRelativeTime(event.lastYunitSync)}</div>
                          <div className="text-muted-foreground">{formatTimestamp(event.lastYunitSync)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Recent Import Syncs */}
          {recentImportSyncs && recentImportSyncs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Match Data Syncs</CardTitle>
                <CardDescription>Last 10 imports with match-level data</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Name</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Players</TableHead>
                      <TableHead>Matched</TableHead>
                      <TableHead>Fully Cached</TableHead>
                      <TableHead className="text-right">Synced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentImportSyncs.map((imp) => (
                      <TableRow key={imp.importId}>
                        <TableCell className="font-medium">{imp.eventName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{imp.source}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{imp.totalPlayers}</TableCell>
                        <TableCell className="text-right">{imp.playersMatched}</TableCell>
                        <TableCell>
                          {imp.dataFullyCached ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-yellow-600" />
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <div>{formatRelativeTime(imp.matchDataSyncedAt)}</div>
                          <div className="text-muted-foreground">{formatTimestamp(imp.matchDataSyncedAt)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground">
            Last checked: {formatTimestamp(cacheMetadata.lastChecked)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataCacheStatus() {
  return (
    <AdminPageLayout requireAdmin
      title="Data Cache Status"
      description="Monitor and rebuild cached player, event, and import data"
      authTitle="Sign in to view the data cache status"
    >
      <DataCacheStatusErrorBoundary>
        <DataCacheStatusContent />
      </DataCacheStatusErrorBoundary>
    </AdminPageLayout>
  );
}
