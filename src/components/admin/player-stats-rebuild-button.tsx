import { useEffect, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function formatPlayerStatsRebuildRelativeTime(timestamp?: number) {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "< 1h ago";
}

/** Polls for stalled chains and shows progress with cancel when a rebuild is running. */
export function PlayerStatsRebuildRunningAlert() {
  const activeRebuildJob = useQuery(api.playerStatsRebuild.getActiveRebuildJob, {});
  const reconcileStatsRebuild = useMutation(api.playerStatsRebuild.cleanupPlayerStatsRebuildJobs);
  const cancelStatsRebuild = useMutation(api.playerStatsRebuild.cancelPlayerStatsRebuild);

  const isRunning = !!activeRebuildJob;

  useEffect(() => {
    if (!isRunning) return;
    void reconcileStatsRebuild({});
    const intervalId = window.setInterval(() => {
      void reconcileStatsRebuild({});
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [isRunning, reconcileStatsRebuild]);

  const runCancelStatsRebuild = async () => {
    try {
      const result = await cancelStatsRebuild({});
      if (result.cancelled > 0) {
        toast.success("Rebuild cancelled. You can start a new rebuild.");
      } else {
        toast.message("No rebuild was running.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel player stats rebuild",
      );
    }
  };

  if (!activeRebuildJob) {
    return null;
  }

  return (
    <Alert>
      <Clock className="h-4 w-4" />
      <AlertTitle>Rebuild in progress</AlertTitle>
      <AlertDescription className="space-y-1">
        <PlayerStatsRebuildProgress />
        <p className="text-xs text-muted-foreground">
          Started {formatPlayerStatsRebuildRelativeTime(activeRebuildJob.startedAt)} · last progress{" "}
          {formatPlayerStatsRebuildRelativeTime(activeRebuildJob.lastProgressAt)}
          {activeRebuildJob.totalProcessed > 0 &&
            ` · ${activeRebuildJob.totalProcessed.toLocaleString()} steps`}
        </p>
        {activeRebuildJob.appearsStuck && (
          <p className="text-sm text-muted-foreground">
            Progress has paused. This page will try to resume automatically every 30 seconds; if
            nothing changes after a few minutes, cancel and start again.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => void runCancelStatsRebuild()}>
            Cancel rebuild
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

type StopAfterPhase =
  | "event_participation"
  | "dca_mutual"
  | "top_five"
  | "tier_eval"
  | "aggregate_stats";

type PlayerStatsRebuildButtonProps = {
  label?: string;
  includeAggregateStats?: boolean;
  stopAfterPhase?: StopAfterPhase;
  /** Skip to tier-eval phase only (holistic cache rebuild). */
  tierEvalOnly?: boolean;
  /** TC → DCA → mutual-duo correction only. */
  tcDcaOnly?: boolean;
  /** Recent top-5 placement cache only. */
  topFiveOnly?: boolean;
  /** Population average stats cache only. */
  aggregateStatsOnly?: boolean;
  /** Tier-eval phase: only players with activity in the last 6 weeks (faster). */
  tierEvalRecentOnly?: boolean;
  showPhaseHint?: boolean;
  linkToDataCache?: boolean;
} & Partial<Pick<ComponentProps<typeof Button>, "variant" | "size" | "className" | "disabled">>;

export function PlayerStatsRebuildProgress({
  className,
}: {
  className?: string;
}) {
  const activeRebuildJob = useQuery(api.playerStatsRebuild.getActiveRebuildJob, {});

  if (!activeRebuildJob) {
    return (
      <span className={className ?? "text-sm text-muted-foreground"}>
        No player stats rebuild running.
      </span>
    );
  }

  return (
    <span className={className ?? "text-sm text-muted-foreground"}>
      <Clock className="inline h-4 w-4 mr-1" />
      {activeRebuildJob.rebuildKindLabel
        ? `${activeRebuildJob.rebuildKindLabel} · ${activeRebuildJob.phaseLabel}`
        : activeRebuildJob.phaseLabel}
      {activeRebuildJob.tierEvalRecentOnly ? " (6-week tier eval)" : ""}
      {activeRebuildJob.phase === "tier_eval" &&
        activeRebuildJob.tierEvalBatchCount > 0 &&
        activeRebuildJob.tierEvalBatch < activeRebuildJob.tierEvalBatchCount && (
          <>
            {" "}
            (batch {activeRebuildJob.tierEvalBatch + 1}/
            {activeRebuildJob.tierEvalBatchCount})
          </>
        )}
      {activeRebuildJob.phase === "tier_eval" &&
        activeRebuildJob.tierEvalBatchCount === 0 &&
        !activeRebuildJob.tierEvalRecentMediansDone &&
        activeRebuildJob.tierEvalInitialized !== true && (
          <>
            {" "}
            (tier-eval: {activeRebuildJob.processedInPhase.toLocaleString()} players,{" "}
            {activeRebuildJob.totalProcessed.toLocaleString()} steps)
          </>
        )}
      {activeRebuildJob.phase === "tier_eval" &&
        !activeRebuildJob.tierEvalRecentMediansDone &&
        (activeRebuildJob.tierEvalBatchCount > 0
          ? activeRebuildJob.tierEvalBatch >= activeRebuildJob.tierEvalBatchCount
          : activeRebuildJob.tierEvalInitialized === true) && (
          <> (computing recent tier medians)</>
        )}
      {activeRebuildJob.phase === "tier_eval" &&
        activeRebuildJob.tierEvalRecentMediansDone && (
          <> (finalizing recent comparisons)</>
        )}
    </span>
  );
}

export function PlayerStatsRebuildButton({
  label = "Rebuild player stats",
  includeAggregateStats = true,
  stopAfterPhase,
  tierEvalOnly = false,
  tcDcaOnly = false,
  topFiveOnly = false,
  aggregateStatsOnly = false,
  tierEvalRecentOnly = false,
  showPhaseHint = false,
  linkToDataCache = false,
  variant = "default",
  size = "default",
  className,
  disabled,
}: PlayerStatsRebuildButtonProps) {
  const activeRebuildJob = useQuery(api.playerStatsRebuild.getActiveRebuildJob, {});
  const startRebuild = useMutation(api.playerStatsRebuild.startFullPlayerStatsRebuild);

  const isRunning = !!activeRebuildJob;

  const handleClick = async () => {
    try {
      const result = await startRebuild({
        includeAggregateStats,
        stopAfterPhase,
        tierEvalOnly,
        tcDcaOnly,
        topFiveOnly,
        aggregateStatsOnly,
        tierEvalRecentOnly,
      });
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start player stats rebuild",
      );
    }
  };

  const buttonLabel = tierEvalOnly
    ? label === "Rebuild player stats"
      ? "Rebuild tier-eval cache"
      : label
    : tcDcaOnly
      ? label === "Rebuild player stats"
        ? "Recalculate TC/DCA"
        : label
      : topFiveOnly
        ? label === "Rebuild player stats"
          ? "Rebuild Top 5 cache"
          : label
        : aggregateStatsOnly
          ? label === "Rebuild player stats"
            ? "Rebuild average stats"
            : label
          : stopAfterPhase === "event_participation"
          ? "Sync Yunite event counts"
          : label;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      {showPhaseHint && <PlayerStatsRebuildProgress />}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={disabled || isRunning}
          onClick={() => void handleClick()}
        >
          {isRunning ? (
            <Spinner className="h-4 w-4 mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {isRunning ? "Rebuild running…" : buttonLabel}
        </Button>
        {linkToDataCache && (
          <Button variant="link" size="sm" className="h-auto px-0" asChild>
            <Link to="/admin/data-cache-status">View progress</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
