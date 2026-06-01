import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type AdminEventsList = FunctionReturnType<typeof api.events.management.getAllEvents>;
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import EventManager from "./_components/event-manager.tsx";
import DuoSelector from "./_components/duo-selector.tsx";
import DuoPairManager from "./_components/duo-pair-manager.tsx";

function DuoSelectionSection({
  events,
}: {
  events: AdminEventsList | undefined;
}) {
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  
  const dynamicEvents = events?.filter(e => e.dynamicPairDetection || e.type === "random-squads" || e.type === "random-trios") || [];
  
  if (dynamicEvents.length === 0) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Duo Selection Manager</CardTitle>
        <CardDescription className="text-xs">
          Select which players are duos for random-team events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Select Event</Label>
          <Select value={selectedEventId || undefined} onValueChange={(v) => setSelectedEventId(v as Id<"events">)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose an event with duo detection enabled" />
            </SelectTrigger>
            <SelectContent>
              {dynamicEvents.map(event => (
                <SelectItem key={event._id} value={event._id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {selectedEventId && (
          <DuoSelector eventId={selectedEventId} />
        )}
      </CardContent>
    </Card>
  );
}

function SolosMeetsDuosSection({
  events,
}: {
  events: AdminEventsList | undefined;
}) {
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  
  const smdEvents = events?.filter(e => e.type === "solos-meets-duos") || [];
  const selectedEvent = smdEvents.find(e => e._id === selectedEventId);
  const isTrio = selectedEvent?.smdTeamSize === "trio";
  
  if (smdEvents.length === 0) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Solos Meets Duos/Trios - Group Manager</CardTitle>
        <CardDescription className="text-xs">
          Pre-assign groups for Solos Meets Duos/Trios events. Each player plays solo but their points are combined.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Select Event</Label>
          <Select value={selectedEventId || undefined} onValueChange={(v) => setSelectedEventId(v as Id<"events">)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a Solos Meets Duos/Trios event" />
            </SelectTrigger>
            <SelectContent>
              {smdEvents.map(event => (
                <SelectItem key={event._id} value={event._id}>
                  {event.name} ({event.smdTeamSize === "trio" ? "Trios" : "Duos"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {selectedEventId && (
          <DuoPairManager eventId={selectedEventId} isTrio={isTrio} />
        )}
      </CardContent>
    </Card>
  );
}

export default function EventsManagerPage() {
  const events = useQuery(api.events.management.getAllEvents, {});

  return (
    <AdminPageLayout requireModerator
      title="Events Manager"
      description="Create and manage events, duo groups, and solos-meets-duos pairings."
      authTitle="Sign in to manage events"
    >
      <EventManager />
      <SolosMeetsDuosSection events={events} />
      <DuoSelectionSection events={events} />
    </AdminPageLayout>
  );
}
