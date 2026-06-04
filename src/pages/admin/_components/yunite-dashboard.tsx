import { useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ChevronRight, TrendingUp, Users, Zap, Target, Activity, Loader2, StopCircle, Trash2, PlayCircle, RefreshCw, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

function PlayerMatchDataSyncTool() {
  const players = useQuery(api.players.getPlayers, {});
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Id<"players">[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const syncPlayerMatchData = useAction(api.yunite.sync.syncPlayerMatchData);
  
  const filteredPlayers = players?.filter(p => 
    p.discordUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.epicUsername?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  
  const handleTogglePlayer = (playerId: Id<"players">) => {
    setSelectedPlayerIds(prev => 
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };
  
  const handleSyncSelected = async () => {
    if (selectedPlayerIds.length === 0) {
      toast.error("Please select at least one player");
      return;
    }
    
    setIsSyncing(true);
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < selectedPlayerIds.length; i++) {
      const playerId = selectedPlayerIds[i];
      const player = players?.find(p => p._id === playerId);
      
      try {
        const result = await syncPlayerMatchData({ playerId });
        if (result.synced > 0 || result.alreadySynced > 0) {
          successCount++;
          toast.success(`${player?.discordUsername}: Synced ${result.synced} tournament(s)`, {
            description: result.alreadySynced > 0 ? `${result.alreadySynced} already synced` : undefined
          });
        }
      } catch (error) {
        failureCount++;
        toast.error(`${player?.discordUsername}: Failed to sync`, {
          description: error instanceof Error ? error.message : undefined
        });
      }
      
      // Add delay between players to avoid rate limits
      if (i < selectedPlayerIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    setIsSyncing(false);
    setSelectedPlayerIds([]);
    
    if (successCount > 0) {
      toast.success(`Completed! ${successCount} player(s) synced successfully`);
    }
    if (failureCount > 0) {
      toast.error(`${failureCount} player(s) failed to sync`);
    }
  };
  
  if (!players) {
    return <Skeleton className="h-64 w-full" />;
  }
  
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Badge variant="secondary" className="px-3 py-2">
          {selectedPlayerIds.length} selected
        </Badge>
      </div>
      
      <div className="border rounded-lg max-h-64 overflow-y-auto">
        {filteredPlayers.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No players found
          </div>
        ) : (
          <div className="divide-y">
            {filteredPlayers.map(player => (
              <label
                key={player._id}
                className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedPlayerIds.includes(player._id)}
                  onChange={() => handleTogglePlayer(player._id)}
                  className="h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{player.discordUsername}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {player.epicUsername}
                  </div>
                </div>
                {player.tier && (
                  <Badge variant="outline" className="text-xs">
                    Tier {player.tier}
                  </Badge>
                )}
              </label>
            ))}
          </div>
        )}
      </div>
      
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedPlayerIds([])}
          disabled={selectedPlayerIds.length === 0 || isSyncing}
        >
          <X className="mr-2 h-4 w-4" />
          Clear Selection
        </Button>
        
        <Button
          onClick={handleSyncSelected}
          disabled={selectedPlayerIds.length === 0 || isSyncing}
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing {selectedPlayerIds.length} player(s)...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync {selectedPlayerIds.length} player(s)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface YuniteDashboardProps {
  showBulkSync?: boolean;
  showMatchData?: boolean;
  showOverview?: boolean;
}

export default function YuniteDashboard({ 
  showBulkSync = true, 
  showMatchData = true,
  showOverview = true
}: YuniteDashboardProps = {}) {
  const navigate = useNavigate();
  const tournaments = useQuery(api.yuniteQueries.getYuniteImportSummaries, {
    limit: 100,
  });
  const [isSyncingYunite, setIsSyncingYunite] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [fetchingMatchData, setFetchingMatchData] = useState<Record<string, boolean>>({});
  const [isFixingOrphanedStats, setIsFixingOrphanedStats] = useState(false);
  const [orphanedStatsPlayerName, setOrphanedStatsPlayerName] = useState("");
  
  const syncYuniteAction = useAction(api.yunite.sync.syncYuniteTournaments);
  const stopSync = useMutation(api.sync.stopSync);
  const clearYuniteData = useAction(api.yunite.clear.clearYuniteData);
  const syncMatchData = useAction(api.yunite.sync.syncTournamentMatchData);
  const fixOrphanedStats = useMutation(api.fixMatchDataSync.fixOrphanedMatchStats);
  const players = useQuery(api.players.getPlayers, {});

  const handleSyncYunite = async () => {
    setIsSyncingYunite(true);
    try {
      const result = await syncYuniteAction({});
      if (result.stopped) {
        toast.info(`Sync stopped. Processed ${result.tournamentsProcessed} tournaments.`);
      } else {
        toast.success(
          `Yunite sync complete! Processed ${result.tournamentsProcessed} tournaments. ` +
          `${result.added} added, ${result.updated} updated.`
        );
      }
    } catch (error) {
      console.error("Yunite sync error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sync with Yunite";
      toast.error(errorMessage);
    } finally {
      setIsSyncingYunite(false);
    }
  };

  const handleStopSync = async () => {
    try {
      await stopSync({ syncType: "yunite" });
      toast.info("Stopping sync after current tournament...");
    } catch (error) {
      console.error("Stop sync error:", error);
      toast.error("Failed to stop sync");
    }
  };

  const handleClearData = async () => {
    if (!confirm("Are you sure you want to clear all Yunite API imports? This will NOT delete CSV imports. This cannot be undone.")) {
      return;
    }
    
    setIsClearingData(true);
    try {
      const result = await clearYuniteData({});
      toast.success(`Cleared ${result.deleted} Yunite API imports (CSV imports preserved)`);
    } catch (error) {
      console.error("Clear data error:", error);
      toast.error("Failed to clear Yunite data");
    } finally {
      setIsClearingData(false);
    }
  };
  
  const handleFetchMatchData = async (importId: Id<"thirdPartyImports">) => {
    setFetchingMatchData(prev => ({ ...prev, [importId]: true }));
    try {
      const result = await syncMatchData({ importId });
      toast.success(`Updated ${result.updated} players with match data from ${result.matchesFetched} matches`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch match data");
    } finally {
      setFetchingMatchData(prev => ({ ...prev, [importId]: false }));
    }
  };

  const handleFixOrphanedStats = async () => {
    if (!orphanedStatsPlayerName.trim()) {
      toast.error("Please enter a player name");
      return;
    }
    
    // Find the player
    const player = players?.find(p => 
      p.discordUsername.toLowerCase().includes(orphanedStatsPlayerName.toLowerCase()) ||
      p.epicUsername?.toLowerCase().includes(orphanedStatsPlayerName.toLowerCase())
    );
    
    if (!player) {
      toast.error("Player not found");
      return;
    }
    
    if (!player.discordUserId) {
      toast.error("Player has no Discord ID");
      return;
    }
    
    setIsFixingOrphanedStats(true);
    try {
      const result = await fixOrphanedStats({ discordId: player.discordUserId });
      
      if (result.updated > 0) {
        toast.success(
          `Fixed ${result.updated} orphaned match stats for ${player.discordUsername}`,
          { description: `${result.updates.length} old player record(s) found` }
        );
      } else {
        toast.success(`No orphaned stats found for ${player.discordUsername}`, {
          description: "All match stats are properly linked"
        });
      }
    } catch (error) {
      console.error("Fix orphaned stats error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fix orphaned stats");
    } finally {
      setIsFixingOrphanedStats(false);
    }
  };

  if (tournaments === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Calculate overall stats
  const totalTournaments = tournaments.length;
  const totalPlayers = tournaments.reduce((sum, t) => sum + t.totalPlayers, 0);
  const totalEliminations = tournaments.reduce((sum, t) => sum + t.totalEliminations, 0);

  return (
    <div className="space-y-6">
      {/* Features Card */}
      {showBulkSync && (
        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>
              Advanced Yunite sync features and tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-2">
                <div className="rounded-full bg-yellow-500/10 p-1 mt-0.5">
                  <Activity className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1">Bulk Yunite Sync (admin-triggered)</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Fetches and imports all recent guild tournaments from the Yunite API when you click sync (not scheduled). Match data still requires a separate manual sync per import. For selective imports, use Fetch Recent Tournaments on the Uploads tab.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleSyncYunite}
                  disabled={isSyncingYunite}
                >
                  {isSyncingYunite ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing from Yunite...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Bulk Sync All Tournaments
                    </>
                  )}
                </Button>
                
                {isSyncingYunite && (
                  <Button
                    onClick={handleStopSync}
                    variant="destructive"
                  >
                    <StopCircle className="mr-2 h-4 w-4" />
                    Stop Sync
                  </Button>
                )}
                
                {tournaments.length > 0 && !isSyncingYunite && (
                  <>
                    <Button
                      onClick={handleClearData}
                      variant="outline"
                      disabled={isClearingData}
                    >
                      {isClearingData ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Clearing Data...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Clear All API Imports
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
              
              {/* Fix Orphaned Stats Tool */}
              {tournaments.length > 0 && (
                <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                  <h4 className="font-semibold text-sm mb-2">Fix Orphaned Match Stats</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    If a player's match stats aren't showing up, they may be linked to an old deleted player record. Enter their name to fix.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search player name..."
                      value={orphanedStatsPlayerName}
                      onChange={(e) => setOrphanedStatsPlayerName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleFixOrphanedStats();
                        }
                      }}
                      disabled={isFixingOrphanedStats}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleFixOrphanedStats}
                      variant="outline"
                      disabled={isFixingOrphanedStats || !orphanedStatsPlayerName.trim()}
                    >
                      {isFixingOrphanedStats ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Fixing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Fix Player
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Fetch Match Data Card */}
      {showMatchData && tournaments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fetch Detailed Match Stats</CardTitle>
            <CardDescription>
              Click "Fetch Match Data" for any tournament to add individual player eliminations, deaths, and knocks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tournaments.map((tournament) => (
                <div
                  key={tournament._id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{tournament.eventName}</p>
                      {tournament.matchDataSynced && (
                        <Badge variant="secondary" className="text-xs">Match Data ✓</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tournament.totalPlayers} players • {tournament.playersMatched} matched
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/admin/yunite/${tournament._id}`)}
                    >
                      View Details
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                    {!tournament.matchDataSynced && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFetchMatchData(tournament._id)}
                        disabled={fetchingMatchData[tournament._id]}
                      >
                        {fetchingMatchData[tournament._id] ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          <>
                            <PlayCircle className="mr-2 h-3 w-3" />
                            Fetch Match Data
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Batch Player Match Data Sync */}
      {tournaments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Batch Player Match Data Sync</CardTitle>
            <CardDescription>
              Sync match data for all unsynced tournaments that specific players participated in. This enables TC calculation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlayerMatchDataSyncTool />
          </CardContent>
        </Card>
      )}

      {showOverview && tournaments.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No Tournaments Yet</CardTitle>
            <CardDescription>
              Click "Sync from Yunite API" above to import tournaments and view detailed stats
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      
      {showOverview && tournaments.length > 0 && (
        <>
          {/* Overview Stats */}
          <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tournaments Synced</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTournaments}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPlayers}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Eliminations</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEliminations.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tournaments List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Yunite Tournaments</CardTitle>
          <CardDescription>
            Click on a tournament to view detailed stats including eliminations and player performance
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Players</TableHead>
                <TableHead>Matched</TableHead>
                <TableHead>Total Elims</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tournaments.map((tournament) => (
                <TableRow key={tournament._id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{tournament.eventName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tournament.eventDate ? format(new Date(tournament.eventDate), "MMM d, yyyy") : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{tournament.totalPlayers}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="bg-green-600">
                      {tournament.playersMatched}
                    </Badge>
                  </TableCell>
                  <TableCell>{tournament.totalEliminations.toLocaleString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/yunite/${tournament._id}`)}
                    >
                      View Details
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
