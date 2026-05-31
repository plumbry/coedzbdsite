import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

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
  GitCompare,
  Settings,
  Users,
  RefreshCw,
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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { toast } from "sonner";

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
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildRecentOnly, setRebuildRecentOnly] = useState(true);
  const [sortField, setSortField] = useState<SortField>("evaluationStatus");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [showTop5sOnly, setShowTop5sOnly] = useState(false);
  const [showTop4sOnly, setShowTop4sOnly] = useState(false);
  const [showTop3sOnly, setShowTop3sOnly] = useState(false);
  const [hideInsufficientData, setHideInsufficientData] = useState(true);
  const [recentWeeksOnly, setRecentWeeksOnly] = useState(false);
  const RECENT_WEEKS_CUTOFF = 6;
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    tier: true,
    events: true,
    holisticScore: true,
    rawScores: false, // Raw vs adjusted scores
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
  const [applyTCDCA, setApplyTCDCA] = useState(false); // Display-time TC/DCA toggle
  
  // Only use cached data (no live fallback to prevent timeouts)
  const cachedData = useQuery(
    api.tierReEvaluation.getCachedTierReEvaluationData,
    canView && !isLoadingUser ? {} : "skip"
  );
  
  // Fetch player data for TC/DCA when toggle is on
  const allPlayers = useQuery(
    api.players.getPlayers,
    applyTCDCA && cachedData ? {} : "skip"
  );
  
  const rebuildCache = useMutation(api.tierReEvaluation.rebuildTierReEvaluationCache);
  const initializeBatchRebuild = useMutation(api.tierReEvaluationBatched.initializeBatchRebuild);
  const clearHolisticCache = useMutation(api.tierReEvaluationBatched.clearCache);
  const processBatch = useMutation(api.tierReEvaluationBatched.processBatch);
  const finalizeRecent = useMutation(api.tierReEvaluationBatched.finalizeRecentComparisons);
  
  // Top 5 cache rebuild
  const rebuildTop5Cache = useMutation(api.cacheStatus.rebuildPlayerCache);
  const [isRebuildingTop5, setIsRebuildingTop5] = useState(false);
  
  // TC/DCA recalculation
  const recalculateAllCS = useMutation(api.calculateContributionScore.recalculateAllCS);
  const rebuildDCACache = useMutation(api.dcaCache.rebuildDCACache);
  const [isRecalculatingTCDCA, setIsRecalculatingTCDCA] = useState(false);
  
  // Debug logging
  console.log("TierReEvaluation Debug:", {
    isLoadingUser,
    canView,
    cachedData: cachedData ? "exists" : "null/undefined",
    evaluationsLength: cachedData?.evaluations?.length,
  });
  
  // Apply TC/DCA multipliers at display time, recalculate tier medians, then re-derive diffs/status
  const adjustedCachedData = useMemo(() => {
    if (!applyTCDCA || !allPlayers || !cachedData) return cachedData;

    const tierOrder = ["S", "A", "B", "C"];

    // Helper: calculate median of an array of numbers
    const calcMedian = (values: number[]): number => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };

    // --- Pass 1: compute adjusted holistic scores for every evaluation ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withAdjusted = cachedData.evaluations.map((evaluation: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = allPlayers.find((p: any) => p._id === evaluation.playerId);
      const tc = player?.contributionScore?.score || 1.0;
      const dca = player?.dcaCache?.dca || 1.0;
      const multiplier = tc * dca;

      const adjustedHolistic = (evaluation.holisticScore ?? 0) * multiplier;
      const adjustedRecentHolistic = evaluation.recentHolisticScore != null
        ? evaluation.recentHolisticScore * multiplier
        : undefined;

      return { evaluation, adjustedHolistic, adjustedRecentHolistic };
    });

    // --- Pass 2: build new tier medians from adjusted scores ---
    const tierAllTimeScores: Record<string, number[]> = { S: [], A: [], B: [], C: [] };
    const tierRecentScores: Record<string, number[]> = { S: [], A: [], B: [], C: [] };

    for (const { evaluation, adjustedHolistic, adjustedRecentHolistic } of withAdjusted) {
      if (!tierOrder.includes(evaluation.tier)) continue;
      // Mirror the ≥5 events filter used by the cache rebuild
      if ((evaluation.totalEvents ?? 0) >= 5) {
        tierAllTimeScores[evaluation.tier].push(adjustedHolistic);
      }
      if (adjustedRecentHolistic != null) {
        tierRecentScores[evaluation.tier].push(adjustedRecentHolistic);
      }
    }

    const newTierHolisticMedians: Record<string, number> = {};
    const newRecentMedians: Record<string, number> = {};

    for (const tier of tierOrder) {
      if (tierAllTimeScores[tier].length > 0) {
        newTierHolisticMedians[tier] = calcMedian(tierAllTimeScores[tier]);
      }
      if (tierRecentScores[tier].length > 0) {
        newRecentMedians[tier] = calcMedian(tierRecentScores[tier]);
      }
    }

    // --- Pass 3: recalculate diffs & statuses against the new medians ---
    const adjustedEvaluations = withAdjusted.map(({ evaluation, adjustedHolistic, adjustedRecentHolistic }) => {
      const tierIndex = tierOrder.indexOf(evaluation.tier);
      const tierAbove = tierIndex > 0 ? tierOrder[tierIndex - 1] : undefined;
      const tierBelow = tierIndex < tierOrder.length - 1 ? tierOrder[tierIndex + 1] : undefined;

      // All-time diffs against NEW medians
      const sameTierMed = newTierHolisticMedians[evaluation.tier];
      const aboveMed = tierAbove ? newTierHolisticMedians[tierAbove] : undefined;
      const belowMed = tierBelow ? newTierHolisticMedians[tierBelow] : undefined;

      const holisticVsSameTier = sameTierMed != null ? adjustedHolistic - sameTierMed : evaluation.holisticVsSameTier;
      const promotionDiff = aboveMed != null ? adjustedHolistic - aboveMed : evaluation.promotionDiff;
      const demotionDiff = belowMed != null ? adjustedHolistic - belowMed : evaluation.demotionDiff;

      // Recalculate evaluation status
      let evaluationStatus = evaluation.evaluationStatus;
      if ((evaluation.totalEvents ?? 0) >= 8) {
        if (promotionDiff != null && promotionDiff > 5) {
          evaluationStatus = "Strong Promotion Outlier";
        } else if (promotionDiff != null && promotionDiff > 0) {
          evaluationStatus = "Eligible for Promotion Evaluation";
        } else if (demotionDiff != null && demotionDiff < -5) {
          evaluationStatus = "Strong Demotion Outlier";
        } else if (demotionDiff != null && demotionDiff < 0) {
          evaluationStatus = "Eligible for Demotion Evaluation";
        } else {
          evaluationStatus = "Stable";
        }
      }

      // Recent diffs against NEW recent medians
      const recentSameMed = newRecentMedians[evaluation.tier];
      const recentAboveMed = tierAbove ? newRecentMedians[tierAbove] : undefined;
      const recentBelowMed = tierBelow ? newRecentMedians[tierBelow] : undefined;

      const recentHolisticVsSameTier = (adjustedRecentHolistic != null && recentSameMed != null)
        ? adjustedRecentHolistic - recentSameMed
        : evaluation.recentHolisticVsSameTier;
      const recentPromotionDiff = (adjustedRecentHolistic != null && recentAboveMed != null)
        ? adjustedRecentHolistic - recentAboveMed
        : evaluation.recentPromotionDiff;
      const recentDemotionDiff = (adjustedRecentHolistic != null && recentBelowMed != null)
        ? adjustedRecentHolistic - recentBelowMed
        : evaluation.recentDemotionDiff;

      return {
        ...evaluation,
        holisticScore: adjustedHolistic,
        holisticVsSameTier,
        promotionDiff,
        demotionDiff,
        evaluationStatus,
        recentHolisticScore: adjustedRecentHolistic,
        recentHolisticVsSameTier,
        recentPromotionDiff,
        recentDemotionDiff,
      };
    });

    return {
      ...cachedData,
      evaluations: adjustedEvaluations,
      tierHolisticMedians: newTierHolisticMedians,
      recentTierHolisticMedians: newRecentMedians,
    };
  }, [applyTCDCA, allPlayers, cachedData]);

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
          case "tier":
            aVal = a?.tier || "";
            bVal = b?.tier || "";
            break;
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
            // Derive effective status for sorting when recent toggle is on
            const deriveStatus = (e: typeof a) => {
              if (!recentWeeksOnly) return e?.evaluationStatus as string;
              if ((e?.totalEvents || 0) < 8 || (e?.recentTotalEvents ?? 0) === 0) return "Insufficient Data";
              const pro = e?.recentPromotionDiff;
              const dem = e?.recentDemotionDiff;
              if (pro != null && pro > 5) return "Strong Promotion Outlier";
              if (pro != null && pro > 0) return "Eligible for Promotion Evaluation";
              if (dem != null && dem < -5) return "Strong Demotion Outlier";
              if (dem != null && dem < 0) return "Eligible for Demotion Evaluation";
              return "Stable";
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
  
  const handleRebuildCache = async () => {
    setIsRebuilding(true);
    try {
      // Step 1: Clear old cache, then initialize (calculates tier medians)
      toast.loading("Clearing old cache...", { id: 'tier-rebuild-progress' });
      await clearHolisticCache({});
      toast.loading("Initializing cache rebuild...", { id: 'tier-rebuild-progress' });
      const { totalPlayers, batchCount } = await initializeBatchRebuild({ recentOnly: rebuildRecentOnly });
      
      if (totalPlayers === 0) {
        toast.dismiss('tier-rebuild-progress');
        toast.warning("No players with match data to process");
        setIsRebuilding(false);
        return;
      }
      
      // Step 2: Process batches
      let processedTotal = 0;
      for (let i = 0; i < batchCount; i++) {
        toast.loading(
          `Rebuilding cache... ${processedTotal}/${totalPlayers} players (batch ${i + 1}/${batchCount})`,
          { id: 'tier-rebuild-progress' }
        );
        
        const { processed } = await processBatch({ batchNumber: i, recentOnly: rebuildRecentOnly });
        processedTotal += processed;
      }
      
      // Step 3: Finalize recent (6-week) comparisons using 6-week medians
      toast.loading("Finalizing 6-week comparisons...", { id: 'tier-rebuild-progress' });
      await finalizeRecent({});
      
      toast.dismiss('tier-rebuild-progress');
      toast.success(`Cache rebuilt successfully for ${processedTotal} players`);
    } catch (error) {
      toast.dismiss('tier-rebuild-progress');
      toast.error("Failed to rebuild cache: " + (error as Error).message);
    } finally {
      setIsRebuilding(false);
    }
  };
  
  const handleRecalculateTCDCA = async () => {
    const confirmed = window.confirm(
      "Recalculate TC/DCA?\n\nThis will:\n1. Recalculate TC (Team Contribution) for all players\n2. Recalculate DCA (Duo Carry Adjustment) for all players\n\nThis may take a minute or two. Continue?"
    );
    if (!confirmed) return;

    setIsRecalculatingTCDCA(true);
    const TOAST_ID = "recalculate-tcdca";

    try {
      // Step 1: TC
      toast.loading("Recalculating TC...", { id: TOAST_ID, duration: Infinity });
      let tcDone = 0;
      let hasMore = true;
      const tcCutoff = Date.now();
      while (hasMore) {
        const r = await recalculateAllCS({ forceRecalculate: true, cutoffTimestamp: tcCutoff });
        tcDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`TC: ${tcDone} players processed, ${r.remaining} remaining`, { id: TOAST_ID, duration: Infinity });
        if (hasMore) await new Promise(res => setTimeout(res, 150));
      }

      // Step 2: DCA
      toast.loading("Recalculating DCA...", { id: TOAST_ID, duration: Infinity });
      let dcaDone = 0;
      hasMore = true;
      while (hasMore) {
        const r = await rebuildDCACache({ forceRebuild: true });
        dcaDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`DCA: ${dcaDone} players processed, ${r.remaining} remaining`, { id: TOAST_ID, duration: Infinity });
        if (hasMore) await new Promise(res => setTimeout(res, 150));
      }

      toast.success(`TC/DCA recalculated! TC: ${tcDone} players, DCA: ${dcaDone} players`, { id: TOAST_ID, duration: 5000 });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`TC/DCA recalculation failed: ${msg}`, { id: TOAST_ID, duration: 8000 });
    } finally {
      setIsRecalculatingTCDCA(false);
    }
  };

  const handleRebuildTop5Cache = async () => {
    setIsRebuildingTop5(true);
    try {
      const result = await rebuildTop5Cache();
      toast.success(result.message);
    } catch (error) {
      toast.error("Failed to rebuild Top 5 cache: " + (error as Error).message);
    } finally {
      setIsRebuildingTop5(false);
    }
  };

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
            <Button
              onClick={handleRebuildCache}
              disabled={isRebuilding}
              className="w-full"
            >
              {isRebuilding ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Building Cache...
                </>
              ) : (
                "Build Cache Now"
              )}
            </Button>
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
            <Button onClick={handleRebuildCache} disabled={isRebuilding}>
              {isRebuilding ? "Rebuilding..." : "Rebuild Cache"}
            </Button>
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
            <Button onClick={handleRebuildCache} disabled={isRebuilding}>
              {isRebuilding ? "Rebuilding..." : "Rebuild Cache"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle player selection (max 4 players)
  const togglePlayerSelection = (playerId: string) => {
    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId);
    } else {
      if (newSelected.size >= 4) {
        toast.error("Maximum 4 players can be compared at once");
        return;
      }
      newSelected.add(playerId);
    }
    setSelectedPlayers(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedPlayers.size > 0) {
      setSelectedPlayers(new Set());
    } else {
      // Select first 4 players
      const first4 = displayedEvaluations.slice(0, 4).map(e => e.playerId);
      setSelectedPlayers(new Set(first4));
      if (displayedEvaluations.length > 4) {
        toast.info("Selected first 4 players (maximum for comparison)");
      }
    }
  };

  const getSelectedPlayerData = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return filteredAndSortedEvaluations.filter((e: any) => selectedPlayers.has(e.playerId));
  };
  

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

  // Derive evaluation status from diff values (used for recent toggle)
  const getEffectiveStatus = (evaluation: typeof displayedEvaluations[number]): string => {
    if (!recentWeeksOnly) return evaluation.evaluationStatus;
    // When toggle is on, recalculate status from recent diffs
    if (evaluation.totalEvents < 8) return "Insufficient Data";
    const recentEvents = evaluation.recentTotalEvents ?? 0;
    if (recentEvents === 0) return "Insufficient Data";
    const proDiff = evaluation.recentPromotionDiff;
    const demDiff = evaluation.recentDemotionDiff;
    if (proDiff != null && proDiff > 5) return "Strong Promotion Outlier";
    if (proDiff != null && proDiff > 0) return "Eligible for Promotion Evaluation";
    if (demDiff != null && demDiff < -5) return "Strong Demotion Outlier";
    if (demDiff != null && demDiff < 0) return "Eligible for Demotion Evaluation";
    return "Stable";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tier Re-Evaluation"
        description="Automatic tier re-evaluation suggestions based on holistic scoring (placement, win rate, kills per match) and recent performance"
        variant="compact"
        actions={
          evaluationData && "lastUpdated" in evaluationData ? (
            <Badge variant="outline" className="text-xs">
              Cached: {new Date(evaluationData.lastUpdated).toLocaleString()}
            </Badge>
          ) : undefined
        }
      />
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <Link to="/admin/stats" className="text-primary hover:underline">
          View all stats →
        </Link>
        <Link to="/admin/tier-re-evaluation" className="text-primary hover:underline">
          Tier Re-Evaluation →
        </Link>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    onClick={handleRecalculateTCDCA}
                    disabled={isRecalculatingTCDCA || isRebuilding}
                    variant="secondary"
                  >
                    {isRecalculatingTCDCA ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Recalculating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Recalculate TC/DCA
                      </>
                    )}
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Recalculate Team Contribution and Duo Carry Adjustment scores for all players. Run this before rebuilding the cache if TC/DCA values are stale.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleRebuildTop5Cache}
                  disabled={isRebuildingTop5 || isRebuilding || isRecalculatingTCDCA}
                  variant="secondary"
                >
                  {isRebuildingTop5 ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Rebuilding Top 5...
                    </>
                  ) : (
                    "Rebuild Top 5 Cache"
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Rebuild the Top 5 placement cache for all players. Updates recent top 5 counts shown in the table.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="ml-auto flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rebuildRecentOnly}
                      onChange={(e) => setRebuildRecentOnly(e.target.checked)}
                      className="cursor-pointer"
                    />
                    6W only
                  </label>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{rebuildRecentOnly 
                    ? "Rebuild cache for players active in the last 6 weeks only (faster)." 
                    : "Rebuild cache for ALL players with match data (slower, 400+ players)."
                  }</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleRebuildCache}
                    disabled={isRebuilding || isRecalculatingTCDCA}
                    variant="default"
                  >
                    {isRebuilding ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4" />
                        Rebuilding...
                      </>
                    ) : (
                      "Rebuild Cache"
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{rebuildRecentOnly 
                    ? "Rebuild cache for players active in the last 6 weeks only (faster)." 
                    : "Rebuild cache for ALL players with match data (slower, 400+ players)."
                  }</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Tier Simulation Tool - Link to Dedicated Page */}
      <Link to="/admin/tier-simulation">
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-900 hover:bg-purple-100/50 dark:hover:bg-purple-950/30 transition-colors cursor-pointer py-3">
          <CardContent className="p-0 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <div>
                  <p className="font-semibold text-sm">Tier Simulation Tool</p>
                  <p className="text-xs text-muted-foreground">
                    Preview how tier median changes would look if you changed specific players' tiers
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm">
                Open Tool →
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowComparisonDialog(true)}
              disabled={selectedPlayers.size < 2}
            >
              <GitCompare className="mr-2 h-4 w-4" />
              Compare ({selectedPlayers.size})
            </Button>
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
                    <p className="text-xs">Multiply holistic scores by Team Contribution (TC) and</p>
                    <p className="text-xs">Duo Carry Adjustment (DCA) factors, recalculate tier</p>
                    <p className="text-xs">medians from adjusted scores, then re-derive diffs &amp; statuses</p>
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
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedPlayers.size === displayedEvaluations.length && displayedEvaluations.length > 0}
                      onCheckedChange={toggleAllSelection}
                    />
                  </TableHead>
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
                              <p className="text-xs">Holistic score before tier-gap adjustment</p>
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
                  const effectiveStatus = getEffectiveStatus(evaluation);
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
                    <TableCell>
                      <Checkbox
                        checked={selectedPlayers.has(evaluation.playerId)}
                        onCheckedChange={() => togglePlayerSelection(evaluation.playerId)}
                      />
                    </TableCell>
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

      {/* Player Comparison Dialog */}
      <Dialog open={showComparisonDialog} onOpenChange={setShowComparisonDialog}>
        <DialogContent size="full">
          <DialogHeader>
            <DialogTitle>Player Comparison</DialogTitle>
            <DialogDescription>
              Side-by-side comparison of {selectedPlayers.size} selected player{selectedPlayers.size !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-4">
            {getSelectedPlayerData().length > 0 ? (
              <>
                {/* Comparison Table */}
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Metric</TableHead>
                        {getSelectedPlayerData().map((player) => (
                          <TableHead key={player.playerId} className="text-center">
                            <div className="space-y-1">
                              <Link
                                to={`/player/${player.playerName}`}
                                className="font-semibold hover:underline block"
                              >
                                {player.playerName}
                              </Link>
                              <Badge variant="outline" className="text-xs">
                                {player.tier}
                              </Badge>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Total Events</TableCell>
                        {getSelectedPlayerData().map((player) => (
                          <TableCell key={player.playerId} className="text-center font-mono">
                            {player.totalEvents}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help border-b border-dashed border-muted-foreground">
                                  Recent Top 3s
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs">
                                  Last 5 leaderboards (excludes "No Money" scrims)
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        {getSelectedPlayerData().map((player) => (
                          <TableCell key={player.playerId} className="text-center">
                            {player.recentTop3Count >= 3 ? (
                              <div className="flex items-center justify-center gap-1 text-green-600 font-semibold text-xs">
                                <span>✨</span>
                                <span>{player.recentTop3Count}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">{player.recentTop3Count}</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help border-b border-dashed border-muted-foreground">
                                  Recent Top 5s
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs">
                                  Last 5 leaderboards (excludes "No Money" scrims)
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        {getSelectedPlayerData().map((player) => (
                          <TableCell key={player.playerId} className="text-center">
                            {player.recentTop5Count >= 4 ? (
                              <div className="flex items-center justify-center gap-1 text-orange-600 font-semibold text-xs">
                                <span>🔥</span>
                                <span>{player.recentTop5Count}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">{player.recentTop5Count}</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Last Event Played</TableCell>
                        {getSelectedPlayerData().map((player) => (
                          <TableCell key={player.playerId} className="text-center">
                            {player.lastEventDate ? (
                              <span className="text-xs font-mono">{player.lastEventDate}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">N/A</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        {getSelectedPlayerData().map((player) => (
                          <TableCell key={player.playerId} className="text-center">
                            {getStatusBadge(player.evaluationStatus)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Player vs Player Comparisons */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">Player vs Player Comparison</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {getSelectedPlayerData().map((player, idx) => {
                      const otherPlayers = getSelectedPlayerData().filter((_, i) => i !== idx);
                      return (
                        <Card key={player.playerId}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">
                              {player.playerName} vs Others
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {otherPlayers.map((otherPlayer) => {
                              const diff = otherPlayer.holisticScore > 0
                                ? ((player.holisticScore - otherPlayer.holisticScore) / otherPlayer.holisticScore) * 100
                                : 0;
                              return (
                                <div key={otherPlayer.playerId} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">vs {otherPlayer.playerName}:</span>
                                  <span
                                    className={
                                      diff >= 15
                                        ? "font-bold text-green-600"
                                        : diff >= 5
                                          ? "font-semibold text-green-600"
                                          : diff <= -15
                                            ? "font-bold text-destructive"
                                            : diff <= -5
                                              ? "font-semibold text-orange-600"
                                              : ""
                                    }
                                  >
                                    {diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                                  </span>
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No players selected. Select up to 4 players to compare.
              </div>
            )}
          </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

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
    <AdminPageLayout skipHeader authTitle="Sign in to access tier re-evaluation">
      <TierReEvaluationContent />
    </AdminPageLayout>
  );
}
