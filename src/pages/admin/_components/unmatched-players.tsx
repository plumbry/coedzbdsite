import { useState, useMemo } from "react";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PageHeader from "@/components/page-header.tsx";
import SearchInput from "@/components/search-input.tsx";

function UnmatchedPlayersContent() {
  const params = useParams();
  const importId = params.importId as Id<"thirdPartyImports">;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [linkingResultId, setLinkingResultId] = useState<Id<"thirdPartyResults"> | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const importDetails = useQuery(api.thirdPartyQueries.getImportDetails, { importId });
  const unmatchedPlayers = useQuery(api.thirdPartyQueries.getUnmatchedPlayers, { importId });
  const linkCandidates = useQuery(
    api.players.searchPlayersForLinking,
    linkingResultId && playerSearch.length >= 2 ? { search: playerSearch } : "skip",
  );
  const manuallyLinkPlayer = useMutation(api.thirdPartyMutations.manuallyLinkPlayer);

  const filteredUnmatched = useMemo(() => {
    if (!unmatchedPlayers) return [];
    if (!searchQuery) return unmatchedPlayers;
    const query = searchQuery.toLowerCase();
    return unmatchedPlayers.filter((result) =>
      result.epicUsername.toLowerCase().includes(query) ||
      result.epicId?.toLowerCase().includes(query) ||
      result.discordUsername?.toLowerCase().includes(query) ||
      result.discordId?.includes(query) ||
      result.teamName?.toLowerCase().includes(query)
    );
  }, [unmatchedPlayers, searchQuery]);

  const unmatchedPagination = useClientPagination(filteredUnmatched, {
    resetDeps: [searchQuery],
  });
  
  const openLinkDialog = (resultId: Id<"thirdPartyResults">) => {
    setLinkingResultId(resultId);
    setSelectedPlayerId(null);
    setPlayerSearch("");
  };
  
  const handleLink = async () => {
    if (!linkingResultId || !selectedPlayerId) return;
    
    setIsLinking(true);
    try {
      await manuallyLinkPlayer({
        resultId: linkingResultId,
        playerId: selectedPlayerId,
      });
      toast.success("Player linked successfully");
      setLinkingResultId(null);
      setSelectedPlayerId(null);
    } catch (error) {
      console.error("Link error:", error);
      toast.error("Failed to link player");
    } finally {
      setIsLinking(false);
    }
  };
  
  if (!importDetails || !unmatchedPlayers) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  
  const currentResult = linkingResultId 
    ? unmatchedPlayers.find((r) => r._id === linkingResultId)
    : null;
  
  return (
    <div className="space-y-4">
      <PageHeader
        title="Unmatched Players"
        description={`${importDetails.eventName} · ${unmatchedPlayers.length} unmatched${importDetails.eventDate ? ` · ${importDetails.eventDate}` : ""}`}
        back={{ label: "Back to Uploads", href: "/admin/uploads" }}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Uploads", href: "/admin/uploads" },
          { label: importDetails.eventName },
        ]}
        variant="compact"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Search & Link</CardTitle>
          <CardDescription>
            Manually link leaderboard entries to players in your database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchInput
            containerClassName="w-full sm:w-full"
            placeholder="Search by Epic username, Discord ID, team..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          {filteredUnmatched.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {unmatchedPlayers.length === 0 ? (
                <p>All players have been matched! 🎉</p>
              ) : (
                <p>No players match your search</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Epic Username / ID</TableHead>
                    <TableHead>Discord</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Placement</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(unmatchedPagination.pageItems ?? []).map((result) => (
                    <TableRow key={result._id}>
                      <TableCell className="font-medium">
                        {result.epicUsername}
                        {result.epicId && result.epicId !== result.epicUsername && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {result.epicId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {result.discordUsername && (
                          <div className="text-sm">{result.discordUsername}</div>
                        )}
                        {result.discordId && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {result.discordId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {result.teamName || result.teamId ? (
                          <div className="text-sm">
                            {result.teamName || result.teamId}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">#{result.placement}</Badge>
                      </TableCell>
                      <TableCell>{result.points}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openLinkDialog(result._id)}
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Link to Player
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <TablePagination
            page={unmatchedPagination.page}
            totalPages={unmatchedPagination.totalPages}
            totalCount={unmatchedPagination.totalCount}
            startIndex={unmatchedPagination.startIndex}
            endIndex={unmatchedPagination.endIndex}
            onPageChange={unmatchedPagination.setPage}
            itemLabel="unmatched players"
          />
        </CardContent>
      </Card>
      
      {/* Link Player Dialog */}
      <Dialog open={!!linkingResultId} onOpenChange={(open) => !open && setLinkingResultId(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Link Player</DialogTitle>
            <DialogDescription>
              Manually link this leaderboard entry to an existing player in your database
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
          {currentResult && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/50">
                <h4 className="font-medium mb-2">Leaderboard Entry</h4>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Epic:</span>{" "}
                    <span className="font-mono">{currentResult.epicUsername}</span>
                  </div>
                  {currentResult.epicId && currentResult.epicId !== currentResult.epicUsername && (
                    <div>
                      <span className="text-muted-foreground">Epic ID:</span>{" "}
                      <span className="font-mono text-xs">{currentResult.epicId}</span>
                    </div>
                  )}
                  {currentResult.discordUsername && (
                    <div>
                      <span className="text-muted-foreground">Discord:</span>{" "}
                      {currentResult.discordUsername}
                    </div>
                  )}
                  {currentResult.discordId && (
                    <div>
                      <span className="text-muted-foreground">Discord ID:</span>{" "}
                      <span className="font-mono text-xs">{currentResult.discordId}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Placement:</span> #{currentResult.placement}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Points:</span> {currentResult.points}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="player-search">Search Player</Label>
                <Input
                  id="player-search"
                  placeholder="Type Epic or Discord name (min 2 chars)..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="player-select">Select Player from Database</Label>
                <Select
                  value={selectedPlayerId || ""}
                  onValueChange={(value) => setSelectedPlayerId(value as Id<"players">)}
                  disabled={playerSearch.length < 2}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={playerSearch.length < 2 ? "Search above first..." : "Select a player..."} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {(linkCandidates ?? []).map((player) => (
                      <SelectItem key={player._id} value={player._id}>
                        {player.epicUsername} ({player.discordUsername})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          </DialogBody>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setLinkingResultId(null)} 
              disabled={isLinking}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleLink} 
              disabled={isLinking || !selectedPlayerId}
            >
              {isLinking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking...
                </>
              ) : (
                "Link Player"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UnmatchedPlayers() {
  return (
    <AdminPageLayout skipHeader requireAdmin authTitle="Sign in to manage unmatched players">
      <UnmatchedPlayersContent />
    </AdminPageLayout>
  );
}
