import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { RefreshCw, Trophy, Target, Crosshair, TrendingUp, DollarSign, Clock, Gamepad2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

interface InGameStatsTabProps {
  epicUsername: string;
}

interface FortniteAPIData {
  stats?: Record<string, number>;
  displayName?: string;
}

interface AggregatedStats {
  wins: number;
  kills: number;
  matches: number;
  kd: string;
  winRate: string;
  top10: number;
  top25: number;
}

// Helper function to aggregate stats from the new API format
const aggregateStats = (data: FortniteAPIData): AggregatedStats => {
  const stats = data.stats || {};
  
  let totalWins = 0;
  let totalKills = 0;
  let totalMatches = 0;
  let totalTop10 = 0;
  let totalTop25 = 0;
  
  // Aggregate only Zero Build (nobuildbr) stats
  Object.entries(stats).forEach(([key, value]) => {
    if (key.includes('nobuildbr') && key.includes('_placetop1_') && !key.includes('_arena_') && !key.includes('_tournament_')) {
      totalWins += value || 0;
    }
    if (key.includes('nobuildbr') && key.includes('_kills_') && !key.includes('_arena_') && !key.includes('_tournament_')) {
      totalKills += value || 0;
    }
    if (key.includes('nobuildbr') && key.includes('_matchesplayed_') && !key.includes('_arena_') && !key.includes('_tournament_')) {
      totalMatches += value || 0;
    }
    if (key.includes('nobuildbr') && key.includes('_placetop10_') && !key.includes('_arena_') && !key.includes('_tournament_')) {
      totalTop10 += value || 0;
    }
    if (key.includes('nobuildbr') && key.includes('_placetop25_') && !key.includes('_arena_') && !key.includes('_tournament_')) {
      totalTop25 += value || 0;
    }
  });
  
  const kd = totalMatches > 0 ? (totalKills / Math.max(1, totalMatches - totalWins)).toFixed(2) : "0.00";
  const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : "0.0";
  
  return {
    wins: totalWins,
    kills: totalKills,
    matches: totalMatches,
    kd,
    winRate,
    top10: totalTop10,
    top25: totalTop25,
  };
};

export default function InGameStatsTab({ epicUsername }: InGameStatsTabProps) {
  const fetchStats = useAction(api.fortnitetracker.fetchPlayerStats);
  const [statsData, setStatsData] = useState<FortniteAPIData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Always use lifetime since season stats aren't working properly in the API

  const refreshStats = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchStats({ epicName: epicUsername, timewindow: "lifetime" });
      
      if (result.error) {
        setError(result.error);
        setStatsData(null);
      } else if (result.data) {
        setStatsData(result.data as FortniteAPIData);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err) {
      setError("Failed to load stats");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isLoading && !statsData) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  if (error && !statsData) {
    const isNotFoundError = error.includes("not found") || error.includes("404");
    
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <div>
            <p className="text-muted-foreground mb-2">{error}</p>
            {isNotFoundError && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Epic username: <span className="font-mono">{epicUsername}</span></p>
                <p className="text-xs">Verify the Epic username is correct in the player's profile.</p>
              </div>
            )}
          </div>
          <Button onClick={refreshStats} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  if (!statsData) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <p className="text-muted-foreground">
            Stats are not loaded automatically. Use Refresh to fetch from the Fortnite API (admin only).
          </p>
          <Button onClick={refreshStats} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Load Stats
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  // Aggregate stats from new API format
  const aggregated = aggregateStats(statsData);
  
  const wins = aggregated.wins.toLocaleString();
  const kills = aggregated.kills.toLocaleString();
  const kd = aggregated.kd;
  const matches = aggregated.matches.toLocaleString();
  const winRate = `${aggregated.winRate}%`;
  const top10 = aggregated.top10.toLocaleString();
  const top25 = aggregated.top25.toLocaleString();
  
  // Prepare chart data for wins breakdown
  const winsData = [
    { name: "Total Wins", value: aggregated.wins },
    { name: "Top 10s", value: aggregated.top10 },
    { name: "Top 25s", value: aggregated.top25 },
  ];
  
  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Lifetime Zero Build Stats</h3>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refreshStats}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      
      {/* Lifetime Stats */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Lifetime Wins</CardTitle>
            <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">{wins}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {winRate} win rate
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">K/D Ratio</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">{kd}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Total Kills</CardTitle>
            <Crosshair className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">{kills}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Matches Played</CardTitle>
            <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">{matches}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Top 10 Finishes</CardTitle>
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">{top10}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium">Top 25 Finishes</CardTitle>
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-3">
            <div className="text-xl font-bold">{top25}</div>
          </CardContent>
        </Card>
      </div>
      

      
      {/* Performance Chart */}
      {winsData.some(d => d.value > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={winsData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px"
                  }}
                />
                <Bar 
                  dataKey="value" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      
      {/* Data Source Note */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground text-center">
            Stats powered by api-fortnite.com • Lifetime Zero Build stats • All Platforms
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
