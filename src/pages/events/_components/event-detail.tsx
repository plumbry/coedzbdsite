import { Link, useParams } from "react-router-dom";
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
import SiteHeader from "@/components/site-header.tsx";

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { isAdmin } = useUserRole();
  
  const event = useQuery(
    api.events.management.getEvent,
    eventId ? { eventId: eventId as Id<"events"> } : "skip"
  );
  
  const eventLeaderboards = useQuery(
    api.events.results.getEventLeaderboards,
    eventId ? { eventId: eventId as Id<"events"> } : "skip"
  );
  
  if (!eventId) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <p>Invalid event ID</p>
      </div>
    );
  }
  
  if (event === undefined) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  if (event === null) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Event Not Found</h1>
          <Link to="/events">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Events
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  

  
  return (
    <>
      <SiteHeader />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
        <Link to="/events">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Button>
        </Link>
        
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {event.imageUrl && (
              <img 
                src={event.imageUrl} 
                alt={event.name}
                className="h-32 w-32 object-contain mb-4"
              />
            )}
            <h1 className="text-3xl font-bold mb-2">{event.name}</h1>
            {event.season && (
              <p className="text-lg text-muted-foreground">
                {event.season.toLowerCase().startsWith('season') ? event.season : `Season ${event.season}`}
              </p>
            )}
          </div>
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
              <Link to="/admin">
                <Button size="sm" variant="outline">
                  Edit Event
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
      
      {/* Event Info */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Event Type</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">
              {event.type === "scrim" 
                ? "Scrim" 
                : event.type === "minicup" 
                ? "Mini Cup" 
                : event.type === "season" 
                ? "Season" 
                : event.type === "mini-season"
                ? "Mini Season"
                : event.type === "solos-meets-duos"
                ? "Solos Meets Duos"
                : event.type === "scrim-series"
                ? "Scrim Series"
                : event.type === "showdown"
                ? "Showdown"
                : "Random"}
            </Badge>
            {event.type === "scrim-series" && event.bestNGames && (
              <p className="text-xs text-muted-foreground mt-2">
                Best {event.bestNGames} games per player
              </p>
            )}
            {event.type === "showdown" && (
              <p className="text-xs text-muted-foreground mt-2">
                Total points (all games)
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Game Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">
              <MapPin className="mr-1 h-3 w-3" />
              {event.mode}
            </Badge>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Date Range</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {format(new Date(event.startDate), "MMM d")} - {format(new Date(event.endDate), "MMM d, yyyy")}
          </CardContent>
        </Card>

        {event.type === "scrim-series" && event.seriesDurationWeeks && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Series Duration</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {event.seriesDurationWeeks} weeks
            </CardContent>
          </Card>
        )}

        {event.type === "showdown" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Format</CardTitle>
            </CardHeader>
            <CardContent className="text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              4-week, tier-locked at start, best 2 weeks count
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
      
      {/* Leaderboards */}
      {event.standardLeaderboards && event.standardLeaderboards.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Leaderboards</CardTitle>
            <CardDescription>
              View leaderboards for this event
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {event.standardLeaderboards.map((url, index) => (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 border rounded-lg hover:border-primary transition-colors"
                >
                  <div>
                    <p className="font-medium">Leaderboard {index + 1}</p>
                    <p className="text-sm text-muted-foreground truncate max-w-md">{url}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Event Results */}
      {eventLeaderboards && (eventLeaderboards.leaderboards.length > 0 || eventLeaderboards.cumulativeLeaderboard.length > 0 || eventLeaderboards.dynamicPairDetection || eventLeaderboards.isSolosMeetsDuos || eventLeaderboards.isScrimSeries || eventLeaderboards.isShowdown) && (
        <Card>
          <CardHeader>
            <CardTitle>Event Results</CardTitle>
            <CardDescription>
              {eventLeaderboards.isShowdown
                ? `Showdown — tier-split, best 2 weekly scores of 4`
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
                      Overall{eventLeaderboards.bestNGames ? ` (Best ${eventLeaderboards.bestNGames})` : ""}
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
                              {eventLeaderboards.bestNGames && (
                                <TableHead>Weeks Counted</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tierData.map((player) => (
                              <TableRow key={player.playerId || player.epicUsername}>
                                <TableCell className="font-medium">#{player.rank}</TableCell>
                                <TableCell>
                                  {player.discordUsername ? (
                                    <Link
                                      to={`/player/${player.discordUsername}`}
                                      className="text-sm text-primary hover:underline font-medium"
                                    >
                                      {player.playerName}
                                    </Link>
                                  ) : (
                                    <span className="text-sm font-medium">{player.playerName}</span>
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
                            {eventLeaderboards.bestNGames && (
                              <TableHead>Weeks Counted</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventLeaderboards.perPlayerLeaderboard.map((player) => (
                            <TableRow key={player.playerId || player.epicUsername}>
                              <TableCell className="font-medium">#{player.rank}</TableCell>
                              <TableCell>
                                {player.discordUsername ? (
                                  <Link
                                    to={`/player/${player.discordUsername}`}
                                    className="text-sm text-primary hover:underline font-medium"
                                  >
                                    {player.playerName}
                                  </Link>
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
                                      {member.discordUsername ? (
                                        <Link
                                          to={`/player/${member.discordUsername}`}
                                          className="text-sm text-primary hover:underline font-medium"
                                        >
                                          {member.playerName}
                                        </Link>
                                      ) : (
                                        <span className="text-sm font-medium">{member.playerName}</span>
                                      )}
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
                                  <Link
                                    to={`/player/${player.discordUsername}`}
                                    className="text-sm text-primary hover:underline font-medium"
                                  >
                                    {player.playerName}
                                  </Link>
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
                                      {member.discordUsername ? (
                                        <Link
                                          to={`/player/${member.discordUsername}`}
                                          className="text-sm text-primary hover:underline font-medium"
                                        >
                                          {member.playerName}
                                        </Link>
                                      ) : (
                                        <span className="text-sm font-medium">{member.playerName}</span>
                                      )}
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
                                      {duo.player1.discordUsername ? (
                                        <Link
                                          to={`/player/${duo.player1.discordUsername}`}
                                          className="text-sm text-primary hover:underline font-medium"
                                        >
                                          {duo.player1.playerName}
                                        </Link>
                                      ) : (
                                        <span className="text-sm font-medium">{duo.player1.playerName}</span>
                                      )}
                                      <span className="text-sm text-muted-foreground">&</span>
                                      {duo.player2.discordUsername ? (
                                        <Link
                                          to={`/player/${duo.player2.discordUsername}`}
                                          className="text-sm text-primary hover:underline font-medium"
                                        >
                                          {duo.player2.playerName}
                                        </Link>
                                      ) : (
                                        <span className="text-sm font-medium">{duo.player2.playerName}</span>
                                      )}
                                      {duo.player3 && (
                                        <>
                                          <span className="text-sm text-muted-foreground">&</span>
                                          {duo.player3.discordUsername ? (
                                            <Link
                                              to={`/player/${duo.player3.discordUsername}`}
                                              className="text-sm text-primary hover:underline font-medium"
                                            >
                                              {duo.player3.playerName}
                                            </Link>
                                          ) : (
                                            <span className="text-sm font-medium">{duo.player3.playerName}</span>
                                          )}
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
                                      {member.discordUsername ? (
                                        <Link
                                          to={`/player/${member.discordUsername}`}
                                          className="text-sm text-primary hover:underline font-medium"
                                        >
                                          {member.playerName}
                                        </Link>
                                      ) : (
                                        <span className="text-sm font-medium">{member.playerName}</span>
                                      )}
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
                                {member.discordUsername ? (
                                  <Link 
                                    to={`/player/${member.discordUsername}`}
                                    className="text-sm text-primary hover:underline font-medium"
                                  >
                                    {member.playerName}
                                  </Link>
                                ) : (
                                  <span className="text-sm font-medium">{member.playerName}</span>
                                )}
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
                      // For mini-seasons: first two are qualifier lobbies, third+ is finals
                      if (index === 0) {
                        label = "Qualifier Lobby 1";
                      } else if (index === 1) {
                        label = "Qualifier Lobby 2";
                      } else {
                        label = "Finals";
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
                                    {duo.player1.discordUsername ? (
                                      <Link 
                                        to={`/player/${duo.player1.discordUsername}`}
                                        className="text-sm text-primary hover:underline font-medium"
                                      >
                                        {duo.player1.playerName}
                                      </Link>
                                    ) : (
                                      <span className="text-sm font-medium">{duo.player1.playerName}</span>
                                    )}
                                    <span className="text-sm text-muted-foreground"> & </span>
                                    {duo.player2.discordUsername ? (
                                      <Link 
                                        to={`/player/${duo.player2.discordUsername}`}
                                        className="text-sm text-primary hover:underline font-medium"
                                      >
                                        {duo.player2.playerName}
                                      </Link>
                                    ) : (
                                      <span className="text-sm font-medium">{duo.player2.playerName}</span>
                                    )}
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
                                {player.discordUsername ? (
                                  <Link 
                                    to={`/player/${player.discordUsername}`}
                                    className="text-sm text-primary hover:underline font-medium"
                                  >
                                    {player.playerName}
                                  </Link>
                                ) : (
                                  <span className="text-sm font-medium">{player.playerName}</span>
                                )}
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
                                      {member.discordUsername ? (
                                        <Link 
                                          to={`/player/${member.discordUsername}`}
                                          className="text-sm text-primary hover:underline font-medium"
                                        >
                                          {member.playerName}
                                        </Link>
                                      ) : (
                                        <span className="text-sm font-medium">{member.playerName}</span>
                                      )}
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
                                          {member.discordUsername ? (
                                            <Link 
                                              to={`/player/${member.discordUsername}`}
                                              className="text-sm text-primary hover:underline font-medium"
                                            >
                                              {member.playerName}
                                            </Link>
                                          ) : (
                                            <span className="text-sm font-medium">{member.playerName}</span>
                                          )}
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
      </div>
    </>
  );
}
