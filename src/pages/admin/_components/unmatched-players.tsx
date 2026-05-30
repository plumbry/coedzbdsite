import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { ArrowLeft, Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import SiteHeader from "@/components/site-header.tsx";

export default function UnmatchedPlayers() {
  const params = useParams();
  const navigate = useNavigate();
  const importId = params.importId as Id<"thirdPartyImports">;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [linkingResultId, setLinkingResultId] = useState<Id<"thirdPartyResults"> | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  
  const importDetails = useQuery(api.thirdPartyQueries.getImportDetails, { importId });
  const unmatchedPlayers = useQuery(api.thirdPartyQueries.getUnmatchedPlayers, { importId });
  const allPlayers = useQuery(api.players.getAllPlayersAdmin);
  const manuallyLinkPlayer = useMutation(api.thirdPartyMutations.manuallyLinkPlayer);
  
  const openLinkDialog = (resultId: Id<"thirdPartyResults">) => {
    setLinkingResultId(resultId);
    setSelectedPlayerId(null);
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
  
  if (!importDetails || !unmatchedPlayers || !allPlayers) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Skeleton className="h-12 w-64 mb-6" />
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const filteredUnmatched = unmatchedPlayers.filter((result) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      result.epicUsername.toLowerCase().includes(query) ||
      result.epicId?.toLowerCase().includes(query) ||
      result.discordUsername?.toLowerCase().includes(query) ||
      result.discordId?.includes(query) ||
      result.teamName?.toLowerCase().includes(query)
    );
  });
  
  const currentResult = linkingResultId 
    ? unmatchedPlayers.find((r) => r._id === linkingResultId)
    : null;
  
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle>Unmatched Players</CardTitle>
          <CardDescription>
            {importDetails.eventName} • {unmatchedPlayers.length} unmatched
            {importDetails.eventDate && ` • ${importDetails.eventDate}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Epic username, Discord ID, team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          
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
                  {filteredUnmatched.map((result) => (
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
        </CardContent>
      </Card>
      
      {/* Link Player Dialog */}
      <Dialog open={!!linkingResultId} onOpenChange={(open) => !open && setLinkingResultId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Player</DialogTitle>
            <DialogDescription>
              Manually link this leaderboard entry to an existing player in your database
            </DialogDescription>
          </DialogHeader>
          
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
                <Label htmlFor="player-select">Select Player from Database</Label>
                <Select
                  value={selectedPlayerId || ""}
                  onValueChange={(value) => setSelectedPlayerId(value as Id<"players">)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a player..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {allPlayers.map((player) => (
                      <SelectItem key={player._id} value={player._id}>
                        {player.epicUsername} ({player.discordUsername})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
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
    </div>
  );
}
