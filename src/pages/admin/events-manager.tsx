import { useState } from "react";
import { useQuery } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import EventManager from "./_components/event-manager.tsx";
import DuoSelector from "./_components/duo-selector.tsx";
import DuoPairManager from "./_components/duo-pair-manager.tsx";

function DuoSelectionSection() {
  const events = useQuery(api.events.management.getAllEvents);
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  
  const dynamicEvents = events?.filter(e => e.dynamicPairDetection || e.type === "random-squads" || e.type === "random-trios") || [];
  
  if (dynamicEvents.length === 0) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Duo Selection Manager</CardTitle>
        <CardDescription className="text-xs">
          Select which players are duos for random-team events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Event</label>
          <Select value={selectedEventId || undefined} onValueChange={(v) => setSelectedEventId(v as Id<"events">)}>
            <SelectTrigger>
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

function SolosMeetsDuosSection() {
  const events = useQuery(api.events.management.getAllEvents);
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
        <CardTitle className="text-sm">Solos Meets Duos/Trios - Group Manager</CardTitle>
        <CardDescription className="text-xs">
          Pre-assign groups for Solos Meets Duos/Trios events. Each player plays solo but their points are combined.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Event</label>
          <Select value={selectedEventId || undefined} onValueChange={(v) => setSelectedEventId(v as Id<"events">)}>
            <SelectTrigger>
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
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <Unauthenticated>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-6">
            <h1 className="text-4xl text-balance font-bold tracking-tight">
              Sign in to access staff panel
            </h1>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>

      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center">
          <Skeleton className="h-96 w-full max-w-6xl" />
        </div>
      </AuthLoading>

      <Authenticated>
        <div className="flex pt-14 lg:pt-0">
          <AdminSidebar />
          <main className="flex-1 p-6 overflow-x-auto">
            <div className="max-w-7xl mx-auto space-y-4">
              <EventManager />
              <SolosMeetsDuosSection />
              <DuoSelectionSection />
            </div>
          </main>
        </div>
      </Authenticated>
    </div>
  );
}
