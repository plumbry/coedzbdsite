import { useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  AlertTriangle,
  Archive,
  Database,
  RefreshCw,
  ShieldOff,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

export default function DataMaintenanceTools() {
  const players = useQuery(api.players.getPlayers);

  const deleteDiscordOnlyMembers = useMutation(api.players.deleteDiscordOnlyMembers);
  const deleteAllPlayers = useMutation(api.players.deleteAllPlayers);
  const archiveAllWithoutDiscordId = useMutation(api.discord.archiveAllWithoutDiscordId);
  const migrateMembershipStatus = useMutation(api.migrateMembershipStatus.migratePlayerMembershipStatus);
  const fixPlacementsBatch = useAction(api.yunite.fixPlacements.fixPlacementsBatch);
  const removeAllTierRoles = useAction(api.discord.removeAllTierRoles.removeAllTierRoles);

  const recalculateAllCS = useMutation(api.calculateContributionScore.recalculateAllCS);
  const rebuildDCACache = useMutation(api.dcaCache.rebuildDCACache);
  const triggerTopFiveRebuild = useMutation(api.topFiveCache.triggerCacheRebuild);
  const initBatchRebuild = useMutation(api.tierReEvaluationBatched.initializeBatchRebuild);
  const clearHolisticCache = useMutation(api.tierReEvaluationBatched.clearCache);
  const processBatch = useMutation(api.tierReEvaluationBatched.processBatch);
  const finalizeRecent = useMutation(api.tierReEvaluationBatched.finalizeRecentComparisons);

  const [isDeletingDiscordOnly, setIsDeletingDiscordOnly] = useState(false);
  const [isDeletingAllPlayers, setIsDeletingAllPlayers] = useState(false);
  const [isArchivingNoDiscord, setIsArchivingNoDiscord] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isFixingPlacements, setIsFixingPlacements] = useState(false);
  const [isRemovingRoles, setIsRemovingRoles] = useState(false);
  const [fixProgress, setFixProgress] = useState<{ current: number; total: number } | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshStep, setRefreshStep] = useState("");
  const cancelledRef = useRef(false);

  const handleRefreshAllStats = async () => {
    const confirmed = window.confirm(
      "Refresh All Stats?\n\nThis will recalculate in order:\n1. TC (Team Contribution)\n2. DCA (Duo Carry Adjustment)\n3. Top Five Cache\n4. Holistic Scores\n\nThis may take several minutes. Continue?",
    );
    if (!confirmed) return;

    setIsRefreshingAll(true);
    cancelledRef.current = false;
    const TOAST_ID = "refresh-all";

    try {
      setRefreshStep("TC");
      toast.loading("Refreshing all stats — Step 1/4: TC...", { id: TOAST_ID, duration: Infinity });
      let tcDone = 0;
      let hasMore = true;
      const tcCutoff = Date.now();
      while (hasMore && !cancelledRef.current) {
        const r = await recalculateAllCS({ forceRecalculate: true, cutoffTimestamp: tcCutoff });
        tcDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`Step 1/4: TC — ${tcDone} players processed, ${r.remaining} remaining`, {
          id: TOAST_ID,
          duration: Infinity,
        });
        if (hasMore) await new Promise((res) => setTimeout(res, 150));
      }
      if (cancelledRef.current) throw new Error("Cancelled");

      setRefreshStep("DCA");
      toast.loading("Step 2/4: DCA...", { id: TOAST_ID, duration: Infinity });
      let dcaDone = 0;
      hasMore = true;
      while (hasMore && !cancelledRef.current) {
        const r = await rebuildDCACache({ forceRebuild: true });
        dcaDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`Step 2/4: DCA — ${dcaDone} players processed, ${r.remaining} remaining`, {
          id: TOAST_ID,
          duration: Infinity,
        });
        if (hasMore) await new Promise((res) => setTimeout(res, 150));
      }
      if (cancelledRef.current) throw new Error("Cancelled");

      setRefreshStep("Top Five");
      toast.loading("Step 3/4: Top Five Cache...", { id: TOAST_ID, duration: Infinity });
      let topFiveDone = 0;
      hasMore = true;
      while (hasMore && !cancelledRef.current) {
        const r = await triggerTopFiveRebuild({});
        topFiveDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`Step 3/4: Top Five — ${topFiveDone} players processed, ${r.remaining} remaining`, {
          id: TOAST_ID,
          duration: Infinity,
        });
        if (hasMore) await new Promise((res) => setTimeout(res, 150));
      }
      if (cancelledRef.current) throw new Error("Cancelled");

      setRefreshStep("Holistic Scores");
      toast.loading("Step 4/4: Holistic Scores — clearing old cache...", { id: TOAST_ID, duration: Infinity });
      await clearHolisticCache({});
      if (cancelledRef.current) throw new Error("Cancelled");
      toast.loading("Step 4/4: Holistic Scores — initializing...", { id: TOAST_ID, duration: Infinity });
      const init = await initBatchRebuild({});
      for (let b = 0; b < init.batchCount && !cancelledRef.current; b++) {
        toast.loading(`Step 4/4: Holistic Scores — batch ${b + 1}/${init.batchCount}`, {
          id: TOAST_ID,
          duration: Infinity,
        });
        await processBatch({ batchNumber: b });
        await new Promise((res) => setTimeout(res, 100));
      }
      if (cancelledRef.current) throw new Error("Cancelled");

      toast.loading("Step 4/4: Holistic Scores — finalizing 6-week comparisons...", {
        id: TOAST_ID,
        duration: Infinity,
      });
      await finalizeRecent({});

      toast.success("All stats refreshed successfully!", { id: TOAST_ID, duration: 5000 });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      if (msg === "Cancelled") {
        toast.info("Refresh cancelled.", { id: TOAST_ID });
      } else {
        toast.error(`Refresh failed during ${refreshStep}: ${msg}`, { id: TOAST_ID, duration: 8000 });
      }
    } finally {
      setIsRefreshingAll(false);
      setRefreshStep("");
    }
  };

  const handleDeleteDiscordOnlyMembers = async () => {
    if (!players) return;

    const discordOnlyCount = players.filter((p) => {
      const hasRealDiscordId = p.discordUserId && !p.discordUserId.startsWith("placeholder_");
      const hasNoTier = !p.tier;
      return hasRealDiscordId && hasNoTier;
    }).length;

    if (discordOnlyCount === 0) {
      toast.info("No Discord-only members to delete");
      return;
    }

    const confirmed = window.confirm(
      `⚠️ CLEAR DISCORD SYNC DATA ⚠️\n\nThis will delete ${discordOnlyCount} Discord member${discordOnlyCount === 1 ? "" : "s"} who have NOT been evaluated/assigned a tier.\n\nThis clears everything the bot has synced and reverts to your manually managed players.\n\nYour ${players.length - discordOnlyCount} evaluated player${players.length - discordOnlyCount === 1 ? "" : "s"} with tier assignments will be PRESERVED.\n\nContinue?`,
    );

    if (!confirmed) return;

    setIsDeletingDiscordOnly(true);
    try {
      const result = await deleteDiscordOnlyMembers({});
      toast.success(
        `Deleted ${result.deletedCount} Discord-only members. Preserved ${result.preservedCount} evaluated players.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete Discord members");
    } finally {
      setIsDeletingDiscordOnly(false);
    }
  };

  const handleDeleteAllPlayers = async () => {
    if (!players) return;

    const totalCount = players.length;

    if (totalCount === 0) {
      toast.info("No players to delete");
      return;
    }

    const confirmed = window.confirm(
      `⚠️ DANGER: DELETE ALL PLAYERS ⚠️\n\nAre you sure you want to delete ALL ${totalCount} player${totalCount === 1 ? "" : "s"}?\n\nThis will permanently delete:\n- ALL player profiles (including evaluated players)\n- ALL scores\n- ALL tier history\n- ALL data in the database\n\nThis action CANNOT be undone!\n\nType "DELETE ALL" to confirm.`,
    );

    if (!confirmed) return;

    const doubleConfirm = window.prompt(
      `Type "DELETE ALL" (without quotes) to confirm deletion of all ${totalCount} players:`,
    );

    if (doubleConfirm !== "DELETE ALL") {
      toast.info("Deletion cancelled - confirmation text did not match");
      return;
    }

    setIsDeletingAllPlayers(true);
    try {
      const result = await deleteAllPlayers({});
      toast.success(`Successfully deleted all ${result.deletedCount} players from the database`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete all players");
    } finally {
      setIsDeletingAllPlayers(false);
    }
  };

  const handleArchiveNoDiscord = async () => {
    const confirmed = window.confirm(
      `⚠️ ARCHIVE NO-DISCORD PLAYERS ⚠️\n\nThis will archive ALL active players who have no real Discord ID (placeholder IDs only).\n\nThey will be set to "former" status. This cannot be undone automatically.\n\nContinue?`,
    );
    if (!confirmed) return;

    setIsArchivingNoDiscord(true);
    try {
      const result = await archiveAllWithoutDiscordId({});
      toast.success(`Archived ${result.archived} players without Discord IDs`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive players");
    } finally {
      setIsArchivingNoDiscord(false);
    }
  };

  const handleMigrateMembershipStatus = async () => {
    const confirmed = window.confirm(
      `Run Membership Status Migration?\n\nThis will update all existing players to set their membership status based on their current status:\n\n• "active" players → "accepted"\n• "archived" players → "former"\n• "rejected" players → "rejected"\n• "discord_member" → (no status, not yet evaluated)\n\nThis is a one-time migration to populate the new Member Management system.\n\nContinue?`,
    );

    if (!confirmed) return;

    setIsMigrating(true);
    try {
      const result = await migrateMembershipStatus({});
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Migration failed");
    } finally {
      setIsMigrating(false);
    }
  };

  const handleFixPlacements = async () => {
    const confirmed = window.confirm(
      `Fix Yunite Leaderboard Placements?\n\nThis will re-fetch all Yunite tournament leaderboards and fix the placement values.\n\nProcesses 5 imports at a time to avoid timeouts.\n\nContinue?`,
    );

    if (!confirmed) return;

    setIsFixingPlacements(true);
    setFixProgress(null);

    let nextIndex: number | null = 0;
    let totalFixed = 0;
    let totalUpdated = 0;
    let totalEventUpdated = 0;
    let totalFailed = 0;

    try {
      while (nextIndex !== null) {
        const result = await fixPlacementsBatch({ startIndex: nextIndex });

        setFixProgress({ current: result.nextIndex ?? result.totalImports, total: result.totalImports });

        totalFixed += result.fixed;
        totalUpdated += result.resultsUpdated;
        totalEventUpdated += result.eventResultsUpdated;
        totalFailed += result.failed;

        if (result.errors.length > 0) {
          console.warn("Batch errors:", result.errors);
        }

        nextIndex = result.nextIndex;

        if (!result.isComplete) {
          toast.info(`Progress: ${result.nextIndex}/${result.totalImports} imports processed...`);
        }
      }

      toast.success(
        `Complete! Fixed ${totalFixed} imports, updated ${totalUpdated} results and ${totalEventUpdated} event results.`,
      );
      if (totalFailed > 0) {
        toast.warning(`${totalFailed} imports failed - check console for details`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fix placements failed");
    } finally {
      setIsFixingPlacements(false);
      setFixProgress(null);
    }
  };

  const handleRemoveAllTierRoles = async () => {
    const confirmed = window.confirm(
      `⚠️ REMOVE ALL TIER ROLES ⚠️\n\nThis will remove ALL tier roles (Tier S, A, B, C, D) from EVERY member in the Discord server.\n\nThis action affects real Discord roles and cannot be undone automatically.\n\nAre you sure you want to continue?`,
    );
    if (!confirmed) return;

    setIsRemovingRoles(true);
    try {
      const result = await removeAllTierRoles({});
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove tier roles");
    } finally {
      setIsRemovingRoles(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-primary">
            <RefreshCw className="h-4 w-4" />
            Refresh All Stats
          </CardTitle>
          <CardDescription className="text-xs">
            One-click recalculation of TC, DCA, Top Five, and Holistic Scores.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-3 flex items-center gap-3">
          <Button size="sm" onClick={handleRefreshAllStats} disabled={isRefreshingAll}>
            <RefreshCw className={`mr-2 h-3 w-3 ${isRefreshingAll ? "animate-spin" : ""}`} />
            {isRefreshingAll ? `Running — ${refreshStep}...` : "Refresh All Stats"}
          </Button>
          {isRefreshingAll && (
            <Button size="sm" variant="ghost" onClick={() => { cancelledRef.current = true; }}>
              Cancel
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
              <Database className="h-4 w-4" />
              Database Migration: Membership Status
            </CardTitle>
            <CardDescription className="text-xs">
              One-time migration to populate membership status for existing players.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button size="sm" variant="secondary" onClick={handleMigrateMembershipStatus} disabled={isMigrating}>
              <Database className="mr-2 h-4 w-4" />
              {isMigrating ? "Running Migration..." : "Run Migration"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
              <Wrench className="h-4 w-4" />
              Fix Yunite Leaderboard Placements
            </CardTitle>
            <CardDescription className="text-xs">
              Re-fetch all Yunite tournament leaderboards and fix placement values.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button size="sm" variant="secondary" onClick={handleFixPlacements} disabled={isFixingPlacements}>
              <Wrench className="mr-2 h-4 w-4" />
              {isFixingPlacements
                ? fixProgress
                  ? `Fixing... ${fixProgress.current}/${fixProgress.total}`
                  : "Starting..."
                : "Fix Placements"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
              <ShieldOff className="h-4 w-4" />
              Remove All Tier Roles
            </CardTitle>
            <CardDescription className="text-xs">
              Strip all tier roles (S, A, B, C, D) from every member in the Discord server.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button size="sm" variant="secondary" onClick={handleRemoveAllTierRoles} disabled={isRemovingRoles}>
              <ShieldOff className="mr-2 h-4 w-4" />
              {isRemovingRoles ? "Removing Roles..." : "Remove All Tier Roles"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
              <Archive className="h-4 w-4" />
              Archive No-Discord Players
            </CardTitle>
            <CardDescription className="text-xs">
              Archive all active players with placeholder Discord IDs (not in server).
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button size="sm" variant="secondary" onClick={handleArchiveNoDiscord} disabled={isArchivingNoDiscord}>
              <Archive className="mr-2 h-4 w-4" />
              {isArchivingNoDiscord ? "Archiving..." : "Archive No-Discord"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              Clear Discord Member List
            </CardTitle>
            <CardDescription className="text-xs">
              Delete Discord synced members who have NOT been evaluated/assigned a tier.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDeleteDiscordOnlyMembers}
              disabled={isDeletingDiscordOnly || !players || players.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeletingDiscordOnly ? "Clearing..." : "Clear Discord Sync Data"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              NUCLEAR OPTION: Delete Everything
            </CardTitle>
            <CardDescription className="text-xs">
              Delete ALL players from the database including evaluated players with tiers.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteAllPlayers}
              disabled={isDeletingAllPlayers || !players || players.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeletingAllPlayers ? "Deleting..." : "Delete EVERYTHING"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
