import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import {
  ArrowLeftIcon,
  CrosshairIcon,
  Loader2Icon,
  SkullIcon,
  SwordsIcon,
  TargetIcon,
} from "lucide-react";
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

// Kill state badge matching Fortnite killfeed colors
function KillStateBadge({ state }: { state: "knocked" | "finished" | "eliminated" }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    knocked: {
      bg: "bg-amber-600/30",
      text: "text-amber-400",
      label: "knocked",
    },
    finished: {
      bg: "bg-sky-600/30",
      text: "text-sky-400",
      label: "finished",
    },
    eliminated: {
      bg: "bg-red-600/30",
      text: "text-red-400",
      label: "eliminated",
    },
  };

  const style = styles[state];

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide",
        style.bg,
        style.text,
      )}
    >
      {style.label}
    </span>
  );
}

// Player kills dialog
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {playerKills.kills.map((kill) => (
                        <TableRow key={kill._id}>
                          <TableCell>
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
                          </TableCell>
                          <TableCell><TierBadge tier={kill.opponentTier} /></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{kill.weapon || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                            {kill.eventName}
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {playerKills.deaths.map((death) => (
                        <TableRow key={death._id}>
                          <TableCell>
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
                          </TableCell>
                          <TableCell><TierBadge tier={death.opponentTier} /></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{death.weapon || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                            {death.eventName}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>

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

type KillStateFilter = "all" | "knocked" | "finished" | "eliminated";

export default function EliminationsPage() {
  const [killerTierFilter, setKillerTierFilter] = useState<string>("all");
  const [victimTierFilter, setVictimTierFilter] = useState<string>("all");
  const [killStateFilter, setKillStateFilter] = useState<KillStateFilter>("all");
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [playerDialogOpen, setPlayerDialogOpen] = useState(false);

  const {
    results: eliminations,
    status: queryStatus,
    loadMore,
  } = usePaginatedQuery(
    api.upsetKills.getAllEliminations,
    {
      killerTier: killerTierFilter === "all" ? undefined : killerTierFilter,
      victimTier: victimTierFilter === "all" ? undefined : victimTierFilter,
      killState: killStateFilter === "all" ? undefined : killStateFilter,
    },
    { initialNumItems: 25 }
  );

  const openPlayerKills = (playerId: Id<"players"> | undefined) => {
    if (playerId) {
      setSelectedPlayerId(playerId);
      setPlayerDialogOpen(true);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 pt-14 lg:pt-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/upset-kills">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SwordsIcon className="h-6 w-6 text-red-500" />
            Killfeed
          </h1>
          <p className="text-sm text-muted-foreground">
            Full killfeed showing who knocked, finished, and eliminated who
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on Yunite match replay data. Knocker always gets credit. Counts may differ from leaderboard totals.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground font-medium">States:</span>
        <div className="flex items-center gap-1.5">
          <KillStateBadge state="knocked" />
          <span className="text-muted-foreground">Downed a player</span>
        </div>
        <div className="flex items-center gap-1.5">
          <KillStateBadge state="finished" />
          <span className="text-muted-foreground">Finished someone else{"'"}s knock</span>
        </div>
        <div className="flex items-center gap-1.5">
          <KillStateBadge state="eliminated" />
          <span className="text-muted-foreground">Full elimination (knocked + finished)</span>
        </div>
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader>
          <CardTitle>Kill Events</CardTitle>
          <CardDescription>
            Browse every recorded kill event between players
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="w-44">
              <Select value={killStateFilter} onValueChange={(v) => setKillStateFilter(v as KillStateFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Kill State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  <SelectItem value="knocked">Knocked</SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                  <SelectItem value="eliminated">Eliminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={killerTierFilter} onValueChange={setKillerTierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Killer Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Killer Tiers</SelectItem>
                  <SelectItem value="S">S Tier</SelectItem>
                  <SelectItem value="A">A Tier</SelectItem>
                  <SelectItem value="B">B Tier</SelectItem>
                  <SelectItem value="C">C Tier</SelectItem>
                  <SelectItem value="D">D Tier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={victimTierFilter} onValueChange={setVictimTierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Victim Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Victim Tiers</SelectItem>
                  <SelectItem value="S">S Tier</SelectItem>
                  <SelectItem value="A">A Tier</SelectItem>
                  <SelectItem value="B">B Tier</SelectItem>
                  <SelectItem value="C">C Tier</SelectItem>
                  <SelectItem value="D">D Tier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results count */}
          {queryStatus !== "LoadingFirstPage" && (
            <p className="text-sm text-muted-foreground mb-4">
              Showing {eliminations.length} events
              {killStateFilter !== "all" || killerTierFilter !== "all" || victimTierFilter !== "all"
                ? " (filtered)"
                : ""}
            </p>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    <span className="flex items-center gap-1.5">
                      <CrosshairIcon className="h-3.5 w-3.5 text-green-500" />
                      Player
                    </span>
                  </TableHead>
                  <TableHead className="w-[120px] text-center">Action</TableHead>
                  <TableHead className="w-[200px]">
                    <span className="flex items-center gap-1.5">
                      <SkullIcon className="h-3.5 w-3.5 text-red-500" />
                      Victim
                    </span>
                  </TableHead>
                  <TableHead>Weapon</TableHead>
                  <TableHead>Event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queryStatus === "LoadingFirstPage" ? (
                  Array.from({ length: 15 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-36" /></TableCell>
                    </TableRow>
                  ))
                ) : eliminations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No kill events found matching filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  eliminations.map((kill) => (
                    <TableRow
                      key={kill._id}
                      className={cn(
                        "hover:bg-muted/50",
                        kill.killState === "eliminated" && "bg-red-500/[0.03]",
                        kill.killState === "finished" && "bg-sky-500/[0.03]",
                        kill.killState === "knocked" && "bg-amber-500/[0.03]",
                      )}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TierBadge tier={kill.killerTier} />
                          {kill.killerPlayerId ? (
                            <button
                              onClick={() => openPlayerKills(kill.killerPlayerId)}
                              className="text-primary hover:underline font-medium text-left cursor-pointer truncate max-w-[130px]"
                            >
                              {kill.killerName}
                            </button>
                          ) : (
                            <span className="text-muted-foreground truncate max-w-[130px]">{kill.killerName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <KillStateBadge state={kill.killState} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TierBadge tier={kill.victimTier} />
                          {kill.victimPlayerId ? (
                            <button
                              onClick={() => openPlayerKills(kill.victimPlayerId)}
                              className="text-primary hover:underline font-medium text-left cursor-pointer truncate max-w-[130px]"
                            >
                              {kill.victimName}
                            </button>
                          ) : (
                            <span className="text-muted-foreground truncate max-w-[130px]">{kill.victimName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {kill.weapon || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground truncate max-w-[180px]">
                            {kill.eventName}
                          </span>
                          {kill.isUpset && (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] shrink-0">
                              UPSET
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Load More */}
          {queryStatus === "CanLoadMore" && (
            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={() => loadMore(50)}>
                Load More
              </Button>
            </div>
          )}
          {queryStatus === "LoadingMore" && (
            <div className="mt-6 text-center">
              <Loader2Icon className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}
          {queryStatus === "Exhausted" && eliminations.length > 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              All {eliminations.length} records loaded
            </p>
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
