import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.tsx";
import { Loader2, Trash2, AlertCircle, ChevronDown, Edit } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function EventResultsManager() {
  const [deletingResult, setDeletingResult] = useState<Id<"thirdPartyResults"> | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [editEventName, setEditEventName] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);
  
  const allResults = useQuery(api.events.getAllEvents);
  const players = useQuery(api.players.getPlayers);
  const deleteEvent = useMutation(api.events.deleteEvent);
  const deleteAllEventResultsByName = useMutation(api.events.deleteAllEventResultsByName);
  const cleanupDuplicates = useMutation(api.cleanupDuplicates.cleanupAllDuplicates);
  const updateEventResultsByName = useMutation(api.events.updateEventResultsByName);
  
  // Create lookup map for player names
  const playerMap = new Map(
    players?.map(p => [p._id, { name: p.discordUsername, tier: p.tier }]) || []
  );
  
  const handleDelete = async (resultId: Id<"thirdPartyResults">, eventName: string) => {
    if (!confirm(`Are you sure you want to delete this individual result for "${eventName}"?`)) {
      return;
    }
    
    setDeletingResult(resultId);
    try {
      await deleteEvent({ eventId: resultId });
      toast.success("Event result deleted");
    } catch (error) {
      toast.error("Failed to delete event result");
    } finally {
      setDeletingResult(null);
    }
  };

  const handleDeleteAllForEvent = async (eventName: string, resultCount: number) => {
    if (!confirm(`Are you sure you want to delete ALL ${resultCount} results for "${eventName}"? This cannot be undone.`)) {
      return;
    }
    
    setDeletingEvent(eventName);
    try {
      const result = await deleteAllEventResultsByName({ eventName });
      toast.success(`Deleted ${result.deleted} results for "${eventName}"`);
      // Collapse the event after deletion
      setExpandedEvents(prev => {
        const next = new Set(prev);
        next.delete(eventName);
        return next;
      });
    } catch (error) {
      toast.error("Failed to delete event results");
    } finally {
      setDeletingEvent(null);
    }
  };

  const toggleEvent = (eventName: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventName)) {
        next.delete(eventName);
      } else {
        next.add(eventName);
      }
      return next;
    });
  };

  const handleCleanupDuplicates = async () => {
    if (!confirm("This will remove all duplicate event results, keeping only the most recent entry for each player+event. Continue?")) {
      return;
    }
    
    setIsCleaningDuplicates(true);
    try {
      const result = await cleanupDuplicates();
      if (result.deleted > 0) {
        toast.success(`Cleaned up ${result.deleted} duplicate results from ${result.duplicateGroups} events`);
      } else {
        toast.info("No duplicates found");
      }
    } catch (error) {
      toast.error("Failed to cleanup duplicates");
      console.error(error);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const openEditEventDialog = (eventName: string, eventDate?: string) => {
    setEditingEvent(eventName);
    setEditEventName(eventName);
    setEditEventDate(eventDate || "");
  };

  const handleUpdateEvent = async () => {
    if (!editingEvent) return;
    
    if (!editEventName.trim()) {
      toast.error("Event name cannot be empty");
      return;
    }
    
    setIsUpdatingEvent(true);
    try {
      const result = await updateEventResultsByName({
        oldEventName: editingEvent,
        newEventName: editEventName.trim() !== editingEvent ? editEventName.trim() : undefined,
        newEventDate: editEventDate.trim() || undefined,
      });
      toast.success(`Updated ${result.updated} results`);
      setEditingEvent(null);
      // Collapse and re-expand to refresh
      setExpandedEvents(prev => {
        const next = new Set(prev);
        next.delete(editingEvent);
        next.add(editEventName.trim());
        return next;
      });
    } catch (error) {
      toast.error("Failed to update event");
      console.error(error);
    } finally {
      setIsUpdatingEvent(false);
    }
  };
  
  if (!allResults || !players) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (allResults.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No event results found. Results are created when importing from third-party sources.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Group results by event name
  const eventGroups = new Map<string, typeof allResults>();
  for (const result of allResults) {
    if (!eventGroups.has(result.eventName)) {
      eventGroups.set(result.eventName, []);
    }
    eventGroups.get(result.eventName)!.push(result);
  }
  
  // Sort events by most recent date
  const sortedEvents = Array.from(eventGroups.entries()).sort((a, b) => {
    const aDate = a[1][0]?.eventDate || "";
    const bDate = b[1][0]?.eventDate || "";
    return bDate.localeCompare(aDate);
  });
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardDescription>
            {allResults.length} total results across {eventGroups.size} events
          </CardDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanupDuplicates}
            disabled={isCleaningDuplicates}
          >
            {isCleaningDuplicates ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cleaning...
              </>
            ) : (
              "Clean Duplicates"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedEvents.map(([eventName, results]) => {
          const isExpanded = expandedEvents.has(eventName);
          const eventDate = results[0]?.eventDate;
          const isDeleting = deletingEvent === eventName;
          
          return (
            <div key={eventName} className="rounded-lg border">
              <div className="flex items-center justify-between p-4 bg-muted/30">
                <button
                  onClick={() => toggleEvent(eventName)}
                  className="flex items-center gap-2 flex-1 text-left group"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                  />
                  <div className="flex-1">
                    <div className="font-medium group-hover:text-primary transition-colors">
                      {eventName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {eventDate && format(new Date(eventDate), "MMM d, yyyy")} • {results.length} results
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditEventDialog(eventName, eventDate)}
                    title="Edit event details"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteAllForEvent(eventName, results.length)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete All
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {isExpanded && (
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead className="text-xs">Player</TableHead>
                        <TableHead className="text-xs">Placement</TableHead>
                        <TableHead className="text-xs">Eliminations</TableHead>
                        <TableHead className="text-xs">Points</TableHead>
                        <TableHead className="text-xs">K/D Ratio</TableHead>
                        <TableHead className="text-xs">Import ID</TableHead>
                        <TableHead className="text-xs w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result) => {
                        const player = playerMap.get(result.playerId);
                        return (
                          <TableRow key={result._id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{player?.name || "Unknown"}</span>
                                {player?.tier && (
                                  <Badge variant="secondary" className="text-xs w-fit mt-1">
                                    {player.tier}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={result.placement === 1 ? "default" : "outline"} className="text-xs">
                                #{result.placement}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{result.eliminations}</TableCell>
                            <TableCell className="text-sm font-semibold">{result.eventScore}</TableCell>
                            <TableCell className="text-sm">{result.kdRatio.toFixed(2)}</TableCell>
                            <TableCell>
                              {result.importId ? (
                                <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">
                                  {result.importId.slice(-6)}
                                </code>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(result._id, result.eventName)}
                                disabled={deletingResult === result._id}
                                title="Delete this individual result"
                              >
                                {deletingResult === result._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      
      {/* Edit Event Dialog */}
      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Edit Event Details</DialogTitle>
            <DialogDescription>
              Update event name and date. This will update all results for this event.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Event Name</Label>
              <Input
                id="edit-name"
                value={editEventName}
                onChange={(e) => setEditEventName(e.target.value)}
                placeholder="Event name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">Event Date (Optional)</Label>
              <Input
                id="edit-date"
                type="date"
                value={editEventDate}
                onChange={(e) => setEditEventDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEvent(null)} disabled={isUpdatingEvent}>
              Cancel
            </Button>
            <Button onClick={handleUpdateEvent} disabled={isUpdatingEvent}>
              {isUpdatingEvent ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
