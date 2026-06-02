import { Component, useEffect, useRef, useState, type ReactNode } from "react";
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
import { toast } from "sonner";

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

function DonutCard({
  title,
  description,
  data,
  total,
}: {
  title: string;
  description: string;
  data: ChartPoint[];
  total: number;
}) {
  if (data.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="py-3">
          <CardTitle className="text-base">{title}</CardTitle>
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
      <CardHeader className="py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={62}
                  outerRadius={92}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
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
            {data.map((entry) => (
              <div key={entry.label} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.label}:</span>
                <span className="font-medium">
                  {pct(entry.value, total)}% ({entry.value})
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AudienceInsightsContent() {
  const cleanupStarted = useRef(false);
  const [cleanupDone, setCleanupDone] = useState(false);
  const cleanupJobs = useMutation(api.audienceInsights.cleanupAudienceInsightsRebuildJobs);
  const insights = useQuery(
    api.audienceInsights.getAudienceInsights,
    cleanupDone ? {} : "skip",
  );
  const rebuildJob = useQuery(
    api.audienceInsights.getRebuildJobStatus,
    cleanupDone ? {} : "skip",
  );
  const rebuildCache = useMutation(api.audienceInsights.rebuildAudienceInsightsCache);

  useEffect(() => {
    if (cleanupStarted.current) return;
    cleanupStarted.current = true;
    void cleanupJobs({})
      .catch(() => {
        /* Schema repair may already be applied; still allow queries. */
      })
      .finally(() => {
        setCleanupDone(true);
      });
  }, [cleanupJobs]);

  const isJobRunning = rebuildJob?.status === "running";
  const hasCache = insights !== undefined && insights.totalMembers > 0;
  const eventsReady = insights?.eventsReady === true;
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
      toast.success("Rebuild started. Charts update when the job finishes.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start audience insights rebuild",
      );
    }
  };

  if (!cleanupDone || insights === undefined) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    );
  }

  const cacheLabel = insights.lastUpdated
    ? `Cached ${new Date(insights.lastUpdated).toLocaleString()}`
    : "Not cached yet";

  return (
    <div className="space-y-4">
      {!hasCache && (
        <Alert>
          <AlertTitle>No cached data yet</AlertTitle>
          <AlertDescription>
            This page reads from a saved cache so it loads instantly. Click Refresh stats once
            to build the cache. For accurate event counts, run the event participation backfill on
            Data Cache first, then refresh here.
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

      <Card>
        <CardContent className="pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {hasCache ? (
              <>
                Audience split for {insights.totalMembers} accepted members. {cacheLabel}.
                Loads use cached data only — nothing is recalculated on each visit.
              </>
            ) : (
              <>
                Click Refresh stats to build the cache. After the first run, this page loads from
                that cache until you refresh again.
              </>
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
          data={insights.gender}
          total={insights.totalMembers || 1}
        />
        <DonutCard
          title="Tier Split"
          description="How accepted members are distributed across tiers."
          data={insights.tier}
          total={insights.totalMembers || 1}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title="How Long Have They Been a Member?"
          description="Time in the server since Discord join date."
          data={insights.tenure}
          total={insights.totalMembers || 1}
        />
        {!eventsReady ? (
          <Card className="py-0">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Played More Than 5 Events</CardTitle>
              <CardDescription>
                {isJobRunning
                  ? "Updating…"
                  : "Refresh stats to compute from member event counts."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ) : (
          <DonutCard
            title="Played More Than 5 Events"
            description="Uses each member's events played count (backfill on Data Cache if needed)."
            data={insights.events}
            total={insights.totalMembers}
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
