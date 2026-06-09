import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Loader2, Plus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

export default function DuoPairsManager() {
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  const [player1Search, setPlayer1Search] = useState("");
  const [player2Search, setPlayer2Search] = useState("");
  const [selectedPlayer1, setSelectedPlayer1] = useState<Id<"players"> | null>(null);
  const [selectedPlayer2, setSelectedPlayer2] = useState<Id<"players"> | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removingPairId, setRemovingPairId] = useState<Id<"eventDuoPairs"> | null>(null);

  const allEvents = useQuery(api.events.management.getAllEvents, {
    includeWorkflow: false,
  });
  const players = useQuery(api.players.getPlayers);
  const duoPairs = useQuery(
    api.events.duoPairs.getEventDuoPairs,
    selectedEventId ? { eventId: selectedEventId } : "skip"
  );
  const addDuoPair = useMutation(api.events.duoPairs.addDuoPair);
  const removeDuoPair = useMutation(api.events.duoPairs.removeDuoPair);
  const clearAllPairs = useMutation(api.events.duoPairs.clearEventDuoPairs);

  // Filter only solos-meets-duos events
  const smdEvents = allEvents?.filter(e => e.type === "solos-meets-duos") ?? [];

  // Filter players for search
  const filterPlayers = (search: string, excludeId?: Id<"players"> | null) => {
    if (!players || !search.trim()) return [];
    const term = search.toLowerCase();
    return players
      .filter(p => {
        if (excludeId && p._id === excludeId) return false;
        // Exclude players already in a pair for this event
        if (duoPairs) {
          for (const pair of duoPairs) {
            if (pair.player1Id === p._id || pair.player2Id === p._id) return false;
          }
        }
        return (
          p.discordUsername.toLowerCase().includes(term) ||
          p.epicUsername.toLowerCase().includes(term)
        );
      })
      .slice(0, 8);
  };

  const player1Results = filterPlayers(player1Search, selectedPlayer2);
  const player2Results = filterPlayers(player2Search, selectedPlayer1);

  const handleAddPair = async () => {
    if (!selectedEventId || !selectedPlayer1 || !selectedPlayer2) {
      toast.error("Please select both players");
      return;
    }

    setIsAdding(true);
    try {
      await addDuoPair({
        eventId: selectedEventId,
        player1Id: selectedPlayer1,
        player2Id: selectedPlayer2,
      });
      toast.success("Duo pair added");
      setPlayer1Search("");
      setPlayer2Search("");
      setSelectedPlayer1(null);
      setSelectedPlayer2(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add duo pair";
      toast.error(msg);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemovePair = async (pairId: Id<"eventDuoPairs">) => {
    setRemovingPairId(pairId);
    try {
      await removeDuoPair({ pairId });
      toast.success("Duo pair removed");
    } catch (error) {
      toast.error("Failed to remove duo pair");
    } finally {
      setRemovingPairId(null);
    }
  };

  const handleClearAll = async () => {
    if (!selectedEventId) return;
    if (!confirm("Remove all duo pairs for this event?")) return;

    try {
      const result = await clearAllPairs({ eventId: selectedEventId });
      toast.success(`Removed ${result.deletedCount} duo pairs`);
    } catch (error) {
      toast.error("Failed to clear duo pairs");
    }
  };

  const getPlayerName = (id: Id<"players">) => {
    return players?.find(p => p._id === id)?.discordUsername ?? "Unknown";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Duo Pairs Manager
        </CardTitle>
        <CardDescription>
          Pre-assign duo pairs for Solos Meets Duos events. Each player plays solo but their points are summed as a duo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Event selector */}
        <div className="space-y-2">
          <Label>Select Event</Label>
          {!allEvents ? (
            <Skeleton className="h-10 w-full" />
          ) : smdEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Solos Meets Duos events found. Create one in the Event Manager first.
            </p>
          ) : (
            <Select
              value={selectedEventId ?? "none"}
              onValueChange={(v) => {
                setSelectedEventId(v === "none" ? null : v as Id<"events">);
                setPlayer1Search("");
                setPlayer2Search("");
                setSelectedPlayer1(null);
                setSelectedPlayer2(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an event..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose an event...</SelectItem>
                {smdEvents.map(e => (
                  <SelectItem key={e._id} value={e._id}>
                    {e.name} ({e.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedEventId && (
          <>
            {/* Add pair form */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <Label className="font-medium">Add Duo Pair</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Player 1 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Player 1</Label>
                  {selectedPlayer1 ? (
                    <div className="flex items-center gap-2 p-2 border rounded-md bg-background">
                      <span className="text-sm font-medium flex-1">{getPlayerName(selectedPlayer1)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedPlayer1(null);
                          setPlayer1Search("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Search player..."
                        value={player1Search}
                        onChange={(e) => setPlayer1Search(e.target.value)}
                      />
                      {player1Results.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                          {player1Results.map(p => (
                            <button
                              key={p._id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
                              onClick={() => {
                                setSelectedPlayer1(p._id);
                                setPlayer1Search(p.discordUsername);
                              }}
                            >
                              <span>{p.discordUsername}</span>
                              {p.tier && (
                                <Badge variant="secondary" className="text-xs">{p.tier}</Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Player 2 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Player 2</Label>
                  {selectedPlayer2 ? (
                    <div className="flex items-center gap-2 p-2 border rounded-md bg-background">
                      <span className="text-sm font-medium flex-1">{getPlayerName(selectedPlayer2)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedPlayer2(null);
                          setPlayer2Search("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Search player..."
                        value={player2Search}
                        onChange={(e) => setPlayer2Search(e.target.value)}
                      />
                      {player2Results.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                          {player2Results.map(p => (
                            <button
                              key={p._id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
                              onClick={() => {
                                setSelectedPlayer2(p._id);
                                setPlayer2Search(p.discordUsername);
                              }}
                            >
                              <span>{p.discordUsername}</span>
                              {p.tier && (
                                <Badge variant="secondary" className="text-xs">{p.tier}</Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Button
                size="sm"
                onClick={handleAddPair}
                disabled={!selectedPlayer1 || !selectedPlayer2 || isAdding}
              >
                {isAdding ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-3.5 w-3.5" />
                )}
                Add Pair
              </Button>
            </div>

            {/* Existing pairs */}
            {duoPairs === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : duoPairs.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Users /></EmptyMedia>
                  <EmptyTitle>No duo pairs assigned</EmptyTitle>
                  <EmptyDescription>Add duo pairs above to get started</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {duoPairs.length} duo {duoPairs.length === 1 ? "pair" : "pairs"} assigned
                  </p>
                  <Button size="sm" variant="destructive" onClick={handleClearAll}>
                    Clear All
                  </Button>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player 1</TableHead>
                        <TableHead>Player 2</TableHead>
                        <TableHead>Tiers</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {duoPairs.map(pair => (
                        <TableRow key={pair._id}>
                          <TableCell className="font-medium">{pair.player1Name}</TableCell>
                          <TableCell className="font-medium">{pair.player2Name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs font-mono">
                              {pair.player1Tier ?? "?"}{pair.player2Tier ?? "?"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemovePair(pair._id)}
                              disabled={removingPairId === pair._id}
                            >
                              {removingPairId === pair._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
