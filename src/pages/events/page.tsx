import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Calendar, Trophy, MapPin, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import PageToolbar from "@/components/page-toolbar.tsx";
import PaginatedGrid from "@/components/paginated-grid.tsx";
import { Label } from "@/components/ui/label.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  getPublicEventTypeLabel,
  matchesPublicEventTypeFilter,
} from "@/lib/event-types.ts";
import { eventPublicPath } from "@/lib/event-path.ts";

type StatusFilter = "upcoming" | "ongoing" | "completed";
type TypeFilter =
  | "all"
  | "scrim"
  | "season"
  | "mini-season"
  | "random"
  | "solos-meets-duos"
  | "scrim-series"
  | "showdown";
type ModeFilter = "all" | "ZB Main Map" | "Reload";
type SortBy = "date-asc" | "date-desc" | "name";

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All types" },
  { value: "scrim", label: "Scrims" },
  { value: "season", label: "Seasons" },
  { value: "mini-season", label: "Mini Seasons" },
  { value: "random", label: "Random" },
  { value: "solos-meets-duos", label: "Solos Meets Duos" },
  { value: "scrim-series", label: "Scrim Series" },
  { value: "showdown", label: "Showdown" },
];

const STATUS_LABEL: Record<StatusFilter, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Past",
};

function pickDefaultStatus(events: Array<{ status: string }>): StatusFilter {
  if (events.some((event) => event.status === "ongoing")) return "ongoing";
  if (events.some((event) => event.status === "upcoming")) return "upcoming";
  if (events.some((event) => event.status === "completed")) return "completed";
  return "upcoming";
}

function typeCount(
  events: Array<{ type: string }>,
  filter: TypeFilter,
): number {
  if (filter === "all") return events.length;
  return events.filter((event) => matchesPublicEventTypeFilter(event.type, filter)).length;
}

function EventCardImage({ eventId, name }: { eventId: Id<"events">; name: string }) {
  const imageUrl = useQuery(api.events.management.getEventImageUrl, { eventId });
  if (!imageUrl) {
    return null;
  }
  return (
    <img
      src={imageUrl}
      alt={name}
      className="h-32 w-32 object-contain"
      loading="lazy"
    />
  );
}

