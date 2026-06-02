import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useDebounce } from "use-debounce";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Loader2, Search, UserX, Undo2 } from "lucide-react";
import { toast } from "sonner";

export default function AltAccountsTool() {
  const altPlayers = useQuery(api.playerAlts.listAltPlayers, {});
  const setPlayerAltStatus = useMutation(api.playerAlts.setPlayerAltStatus);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const searchResults = useQuery(
    api.playerAlts.searchPlayersForAltMarking,
    debouncedSearch.length >= 2 ? { search: debouncedSearch } : "skip",
  );

  const [busyPlayerId, setBusyPlayerId] = useState<Id<"players"> | null>(null);

  const handleSetAlt = async (playerId: Id<"players">, isAlt: boolean) => {
    setBusyPlayerId(playerId);
    try {
      await setPlayerAltStatus({ playerId, isAlt });
      toast.success(isAlt ? "Marked as alt account" : "Restored to member lists");
      if (isAlt) {
        setSearch("");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update alt status");
    } finally {
      setBusyPlayerId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <UserX className="h-4 w-4" />
          Alt Accounts
        </CardTitle>
        <CardDescription className="text-xs">
          Mark secondary Discord accounts as alts. They are hidden from the member directory, admin
          member lists, and player profiles. Unmark here to restore visibility.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 py-3">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Discord, Epic, or nickname to mark as alt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {debouncedSearch.length >= 2 && searchResults === undefined && (
            <Skeleton className="h-20 w-full" />
          )}
          {searchResults && searchResults.length > 0 && (
            <div className="rounded-md border divide-y">
              {searchResults.map((player) => (
                <div
                  key={player._id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {player.nickname || player.discordUsername}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {player.discordUsername} · {player.epicUsername}
                      {player.tier ? ` · Tier ${player.tier}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0 cursor-pointer"
                    disabled={busyPlayerId === player._id}
                    onClick={() => handleSetAlt(player._id, true)}
                  >
                    {busyPlayerId === player._id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Mark as alt"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {searchResults && debouncedSearch.length >= 2 && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground">No matching players found.</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">Marked alt accounts</h4>
            {altPlayers && (
              <Badge variant="secondary">
                {altPlayers.length} account{altPlayers.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {altPlayers === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : altPlayers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No accounts marked as alts.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Epic</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {altPlayers.map((player) => (
                    <TableRow key={player._id}>
                      <TableCell className="font-medium">
                        {player.nickname || player.discordUsername}
                        {player.nickname && (
                          <span className="block text-xs text-muted-foreground font-normal">
                            {player.discordUsername}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{player.epicUsername}</TableCell>
                      <TableCell>
                        {player.tier ? (
                          <Badge variant="outline">{player.tier}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer"
                          disabled={busyPlayerId === player._id}
                          onClick={() => handleSetAlt(player._id, false)}
                        >
                          {busyPlayerId === player._id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Undo2 className="h-3 w-3 mr-1" />
                              Unmark
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
