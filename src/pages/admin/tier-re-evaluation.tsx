import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTierEvaluationCache } from "@/hooks/use-tier-evaluation-cache.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { compareTierField } from "@/lib/tier-sort.ts";

// Component to show top 5 results link
function Top5ResultsLink({ 
  recentTop5Count, 
  recentTop5WithTeammate,
  consistentTeammateName,
  discordUsername 
}: { 
  recentTop5Count: number; 
  recentTop5WithTeammate: number;
  consistentTeammateName?: string;
  discordUsername: string;
}) {
  if (recentTop5Count === 0) {
    return null;
  }
  
  return (
    <Link 
      to={`/admin/top-five-details?player=${encodeURIComponent(discordUsername)}`}
      className="flex items-center gap-1 text-orange-600 hover:text-orange-700 font-semibold text-xs transition-colors"
    >
      <span>🔥</span>
      <span>{recentTop5Count} recent top 5s ({recentTop5WithTeammate})</span>
    </Link>
  );
}
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
  Minus,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Info,
  Settings,
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PageHeader from "@/components/page-header.tsx";
import RoleGate from "@/components/role-gate.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  PlayerStatsRebuildButton,
  PlayerStatsRebuildRunningAlert,
} from "@/components/admin/player-stats-rebuild-button.tsx";
import { remapTierEvaluationForTcdcView } from "@/lib/tcdc-holistic-view.ts";

type SortField =
  | "playerName"
  | "tier"
  | "totalEvents"
  | "killsPerMatch"
  | "evaluationStatus"
  | "recentTop5Count"
  | "vsSameTier"
  | "vsAboveTier"
  | "vsBelowTier"
  | "holisticScore"
  | "avgPlacement"
  | "rawHolisticScore"
  | "tierGapAdjustment";
type SortDirection = "asc" | "desc";