function EventCard({
  event,
}: {
  event: {
    _id: Id<"events">;
    name: string;
    slug?: string | null;
    type: string;
    mode: string;
    startDate: string;
    endDate: string;
    description?: string;
    season?: string;
    status: string;
    hasImage: boolean;
    standardCount: number;
  };
}) {
  return (
    <Link to={eventPublicPath(event)}>
      <Card className="hover:border-primary transition-colors cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <CardTitle className="text-lg">{event.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {event.season && (
                  <span className="font-medium">
                    {event.season.toLowerCase().startsWith("season")
                      ? event.season
                      : `Season ${event.season}`}
                  </span>
                )}
              </CardDescription>
            </div>
            <Badge
              variant={
                event.status === "upcoming"
                  ? "secondary"
                  : event.status === "ongoing"
                    ? "default"
                    : "outline"
              }
            >
              {STATUS_LABEL[event.status as StatusFilter] ?? event.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {event.hasImage && <EventCardImage eventId={event._id} name={event.name} />}

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{getPublicEventTypeLabel(event.type)}</Badge>
            <Badge variant="outline">
              <MapPin className="mr-1 h-3 w-3" />
              {event.mode}
            </Badge>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {format(new Date(event.startDate), "MMM d")} -{" "}
                {format(new Date(event.endDate), "MMM d, yyyy")}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Trophy className="h-4 w-4" />
              <span>
                {event.standardCount} Leaderboard{event.standardCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
          )}

          <div className="flex items-center text-sm text-primary font-medium">
            View Details
            <ArrowRight className="ml-1 h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function EventsPage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [statusChoice, setStatusChoice] = useState<StatusFilter | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("date-desc");

  const allEvents = useQuery(api.events.management.getPublicEvents);

  if (allEvents === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-96 w-full" />
      </PageShell>
    );
  }

  const statusFilter = statusChoice ?? pickDefaultStatus(allEvents);
  const upcomingCount = allEvents.filter((event) => event.status === "upcoming").length;
  const ongoingCount = allEvents.filter((event) => event.status === "ongoing").length;
  const pastCount = allEvents.filter((event) => event.status === "completed").length;
  const statusEvents = allEvents.filter((event) => event.status === statusFilter);

  const filteredEvents = allEvents
    .filter((event) => {
      if (event.status !== statusFilter) return false;
      if (!matchesPublicEventTypeFilter(event.type, typeFilter)) return false;
      if (modeFilter !== "all" && event.mode !== modeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "date-asc") {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
      if (sortBy === "date-desc") {
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      }
      return a.name.localeCompare(b.name);
    });

  const typeLabel = TYPE_FILTERS.find((option) => option.value === typeFilter)?.label ?? "All types";
  const emptyTitle = `No ${STATUS_LABEL[statusFilter].toLowerCase()} events`;

  return (
    <PageShell>
      <PageHeader
        title="Events"
        icon={Calendar}
        description="Seasons, scrims, and showdowns on the calendar."
      />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground" id="event-status-label">
            When
          </p>
          <Tabs
            value={statusFilter}
            onValueChange={(value) => setStatusChoice(value as StatusFilter)}
          >
            <TabsList aria-labelledby="event-status-label">
              <TabsTrigger value="upcoming">Upcoming ({upcomingCount})</TabsTrigger>
              <TabsTrigger value="ongoing">Ongoing ({ongoingCount})</TabsTrigger>
              <TabsTrigger value="completed">Past ({pastCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <PageToolbar>
          <div className="space-y-1.5 w-full sm:w-auto sm:min-w-[160px]">
            <Label className="text-xs text-muted-foreground" htmlFor="event-type-filter">
              Type
            </Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
              <SelectTrigger id="event-type-filter" className="w-full sm:w-[200px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.value === "all"
                      ? option.label
                      : `${option.label} (${typeCount(statusEvents, option.value)})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 w-full sm:w-auto sm:min-w-[160px]">
            <Label className="text-xs text-muted-foreground" htmlFor="event-mode-filter">
              Game mode
            </Label>
            <Select value={modeFilter} onValueChange={(value) => setModeFilter(value as ModeFilter)}>
              <SelectTrigger id="event-mode-filter" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Game mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="ZB Main Map">ZB Main Map</SelectItem>
                <SelectItem value="Reload">Reload</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 w-full sm:w-auto sm:min-w-[160px]">
            <Label className="text-xs text-muted-foreground" htmlFor="event-sort">
              Sort
            </Label>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
              <SelectTrigger id="event-sort" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Newest first</SelectItem>
                <SelectItem value="date-asc">Oldest first</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PageToolbar>

        {filteredEvents.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {statusFilter === "upcoming" ? <Calendar /> : <Trophy />}
              </EmptyMedia>
              <EmptyTitle>
                {allEvents.length === 0 ? "No events on the calendar" : emptyTitle}
              </EmptyTitle>
              <EmptyDescription>
                {allEvents.length === 0
                  ? "When events are published, they will show up here."
                  : typeFilter !== "all" || modeFilter !== "all"
                    ? `Nothing matches ${typeLabel}${modeFilter !== "all" ? ` in ${modeFilter}` : ""}. Try another type or mode.`
                    : `There are no ${STATUS_LABEL[statusFilter].toLowerCase()} events on the calendar.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <PaginatedGrid
            items={filteredEvents}
            resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]}
            itemLabel="events"
          >
            {(event) => <EventCard key={event._id} event={event} />}
          </PaginatedGrid>
        )}
      </div>
    </PageShell>
  );
}
