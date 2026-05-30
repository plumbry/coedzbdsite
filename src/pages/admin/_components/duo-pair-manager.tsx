import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export default function DuoPairManager({ eventId, isTrio = false }: { eventId: Id<"events">; isTrio?: boolean }) {
  const duoPairs = useQuery(api.events.duoPairs.getEventDuoPairs, { eventId });
  const players = useQuery(api.players.getPlayers, {});
  const addPair = useMutation(api.events.duoPairs.addDuoPair);
  const removePair = useMutation(api.events.duoPairs.removeDuoPair);
  const clearPairs = useMutation(api.events.duoPairs.clearEventDuoPairs);

  const [player1Id, setPlayer1Id] = useState<Id<"players"> | "">("");
  const [player2Id, setPlayer2Id] = useState<Id<"players"> | "">("");
  const [player3Id, setPlayer3Id] = useState<Id<"players"> | "">("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<Id<"eventDuoPairs"> | null>(null);

  // Get IDs of players already in a group
  const pairedPlayerIds = new Set<string>();
  if (duoPairs) {
    for (const pair of duoPairs) {
      pairedPlayerIds.add(pair.player1Id);
      pairedPlayerIds.add(pair.player2Id);
      if (pair.player3Id) pairedPlayerIds.add(pair.player3Id);
    }
  }

  // Filter to active players not already paired
  const availablePlayers = players
    ?.filter((p) => !pairedPlayerIds.has(p._id))
    .sort((a, b) => a.discordUsername.localeCompare(b.discordUsername)) ?? [];

  const selectedIds = [player1Id, player2Id, player3Id].filter(Boolean);

  const handleAddPair = async () => {
    if (!player1Id || !player2Id) {
      toast.error("Select at least 2 players");
      return;
    }
    if (isTrio && !player3Id) {
      toast.error("Select all 3 players for a trio");
      return;
    }

    setIsAdding(true);
    try {
      await addPair({
        eventId,
        player1Id: player1Id as Id<"players">,
        player2Id: player2Id as Id<"players">,
        player3Id: isTrio && player3Id ? (player3Id as Id<"players">) : undefined,
      });
      toast.success(isTrio ? "Trio group added" : "Duo pair added");
      setPlayer1Id("");
      setPlayer2Id("");
      setPlayer3Id("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add group";
      toast.error(msg);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemovePair = async (pairId: Id<"eventDuoPairs">) => {
    setRemovingId(pairId);
    try {
      await removePair({ pairId });
      toast.success("Group removed");
    } catch {
      toast.error("Failed to remove group");
    } finally {
      setRemovingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm(`Remove all ${isTrio ? "trio groups" : "duo pairs"} for this event?`)) return;
    try {
      const result = await clearPairs({ eventId });
      toast.success(`Removed ${result.deletedCount} groups`);
    } catch {
      toast.error("Failed to clear groups");
    }
  };

  const groupLabel = isTrio ? "Trio Groups" : "Duo Pairs";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-medium">
            {groupLabel} ({duoPairs?.length ?? 0})
          </span>
        </div>
        {duoPairs && duoPairs.length > 0 && (
          <Button size="sm" variant="ghost" onClick={handleClearAll} className="text-xs text-destructive">
            Clear All
          </Button>
        )}
      </div>

      {/* Add group form */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-muted-foreground mb-1 block">Player 1</label>
          <Select value={player1Id || undefined} onValueChange={(v) => setPlayer1Id(v as Id<"players">)}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select player..." />
            </SelectTrigger>
            <SelectContent>
              {availablePlayers
                .filter((p) => !selectedIds.includes(p._id) || p._id === player1Id)
                .map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.discordUsername} {p.tier ? `(${p.tier})` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-xs text-muted-foreground mb-1 block">Player 2</label>
          <Select value={player2Id || undefined} onValueChange={(v) => setPlayer2Id(v as Id<"players">)}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select player..." />
            </SelectTrigger>
            <SelectContent>
              {availablePlayers
                .filter((p) => !selectedIds.includes(p._id) || p._id === player2Id)
                .map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.discordUsername} {p.tier ? `(${p.tier})` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {isTrio && (
          <div className="flex-1 min-w-0">
            <label className="text-xs text-muted-foreground mb-1 block">Player 3</label>
            <Select value={player3Id || undefined} onValueChange={(v) => setPlayer3Id(v as Id<"players">)}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select player..." />
              </SelectTrigger>
              <SelectContent>
                {availablePlayers
                  .filter((p) => !selectedIds.includes(p._id) || p._id === player3Id)
                  .map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.discordUsername} {p.tier ? `(${p.tier})` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          size="sm"
          onClick={handleAddPair}
          disabled={!player1Id || !player2Id || (isTrio && !player3Id) || isAdding}
          className="shrink-0"
        >
          {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add {isTrio ? "Trio" : "Pair"}
        </Button>
      </div>

      {/* Groups list */}
      {duoPairs && duoPairs.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Player 1</TableHead>
                <TableHead>Player 2</TableHead>
                {isTrio && <TableHead>Player 3</TableHead>}
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {duoPairs.map((pair, idx) => (
                <TableRow key={pair._id}>
                  <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{pair.player1Name}</span>
                      {pair.player1Tier && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {pair.player1Tier}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{pair.player2Name}</span>
                      {pair.player2Tier && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {pair.player2Tier}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {isTrio && (
                    <TableCell>
                      {pair.player3Name ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{pair.player3Name}</span>
                          {pair.player3Tier && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              {pair.player3Tier}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemovePair(pair._id)}
                      disabled={removingId === pair._id}
                    >
                      {removingId === pair._id ? (
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
      )}

      {duoPairs && duoPairs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No {isTrio ? "trio groups" : "duo pairs"} assigned yet. Add {isTrio ? "trios" : "pairs"} above to set up the groups for this event.
        </p>
      )}
    </div>
  );
}