function TierReEvaluationContent() {
  const { isAdmin, isModeratorOrAdmin, isLoading: isLoadingUser } = useUserRole();
  const canView = isModeratorOrAdmin;
  
  // ALL HOOKS MUST BE CALLED FIRST (before any conditional returns)
  const [rebuildRecentOnly, setRebuildRecentOnly] = useState(true);
  const [sortField, setSortField] = useState<SortField>("tier");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [showTop5sOnly, setShowTop5sOnly] = useState(false);
  const [showTop4sOnly, setShowTop4sOnly] = useState(false);
  const [showTop3sOnly, setShowTop3sOnly] = useState(false);
  const [hideInsufficientData, setHideInsufficientData] = useState(true);
  const [recentWeeksOnly, setRecentWeeksOnly] = useState(false);
  const RECENT_WEEKS_CUTOFF = 6;
  const [visibleColumns, setVisibleColumns] = useState({
    tier: true,
    events: true,
    holisticScore: true,
    rawScores: true,
    tierGapInfo: false, // Teammate tier and adjustment multiplier
    avgPlacement: false,
    killsPerMatch: true,
    vsSameTier: true,
    vsAboveTier: true,
    vsBelowTier: true,
    flags: true,
    status: true,
  });
  const [displayLimit, setDisplayLimit] = useState(50); // Show 50 rows initially
  const [error, setError] = useState<string | null>(null);
  const [applyTCDCA, setApplyTCDCA] = useState(true);

  const cachedData = useTierEvaluationCache(
    canView && !isLoadingUser ? {} : "skip",
  );
  
  const activeRebuildJob = useQuery(api.playerStatsRebuild.getActiveRebuildJob, {});
  const isRebuildRunning = !!activeRebuildJob;

  // Debug logging
  console.log("TierReEvaluation Debug:", {
    isLoadingUser,
    canView,
    cachedData: cachedData ? "exists" : "null/undefined",
    evaluationsLength: cachedData?.evaluations?.length,
  });
  
  const adjustedCachedData = useMemo(
    () => remapTierEvaluationForTcdcView(cachedData, applyTCDCA) ?? cachedData,
    [applyTCDCA, cachedData],
  );

  // Use useMemo to cache expensive filtering and sorting operations
  // MUST be called before any conditional returns
  const filteredAndSortedEvaluations = useMemo(() => {
    try {
      // Safety check: ensure adjustedCachedData and evaluations exist
      if (!adjustedCachedData || !adjustedCachedData.evaluations || !Array.isArray(adjustedCachedData.evaluations)) {
        console.log("No evaluations data available");
        return [];
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let filtered: any[] = [...adjustedCachedData.evaluations];
      
      console.log(`Starting with ${filtered.length} evaluations`);
      
      // Apply filters
      if (statusFilter !== "all") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((e: any) => e?.evaluationStatus === statusFilter);
      }
      if (tierFilter !== "all") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((e: any) => e?.tier === tierFilter);
      }
      if (showTop3sOnly) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((e: any) => (e?.recentTop3Count || 0) >= 3);
      } else if (showTop4sOnly) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((e: any) => (e?.recentTop4Count || 0) >= 3);
      } else if (showTop5sOnly) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((e: any) => (e?.recentTop5Count || 0) >= 3);
      }
      if (hideInsufficientData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((e: any) => e?.evaluationStatus !== "Insufficient Data");
      }
      if (recentWeeksOnly) {
        const cutoffMs = Date.now() - RECENT_WEEKS_CUTOFF * 7 * 24 * 60 * 60 * 1000;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((e: any) => {
          if (!e?.lastEventDate) return false;
          return new Date(e.lastEventDate).getTime() >= cutoffMs;
        });
      }
      
      console.log(`After filters: ${filtered.length} evaluations`);
      
      // Apply sorting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sorted = [...filtered].sort((a: any, b: any) => {
        let aVal: string | number = "";
        let bVal: string | number = "";

        switch (sortField) {
          case "playerName":
            aVal = a?.playerName || "";
            bVal = b?.playerName || "";
            break;
          case "tier": {
            const tierCmp = compareTierField(a?.tier, b?.tier, sortDirection);
            if (tierCmp !== 0) return tierCmp;
            return sortDirection === "asc"
              ? (a?.playerName || "").localeCompare(b?.playerName || "")
              : (b?.playerName || "").localeCompare(a?.playerName || "");
          }
          case "totalEvents":
            aVal = a?.totalEvents || 0;
            bVal = b?.totalEvents || 0;
            break;
          case "killsPerMatch":
            aVal = a?.killsPerMatch || 0;
            bVal = b?.killsPerMatch || 0;
            break;
          case "recentTop5Count":
            aVal = a?.recentTop5Count || 0;
            bVal = b?.recentTop5Count || 0;
            break;
          case "vsSameTier": {
            aVal = recentWeeksOnly ? (a?.recentHolisticVsSameTier ?? -999) : (a?.holisticVsSameTier ?? -999);
            bVal = recentWeeksOnly ? (b?.recentHolisticVsSameTier ?? -999) : (b?.holisticVsSameTier ?? -999);
            break;
          }
          case "vsAboveTier": {
            aVal = recentWeeksOnly ? (a?.recentPromotionDiff ?? -999) : (a?.promotionDiff ?? -999);
            bVal = recentWeeksOnly ? (b?.recentPromotionDiff ?? -999) : (b?.promotionDiff ?? -999);
            break;
          }
          case "vsBelowTier": {
            aVal = recentWeeksOnly ? (a?.recentDemotionDiff ?? -999) : (a?.demotionDiff ?? -999);
            bVal = recentWeeksOnly ? (b?.recentDemotionDiff ?? -999) : (b?.demotionDiff ?? -999);
            break;
          }
          case "holisticScore":
            aVal = recentWeeksOnly ? (a?.recentHolisticScore ?? 0) : (a?.holisticScore || 0);
            bVal = recentWeeksOnly ? (b?.recentHolisticScore ?? 0) : (b?.holisticScore || 0);
            break;
          case "avgPlacement":
            aVal = a?.avgPlacement || 99;
            bVal = b?.avgPlacement || 99;
            break;
          case "rawHolisticScore":
            aVal = a?.rawHolisticScore ?? a?.holisticScore ?? 0;
            bVal = b?.rawHolisticScore ?? b?.holisticScore ?? 0;
            break;
          case "tierGapAdjustment":
            aVal = a?.tierGapAdjustment ?? 1.0;
            bVal = b?.tierGapAdjustment ?? 1.0;
            break;
          case "evaluationStatus": {
            const statusOrder: Record<string, number> = {
              "Strong Promotion Outlier": 0,
              "Eligible for Promotion Evaluation": 1,
              Stable: 2,
              "Eligible for Demotion Evaluation": 3,
              "Strong Demotion Outlier": 4,
              "Insufficient Data": 5,
            };
            const deriveStatus = (e: typeof a) => {
              if (!recentWeeksOnly) return e?.evaluationStatus as string;
              return (e?.recentEvaluationStatus ?? e?.evaluationStatus) as string;
            };
            aVal = statusOrder[deriveStatus(a)] ?? 99;
            bVal = statusOrder[deriveStatus(b)] ?? 99;
            break;
          }
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
      
      console.log(`After sorting: ${sorted.length} evaluations`);
      return sorted;
    } catch (err) {
      console.error("Error in filteredAndSortedEvaluations:", err);
      setError(`Filter/sort error: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }, [adjustedCachedData, statusFilter, tierFilter, showTop3sOnly, showTop4sOnly, showTop5sOnly, hideInsufficientData, recentWeeksOnly, RECENT_WEEKS_CUTOFF, sortField, sortDirection]);

  // Use useMemo to cache status counts
  const statusCounts = useMemo(() => {
    try {
      const safeEvaluations = adjustedCachedData?.evaluations || [];
      if (!Array.isArray(safeEvaluations)) {
        console.warn("Evaluations is not an array");
        return {
          promotionOutlier: 0,
          promotionEligible: 0,
          demotionOutlier: 0,
          demotionEligible: 0,
          stable: 0,
          insufficient: 0,
        };
      }
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        promotionOutlier: safeEvaluations.filter((e: any) => e?.evaluationStatus === "Strong Promotion Outlier").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        promotionEligible: safeEvaluations.filter((e: any) => e?.evaluationStatus === "Eligible for Promotion Evaluation").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        demotionOutlier: safeEvaluations.filter((e: any) => e?.evaluationStatus === "Strong Demotion Outlier").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        demotionEligible: safeEvaluations.filter((e: any) => e?.evaluationStatus === "Eligible for Demotion Evaluation").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stable: safeEvaluations.filter((e: any) => e?.evaluationStatus === "Stable").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insufficient: safeEvaluations.filter((e: any) => e?.evaluationStatus === "Insufficient Data").length,
      };
    } catch (err) {
      console.error("Error in statusCounts:", err);
      return {
        promotionOutlier: 0,
        promotionEligible: 0,
        demotionOutlier: 0,
        demotionEligible: 0,
        stable: 0,
        insufficient: 0,
      };
    }
  }, [adjustedCachedData]);
  
  
  // Limit displayed rows for performance (pagination)
  const displayedEvaluations = filteredAndSortedEvaluations.slice(0, displayLimit);
  const hasMore = filteredAndSortedEvaluations.length > displayLimit;
  
  const evaluationData = adjustedCachedData;

  // Show loading while checking permissions
  if (isLoadingUser) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!canView) {
    return <RoleGate allowed={false} />;
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
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

  if (cachedData === undefined && canView && !isLoadingUser) {
    // Still loading initial query
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Loading Tier Re-Evaluation Data</CardTitle>
            <CardDescription className="text-xs">
              Checking for cached data...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 py-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // If query is being skipped (no permissions), cachedData will stay undefined
  if (cachedData === undefined && (!canView || isLoadingUser)) {
    return (
      <div className="space-y-4">
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-900">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <CardTitle className="text-sm">Authentication Required</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Please sign in with an admin account to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  if (cachedData === null || !evaluationData || !evaluationData.evaluations) {
    // No cache available - admin needs to rebuild it
    return (
      <div className="space-y-4">
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-900">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <CardTitle className="text-sm">No Cached Data Available</CardTitle>
            </div>
            <CardDescription className="text-xs">
              The tier re-evaluation data needs to be computed and cached before it can be displayed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 py-3">
            <p className="text-sm">
              Click the button below to build the cache. This will take approximately 30-60 seconds to compute holistic scores and tier comparisons for all players.
            </p>
            <PlayerStatsRebuildButton
              label="Build Cache Now"
              tierEvalOnly
              tierEvalRecentOnly={rebuildRecentOnly}
              linkToDataCache
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Once built, the cache will be available for future loads and can be refreshed anytime.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Display error if one occurred
  if (error) {
    return (
      <div className="space-y-4">
        <Card className="border-destructive">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-sm">Runtime Error</CardTitle>
            </div>
            <CardDescription className="text-xs">
              An error occurred while processing the data: {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 py-3">
            <p className="text-sm">Please check the browser console for more details, then try rebuilding the cache.</p>
            <PlayerStatsRebuildButton
              label="Rebuild Cache"
              tierEvalOnly
              tierEvalRecentOnly={rebuildRecentOnly}
              linkToDataCache
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Safety check for data structure
  if (evaluationData && !Array.isArray(evaluationData.evaluations)) {
    return (
      <div className="space-y-4">
        <Card className="border-destructive">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-sm">Data Structure Error</CardTitle>
            </div>
            <CardDescription className="text-xs">
              The cached data has an unexpected format. Please rebuild the cache.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlayerStatsRebuildButton
              label="Rebuild Cache"
              tierEvalOnly
              tierEvalRecentOnly={rebuildRecentOnly}
              linkToDataCache
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Strong Promotion Outlier":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <TrendingUp className="mr-1 h-3 w-3" />
            Strong Promotion
          </Badge>
        );
      case "Eligible for Promotion Evaluation":
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            <ArrowUp className="mr-1 h-3 w-3" />
            Promotion
          </Badge>
        );
      case "Strong Demotion Outlier":
        return (
          <Badge variant="destructive">
            <TrendingDown className="mr-1 h-3 w-3" />
            Strong Demotion
          </Badge>
        );
      case "Eligible for Demotion Evaluation":
        return (
          <Badge variant="destructive" className="bg-orange-600 hover:bg-orange-700">
            <ArrowDown className="mr-1 h-3 w-3" />
            Demotion
          </Badge>
        );
      case "Stable":
        return (
          <Badge variant="secondary">
            <Minus className="mr-1 h-3 w-3" />
            Stable
          </Badge>
        );
      case "Insufficient Data":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Info className="mr-1 h-3 w-3" />
            Insufficient Data
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDisplayedStatus = (
    evaluation: (typeof displayedEvaluations)[number],
  ): string => {
    if (!recentWeeksOnly) return evaluation.evaluationStatus;
    return evaluation.recentEvaluationStatus ?? evaluation.evaluationStatus;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tier Re-Evaluation"
        description="Automatic tier re-evaluation suggestions based on holistic scoring (placement, win rate, kills per match) and recent performance"
        variant="compact"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {evaluationData && "lastUpdated" in evaluationData && (
              <Badge variant="outline" className="text-xs">
                Cached: {new Date(evaluationData.lastUpdated).toLocaleString()}
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" asChild>
              <Link to="/admin/stats">Analytics hub</Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" asChild>
              <Link to="/admin/holistic-score-stats">Holistic scores</Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" asChild>
              <Link to="/admin/data-cache-status">Data cache</Link>
            </Button>
          </div>
        }
      />
      {isAdmin && (
        <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-3">
          <PlayerStatsRebuildRunningAlert />
          <TooltipProvider>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <PlayerStatsRebuildButton
                        label="Recalculate TC/DCA"
                        tcDcaOnly
                        size="sm"
                        variant="outline"
                        disabled={isRebuildRunning}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Recalculate Team Contribution and Duo Carry Adjustment scores for all
                      players. Run before rebuilding tier-eval cache if TC/DCA values are stale.
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <PlayerStatsRebuildButton
                        label="Rebuild Top 5 Cache"
                        topFiveOnly
                        size="sm"
                        variant="outline"
                        disabled={isRebuildRunning}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Rebuild the Top 5 placement cache for all players. Updates recent top 5
                      counts shown in the table.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={rebuildRecentOnly}
                        onCheckedChange={(checked) => setRebuildRecentOnly(checked === true)}
                      />
                      6W only
                    </label>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      {rebuildRecentOnly
                        ? "Rebuild cache for players active in the last 6 weeks only (faster)."
                        : "Rebuild cache for ALL players with match data (slower, 400+ players)."}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <PlayerStatsRebuildButton
                        label="Rebuild Cache"
                        tierEvalOnly
                        tierEvalRecentOnly={rebuildRecentOnly}
                        size="sm"
                        disabled={isRebuildRunning}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      {rebuildRecentOnly
                        ? "Rebuild cache for players active in the last 6 weeks only (faster)."
                        : "Rebuild cache for ALL players with match data (slower, 400+ players)."}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Button
                  variant="link"
                  size="sm"
                  className="h-8 px-0 text-muted-foreground"
                  asChild
                >
                  <Link to="/admin/data-cache-status">View progress</Link>
                </Button>
              </div>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <Card className="py-2">
          <CardContent className="px-3 py-0 space-y-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              Strong Promotion
            </div>
            <div className="text-lg font-bold text-green-600">
              {statusCounts.promotionOutlier}
            </div>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="px-3 py-0 space-y-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              Promotion
            </div>
            <div className="text-lg font-bold text-green-500">
              {statusCounts.promotionEligible}
            </div>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="px-3 py-0 space-y-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              Stable
            </div>
            <div className="text-lg font-bold">{statusCounts.stable}</div>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="px-3 py-0 space-y-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              Demotion
            </div>
            <div className="text-lg font-bold text-orange-600">
              {statusCounts.demotionEligible}
            </div>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="px-3 py-0 space-y-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              Strong Demotion
            </div>
            <div className="text-lg font-bold text-destructive">
              {statusCounts.demotionOutlier}
            </div>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="px-3 py-0 space-y-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              Insufficient Data
            </div>
            <div className="text-lg font-bold text-muted-foreground">
              {statusCounts.insufficient}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evaluation Thresholds */}
      <Card className="border-primary/20 py-3">
        <CardContent className="px-4 py-0 space-y-2">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            <div>
              <p className="font-semibold text-sm">Evaluation Thresholds</p>
              <p className="text-xs text-muted-foreground">
                Criteria used to determine tier re-evaluation status
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <h4 className="font-semibold text-xs">Promotion Criteria</h4>
              <div className="space-y-1 text-xs">
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Strong Promotion Outlier:</span>
                    <span className="ml-1">≥50% above tier above median</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowUp className="h-4 w-4 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Eligible for Promotion:</span>
                    <span className="ml-1">≥33% above tier above median OR 4+ top 5 finishes in last 5 leaderboards (excludes "No Money" scrims)</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold text-xs">Demotion Criteria</h4>
              <div className="space-y-1 text-xs">
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Strong Demotion Outlier:</span>
                    <span className="ml-1">≥50% below tier below median</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowDown className="h-4 w-4 text-orange-600 dark:text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Eligible for Demotion:</span>
                    <span className="ml-1">≥33% below tier below median</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">Minimum Requirements:</span> Players need ≥8 events to be evaluated. 
                Comparisons use tier medians calculated from players with ≥5 events.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters and Toggles */}
      <Card className="py-3">
        <CardContent className="px-4 py-0 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Filters & Comparison</p>
              <p className="text-xs text-muted-foreground">
                Filter evaluations, adjust scoring parameters, and compare players
              </p>
            </div>
          </div>
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
                <option value="D">D Tier</option>
                <option value="Unranked">Unranked</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="Strong Promotion Outlier">Strong Promotion</option>
                <option value="Eligible for Promotion Evaluation">Promotion</option>
                <option value="Stable">Stable</option>
                <option value="Eligible for Demotion Evaluation">Demotion</option>
                <option value="Strong Demotion Outlier">Strong Demotion</option>
                <option value="Insufficient Data">Insufficient Data</option>
              </select>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="start">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm mb-3">Toggle Columns</h4>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.tier}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, tier: checked as boolean }))
                      }
                    />
                    <span>Tier</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.events}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, events: checked as boolean }))
                      }
                    />
                    <span>Events</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.holisticScore}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, holisticScore: checked as boolean }))
                      }
                    />
                    <span>Holistic Score</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.rawScores}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, rawScores: checked as boolean }))
                      }
                    />
                    <span>Raw vs Adjusted Scores</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.tierGapInfo}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, tierGapInfo: checked as boolean }))
                      }
                    />
                    <span>Tier-Gap Info</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.avgPlacement}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, avgPlacement: checked as boolean }))
                      }
                    />
                    <span>Avg Placement</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.killsPerMatch}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, killsPerMatch: checked as boolean }))
                      }
                    />
                    <span>Kills/Match</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.vsSameTier}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, vsSameTier: checked as boolean }))
                      }
                    />
                    <span>vs Same Tier</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.vsAboveTier}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, vsAboveTier: checked as boolean }))
                      }
                    />
                    <span>vs Above Tier</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.vsBelowTier}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, vsBelowTier: checked as boolean }))
                      }
                    />
                    <span>vs Below Tier</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.flags}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, flags: checked as boolean }))
                      }
                    />
                    <span>🔥 Flags</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.status}
                      onCheckedChange={(checked) => 
                        setVisibleColumns(prev => ({ ...prev, status: checked as boolean }))
                      }
                    />
                    <span>Status</span>
                  </label>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-6 pt-2 border-t">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTop5sOnly}
                onChange={(e) => {
                  setShowTop5sOnly(e.target.checked);
                  if (e.target.checked) {
                    setShowTop4sOnly(false);
                    setShowTop3sOnly(false);
                  }
                }}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">🔥 Top 5s Only (3+)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTop4sOnly}
                onChange={(e) => {
                  setShowTop4sOnly(e.target.checked);
                  if (e.target.checked) {
                    setShowTop5sOnly(false);
                    setShowTop3sOnly(false);
                  }
                }}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">⭐ Top 4s Only (3+)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTop3sOnly}
                onChange={(e) => {
                  setShowTop3sOnly(e.target.checked);
                  if (e.target.checked) {
                    setShowTop5sOnly(false);
                    setShowTop4sOnly(false);
                  }
                }}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">✨ Top 3s Only (3+)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hideInsufficientData}
                onChange={(e) => setHideInsufficientData(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Hide Insufficient Data (&lt;8 Events)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyTCDCA}
                onChange={(e) => setApplyTCDCA(e.target.checked)}
                className="w-4 h-4"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm font-medium cursor-help">Apply TC/DCA</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Show holistic with cached TC/DCA applied (off = raw composite).</p>
                    <p className="text-xs">Tier medians, vs-tier diffs, and statuses update with the toggle.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={recentWeeksOnly}
                onChange={(e) => setRecentWeeksOnly(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Last 6 Weeks Holistic Score</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Tier Medians */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Link to="/admin/holistic-score-stats">
              <CardTitle className="hover:underline cursor-pointer">
                {recentWeeksOnly ? "6-Week Tier Medians (Holistic Score) →" : "Tier Medians (Holistic Score) →"}
              </CardTitle>
            </Link>
            <CardDescription>
              {recentWeeksOnly
                ? "Median holistic score from last 6 weeks of events per tier"
                : "Median holistic score benchmarks for each tier (players with ≥5 events and score >10, less affected by outliers)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {(["S", "A", "B", "C"] as const).map((tier) => {
                const tierHolistic = recentWeeksOnly
                  ? evaluationData?.recentTierHolisticMedians as Record<string, number> | undefined
                  : evaluationData?.tierHolisticMedians as Record<string, number> | undefined;
                const value = tierHolistic?.[tier];
                return (
                  <div key={tier} className="flex items-center gap-2">
                    <span className="font-semibold">{tier}:</span>
                    <span className="font-mono">
                      {value ? value.toFixed(1) : "N/A"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tier Medians (Kills per Match)</CardTitle>
            <CardDescription>
              Median kills per match for each tier (players with ≥5 events and score &gt;10)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {(["S", "A", "B", "C"] as const).map((tier) => {
                const tierKills = evaluationData?.tierKillsMedians as Record<string, number> | undefined;
                const value = tierKills?.[tier];
                return (
                  <div key={tier} className="flex items-center gap-2">
                    <span className="font-semibold">{tier}:</span>
                    <span className="font-mono">
                      {value ? value.toFixed(1) : "N/A"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evaluations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Player Evaluations</CardTitle>
          <CardDescription>
            Showing {displayedEvaluations.length} of {filteredAndSortedEvaluations.length} player
            {filteredAndSortedEvaluations.length !== 1 ? "s" : ""} • This data automatically
            updates when Holistic Scores are recalculated
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("playerName")}
                  >
                    Player
                  </TableHead>
                  {visibleColumns.tier && (
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("tier")}
                    >
                      Tier
                    </TableHead>
                  )}
                  {visibleColumns.events && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("totalEvents")}
                    >
                      Events
                    </TableHead>
                  )}
                  {visibleColumns.killsPerMatch && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("killsPerMatch")}
                    >
                      Kills/Match
                    </TableHead>
                  )}
                  {visibleColumns.holisticScore && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("holisticScore")}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              {recentWeeksOnly ? "6W Holistic" : "Holistic Score"} {getSortIcon("holisticScore")}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1">
                              {recentWeeksOnly ? "Last 6 Weeks" : "All-Time"} Composite Score (0-100)
                            </p>
                            <p className="text-xs">Weighted combination of:</p>
                            <ul className="text-xs list-disc list-inside">
                              <li>Placement: 33%</li>
                              <li>Win Rate: 33%</li>
                              <li>Kills per Match: 33%</li>
                            </ul>
                            {recentWeeksOnly && (
                              <p className="text-xs mt-1 text-amber-500">Only uses data from events in the last 6 weeks</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  {visibleColumns.avgPlacement && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("avgPlacement")}
                    >
                      Avg Place {getSortIcon("avgPlacement")}
                    </TableHead>
                  )}
                  {visibleColumns.rawScores && (
                    <>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("rawHolisticScore")}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                Raw Holistic {getSortIcon("rawHolisticScore")}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">Holistic without TC/DCA (cached raw composite)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">Raw Place</div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">Avg placement before tier-gap adjustment</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    </>
                  )}
                  {visibleColumns.tierGapInfo && (
                    <>
                      <TableHead className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">Avg Teammate</div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">Average tier of teammates</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
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
                    </>
                  )}
                  {visibleColumns.vsSameTier && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("vsSameTier")}
                    >
                      vs Same {getSortIcon("vsSameTier")}
                    </TableHead>
                  )}
                  {visibleColumns.vsAboveTier && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("vsAboveTier")}
                    >
                      vs Above {getSortIcon("vsAboveTier")}
                    </TableHead>
                  )}
                  {visibleColumns.vsBelowTier && (
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("vsBelowTier")}
                    >
                      vs Below {getSortIcon("vsBelowTier")}
                    </TableHead>
                  )}
                  {visibleColumns.flags && (
                    <TableHead
                      className="text-center cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("recentTop5Count")}
                    >
                      🔥 {getSortIcon("recentTop5Count")}
                    </TableHead>
                  )}
                  {visibleColumns.status && (
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("evaluationStatus")}
                    >
                      Status
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedEvaluations.map((evaluation) => {
                  const effectiveStatus = getDisplayedStatus(evaluation);
                  return (
                  <TableRow
                    key={evaluation.playerId}
                    className={
                      visibleColumns.status && effectiveStatus === "Strong Promotion Outlier"
                        ? "bg-green-50 dark:bg-green-950/20"
                        : visibleColumns.status && effectiveStatus === "Strong Demotion Outlier"
                          ? "bg-red-50 dark:bg-red-950/20"
                          : ""
                    }
                  >
                    <TableCell className="font-medium">
                      <Link
                        to={`/player/${evaluation.playerName}`}
                        className="hover:underline"
                      >
                        {evaluation.playerName}
                      </Link>
                    </TableCell>
                    {visibleColumns.tier && (
                      <TableCell>
                        <Badge variant="outline">{evaluation.tier}</Badge>
                      </TableCell>
                    )}
                    {visibleColumns.events && (
                      <TableCell className="text-right font-mono">
                        {evaluation.totalEvents}
                      </TableCell>
                    )}
                    {visibleColumns.killsPerMatch && (
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono">{evaluation.killsPerMatch != null ? evaluation.killsPerMatch.toFixed(1) : "N/A"}</span>
                          {evaluation.killsVsTierDiff != null && (
                            <span className={`text-xs font-medium ${
                              evaluation.killsVsTierDiff >= 10
                                ? "text-green-600"
                                : evaluation.killsVsTierDiff <= -10
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }`}>
                              {evaluation.killsVsTierDiff > 0 ? "+" : ""}{evaluation.killsVsTierDiff.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.holisticScore && (
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                {recentWeeksOnly ? (
                                  <>
                                    <span className="font-mono font-semibold">
                                      {evaluation.recentHolisticScore != null ? evaluation.recentHolisticScore.toFixed(1) : "—"}
                                    </span>
                                    {evaluation.recentTotalEvents != null && (
                                      <span className="ml-1 text-xs text-muted-foreground">({evaluation.recentTotalEvents})</span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="font-mono font-semibold">{evaluation.holisticScore != null ? evaluation.holisticScore.toFixed(1) : "N/A"}</span>
                                    {evaluation.tierGapAdjustment != null && evaluation.tierGapAdjustment !== 1.0 && (
                                      <span className="ml-1 text-xs text-amber-600">⚙️</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="space-y-1">
                                {recentWeeksOnly ? (
                                  <>
                                    <p className="font-semibold text-xs">Last 6 Weeks Breakdown:</p>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                      <span>Placement:</span>
                                      <span className="font-mono">
                                        {evaluation.recentPlacementScore != null ? evaluation.recentPlacementScore.toFixed(1) : "—"} 
                                        ({evaluation.recentAvgPlacement != null ? `#${evaluation.recentAvgPlacement.toFixed(1)}` : "—"})
                                      </span>
                                      <span>Win Rate:</span>
                                      <span className="font-mono">
                                        {evaluation.recentWinRateScore != null ? evaluation.recentWinRateScore.toFixed(1) : "—"} 
                                        ({evaluation.recentWinRate != null ? `${evaluation.recentWinRate.toFixed(1)}%` : "—"})
                                      </span>
                                      <span>Kills/Match:</span>
                                      <span className="font-mono">
                                        {evaluation.recentKillsScore != null ? evaluation.recentKillsScore.toFixed(1) : "—"} 
                                        ({evaluation.recentKillsPerMatch != null ? evaluation.recentKillsPerMatch.toFixed(1) : "—"})
                                      </span>
                                    </div>
                                    <p className="text-xs pt-1 border-t text-muted-foreground">
                                      {evaluation.recentTotalEvents ?? 0} events in last 6 weeks
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      All-time: {evaluation.holisticScore != null ? evaluation.holisticScore.toFixed(1) : "N/A"}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-semibold text-xs">Score Breakdown:</p>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                      <span>Placement:</span>
                                      <span className="font-mono">
                                        {evaluation.placementScore != null ? evaluation.placementScore.toFixed(1) : "N/A"} 
                                        ({evaluation.avgPlacement != null ? `#${evaluation.avgPlacement.toFixed(1)}` : "N/A"})
                                      </span>
                                      <span>Win Rate:</span>
                                      <span className="font-mono">
                                        {evaluation.winRateScore != null ? evaluation.winRateScore.toFixed(1) : "N/A"} 
                                        ({evaluation.winRate != null ? `${evaluation.winRate.toFixed(1)}%` : "N/A"})
                                      </span>
                                      <span>Kills/Match:</span>
                                      <span className="font-mono">
                                        {evaluation.killsScore != null ? evaluation.killsScore.toFixed(1) : "N/A"} 
                                        ({evaluation.killsPerMatch != null ? evaluation.killsPerMatch.toFixed(1) : "N/A"})
                                      </span>
                                    </div>
                                    {evaluation.sameTierHolistic != null && (
                                      <p className="text-xs pt-1 border-t">
                                        Tier {evaluation.tier} median: {evaluation.sameTierHolistic.toFixed(1)}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    )}
                    {visibleColumns.avgPlacement && (
                      <TableCell className="text-right font-mono">
                        {evaluation.avgPlacement != null ? evaluation.avgPlacement.toFixed(1) : "—"}
                        {evaluation.tierGapAdjustment != null && evaluation.tierGapAdjustment !== 1.0 && (
                          <span className="ml-1 text-xs text-amber-600">⚙️</span>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.rawScores && (
                      <>
                        <TableCell className="text-right font-mono">
                          {evaluation.rawHolisticScore != null ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span>{evaluation.rawHolisticScore.toFixed(1)}</span>
                              {evaluation.tierGapAdjustment != null && evaluation.tierGapAdjustment !== 1.0 && (
                                <span className="text-xs text-red-600">
                                  {(evaluation.holisticScore - evaluation.rawHolisticScore).toFixed(1)}
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {evaluation.rawAvgPlacement != null ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span>{evaluation.rawAvgPlacement.toFixed(1)}</span>
                              {evaluation.adjustedAvgPlacement != null && evaluation.tierGapAdjustment !== 1.0 && (
                                <span className="text-xs text-red-600">
                                  +{(evaluation.adjustedAvgPlacement - evaluation.rawAvgPlacement).toFixed(1)}
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </>
                    )}
                    {visibleColumns.tierGapInfo && (
                      <>
                        <TableCell className="text-right font-mono">
                          {evaluation.avgTeammateTier != null ? (
                            <span>{evaluation.avgTeammateTier.toFixed(1)}</span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {evaluation.tierGapAdjustment != null && evaluation.tierGapAdjustment !== 1.0 ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-600">
                              ×{evaluation.tierGapAdjustment.toFixed(2)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </>
                    )}
                    {visibleColumns.vsSameTier && (
                      <TableCell className="text-right">
                        {effectiveStatus === "Insufficient Data" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (() => {
                          const diffVal = recentWeeksOnly ? evaluation.recentHolisticVsSameTier : evaluation.holisticVsSameTier;
                          return diffVal != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span
                              className={`font-mono ${
                                diffVal >= 15
                                  ? "font-bold text-green-600"
                                  : diffVal >= 5
                                    ? "font-semibold text-green-500"
                                    : diffVal <= -15
                                      ? "font-bold text-destructive"
                                      : diffVal <= -5
                                        ? "font-semibold text-orange-600"
                                        : ""
                              }`}
                            >
                              {diffVal >= 0
                                ? `+${diffVal.toFixed(1)}%`
                                : `${diffVal.toFixed(1)}%`}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              ({evaluation.sameTierHolistic != null ? evaluation.sameTierHolistic.toFixed(1) : "N/A"})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        );
                        })()}
                      </TableCell>
                    )}
                    {visibleColumns.vsAboveTier && (
                      <TableCell className="text-right">
                        {effectiveStatus === "Insufficient Data" || !evaluation.tierAbove ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (() => {
                          const diffVal = recentWeeksOnly ? evaluation.recentPromotionDiff : evaluation.promotionDiff;
                          return diffVal != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span
                              className={`font-mono ${
                                diffVal >= 15
                                  ? "font-bold text-green-600"
                                  : diffVal >= 5
                                    ? "font-semibold text-green-500"
                                    : ""
                              }`}
                            >
                              {diffVal >= 0
                                ? `+${diffVal.toFixed(1)}%`
                                : `${diffVal.toFixed(1)}%`}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              ({evaluation.tierAboveHolistic != null ? evaluation.tierAboveHolistic.toFixed(1) : "N/A"})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        );
                        })()}
                      </TableCell>
                    )}
                    {visibleColumns.vsBelowTier && (
                      <TableCell className="text-right">
                        {effectiveStatus === "Insufficient Data" || !evaluation.tierBelow ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (() => {
                          const diffVal = recentWeeksOnly ? evaluation.recentDemotionDiff : evaluation.demotionDiff;
                          return diffVal != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span
                              className={`font-mono ${
                                diffVal >= 15
                                  ? "font-bold text-green-600"
                                  : diffVal >= 5
                                    ? "font-semibold text-green-500"
                                    : diffVal <= -15
                                      ? "font-bold text-destructive"
                                      : diffVal <= -5
                                        ? "font-semibold text-orange-600"
                                        : ""
                              }`}
                            >
                              {diffVal >= 0
                                ? `+${diffVal.toFixed(1)}%`
                                : `${diffVal.toFixed(1)}%`}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              ({evaluation.tierBelowHolistic != null ? evaluation.tierBelowHolistic.toFixed(1) : "N/A"})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        );
                        })()}
                      </TableCell>
                    )}
                    {visibleColumns.flags && (
                      <TableCell className="text-center">
                        {effectiveStatus === "Insufficient Data" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-0.5 text-xs flex flex-col items-center">
                            {evaluation.recentTop3Count >= 3 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 text-green-600 font-semibold cursor-help">
                                      <span>✨</span>
                                      <span>{evaluation.recentTop3Count} recent top 3s</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      Last 5 leaderboards (excludes "No Money" scrims)
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {evaluation.recentTop4Count >= 3 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 text-blue-600 font-semibold cursor-help">
                                      <span>⭐</span>
                                      <span>{evaluation.recentTop4Count} recent top 4s</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      Last 5 leaderboards (excludes "No Money" scrims)
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {evaluation.recentTop5Count >= 3 && (
                              <Top5ResultsLink 
                                recentTop5Count={evaluation.recentTop5Count}
                                recentTop5WithTeammate={evaluation.recentTop5WithTeammate}
                                consistentTeammateName={evaluation.consistentTeammateName}
                                discordUsername={evaluation.discordUsername}
                              />
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.status && (
                      <TableCell>{getStatusBadge(effectiveStatus)}</TableCell>
                    )}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => setDisplayLimit(prev => prev + 50)}
                variant="outline"
              >
                Load More ({filteredAndSortedEvaluations.length - displayLimit} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Important Note */}
      <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-900 dark:text-yellow-200">
            <AlertTriangle className="h-5 w-5" />
            Important Note
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-yellow-900 dark:text-yellow-200">
          <p>
            This system provides <strong>suggestions only</strong> and never automatically
            modifies tier assignments. All tier changes must be made manually by
            administrators. This data automatically updates whenever Holistic Scores are
            recalculated.
          </p>
        </CardContent>
      </Card>

    </div>
  );
}

export default function TierReEvaluation() {
  return (
    <AdminPageLayout skipHeader requireAdmin authTitle="Sign in to access tier re-evaluation">
      <TierReEvaluationContent />
    </AdminPageLayout>
  );
}
