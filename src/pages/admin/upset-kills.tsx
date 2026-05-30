import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Loader2Icon, RefreshCwIcon, TrendingUpIcon, ShieldAlertIcon, SwordsIcon, UsersIcon, TargetIcon, TrophyIcon, SkullIcon, ZapIcon, CrosshairIcon, SearchIcon, DatabaseIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

// Tier badge styling
function TierBadge({ tier }: { tier: string | undefined }) {
  const tierColors: Record<string, string> = {
    S: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    A: "bg-red-500/20 text-red-400 border-red-500/30",
    B: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    C: "bg-green-500/20 text-green-400 border-green-500/30",
    D: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  
  if (!tier) {
    return <Badge variant="outline" className="text-muted-foreground">?</Badge>;
  }
  
  return (
    <Badge variant="outline" className={cn("font-bold", tierColors[tier] || "")}>
      {tier}
    </Badge>
  );
}

// Tier difference indicator
function TierDiffBadge({ diff }: { diff: number }) {
  if (diff === 0) return null;
  
  const isUpset = diff > 0;
  const diffText = diff > 0 ? `+${diff}` : `${diff}`;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "ml-2 font-mono",
        isUpset 
          ? "bg-amber-500/20 text-amber-400 border-amber-500/30" 
          : "bg-gray-500/20 text-gray-400"
      )}
    >
      {diffText}
    </Badge>
  );
}

