import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { toast } from "sonner";

type SortField =
  | "playerName"
  | "tier"
  | "totalEvents"
  | "holisticScore"
  | "placementScore"
  | "winRateScore"
  | "killsScore"
  | "deathsScore"
  | "avgPlacement"
  | "winRate"
  | "killsPerMatch"
  | "deathsPerMatch"
  | "vsSameTier"
  | "vsAbove"
  | "vsBelow"
  | "rawHolisticScore"
  | "rawAvgPlacement"
  | "avgTeammateTier"
  | "tierGapAdjustment";
type SortDirection = "asc" | "desc";

type ColumnId =
  | "playerName"
  | "tier"
  | "totalEvents"
  | "holisticScore"
  | "placementScore"
  | "winRateScore"
  | "killsScore"
  | "deathsScore"
  | "avgPlacement"
  | "winRate"
  | "killsPerMatch"
  | "deathsPerMatch"
  | "vsSameTier"
  | "vsAbove"
  | "vsBelow"
  | "rawHolisticScore"
  | "rawAvgPlacement"
  | "avgTeammateTier"
  | "tierGapAdjustment";

function HolisticScoreStatsContent() {
  const { isAdmin, isModeratorOrAdmin } = useUserRole();
  const canView = isModeratorOrAdmin;

  const cachedData = useQuery(
    api.tierReEvaluation.getCachedTierReEvaluationData,
    canView ? {} : "skip"
  );

  const rebuildCache = useMutation(api.tierReEvaluation.rebuildTierReEvaluationCache);
  const initializeBatch = useMutation(api.tierReEvaluationBatched.initializeBatchRebuild);
  const clearHolisticCache = useMutation(api.tierReEvaluationBatched.clearCache);
  const processBatch = useMutation(api.tierReEvaluationBatched.processBatch);
  const finalizeRecent = useMutation(api.tierReEvaluationBatched.finalizeRecentComparisons);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  const [sortField, setSortField] = useState<SortField>("holisticScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [hideInsufficientData, setHideInsufficientData] = useState(true);
  const [applyTCDCA, setApplyTCDCA] = useState(false); // Display-time toggle
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  // Always fetch players for TC/DCA lookup (skip when toggle is off or no cached data)
  const allPlayers = useQuery(
    api.players.getPlayers,
    applyTCDCA && cachedData ? {} : "skip"
  );

  // Column visibility and order
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnId, boolean>>({
    playerName: true,
    tier: true,
    totalEvents: true,
    holisticScore: true,
    placementScore: true,
    winRateScore: true,
    killsScore: true,
    deathsScore: true,
    avgPlacement: true,
    winRate: true,
    killsPerMatch: true,
    deathsPerMatch: true,
    vsSameTier: true,
    vsAbove: true,
    vsBelow: true,
    rawHolisticScore: false,
    rawAvgPlacement: false,
    avgTeammateTier: false,
    tierGapAdjustment: false,
  });



  const handleRebuildCache = async () => {
    setIsRebuilding(true);
    setBatchProgress(null);
    
    try {
      // Always use batched rebuild to store RAW scores
      // TC/DCA is applied at display time, not during rebuild
      await clearHolisticCache({});
      const { totalPlayers, batchCount } = await initializeBatch({});

      toast.success(`Starting rebuild: ${totalPlayers} players in ${batchCount} batches`);

      // Process each batch
      for (let i = 0; i < batchCount; i++) {
        setBatchProgress({ current: i + 1, total: batchCount });
        
        await processBatch({
          batchNumber: i,
        });
      }

      // Finalize 6-week comparisons
      await finalizeRecent({});

      setBatchProgress(null);
      toast.success(`Cache rebuilt successfully! Processed ${totalPlayers} players.`);
    } catch (error) {
      toast.error("Failed to rebuild cache: " + (error as Error).message);
      setBatchProgress(null);
    } finally {
      setIsRebuilding(false);
    }
  };

  // Show loading while checking permissions
  if (isModeratorOrAdmin === undefined) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Redirect users without permission
  if (!canView) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            This page is only accessible to administrators and moderators.
          </p>
          <Link to="/">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      // Placement fields sort ascending by default (lower is better)
      setSortDirection((field === "avgPlacement" || field === "rawAvgPlacement") ? "asc" : "desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 inline" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4 inline" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 inline" />
    );
  };

  if (!cachedData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">Holistic Score Statistics</h1>
          </div>
          <p className="text-muted-foreground">
            Comprehensive holistic scores and component breakdowns for all players
          </p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">No Cached Data Available</CardTitle>
            <CardDescription className="text-xs">
              Click "Build Cache" below to generate holistic score statistics. This may take 30-60 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 py-3">
            {isAdmin && (
              <Button
                onClick={handleRebuildCache}
                disabled={isRebuilding}
              >
                {isRebuilding ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    {batchProgress 
                      ? `Processing Batch ${batchProgress.current}/${batchProgress.total}...`
                      : "Building Cache..."}
                  </>
                ) : (
                  "Build Cache"
                )}
              </Button>
            )}
            {!isAdmin && (
              <p className="text-sm text-muted-foreground">
                Please ask an administrator to build the cache.
              </p>
            )}
            <div className="pt-4">
              <Link to="/admin/tier-re-evaluation">
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Tier Re-Evaluation
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if evaluations exist
  if (!cachedData.evaluations || cachedData.evaluations.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">Holistic Score Statistics</h1>
          </div>
          <p className="text-muted-foreground">
            Comprehensive holistic scores and component breakdowns for all players
          </p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">No Player Data Available</CardTitle>
            <CardDescription className="text-xs">
              No players found in the cached data. Try rebuilding the cache.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 py-3">
            {isAdmin && (
              <Button
                onClick={handleRebuildCache}
                disabled={isRebuilding}
              >
                {isRebuilding ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    {batchProgress 
                      ? `Processing Batch ${batchProgress.current}/${batchProgress.total}...`
                      : "Rebuilding Cache..."}
                  </>
                ) : (
                  "Rebuild Cache"
                )}
              </Button>
            )}
            <div className="pt-4">
              <Link to="/admin/tier-re-evaluation">
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Tier Re-Evaluation
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Apply TC/DCA multipliers at display time if enabled
  const displayData = cachedData.evaluations.map((evaluation) => {
    if (!applyTCDCA || !allPlayers) {
      return evaluation;
    }

    // Find player data for TC/DCA
    const player = allPlayers.find((p) => p._id === evaluation.playerId);
    // Use || instead of ?? to treat 0 as invalid (defaults to 1.0)
    const tc = player?.contributionScore?.score || 1.0;
    const dca = player?.dcaCache?.dca || 1.0;
    const multiplier = tc * dca;

    // Apply multiplier to holistic score and its components
    return {
      ...evaluation,
      holisticScore: evaluation.holisticScore * multiplier,
      placementScore: evaluation.placementScore * multiplier,
      winRateScore: evaluation.winRateScore * multiplier,
      killsScore: evaluation.killsScore * multiplier,
      deathsScore: evaluation.deathsScore ? evaluation.deathsScore * multiplier : evaluation.deathsScore,
    };
  });

  // Filter by tier
  let filteredData = displayData;
  if (tierFilter !== "all") {
    filteredData = filteredData.filter((e) => e.tier === tierFilter);
  }
  
  // Filter out players with insufficient data if enabled
  if (hideInsufficientData) {
    filteredData = filteredData.filter((e) => e.totalEvents >= 8);
  }

  // Sort the data
  const sortedData = [...filteredData].sort((a, b) => {
    let aVal: string | number = "";
    let bVal: string | number = "";

    switch (sortField) {
      case "playerName":
        aVal = a.playerName;
        bVal = b.playerName;
        break;
      case "tier":
        aVal = a.tier;
        bVal = b.tier;
        break;
      case "totalEvents":
        aVal = a.totalEvents;
        bVal = b.totalEvents;
        break;
      case "holisticScore":
        aVal = a.holisticScore;
        bVal = b.holisticScore;
        break;
      case "placementScore":
        aVal = a.placementScore;
        bVal = b.placementScore;
        break;
      case "winRateScore":
        aVal = a.winRateScore;
        bVal = b.winRateScore;
        break;
      case "killsScore":
        aVal = a.killsScore;
        bVal = b.killsScore;
        break;
      case "deathsScore":
        aVal = a.deathsScore ?? -999;
        bVal = b.deathsScore ?? -999;
        break;
      case "avgPlacement":
        aVal = a.avgPlacement;
        bVal = b.avgPlacement;
        break;
      case "winRate":
        aVal = a.winRate;
        bVal = b.winRate;
        break;
      case "killsPerMatch":
        aVal = a.killsPerMatch;
        bVal = b.killsPerMatch;
        break;
      case "deathsPerMatch":
        aVal = a.deathsPerMatch ?? -999;
        bVal = b.deathsPerMatch ?? -999;
        break;
      case "vsSameTier":
        aVal = a.holisticVsSameTier ?? -999;
        bVal = b.holisticVsSameTier ?? -999;
        break;
      case "vsAbove":
        aVal = a.promotionDiff ?? -999;
        bVal = b.promotionDiff ?? -999;
        break;
      case "vsBelow":
        aVal = a.demotionDiff ?? -999;
        bVal = b.demotionDiff ?? -999;
        break;
      case "rawHolisticScore":
        aVal = a.rawHolisticScore ?? a.holisticScore ?? 0;
        bVal = b.rawHolisticScore ?? b.holisticScore ?? 0;
        break;
      case "rawAvgPlacement":
        aVal = a.rawAvgPlacement ?? a.avgPlacement ?? 99;
        bVal = b.rawAvgPlacement ?? b.avgPlacement ?? 99;
        break;
      case "avgTeammateTier":
        aVal = a.avgTeammateTier ?? 0;
        bVal = b.avgTeammateTier ?? 0;
        break;
      case "tierGapAdjustment":
        aVal = a.tierGapAdjustment ?? 1.0;
        bVal = b.tierGapAdjustment ?? 1.0;
        break;
    }

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    } else {
      return sortDirection === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }
  });

  return (
    <div className="container mx-auto px-4 py-4 max-w-[1600px] space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">Holistic Score Statistics</h1>
            {cachedData && 'lastUpdated' in cachedData && (
              <Badge variant="outline" className="text-xs">
                Cached: {new Date(cachedData.lastUpdated).toLocaleString()}
              </Badge>
            )}
            {applyTCDCA && (
              <Badge variant="secondary" className="text-xs">
                TC/DCA Applied
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Comprehensive holistic scores and component breakdowns for all players
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && cachedData && (
            <Button
              onClick={handleRebuildCache}
              disabled={isRebuilding}
              variant="outline"
              size="sm"
            >
              {isRebuilding ? (
                <>
                  <Spinner className="mr-2 h-3 w-3" />
                  {batchProgress 
                    ? `Batch ${batchProgress.current}/${batchProgress.total}`
                    : "Rebuilding..."}
                </>
              ) : (
                "Rebuild Cache"
              )}
            </Button>
          )}
          <Link to="/admin/tier-re-evaluation">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
      </div>

      {/* Explanation Cards */}
      <Collapsible open={isExplanationOpen} onOpenChange={setIsExplanationOpen}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">Score Calculation & Adjustments</h3>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {isExplanationOpen ? (
                <>
                  Hide Details <ChevronUp className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Show Details <ChevronDown className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Left card: Component explanations */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">How Holistic Score is Calculated</CardTitle>
                <CardDescription className="text-xs">
                  A comprehensive 0-100 performance metric combining four equally-weighted components
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="font-semibold mb-1">📍 Placement Score (25%)</h4>
                  <p className="text-sm text-muted-foreground">
                    Based on average placement. Normalized so 1st place = 100 points, 50th place = 0 points.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Formula: (50 - avgPlacement) × 2
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">🏆 Win Rate Score (25%)</h4>
                  <p className="text-sm text-muted-foreground">
                    Based on percentage of games won. Amplified 7.5× since most win rates are under 10%.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Formula: min(100, winRate × 7.5)
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">💀 Kills Score (25%)</h4>
                  <p className="text-sm text-muted-foreground">
                    Based on average kills per match. Normalized so 5+ kills = 100 points (excellent performance).
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Formula: min(100, (killsPerMatch / 5) × 100)
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">⚰️ Deaths Score (25%)</h4>
                  <p className="text-sm text-muted-foreground">
                    Based on average deaths per match. Normalized so 0 deaths = 100 points, 3+ deaths = 0 points (lower is better).
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Formula: (3 - deathsPerMatch) × 33.33
                  </p>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium">
                    <strong>Final Score:</strong> Average of all four component scores (0-100 scale)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only players with match data are included in holistic scores
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Right card: Tier-Gap Adjustment Legend */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-amber-600 dark:text-amber-400">⚖️ Tier-Gap Adjustments</CardTitle>
                <CardDescription className="text-xs">
                  Applied to B & C tier players (≥8 events) to reduce carry inflation when playing with higher-tier teammates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Adjustment Factors:</p>
                  <div className="space-y-1 mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tier Gap ≥ 3:</span>
                      <Badge variant="outline" className="text-amber-600 border-amber-600 font-mono">
                        ×0.45
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tier Gap ≥ 2:</span>
                      <Badge variant="outline" className="text-amber-600 border-amber-600 font-mono">
                        ×0.60
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tier Gap ≥ 1:</span>
                      <Badge variant="outline" className="text-amber-600 border-amber-600 font-mono">
                        ×0.75
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tier Gap &lt; 1:</span>
                      <Badge variant="outline" className="font-mono">
                        ×1.00
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium mb-1">How it works:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Calculates avg tier of all teammates</li>
                    <li>Compares to player's tier</li>
                    <li>Adjusts placement score downward</li>
                    <li>C-tier with 2.8+ avg teammates: placement capped at 40</li>
                    <li>Reduces holistic score accordingly</li>
                  </ul>
                </div>
                
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium">View Adjustments:</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Toggle "Raw Holistic", "Raw Place", "Avg Teammate", and "Adjustment" columns to see the impact
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sortedData.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Holistic Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sortedData.length > 0 ? (
                sortedData.reduce((sum, p) => sum + p.holisticScore, 0) /
                sortedData.length
              ).toFixed(1) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Highest Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sortedData.length > 0 ? Math.max(...sortedData.map((p) => p.holisticScore)).toFixed(1) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lowest Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sortedData.length > 0 ? Math.min(...sortedData.map((p) => p.holisticScore)).toFixed(1) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Medians Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tier Medians (Reference)</CardTitle>
          <CardDescription className="text-xs">
            Median holistic scores for each tier
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            {(["S", "A", "B", "C"] as const).map((tier) => {
              const tierHolistic = cachedData?.tierHolisticMedians as Record<string, number> | undefined;
              const value = tierHolistic?.[tier];
              return (
                <div key={tier} className="flex items-center gap-2">
                  <Badge variant="outline">{tier}</Badge>
                  <span className="font-mono font-semibold text-lg">
                    {value ? value.toFixed(1) : "N/A"}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters & Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Tier:</label>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="all">All Tiers</option>
                <option value="S">S Tier</option>
                <option value="A">A Tier</option>
                <option value="B">B Tier</option>
                <option value="C">C Tier</option>
                <option value="Unranked">Unranked</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hideInsufficientData}
                onChange={(e) => setHideInsufficientData(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium whitespace-nowrap">Hide Insufficient Data (&lt;8 Events)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyTCDCA}
                onChange={(e) => setApplyTCDCA(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium whitespace-nowrap">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Apply TC/DCA</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Multiply scores by Team Contribution (TC) and</p>
                      <p className="text-xs">Duo Carry Adjustment (DCA) factors</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <h4 className="font-medium text-sm mb-3">Toggle Columns</h4>
                  {(["playerName", "tier", "totalEvents", "holisticScore", "placementScore", "winRateScore", "killsScore", "deathsScore", "avgPlacement", "winRate", "killsPerMatch", "deathsPerMatch", "vsSameTier", "vsAbove", "vsBelow", "rawHolisticScore", "rawAvgPlacement", "avgTeammateTier", "tierGapAdjustment"] as ColumnId[]).map((columnId) => (
                    <label key={columnId} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={visibleColumns[columnId]}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({ ...prev, [columnId]: checked as boolean }))
                        }
                      />
                      <span>
                        {columnId === "playerName" && "Player"}
                        {columnId === "tier" && "Tier"}
                        {columnId === "totalEvents" && "Events"}
                        {columnId === "holisticScore" && "Holistic Score"}
                        {columnId === "placementScore" && "Placement Score"}
                        {columnId === "winRateScore" && "Win Rate Score"}
                        {columnId === "killsScore" && "Kills Score"}
                        {columnId === "deathsScore" && "Deaths Score"}
                        {columnId === "avgPlacement" && "Avg Placement"}
                        {columnId === "winRate" && "Win Rate"}
                        {columnId === "killsPerMatch" && "Kills/Match"}
                        {columnId === "deathsPerMatch" && "Deaths/Match"}
                        {columnId === "vsSameTier" && "vs Tier"}
                        {columnId === "vsAbove" && "vs Above"}
                        {columnId === "vsBelow" && "vs Below"}
                        {columnId === "rawHolisticScore" && "Raw Holistic"}
                        {columnId === "rawAvgPlacement" && "Raw Place"}
                        {columnId === "avgTeammateTier" && "Avg Teammate"}
                        {columnId === "tierGapAdjustment" && "Adjustment"}
                      </span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <strong>Note:</strong> The cache always stores raw scores. Use "Apply TC/DCA" above to multiply scores by player adjustments. Tier medians are calculated first using all players with match data, then used for batch processing.
          </p>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Player Holistic Scores</CardTitle>
          <CardDescription>
            {sortedData.length} player{sortedData.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.playerName && (
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("playerName")}
                    >
                      Player {getSortIcon("playerName")}
                    </TableHead>
                  )}
                  {visibleColumns.tier && (
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("tier")}
                    >
                      Tier {getSortIcon("tier")}
                    </TableHead>
                  )}
                  {visibleColumns.totalEvents && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("totalEvents")}
                    >
                      Events {getSortIcon("totalEvents")}
                    </TableHead>
                  )}
                  {visibleColumns.holisticScore && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("holisticScore")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Holistic Score {getSortIcon("holisticScore")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Composite score (0-100)</p>
                            <p className="text-xs">Equal 25% weights: Placement, Win Rate, Kills, Deaths</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.placementScore && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("placementScore")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Placement {getSortIcon("placementScore")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Placement score component (0-100)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.winRateScore && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("winRateScore")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Win Rate {getSortIcon("winRateScore")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Win rate score component (0-100)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.killsScore && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("killsScore")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Kills {getSortIcon("killsScore")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Kills score component (0-100)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.deathsScore && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("deathsScore")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Deaths {getSortIcon("deathsScore")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Deaths score component (0-100, higher score = fewer deaths)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.avgPlacement && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("avgPlacement")}
                    >
                      Avg Place {getSortIcon("avgPlacement")}
                    </TableHead>
                  )}
                  {visibleColumns.winRate && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("winRate")}
                    >
                      Win % {getSortIcon("winRate")}
                    </TableHead>
                  )}
                  {visibleColumns.killsPerMatch && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("killsPerMatch")}
                    >
                      K/M {getSortIcon("killsPerMatch")}
                    </TableHead>
                  )}
                  {visibleColumns.deathsPerMatch && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("deathsPerMatch")}
                    >
                      D/M {getSortIcon("deathsPerMatch")}
                    </TableHead>
                  )}
                  {visibleColumns.vsSameTier && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("vsSameTier")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              vs Tier {getSortIcon("vsSameTier")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">% difference from tier median</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.vsAbove && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("vsAbove")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              vs Above {getSortIcon("vsAbove")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">% difference from tier above</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.vsBelow && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("vsBelow")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              vs Below {getSortIcon("vsBelow")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">% difference from tier below</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.rawHolisticScore && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("rawHolisticScore")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Raw Holistic {getSortIcon("rawHolisticScore")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Holistic score before tier-gap adjustment</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.rawAvgPlacement && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("rawAvgPlacement")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Raw Place {getSortIcon("rawAvgPlacement")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Avg placement before tier-gap adjustment</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.avgTeammateTier && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("avgTeammateTier")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Avg Teammate {getSortIcon("avgTeammateTier")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Average tier of teammates</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.tierGapAdjustment && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort("tierGapAdjustment")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              Adjustment {getSortIcon("tierGapAdjustment")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">Tier-gap adjustment multiplier</p>
                            <p className="text-xs mt-1">Applied to B & C tier players with ≥8 events</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((player) => (
                  <TableRow key={player.playerId}>
                    {visibleColumns.playerName && (
                      <TableCell className="font-medium whitespace-nowrap">
                        <Link
                          to={`/player/${player.playerName}`}
                          className="hover:underline"
                        >
                          {player.playerName}
                        </Link>
                      </TableCell>
                    )}
                    {visibleColumns.tier && (
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline">{player.tier}</Badge>
                      </TableCell>
                    )}
                    {visibleColumns.totalEvents && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.totalEvents}
                      </TableCell>
                    )}
                    {visibleColumns.holisticScore && (
                      <TableCell className="text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-lg">
                          {player.holisticScore.toFixed(1)}
                        </span>
                      </TableCell>
                    )}
                    {visibleColumns.placementScore && (
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono">{player.placementScore.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">
                            (#{player.avgPlacement.toFixed(1)})
                          </span>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.winRateScore && (
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono">{player.winRateScore.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">
                            ({player.winRate.toFixed(1)}%)
                          </span>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.killsScore && (
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono">{player.killsScore.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">
                            ({player.killsPerMatch.toFixed(1)})
                          </span>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.deathsScore && (
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono">{player.deathsScore?.toFixed(1) ?? "—"}</span>
                          <span className="text-xs text-muted-foreground">
                            ({player.deathsPerMatch?.toFixed(1) ?? "—"})
                          </span>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.avgPlacement && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.avgPlacement.toFixed(1)}
                      </TableCell>
                    )}
                    {visibleColumns.winRate && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.winRate.toFixed(1)}%
                      </TableCell>
                    )}
                    {visibleColumns.killsPerMatch && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.killsPerMatch.toFixed(1)}
                      </TableCell>
                    )}
                    {visibleColumns.deathsPerMatch && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.deathsPerMatch?.toFixed(1) ?? "—"}
                      </TableCell>
                    )}
                    {visibleColumns.vsSameTier && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.holisticVsSameTier != null ? (
                          <span className={player.holisticVsSameTier > 0 ? "text-green-600" : "text-red-600"}>
                            {player.holisticVsSameTier > 0 ? "+" : ""}{player.holisticVsSameTier.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.vsAbove && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.promotionDiff != null ? (
                          <span className={player.promotionDiff > 0 ? "text-green-600" : "text-red-600"}>
                            {player.promotionDiff > 0 ? "+" : ""}{player.promotionDiff.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.vsBelow && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.demotionDiff != null ? (
                          <span className={player.demotionDiff > 0 ? "text-green-600" : "text-red-600"}>
                            {player.demotionDiff >= 0 ? "+" : ""}{player.demotionDiff.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.rawHolisticScore && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.rawHolisticScore != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{player.rawHolisticScore.toFixed(1)}</span>
                            {player.tierGapAdjustment != null && player.tierGapAdjustment !== 1.0 && (
                              <span className="text-xs text-red-600">
                                {(player.holisticScore - player.rawHolisticScore).toFixed(1)}
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.rawAvgPlacement && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.rawAvgPlacement != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{player.rawAvgPlacement.toFixed(1)}</span>
                            {player.adjustedAvgPlacement != null && player.tierGapAdjustment !== 1.0 && (
                              <span className="text-xs text-red-600">
                                +{(player.adjustedAvgPlacement - player.rawAvgPlacement).toFixed(1)}
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.avgTeammateTier && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.avgTeammateTier != null ? (
                          <span>{player.avgTeammateTier.toFixed(1)}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.tierGapAdjustment && (
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {player.tierGapAdjustment != null && player.tierGapAdjustment !== 1.0 ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-600">
                            ×{player.tierGapAdjustment.toFixed(2)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HolisticScoreStats() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <Authenticated>
        <div className="flex min-h-screen pt-14 lg:pt-0 bg-background">
          <AdminSidebar />
          <div className="flex-1">
            <HolisticScoreStatsContent />
          </div>
        </div>
      </Authenticated>
      <Unauthenticated>
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
            <p className="text-muted-foreground mb-6">
              Please sign in to access this page.
            </p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Skeleton className="h-96 w-full" />
        </div>
      </AuthLoading>
    </div>
  );
}
