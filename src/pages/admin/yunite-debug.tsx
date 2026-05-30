import { useState } from "react";
import { useAction } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";

export default function YuniteDebugPage() {
  const navigate = useNavigate();
  const [tournamentId, setTournamentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [leaderboardData, setLeaderboardData] = useState<unknown>(null);
  const [matchesData, setMatchesData] = useState<unknown>(null);
  const [matchData, setMatchData] = useState<unknown>(null);
  const [survivalTimeData, setSurvivalTimeData] = useState<unknown>(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [loadingSurvivalTime, setLoadingSurvivalTime] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [fetchMatchDataEnabled, setFetchMatchDataEnabled] = useState(true);
  const [probeDiscordId, setProbeDiscordId] = useState("");
  const [probeResults, setProbeResults] = useState<unknown>(null);
  const [loadingProbe, setLoadingProbe] = useState(false);

  const fetchLeaderboard = useAction(api.yunite.debug.fetchTournamentLeaderboard);
  const fetchMatches = useAction(api.yunite.debug.fetchTournamentMatches);
  const fetchMatch = useAction(api.yunite.debug.fetchMatchData);
  const saveImport = useAction(api.yunite.debug.saveTournamentImport);
  const checkSurvivalTime = useAction(api.yunite.checkSurvivalTimeData.checkLeaderboardData);
  const probeEndpoints = useAction(api.yunite.lookupPlatform.probeYuniteUserEndpoints);

  const handleFetchLeaderboard = async () => {
    if (!tournamentId.trim()) {
      toast.error("Please enter a tournament ID");
      return;
    }

    setLoadingLeaderboard(true);
    try {
      const data = await fetchLeaderboard({ tournamentId: tournamentId.trim() });
      setLeaderboardData(data);
      toast.success("Leaderboard fetched successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch leaderboard");
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const handleFetchMatches = async () => {
    if (!tournamentId.trim()) {
      toast.error("Please enter a tournament ID");
      return;
    }

    setLoadingMatches(true);
    try {
      const data = await fetchMatches({ tournamentId: tournamentId.trim() });
      setMatchesData(data);
      toast.success("Matches fetched successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch matches");
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleFetchMatch = async () => {
    if (!tournamentId.trim() || !sessionId.trim()) {
      toast.error("Please enter both tournament ID and session ID");
      return;
    }

    setLoadingMatch(true);
    try {
      const data = await fetchMatch({ 
        tournamentId: tournamentId.trim(),
        sessionId: sessionId.trim()
      });
      setMatchData(data);
      toast.success("Match data fetched successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch match data");
    } finally {
      setLoadingMatch(false);
    }
  };

  const handleCheckSurvivalTime = async () => {
    if (!tournamentId.trim()) {
      toast.error("Please enter a tournament ID");
      return;
    }

    setLoadingSurvivalTime(true);
    try {
      const data = await checkSurvivalTime({ tournamentId: tournamentId.trim() });
      setSurvivalTimeData(data);
      toast.success("Survival time data fetched successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to check survival time");
    } finally {
      setLoadingSurvivalTime(false);
    }
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-8 p-8">
      <div>
        <h1 className="text-4xl font-bold">Yunite API Debug Tool</h1>
        <p className="mt-2 text-muted-foreground">
          Fetch and inspect raw data from the Yunite API
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Badge variant="outline" className="mr-2">Admin Only</Badge>
          Imports created through this tool are only visible to administrators
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tournament ID</CardTitle>
          <CardDescription>
            Enter the Yunite tournament ID to fetch data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tournamentId">Tournament ID</Label>
            <Input
              id="tournamentId"
              placeholder="e.g., 010510ba-38c6-4b57-9dfa-edbbb614300c"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <Button
              onClick={handleFetchLeaderboard}
              disabled={loadingLeaderboard}
            >
              {loadingLeaderboard && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              {loadingLeaderboard ? "Fetching..." : "Fetch Leaderboard"}
            </Button>

            <Button
              onClick={handleFetchMatches}
              disabled={loadingMatches}
              variant="secondary"
            >
              {loadingMatches && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              {loadingMatches ? "Fetching..." : "Fetch Match List"}
            </Button>

            <Button
              onClick={handleCheckSurvivalTime}
              disabled={loadingSurvivalTime}
              variant="outline"
            >
              {loadingSurvivalTime && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              {loadingSurvivalTime ? "Checking..." : "Check Survival Time Data"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {survivalTimeData !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Survival Time Data Analysis</CardTitle>
            <CardDescription>
              Check if survival time varies per player or is same for team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm">
                <strong>Total entries:</strong> {(survivalTimeData as { totalEntries: number }).totalEntries}
              </p>
              <p className="text-sm">
                <strong>Available fields:</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                {((survivalTimeData as { availableFields: string[] }).availableFields || []).map((field) => (
                  <Badge key={field} variant="secondary">{field}</Badge>
                ))}
              </div>
            </div>

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium">Team/Player</th>
                    <th className="p-2 text-right font-medium">Sum Survival (s)</th>
                    <th className="p-2 text-right font-medium">Avg Survival (s)</th>
                    <th className="p-2 text-left font-medium">Players</th>
                  </tr>
                </thead>
                <tbody>
                  {((survivalTimeData as { sampleEntries: Array<{
                    teamName?: string;
                    epicName?: string;
                    sumSecondsSurvived?: number;
                    averageSecondsSurvived?: number;
                    users?: Array<{ epicName?: string; discordId?: string }>;
                  }> }).sampleEntries || []).map((entry, idx) => {
                    const name = entry.teamName || entry.epicName || "Unknown";
                    const sumSurvival = entry.sumSecondsSurvived;
                    const avgSurvival = entry.averageSecondsSurvived;
                    const players = entry.users 
                      ? entry.users.map(u => u.epicName || u.discordId || "?").join(", ")
                      : "Solo";
                    
                    return (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{name}</td>
                        <td className="p-2 text-right">
                          {sumSurvival !== undefined ? sumSurvival.toFixed(1) : "N/A"}
                        </td>
                        <td className="p-2 text-right">
                          {avgSurvival !== undefined ? avgSurvival.toFixed(1) : "N/A"}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{players}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-4 space-y-2">
              <h3 className="font-semibold text-sm">Analysis</h3>
              <p className="text-sm text-muted-foreground">
                {((survivalTimeData as { availableFields: string[] }).availableFields || []).includes("sumSecondsSurvived")
                  ? "✓ Field 'sumSecondsSurvived' is present in the leaderboard data. Check if values differ per player in the raw data below."
                  : ((survivalTimeData as { availableFields: string[] }).availableFields || []).includes("averageSecondsSurvived")
                  ? "✓ Field 'averageSecondsSurvived' is present (but not sumSecondsSurvived). Check if values differ per player in the raw data below."
                  : "✗ Neither 'sumSecondsSurvived' nor 'averageSecondsSurvived' is present in the leaderboard endpoint. May need to check individual match endpoint."}
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Raw Sample Data</h3>
              <pre className="overflow-auto rounded bg-muted p-4 text-xs max-h-96">
                <code>{JSON.stringify(survivalTimeData, null, 2)}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {matchesData !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Match Session IDs</CardTitle>
            <CardDescription>
              Click on a session ID to copy it, then paste below to fetch match data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Total Matches: {(matchesData as { totalMatches: number }).totalMatches}
              </p>
              <div className="space-y-1">
                {(((matchesData as { matches: Array<{ id?: string; session?: string; sessionId?: string }> }).matches || []) as Array<{ id?: string; session?: string; sessionId?: string }>).map((match, idx) => {
                  const sid = match.sessionId || match.session || match.id || "unknown";
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded border p-2 hover:bg-muted cursor-pointer"
                      onClick={() => {
                        setSessionId(sid);
                        navigator.clipboard.writeText(sid);
                        toast.success("Session ID copied to clipboard");
                      }}
                    >
                      <SearchIcon className="h-4 w-4 text-muted-foreground" />
                      <code className="text-sm">{sid}</code>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Match Data</CardTitle>
          <CardDescription>
            Enter a session ID to fetch individual match data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sessionId">Session ID</Label>
            <Input
              id="sessionId"
              placeholder="Paste session ID here"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            />
          </div>

          <Button
            onClick={handleFetchMatch}
            disabled={loadingMatch}
          >
            {loadingMatch && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            {loadingMatch ? "Fetching..." : "Fetch Match Data"}
          </Button>
        </CardContent>
      </Card>

      {leaderboardData !== null && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Leaderboard Summary</CardTitle>
                  <CardDescription>
                    {(leaderboardData as { tournamentName?: string }).tournamentName || "Tournament"} - {(leaderboardData as { totalEntries: number }).totalEntries} entries
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="fetch-match-data"
                      checked={fetchMatchDataEnabled}
                      onCheckedChange={(checked) => setFetchMatchDataEnabled(checked === true)}
                    />
                    <Label htmlFor="fetch-match-data" className="text-sm font-normal cursor-pointer">
                      Include match data (eliminations, deaths, knocks)
                    </Label>
                  </div>
                  <Button
                    onClick={async () => {
                      setSavingImport(true);
                      try {
                        const data = leaderboardData as { 
                          tournamentId: string; 
                          tournamentName: string;
                          tournamentStartedAt: string;
                          leaderboard: unknown[];
                        };
                        const result = await saveImport({
                          tournamentId: data.tournamentId,
                          tournamentName: data.tournamentName,
                          tournamentStartedAt: data.tournamentStartedAt || undefined,
                          leaderboard: data.leaderboard,
                          fetchMatchData: fetchMatchDataEnabled,
                        });
                        
                        let message = `Saved! ${result.playersMatched} matched, ${result.playersUnmatched} unmatched`;
                        if (result.matchesFetched !== undefined) {
                          message += `, ${result.matchesFetched} matches processed`;
                        }
                        toast.success(message);
                        
                        // Navigate to the tournament details page
                        navigate(`/admin/yunite/${result.importId}`);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to save import");
                      } finally {
                        setSavingImport(false);
                      }
                    }}
                    disabled={savingImport}
                  >
                    {savingImport && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                    {savingImport ? "Saving..." : "Save as Tournament Import"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium">Rank</th>
                      <th className="p-2 text-left font-medium">Players</th>
                      <th className="p-2 text-right font-medium">Placement</th>
                      <th className="p-2 text-right font-medium">Kills</th>
                      <th className="p-2 text-right font-medium">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((leaderboardData as { leaderboard: Array<{
                      placement: number;
                      kills?: number;
                      eliminations?: number;
                      points?: number;
                      score?: number;
                      users?: Array<{ discordId: string; epicId?: string }>;
                      discordId?: string;
                      epicName?: string;
                    }> }).leaderboard || []).map((entry, idx) => {
                      const isTeam = entry.users && entry.users.length > 0;
                      const players = isTeam 
                        ? entry.users!.map(u => u.discordId).join(", ")
                        : entry.discordId || entry.epicName || "Unknown";
                      const kills = entry.kills || entry.eliminations || 0;
                      const points = entry.points || entry.score || 0;
                      
                      return (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{idx + 1}</td>
                          <td className="p-2 font-mono text-xs">{players}</td>
                          <td className="p-2 text-right">{entry.placement}</td>
                          <td className="p-2 text-right">{kills}</td>
                          <td className="p-2 text-right">{points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Raw Leaderboard Data</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded bg-muted p-4 text-xs">
                <code>{JSON.stringify(leaderboardData, null, 2)}</code>
              </pre>
            </CardContent>
          </Card>
        </>
      )}

      {matchData !== null && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Match Player Stats</CardTitle>
              <CardDescription>
                Per-player statistics from this match
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium">Discord ID</th>
                      <th className="p-2 text-right font-medium">Finishes</th>
                      <th className="p-2 text-right font-medium">Knocks</th>
                      <th className="p-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries((matchData as { playerStats: Record<string, { finishes: number; knocks: number; total: number }> }).playerStats || {}).map(([discordId, stats]) => (
                      <tr key={discordId} className="border-b">
                        <td className="p-2 font-mono text-xs">{discordId}</td>
                        <td className="p-2 text-right">{stats.finishes}</td>
                        <td className="p-2 text-right">{stats.knocks}</td>
                        <td className="p-2 text-right">{stats.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Survival Time Analysis (Match Level)</CardTitle>
              <CardDescription>
                Check if survival time data exists at the match level and if it varies per player
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const rawMatchData = ((matchData as { matchData: unknown[] }).matchData || []) as Array<Record<string, unknown>>;
                const firstEntry = rawMatchData[0] || {};
                const availableFields = Object.keys(firstEntry);
                const hasSumSurvival = availableFields.includes("sumSecondsSurvived");
                const hasAvgSurvival = availableFields.includes("averageSecondsSurvived");
                
                return (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm">
                        <strong>Available fields in match data:</strong>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {availableFields.map((field) => (
                          <Badge 
                            key={field} 
                            variant={field.toLowerCase().includes("surviv") ? "default" : "secondary"}
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {(hasSumSurvival || hasAvgSurvival) && (
                      <div className="rounded-md border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="p-2 text-left font-medium">Team/Players</th>
                              <th className="p-2 text-right font-medium">Placement</th>
                              {hasSumSurvival && <th className="p-2 text-right font-medium">Sum Survival (s)</th>}
                              {hasAvgSurvival && <th className="p-2 text-right font-medium">Avg Survival (s)</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {rawMatchData.map((entry, idx) => {
                              const players = ((entry.team as { players?: Array<{ discordId?: string; epicName?: string }> })?.players || [])
                                .map(p => p.epicName || p.discordId || "?")
                                .join(", ");
                              
                              return (
                                <tr key={idx} className="border-b">
                                  <td className="p-2 text-xs">{players || "Unknown"}</td>
                                  <td className="p-2 text-right">#{entry.placement as number}</td>
                                  {hasSumSurvival && (
                                    <td className="p-2 text-right">
                                      {entry.sumSecondsSurvived !== undefined 
                                        ? (entry.sumSecondsSurvived as number).toFixed(1) 
                                        : "N/A"}
                                    </td>
                                  )}
                                  {hasAvgSurvival && (
                                    <td className="p-2 text-right">
                                      {entry.averageSecondsSurvived !== undefined 
                                        ? (entry.averageSecondsSurvived as number).toFixed(1) 
                                        : "N/A"}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-4 space-y-2">
                      <h3 className="font-semibold text-sm">Analysis</h3>
                      <p className="text-sm text-muted-foreground">
                        {hasSumSurvival
                          ? "✓ Field 'sumSecondsSurvived' is present in match-level data."
                          : hasAvgSurvival
                          ? "✓ Field 'averageSecondsSurvived' is present in match-level data (but not sumSecondsSurvived)."
                          : "✗ No survival time fields found in match-level data. Check the raw data below for any survival-related fields."}
                      </p>
                      {(hasSumSurvival || hasAvgSurvival) && (
                        <p className="text-sm text-muted-foreground mt-2">
                          <strong>Note:</strong> This appears to be team-level data (same for all players on the team). 
                          To confirm if survival time varies per player, check the killFeeds or individual player objects in the raw data.
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Match Teams & Placements</CardTitle>
              <CardDescription>
                Team placements and kill totals from this match
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium">Placement</th>
                      <th className="p-2 text-left font-medium">Players</th>
                      <th className="p-2 text-right font-medium">Team Kills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((matchData as { matchData: Array<{
                      placement: number;
                      kills: number;
                      team?: { players: Array<{ discordId: string }> };
                    }> }).matchData || []).map((entry, idx) => {
                      const players = entry.team?.players.map(p => p.discordId).join(", ") || "Unknown";
                      
                      return (
                        <tr key={idx} className="border-b">
                          <td className="p-2">#{entry.placement}</td>
                          <td className="p-2 font-mono text-xs">{players}</td>
                          <td className="p-2 text-right">{entry.kills}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Raw Match Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Player Stats Summary</h3>
                <pre className="overflow-auto rounded bg-muted p-4 text-xs">
                  <code>{JSON.stringify((matchData as { playerStats: unknown }).playerStats, null, 2)}</code>
                </pre>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Full Match Data</h3>
                <pre className="overflow-auto rounded bg-muted p-4 text-xs">
                  <code>{JSON.stringify(matchData, null, 2)}</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Probe Yunite API Endpoints for Platform Data */}
      <Card>
        <CardHeader>
          <CardTitle>Probe Yunite User/Member Endpoints</CardTitle>
          <CardDescription>Test Yunite API endpoints to see if platform data is available</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="probeDiscordId">Discord ID</Label>
              <Input
                id="probeDiscordId"
                value={probeDiscordId}
                onChange={(e) => setProbeDiscordId(e.target.value)}
                placeholder="e.g. 709170834735890488"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={async () => {
                  if (!probeDiscordId.trim()) {
                    toast.error("Enter a Discord ID");
                    return;
                  }
                  setLoadingProbe(true);
                  try {
                    const data = await probeEndpoints({ discordId: probeDiscordId.trim() });
                    setProbeResults(data);
                    toast.success("Probe complete - check results below");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Probe failed");
                  } finally {
                    setLoadingProbe(false);
                  }
                }}
                disabled={loadingProbe}
              >
                {loadingProbe ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : <SearchIcon className="mr-2 h-4 w-4" />}
                Probe Endpoints
              </Button>
            </div>
          </div>
          {probeResults && (
            <pre className="overflow-auto rounded bg-muted p-4 text-xs max-h-96">
              <code>{JSON.stringify(probeResults, null, 2)}</code>
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
