import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";

// Tier color mapping
const TIER_COLORS: Record<string, string> = {
  S: "#ef4444", // red
  A: "#f59e0b", // amber
  B: "#3b82f6", // blue
  C: "#22c55e", // green
  Unknown: "#6b7280", // gray
};

const TIER_ORDER = ["S", "A", "B", "C"];

function TierImpactContent() {
  const [hideNoMoney, setHideNoMoney] = useState(false);
  const [hideReload, setHideReload] = useState(false);
  const [last90Days, setLast90Days] = useState(false);

  const data = useQuery(api.leaderboardStats.getTierImpactStats, {
    hideNoMoney,
    hideReload,
    last90Days,
  });

  if (data === undefined) {
    return (
      <div className="flex-1 p-6 space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex-1 p-6">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const { impactMetrics, perEventData, totalEvents, tierPopulation, totalPopulation } = data;

  return (
    <div className="space-y-4 overflow-y-auto">
      {/* Filters */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hideNoMoney"
            checked={hideNoMoney}
            onCheckedChange={(checked) => setHideNoMoney(checked === true)}
          />
          <Label htmlFor="hideNoMoney" className="cursor-pointer text-sm">
            Hide No Money Events
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hideReload"
            checked={hideReload}
            onCheckedChange={(checked) => setHideReload(checked === true)}
          />
          <Label htmlFor="hideReload" className="cursor-pointer text-sm">
            Hide Reload Events
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="last90Days"
            checked={last90Days}
            onCheckedChange={(checked) => setLast90Days(checked === true)}
          />
          <Label htmlFor="last90Days" className="cursor-pointer text-sm">
            Last 90 Days
          </Label>
        </div>
        <span className="text-xs text-muted-foreground">
          {totalEvents} events analyzed
        </span>
      </div>

      {/* Impact Index Cards */}
      <ImpactCards impactMetrics={impactMetrics} />

      {/* Representation Index (relativity stat) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RepresentationIndexChart
          impactMetrics={impactMetrics}
          tierPopulation={tierPopulation}
          totalPopulation={totalPopulation}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <LobbyVsTopShareChart impactMetrics={impactMetrics} />
        <ImpactIndexChart impactMetrics={impactMetrics} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AvgPlacementOverTimeChart perEventData={perEventData} />
        <Top5CompositionChart perEventData={perEventData} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AvgElimsChart impactMetrics={impactMetrics} />
        <TierPresenceOverTimeChart perEventData={perEventData} />
      </div>
    </div>
  );
}

// --- Impact summary cards ---

type ImpactMetric = {
  lobbyShare: number;
  top3Share: number;
  top5Share: number;
  impactIndex3: number;
  impactIndex5: number;
  avgPlacement: number;
  avgElims: number;
  totalAppearances: number;
  totalTop3: number;
  totalTop5: number;
  eventCount: number;
};

function ImpactCards({ impactMetrics }: { impactMetrics: Record<string, ImpactMetric> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {TIER_ORDER.map((tier) => {
        const m = impactMetrics[tier];
        if (!m) return null;
        const indexLabel = m.impactIndex5 > 1 ? "over-represented" : "under-represented";
        return (
          <Card key={tier}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: TIER_COLORS[tier] }}
                />
                Tier {tier}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold">{m.impactIndex5}x</div>
              <p className="text-xs text-muted-foreground">
                Top 5 impact ({indexLabel})
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-sm">
                <span className="text-muted-foreground">Lobby</span>
                <span className="font-medium text-right">{m.lobbyShare}%</span>
                <span className="text-muted-foreground">Top 5</span>
                <span className="font-medium text-right">{m.top5Share}%</span>
                <span className="text-muted-foreground">Avg Place</span>
                <span className="font-medium text-right">{m.avgPlacement}</span>
                <span className="text-muted-foreground">Avg Elims</span>
                <span className="font-medium text-right">{m.avgElims}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// --- Lobby share vs Top 5 share bar chart ---

function LobbyVsTopShareChart({ impactMetrics }: { impactMetrics: Record<string, ImpactMetric> }) {
  const chartData = TIER_ORDER
    .filter((t) => impactMetrics[t])
    .map((tier) => ({
      tier: `Tier ${tier}`,
      "Lobby %": impactMetrics[tier].lobbyShare,
      "Top 5 %": impactMetrics[tier].top5Share,
      "Top 3 %": impactMetrics[tier].top3Share,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lobby Share vs Top Placement Share</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="tier" className="text-xs" />
            <YAxis unit="%" className="text-xs" />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend />
            <Bar dataKey="Lobby %" fill="#6b7280" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Top 5 %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Top 3 %" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Impact Index bar chart ---

function ImpactIndexChart({ impactMetrics }: { impactMetrics: Record<string, ImpactMetric> }) {
  const chartData = TIER_ORDER
    .filter((t) => impactMetrics[t])
    .map((tier) => ({
      tier: `Tier ${tier}`,
      "Top 5 Impact": impactMetrics[tier].impactIndex5,
      "Top 3 Impact": impactMetrics[tier].impactIndex3,
      fill: TIER_COLORS[tier],
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Impact Index
          <span className="text-sm font-normal text-muted-foreground ml-2">
            (1.0 = expected, &gt;1.0 = over-performs)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="tier" className="text-xs" />
            <YAxis className="text-xs" domain={[0, "auto"]} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value: number) => [`${value}x`, ""]}
            />
            <Legend />
            <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "Expected", position: "right", fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <Bar dataKey="Top 5 Impact" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Top 3 Impact" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Average placement by tier over time (line chart) ---

type PerEventDataItem = {
  eventName: string;
  eventDate: string;
  eventType: string;
  totalPlayers: number;
  tierStats: Record<string, { count: number; top3: number; top5: number; totalPlacement: number; totalElims: number }>;
};

function AvgPlacementOverTimeChart({ perEventData }: { perEventData: PerEventDataItem[] }) {
  const chartData = useMemo(() => {
    // Use a rolling average of 3 events for smoother lines
    return perEventData.map((evt, idx) => {
      const window = perEventData.slice(Math.max(0, idx - 2), idx + 1);
      const point: Record<string, string | number> = {
        date: new Date(evt.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };

      for (const tier of TIER_ORDER) {
        let totalPlacement = 0;
        let totalCount = 0;
        for (const w of window) {
          const stats = w.tierStats[tier];
          if (stats && stats.count > 0) {
            totalPlacement += stats.totalPlacement;
            totalCount += stats.count;
          }
        }
        point[`Tier ${tier}`] = totalCount > 0 ? Math.round((totalPlacement / totalCount) * 10) / 10 : 0;
      }
      return point;
    });
  }, [perEventData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Avg Placement by Tier Over Time
          <span className="text-sm font-normal text-muted-foreground ml-2">(3-event rolling avg)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" interval="preserveStartEnd" />
            <YAxis reversed className="text-xs" label={{ value: "Placement", angle: -90, position: "insideLeft", style: { fill: "hsl(var(--muted-foreground))", fontSize: 11 } }} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend />
            {TIER_ORDER.map((tier) => (
              <Line
                key={tier}
                type="monotone"
                dataKey={`Tier ${tier}`}
                stroke={TIER_COLORS[tier]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Top 5 composition stacked area chart ---

function Top5CompositionChart({ perEventData }: { perEventData: PerEventDataItem[] }) {
  const chartData = useMemo(() => {
    return perEventData.map((evt) => {
      const totalTop5 = TIER_ORDER.reduce((sum, tier) => sum + (evt.tierStats[tier]?.top5 || 0), 0);
      const point: Record<string, string | number> = {
        date: new Date(evt.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };

      for (const tier of TIER_ORDER) {
        const top5 = evt.tierStats[tier]?.top5 || 0;
        point[`Tier ${tier}`] = totalTop5 > 0 ? Math.round((top5 / totalTop5) * 100) : 0;
      }
      return point;
    });
  }, [perEventData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 5 Composition by Tier (%)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" interval="preserveStartEnd" />
            <YAxis unit="%" className="text-xs" />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value: number) => [`${value}%`, ""]}
            />
            <Legend />
            {[...TIER_ORDER].reverse().map((tier) => (
              <Area
                key={tier}
                type="monotone"
                dataKey={`Tier ${tier}`}
                stackId="1"
                stroke={TIER_COLORS[tier]}
                fill={TIER_COLORS[tier]}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Avg elims per tier bar chart ---

function AvgElimsChart({ impactMetrics }: { impactMetrics: Record<string, ImpactMetric> }) {
  const chartData = TIER_ORDER
    .filter((t) => impactMetrics[t])
    .map((tier) => ({
      tier: `Tier ${tier}`,
      "Avg Elims": impactMetrics[tier].avgElims,
      fill: TIER_COLORS[tier],
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Average Eliminations per Event by Tier</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="tier" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Bar dataKey="Avg Elims" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Representation Index chart (relativity stat) ---

function RepresentationIndexChart({
  impactMetrics,
  tierPopulation,
  totalPopulation,
}: {
  impactMetrics: Record<string, ImpactMetric>;
  tierPopulation: Record<string, number>;
  totalPopulation: number;
}) {
  const chartData = TIER_ORDER
    .filter((t) => impactMetrics[t])
    .map((tier) => {
      const poolShare = totalPopulation > 0 ? (tierPopulation[tier] / totalPopulation) * 100 : 0;
      const lobbyShare = impactMetrics[tier].lobbyShare;
      const top3Share = impactMetrics[tier].top3Share;
      const lobbyRepIndex = poolShare > 0 ? Math.round((lobbyShare / poolShare) * 100) / 100 : 0;
      const top3RepIndex = poolShare > 0 ? Math.round((top3Share / poolShare) * 100) / 100 : 0;

      return {
        tier: `Tier ${tier}`,
        "Player Pool %": Math.round(poolShare * 10) / 10,
        "Lobby Share %": lobbyShare,
        "Top 3 Share %": top3Share,
        lobbyRepIndex,
        top3RepIndex,
        fill: TIER_COLORS[tier],
        playerCount: tierPopulation[tier],
        lobbyCount: impactMetrics[tier].totalAppearances,
      };
    });

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>
          Representation Index
          <span className="text-sm font-normal text-muted-foreground ml-2">
            (Share / Player Pool Share &mdash; 1.0 = proportional, &gt;1.0 = over-represented)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {chartData.map((d) => {
            return (
              <div
                key={d.tier}
                className="rounded-lg border p-3 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: d.fill }}
                  />
                  <span className="font-medium text-sm">{d.tier}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs pt-1">
                  <span className="text-muted-foreground">Pool</span>
                  <span className="text-right font-medium">{d["Player Pool %"]}% ({d.playerCount})</span>
                  <span className="text-muted-foreground">Lobby</span>
                  <span className="text-right font-medium">{d["Lobby Share %"]}%</span>
                  <span className="text-muted-foreground">Top 3</span>
                  <span className="text-right font-medium">{d["Top 3 Share %"]}%</span>
                </div>
              </div>
            );
          })}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="tier" className="text-xs" />
            <YAxis unit="%" className="text-xs" />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend />
            <Bar dataKey="Player Pool %" fill="#6b7280" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Lobby Share %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Top 3 Share %" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Tier presence over time (stacked area chart) ---

function TierPresenceOverTimeChart({ perEventData }: { perEventData: PerEventDataItem[] }) {
  const chartData = useMemo(() => {
    return perEventData.map((evt) => {
      const point: Record<string, string | number> = {
        date: new Date(evt.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };

      for (const tier of TIER_ORDER) {
        const count = evt.tierStats[tier]?.count || 0;
        point[`Tier ${tier}`] = evt.totalPlayers > 0
          ? Math.round((count / evt.totalPlayers) * 100)
          : 0;
      }
      return point;
    });
  }, [perEventData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lobby Tier Mix Over Time (%)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" interval="preserveStartEnd" />
            <YAxis unit="%" className="text-xs" />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value: number) => [`${value}%`, ""]}
            />
            <Legend />
            {[...TIER_ORDER].reverse().map((tier) => (
              <Area
                key={tier}
                type="monotone"
                dataKey={`Tier ${tier}`}
                stackId="1"
                stroke={TIER_COLORS[tier]}
                fill={TIER_COLORS[tier]}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function TierImpactPage() {
  return (
    <AdminPageLayout requireAdmin
      title="Tier Impact Analytics"
      description="How much does each tier actually dominate your leaderboards?"
      authTitle="Sign in to view tier impact analytics"
    >
      <TierImpactContent />
    </AdminPageLayout>
  );
}
