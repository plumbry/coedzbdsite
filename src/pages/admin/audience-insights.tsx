import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type ChartPoint = {
  label: string;
  value: number;
  color: string;
};

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

const TENURE_BUCKETS = [
  { key: "under3m", label: "Under 3 months", color: "#4f46e5" },
  { key: "3to6m", label: "3–6 months", color: "#22c55e" },
  { key: "6to12m", label: "6–12 months", color: "#f59e0b" },
  { key: "1to2y", label: "1–2 years", color: "#ef4444" },
  { key: "2yPlus", label: "2+ years", color: "#8b5cf6" },
  { key: "unknown", label: "Unknown", color: "#6b7280" },
] as const;

function monthsSinceJoin(serverJoinDate: string): number | null {
  const joined = new Date(serverJoinDate);
  if (Number.isNaN(joined.getTime())) return null;
  const now = new Date();
  const months =
    (now.getFullYear() - joined.getFullYear()) * 12 +
    (now.getMonth() - joined.getMonth());
  const dayAdjust = now.getDate() < joined.getDate() ? -1 : 0;
  return Math.max(0, months + dayAdjust);
}

function tenureBucketKey(months: number | null): (typeof TENURE_BUCKETS)[number]["key"] {
  if (months === null) return "unknown";
  if (months < 3) return "under3m";
  if (months < 6) return "3to6m";
  if (months < 12) return "6to12m";
  if (months < 24) return "1to2y";
  return "2yPlus";
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
  const members = useQuery(api.memberManagement.getAcceptedMembers);

  const chartData = useMemo(() => {
    if (!members) return null;

    let male = 0;
    let female = 0;
    let genderUnknown = 0;

    let tierS = 0;
    let tierA = 0;
    let tierB = 0;
    let tierC = 0;
    let tierOther = 0;

    let eventsOverFive = 0;
    let eventsFiveOrLess = 0;

    const tenureCounts = Object.fromEntries(
      TENURE_BUCKETS.map((bucket) => [bucket.key, 0]),
    ) as Record<(typeof TENURE_BUCKETS)[number]["key"], number>;

    for (const member of members) {
      if (member.gender === 100) male += 1;
      else if (member.gender === 50) female += 1;
      else genderUnknown += 1;

      if (member.tier === "S") tierS += 1;
      else if (member.tier === "A") tierA += 1;
      else if (member.tier === "B") tierB += 1;
      else if (member.tier === "C") tierC += 1;
      else tierOther += 1;

      const eventsPlayedCount = member.eventsPlayedCount ?? 0;
      if (eventsPlayedCount > 5) eventsOverFive += 1;
      else eventsFiveOrLess += 1;

      const bucket = tenureBucketKey(monthsSinceJoin(member.serverJoinDate));
      tenureCounts[bucket] += 1;
    }

    return {
      totalMembers: members.length,
      gender: [
        { label: "Male", value: male, color: "#4f46e5" },
        { label: "Female", value: female, color: "#22c55e" },
        { label: "Unknown", value: genderUnknown, color: "#ef4444" },
      ].filter((item) => item.value > 0),
      tier: [
        { label: "Tier S", value: tierS, color: "#ef4444" },
        { label: "Tier A", value: tierA, color: "#f59e0b" },
        { label: "Tier B", value: tierB, color: "#3b82f6" },
        { label: "Tier C", value: tierC, color: "#22c55e" },
        { label: "Unassigned", value: tierOther, color: "#6b7280" },
      ].filter((item) => item.value > 0),
      events: [
        { label: "> 5 Events", value: eventsOverFive, color: "#4f46e5" },
        { label: "<= 5 Events", value: eventsFiveOrLess, color: "#16a34a" },
      ],
      tenure: TENURE_BUCKETS.map((bucket) => ({
        label: bucket.label,
        value: tenureCounts[bucket.key],
        color: bucket.color,
      })).filter((item) => item.value > 0),
    };
  }, [members]);

  if (members === undefined || !chartData) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Audience split based on accepted members ({chartData.totalMembers} total). Tenure uses
            Discord server join date. Event activity uses cached event counts (more than 5 events).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title="Gender Split"
          description="Distribution by evaluation gender category."
          data={chartData.gender}
          total={chartData.totalMembers}
        />
        <DonutCard
          title="Tier Split"
          description="How accepted members are distributed across tiers."
          data={chartData.tier}
          total={chartData.totalMembers}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title="How Long Have They Been a Member?"
          description="Time in the server since Discord join date."
          data={chartData.tenure}
          total={chartData.totalMembers}
        />
        <DonutCard
          title="Played More Than 5 Events"
          description="Experience split by total number of events played."
          data={chartData.events}
          total={chartData.totalMembers}
        />
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
