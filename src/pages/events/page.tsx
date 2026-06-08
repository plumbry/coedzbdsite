import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
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
  isScrimLikeEventType,
  matchesPublicEventTypeFilter,
} from "@/lib/event-types.ts";

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

export default function EventsPage() {
  const [typeFilter, setTypeFilter] = useState<"all" | "scrim" | "season" | "mini-season" | "random" | "solos-meets-duos" | "scrim-series" | "showdown">("all");
  const [modeFilter, setModeFilter] = useState<"all" | "ZB Main Map" | "Reload">("all");
  const [statusFilter, setStatusFilter] = useState<"upcoming" | "ongoing" | "completed">("ongoing");
  const [sortBy, setSortBy] = useState<"date-asc" | "date-desc" | "name">("date-desc");
  
  const allEvents = useQuery(api.events.management.getPublicEvents);
  
  if (allEvents === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-96 w-full" />
      </PageShell>
    );
  }
  
  // Filter and sort events
  const filteredEvents = allEvents
    .filter(event => {
      if (statusFilter && event.status !== statusFilter) return false;
      if (!matchesPublicEventTypeFilter(event.type, typeFilter)) return false;
      if (modeFilter !== "all" && event.mode !== modeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "date-asc") {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } else if (sortBy === "date-desc") {
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      } else {
        // name
        return a.name.localeCompare(b.name);
      }
    });
  
  // Status counts (always from all events)
  const upcomingEvents = allEvents.filter(e => e.status === "upcoming");
  const ongoingEvents = allEvents.filter(e => e.status === "ongoing");
  const completedEvents = allEvents.filter(e => e.status === "completed");
  
  // Type counts (always from current status, regardless of type filter)
  const statusFilteredEvents = allEvents.filter(e => e.status === statusFilter);
  const scrimCount = statusFilteredEvents.filter((e) => isScrimLikeEventType(e.type)).length;
  const seasonCount = statusFilteredEvents.filter(e => e.type === "season").length;
  const miniSeasonCount = statusFilteredEvents.filter(e => e.type === "mini-season").length;
  const randomCount = statusFilteredEvents.filter(e => e.type === "random-squads" || e.type === "random-trios").length;
  const smdCount = statusFilteredEvents.filter(e => e.type === "solos-meets-duos").length;
  const scrimSeriesCount = statusFilteredEvents.filter(e => e.type === "scrim-series").length;
  const showdownCount = statusFilteredEvents.filter(e => e.type === "showdown").length;
  
  const EventCard = ({ event }: { event: typeof allEvents[0] }) => (
    <Link to={`/events/${event._id}`}>
      <Card className="hover:border-primary transition-colors cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <CardTitle className="text-lg">{event.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {event.season && (
                  <span className="font-medium">
                    {event.season.toLowerCase().startsWith('season') ? event.season : `Season ${event.season}`}
                  </span>
                )}
              </CardDescription>
            </div>
            <Badge 
              variant={
                event.status === "upcoming" ? "secondary" : 
                event.status === "ongoing" ? "default" : 
                "outline"
              }
            >
              {event.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {event.hasImage && (
            <EventCardImage eventId={event._id} name={event.name} />
          )}
          
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {getPublicEventTypeLabel(event.type)}
            </Badge>
            <Badge variant="outline">
              <MapPin className="mr-1 h-3 w-3" />
              {event.mode}
            </Badge>
          </div>
          
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {format(new Date(event.startDate), "MMM d")} - {format(new Date(event.endDate), "MMM d, yyyy")}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <Trophy className="h-4 w-4" />
              <span>{event.standardCount} Leaderboard{event.standardCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
          
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {event.description}
            </p>
          )}
          
          <div className="flex items-center text-sm text-primary font-medium">
            View Details
            <ArrowRight className="ml-1 h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
  
  return (
    <PageShell>
      <PageHeader
        title="Co-Ed ZBD Hub - Events"
        icon={Calendar}
        description="Browse scrims and seasonal tournaments"
      />

      <PageToolbar>
        <div className="space-y-1.5 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Game Mode</Label>
          <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as typeof modeFilter)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Game Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              <SelectItem value="ZB Main Map">ZB Main Map</SelectItem>
              <SelectItem value="Reload">Reload</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Sort by</Label>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest First</SelectItem>
              <SelectItem value="date-asc">Oldest First</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageToolbar>
      
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcomingEvents.length})</TabsTrigger>
          <TabsTrigger value="ongoing">Ongoing ({ongoingEvents.length})</TabsTrigger>
          <TabsTrigger value="completed">Past ({completedEvents.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming">
          <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)} className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All Events</TabsTrigger>
              <TabsTrigger value="scrim">Scrims ({scrimCount})</TabsTrigger>
              <TabsTrigger value="season">Seasons ({seasonCount})</TabsTrigger>
              <TabsTrigger value="mini-season">Mini Seasons ({miniSeasonCount})</TabsTrigger>
              <TabsTrigger value="random">Random ({randomCount})</TabsTrigger>
              {smdCount > 0 && <TabsTrigger value="solos-meets-duos">SMD ({smdCount})</TabsTrigger>}
              {scrimSeriesCount > 0 && <TabsTrigger value="scrim-series">Scrim Series ({scrimSeriesCount})</TabsTrigger>}
              {showdownCount > 0 && <TabsTrigger value="showdown">Showdown ({showdownCount})</TabsTrigger>}
            </TabsList>
            <TabsContent value="all">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="scrim">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming scrims</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="season">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming seasons</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="mini-season">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming mini seasons</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="random">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming random events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="solos-meets-duos">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming SMD events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="scrim-series">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming scrim series</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="showdown">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Calendar /></EmptyMedia><EmptyTitle>No upcoming showdowns</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
        
        <TabsContent value="ongoing">
          <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)} className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All Events</TabsTrigger>
              <TabsTrigger value="scrim">Scrims ({scrimCount})</TabsTrigger>
              <TabsTrigger value="season">Seasons ({seasonCount})</TabsTrigger>
              <TabsTrigger value="mini-season">Mini Seasons ({miniSeasonCount})</TabsTrigger>
              <TabsTrigger value="random">Random ({randomCount})</TabsTrigger>
              {smdCount > 0 && <TabsTrigger value="solos-meets-duos">SMD ({smdCount})</TabsTrigger>}
              {scrimSeriesCount > 0 && <TabsTrigger value="scrim-series">Scrim Series ({scrimSeriesCount})</TabsTrigger>}
              {showdownCount > 0 && <TabsTrigger value="showdown">Showdown ({showdownCount})</TabsTrigger>}
            </TabsList>
            <TabsContent value="all">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="scrim">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing scrims</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="season">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing seasons</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="mini-season">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing mini seasons</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="random">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing random events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="solos-meets-duos">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing SMD events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="scrim-series">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing scrim series</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="showdown">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No ongoing showdowns</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
        
        <TabsContent value="completed">
          <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)} className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All Events</TabsTrigger>
              <TabsTrigger value="scrim">Scrims ({scrimCount})</TabsTrigger>
              <TabsTrigger value="season">Seasons ({seasonCount})</TabsTrigger>
              <TabsTrigger value="mini-season">Mini Seasons ({miniSeasonCount})</TabsTrigger>
              <TabsTrigger value="random">Random ({randomCount})</TabsTrigger>
              {smdCount > 0 && <TabsTrigger value="solos-meets-duos">SMD ({smdCount})</TabsTrigger>}
              {scrimSeriesCount > 0 && <TabsTrigger value="scrim-series">Scrim Series ({scrimSeriesCount})</TabsTrigger>}
              {showdownCount > 0 && <TabsTrigger value="showdown">Showdown ({showdownCount})</TabsTrigger>}
            </TabsList>
            <TabsContent value="all">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="scrim">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past scrims</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="season">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past seasons</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="mini-season">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past mini seasons</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="random">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past random events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="solos-meets-duos">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past SMD events</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="scrim-series">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past scrim series</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
            <TabsContent value="showdown">
              {filteredEvents.length === 0 ? (
                <Empty><EmptyHeader><EmptyMedia variant="icon"><Trophy /></EmptyMedia><EmptyTitle>No past showdowns</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <PaginatedGrid items={filteredEvents} resetDeps={[statusFilter, typeFilter, modeFilter, sortBy]} itemLabel="events">
                  {(event) => <EventCard key={event._id} event={event} />}
                </PaginatedGrid>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
