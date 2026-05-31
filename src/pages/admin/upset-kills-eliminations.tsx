import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import {
  CrosshairIcon,
  Loader2Icon,
  SkullIcon,
  SwordsIcon,
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
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";

import UpsetKillsLayout from "./_components/upset-kills-layout.tsx";
import PlayerKillsDialog, { TierBadge, TierDiffBadge } from "./_components/player-kills-dialog.tsx";

type KillStateFilter = "all" | "knocked" | "finished" | "eliminated";

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

function EliminationsContent() {
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
    <UpsetKillsLayout>
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
    </UpsetKillsLayout>
  );
}

export default function EliminationsPage() {
  return (
    <AdminPageLayout skipHeader requireAdmin authTitle="Sign in to view upset kills">
      <EliminationsContent />
    </AdminPageLayout>
  );
}
