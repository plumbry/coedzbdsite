import { useQuery, useAction, useMutation } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { RefreshCw, DollarSign, AlertCircle, CheckCircle2, Trophy, Clock, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import SiteHeader from "@/components/site-header.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

function JobProgressBanner() {
  const job = useQuery(api.inGameEarnings.queries.getLatestFetchJob);
  const cancelJob = useMutation(api.inGameEarnings.mutations.cancelBulkFetch);

  if (!job || (job.status !== "running" && Date.now() - (job.completedAt ?? 0) > 30000)) {
    return null;
  }

  const progressPct = job.totalPlayers > 0 ? (job.processed / job.totalPlayers) * 100 : 0;
  const isRunning = job.status === "running";
  const batchesTotal = Math.ceil(job.totalPlayers / 8);
  const batchesDone = Math.ceil(job.processed / 8);

  return (
    <Card className={
      isRunning
        ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
        : job.status === "completed"
          ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
          : "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950"
    }>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />}
            {job.status === "completed" && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
            {job.status === "cancelled" && <XCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
            <span className="text-sm font-medium">
              {isRunning && `Processing batch ${batchesDone + 1} of ${batchesTotal}...`}
              {job.status === "completed" && `Completed: ${job.succeeded} succeeded, ${job.failed} failed`}
              {job.status === "cancelled" && `Cancelled after ${job.processed} of ${job.totalPlayers} players`}
              {job.status === "failed" && `Failed: ${job.lastError ?? "Unknown error"}`}
            </span>
          </div>
          {isRunning && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancelJob({ jobId: job._id })}
              className="cursor-pointer text-red-600 hover:text-red-700"
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <Progress value={progressPct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {job.processed} / {job.totalPlayers} players ({job.succeeded} ok, {job.failed} errors)
            {isRunning && " — next batch in ~65s"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InGameEarningsContent() {
  const navigate = useNavigate();
  const [isFetchingSingle, setIsFetchingSingle] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const allEarnings = useQuery(api.inGameEarnings.queries.getAllInGameEarnings);
  const newEarningsCount = useQuery(api.inGameEarnings.queries.getNewEarningsCount);
  const recentPlayers = useQuery(api.inGameEarnings.queries.getRecentlyActivePlayers);
  const latestJob = useQuery(api.inGameEarnings.queries.getLatestFetchJob);
  const fetchSingle = useAction(api.inGameEarnings.actions.fetchPlayerEarnings);
  const dismissNew = useMutation(api.inGameEarnings.mutations.dismissNewEarnings);
  const dismissAllNew = useMutation(api.inGameEarnings.mutations.dismissAllNewEarnings);
  const startBulkFetch = useMutation(api.inGameEarnings.mutations.startBulkFetch);

  const isJobRunning = latestJob?.status === "running";

  const handleStartBulkFetch = async () => {
    if (!recentPlayers || recentPlayers.length === 0) {
      toast.error("No recently active players found");
      return;
    }

    setIsStarting(true);
    try {
      await startBulkFetch({
        playerIds: recentPlayers.map((p) => p._id),
        epicUsernames: recentPlayers.map((p) => p.epicUsername),
      });
      toast.success(`Started fetching earnings for ${recentPlayers.length} recently active players`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start");
    } finally {
      setIsStarting(false);
    }
  };

  const handleFetchSingle = async (playerId: string, epicUsername: string) => {
    setIsFetchingSingle(playerId);
    try {
      const result = await fetchSingle({
        epicUsername,
        playerId: playerId as Id<"players">,
      });
      if (result.success) {
        toast.success(`Found $${result.totalEarnings?.toLocaleString()} from ${result.tournamentCount} events`);
      } else {
        toast.error(result.error ?? "Failed to fetch");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch");
    } finally {
      setIsFetchingSingle(null);
    }
  };

  const handleDismissAll = async () => {
    try {
      const result = await dismissAllNew({});
      toast.success(`Dismissed ${result.dismissed} flags`);
    } catch (error) {
      toast.error("Failed to dismiss flags");
    }
  };

  if (!allEarnings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalDollars = allEarnings.reduce((sum, e) => sum + e.totalEarnings, 0);
  const playersWithEarnings = allEarnings.filter((e) => e.totalEarnings > 0).length;

  return (
    <div className="space-y-6">
      {/* Job Progress Banner */}
      <JobProgressBanner />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalDollars.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{playersWithEarnings} players with earnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Players Tracked</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allEarnings.length}</div>
            <p className="text-xs text-muted-foreground">Players with data</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Earnings</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newEarningsCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">Since last review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eligible Players</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentPlayers?.length ?? "..."}</div>
            <p className="text-xs text-muted-foreground">Active in last 60 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleStartBulkFetch}
          disabled={isStarting || isJobRunning || !recentPlayers?.length}
          className="cursor-pointer"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isStarting ? "animate-spin" : ""}`} />
          {isJobRunning ? "Job Running..." : `Refresh ${recentPlayers?.length ?? 0} Active Players`}
        </Button>

        {(newEarningsCount ?? 0) > 0 && (
          <Button variant="secondary" onClick={handleDismissAll} className="cursor-pointer">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Dismiss All Flags
          </Button>
        )}

        {recentPlayers && (
          <p className="text-xs text-muted-foreground">
            Only players with scrim activity in the last 60 days.
            ~{Math.ceil((recentPlayers.length / 8) * 65 / 60)} min estimated.
            Uses {recentPlayers.length} of 500 monthly API calls.
          </p>
        )}
      </div>

      {/* Earnings Table */}
      {allEarnings.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><DollarSign /></EmptyMedia>
            <EmptyTitle>No earnings data yet</EmptyTitle>
            <EmptyDescription>Click the refresh button to fetch in-game tournament earnings for recently active players.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={handleStartBulkFetch} disabled={isStarting || isJobRunning} className="cursor-pointer">
              Fetch Earnings
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Player In-Game Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Total Earnings</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead>Last Fetched</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allEarnings.map((earning) => (
                  <TableRow
                    key={earning._id}
                    className={earning.hasNewEarnings ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {earning.hasNewEarnings && (
                          <Badge variant="destructive" className="text-xs px-1.5 py-0">NEW</Badge>
                        )}
                        <button
                          onClick={() => navigate(`/player/${earning.epicUsername}`)}
                          className="text-sm font-medium hover:underline cursor-pointer text-left"
                        >
                          {earning.playerName}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">{earning.epicUsername}</p>
                    </TableCell>
                    <TableCell>
                      {earning.tier && (
                        <Badge variant="secondary">{earning.tier}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      ${earning.totalEarnings.toLocaleString()}
                      {earning.hasNewEarnings && earning.previousTotalEarnings !== undefined && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          +${(earning.totalEarnings - earning.previousTotalEarnings).toLocaleString()}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {earning.tournaments.length}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(earning.lastFetchedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFetchSingle(earning.playerId, earning.epicUsername)}
                          disabled={isFetchingSingle === earning.playerId}
                          className="cursor-pointer"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isFetchingSingle === earning.playerId ? "animate-spin" : ""}`} />
                        </Button>
                        {earning.hasNewEarnings && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => dismissNew({ earningsId: earning._id })}
                            className="cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tournament Details for flagged players */}
      {allEarnings.filter((e) => e.hasNewEarnings && e.tournaments.length > 0).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>New Earnings Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allEarnings
              .filter((e) => e.hasNewEarnings && e.tournaments.length > 0)
              .map((earning) => (
                <div key={earning._id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{earning.playerName}</h4>
                    <Badge variant="destructive">NEW</Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tournament</TableHead>
                        <TableHead className="text-right">Placement</TableHead>
                        <TableHead className="text-right">Earnings</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {earning.tournaments.slice(0, 10).map((t, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{t.name}</TableCell>
                          <TableCell className="text-right">#{t.placement}</TableCell>
                          <TableCell className="text-right font-mono">${t.earnings.toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {t.date ? new Date(t.date).toLocaleDateString() : "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {earning.tournaments.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{earning.tournaments.length - 10} more tournaments
                    </p>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function InGameEarningsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">In-Game Earnings</h1>
          <p className="text-muted-foreground mt-1">
            Official Fortnite tournament earnings for players active in the last 60 days
          </p>
        </div>

        <Authenticated>
          <InGameEarningsContent />
        </Authenticated>
        <Unauthenticated>
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">Sign in to access earnings data</p>
              <SignInButton />
            </CardContent>
          </Card>
        </Unauthenticated>
        <AuthLoading>
          <Skeleton className="h-64 w-full" />
        </AuthLoading>
      </main>
    </div>
  );
}
