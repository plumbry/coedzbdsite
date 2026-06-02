import { useEffect, useRef, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

type ChartPoint = {
  label: string;
  value: number;
  color: string;
};

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
  const insights = useQuery(api.audienceInsights.getAudienceInsights);
  const rebuildCache = useMutation(api.audienceInsights.rebuildAudienceInsightsCache);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const autoRebuildStarted = useRef(false);

  const runRebuild = async () => {
    setIsRebuilding(true);
    try {
      const result = await rebuildCache({});
      toast.success(
        `Audience insights updated for ${result.playersUpdated} members`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rebuild audience insights",
      );
    } finally {
      setIsRebuilding(false);
    }
  };

  useEffect(() => {
    if (insights === undefined || insights === null) return;
    if (!insights.needsRebuild || autoRebuildStarted.current) return;
    autoRebuildStarted.current = true;
    void runRebuild();
  }, [insights]);

  if (insights === undefined) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    );
  }

  const cacheLabel = insights.lastUpdated
    ? `Last updated ${new Date(insights.lastUpdated).toLocaleString()}`
    : null;

  return (
    <div className="space-y-4">
      {insights.needsRebuild && (
        <Alert>
          <AlertTitle>Building event statistics</AlertTitle>
          <AlertDescription>
            Gender, tier, and tenure load immediately. Event counts are computed in the
            background because scanning all results in one request times out.
            {isRebuilding ? " This may take a minute…" : ""}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Audience split based on accepted members ({insights.totalMembers} total). Tenure
            uses Discord server join date. Event activity counts distinct events per member
            from result records.
            {cacheLabel ? ` ${cacheLabel}.` : ""}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runRebuild()}
            disabled={isRebuilding}
            className="shrink-0"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRebuilding ? "animate-spin" : ""}`} />
            {isRebuilding ? "Rebuilding…" : "Refresh stats"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title="Gender Split"
          description="Distribution by evaluation gender category."
          data={insights.gender}
          total={insights.totalMembers}
        />
        <DonutCard
          title="Tier Split"
          description="How accepted members are distributed across tiers."
          data={insights.tier}
          total={insights.totalMembers}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title="How Long Have They Been a Member?"
          description="Time in the server since Discord join date."
          data={insights.tenure}
          total={insights.totalMembers}
        />
        {insights.needsRebuild ? (
          <Card className="py-0">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Played More Than 5 Events</CardTitle>
              <CardDescription>Computing from event results…</CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ) : (
          <DonutCard
            title="Played More Than 5 Events"
            description="Distinct events with a recorded result for that member."
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
      description="Quick audience overview for gender, tier, tenure, and event activity."
      authTitle="Sign in to view audience insights"
    >
      <AudienceInsightsContent />
    </AdminPageLayout>
  );
}
