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
import { ArrowLeft, Database, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import RoleGate from "@/components/role-gate.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { toast } from "sonner";
import {
  PlayerStatsRebuildButton,
  PlayerStatsRebuildRunningAlert,
} from "@/components/admin/player-stats-rebuild-button.tsx";
import { PlayerStatsMigrationChecklist } from "@/components/admin/player-stats-migration-checklist.tsx";
import { PlayerStatsCacheBackfillChecklist } from "@/components/admin/player-stats-cache-backfill-checklist.tsx";

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
  const resultStats = useQuery(api.cacheStatus.getResultStats, {});
  const cacheMetadata = useQuery(api.cacheStatus.getCacheMetadata, {});
  const recentPlayerSyncs = useQuery(api.cacheStatus.getRecentPlayerCacheUpdates, { limit: 10 });
  const recentEventSyncs = useQuery(api.cacheStatus.getRecentEventSyncs, { limit: 10 });
  const recentImportSyncs = useQuery(api.cacheStatus.getRecentImportSyncs, { limit: 10 });
  const activeStatsRebuild = useQuery(api.playerStatsRebuild.getActiveRebuildJob, {});

  const rebuildPlayerCache = useMutation(api.cacheStatus.rebuildPlayerCache);
  const rebuildEventCache = useMutation(api.cacheStatus.rebuildEventCache);
  const rebuildImportCache = useMutation(api.cacheStatus.rebuildImportCache);
  const rebuildMatchStatsCache = useMutation(api.cacheStatus.rebuildMatchStatsCache);
  const rebuildAggregateStatsCache = useMutation(api.cacheStatus.rebuildAggregateStatsCache);
  const backfillPlayerEventStats = useMutation(api.cacheStatus.backfillPlayerEventParticipationStats);

  const [rebuildingCache, setRebuildingCache] = useState<string | null>(null);

  const handleRebuildCache = async (cacheType: "players" | "events" | "imports" | "matchStats" | "aggregateStats" | "playerEventStats") => {
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

  const poolCoverageLabel = (covered: number, pool: number) => {
    if (pool <= 0) return "—";
    return `${covered} / ${pool} (${getPercentage(covered, pool)}%)`;
  };

  const aggregateCoverage = cacheMetadata?.aggregateStatsCache
    ? {
        included: cacheMetadata.aggregateStatsCache.playerCount,
        matchDataPool:
          cacheMetadata.aggregateStatsCache.rebuildPoolCount ??
          cacheMetadata.competitivePool.eligibleMatchDataPool,
        excludedNoYuniteEvents:
          cacheMetadata.aggregateStatsCache.excludedNoYuniteEvents ??
          Math.max(
            0,
            (cacheMetadata.aggregateStatsCache.rebuildPoolCount ??
              cacheMetadata.competitivePool.eligibleMatchDataPool) -
              cacheMetadata.aggregateStatsCache.playerCount,
          ),
      }
    : null;

  const formatCount = (count: number, sampled?: boolean) =>
    `${count.toLocaleString()}${sampled ? "+" : ""}`;

  return (
    <div className="space-y-4">
      {playerStats === undefined || eventStats === undefined || importStats === undefined || matchStatsData === undefined || resultStats === undefined || cacheMetadata === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          <PlayerStatsCacheBackfillChecklist />
          <PlayerStatsMigrationChecklist variant="cache" />

          <Card className="border-primary bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Unified player stats rebuild</CardTitle>
              <CardDescription>
                Event participation → TC → DCA → top-five → tier-eval holistic scores (raw + TC/DCA).
                Replaces separate per-cache holistic refresh buttons for a full refresh.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeStatsRebuild ? (
                <PlayerStatsRebuildRunningAlert />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No rebuild running. Use after Yunite imports or policy changes.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <PlayerStatsRebuildButton size="sm" label="Rebuild all player stats" />
                <PlayerStatsRebuildButton
                  size="sm"
                  variant="outline"
                  label="TC/DCA only"
                  tcDcaOnly
                />
                <PlayerStatsRebuildButton
                  size="sm"
                  variant="outline"
                  label="Top 5 only"
                  topFiveOnly
                />
                <PlayerStatsRebuildButton
                  size="sm"
                  variant="outline"
                  label="Average stats only"
                  aggregateStatsOnly
                />
                <PlayerStatsRebuildButton
                  size="sm"
                  variant="outline"
                  label="6-week tier eval only"
                  tierEvalOnly
                  tierEvalRecentOnly
                />
                <PlayerStatsRebuildButton
                  size="sm"
                  variant="outline"
                  stopAfterPhase="event_participation"
                  showPhaseHint={false}
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Competitive stats pool */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Competitive pool</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRebuildCache("players")}
                    disabled={rebuildingCache === "players" || !!activeStatsRebuild}
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
                    title="Sync Yunite event counts (unified rebuild)"
                    onClick={() => handleRebuildCache("playerEventStats")}
                    disabled={rebuildingCache === "playerEventStats" || !!activeStatsRebuild}
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
                <div className="text-2xl font-bold">
                  {playerStats.eligibleMatchDataPool}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active members with Yunite match data ({playerStats.totalMembers.toLocaleString()}{" "}
                  total member rows)
                </p>
                <div className="space-y-1 mt-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Tier eval cache</span>
                    <span className="font-medium text-right">
                      {poolCoverageLabel(
                        playerStats.withTierEvalCache,
                        playerStats.tierEvalEligiblePool,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Top 5 cache</span>
                    <span className="font-medium text-right">
                      {poolCoverageLabel(
                        playerStats.withTopFiveCache,
                        playerStats.eligibleMatchDataPool,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">TC (contribution)</span>
                    <span className="font-medium text-right">
                      {poolCoverageLabel(
                        playerStats.withContributionScore,
                        playerStats.eligibleMatchDataPool,
                      )}
                    </span>
                  </div>
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
                      {getPercentage(eventStats.withTeamsOrPlayers, eventStats.total)}%
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

            {/* Aggregate Stats Cache */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Aggregate Stats</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Population average stats (unified rebuild)"
                    onClick={() => handleRebuildCache("aggregateStats")}
                    disabled={rebuildingCache === "aggregateStats" || !!activeStatsRebuild}
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
                {cacheMetadata.aggregateStatsCache && aggregateCoverage && (
                  <div className="space-y-1 mt-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Yunite event coverage</span>
                      <span className="font-medium text-right">
                        {aggregateCoverage.included.toLocaleString()} players
                      </span>
                    </div>
                    {aggregateCoverage.excludedNoYuniteEvents > 0 && (
                      <p className="text-muted-foreground">
                        {aggregateCoverage.matchDataPool} match-data pool ·{" "}
                        {aggregateCoverage.excludedNoYuniteEvents} without Yunite import events
                      </p>
                    )}
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
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Pool coverage</span>
                      <span className="font-medium text-right">
                        {poolCoverageLabel(
                          cacheMetadata.tierReEvaluationCache.evaluationCount,
                          cacheMetadata.competitivePool.tierEvalEligiblePool,
                        )}
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
                    {poolCoverageLabel(
                      playerStats.withContributionScore,
                      playerStats.eligibleMatchDataPool,
                    )}{" "}
                    of competitive pool
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
                      <TableHead>Tier Eval Cache</TableHead>
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
                          {player.hasTierEvalCache ? (
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
