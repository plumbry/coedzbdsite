import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { ArrowLeft, Calendar, MapPin, Trophy, ExternalLink, Lock, Info } from "lucide-react";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/use-user-role.ts";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import PlayerProfileLink from "@/components/player-profile-link.tsx";
import LinkedScrimSeriesResults from "./linked-scrim-series-results.tsx";
import { getPublicEventTypeLabel } from "@/lib/event-types.ts";
import { eventPublicPath, isConvexDocumentId } from "@/lib/event-path.ts";

export default function EventDetail() {
  const { eventId: eventParam } = useParams<{ eventId: string }>();
  const { isAdmin } = useUserRole();

  const isConvexId = eventParam ? isConvexDocumentId(eventParam) : false;

  const eventBySlug = useQuery(
    api.events.management.getEventBySlug,
    eventParam && !isConvexId ? { slug: eventParam } : "skip",
  );

  const eventById = useQuery(
    api.events.management.getEvent,
    eventParam && isConvexId ? { eventId: eventParam as Id<"events"> } : "skip",
  );

  const eventByIdFallback = useQuery(
    api.events.management.getEvent,
    eventParam && !isConvexId && eventBySlug === null
      ? { eventId: eventParam as Id<"events"> }
      : "skip",
  );

  const event = eventBySlug ?? eventById ?? eventByIdFallback;
  const resolvedEventId = event?._id;

  const eventLeaderboards = useQuery(
    api.events.results.getEventLeaderboards,
    resolvedEventId && event && !event.linkedScrimSeriesId
      ? { eventId: resolvedEventId }
      : "skip",
  );

  const linkedScrimImportLog = useQuery(
    api.scrimSeries.queries.getImportLog,
    event?.linkedScrimSeriesId
      ? { seriesId: event.linkedScrimSeriesId }
      : "skip",
  );
  
  if (!eventParam) {
    return (
      <PageShell>
        <p>Invalid event ID</p>
      </PageShell>
    );
  }
  
  if (event === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-96 w-full" />
      </PageShell>
    );
  }
  
  if (event === null) {
    return (
      <PageShell>
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Event Not Found</h1>
          <Link to="/events">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Events
            </Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  if (isConvexId && event.slug) {
    return <Navigate to={eventPublicPath(event)} replace />;
  }

  const publicLeaderboardLinks: Array<{ url: string; label: string }> = [];
  const seenLeaderboardUrls = new Set<string>();
  const addLeaderboardLink = (url: string, label: string) => {
    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith("CSV Import:") || seenLeaderboardUrls.has(trimmed)) {
      return;
    }
    seenLeaderboardUrls.add(trimmed);
    publicLeaderboardLinks.push({ url: trimmed, label });
  };

  const isScrimSeries = event.type === "scrim-series";

  if (event.type === "mini-season") {
    event.qualifierLobby1Leaderboards?.forEach((url, i) =>
      addLeaderboardLink(url, `Qualifier Lobby 1${event.qualifierLobby1Leaderboards!.length > 1 ? ` (${i + 1})` : ""}`),
    );
    event.qualifierLobby2Leaderboards?.forEach((url, i) =>
      addLeaderboardLink(url, `Qualifier Lobby 2${event.qualifierLobby2Leaderboards!.length > 1 ? ` (${i + 1})` : ""}`),
    );
    event.finalsLeaderboards?.forEach((url, i) =>
      addLeaderboardLink(url, `Finals${event.finalsLeaderboards!.length > 1 ? ` (${i + 1})` : ""}`),
    );
  } else {
    event.standardLeaderboards?.forEach((url, i) =>
      addLeaderboardLink(
        url,
        isScrimSeries ? `Session ${i + 1}` : `Leaderboard ${i + 1}`,
      ),
    );
    event.standardLeaderboardsLobby2?.forEach((url, i) =>
      addLeaderboardLink(url, `Lobby 2 — ${i + 1}`),
    );
    event.qualifierLobby1Leaderboards?.forEach((url, i) =>
      addLeaderboardLink(url, `Qualifier Lobby 1 — ${i + 1}`),
    );
    event.qualifierLobby2Leaderboards?.forEach((url, i) =>
      addLeaderboardLink(url, `Qualifier Lobby 2 — ${i + 1}`),
    );
    event.finalsLeaderboards?.forEach((url, i) =>
      addLeaderboardLink(url, `Finals — ${i + 1}`),
    );
  }

  eventLeaderboards?.leaderboards.forEach((lb, index) => {
    if (lb.leaderboardUrl) {
      addLeaderboardLink(lb.leaderboardUrl, lb.leaderboardName || `Imported week ${index + 1}`);
    }
  });

  if (event.linkedScrimSeriesId && event.linkedScrimSeries && linkedScrimImportLog) {
    const seenTournaments = new Set<string>();
    const sortedImportLog = [...linkedScrimImportLog].sort(
      (a, b) => a.sessionNumber - b.sessionNumber,
    );
    for (const log of sortedImportLog) {
      if (seenTournaments.has(log.tournamentId)) continue;
      seenTournaments.add(log.tournamentId);
      addLeaderboardLink(
        `https://yunite.xyz/leaderboard/${log.tournamentId}`,
        isScrimSeries ? `Session ${log.sessionNumber}` : `Yunite — Session ${log.sessionNumber}`,
      );
    }
  }

  const usesLinkedScrimSeries = Boolean(event.linkedScrimSeriesId);
  const leaderboardLinksCard = publicLeaderboardLinks.length > 0 ? (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboards</CardTitle>
        <CardDescription>
          Yunite links for this event (configured on the event and from linked imports)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {publicLeaderboardLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 border rounded-lg hover:border-primary transition-colors"
            >
              <div>
                <p className="font-medium">{link.label}</p>
                <p className="text-sm text-muted-foreground truncate max-w-md">{link.url}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  ) : null;

  return (
    <PageShell>
      <PageHeader
        title={event.name}
        description={
          event.season
            ? event.season.toLowerCase().startsWith("season")
              ? event.season
              : `Season ${event.season}`
            : undefined
        }
        back={{ label: "Back to Events", href: "/events" }}
        actions={
          <div className="flex gap-2">
            <Badge 
              variant={
                event.status === "upcoming" ? "secondary" : 
                event.status === "ongoing" ? "default" : 
                "outline"
              }
            >
              {event.status}
            </Badge>
            {isAdmin && (
              <Link to={`/admin/events-manager?event=${resolvedEventId}`}>
                <Button size="sm" variant="outline">
                  {event.type === "showdown" ? "Edit & penalties" : "Edit Event"}
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {event.imageUrl && (
        <img 
          src={event.imageUrl} 
          alt={event.name}
          className="h-24 w-24 object-contain"
        />
      )}

      <div className="space-y-4">
      
      {/* Event Info */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Card className="w-fit max-w-full gap-1 py-3 shadow-none">
          <CardHeader className="px-3 pb-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Event Type</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {getPublicEventTypeLabel(event.type)}
            </Badge>
            {event.type === "scrim-series" && event.linkedScrimSeries && (
              <Badge variant="outline" className="text-xs font-normal">
                Linked: {event.linkedScrimSeries.name}
              </Badge>
            )}
            {event.type === "scrim-series" && !event.linkedScrimSeriesId && event.bestNGames && (
              <p className="text-xs text-muted-foreground w-full">
                Best {event.bestNGames} games per player
              </p>
            )}
            {event.type === "showdown" && (
              <p className="text-xs text-muted-foreground w-full">
                Total points (all games)
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card className="w-fit max-w-full gap-1 py-3 shadow-none">
          <CardHeader className="px-3 pb-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Game Mode</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pt-1.5">
            <Badge variant="outline" className="text-xs">
              <MapPin className="mr-1 h-3 w-3" />
              {event.mode}
            </Badge>
          </CardContent>
        </Card>
        
        <Card className="w-fit max-w-full gap-1 py-3 shadow-none">
          <CardHeader className="px-3 pb-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Date Range</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pt-1.5 flex items-center gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {format(new Date(event.startDate), "MMM d")} - {format(new Date(event.endDate), "MMM d, yyyy")}
          </CardContent>
        </Card>

        {event.type === "scrim-series" && event.seriesDurationWeeks && (
          <Card className="w-fit max-w-full gap-1 py-3 shadow-none">
            <CardHeader className="px-3 pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Series Duration</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pt-1.5 text-xs">
              {event.seriesDurationWeeks} weeks
            </CardContent>
          </Card>
        )}

        {event.type === "showdown" && (
          <Card className="w-fit max-w-full gap-1 py-3 shadow-none">
            <CardHeader className="px-3 pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Format</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pt-1.5 text-xs space-y-1">
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>
                  Tier-locked at start · best {event.showdownBestWeeks ?? 2} weekly totals
                </span>
              </div>
              {(event.penaltyAmount ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground pl-5">
                  Default penalty: {event.penaltyAmount} pts per infraction
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      
      {event.description && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{event.description}</p>
          </CardContent>
        </Card>
      )}
      
      {/* Event Results — linked standalone Scrim Series */}
      {usesLinkedScrimSeries && event.linkedScrimSeriesId && (
        <Card>
          <CardHeader>
            <CardTitle>Event Results</CardTitle>
            <CardDescription>
              {event.linkedScrimSeries
                ? `Scrim Series leaderboard — Best ${event.linkedScrimSeries.bestN} games (from Admin → Scrim Series)`
                : "Scrim Series leaderboard"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LinkedScrimSeriesResults
              seriesId={event.linkedScrimSeriesId}
              seriesName={event.linkedScrimSeries?.name}
            />
          </CardContent>
        </Card>
      )}

      {/* Event Results — Yunite imports */}
      {!usesLinkedScrimSeries && eventLeaderboards && (eventLeaderboards.leaderboards.length > 0 || eventLeaderboards.cumulativeLeaderboard.length > 0 || eventLeaderboards.dynamicPairDetection || eventLeaderboards.isSolosMeetsDuos || eventLeaderboards.isScrimSeries || eventLeaderboards.isShowdown) && (
        <Card>
          <CardHeader>
            <CardTitle>Event Results</CardTitle>
            <CardDescription>
              {eventLeaderboards.isShowdown
                ? `Showdown — tier-split, best ${eventLeaderboards.showdownBestWeeks ?? 2} weekly totals`
                : eventLeaderboards.isScrimSeries
                ? `Scrim Series — per-player cumulative${eventLeaderboards.bestNGames ? ` (best ${eventLeaderboards.bestNGames} games)` : ""}`
                : eventLeaderboards.isSolosMeetsDuos
                ? "Solos Meets Duos - individual solos, combined duo points"
                : eventLeaderboards.twoLobbies
                  ? `${Math.ceil(eventLeaderboards.leaderboards.length / 2)} weeks (${eventLeaderboards.leaderboards.length} lobbies uploaded)`
                  : eventLeaderboards.leaderboards.length > 1 
                    ? `${eventLeaderboards.leaderboards.length} leaderboards uploaded` 
                    : "Leaderboard results"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventLeaderboards.isShowdown ? (
              (() => {
                const anyShowdownPenalties = [
                  ...eventLeaderboards.perPlayerLeaderboard,
                  ...Object.values(eventLeaderboards.showdownTierLeaderboards).flat(),
                ].some((row) => (row.penaltyTotal ?? 0) > 0);

                return (
              /* Showdown: tier-split per-player leaderboards (S/A/B/C) + overall + week tabs */
              <Tabs defaultValue={
                Object.values(eventLeaderboards.showdownTierLeaderboards).some(t => t.length > 0) 
                  ? (eventLeaderboards.showdownTierLeaderboards["S"]?.length > 0 ? "tier-S" 
                    : eventLeaderboards.showdownTierLeaderboards["A"]?.length > 0 ? "tier-A"
                    : eventLeaderboards.showdownTierLeaderboards["B"]?.length > 0 ? "tier-B"
                    : "tier-C")
                  : eventLeaderboards.perPlayerLeaderboard.length > 0 ? "overall" : "0"
              }>
                <TabsList className="mb-4 flex-wrap">
                  {(["S", "A", "B", "C"] as const).map((tier) => {
                    const count = eventLeaderboards.showdownTierLeaderboards[tier]?.length ?? 0;
                    return count > 0 ? (
                      <TabsTrigger key={tier} value={`tier-${tier}`}>
                        <Trophy className="mr-2 h-4 w-4" />
                        Tier {tier} ({count})
                      </TabsTrigger>
                    ) : null;
                  })}
                  {eventLeaderboards.perPlayerLeaderboard.length > 0 && (
                    <TabsTrigger value="overall">
                      Overall
                      {eventLeaderboards.showdownBestWeeks
                        ? ` (Best ${eventLeaderboards.showdownBestWeeks} weeks)`
                        : ""}
                    </TabsTrigger>
                  )}
                  {eventLeaderboards.leaderboards.map((leaderboard, index) => (
                    <TabsTrigger key={leaderboard.importId} value={index.toString()}>
                      Week {index + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Tier Leaderboards */}
                {(["S", "A", "B", "C"] as const).map((tier) => {
                  const tierData = eventLeaderboards.showdownTierLeaderboards[tier] ?? [];
                  if (tierData.length === 0) return null;
                  return (
                    <TabsContent key={tier} value={`tier-${tier}`}>
                      <div className="mb-4 flex items-center gap-2">
                        <Badge className={
                          tier === "S" ? "bg-yellow-500 hover:bg-yellow-500" : 
                          tier === "A" ? "bg-blue-500 hover:bg-blue-500" : 
                          tier === "B" ? "bg-green-500 hover:bg-green-500" : 
                          "bg-gray-500 hover:bg-gray-500"
                        }>
                          Tier {tier}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{tierData.length} players</span>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rank</TableHead>
                              <TableHead>Player</TableHead>
                              <TableHead className="font-bold">Total Points</TableHead>
                              <TableHead>Best Placement</TableHead>
                              <TableHead>Eliminations</TableHead>
                              <TableHead>Games Played</TableHead>
                              <TableHead>Weeks Counted</TableHead>
                              {anyShowdownPenalties && (
                                <TableHead>Penalties</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tierData.map((player) => (
                              <TableRow key={player.playerId || player.epicUsername}>
                                <TableCell className="font-medium">#{player.rank}</TableCell>
                                <TableCell>
                                <PlayerProfileLink
                                  discordUsername={player.discordUsername}
                                  className="text-sm font-medium"
                                >
                                  {player.playerName}
                                </PlayerProfileLink>
                                </TableCell>
                                <TableCell className="font-bold">{player.totalPoints}</TableCell>
                                <TableCell>{player.bestPlacement}</TableCell>
                                <TableCell>{player.totalEliminations}</TableCell>
                                <TableCell>{player.gamesPlayed}</TableCell>
                                <TableCell>{player.gamesCountedForPoints}</TableCell>
                                {anyShowdownPenalties && (
                                  <TableCell className="text-destructive">
                                    {player.penaltyTotal
                                      ? `−${player.penaltyTotal} (${player.penaltyCount})`
                                      : "—"}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  );
                })}

                {/* Overall Leaderboard */}
                {eventLeaderboards.perPlayerLeaderboard.length > 0 && (
                  <TabsContent value="overall">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Tier</TableHead>
                            <TableHead className="font-bold">Total Points</TableHead>
                            <TableHead>Best Placement</TableHead>
                            <TableHead>Eliminations</TableHead>
                            <TableHead>Games Played</TableHead>
                            <TableHead>Weeks Counted</TableHead>
                            {anyShowdownPenalties && (
                              <TableHead>Penalties</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventLeaderboards.perPlayerLeaderboard.map((player) => (
                            <TableRow key={player.playerId || player.epicUsername}>
                              <TableCell className="font-medium">#{player.rank}</TableCell>
                              <TableCell>
                                {player.discordUsername ? (
                                  <PlayerProfileLink
                                    discordUsername={player.discordUsername}
                                    className="text-sm font-medium"
                                  >
                                    {player.playerName}
                                  </PlayerProfileLink>
                                ) : (
                                  <span className="text-sm font-medium">{player.playerName}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {player.tier ? (
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {player.tier}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-bold">{player.totalPoints}</TableCell>
                              <TableCell>{player.bestPlacement}</TableCell>
                              <TableCell>{player.totalEliminations}</TableCell>
                              <TableCell>{player.gamesPlayed}</TableCell>
                              <TableCell>{player.gamesCountedForPoints}</TableCell>
                              {anyShowdownPenalties && (
                                <TableCell className="text-destructive">
                                  {player.penaltyTotal
                                    ? `−${player.penaltyTotal} (${player.penaltyCount})`
                                    : "—"}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                )}

                {/* Individual Week Tabs */}
                {eventLeaderboards.leaderboards.map((leaderboard, index) => (
                  <TabsContent key={leaderboard.importId} value={index.toString()}>
                    <div className="mb-4">
                      <h3 className="text-sm font-medium">{leaderboard.leaderboardName}</h3>
                      {leaderboard.eventDate && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(leaderboard.eventDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Tier</TableHead>
                            <TableHead>Total Points</TableHead>
                            <TableHead>Placement</TableHead>
                            <TableHead>Eliminations</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaderboard.results.map((result, resultIndex) => (
                            <TableRow key={result.teamId}>
                              <TableCell className="font-medium">#{resultIndex + 1}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {result.members.map((member, idx) => (
                                    <span key={member.epicUsername}>
                                      <PlayerProfileLink
                                        discordUsername={member.discordUsername}
                                        className="text-sm font-medium"
                                      >
                                        {member.playerName}
                                      </PlayerProfileLink>
                                      {idx < result.members.length - 1 && <span className="text-sm text-muted-foreground">, </span>}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const tier = (result.members[0] as typeof result.members[0] & { tier?: string | null })?.tier;
                                  return tier ? (
                                    <Badge variant="secondary" className="text-xs font-mono">{tier}</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="font-bold">{result.totalPoints}</TableCell>
                              <TableCell>{result.placement}</TableCell>
                              <TableCell>{result.eliminations}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
                );
              })()
            ) : eventLeaderboards.isScrimSeries ? (
              /* Scrim Series: per-player best-N-games cumulative leaderboard with individual week tabs */
              <Tabs defaultValue={eventLeaderboards.perPlayerLeaderboard.length > 0 ? "per-player" : "0"}>
                <TabsList className="mb-4 flex-wrap">
                  {eventLeaderboards.perPlayerLeaderboard.length > 0 && (
                    <TabsTrigger value="per-player">
                      <Trophy className="mr-2 h-4 w-4" />
                      Cumulative{eventLeaderboards.bestNGames ? ` (Best ${eventLeaderboards.bestNGames})` : ""}
                    </TabsTrigger>
                  )}
                  {eventLeaderboards.leaderboards.map((leaderboard, index) => (
                    <TabsTrigger key={leaderboard.importId} value={index.toString()}>
                      Week {index + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Per-Player Cumulative Leaderboard */}
                {eventLeaderboards.perPlayerLeaderboard.length > 0 && (
                  <TabsContent value="per-player">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Tier</TableHead>
                            <TableHead className="font-bold">Total Points</TableHead>
                            <TableHead>Best Placement</TableHead>
                            <TableHead>Eliminations</TableHead>
                            <TableHead>Games Played</TableHead>
                            {eventLeaderboards.bestNGames && (
                              <TableHead>Games Counted</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventLeaderboards.perPlayerLeaderboard.map((player) => (
                            <TableRow key={player.playerId || player.epicUsername}>
                              <TableCell className="font-medium">#{player.rank}</TableCell>
                              <TableCell>
                                {player.discordUsername ? (
                                  <PlayerProfileLink
                                    discordUsername={player.discordUsername}
                                    className="text-sm font-medium"
                                  >
                                    {player.playerName}
                                  </PlayerProfileLink>
                                ) : (
                                  <span className="text-sm font-medium">{player.playerName}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {player.tier ? (
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {player.tier}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-bold">{player.totalPoints}</TableCell>
                              <TableCell>{player.bestPlacement}</TableCell>
                              <TableCell>{player.totalEliminations}</TableCell>
                              <TableCell>{player.gamesPlayed}</TableCell>
                              {eventLeaderboards.bestNGames && (
                                <TableCell>{player.gamesCountedForPoints}</TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                )}

                {/* Individual Week Tabs */}
                {eventLeaderboards.leaderboards.map((leaderboard, index) => (
                  <TabsContent key={leaderboard.importId} value={index.toString()}>
                    <div className="mb-4">
                      <h3 className="text-sm font-medium">{leaderboard.leaderboardName}</h3>
                      {leaderboard.eventDate && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(leaderboard.eventDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Tier</TableHead>
                            <TableHead>Total Points</TableHead>
                            <TableHead>Placement</TableHead>
                            <TableHead>Eliminations</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaderboard.results.map((result, resultIndex) => (
                            <TableRow key={result.teamId}>
                              <TableCell className="font-medium">#{resultIndex + 1}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {result.members.map((member, idx) => (
                                    <span key={member.epicUsername}>
                                      <PlayerProfileLink
                                        discordUsername={member.discordUsername}
                                        className="text-sm font-medium"
                                      >
                                        {member.playerName}
                                      </PlayerProfileLink>
                                      {idx < result.members.length - 1 && <span className="text-sm text-muted-foreground">, </span>}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const tier = (result.members[0] as typeof result.members[0] & { tier?: string | null })?.tier;
                                  return tier ? (
                                    <Badge variant="secondary" className="text-xs font-mono">{tier}</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="font-bold">{result.totalPoints}</TableCell>
                              <TableCell>{result.placement}</TableCell>
                              <TableCell>{result.eliminations}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            ) : eventLeaderboards.isSolosMeetsDuos ? (
              /* Solos Meets Duos specific layout */
              <Tabs defaultValue={eventLeaderboards.solosMeetsDuosLeaderboard.length > 0 ? "duo-combined" : "0"}>
                <TabsList className="mb-4 flex-wrap">
                  {eventLeaderboards.solosMeetsDuosLeaderboard.length > 0 && (
                    <TabsTrigger value="duo-combined">
                      <Trophy className="mr-2 h-4 w-4" />
                      Duo Leaderboard
                    </TabsTrigger>
                  )}
                  {eventLeaderboards.leaderboards.map((leaderboard, index) => (
                    <TabsTrigger key={leaderboard.importId} value={index.toString()}>
                      Lobby {index + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Duo Combined Leaderboard */}
                {eventLeaderboards.solosMeetsDuosLeaderboard.length > 0 && (
                  <TabsContent value="duo-combined">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead>P1 Pts</TableHead>
                            <TableHead>P2 Pts</TableHead>
                            <TableHead>P3 Pts</TableHead>
                            <TableHead className="font-bold">Total</TableHead>
                            <TableHead>Best Place</TableHead>
                            <TableHead>Elims</TableHead>
                            <TableHead>Games</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventLeaderboards.solosMeetsDuosLeaderboard.map((duo) => {
                            const tiers = [duo.player1.tier || "?", duo.player2.tier || "?"];
                            if (duo.player3) tiers.push(duo.player3.tier || "?");
                            const groupTiers = tiers
                              .sort((a, b) => {
                                const order = { "S": 4, "A": 3, "B": 2, "C": 1, "?": 0 };
                                return (order[b as keyof typeof order] || 0) - (order[a as keyof typeof order] || 0);
                              })
                              .join("");
                            const allUnknown = groupTiers.replace(/\?/g, "") === "";

                            return (
                              <TableRow key={`${duo.player1.epicUsername}-${duo.player2.epicUsername}`}>
                                <TableCell className="font-medium">#{duo.rank}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-wrap gap-1">
                                      <PlayerProfileLink
                                        discordUsername={duo.player1.discordUsername}
                                        className="text-sm font-medium"
                                      >
                                        {duo.player1.playerName}
                                      </PlayerProfileLink>
                                      <span className="text-sm text-muted-foreground">&</span>
                                      <PlayerProfileLink
                                        discordUsername={duo.player2.discordUsername}
                                        className="text-sm font-medium"
                                      >
                                        {duo.player2.playerName}
                                      </PlayerProfileLink>
                                      {duo.player3 && (
                                        <>
                                          <span className="text-sm text-muted-foreground">&</span>
                                            <PlayerProfileLink
                                              discordUsername={duo.player3.discordUsername}
                                              className="text-sm font-medium"
                                            >
                                              {duo.player3.playerName}
                                            </PlayerProfileLink>
                                        </>
                                      )}
                                    </div>
                                    {!allUnknown && (
                                      <Badge variant="secondary" className="text-xs font-mono">
                                        {groupTiers}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">{duo.player1Points}</TableCell>
                                <TableCell className="text-sm">{duo.player2Points}</TableCell>
                                <TableCell className="text-sm">{duo.player3 ? duo.player3Points : "—"}</TableCell>
                                <TableCell className="font-bold">{duo.totalPoints}</TableCell>
                                <TableCell>{duo.bestPlacement < 999 ? `#${duo.bestPlacement}` : "—"}</TableCell>
                                <TableCell>{duo.totalEliminations}</TableCell>
                                <TableCell>{duo.gamesPlayed}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                )}

                {/* Individual Lobby Tabs */}
                {eventLeaderboards.leaderboards.map((leaderboard, index) => (
                  <TabsContent key={leaderboard.importId} value={index.toString()}>
                    <div className="mb-4">
                      <h3 className="text-sm font-medium">{leaderboard.leaderboardName}</h3>
                      {leaderboard.eventDate && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(leaderboard.eventDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Total Points</TableHead>
                            <TableHead>Placement</TableHead>
                            <TableHead>Eliminations</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaderboard.results.map((result, resultIndex) => (
                            <TableRow key={result.teamId}>
                              <TableCell className="font-medium">#{resultIndex + 1}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {result.members.map((member, idx) => (
                                    <span key={member.epicUsername}>
                                      <PlayerProfileLink
                                        discordUsername={member.discordUsername}
                                        className="text-sm font-medium"
                                      >
                                        {member.playerName}
                                      </PlayerProfileLink>
                                      {idx < result.members.length - 1 && <span className="text-sm text-muted-foreground">, </span>}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="font-bold">{result.totalPoints}</TableCell>
                              <TableCell>{result.placement}</TableCell>
                              <TableCell>{result.eliminations}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            ) : eventLeaderboards.leaderboards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leaderboards uploaded yet</p>
            ) : eventLeaderboards.leaderboards.length === 1 && !eventLeaderboards.dynamicPairDetection && !eventLeaderboards.isRandomSquads && !eventLeaderboards.isRandomTrios ? (
              // Single leaderboard without duo detection - show directly
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Total Points</TableHead>
                    <TableHead>Placement</TableHead>
                    <TableHead>Eliminations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventLeaderboards.leaderboards[0].results.map((result, index) => {
                    // Calculate team tier combo
                    const teamTiers = result.members
                      .map(m => (m as typeof m & { tier?: string | null }).tier || "?")
                      .sort((a, b) => {
                        const order = { "S": 4, "A": 3, "B": 2, "C": 1, "?": 0 };
                        return (order[b as keyof typeof order] || 0) - (order[a as keyof typeof order] || 0);
                      })
                      .join("");
                    
                    return (
                    <TableRow key={result.teamId}>
                      <TableCell className="font-medium">#{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-wrap gap-1">
                            {result.members.map((member, idx) => (
                              <span key={member.epicUsername}>
                                <PlayerProfileLink
                                  discordUsername={member.discordUsername}
                                  className="text-sm font-medium"
                                >
                                  {member.playerName}
                                </PlayerProfileLink>
                                {idx < result.members.length - 1 && <span className="text-sm text-muted-foreground">, </span>}
                              </span>
                            ))}
                          </div>
                          {teamTiers && teamTiers !== "?" && (
                            <Badge variant="secondary" className="text-xs font-mono">
                              {teamTiers}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">{result.totalPoints}</TableCell>
                      <TableCell>{result.placement}</TableCell>
                      <TableCell>{result.eliminations}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              // Multiple leaderboards - show tabs
              <Tabs defaultValue={(eventLeaderboards.isRandomSquads || eventLeaderboards.isRandomTrios || eventLeaderboards.dynamicPairDetection) ? "cumulative-duo" : ((eventLeaderboards.leaderboards.length > 2 || eventLeaderboards.twoLobbies) ? "cumulative" : "0")}>
                <TabsList className="mb-4">
                  {(eventLeaderboards.isRandomSquads || eventLeaderboards.isRandomTrios || eventLeaderboards.dynamicPairDetection) && (
                    <>
                      <TabsTrigger value="cumulative-duo">
                        <Trophy className="mr-2 h-4 w-4" />
                        Cumulative Duo
                      </TabsTrigger>
                      {(eventLeaderboards.isRandomTrios || eventLeaderboards.dynamicPairDetection) && eventLeaderboards.soloLeaderboard.length > 0 && (
                        <TabsTrigger value="cumulative-solo">
                          Cumulative Solo
                        </TabsTrigger>
                      )}
                    </>
                  )}
                  {!eventLeaderboards.dynamicPairDetection && (eventLeaderboards.leaderboards.length > 2 || eventLeaderboards.twoLobbies) && (
                    <TabsTrigger value="cumulative">
                      <Trophy className="mr-2 h-4 w-4" />
                      Cumulative
                    </TabsTrigger>
                  )}
                  {eventLeaderboards.leaderboards.map((leaderboard, index) => {
                    // Determine label based on event type
                    let label = `Week ${index + 1}`;
                    
                    if (eventLeaderboards.isRandomSquads || eventLeaderboards.isRandomTrios) {
                      label = `Event Leaderboard ${eventLeaderboards.leaderboards.length > 1 ? index + 1 : ""}`;
                    } else if (event.type === "mini-season") {
                      if (index === 0) {
                        label = "Qualifier Lobby 1";
                      } else if (index === 1) {
                        label = "Qualifier Lobby 2";
                      } else if (index === 2) {
                        label = "Finals";
                      } else {
                        label = "Consolation";
                      }
                    } else if (eventLeaderboards.twoLobbies) {
                      // For two-lobby events: every 2 imports = 1 week
                      const weekNum = Math.floor(index / 2) + 1;
                      const lobbyLetter = index % 2 === 0 ? "A" : "B";
                      label = `Wk ${weekNum} L${lobbyLetter}`;
                    }
                    
                    return (
                      <TabsTrigger key={leaderboard.importId} value={index.toString()}>
                        {label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                
                {/* Cumulative Duo Leaderboard Tab (for random team events) */}
                {(eventLeaderboards.isRandomSquads || eventLeaderboards.isRandomTrios || eventLeaderboards.dynamicPairDetection) && (
                  <TabsContent value="cumulative-duo">
                    {eventLeaderboards.duoLeaderboard.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-2">No duo assignments yet</p>
                        {isAdmin && (
                          <p className="text-sm text-muted-foreground">
                            Go to Admin → Duo Selection Manager to assign duos
                          </p>
                        )}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Duo</TableHead>
                            <TableHead>Total Points</TableHead>
                            <TableHead>Best Placement</TableHead>
                            <TableHead>Total Eliminations</TableHead>
                            <TableHead>Games Played</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventLeaderboards.duoLeaderboard.map((duo) => {
                            // Calculate duo tier combo
                            const duoTiers = [duo.player1.tier || "?", duo.player2.tier || "?"]
                              .sort((a, b) => {
                                const order = { "S": 4, "A": 3, "B": 2, "C": 1, "?": 0 };
                                return (order[b as keyof typeof order] || 0) - (order[a as keyof typeof order] || 0);
                              })
                              .join("");
                            
                            return (
                            <TableRow key={`${duo.player1.epicUsername}-${duo.player2.epicUsername}`}>
                              <TableCell className="font-medium">#{duo.rank}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-wrap gap-1">
                                    <PlayerProfileLink
                                      discordUsername={duo.player1.discordUsername}
                                      className="text-sm font-medium"
                                    >
                                      {duo.player1.playerName}
                                    </PlayerProfileLink>
                                    <span className="text-sm text-muted-foreground"> & </span>
                                    <PlayerProfileLink
                                      discordUsername={duo.player2.discordUsername}
                                      className="text-sm font-medium"
                                    >
                                      {duo.player2.playerName}
                                    </PlayerProfileLink>
                                  </div>
                                  {duoTiers && duoTiers !== "?" && duoTiers !== "??" && (
                                    <Badge variant="secondary" className="text-xs font-mono">
                                      {duoTiers}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-bold">{duo.totalPoints}</TableCell>
                              <TableCell>{duo.bestPlacement}</TableCell>
                              <TableCell>{duo.totalEliminations}</TableCell>
                              <TableCell>{duo.gamesPlayed}</TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                )}
                
                {/* Cumulative Solo Leaderboard Tab (for random trios only) */}
                {(eventLeaderboards.isRandomTrios || eventLeaderboards.dynamicPairDetection) && eventLeaderboards.soloLeaderboard.length > 0 && (
                  <TabsContent value="cumulative-solo">
                    <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Total Points</TableHead>
                            <TableHead>Best Placement</TableHead>
                            <TableHead>Total Eliminations</TableHead>
                            <TableHead>Games Played</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventLeaderboards.soloLeaderboard.map((player) => (
                            <TableRow key={player.epicUsername}>
                              <TableCell className="font-medium">#{player.rank}</TableCell>
                              <TableCell>
                                <PlayerProfileLink
                                  discordUsername={player.discordUsername}
                                  className="text-sm font-medium"
                                >
                                  {player.playerName}
                                </PlayerProfileLink>
                              </TableCell>
                              <TableCell className="font-bold">{player.totalPoints}</TableCell>
                              <TableCell>{player.bestPlacement}</TableCell>
                              <TableCell>{player.totalEliminations}</TableCell>
                              <TableCell>{player.gamesPlayed}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                  </TabsContent>
                )}
                
                {/* Cumulative Tab (only if more than 2 weeks, two-lobby events, and not using dynamic pair detection) */}
                {!eventLeaderboards.dynamicPairDetection && (eventLeaderboards.leaderboards.length > 2 || eventLeaderboards.twoLobbies) && (
                  <TabsContent value="cumulative">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead>Total Points</TableHead>
                          <TableHead>Best Placement</TableHead>
                          <TableHead>Total Eliminations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eventLeaderboards.cumulativeLeaderboard.map((result) => {
                          // Calculate team tier combo
                          const teamTiers = result.members
                            .map(m => (m as typeof m & { tier?: string | null }).tier || "?")
                            .sort((a, b) => {
                              const order = { "S": 4, "A": 3, "B": 2, "C": 1, "?": 0 };
                              return (order[b as keyof typeof order] || 0) - (order[a as keyof typeof order] || 0);
                            })
                            .join("");
                          
                          return (
                          <TableRow key={result.teamId}>
                            <TableCell className="font-medium">#{result.rank}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex flex-wrap gap-1">
                                  {result.members.map((member, idx) => (
                                    <span key={member.epicUsername}>
                                      <PlayerProfileLink
                                        discordUsername={member.discordUsername}
                                        className="text-sm font-medium"
                                      >
                                        {member.playerName}
                                      </PlayerProfileLink>
                                      {idx < result.members.length - 1 && <span className="text-sm text-muted-foreground">, </span>}
                                    </span>
                                  ))}
                                </div>
                                {teamTiers && teamTiers !== "?" && (
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {teamTiers}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-bold">{result.totalPoints}</TableCell>
                            <TableCell>{result.bestPlacement}</TableCell>
                            <TableCell>{result.totalEliminations}</TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TabsContent>
                )}
                
                {/* Individual Week Tabs */}
                {eventLeaderboards.leaderboards.map((leaderboard, index) => {
                  // Check if this is a qualifier lobby in a mini-season event
                  const isQualifierLobby = event.type === "mini-season" && (index === 0 || index === 1);
                  
                  return (
                    <TabsContent key={leaderboard.importId} value={index.toString()}>
                      <div className="mb-4">
                        <h3 className="text-sm font-medium">{leaderboard.leaderboardName}</h3>
                        {leaderboard.eventDate && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(leaderboard.eventDate).toLocaleDateString()}
                          </p>
                        )}
                        {isQualifierLobby && (
                          <div className="mt-2 flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                            <Trophy className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <p className="text-xs font-medium text-green-700 dark:text-green-300">
                              Top 5 teams qualify for finals
                            </p>
                          </div>
                        )}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Team</TableHead>
                            <TableHead>Total Points</TableHead>
                            <TableHead>Placement</TableHead>
                            <TableHead>Eliminations</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaderboard.results.map((result, resultIndex) => {
                            const isQualified = isQualifierLobby && resultIndex < 5;
                            
                            // Calculate team tier combo
                            const teamTiers = result.members
                              .map(m => (m as typeof m & { tier?: string | null }).tier || "?")
                              .sort((a, b) => {
                                const order = { "S": 4, "A": 3, "B": 2, "C": 1, "?": 0 };
                                return (order[b as keyof typeof order] || 0) - (order[a as keyof typeof order] || 0);
                              })
                              .join("");
                            
                            return (
                              <TableRow 
                                key={result.teamId}
                                className={isQualified ? "bg-green-50 dark:bg-green-950/30 border-l-4 border-l-green-500" : ""}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    #{resultIndex + 1}
                                    {isQualified && (
                                      <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-xs">
                                        Qualified
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-wrap gap-1">
                                      {result.members.map((member, idx) => (
                                        <span key={member.epicUsername}>
                                        <PlayerProfileLink
                                          discordUsername={member.discordUsername}
                                          className="text-sm font-medium"
                                        >
                                          {member.playerName}
                                        </PlayerProfileLink>
                                          {idx < result.members.length - 1 && <span className="text-sm text-muted-foreground">, </span>}
                                        </span>
                                      ))}
                                    </div>
                                    {teamTiers && teamTiers !== "?" && (
                                      <Badge variant="secondary" className="text-xs font-mono">
                                        {teamTiers}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="font-bold">{result.totalPoints}</TableCell>
                                <TableCell>{result.placement}</TableCell>
                                <TableCell>{result.eliminations}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Yunite leaderboard links (event URLs + linked imports) */}
      {leaderboardLinksCard}
      </div>
    </PageShell>
  );
}
