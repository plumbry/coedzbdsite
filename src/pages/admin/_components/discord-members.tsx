import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import LegendCard from "@/components/legend-card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Users, Shield, ChevronDown, ChevronUp, ChevronsUpDown, Link, Settings, UserPlus } from "lucide-react";
import MatchToPlayerDialog from "./match-to-player-dialog.tsx";
import ManageDiscordIdsDialog from "./manage-discord-ids-dialog.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";

type SortColumn = "discord" | "discordId" | "epic" | "tier" | "roles";
type SortDirection = "asc" | "desc";
type CategoryFilter = "all" | "active" | "inactive";

export default function DiscordMembers() {
  const players = useQuery(api.players.getDiscordMembersAdmin, {});
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("discord");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [matchingPlayerId, setMatchingPlayerId] = useState<Id<"players"> | null>(null);
  const [managingDiscordIdsPlayerId, setManagingDiscordIdsPlayerId] = useState<Id<"players"> | null>(null);
  const [convertingPlayer, setConvertingPlayer] = useState<{ id: Id<"players">; name: string } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const backfillEpicUsernames = useMutation(api.discord.backfillEpicUsernamesFromDiscord);
  const convertToPlayer = useMutation(api.discord.convertToPlayer);

  // Check if a player has a tier role in Discord
  const hasTierRole = (roles?: Array<{ id: string; name: string }>) => {
    if (!roles) return false;
    return roles.some((role) =>
      role.name.startsWith("Tier ") ||
      role.name === "S" ||
      role.name === "A" ||
      role.name === "B" ||
      role.name === "C" ||
      role.name === "D"
    );
  };

  // Get tier roles for display
  const getTierRoles = (roles?: Array<{ id: string; name: string }>) => {
    if (!roles) return [];
    return roles.filter((role) =>
      role.name.startsWith("Tier ") ||
      role.name === "S" ||
      role.name === "A" ||
      role.name === "B" ||
      role.name === "C" ||
      role.name === "D"
    );
  };

  // Get unique roles across all players for role filter
  const allUniqueRoles = useMemo(() => {
    if (!players) return [];
    const roleSet = new Map<string, string>();
    players.forEach(player => {
      player.discordRoles?.forEach(role => {
        if (!roleSet.has(role.name)) {
          roleSet.set(role.name, role.id);
        }
      });
    });
    return Array.from(roleSet.entries()).map(([name, id]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const filteredPlayers = useMemo(() => {
    if (!players) return [];

    const botSyncedPlayers = players.filter((p) =>
      p.discordRoles && p.discordRoles.length > 0 &&
      p.status !== "archived" && p.status !== "rejected"
    );

    const activePlayers = botSyncedPlayers.filter((p) => hasTierRole(p.discordRoles));
    const inactivePlayers = botSyncedPlayers.filter((p) => !hasTierRole(p.discordRoles));

    let result = botSyncedPlayers;
    if (categoryFilter === "active") {
      result = activePlayers;
    } else if (categoryFilter === "inactive") {
      result = inactivePlayers;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((p) =>
        (p.discordUsername?.toLowerCase().includes(query) || false) ||
        (p.epicUsername?.toLowerCase().includes(query) || false) ||
        (p.discordUserId?.toLowerCase().includes(query) || false)
      );
    }

    if (selectedRoles.size > 0) {
      result = result.filter((p) =>
        p.discordRoles?.some((role) => selectedRoles.has(role.name))
      );
    }

    return [...result].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case "discord":
          comparison = (a.discordUsername || "").localeCompare(b.discordUsername || "");
          break;
        case "discordId":
          comparison = (a.discordUserId || "").localeCompare(b.discordUserId || "");
          break;
        case "epic":
          comparison = (a.epicUsername || "").localeCompare(b.epicUsername || "");
          break;
        case "tier": {
          const tierOrder: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };
          const tierA = a.tier ? (tierOrder[a.tier] || 0) : 0;
          const tierB = b.tier ? (tierOrder[b.tier] || 0) : 0;
          comparison = tierA - tierB;
          break;
        }
        case "roles":
          comparison = (a.discordRoles?.length || 0) - (b.discordRoles?.length || 0);
          break;
        default:
          return 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [players, categoryFilter, searchQuery, selectedRoles, sortColumn, sortDirection]);

  const membersPagination = useClientPagination(filteredPlayers, {
    resetDeps: [searchQuery, categoryFilter, sortColumn, sortDirection, selectedRoles],
  });
  const paginatedPlayers = membersPagination.pageItems ?? [];

  const botSyncedPlayers = players?.filter((p) =>
    p.discordRoles && p.discordRoles.length > 0 &&
    p.status !== "archived" && p.status !== "rejected"
  ) ?? [];
  const activePlayers = botSyncedPlayers.filter((p) => hasTierRole(p.discordRoles));
  const inactivePlayers = botSyncedPlayers.filter((p) => !hasTierRole(p.discordRoles));

  if (players === undefined) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const toggleRoleFilter = (roleName: string) => {
    const newSet = new Set(selectedRoles);
    if (newSet.has(roleName)) {
      newSet.delete(roleName);
    } else {
      newSet.add(roleName);
    }
    setSelectedRoles(newSet);
    membersPagination.resetPage();
  };

  const handleBackfillEpicUsernames = async () => {
    setIsBackfilling(true);
    try {
      const result = await backfillEpicUsernames();
      if (result.success) {
        if (result.updated > 0) {
          toast.success(`Updated ${result.updated} of ${result.total} players`);
        } else {
          toast.success(`All ${result.total} players already up to date`);
        }
      }
    } catch (error) {
      console.error("Error backfilling Epic usernames:", error);
      toast.error("Failed to sync Epic usernames");
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleConvertToPlayer = async () => {
    if (!convertingPlayer) return;
    setIsConverting(true);
    try {
      const result = await convertToPlayer({ playerId: convertingPlayer.id });
      toast.success(`${result.epicUsername} converted to active player`);
      setConvertingPlayer(null);
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to convert player");
      }
      console.error(error);
    } finally {
      setIsConverting(false);
    }
  };

  // Handle column sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
  };

  return (
    <>
      <LegendCard
        title="Discord Member Legend"
        groups={[
          {
            title: "Category:",
            items: [
              {
                label: <Badge className="text-xs bg-green-600 text-white">Active</Badge>,
                description: "Has a Tier role, plays in tournaments",
              },
              {
                label: <Badge variant="secondary" className="text-xs">Inactive</Badge>,
                description: "No Tier role, evaluated but not yet playing",
              },
            ],
          },
          {
            title: "Match:",
            items: [
              {
                label: <Badge variant="secondary" className="text-xs bg-blue-500 text-white">USERNAME</Badge>,
                description: "Username match",
              },
              {
                label: <Badge variant="secondary" className="text-xs bg-orange-500 text-white">FUZZY</Badge>,
                description: "Similar (needs review)",
              },
            ],
          },
        ]}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <CardDescription className="flex flex-wrap items-center gap-2">
              <Users className="h-4 w-4 shrink-0" />
              {activePlayers.length} active (with Tier role), {inactivePlayers.length} inactive (no Tier role)
              <Badge variant="outline" className="text-xs">
                Bot Synced Only
              </Badge>
            </CardDescription>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/admin/fuzzy-matches")}
              >
                <Link className="mr-2 h-4 w-4" />
                View Fuzzy Matches
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBackfillEpicUsernames}
                disabled={isBackfilling}
              >
                {isBackfilling ? "Syncing..." : "Sync Epic Usernames"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {/* Search */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Search by Discord username, Epic username, or Discord ID..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); membersPagination.resetPage(); }}
                className="flex-1"
              />
            </div>

            {/* Category and Role Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Category:</span>
                <Button
                  variant={categoryFilter === "all" ? "default" : "secondary"}
                  size="sm"
                  onClick={() => { setCategoryFilter("all"); membersPagination.resetPage(); }}
                  className="h-8"
                >
                  All ({botSyncedPlayers.length})
                </Button>
                <Button
                  variant={categoryFilter === "active" ? "default" : "secondary"}
                  size="sm"
                  onClick={() => { setCategoryFilter("active"); membersPagination.resetPage(); }}
                  className="h-8"
                >
                  Active ({activePlayers.length})
                </Button>
                <Button
                  variant={categoryFilter === "inactive" ? "default" : "secondary"}
                  size="sm"
                  onClick={() => { setCategoryFilter("inactive"); membersPagination.resetPage(); }}
                  className="h-8"
                >
                  Inactive ({inactivePlayers.length})
                </Button>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-8">
                    <Shield className="mr-2 h-4 w-4" />
                    Filter by Roles
                    {selectedRoles.size > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedRoles.size}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Filter by Discord Roles</h4>
                      {selectedRoles.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRoles(new Set())}
                          className="h-8 text-xs"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                      {allUniqueRoles.length > 0 ? (
                        allUniqueRoles.map((role) => (
                          <div key={role.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`role-${role.id}`}
                              checked={selectedRoles.has(role.name)}
                              onCheckedChange={() => toggleRoleFilter(role.name)}
                            />
                            <label
                              htmlFor={`role-${role.id}`}
                              className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              {role.name}
                            </label>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No roles found</p>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {filteredPlayers.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>No Discord members found</EmptyTitle>
                <EmptyDescription>
                  {searchQuery
                    ? "Try adjusting your search or filter criteria"
                    : "Discord members will appear here after they are synced from Discord"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        onClick={() => handleSort("discord")}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        Discord Username
                        {getSortIcon("discord")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        onClick={() => handleSort("discordId")}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        Discord ID
                        {getSortIcon("discordId")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        onClick={() => handleSort("epic")}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        Epic Username
                        {getSortIcon("epic")}
                      </button>
                    </TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>
                      <button
                        onClick={() => handleSort("tier")}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        Tier
                        {getSortIcon("tier")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        onClick={() => handleSort("roles")}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        Discord Roles
                        {getSortIcon("roles")}
                      </button>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPlayers.map((player) => {
                    const isActive = hasTierRole(player.discordRoles);
                    const tierRoles = getTierRoles(player.discordRoles);

                    return (
                      <TableRow key={player._id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {player.discordUsername || "—"}
                            {player.matchConfidence === "fuzzy" && (
                              <Badge variant="secondary" className="text-xs bg-orange-500 text-white">
                                FUZZY
                              </Badge>
                            )}
                            {player.matchConfidence === "username" && (
                              <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                                USERNAME
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {player.discordUserId || "—"}
                        </TableCell>
                        <TableCell>
                          {player.epicUsername || "—"}
                        </TableCell>
                        <TableCell>
                          {isActive ? (
                            <Badge className="bg-green-600 text-white">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {tierRoles.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {tierRoles.map((role) => (
                                <Badge key={role.id} variant="outline" className="font-semibold text-xs">
                                  {role.name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {player.discordRoles && player.discordRoles.length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-auto py-1 px-2 gap-1">
                                  <span className="text-xs">
                                    {player.discordRoles.length} role{player.discordRoles.length !== 1 ? "s" : ""}
                                  </span>
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80" align="end">
                                <div className="space-y-2">
                                  <h4 className="font-medium text-sm">All Discord Roles</h4>
                                  <div className="flex flex-wrap gap-1 max-h-60 overflow-y-auto">
                                    {player.discordRoles.map((role) => {
                                      const isTierRole = getTierRoles([role]).length > 0;
                                      return (
                                        <Badge
                                          key={role.id}
                                          variant={isTierRole ? "default" : "secondary"}
                                          className="text-xs"
                                        >
                                          {isTierRole && <Shield className="h-3 w-3 mr-1" />}
                                          {role.name}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {!isActive ? (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setMatchingPlayerId(player._id)}
                                >
                                  <Link className="h-4 w-4 mr-2" />
                                  Match
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => setConvertingPlayer({
                                    id: player._id,
                                    name: player.epicUsername || player.discordUsername || "Unknown",
                                  })}
                                >
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  Convert
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setManagingDiscordIdsPlayerId(player._id)}
                              >
                                <Settings className="h-4 w-4 mr-2" />
                                Manage IDs
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <TablePagination
            page={membersPagination.page}
            totalPages={membersPagination.totalPages}
            totalCount={membersPagination.totalCount}
            startIndex={membersPagination.startIndex}
            endIndex={membersPagination.endIndex}
            onPageChange={membersPagination.setPage}
            itemLabel="Discord bot synced members"
          />
        </CardContent>
      </Card>

      {/* Match to Player Dialog */}
      <MatchToPlayerDialog
        open={matchingPlayerId !== null}
        onOpenChange={(open) => !open && setMatchingPlayerId(null)}
        discordMemberId={matchingPlayerId}
      />

      {/* Manage Discord IDs Dialog */}
      {managingDiscordIdsPlayerId && (() => {
        const player = players?.find(p => p._id === managingDiscordIdsPlayerId);
        return player ? (
          <ManageDiscordIdsDialog
            open={true}
            onOpenChange={(open) => !open && setManagingDiscordIdsPlayerId(null)}
            playerId={player._id}
            primaryDiscordId={player.discordUserId}
            alternateDiscordIds={player.alternateDiscordUserIds}
            playerName={player.epicUsername}
          />
        ) : null;
      })()}

      {/* Convert to Player Confirmation Dialog */}
      <Dialog open={convertingPlayer !== null} onOpenChange={(open) => !open && setConvertingPlayer(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Convert to Active Player</DialogTitle>
            <DialogDescription>
              This will promote <span className="font-semibold text-foreground">{convertingPlayer?.name}</span> from 
              a Discord member to an active player in Member Management. They will appear in the Accepted Members list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConvertingPlayer(null)} disabled={isConverting}>
              Cancel
            </Button>
            <Button onClick={handleConvertToPlayer} disabled={isConverting}>
              {isConverting ? "Converting..." : "Convert to Player"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
