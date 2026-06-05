import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
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
import { GitCompare, X } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import RoleGate from "@/components/role-gate.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Label } from "@/components/ui/label.tsx";
import { sortByTier } from "@/lib/tier-sort.ts";

function PlayerComparisonContent() {
  const { isModeratorOrAdmin } = useUserRole();
  const canView = isModeratorOrAdmin;
  
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Id<"players">[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [applyTcdcToHolistic, setApplyTcdcToHolistic] = useState(true);
  const [baselinePlayerIndex, setBaselinePlayerIndex] = useState(0);
  
  const allPlayers = useQuery(
    api.playerComparison.getAllPlayersForComparison,
    canView ? {} : "skip"
  );
  
  const comparisonData = useQuery(
    api.playerComparison.getPlayerComparisonData,
    canView && selectedPlayerIds.length > 0
      ? {
          playerIds: selectedPlayerIds,
          applyTcdcToHolistic,
        }
      : "skip"
  );

  // Show loading while checking permissions
  if (isModeratorOrAdmin === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!canView) {
    return <RoleGate allowed={false} />;
  }

  const handleAddPlayer = (playerId: Id<"players">) => {
    if (selectedPlayerIds.includes(playerId)) {
      toast.info("Player already selected");
      return;
    }
    
    if (selectedPlayerIds.length >= 4) {
      toast.error("Maximum 4 players can be compared at once");
      return;
    }
    
    setSelectedPlayerIds([...selectedPlayerIds, playerId]);
    setSearchQuery("");
  };

  const handleRemovePlayer = (playerId: Id<"players">) => {
    const newPlayerIds = selectedPlayerIds.filter((id) => id !== playerId);
    setSelectedPlayerIds(newPlayerIds);
    
    // Reset baseline if the removed player was the baseline
    if (comparisonData && baselinePlayerIndex >= newPlayerIds.length) {
      setBaselinePlayerIndex(0);
    }
  };

  const calculatePercentageDiff = (value1: number, value2: number): string => {
    if (value2 === 0) return "N/A";
    const diff = ((value1 - value2) / value2) * 100;
    return diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
  };

  const getColorClass = (diff: string): string => {
    if (diff === "N/A") return "";
    const numericDiff = parseFloat(diff);
    if (numericDiff >= 15) return "text-green-600 font-bold";
    if (numericDiff >= 5) return "text-green-600 font-semibold";
    if (numericDiff <= -15) return "text-destructive font-bold";
    if (numericDiff <= -5) return "text-orange-600 font-semibold";
    return "";
  };

  // Filter players based on search
  const filteredPlayers = sortByTier(
    allPlayers?.filter((player) =>
      player.playerName.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [],
    (player) => (player.tier === "Unranked" ? undefined : player.tier),
    (a, b) => a.playerName.localeCompare(b.playerName),
  );

  return (
    <div className="space-y-4">

      <Card>
        <CardHeader>
          <CardTitle>Holistic Score View</CardTitle>
          <CardDescription>
            Compare raw holistic (no TC/DCA) vs adjusted holistic from tier-eval cache
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="tcdc-holistic-toggle"
              checked={applyTcdcToHolistic}
              onCheckedChange={(checked) => setApplyTcdcToHolistic(checked === true)}
            />
            <Label htmlFor="tcdc-holistic-toggle" className="cursor-pointer">
              Apply TC/DCA to holistic
              <span className="text-sm text-muted-foreground block">
                Off shows raw composite; on uses cached DCA × CPM adjusted holistic
              </span>
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Player Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Players to Compare</CardTitle>
          <CardDescription>
            Choose up to 4 players to compare their stats
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selected Players */}
          {selectedPlayerIds.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-4 border-b">
              {selectedPlayerIds.map((playerId) => {
                const player = allPlayers?.find((p) => p._id === playerId);
                if (!player) return null;
                return (
                  <Badge
                    key={playerId}
                    variant="secondary"
                    className="text-sm px-3 py-1.5 flex items-center gap-2"
                  >
                    {player.playerName}
                    <Badge variant="outline" className="text-xs">
                      {player.tier}
                    </Badge>
                    <button
                      onClick={() => handleRemovePlayer(playerId)}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Search */}
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Search players by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={selectedPlayerIds.length >= 4}
            />
            
            {/* Player List */}
            {searchQuery && (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {filteredPlayers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No players found
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredPlayers.slice(0, 20).map((player) => (
                      <button
                        key={player._id}
                        onClick={() => handleAddPlayer(player._id)}
                        disabled={selectedPlayerIds.includes(player._id)}
                        className="w-full p-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">{player.playerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {player.tier} • {player.status}
                          </div>
                        </div>
                        {selectedPlayerIds.includes(player._id) && (
                          <Badge variant="secondary" className="text-xs">
                            Selected
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Table */}
      {comparisonData && comparisonData.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Stats Comparison
            </CardTitle>
            <CardDescription>
              Side-by-side ZBD performance comparison with percentage differences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Baseline Player Selector */}
            <div className="flex items-center gap-3 pb-4 border-b">
              <Label className="text-sm font-medium">Compare all players to:</Label>
              <div className="flex gap-2">
                {comparisonData.map((player, idx) => (
                  <Button
                    key={player.playerId}
                    variant={baselinePlayerIndex === idx ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBaselinePlayerIndex(idx)}
                  >
                    {player.playerName}
                  </Button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px] sticky left-0 bg-background z-10">
                      Metric
                    </TableHead>
                    {comparisonData.map((player, idx) => (
                      <TableHead key={player.playerId} className="text-center min-w-[150px]">
                        <div className="space-y-1">
                          <Link
                            to={`/player/${player.playerName}`}
                            className="font-semibold hover:underline block"
                          >
                            {player.playerName}
                          </Link>
                          <Badge variant="outline" className="text-xs">
                            {player.tier}
                          </Badge>
                          {idx !== baselinePlayerIndex && (
                            <div className="text-xs text-muted-foreground">
                              vs {comparisonData[baselinePlayerIndex].playerName}
                            </div>
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Basic Info */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-bold sticky left-0 bg-muted/30 z-10" colSpan={comparisonData.length + 1}>
                      Basic Info
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Status</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center">
                        <Badge variant={player.status === "active" ? "default" : "secondary"}>
                          {player.status}
                        </Badge>
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Discord Username</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center text-sm">
                        {player.discordUsername}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Epic Username</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center text-sm">
                        {player.epicUsername}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Discord Tier Roles</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center">
                        {player.discordTierRoles.length > 0 ? (
                          <Badge variant="outline">{player.discordTierRoles.join(", ")}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* ZBD Performance Stats */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-bold sticky left-0 bg-muted/30 z-10" colSpan={comparisonData.length + 1}>
                      ZBD Performance Stats
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Total Events</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div className="font-mono">{player.totalEvents}</div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.totalEvents, comparisonData[baselinePlayerIndex].totalEvents))}`}>
                            {calculatePercentageDiff(player.totalEvents, comparisonData[baselinePlayerIndex].totalEvents)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Win Rate</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div className="font-mono">{player.winRate.toFixed(1)}%</div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.winRate, comparisonData[baselinePlayerIndex].winRate))}`}>
                            {calculatePercentageDiff(player.winRate, comparisonData[baselinePlayerIndex].winRate)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Avg Place</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div className="font-mono">{player.avgPlacement.toFixed(1)}</div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs ${getColorClass(calculatePercentageDiff(comparisonData[baselinePlayerIndex].avgPlacement, player.avgPlacement))}`}>
                            {calculatePercentageDiff(comparisonData[baselinePlayerIndex].avgPlacement, player.avgPlacement)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Avg Kills per Match</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div className="font-mono">{player.avgTeamEliminations.toFixed(2)}</div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.avgTeamEliminations, comparisonData[baselinePlayerIndex].avgTeamEliminations))}`}>
                            {calculatePercentageDiff(player.avgTeamEliminations, comparisonData[baselinePlayerIndex].avgTeamEliminations)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Total Elims</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div className="font-mono">{player.totalTeamEliminations}</div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.totalTeamEliminations, comparisonData[baselinePlayerIndex].totalTeamEliminations))}`}>
                            {calculatePercentageDiff(player.totalTeamEliminations, comparisonData[baselinePlayerIndex].totalTeamEliminations)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Top 3</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div className="font-mono">{player.topThreeCount}</div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.topThreeCount, comparisonData[baselinePlayerIndex].topThreeCount))}`}>
                            {calculatePercentageDiff(player.topThreeCount, comparisonData[baselinePlayerIndex].topThreeCount)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>

                  <TableRow className="bg-muted/30">
                    <TableCell className="font-bold sticky left-0 bg-muted/30 z-10" colSpan={comparisonData.length + 1}>
                      Holistic Evaluation
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">
                      {applyTcdcToHolistic ? "Holistic (TC/DCA)" : "Holistic (raw)"}
                    </TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        {player.holisticScore !== null ? (
                          <>
                            <div className="font-mono font-semibold">{player.holisticScore.toFixed(1)}</div>
                            {idx !== baselinePlayerIndex && comparisonData[baselinePlayerIndex].holisticScore !== null && (
                              <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.holisticScore, comparisonData[baselinePlayerIndex].holisticScore!))}`}>
                                {calculatePercentageDiff(player.holisticScore, comparisonData[baselinePlayerIndex].holisticScore!)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">
                      {applyTcdcToHolistic ? "Holistic (raw)" : "Holistic (TC/DCA)"}
                    </TableCell>
                    {comparisonData.map((player) => {
                      const alternate =
                        applyTcdcToHolistic
                          ? player.rawHolisticScore
                          : player.adjustedHolisticScore;
                      return (
                        <TableCell key={player.playerId} className="text-center">
                          {alternate !== null ? (
                            <div className="font-mono text-sm text-muted-foreground">{alternate.toFixed(1)}</div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">vs Same Tier</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center">
                        {player.holisticVsSameTier !== null ? (
                          <div className="font-mono">{player.holisticVsSameTier.toFixed(1)}</div>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Adjustments Section */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-bold sticky left-0 bg-muted/30 z-10" colSpan={comparisonData.length + 1}>
                      Adjustments
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">DCA (Duo Carry Adjustment)</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div>
                          <div className={`font-mono ${player.dca < 1 ? 'text-orange-600' : player.dca > 1 ? 'text-green-600' : ''}`}>
                            {player.dca.toFixed(2)}x
                          </div>
                          {player.consistentDuoEpic && (
                            <div className="text-xs text-muted-foreground">
                              Duo: {player.consistentDuoEpic}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">CS (Contribution Score)</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        {player.cs !== null ? (
                          <div>
                            <div className="font-mono">{player.cs.toFixed(2)}</div>
                            {idx !== baselinePlayerIndex && comparisonData[baselinePlayerIndex].cs !== null && (
                              <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.cs, comparisonData[baselinePlayerIndex].cs))}`}>
                                {calculatePercentageDiff(player.cs, comparisonData[baselinePlayerIndex].cs)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">CPM (Carry Penalty Multiplier)</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center">
                        {player.cs !== null ? (
                          <div className={`font-mono ${player.cpm < 0.95 ? 'text-orange-600' : ''}`}>
                            {player.cpm.toFixed(2)}x
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Partnership */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-bold sticky left-0 bg-muted/30 z-10" colSpan={comparisonData.length + 1}>
                      Partnership
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Duo Partner</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center text-sm">
                        {player.duoPartner || <span className="text-muted-foreground">None</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Avg Teammate Tier</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div>
                          <Badge variant="outline" className="font-semibold">
                            {player.avgTeammateTier}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {player.avgTeammateTierNumeric.toFixed(2)}
                          </div>
                        </div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs mt-1 ${getColorClass(calculatePercentageDiff(player.avgTeammateTierNumeric, comparisonData[baselinePlayerIndex].avgTeammateTierNumeric))}`}>
                            {calculatePercentageDiff(player.avgTeammateTierNumeric, comparisonData[baselinePlayerIndex].avgTeammateTierNumeric)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Recent Performance */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-bold sticky left-0 bg-muted/30 z-10" colSpan={comparisonData.length + 1}>
                      Recent Performance (Last 4 Weeks)
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Recent Top 5 Finishes</TableCell>
                    {comparisonData.map((player, idx) => (
                      <TableCell key={player.playerId} className="text-center">
                        <div className="font-mono">{player.recentTop5Count}</div>
                        {idx !== baselinePlayerIndex && (
                          <div className={`text-xs ${getColorClass(calculatePercentageDiff(player.recentTop5Count, comparisonData[baselinePlayerIndex].recentTop5Count))}`}>
                            {calculatePercentageDiff(player.recentTop5Count, comparisonData[baselinePlayerIndex].recentTop5Count)}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">Last Event Played</TableCell>
                    {comparisonData.map((player) => (
                      <TableCell key={player.playerId} className="text-center">
                        {player.lastEventDate ? (
                          <span className="text-sm font-mono">{player.lastEventDate}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Player vs Player Comparisons */}
      {comparisonData && comparisonData.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Player vs Player Matrix</CardTitle>
            <CardDescription>
              Head-to-head holistic comparison (uses TC/DCA toggle above)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px] font-bold">Player</TableHead>
                    {comparisonData.map((player) => (
                      <TableHead key={player.playerId} className="text-center min-w-[140px]">
                        <div className="space-y-1">
                          <div className="font-semibold text-xs">{player.playerName}</div>
                          <div className="text-xs text-muted-foreground">
                            Tier {player.tier}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {player.holisticScore !== null ? player.holisticScore.toFixed(1) : "N/A"}
                          </div>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.map((rowPlayer, rowIdx) => (
                    <TableRow key={rowPlayer.playerId}>
                      <TableCell className="font-semibold">
                        <div className="space-y-0.5">
                          <div>{rowPlayer.playerName}</div>
                          <div className="text-xs text-muted-foreground">
                            Tier {rowPlayer.tier}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {rowPlayer.holisticScore !== null ? rowPlayer.holisticScore.toFixed(1) : "N/A"}
                          </div>
                        </div>
                      </TableCell>
                      {comparisonData.map((colPlayer, colIdx) => {
                        if (rowIdx === colIdx) {
                          return (
                            <TableCell key={colPlayer.playerId} className="text-center bg-muted/50">
                              <span className="text-xs text-muted-foreground">—</span>
                            </TableCell>
                          );
                        }
                        
                        const rowHolistic = rowPlayer.holisticScore;
                        const colHolistic = colPlayer.holisticScore;
                        const diff =
                          rowHolistic !== null && colHolistic !== null && colHolistic > 0
                            ? ((rowHolistic - colHolistic) / colHolistic) * 100
                            : 0;
                        
                        return (
                          <TableCell key={colPlayer.playerId} className="text-center">
                            <div
                              className={
                                diff >= 15
                                  ? "font-bold text-green-600"
                                  : diff >= 5
                                    ? "font-semibold text-green-600"
                                    : diff <= -15
                                      ? "font-bold text-destructive"
                                      : diff <= -5
                                        ? "font-semibold text-orange-600"
                                        : "text-muted-foreground"
                              }
                            >
                              {diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              <p className="font-semibold mb-1">How to read:</p>
              <p>Each cell shows how the row player performs compared to the column player.</p>
              <p className="mt-1">
                <span className="text-green-600 font-semibold">Green (+%)</span> = row player is stronger • 
                <span className="text-destructive font-semibold ml-1">Red (-%) </span> = row player is weaker
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {(!comparisonData || comparisonData.length < 2) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GitCompare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No Comparison Yet</p>
            <p className="text-sm">
              Select at least 2 players above to start comparing their stats
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PlayerComparison() {
  return (
    <AdminPageLayout requireAdmin
      title="Player Comparison"
      description="Compare up to 4 players side-by-side with ZBD performance stats and percentage differences"
      authTitle="Sign in to access player comparison"
    >
      <PlayerComparisonContent />
    </AdminPageLayout>
  );
}
