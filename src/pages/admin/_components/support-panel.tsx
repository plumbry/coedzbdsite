import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Archive, Trash2, MessageSquare, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

type TicketView = "active" | "archived";

export default function SupportPanel() {
  const [view, setView] = useState<TicketView>("active");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<Id<"supportTickets"> | null>(null);
  
  const activeTickets = useQuery(api.support.getActiveTickets);
  const archivedTickets = useQuery(api.support.getArchivedTickets);
  const archiveTicket = useMutation(api.support.archiveTicket);
  const deleteTicket = useMutation(api.support.deleteTicket);
  
  const tickets = view === "active" ? activeTickets : archivedTickets;
  
  const handleArchive = async (ticketId: Id<"supportTickets">) => {
    try {
      await archiveTicket({ ticketId });
      toast.success("Ticket archived");
    } catch (error) {
      console.error("Error archiving ticket:", error);
      toast.error("Failed to archive ticket");
    }
  };
  
  const handleDelete = async () => {
    if (!ticketToDelete) return;
    
    try {
      await deleteTicket({ ticketId: ticketToDelete });
      toast.success("Ticket deleted");
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
    } catch (error) {
      console.error("Error deleting ticket:", error);
      toast.error("Failed to delete ticket");
    }
  };
  
  const openDeleteDialog = (ticketId: Id<"supportTickets">) => {
    setTicketToDelete(ticketId);
    setDeleteDialogOpen(true);
  };
  
  return (
    <>
      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* View Toggle */}
          <div className="flex gap-2">
            <Button
              variant={view === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("active")}
            >
              Active
              {activeTickets && activeTickets.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeTickets.length}
                </Badge>
              )}
            </Button>
            <Button
              variant={view === "archived" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("archived")}
            >
              Archived
              {archivedTickets && archivedTickets.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {archivedTickets.length}
                </Badge>
              )}
            </Button>
          </div>
          
          {/* Tickets List */}
          {tickets === undefined ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : tickets.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquare />
                </EmptyMedia>
                <EmptyTitle>
                  {view === "active" ? "No active tickets" : "No archived tickets"}
                </EmptyTitle>
                <EmptyDescription>
                  {view === "active" 
                    ? "All caught up! No support requests at the moment."
                    : "No archived tickets to display."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <Card key={ticket._id} className="border-2">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm">
                              {ticket.discordUsername}
                            </h4>
                            <Badge variant={view === "active" ? "default" : "secondary"} className="text-xs">
                              {view === "active" ? "Active" : "Archived"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {new Date(ticket._creationTime).toLocaleString()}
                          </p>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {ticket.message}
                          </p>
                        </div>
                        
                        <div className="flex gap-1 flex-shrink-0">
                          {view === "active" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleArchive(ticket._id)}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDeleteDialog(ticket._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Support Ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the support ticket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
