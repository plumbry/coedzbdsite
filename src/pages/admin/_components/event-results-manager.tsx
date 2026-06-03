import { Component, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Loader2, Trash2, AlertCircle, ChevronDown, Edit, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function formatEventDate(eventDate?: string) {
  if (!eventDate) return null;

  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) {
    return eventDate;
  }

  return format(date, "MMM d, yyyy");
}

class EventResultsErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Event results failed to load</AlertTitle>
          <AlertDescription>
            {this.state.error.message || "Refresh the page or check the Convex logs for the failed query."}
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default function EventResultsManager() {
  return (
    <EventResultsErrorBoundary>
      <EventResultsManagerContent />
    </EventResultsErrorBoundary>
  );
}

function EventResultsManagerContent() {
  const [deletingResult, setDeletingResult] = useState<Id<"thirdPartyResults"> | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [editEventName, setEditEventName] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);

  const eventSummaries = useQuery(api.events.getEventResultSummaries);
  const deleteEvent = useMutation(api.events.deleteEvent);
  const deleteAllEventResultsByName = useMutation(api.events.deleteAllEventResultsByName);
  const cleanupDuplicates = useMutation(api.cleanupDuplicates.cleanupAllDuplicates);
  const updateEventResultsByName = useMutation(api.events.updateEventResultsByName);

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
      setExpandedEvents((prev) => {
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
    setExpandedEvents((prev) => {
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
      setExpandedEvents((prev) => {
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

  if (!eventSummaries) {
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

  if (eventSummaries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No event results found. Manual entries and Yunite-linked results appear here after import.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <CardDescription>
            {eventSummaries.reduce((sum, event) => sum + event.resultCount, 0)} total results across {eventSummaries.length} events
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link to="/admin">Admin</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link to="/admin/uploads">Uploads</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link to="/admin/events-manager">Events</Link>
            </Button>
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
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {eventSummaries.map((event) => {
          const isExpanded = expandedEvents.has(event.eventName);
          const isDeleting = deletingEvent === event.eventName;
          const displayDate = formatEventDate(event.eventDate);

          return (
            <div key={event.eventName} className="rounded-lg border">
              <div className="flex items-center justify-between p-4 bg-muted/30">
                <button
                  onClick={() => toggleEvent(event.eventName)}
                  className="flex items-center gap-2 flex-1 text-left group"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                  />
                  <div className="flex-1">
                    <div className="font-medium group-hover:text-primary transition-colors">
                      {event.eventName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {displayDate ? `${displayDate} - ` : ""}
                      {event.resultCount} results
                      {event.importCount > 1 ? ` across ${event.importCount} imports` : ""}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditEventDialog(event.eventName, event.eventDate)}
                    title="Edit event details"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteAllForEvent(event.eventName, event.resultCount)}
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
                <EventResultRows
                  eventName={event.eventName}
                  deletingResult={deletingResult}
                  onDelete={handleDelete}
                />
              )}
            </div>
          );
        })}
      </CardContent>

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

function EventResultRows({
  eventName,
  deletingResult,
  onDelete,
}: {
  eventName: string;
  deletingResult: Id<"thirdPartyResults"> | null;
  onDelete: (resultId: Id<"thirdPartyResults">, eventName: string) => Promise<void>;
}) {
  const results = useQuery(api.events.getEventResultsForEvent, { eventName, limit: 1000 });

  if (!results) {
    return (
      <div className="border-t p-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
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
          {results.map((result) => (
            <TableRow key={result._id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{result.playerName}</span>
                  {result.playerTier && (
                    <Badge variant="secondary" className="text-xs w-fit mt-1">
                      {result.playerTier}
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
                <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">
                  {result.importId.slice(-6)}
                </code>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(result._id, result.eventName)}
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
