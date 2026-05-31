import { useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { SearchIcon, XIcon } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce.ts";
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
import PageHeader from "@/components/page-header.tsx";
import PlayerKillsDialog, { TierBadge, TierDiffBadge } from "./_components/player-kills-dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";

function UpsetKillsSearchContent() {
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
    <div className="space-y-4">
      <PageHeader
        title="Search Upset Kills"
        icon={SearchIcon}
        description="Find upset kills by player name"
        back={{ label: "Upset Kills", href: "/admin/upset-kills" }}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Stats", href: "/admin/stats" },
          { label: "Upset Kills", href: "/admin/upset-kills" },
          { label: "Search" },
        ]}
        variant="compact"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
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

export default function UpsetKillsSearchPage() {
  return (
    <AdminPageLayout
      skipHeader
      authTitle="Sign in to view upset kills"
      header={{ back: { label: "Back to Upset Kills", href: "/admin/upset-kills" } }}
    >
      <UpsetKillsSearchContent />
    </AdminPageLayout>
  );
}
