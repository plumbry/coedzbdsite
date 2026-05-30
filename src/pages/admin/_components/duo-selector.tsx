import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { Loader2, Trash2, Sparkles, Save, X } from "lucide-react";

export default function DuoSelector({ eventId }: { eventId: Id<"events"> }) {
  const games = useQuery(api.events.duoSelection.getEventGamesForDuoSelection, { eventId });
  const setDuoAssignment = useMutation(api.events.duoSelection.setDuoAssignment);
  const clearSelections = useMutation(api.events.duoSelection.clearEventDuoSelections);
  const autoDetect = useMutation(api.events.duoSelection.autoDetectDuos);
  
  const [isClearing, setIsClearing] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Track local changes
  const [localChanges, setLocalChanges] = useState<Map<string, "duo1" | "duo2" | null>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Reset local changes when games data changes (after auto-detect or clear)
  useEffect(() => {
    setLocalChanges(new Map());
    setHasUnsavedChanges(false);
  }, [games]);
  
  const handleSetAssignment = (resultId: string, assignment: "duo1" | "duo2" | null) => {
    setLocalChanges(prev => {
      const updated = new Map(prev);
      updated.set(resultId, assignment);
      return updated;
    });
    setHasUnsavedChanges(true);
  };
  
  const handleSubmit = async () => {
    if (localChanges.size === 0) {
      toast.info("No changes to save");
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Group changes by assignment value
      const updates: Array<{ resultIds: Id<"thirdPartyResults">[]; assignment: "duo1" | "duo2" | null }> = [];
      
      const duo1Ids: Id<"thirdPartyResults">[] = [];
      const duo2Ids: Id<"thirdPartyResults">[] = [];
      const nullIds: Id<"thirdPartyResults">[] = [];
      
      for (const [resultId, assignment] of localChanges.entries()) {
        if (assignment === "duo1") {
          duo1Ids.push(resultId as Id<"thirdPartyResults">);
        } else if (assignment === "duo2") {
          duo2Ids.push(resultId as Id<"thirdPartyResults">);
        } else {
          nullIds.push(resultId as Id<"thirdPartyResults">);
        }
      }
      
      // Submit batched updates
      if (duo1Ids.length > 0) {
        await setDuoAssignment({ resultIds: duo1Ids, assignment: "duo1" });
      }
      if (duo2Ids.length > 0) {
        await setDuoAssignment({ resultIds: duo2Ids, assignment: "duo2" });
      }
      if (nullIds.length > 0) {
        await setDuoAssignment({ resultIds: nullIds, assignment: null });
      }
      
      toast.success(`Saved ${localChanges.size} changes`);
      setLocalChanges(new Map());
      setHasUnsavedChanges(false);
    } catch (error) {
      toast.error("Failed to save changes");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleCancel = () => {
    setLocalChanges(new Map());
    setHasUnsavedChanges(false);
    toast.info("Cancelled unsaved changes");
  };
  
  const handleClearAll = async () => {
    if (!confirm("Clear all duo selections for this event?")) return;
    
    setIsClearing(true);
    try {
      await clearSelections({ eventId });
      toast.success("Cleared all duo selections");
    } catch (error) {
      toast.error("Failed to clear selections");
    } finally {
      setIsClearing(false);
    }
  };
  
  const handleAutoDetect = async () => {
    setIsAutoDetecting(true);
    try {
      const result = await autoDetect({ eventId });
      if (result.success) {
        toast.success(`Auto-detected duos for ${result.gamesProcessed} games`);
      } else {
        toast.error(result.message || "Failed to auto-detect");
      }
    } catch (error) {
      toast.error("Failed to auto-detect duos");
    } finally {
      setIsAutoDetecting(false);
    }
  };
  
  if (games === undefined) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  
  if (games.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">No games uploaded for this event yet</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Duo Assignment</h3>
          <p className="text-sm text-muted-foreground">
            Squads: Mark Duo #1 and Duo #2 (4 players total) • Trios: Mark Duo #1 only (2 players)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoDetect}
            disabled={isAutoDetecting || hasUnsavedChanges}
          >
            {isAutoDetecting ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Detecting...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Auto-Detect
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearAll}
            disabled={isClearing || hasUnsavedChanges}
          >
            {isClearing ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Clear All
              </>
            )}
          </Button>
        </div>
      </div>
      
      <Card className={hasUnsavedChanges ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : ""}>
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            {hasUnsavedChanges ? (
              <>
                <Badge variant="outline" className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                  {localChanges.size} unsaved {localChanges.size === 1 ? 'change' : 'changes'}
                </Badge>
                <span className="text-sm text-muted-foreground">Review your selections below</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Make your duo selections below, then click Submit</span>
            )}
          </div>
          <div className="flex gap-2">
            {hasUnsavedChanges && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                <X className="mr-2 h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || !hasUnsavedChanges}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  Submit {hasUnsavedChanges && `(${localChanges.size})`}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <div className="space-y-3">
        {games.map((game, index) => {
          // Get current assignments (local changes override server state)
          const getCurrentAssignment = (resultId: string, serverAssignment: "duo1" | "duo2" | null) => {
            return localChanges.has(resultId) ? localChanges.get(resultId)! : serverAssignment;
          };
          
          const duo1Count = game.players.filter(p => getCurrentAssignment(p.resultId, p.duoAssignment) === "duo1").length;
          const duo2Count = game.players.filter(p => getCurrentAssignment(p.resultId, p.duoAssignment) === "duo2").length;
          const totalAssigned = duo1Count + duo2Count;
          
          const isSquad = game.teamSize === 4;
          const isTrio = game.teamSize === 3;
          const isDuo = game.teamSize === 2;
          
          let statusBadge;
          if (isSquad) {
            if (duo1Count === 2 && duo2Count === 2) {
              statusBadge = <Badge className="bg-green-600">Complete ✓</Badge>;
            } else if (totalAssigned === 0) {
              statusBadge = <Badge variant="outline">Not assigned</Badge>;
            } else {
              statusBadge = <Badge variant="secondary">Duo #1: {duo1Count}/2 • Duo #2: {duo2Count}/2</Badge>;
            }
          } else if (isTrio) {
            if (duo1Count === 2) {
              statusBadge = <Badge className="bg-green-600">Complete ✓</Badge>;
            } else if (duo1Count === 0) {
              statusBadge = <Badge variant="outline">Not assigned</Badge>;
            } else {
              statusBadge = <Badge variant="secondary">Duo: {duo1Count}/2</Badge>;
            }
          } else if (isDuo) {
            statusBadge = <Badge variant="outline">Duo (auto)</Badge>;
          } else {
            statusBadge = <Badge variant="outline">Solo</Badge>;
          }
          
          return (
            <Card key={game.gameKey}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-sm font-medium">
                      Game {index + 1}
                    </CardTitle>
                    <Badge variant="outline">{game.teamSize} players</Badge>
                    <Badge variant="outline">#{game.placement}</Badge>
                    <Badge variant="secondary">{game.points} pts</Badge>
                  </div>
                  {statusBadge}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {game.players.map((player) => {
                    const currentAssignment = getCurrentAssignment(player.resultId, player.duoAssignment);
                    const hasLocalChange = localChanges.has(player.resultId);
                    
                    return (
                      <div
                        key={player.resultId}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{player.playerName}</p>
                            {hasLocalChange && (
                              <Badge variant="secondary" className="text-xs">Modified</Badge>
                            )}
                          </div>
                          {player.discordUsername && player.discordUsername !== player.playerName && (
                            <p className="text-xs text-muted-foreground">
                              Epic: {player.epicUsername}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={currentAssignment === "duo1" ? "default" : "outline"}
                            onClick={() => handleSetAssignment(
                              player.resultId,
                              currentAssignment === "duo1" ? null : "duo1"
                            )}
                          >
                            Duo #1
                          </Button>
                          {isSquad && (
                            <Button
                              size="sm"
                              variant={currentAssignment === "duo2" ? "default" : "outline"}
                              onClick={() => handleSetAssignment(
                                player.resultId,
                                currentAssignment === "duo2" ? null : "duo2"
                              )}
                            >
                              Duo #2
                            </Button>
                          )}
                          {currentAssignment && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSetAssignment(player.resultId, null)}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
