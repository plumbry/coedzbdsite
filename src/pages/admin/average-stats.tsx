import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { PlayerStatsRebuildButton } from "@/components/admin/player-stats-rebuild-button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Calendar, Target, Crosshair, TrendingUp, Activity, Medal, Users, BarChart3, TrendingDown } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Badge } from "@/components/ui/badge.tsx";
function AverageStatsContent() {
  const stats = useQuery(api.aggregateStats.getAveragePlayerStats);
  const rebuildJob = useQuery(api.aggregateStats.getRebuildJobStatus);

  const isJobRunning = rebuildJob?.status === "running";
  const rebuildProgress =
    rebuildJob && rebuildJob.totalCount > 0
      ? Math.min(
          100,
          Math.round((rebuildJob.processedCount / rebuildJob.totalCount) * 100),
        )
      : null;

  if (stats === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  if (!stats) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <p className="text-muted-foreground">No cached data available</p>
          <p className="text-sm text-muted-foreground">
            Click "Rebuild Cache" to generate aggregate statistics
          </p>
          <PlayerStatsRebuildButton
            label="Rebuild Cache"
            aggregateStatsOnly
            linkToDataCache
            disabled={isJobRunning}
          />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {stats?.lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(stats.lastUpdated).toLocaleString()}
            </p>
          )}
          {isJobRunning && rebuildProgress !== null && (
            <p className="text-xs text-muted-foreground">
              Rebuilding cache… {rebuildJob.processedCount}/{rebuildJob.totalCount}{" "}
              ({rebuildProgress}%)
            </p>
          )}
        </div>
        <PlayerStatsRebuildButton
          label="Rebuild Cache"
          aggregateStatsOnly
          linkToDataCache
          disabled={isJobRunning}
          size="sm"
          variant="outline"
        />
      </div>
      
      {/* Player Count Badge */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Active Players Analyzed</p>
              <p className="text-3xl font-bold">{stats.playerCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Average Stats Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Average Statistics</h2>
          <Badge variant="secondary" className="text-xs">
            Mean across {stats.playerCount} players
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Avg Events Played</CardTitle>
              <Calendar className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.avgTotalEvents}</div>
              <p className="text-[10px] text-muted-foreground">
                Yunite imports per player
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Avg Win Rate</CardTitle>
              <Medal className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.avgWinRate}%</div>
              <p className="text-[10px] text-muted-foreground">
                match win rate
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Avg Placement</CardTitle>
              <Target className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">#{stats.avgAveragePlacement}</div>
              <p className="text-[10px] text-muted-foreground">
                average placement
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Avg Kills per Match</CardTitle>
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.avgAverageKD}</div>
              <p className="text-[10px] text-muted-foreground">
                kills per match
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Avg Total Elims</CardTitle>
              <Crosshair className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.avgTotalEliminations}</div>
              <p className="text-[10px] text-muted-foreground">
                total eliminations
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Avg Score per Event</CardTitle>
              <Activity className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.avgAverageScore}</div>
              <p className="text-[10px] text-muted-foreground">
                points per event
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Avg Top 3 Finishes</CardTitle>
              <Medal className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.avgTop3Finishes}</div>
              <p className="text-[10px] text-muted-foreground">
                per player
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Median Stats Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Median Statistics</h2>
          <Badge variant="outline" className="text-xs">
            Median across {stats.playerCount} players
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Median Events</CardTitle>
              <Calendar className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.medianTotalEvents}</div>
              <p className="text-[10px] text-muted-foreground">
                events per player
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Median Placement</CardTitle>
              <Target className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">#{stats.medianAveragePlacement}</div>
              <p className="text-[10px] text-muted-foreground">
                average placement
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Median Score</CardTitle>
              <Activity className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.medianAverageScore}</div>
              <p className="text-[10px] text-muted-foreground">
                points per event
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-3">
              <CardTitle className="text-[10px] font-medium">Median K/M</CardTitle>
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-1 pb-2">
              <div className="text-base font-bold">{stats.medianAverageKD}</div>
              <p className="text-[10px] text-muted-foreground">
                kills per match
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Per-Tier Statistics */}
      {stats.perTierStats && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Statistics by Tier</h2>
            <Badge variant="outline" className="text-xs">
              Grouped by current tier assignment
            </Badge>
          </div>
          
          {(["S", "A", "B", "C", "D"] as const).map((tier) => {
            const tierStats = stats.perTierStats[tier];
          if (!tierStats || tierStats.playerCount === 0) {
            return null;
          }
          
          const getTierColor = (t: string) => {
            switch (t) {
              case "S": return "text-yellow-500 border-yellow-500/50 bg-yellow-500/5";
              case "A": return "text-green-500 border-green-500/50 bg-green-500/5";
              case "B": return "text-blue-500 border-blue-500/50 bg-blue-500/5";
              case "C": return "text-purple-500 border-purple-500/50 bg-purple-500/5";
              case "D": return "text-gray-500 border-gray-500/50 bg-gray-500/5";
              default: return "text-muted-foreground";
            }
          };
          
          return (
            <Card key={tier} className={`mb-4 ${getTierColor(tier)}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Medal className="h-5 w-5" />
                    Tier {tier}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {tierStats.playerCount} {tierStats.playerCount === 1 ? "player" : "players"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Avg Events</p>
                    <p className="text-lg font-bold">{tierStats.avgTotalEvents}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Avg Win Rate</p>
                    <p className="text-lg font-bold">{tierStats.avgWinRate}%</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Avg Placement</p>
                    <p className="text-lg font-bold">#{tierStats.avgAveragePlacement}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Avg K/M</p>
                    <p className="text-lg font-bold">{tierStats.avgAverageKD}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Median Events</p>
                    <p className="text-lg font-bold">{tierStats.medianTotalEvents}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Median Placement</p>
                    <p className="text-lg font-bold">#{tierStats.medianAveragePlacement}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Median Score</p>
                    <p className="text-lg font-bold">{tierStats.medianAverageScore}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Median K/M</p>
                    <p className="text-lg font-bold">{tierStats.medianAverageKD}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        </div>
      )}
      
      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            About These Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Average (Mean):</strong> The arithmetic mean of each metric across all active players with match data.
          </p>
          <p>
            <strong>Median:</strong> The middle value when all players are sorted by that metric. Less affected by outliers than the mean.
          </p>
          <p>
            <strong>Scope:</strong> Statistics include only active players with match data from Yunite API sync.
          </p>
          <p>
            <strong>Data Sources:</strong> Combined data from Yunite API sync and manual CSV imports.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AverageStats() {
  return (
    <AdminPageLayout requireAdmin
      title="Average Player Statistics"
      description="Aggregated performance metrics across all active players with match data from Yunite sync"
      authTitle="Sign in to view average statistics"
      header={{
        back: { label: "Back to Tier Re-Evaluation", href: "/admin/tier-re-evaluation" },
      }}
    >
      <AverageStatsContent />
    </AdminPageLayout>
  );
}