// Dialog to show all kills for a specific player
function PlayerKillsDialog({
  playerId,
  open,
  onOpenChange,
}: {
  playerId: Id<"players"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const playerKills = useQuery(
    api.upsetKills.getAllPlayerKills,
    playerId ? { playerId, paginationOpts: { numItems: 100, cursor: null } } : "skip"
  );
  
  const isLoading = !playerKills;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CrosshairIcon className="h-5 w-5" />
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <>
                {playerKills.playerName}
                <TierBadge tier={playerKills.playerTier} />
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* Stats Summary */}
            <div className="grid grid-cols-5 gap-3 py-4 border-b">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{playerKills.stats.totalKills}</p>
                <p className="text-xs text-muted-foreground">Kills</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{playerKills.stats.totalDeaths}</p>
                <p className="text-xs text-muted-foreground">Deaths</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{playerKills.stats.kdRatio}</p>
                <p className="text-xs text-muted-foreground">K/D</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-500">{playerKills.stats.upsetKills}</p>
                <p className="text-xs text-muted-foreground">Upset Kills</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-500">{playerKills.stats.upsetDeaths}</p>
                <p className="text-xs text-muted-foreground">Upset Deaths</p>
              </div>
            </div>
            
            {/* Tabs for Kills/Deaths */}
            <Tabs defaultValue="kills" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="kills" className="gap-2">
                  <TargetIcon className="h-4 w-4" />
                  Kills ({playerKills.kills.length})
                </TabsTrigger>
                <TabsTrigger value="deaths" className="gap-2">
                  <SkullIcon className="h-4 w-4" />
                  Deaths ({playerKills.deaths.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="kills" className="flex-1 overflow-auto mt-4">
                {playerKills.kills.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No kills recorded</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Victim</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Weapon</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead className="text-right">Upset</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {playerKills.kills.map((kill) => (
                        <TableRow 
                          key={kill._id}
                          className={cn(kill.isUpset && "bg-amber-500/5")}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {kill.opponentPlayerId ? (
                                <Link 
                                  to={`/player-profile/${kill.opponentPlayerId}`}
                                  className="text-primary hover:underline font-medium"
                                  onClick={() => onOpenChange(false)}
                                >
                                  {kill.opponentName}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">{kill.opponentName}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell><TierBadge tier={kill.opponentTier} /></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{kill.weapon || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                            {kill.eventName}
                          </TableCell>
                          <TableCell className="text-right">
                            {kill.isUpset ? (
                              <TierDiffBadge diff={kill.tierDifference} />
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              
              <TabsContent value="deaths" className="flex-1 overflow-auto mt-4">
                {playerKills.deaths.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No deaths recorded</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Killed By</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Weapon</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead className="text-right">Upset</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {playerKills.deaths.map((death) => (
                        <TableRow 
                          key={death._id}
                          className={cn(death.isUpset && "bg-red-500/5")}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {death.opponentPlayerId ? (
                                <Link 
                                  to={`/player-profile/${death.opponentPlayerId}`}
                                  className="text-primary hover:underline font-medium"
                                  onClick={() => onOpenChange(false)}
                                >
                                  {death.opponentName}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">{death.opponentName}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell><TierBadge tier={death.opponentTier} /></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{death.weapon || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                            {death.eventName}
                          </TableCell>
                          <TableCell className="text-right">
                            {death.isUpset ? (
                              <TierDiffBadge diff={death.tierDifference} />
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
            
            {/* Footer with link to profile */}
            {playerId && (
              <div className="pt-4 border-t flex justify-end">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/player-profile/${playerId}`} onClick={() => onOpenChange(false)}>
                    View Full Profile
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function UpsetKillsPage() {
  const [killerTierFilter, setKillerTierFilter] = useState<string>("all");
  const [victimTierFilter, setVictimTierFilter] = useState<string>("all");
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [playerDialogOpen, setPlayerDialogOpen] = useState(false);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [isRemovingDuplicates, setIsRemovingDuplicates] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  
  // Fetch stats (from cache - instant load)
  const stats = useQuery(api.upsetKills.getUpsetKillsStats);
  
  // Fetch paginated upset kills
  const { 
    results: upsetKills, 
    status: queryStatus, 
    loadMore 
  } = usePaginatedQuery(
    api.upsetKills.getUpsetKills,
    {
      killerTier: killerTierFilter === "all" ? undefined : killerTierFilter,
      victimTier: victimTierFilter === "all" ? undefined : victimTierFilter,
    },
    { initialNumItems: 25 }
  );
  
  // Background job status (reactive - updates automatically as backend processes batches)
  const jobStatus = useQuery(api.yunite.backfillJobManager.getBackfillJobStatus);
  const startBackfillJob = useMutation(api.yunite.backfillJobManager.startBackfillJob);
  const cancelBackfillJob = useMutation(api.yunite.backfillJobManager.cancelBackfillJob);
  const dismissJob = useMutation(api.yunite.backfillJobManager.dismissJob);
  
  // Refresh stats mutation
  const rebuildStatsCache = useMutation(api.upsetKills.rebuildStatsCache);
  
  // Remove duplicates mutation
  const removeDuplicatesMutation = useMutation(api.upsetKills.removeDuplicateKillEvents);
  
  // Clear all data mutation
  const clearAllDataMutation = useMutation(api.upsetKills.clearAllKillEvents);
  
  const isJobRunning = jobStatus?.status === "running";
  
  const handleRemoveDuplicates = async () => {
    setIsRemovingDuplicates(true);
    try {
      const result = await removeDuplicatesMutation({});
      if (result.duplicatesRemoved > 0) {
        toast.success(`Removed ${result.duplicatesRemoved} duplicate records (${result.uniqueEvents} unique records remain)`);
      } else {
        toast.info("No duplicate records found");
      }
    } catch {
      toast.error("Failed to remove duplicates");
    } finally {
      setIsRemovingDuplicates(false);
    }
  };
  
  const handleClearAllData = async () => {
    if (!confirm("Are you sure you want to delete ALL upset kill data? This cannot be undone.")) {
      return;
    }
    setIsClearingData(true);
    try {
      let totalDeleted = 0;
      let hasMore = true;
      
      while (hasMore) {
        const result = await clearAllDataMutation({ batchSize: 500 });
        totalDeleted += result.deletedInBatch;
        hasMore = result.hasMore;
      }
      
      toast.success(`Cleared ${totalDeleted} kill events and stats cache`);
    } catch {
      toast.error("Failed to clear data");
    } finally {
      setIsClearingData(false);
    }
  };
  
  const handleBackfill = async (forceRefresh = false) => {
    try {
      await startBackfillJob({ forceRefresh });
      toast.info(`${forceRefresh ? "Refresh" : "Backfill"} started — running in the background`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start backfill");
    }
  };
  
  const handleCancelJob = async () => {
    if (!jobStatus) return;
    try {
      await cancelBackfillJob({ jobId: jobStatus._id });
      toast.info("Backfill cancelled");
    } catch {
      toast.error("Failed to cancel");
    }
  };
  
  const handleDismissJob = async () => {
    if (!jobStatus) return;
    try {
      await dismissJob({ jobId: jobStatus._id });
    } catch {
      // Silently ignore
    }
  };
  
  const handleRefreshStats = async () => {
    setIsRefreshingStats(true);
    try {
      const result = await rebuildStatsCache();
      toast.success(`Stats refreshed! ${result.totalUpsetKills} upsets, ${result.totalKillEvents} total events`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh stats");
    } finally {
      setIsRefreshingStats(false);
    }
  };
  
  const isLoading = !stats;
  
  // Helper to open player kills dialog
  const openPlayerKills = (playerId: Id<"players"> | undefined) => {
    if (playerId) {
      setSelectedPlayerId(playerId);
      setPlayerDialogOpen(true);
    }
  };
  
  // Format cache timestamp
  const formatCacheTime = (timestamp: number | null | undefined) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    return date.toLocaleString();
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SwordsIcon className="h-8 w-8 text-amber-500" />
            Upset Kills
          </h1>
          <p className="text-muted-foreground mt-1">
            Track when lower-tier players eliminate higher-tier players
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Data is derived from Yunite match replay kill feeds. The knocker always gets credit regardless of who finishes. Counts may differ from leaderboard totals as not all kills are tracked in replay data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to="/admin/upset-kills/eliminations">
              <CrosshairIcon className="mr-2 h-4 w-4" />
              Eliminations
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/admin/upset-kills/h2h">
              <SwordsIcon className="mr-2 h-4 w-4" />
              Head-to-Head
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/admin/upset-kills/top">
              <TargetIcon className="mr-2 h-4 w-4" />
              Top Kills
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/admin/upset-kills/search">
              <SearchIcon className="mr-2 h-4 w-4" />
              Search Player
            </Link>
          </Button>
          <Button 
            onClick={() => handleBackfill(false)} 
            disabled={isJobRunning}
            variant="secondary"
          >
            {isJobRunning && jobStatus?.mode === "backfill" ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Backfilling...
              </>
            ) : (
              <>
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                Backfill New
              </>
            )}
          </Button>
          <Button 
            onClick={() => handleBackfill(true)} 
            disabled={isJobRunning}
            variant="destructive"
          >
            {isJobRunning && jobStatus?.mode === "refresh" ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                Refresh All
              </>
            )}
          </Button>
          <Button 
            onClick={handleRemoveDuplicates} 
            disabled={isRemovingDuplicates || isJobRunning}
            variant="secondary"
          >
            {isRemovingDuplicates ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Trash2Icon className="mr-2 h-4 w-4" />
                Remove Duplicates
              </>
            )}
          </Button>
          <Button 
            onClick={handleClearAllData} 
            disabled={isClearingData || isJobRunning}
            variant="destructive"
          >
            {isClearingData ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2Icon className="mr-2 h-4 w-4" />
                Clear All Data
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Cache Status Banner */}
      {stats && (
        <Card className={cn(
          "border",
          stats.isCached 
            ? "border-green-500/30 bg-green-500/5" 
            : "border-amber-500/30 bg-amber-500/5"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <DatabaseIcon className={cn(
                  "h-5 w-5",
                  stats.isCached ? "text-green-500" : "text-amber-500"
                )} />
                <div>
                  <p className="font-medium">
                    {stats.isCached ? "Stats loaded from cache" : "No cache available"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stats.isCached 
                      ? `Last updated: ${formatCacheTime(stats.lastUpdated)}`
                      : "Click 'Refresh Stats' to build the cache"}
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefreshStats}
                disabled={isRefreshingStats}
              >
                {isRefreshingStats ? (
                  <>
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCwIcon className="mr-2 h-4 w-4" />
                    Refresh Stats
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Background Job Progress */}
      {jobStatus && (
        <Card className={cn(
          "border",
          jobStatus.status === "running"
            ? jobStatus.mode === "refresh" 
              ? "border-red-500/30 bg-red-500/5" 
              : "border-amber-500/30 bg-amber-500/5"
            : jobStatus.status === "completed"
              ? "border-green-500/30 bg-green-500/5"
              : jobStatus.status === "failed"
                ? "border-red-500/30 bg-red-500/5"
                : "border-muted"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <ZapIcon className={cn(
                  "h-5 w-5",
                  jobStatus.status === "running"
                    ? jobStatus.mode === "refresh" ? "text-red-500" : "text-amber-500"
                    : jobStatus.status === "completed"
                      ? "text-green-500"
                      : "text-muted-foreground"
                )} />
                <div>
                  <p className="font-medium">
                    {jobStatus.status === "running"
                      ? jobStatus.mode === "refresh" ? "Refreshing All (background)..." : "Backfilling New (background)..."
                      : jobStatus.status === "completed"
                        ? jobStatus.mode === "refresh" ? "Refresh Complete" : "Backfill Complete"
                        : jobStatus.status === "failed"
                          ? "Backfill Failed"
                          : "Backfill Cancelled"
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {jobStatus.status === "running"
                      ? `${jobStatus.remaining} imports remaining (${jobStatus.alreadyProcessed} of ${jobStatus.total} done)`
                      : `Processed ${jobStatus.processed} imports (${jobStatus.alreadyProcessed} total done)`
                    }
                  </p>
                  {jobStatus.errors.length > 0 && (
                    <p className="text-xs text-red-400 mt-1">
                      {jobStatus.errors.length} error(s) — last: {jobStatus.errors[jobStatus.errors.length - 1]?.error}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={cn(
                    "text-2xl font-bold",
                    jobStatus.mode === "refresh" ? "text-red-500" : "text-amber-500"
                  )}>{jobStatus.eventsStored}</p>
                  <p className="text-sm text-muted-foreground">events stored ({jobStatus.upsetsFound} upsets)</p>
                </div>
                {jobStatus.status === "running" ? (
                  <Button variant="ghost" size="sm" onClick={handleCancelJob}>
                    <XIcon className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={handleDismissJob}>
                    <XIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUpIcon className="h-4 w-4" />
                Total Upsets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-500">{stats?.totalUpsetKills || 0}</p>
              <p className="text-xs text-muted-foreground">
                {stats?.upsetPercentage || 0}% of all kills
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TargetIcon className="h-4 w-4" />
                Total Kill Events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.totalKillEvents || 0}</p>
              <p className="text-xs text-muted-foreground">cached from match data</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ShieldAlertIcon className="h-4 w-4" />
                Biggest Upset Gap
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-500">
                +{Math.max(...Object.keys(stats?.byTierDiff || { 0: 0 }).map(Number), 0)}
              </p>
              <p className="text-xs text-muted-foreground">tier levels</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                Unique Players
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {(stats?.topUpsetKillers?.length || 0) + (stats?.topUpsetVictims?.length || 0)}
              </p>
              <p className="text-xs text-muted-foreground">involved in upsets</p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Top Players Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Upset Killers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrophyIcon className="h-5 w-5 text-amber-500" />
              Top Upset Killers
            </CardTitle>
            <CardDescription>Players with the most upsets (lower tier eliminating higher)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : stats?.topUpsetKillers?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Upsets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topUpsetKillers.map((player, idx) => (
                    <TableRow key={player.discordId} className="hover:bg-amber-500/5">
                      <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        {player.playerId ? (
                          <button 
                            onClick={() => openPlayerKills(player.playerId)}
                            className="text-primary hover:underline font-medium text-left"
                          >
                            {player.playerName}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{player.playerName}</span>
                        )}
                      </TableCell>
                      <TableCell><TierBadge tier={player.tier} /></TableCell>
                      <TableCell className="text-right font-bold text-amber-500">
                        {player.upsetKills}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">No upset data yet</p>
            )}
          </CardContent>
        </Card>
        
        {/* Top Upset Victims */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SkullIcon className="h-5 w-5 text-red-500" />
              Most Upset Deaths
            </CardTitle>
            <CardDescription>Higher tier players eliminated by lower tier opponents</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : stats?.topUpsetVictims?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Deaths</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topUpsetVictims.map((player, idx) => (
                    <TableRow key={player.discordId} className="hover:bg-red-500/5">
                      <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        {player.playerId ? (
                          <button 
                            onClick={() => openPlayerKills(player.playerId)}
                            className="text-primary hover:underline font-medium text-left"
                          >
                            {player.playerName}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{player.playerName}</span>
                        )}
                      </TableCell>
                      <TableCell><TierBadge tier={player.tier} /></TableCell>
                      <TableCell className="text-right font-bold text-red-500">
                        {player.upsetDeaths}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">No upset data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Tier Breakdown */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Upsets by Killer Tier</CardTitle>
              <CardDescription>Which tiers are pulling off upsets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {["C", "B", "A"].map(tier => (
                  <div key={tier} className="flex items-center gap-3">
                    <TierBadge tier={tier} />
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full",
                          tier === "C" ? "bg-green-500" : tier === "B" ? "bg-blue-500" : "bg-red-500"
                        )}
                        style={{ 
                          width: `${Math.min(100, ((stats.byKillerTier[tier] || 0) / Math.max(1, stats.totalUpsetKills)) * 100 * 3)}%` 
                        }}
                      />
                    </div>
                    <span className="font-mono text-sm w-12 text-right">
                      {stats.byKillerTier[tier] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Upsets by Victim Tier</CardTitle>
              <CardDescription>Which tiers are being upset</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {["S", "A", "B"].map(tier => (
                  <div key={tier} className="flex items-center gap-3">
                    <TierBadge tier={tier} />
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full",
                          tier === "S" ? "bg-purple-500" : tier === "A" ? "bg-red-500" : "bg-blue-500"
                        )}
                        style={{ 
                          width: `${Math.min(100, ((stats.byVictimTier[tier] || 0) / Math.max(1, stats.totalUpsetKills)) * 100 * 3)}%` 
                        }}
                      />
                    </div>
                    <span className="font-mono text-sm w-12 text-right">
                      {stats.byVictimTier[tier] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Recent Upset Kills */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Recent Upset Kills</CardTitle>
              <CardDescription>Browse recent upsets with filters</CardDescription>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/admin/upset-kills/search">
                <SearchIcon className="mr-2 h-4 w-4" />
                Search by Player
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="w-48">
              <Select value={killerTierFilter} onValueChange={setKillerTierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Killer Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Killer Tiers</SelectItem>
                  <SelectItem value="C">C Tier Killers</SelectItem>
                  <SelectItem value="B">B Tier Killers</SelectItem>
                  <SelectItem value="A">A Tier Killers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={victimTierFilter} onValueChange={setVictimTierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Victim Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Victim Tiers</SelectItem>
                  <SelectItem value="S">S Tier Victims</SelectItem>
                  <SelectItem value="A">A Tier Victims</SelectItem>
                  <SelectItem value="B">B Tier Victims</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Killer</TableHead>
                <TableHead className="text-center">VS</TableHead>
                <TableHead>Victim</TableHead>
                <TableHead>Tier Gap</TableHead>
                <TableHead>Weapon</TableHead>
                <TableHead>Event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queryStatus === "LoadingFirstPage" ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                  </TableRow>
                ))
              ) : upsetKills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No upset kills found matching filters. Try backfilling or changing filters.
                  </TableCell>
                </TableRow>
              ) : (
                upsetKills.map((kill) => (
                  <TableRow 
                    key={kill._id} 
                    className={cn(
                      "hover:bg-muted/50",
                      kill.tierDifference >= 3 && "bg-purple-500/5",
                      kill.tierDifference === 2 && "bg-amber-500/5"
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TierBadge tier={kill.killerTier} />
                        {kill.killerPlayerId ? (
                          <button 
                            onClick={() => openPlayerKills(kill.killerPlayerId)}
                            className="text-primary hover:underline font-medium text-left"
                          >
                            {kill.killerName}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{kill.killerName}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xl">→</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TierBadge tier={kill.victimTier} />
                        {kill.victimPlayerId ? (
                          <button 
                            onClick={() => openPlayerKills(kill.victimPlayerId)}
                            className="text-primary hover:underline font-medium text-left"
                          >
                            {kill.victimName}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{kill.victimName}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TierDiffBadge diff={kill.tierDifference} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {kill.weapon || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {kill.eventName}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {/* Load More */}
          {queryStatus === "CanLoadMore" && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => loadMore(25)}>
                Load More
              </Button>
            </div>
          )}
          {queryStatus === "LoadingMore" && (
            <div className="mt-4 text-center">
              <Loader2Icon className="h-6 w-6 animate-spin mx-auto" />
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Player Kills Dialog */}
      <PlayerKillsDialog
        playerId={selectedPlayerId}
        open={playerDialogOpen}
        onOpenChange={setPlayerDialogOpen}
      />
    </div>
  );
}
