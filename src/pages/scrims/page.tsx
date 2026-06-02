import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Link } from "react-router-dom";
import { useState } from "react";
import PaginatedGrid from "@/components/paginated-grid.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import { Trophy, Users, Gamepad2, Calendar, Dices, ExternalLink, Plus, Copy, Check, ShieldAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";

function ScrimsLandingPageInner() {
  const events = useQuery(api.scrims.queries.listEvents, {});
  const createShellEvent = useMutation(api.scrims.mutations.createShellEvent);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("duos_into_squads");
  const [games, setGames] = useState("5");
  const [creating, setCreating] = useState(false);

  // Result state after creation
  const [createdLinkCode, setCreatedLinkCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!eventName.trim()) {
      toast.error("Please enter an event name");
      return;
    }
    setCreating(true);
    try {
      const result = await createShellEvent({
        eventName: eventName.trim(),
        eventType,
        games: parseInt(games, 10) || 5,
      });
      setCreatedLinkCode(result.linkCode);
      toast.success("Event created!");
    } catch {
      toast.error("Failed to create event");
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdLinkCode) return;
    try {
      await navigator.clipboard.writeText(createdLinkCode);
      setCopied(true);
      toast.success("Code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEventName("");
    setEventType("duos_into_squads");
    setGames("5");
    setCreatedLinkCode(null);
    setCopied(false);
    setCreating(false);
  };

  return (
    <>
      <PageHeader
        title="Spin Events"
        icon={Dices}
        description="Random squad pairings generated via Discord"
        actions={
          <Button className="cursor-pointer" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Event
          </Button>
        }
      />

      {events === undefined && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      )}

      {events !== undefined && events.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy />
              </EmptyMedia>
              <EmptyTitle>No spin events yet</EmptyTitle>
              <EmptyDescription>
                Create an event and use its link code in your Discord command.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" className="cursor-pointer" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create Event
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {/* Event cards */}
        {events !== undefined && events.length > 0 && (
          <PaginatedGrid
            items={events}
            className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            itemLabel="events"
          >
            {(event) => {
              const hasPairings = event.pairings && event.pairings.length > 0;
              const gamesGenerated = event.pairings?.length ?? 0;
              const soloCount = event.solos?.length ?? 0;
              const hasTeams = event.teams.length > 0;
              const createdAt = new Date(event._creationTime);
              const linkCode = "linkCode" in event ? event.linkCode : undefined;

              return (
                <Link
                  key={event._id}
                  to={`/spin/${"slug" in event && event.slug ? event.slug : event._id}`}
                  className="group cursor-pointer"
                >
                  <Card className="h-full transition-all duration-200 group-hover:border-primary/50 group-hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg leading-tight line-clamp-2">
                          {event.eventName}
                        </CardTitle>
                        {!hasTeams ? (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            Awaiting Teams
                          </Badge>
                        ) : hasPairings ? (
                          <Badge variant="default" className="shrink-0 text-xs">
                            {gamesGenerated}/{event.games} games
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            Pending
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {hasTeams ? (
                          <span className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            {event.teams.length} duos
                            {soloCount > 0 && ` + ${soloCount} solos`}
                          </span>
                        ) : linkCode ? (
                          <span className="flex items-center gap-1.5 font-mono text-xs bg-muted px-2 py-0.5 rounded">
                            Code: {linkCode}
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1.5">
                          <Gamepad2 className="h-3.5 w-3.5" />
                          {event.games} games
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <time dateTime={createdAt.toISOString()}>
                          {createdAt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </time>
                      </div>
                      <div className="pt-1 flex items-center gap-2 flex-wrap">
                        <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
                          {event.eventType.replace(/_/g, " ")}
                        </span>
                        {event.leaderboardUrl && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <ExternalLink className="h-3 w-3" />
                            Leaderboard
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            }}
          </PaginatedGrid>
        )}

      {/* Create Event Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setDialogOpen(true); }}>
        <DialogContent size="sm">
          {createdLinkCode ? (
            <>
              <DialogHeader>
                <DialogTitle>Event Created</DialogTitle>
                <DialogDescription>
                  Use this code in your Discord command to link teams to this event.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center gap-3">
                  <div className="rounded-lg bg-muted px-6 py-4 font-mono text-3xl font-bold tracking-widest text-center select-all">
                    {createdLinkCode}
                  </div>
                </div>
                <Button
                  className="w-full cursor-pointer"
                  onClick={handleCopyCode}
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  {copied ? "Copied!" : "Copy Code"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Pass this code as the <code className="bg-muted px-1 py-0.5 rounded text-[11px]">link_code</code> parameter in your Discord <code className="bg-muted px-1 py-0.5 rounded text-[11px]">/scrim</code> command.
                </p>
              </div>
              <DialogFooter>
                <Button variant="secondary" className="cursor-pointer" onClick={handleCloseDialog}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create Spin Event</DialogTitle>
                <DialogDescription>
                  Create an event and get a link code to use in your Discord command.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="eventName">Event Name</Label>
                  <Input
                    id="eventName"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="Friday Night Spin"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventType">Event Type</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="duos_into_squads" className="cursor-pointer">Duos into Squads</SelectItem>
                      <SelectItem value="duos_and_solos" className="cursor-pointer">Duos and Solos</SelectItem>
                      <SelectItem value="number_only" className="cursor-pointer">Number Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="games">Number of Games</Label>
                  <Select value={games} onValueChange={setGames}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)} className="cursor-pointer">
                          {n} {n === 1 ? "game" : "games"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" className="cursor-pointer" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button className="cursor-pointer" onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create Event"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ScrimsLandingPage() {
  const { isModeratorOrAdmin, hasEventBanAccess, isLoading } = useUserRole();

  return (
    <>
      <AuthLoading>
        <PageShell>
          <Skeleton className="h-40 w-full max-w-md mx-auto" />
        </PageShell>
      </AuthLoading>
      <Unauthenticated>
        <PageShell>
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You need to sign in to access this page.</p>
            <SignInButton />
          </div>
        </PageShell>
      </Unauthenticated>
      <Authenticated>
        {isLoading ? (
          <PageShell>
            <Skeleton className="h-40 w-full max-w-md mx-auto" />
          </PageShell>
        ) : (isModeratorOrAdmin || hasEventBanAccess) ? (
          <PageShell>
            <ScrimsLandingPageInner />
          </PageShell>
        ) : (
          <PageShell>
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              <p className="text-lg font-medium">Access Denied</p>
              <p className="text-sm text-muted-foreground">You do not have permission to access Spin Events.</p>
            </div>
          </PageShell>
        )}
      </Authenticated>
    </>
  );
}
