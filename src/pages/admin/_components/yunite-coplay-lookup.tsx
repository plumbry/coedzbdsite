import { useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty.tsx";
import { ChevronRight, ExternalLink, Search, Users, X } from "lucide-react";

type SelectedPlayer = {
  _id: Id<"players">;
  discordUsername: string;
  epicUsername: string;
};

function PlayerSearchField({
  label,
  selectedPlayer,
  onSelect,
  onClear,
  excludePlayerId,
}: {
  label: string;
  selectedPlayer: SelectedPlayer | null;
  onSelect: (player: SelectedPlayer) => void;
  onClear: () => void;
  excludePlayerId?: Id<"players"> | null;
}) {
  const [search, setSearch] = useState("");

  const candidates = useQuery(
    api.players.searchPlayersForLinking,
    !selectedPlayer && search.trim().length >= 2 ? { search: search.trim(), limit: 8 } : "skip",
  );

  const filteredCandidates = (candidates ?? []).filter(
    (player) => !excludePlayerId || player._id !== excludePlayerId,
  );

  if (selectedPlayer) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2 rounded-md border bg-background p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectedPlayer.discordUsername}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedPlayer.epicUsername}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClear} aria-label={`Clear ${label}`}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          placeholder="Search by Discord or Epic name..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {filteredCandidates.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
            {filteredCandidates.map((player) => (
              <button
                key={player._id}
                type="button"
                className="flex w-full items-start justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(player);
                  setSearch("");
                }}
              >
                <span>
                  <span className="block font-medium">{player.discordUsername}</span>
                  <span className="block text-xs text-muted-foreground">{player.epicUsername}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatEventDate(eventDate: string | null) {
  if (!eventDate) return "Unknown date";
  try {
    return format(parseISO(eventDate), "MMM d, yyyy");
  } catch {
    return eventDate;
  }
}

export default function YuniteCoplayLookup() {
  const [player1, setPlayer1] = useState<SelectedPlayer | null>(null);
  const [player2, setPlayer2] = useState<SelectedPlayer | null>(null);
  const [lookupEnabled, setLookupEnabled] = useState(false);

  const lookup = useQuery(
    api.yuniteCoplay.getSharedYuniteResults,
    lookupEnabled && player1 && player2
      ? { player1Id: player1._id, player2Id: player2._id }
      : "skip",
  );

  const canSearch = !!player1 && !!player2 && player1._id !== player2._id;
  const isLoading = lookupEnabled && canSearch && lookup === undefined;

  const handleSearch = () => {
    if (!canSearch) return;
    setLookupEnabled(true);
  };

  const handleClear = () => {
    setPlayer1(null);
    setPlayer2(null);
    setLookupEnabled(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4" />
          Yunite Coplay Lookup
        </CardTitle>
        <CardDescription>
          Find every Yunite leaderboard where two players appeared on the same team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PlayerSearchField
            label="Player 1"
            selectedPlayer={player1}
            onSelect={setPlayer1}
            onClear={() => {
              setPlayer1(null);
              setLookupEnabled(false);
            }}
            excludePlayerId={player2?._id}
          />
          <PlayerSearchField
            label="Player 2"
            selectedPlayer={player2}
            onSelect={setPlayer2}
            onClear={() => {
              setPlayer2(null);
              setLookupEnabled(false);
            }}
            excludePlayerId={player1?._id}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSearch} disabled={!canSearch || isLoading}>
            <Search className="mr-2 h-4 w-4" />
            Find shared teams
          </Button>
          {(player1 || player2 || lookupEnabled) && (
            <Button variant="outline" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>

        {player1 && player2 && player1._id === player2._id && (
          <p className="text-sm text-destructive">Select two different players.</p>
        )}

        {lookupEnabled && canSearch && lookup === undefined && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {lookup?.error && (
          <p className="text-sm text-destructive">{lookup.error}</p>
        )}

        {lookup && lookupEnabled && !lookup.error && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {lookup.totalCount === 0
                ? `No shared Yunite teams found for ${lookup.player1?.discordUsername} and ${lookup.player2?.discordUsername}.`
                : `${lookup.totalCount} shared Yunite team${lookup.totalCount === 1 ? "" : "s"} for ${lookup.player1?.discordUsername} and ${lookup.player2?.discordUsername}.`}
            </p>

            {lookup.sharedResults.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users />
                  </EmptyMedia>
                  <EmptyTitle>No shared teams</EmptyTitle>
                  <EmptyDescription>
                    These players have not appeared together on a Yunite team in imported results.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>P1</TableHead>
                      <TableHead>P2</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lookup.sharedResults.map((result) => (
                      <TableRow key={result.importId}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{result.eventName}</p>
                            {result.seasonalCampaignSlug && (
                              <Badge variant="secondary" className="text-xs">
                                {result.seasonalCampaignSlug}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatEventDate(result.eventDate)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {result.teamName ?? result.teamId ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {result.player1Placement != null ? `#${result.player1Placement}` : "—"}
                          {result.player1Points != null && (
                            <span className="block text-xs text-muted-foreground">
                              {result.player1Points} pts
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {result.player2Placement != null ? `#${result.player2Placement}` : "—"}
                          {result.player2Points != null && (
                            <span className="block text-xs text-muted-foreground">
                              {result.player2Points} pts
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={`/admin/yunite/${result.importId}`}>
                                View
                                <ChevronRight className="ml-1 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            {result.leaderboardUrl && (
                              <Button variant="ghost" size="sm" asChild>
                                <a
                                  href={result.leaderboardUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
