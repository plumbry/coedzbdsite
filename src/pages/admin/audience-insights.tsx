import { Component, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { RefreshCw } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { toast } from "sonner";
import {
  audienceSegmentPath,
  labelToSegmentKey,
  type AudienceChartType,
} from "@/lib/audience-insights-segments.ts";

type ChartPoint = {
  label: string;
  value: number;
  color: string;
};

class AudienceInsightsErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Could not load audience insights</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{this.state.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Reload page
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function chartSegments(data: ChartPoint[] | undefined): ChartPoint[] {
  return data ?? [];
}

function DonutCard({
  title,
  description,
  data,
  total,
  chartType,
  onSegmentClick,
  headerActions,
}: {
  title: string;
  description: string;
  data: ChartPoint[];
  total: number;
  chartType: AudienceChartType;
  onSegmentClick: (segmentKey: string) => void;
  headerActions?: ReactNode;
}) {
  const handleLabelClick = (label: string) => {
    const key = labelToSegmentKey(chartType, label);
    if (key) onSegmentClick(key);
  };
  const segments = chartSegments(data);
  if (segments.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="py-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            {headerActions}
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-muted-foreground py-8 text-center">
            No data yet. Use Refresh stats to build the cache.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <CardHeader className="py-3 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {headerActions}
        </div>
        <CardDescription>
          {description} Click a slice or legend item to view members.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={62}
                  outerRadius={92}
                  strokeWidth={0}
                  className="cursor-pointer outline-none"
                  onClick={(slice) => {
                    const label =
                      slice && typeof slice === "object" && "label" in slice
                        ? String(slice.label)
                        : slice &&
                            typeof slice === "object" &&
                            "payload" in slice &&
                            slice.payload &&
                            typeof slice.payload === "object" &&
                            "label" in slice.payload
                          ? String(slice.payload.label)
                          : null;
                    if (label) handleLabelClick(label);
                  }}
                >
                  {segments.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, item) => {
                    const label = item.payload?.label ?? "";
                    const percentage = pct(value, total);
                    return [`${value} (${percentage}%)`, label];
                  }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {segments.map((entry) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => handleLabelClick(entry.label)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-muted/60 transition-colors"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.label}:</span>
                <span className="font-medium">
                  {pct(entry.value, total)}% ({entry.value})
                </span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type TierMemberScope = "all" | "active";

function AudienceInsightsContent() {
  const navigate = useNavigate();
  const insights = useQuery(api.audienceInsights.getAudienceInsights);
  const [tierScope, setTierScope] = useState<TierMemberScope>("all");

  const openSegment = (
    chartType: AudienceChartType,
    segmentKey: string,
    options?: { activeOnly?: boolean },
  ) => {
    navigate(audienceSegmentPath(chartType, segmentKey, options));
  };
  const hasCache = insights !== undefined && insights.totalMembers > 0;
  const eventsReady = insights?.eventsReady === true;
  const eventCoverage = useQuery(
    api.players.getAcceptedMemberEventCountCoverage,
    insights !== undefined && !eventsReady ? {} : "skip",
  );
  const [watchRebuild, setWatchRebuild] = useState(false);
  const rebuildJob = useQuery(
    api.audienceInsights.getRebuildJobStatus,
    watchRebuild ? {} : "skip",
  );
  const rebuildCache = useMutation(api.audienceInsights.rebuildAudienceInsightsCache);
  const reconcileRebuild = useMutation(api.audienceInsights.cleanupAudienceInsightsRebuildJobs);
  const cancelRebuild = useMutation(api.audienceInsights.cancelAudienceInsightsRebuild);
  const backfillEventCounts = useMutation(
    api.cacheStatus.backfillPlayerEventParticipationStats,
  );

  const isJobRunning = rebuildJob?.status === "running";

  useEffect(() => {
    if (watchRebuild && rebuildJob === null) {
      setWatchRebuild(false);
    }
  }, [rebuildJob, watchRebuild]);

  useEffect(() => {
    if (!isJobRunning) return;
    void reconcileRebuild({});
    const intervalId = window.setInterval(() => {
      void reconcileRebuild({});
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [isJobRunning, reconcileRebuild]);

  const progressPercent =
    rebuildJob && rebuildJob.totalCount > 0
      ? Math.min(
          100,
          Math.round((rebuildJob.processedCount / rebuildJob.totalCount) * 100),
        )
      : null;

  const runRebuild = async () => {
    try {
      await rebuildCache({});
      setWatchRebuild(true);
      toast.success("Rebuild started. Charts update when the job finishes.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start audience insights rebuild",
      );
    }
  };

  const runEventCountBackfill = async () => {
    try {
      const result = await backfillEventCounts({});
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start event count backfill",
      );
    }
  };

  const runCancelRebuild = async () => {
    try {
      const result = await cancelRebuild({});
      if (result.cancelled > 0) {
        toast.success("Rebuild cancelled. You can start a new refresh.");
      } else {
        toast.message("No rebuild was running.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel audience insights rebuild",
      );
    }
  };

  const showEventBackfillHint =
    eventCoverage?.needsBackfill === true ||
    (hasCache && eventsReady && (eventCoverage?.overFiveEvents ?? 0) === 0);

  if (insights === undefined) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    );
  }

  const cacheLabel = insights.lastUpdated
    ? `Cached ${new Date(insights.lastUpdated).toLocaleString()}`
    : "Not cached yet";

  const tierActiveUsesLiveData = insights.tierActiveSource === "live";
  const tierChartData =
    tierScope === "active"
      ? chartSegments(insights.tierActive)
      : chartSegments(insights.tier);
  const tierChartTotal =
    tierScope === "active"
      ? insights.totalActiveMembers || 1
      : insights.totalMembers || 1;

  return (
    <div className="space-y-4">
      {!hasCache && (
        <Alert>
          <AlertTitle>No cached data yet</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Click Refresh stats to build the audience snapshot.</p>
            <p className="text-sm">
              Step 1: Backfill event counts (below). Step 2: Refresh stats.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {showEventBackfillHint && (
        <Alert>
          <AlertTitle>Event counts need a backfill</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              The &quot;Played more than 5 events&quot; chart uses each member&apos;s{" "}
              <strong>events played count</strong> on their player record.
              {eventCoverage && eventCoverage.needsBackfill ? (
                <>
                  {" "}
                  Many members are still missing a count (
                  {eventCoverage.withEventCount} / {eventCoverage.totalAccepted} have one).
                </>
              ) : eventCoverage && eventCoverage.overFiveEvents === 0 ? (
                <>
                  {" "}
                  Counts are set for {eventCoverage.withEventCount} /{" "}
                  {eventCoverage.totalAccepted} members, but none are above 5 yet — refresh the
                  chart after confirming backfill on Data Cache.
                </>
              ) : null}{" "}
              Until counts reflect real participation, everyone can appear in the 5-or-fewer bucket.
            </p>
            <ol className="list-decimal list-inside text-sm space-y-1">
              <li>Click Backfill event counts (runs in the background, a few minutes).</li>
              <li>When it finishes, click Refresh stats to rebuild the chart cache.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void runEventCountBackfill()}>
                Backfill event counts
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/data-cache-status">Open Data Cache</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isJobRunning && rebuildJob && (
        <Alert>
          <AlertTitle>Refreshing audience statistics</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Rebuilding in the background
              {rebuildJob.totalCount > 0
                ? ` (${rebuildJob.processedCount} / ${rebuildJob.totalCount} members)`
                : rebuildJob.processedCount > 0
                  ? ` (${rebuildJob.processedCount} members processed)`
                  : "…"}
            </p>
            {progressPercent !== null ? (
              <Progress value={progressPercent} className="h-2" />
            ) : (
              <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            )}
            {rebuildJob.appearsStuck && (
              <p className="text-sm text-muted-foreground">
                Progress has paused. The page will try to resume automatically; if nothing
                changes after a few minutes, cancel and click Refresh stats again.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => void runCancelRebuild()}>
                Cancel rebuild
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!eventsReady && hasCache && !isJobRunning && (
        <Alert>
          <AlertTitle>Event chart needs a refresh</AlertTitle>
          <AlertDescription>
            Gender, tier, and tenure are cached. Click Refresh stats to rebuild all charts.
          </AlertDescription>
        </Alert>
      )}

      {hasCache && tierActiveUsesLiveData && !isJobRunning && (
        <Alert>
          <AlertTitle>Active tier split is live-calculated</AlertTitle>
          <AlertDescription>
            The chart uses current player activity flags. Click Refresh stats once to cache active
            tier data and speed up segment member lists.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {hasCache ? (
              <>
                Audience split for {insights.totalMembers} accepted members. {cacheLabel}.
              </>
            ) : (
              <>Click Refresh stats to build the snapshot.</>
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runRebuild()}
            disabled={isJobRunning}
            className="shrink-0"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isJobRunning ? "animate-spin" : ""}`} />
            {isJobRunning ? "Refreshing…" : "Refresh stats"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title="Gender Split"
          description="Distribution by evaluation gender category."
          data={chartSegments(insights.gender)}
          total={insights.totalMembers || 1}
          chartType="gender"
          onSegmentClick={(key) => openSegment("gender", key)}
        />
        <DonutCard
          title="Tier Split"
          description={
            tierScope === "active"
              ? "Active members (played in the last 6 weeks) by tier."
              : "How accepted members are distributed across tiers."
          }
          data={tierChartData}
          total={tierChartTotal}
          chartType="tier"
          onSegmentClick={(key) =>
            openSegment("tier", key, {
              activeOnly: tierScope === "active",
            })
          }
          headerActions={
            <ToggleGroup
              type="single"
              value={tierScope}
              onValueChange={(value) => {
                if (value === "all" || value === "active") setTierScope(value);
              }}
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!hasCache}
            >
              <ToggleGroupItem value="all" aria-label="All members">
                All Members
              </ToggleGroupItem>
              <ToggleGroupItem value="active" aria-label="Active members">
                Active Members
              </ToggleGroupItem>
            </ToggleGroup>
          }
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title="How Long Have They Been a Member?"
          description="Time in the server since Discord join date."
          data={chartSegments(insights.tenure)}
          total={insights.totalMembers || 1}
          chartType="tenure"
          onSegmentClick={(key) => openSegment("tenure", key)}
        />
        {!eventsReady ? (
          <Card className="py-0">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Played More Than 5 Events</CardTitle>
              <CardDescription>
                {isJobRunning ? "Updating…" : "Refresh stats after Data Cache backfill."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ) : (
          <DonutCard
            title="Played More Than 5 Events"
            description="Uses each member's lifetime events played count."
            data={chartSegments(insights.events)}
            total={insights.totalMembers}
            chartType="events"
            onSegmentClick={(key) => openSegment("events", key)}
          />
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {!hasCache ? (
          <Card className="py-0">
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                Played More Than 3 Scrim Leaderboards in the Last 4 Weeks
              </CardTitle>
              <CardDescription>Refresh stats to build the cache.</CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ) : (
          <DonutCard
            title="Played More Than 3 Scrim Leaderboards in the Last 4 Weeks"
            description="Each Yunite leaderboard on a scrim event counts separately (one calendar scrim can have many leaderboards), dated within the last 4 weeks."
            data={chartSegments(insights.recentEvents)}
            total={insights.totalMembers || 1}
            chartType="recentEvents"
            onSegmentClick={(key) => openSegment("recentEvents", key)}
          />
        )}
      </div>
    </div>
  );
}

export default function AudienceInsightsPage() {
  return (
    <AdminPageLayout
      requireAdmin
      title="Audience Insights"
      description="Cached audience overview — refresh when you want updated numbers."
      authTitle="Sign in to view audience insights"
    >
      <AudienceInsightsErrorBoundary>
        <AudienceInsightsContent />
      </AudienceInsightsErrorBoundary>
    </AdminPageLayout>
  );
}
