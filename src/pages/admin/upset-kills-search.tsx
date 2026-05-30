import { useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ArrowLeftIcon, SearchIcon, XIcon, CrosshairIcon, SkullIcon, TargetIcon } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce.ts";
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

export default function UpsetKillsSearchPage() {
  const [killerTierFilter, setKillerTierFilter] = useState<string>("all");
  const [victimTierFilter, setVictimTierFilter] = useState<string>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [debouncedSearch] = useDebounce(playerSearch, 300);
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [playerDialogOpen, setPlayerDialogOpen] = useState(false);
  
  // Use dedicated search query that searches across all upset kills
  const searchResults = useQuery(
    api.upsetKills.searchUpsetKillsByPlayer,
    debouncedSearch.length >= 2 
      ? {
          playerSearch: debouncedSearch,
          killerTier: killerTierFilter === "all" ? undefined : killerTierFilter,
          victimTier: victimTierFilter === "all" ? undefined : victimTierFilter,
          limit: 100,
        }
      : "skip"
  );
  
  const isLoading = debouncedSearch.length >= 2 && searchResults === undefined;
  const upsetKills = searchResults || [];
  
  // Helper to open player kills dialog
  const openPlayerKills = (playerId: Id<"players"> | undefined) => {
    if (playerId) {
      setSelectedPlayerId(playerId);
      setPlayerDialogOpen(true);
    }
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/upset-kills">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SearchIcon className="h-8 w-8 text-amber-500" />
            Search Upset Kills
          </h1>
          <p className="text-muted-foreground mt-1">
            Find upset kills by player name
          </p>
        </div>
      </div>
      
      {/* Search & Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>Search for upset kills by player name</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="relative flex-1 min-w-[250px] max-w-[400px]">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search player name..."
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                className="pl-9 pr-9"
                autoFocus
              />
              {playerSearch && (
                <button
                  onClick={() => setPlayerSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>
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
          
          {/* Results Table */}
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
              {isLoading ? (
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
                    {debouncedSearch.length >= 2
                      ? `No upset kills found for "${debouncedSearch}"`
                      : "Enter at least 2 characters to search"}
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
          
          {/* Results count */}
          {upsetKills.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground text-center">
              Showing {upsetKills.length} result{upsetKills.length !== 1 ? "s" : ""}
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
