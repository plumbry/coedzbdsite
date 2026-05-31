import { useParams } from "react-router-dom";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.tsx";
import { Input } from "@/components/ui/input.tsx";
import { RefreshCw, ChevronDown, Info, Edit2, X, Check } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PageHeader from "@/components/page-header.tsx";
import { toast } from "sonner";
import { useState } from "react";

function YuniteTournamentContent() {
  const { importId } = useParams();
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("matched");
  const [matchBreakdown, setMatchBreakdown] = useState<{
    tournamentName: string;
    totalMatches: number;
    matches: Array<{
      matchNumber: number;
      sessionId: string;
      killFeed: Array<{
        killerDiscordId: string;
        killerEpicId: string;
        killerName?: string;
        victimEpicId?: string;
        victimDiscordId?: string;
        finish: boolean;
        knock: boolean;
        gun?: string;
        distance?: number;
        timestamp?: string;
        time?: number;
        [key: string]: unknown;
      }>;
      teams: Array<{
        placement: number;
        teamKills: number;
        sumOfPlayerKills: number;
        discrepancy: number;
        players: Array<{
          discordId: string;
          epicId: string;
          playerName?: string;
          playerTier?: string;
          matched: boolean;
          eliminations: number;
          totalKillFeedEntries: number;
        }>;
      }>;
    }>;
  } | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<{ sessionId: string; discordId: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  
  const syncMatchData = useAction(api.yunite.sync.syncTournamentMatchData);
  const fetchMatchBreakdown = useAction(api.yunite.matchData.fetchTournamentMatchBreakdown);
  const setEliminationOverride = useMutation(api.yunite.eliminationOverrides.setEliminationOverride);
  
  const tournamentDetails = useQuery(
    api.yuniteQueries.getTournamentDetails,
    importId ? { importId: importId as Id<"thirdPartyImports"> } : "skip"
  );
  
  const handleSyncMatchData = async () => {
    if (!importId) return;
    
    setIsSyncing(true);
    try {
      const result = await syncMatchData({ importId: importId as Id<"thirdPartyImports"> });
      toast.success(`Match data synced! Updated ${result.updated} players across ${result.matchesFetched} matches.`);
    } catch (error) {
      console.error("Failed to sync match data:", error);
      toast.error(error instanceof Error ? error.message : "Failed to sync match data");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFetchMatchBreakdown = async () => {
    if (!importId || matchBreakdown) return; // Don't fetch if already loaded
    
    setLoadingBreakdown(true);
    try {
      const data = await fetchMatchBreakdown({ importId: importId as Id<"thirdPartyImports"> });
      setMatchBreakdown(data);
      toast.success(`Loaded ${data.totalMatches} matches`);
    } catch (error) {
      console.error("Failed to fetch match breakdown:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch match breakdown");
    } finally {
      setLoadingBreakdown(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "breakdown" && !matchBreakdown && !loadingBreakdown) {
      handleFetchMatchBreakdown();
    }
  };

  const handleEditEliminations = (sessionId: string, discordId: string, currentValue: number) => {
    setEditingPlayer({ sessionId, discordId });
    setEditValue(String(currentValue));
  };

  const handleCancelEdit = () => {
    setEditingPlayer(null);
    setEditValue("");
  };

  const handleSaveEliminations = async (sessionId: string, discordId: string, team: {
    placement: number;
    teamKills: number;
    sumOfPlayerKills: number;
    discrepancy: number;
    players: Array<{
      discordId: string;
      eliminations: number;
    }>;
  }) => {
    if (!importId || !matchBreakdown) return;
    
    const newValue = parseInt(editValue);
    if (isNaN(newValue) || newValue < 0) {
      toast.error("Please enter a valid number");
      return;
    }
    
    try {
      // Prepare team players data for validation
      const teamPlayers = team.players.map(p => ({
        discordId: p.discordId,
        currentEliminations: p.eliminations,
      }));
      
      await setEliminationOverride({
        importId: importId as Id<"thirdPartyImports">,
        sessionId,
        discordId,
        eliminations: newValue,
        teamKills: team.teamKills,
        teamPlayers,
      });
      
      // Update local state
      const updatedBreakdown = { ...matchBreakdown };
      const match = updatedBreakdown.matches.find(m => m.sessionId === sessionId);
      if (match) {
        const matchTeam = match.teams.find(t => t.players.some(p => p.discordId === discordId));
        if (matchTeam) {
          const player = matchTeam.players.find(p => p.discordId === discordId);
          if (player) {
            player.eliminations = newValue;
            matchTeam.sumOfPlayerKills = matchTeam.players.reduce((sum, p) => sum + p.eliminations, 0);
            matchTeam.discrepancy = matchTeam.teamKills - matchTeam.sumOfPlayerKills;
          }
        }
      }
      setMatchBreakdown(updatedBreakdown);
      
      toast.success("Eliminations updated");
      handleCancelEdit();
    } catch (error) {
      console.error("Failed to update eliminations:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update eliminations");
    }
  };

  if (!tournamentDetails) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={tournamentDetails.import.eventName}
        description="Detailed statistics for this tournament including all player performance data"
        back={{ label: "Back to Uploads", href: "/admin/uploads" }}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Uploads", href: "/admin/uploads" },
          { label: tournamentDetails.import.eventName },
        ]}
        variant="compact"
        actions={
          <Button
            onClick={handleSyncMatchData}
            disabled={isSyncing}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Match Data"}
          </Button>
        }
      />

          {/* Tournament Summary */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Players</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tournamentDetails.stats.totalPlayers}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Eliminations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tournamentDetails.stats.totalEliminations}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Placement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tournamentDetails.stats.averagePlacement.toFixed(1)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tier Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Players by Tier</CardTitle>
              <CardDescription className="text-xs">
                Breakdown of matched players by tier ranking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {(["S", "A", "B", "C", "Unranked"] as const).map((tier) => (
                  <div key={tier} className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3">
                    <Badge 
                      variant={tier === "Unranked" ? "outline" : "secondary"} 
                      className="text-xs font-semibold"
                    >
                      {tier}
                    </Badge>
                    <div className="text-2xl font-bold">
                      {tournamentDetails.stats.tierCounts[tier]}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {tournamentDetails.stats.matched > 0
                        ? `${((tournamentDetails.stats.tierCounts[tier] / tournamentDetails.stats.matched) * 100).toFixed(0)}%`
                        : "0%"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="matched">
                Matched Players ({tournamentDetails.matchedResults.length})
              </TabsTrigger>
              <TabsTrigger value="unmatched">
                Unmatched Players ({tournamentDetails.unmatchedResults.length})
              </TabsTrigger>
              <TabsTrigger value="breakdown">
                Match Breakdown
              </TabsTrigger>
            </TabsList>

            {/* Matched Players Tab */}
            <TabsContent value="matched">
              <Card>
                <CardHeader>
                  <CardTitle>Matched Players ({tournamentDetails.matchedResults.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>Epic Username</TableHead>
                          <TableHead>Tier</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Player Kills</TableHead>
                          <TableHead>Team Kills</TableHead>
                          <TableHead>Deaths</TableHead>
                          <TableHead>Knocks</TableHead>
                          <TableHead>Team</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tournamentDetails.matchedResults.map((result) => (
                          <TableRow key={result._id}>
                            <TableCell className="font-medium">#{result.placement}</TableCell>
                            <TableCell>{result.playerName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{result.epicUsername}</TableCell>
                            <TableCell>
                              {result.playerTier ? (
                                <Badge variant="secondary">{result.playerTier}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell>{result.points}</TableCell>
                            <TableCell>{result.eliminations || 0}</TableCell>
                            <TableCell>{result.teamKills || 0}</TableCell>
                            <TableCell>{result.deaths !== undefined ? result.deaths : "-"}</TableCell>
                            <TableCell>{result.knocks !== undefined ? result.knocks : "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {result.teamName || result.teamId || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Unmatched Players Tab */}
            <TabsContent value="unmatched">
              <Card>
                <CardHeader>
                  <CardTitle>Unmatched Players ({tournamentDetails.unmatchedResults.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Epic Username</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Player Kills</TableHead>
                          <TableHead>Team Kills</TableHead>
                          <TableHead>Deaths</TableHead>
                          <TableHead>Knocks</TableHead>
                          <TableHead>Team</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tournamentDetails.unmatchedResults.map((result) => (
                          <TableRow key={result._id}>
                            <TableCell className="font-medium">#{result.placement}</TableCell>
                            <TableCell>{result.epicUsername}</TableCell>
                            <TableCell>{result.points}</TableCell>
                            <TableCell>{result.eliminations || 0}</TableCell>
                            <TableCell>{result.teamKills || 0}</TableCell>
                            <TableCell>{result.deaths !== undefined ? result.deaths : "-"}</TableCell>
                            <TableCell>{result.knocks !== undefined ? result.knocks : "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {result.teamName || result.teamId || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Match Breakdown Tab */}
            <TabsContent value="breakdown">
              {loadingBreakdown ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading match breakdown...</p>
                    </div>
                  </CardContent>
                </Card>
              ) : matchBreakdown ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Match-by-Match Breakdown</CardTitle>
                    <CardDescription>
                      Detailed stats for each game. Eliminations calculated using Fortnite rules: knocks track the knocker, eliminations credit the last player who knocked the victim.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="match-0" className="w-full">
                      <TabsList className="w-full flex-wrap h-auto">
                        {matchBreakdown.matches.map((match, idx) => (
                          <TabsTrigger key={idx} value={`match-${idx}`}>
                            Game {match.matchNumber}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      
                      {matchBreakdown.matches.map((match, idx) => (
                        <TabsContent key={idx} value={`match-${idx}`} className="mt-6">
                          <div className="space-y-6">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">Game {match.matchNumber}</h3>
                              <code className="text-xs text-muted-foreground">{match.sessionId}</code>
                            </div>
                            
                            {/* Kill Feed Section */}
                            {match.killFeed.length > 0 && (
                              <Collapsible className="rounded-lg border bg-card">
                                <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                  <h4 className="font-semibold text-sm">Kill Feed ({match.killFeed.length} eliminations)</h4>
                                  <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="px-4 pb-4">
                                  <div className="rounded-md border overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/50">
                                          <TableHead className="text-xs">Killer</TableHead>
                                          <TableHead className="text-xs">Action</TableHead>
                                          <TableHead className="text-xs">Victim</TableHead>
                                          <TableHead className="text-xs">Weapon</TableHead>
                                          <TableHead className="text-xs text-right">Time</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody className="max-h-96 overflow-y-auto">
                                        {match.killFeed.map((kill, killIdx) => (
                                          <TableRow key={killIdx}>
                                            <TableCell className="text-xs">
                                              <span className={kill.killerName ? "font-medium" : "font-mono text-muted-foreground"}>
                                                {kill.killerName || kill.killerEpicId}
                                              </span>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {kill.knock && !kill.finish ? (
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">KNOCK</Badge>
                                              ) : (
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">ELIM</Badge>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              <span className={kill.victimEpicId && !kill.victimEpicId.match(/^\d+$/) ? "font-medium" : "font-mono text-muted-foreground"}>
                                                {kill.victimEpicId || "-"}
                                              </span>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                              {kill.gun || "-"}
                                            </TableCell>
                                            <TableCell className="text-xs text-right text-muted-foreground">
                                              {kill.time ? `${Math.floor(kill.time / 60)}:${String(Math.floor(kill.time % 60)).padStart(2, '0')}` : "-"}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            
                            {/* Team Breakdown Section */}
                            <div className="space-y-3">
                              <h4 className="font-semibold text-sm">Team Breakdown</h4>
                              {match.teams.map((team, teamIdx) => {
                                // Calculate team tier combo (e.g., "SBCC")
                                const teamTiers = team.players
                                  .map(p => p.playerTier || "?")
                                  .sort((a, b) => {
                                    // Sort S > A > B > C > ? > Unranked
                                    const order = { "S": 4, "A": 3, "B": 2, "C": 1, "?": 0, "Unranked": 0 };
                                    return (order[b as keyof typeof order] || 0) - (order[a as keyof typeof order] || 0);
                                  })
                                  .join("");
                                
                                return (
                                <div key={teamIdx} className="rounded-lg border bg-card p-4 space-y-3">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                      <Badge variant="outline" className="text-sm">
                                        Placement #{team.placement}
                                      </Badge>
                                      {teamTiers && (
                                        <Badge variant="secondary" className="text-xs font-mono">
                                          {teamTiers}
                                        </Badge>
                                      )}
                                      <div className="flex items-center gap-4 text-sm">
                                        <span className="font-medium">
                                          Team Kills (API): <span className="text-primary">{team.teamKills}</span>
                                        </span>
                                        <span className="font-medium">
                                          Verified Individual Kills: <span className="text-primary">{team.sumOfPlayerKills}</span>
                                        </span>
                                        {team.discrepancy !== 0 && (
                                          <Badge variant={team.discrepancy > 0 ? "destructive" : "secondary"}>
                                            Discrepancy: {team.discrepancy > 0 ? '+' : ''}{team.discrepancy}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    {team.discrepancy !== 0 && (
                                      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        <p>
                                          The Yunite API's kill-feed data is incomplete. Individual kills shown are verified from available kill-feed entries. 
                                          The API team kills total may include kills missing from the kill-feed.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="rounded-md border overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/50">
                                          <TableHead className="text-xs">Player</TableHead>
                                          <TableHead className="text-xs">Epic ID</TableHead>
                                          <TableHead className="text-xs">Tier</TableHead>
                                          <TableHead className="text-xs text-right">Eliminations</TableHead>
                                          <TableHead className="text-xs w-20"></TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {team.players.map((player, playerIdx) => {
                                          const isEditing = editingPlayer?.sessionId === match.sessionId && editingPlayer?.discordId === player.discordId;
                                          return (
                                            <TableRow key={playerIdx}>
                                              <TableCell className="text-xs">
                                                {player.playerName || (
                                                  <span className="font-mono text-muted-foreground">{player.discordId}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-xs">{player.epicId}</TableCell>
                                              <TableCell className="text-xs">
                                                {player.playerTier ? (
                                                  <Badge variant="secondary" className="text-xs">{player.playerTier}</Badge>
                                                ) : (
                                                  <span className="text-muted-foreground">-</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-xs text-right">
                                                {isEditing ? (
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    className="h-6 w-16 text-xs text-right"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") {
                                                        handleSaveEliminations(match.sessionId, player.discordId, team);
                                                      } else if (e.key === "Escape") {
                                                        handleCancelEdit();
                                                      }
                                                    }}
                                                  />
                                                ) : (
                                                  <span className="font-semibold">{player.eliminations}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-xs">
                                                {isEditing ? (
                                                  <div className="flex gap-1">
                                                    <Button
                                                      size="icon"
                                                      variant="ghost"
                                                      className="min-h-9 min-w-9 h-9 w-9"
                                                      onClick={() => handleSaveEliminations(match.sessionId, player.discordId, team)}
                                                    >
                                                      <Check className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                      size="icon"
                                                      variant="ghost"
                                                      className="min-h-9 min-w-9 h-9 w-9"
                                                      onClick={handleCancelEdit}
                                                    >
                                                      <X className="h-3 w-3" />
                                                    </Button>
                                                  </div>
                                                ) : (
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="min-h-9 min-w-9 h-9 w-9"
                                                    onClick={() => handleEditEliminations(match.sessionId, player.discordId, player.eliminations)}
                                                  >
                                                    <Edit2 className="h-3 w-3" />
                                                  </Button>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">Click to load match breakdown</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
    </div>
  );
}

export default function YuniteTournamentDetails() {
  return (
    <AdminPageLayout skipHeader requireAdmin authTitle="Sign in to view tournament details">
      <YuniteTournamentContent />
    </AdminPageLayout>
  );
}
