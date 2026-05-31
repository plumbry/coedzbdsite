import { useState, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { 
  Download, Users, Zap, AlertTriangle, Trash2, Database, Wrench, Archive, RefreshCw, ShieldOff,
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import RoleGate from "@/components/role-gate.tsx";
import ExportOptionsDialog from "../_components/export-options-dialog.tsx";
import MergePlayersDialog from "../_components/merge-players-dialog.tsx";
import RelinkResultsButton from "../_components/relink-results-button.tsx";
import YuniteDashboard from "../_components/yunite-dashboard.tsx";
import GoogleSheetsManager from "../_components/google-sheets-manager.tsx";
import TierSnapshotTool from "../_components/tier-snapshot-tool.tsx";
import { toast } from "sonner";

function FeaturesContent() {
  const { isAdmin } = useUserRole();
  const players = useQuery(api.players.getPlayers);
  const evaluations = useQuery(api.tierReEvaluation.getCachedTierReEvaluationData);
  
  const deleteDiscordOnlyMembers = useMutation(api.players.deleteDiscordOnlyMembers);
  const deleteAllPlayers = useMutation(api.players.deleteAllPlayers);
  const archiveAllWithoutDiscordId = useMutation(api.discord.archiveAllWithoutDiscordId);
  const migrateMembershipStatus = useMutation(api.migrateMembershipStatus.migratePlayerMembershipStatus);
  const fixPlacementsBatch = useAction(api.yunite.fixPlacements.fixPlacementsBatch);
  const removeAllTierRoles = useAction(api.discord.removeAllTierRoles.removeAllTierRoles);
  
  // Refresh-all stat mutations
  const recalculateAllCS = useMutation(api.calculateContributionScore.recalculateAllCS);
  const rebuildDCACache = useMutation(api.dcaCache.rebuildDCACache);
  const triggerTopFiveRebuild = useMutation(api.topFiveCache.triggerCacheRebuild);
  const initBatchRebuild = useMutation(api.tierReEvaluationBatched.initializeBatchRebuild);
  const clearHolisticCache = useMutation(api.tierReEvaluationBatched.clearCache);
  const processBatch = useMutation(api.tierReEvaluationBatched.processBatch);
  const finalizeRecent = useMutation(api.tierReEvaluationBatched.finalizeRecentComparisons);
  
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
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
  
  // Show loading while checking permissions
  if (isAdmin === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!isAdmin) {
    return (
      <RoleGate
        allowed={false}
        description="This page is only accessible to administrators."
        showBackButton={false}
      />
    );
  }
  
  const handleRefreshAllStats = async () => {
    const confirmed = window.confirm(
      "Refresh All Stats?\n\nThis will recalculate in order:\n1. TC (Team Contribution)\n2. DCA (Duo Carry Adjustment)\n3. Top Five Cache\n4. Holistic Scores\n\nThis may take several minutes. Continue?"
    );
    if (!confirmed) return;
    
    setIsRefreshingAll(true);
    cancelledRef.current = false;
    const TOAST_ID = "refresh-all";
    
    try {
      // Step 1: TC
      setRefreshStep("TC");
      toast.loading("Refreshing all stats — Step 1/4: TC...", { id: TOAST_ID, duration: Infinity });
      let tcDone = 0;
      let hasMore = true;
      const tcCutoff = Date.now(); // Consistent cutoff for the entire TC run
      while (hasMore && !cancelledRef.current) {
        const r = await recalculateAllCS({ forceRecalculate: true, cutoffTimestamp: tcCutoff });
        tcDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`Step 1/4: TC — ${tcDone} players processed, ${r.remaining} remaining`, { id: TOAST_ID, duration: Infinity });
        if (hasMore) await new Promise(res => setTimeout(res, 150));
      }
      if (cancelledRef.current) throw new Error("Cancelled");
      
      // Step 2: DCA
      setRefreshStep("DCA");
      toast.loading("Step 2/4: DCA...", { id: TOAST_ID, duration: Infinity });
      let dcaDone = 0;
      hasMore = true;
      while (hasMore && !cancelledRef.current) {
        const r = await rebuildDCACache({ forceRebuild: true });
        dcaDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`Step 2/4: DCA — ${dcaDone} players processed, ${r.remaining} remaining`, { id: TOAST_ID, duration: Infinity });
        if (hasMore) await new Promise(res => setTimeout(res, 150));
      }
      if (cancelledRef.current) throw new Error("Cancelled");
      
      // Step 3: Top Five Cache
      setRefreshStep("Top Five");
      toast.loading("Step 3/4: Top Five Cache...", { id: TOAST_ID, duration: Infinity });
      let topFiveDone = 0;
      hasMore = true;
      while (hasMore && !cancelledRef.current) {
        const r = await triggerTopFiveRebuild({});
        topFiveDone += r.success + r.failed;
        if (r.remaining <= 0 || (r.success === 0 && r.failed === 0)) hasMore = false;
        toast.loading(`Step 3/4: Top Five — ${topFiveDone} players processed, ${r.remaining} remaining`, { id: TOAST_ID, duration: Infinity });
        if (hasMore) await new Promise(res => setTimeout(res, 150));
      }
      if (cancelledRef.current) throw new Error("Cancelled");
      
      // Step 4: Holistic Scores (batched)
      setRefreshStep("Holistic Scores");
      toast.loading("Step 4/4: Holistic Scores — clearing old cache...", { id: TOAST_ID, duration: Infinity });
      await clearHolisticCache({});
      if (cancelledRef.current) throw new Error("Cancelled");
      toast.loading("Step 4/4: Holistic Scores — initializing...", { id: TOAST_ID, duration: Infinity });
      const init = await initBatchRebuild({});
      for (let b = 0; b < init.batchCount && !cancelledRef.current; b++) {
        toast.loading(`Step 4/4: Holistic Scores — batch ${b + 1}/${init.batchCount}`, { id: TOAST_ID, duration: Infinity });
        await processBatch({ batchNumber: b });
        await new Promise(res => setTimeout(res, 100));
      }
      if (cancelledRef.current) throw new Error("Cancelled");
      
      // Finalize 6-week comparisons
      toast.loading("Step 4/4: Holistic Scores — finalizing 6-week comparisons...", { id: TOAST_ID, duration: Infinity });
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
    
    // Count Discord-only members (have real Discord ID but no tier)
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
      `⚠️ CLEAR DISCORD SYNC DATA ⚠️\n\nThis will delete ${discordOnlyCount} Discord member${discordOnlyCount === 1 ? '' : 's'} who have NOT been evaluated/assigned a tier.\n\nThis clears everything the bot has synced and reverts to your manually managed players.\n\nYour ${players.length - discordOnlyCount} evaluated player${players.length - discordOnlyCount === 1 ? '' : 's'} with tier assignments will be PRESERVED.\n\nContinue?`
    );

    if (!confirmed) return;

    setIsDeletingDiscordOnly(true);
    try {
      const result = await deleteDiscordOnlyMembers({});
      toast.success(`Deleted ${result.deletedCount} Discord-only members. Preserved ${result.preservedCount} evaluated players.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete Discord members";
      toast.error(errorMessage);
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
      `⚠️ DANGER: DELETE ALL PLAYERS ⚠️\n\nAre you sure you want to delete ALL ${totalCount} player${totalCount === 1 ? '' : 's'}?\n\nThis will permanently delete:\n- ALL player profiles (including evaluated players)\n- ALL scores\n- ALL tier history\n- ALL data in the database\n\nThis action CANNOT be undone!\n\nType "DELETE ALL" to confirm.`
    );

    if (!confirmed) return;

    // Extra confirmation
    const doubleConfirm = window.prompt(
      `Type "DELETE ALL" (without quotes) to confirm deletion of all ${totalCount} players:`
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
      const errorMessage = error instanceof Error ? error.message : "Failed to delete all players";
      toast.error(errorMessage);
    } finally {
      setIsDeletingAllPlayers(false);
    }
  };

  const handleArchiveNoDiscord = async () => {
    const confirmed = window.confirm(
      `⚠️ ARCHIVE NO-DISCORD PLAYERS ⚠️\n\nThis will archive ALL active players who have no real Discord ID (placeholder IDs only).\n\nThey will be set to "former" status. This cannot be undone automatically.\n\nContinue?`
    );
    if (!confirmed) return;

    setIsArchivingNoDiscord(true);
    try {
      const result = await archiveAllWithoutDiscordId({});
      toast.success(`Archived ${result.archived} players without Discord IDs`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to archive players";
      toast.error(errorMessage);
    } finally {
      setIsArchivingNoDiscord(false);
    }
  };
  
  const handleExportEvaluations = (filters?: { tiers: string[]; statuses: string[] }) => {
    if (!evaluations?.evaluations || evaluations.evaluations.length === 0) {
      toast.error("No evaluations to export");
      return;
    }

    // Filter evaluations if filters provided
    let filteredEvaluations = evaluations.evaluations;
    if (filters) {
      filteredEvaluations = evaluations.evaluations.filter((evaluation) => {
        const tierMatch = filters.tiers.includes(evaluation.tier);
        const statusMatch = filters.statuses.includes(evaluation.evaluationStatus);
        return tierMatch && statusMatch;
      });
    }

    if (filteredEvaluations.length === 0) {
      toast.error("No evaluations match the selected filters");
      return;
    }

    const headers = [
      "Player Name",
      "Discord Username",
      "Tier",
      "Events",
      "Holistic Score",
      "Placement Score",
      "Win Rate Score",
      "Kills Score",
      "Deaths Score",
      "Avg Placement",
      "Win Rate %",
      "Kills/Match",
      "Deaths/Match",
      "Power Score",
      "Avg PR per Event",
      "vs Tier %",
      "vs Above %",
      "vs Below %",
      "Evaluation Status",
    ];

    const rows = filteredEvaluations.map((p) => [
      p.playerName,
      p.discordUsername,
      p.tier,
      p.totalEvents,
      p.holisticScore.toFixed(1),
      p.placementScore.toFixed(1),
      p.winRateScore.toFixed(1),
      p.killsScore.toFixed(1),
      (p.deathsScore ?? 0).toFixed(1),
      p.avgPlacement.toFixed(1),
      p.winRate.toFixed(1),
      p.killsPerMatch.toFixed(1),
      (p.deathsPerMatch ?? 0).toFixed(1),
      p.finalPowerScore.toFixed(2),
      p.avgPRPerEvent.toFixed(2),
      (p.holisticVsSameTier ?? 0).toFixed(1),
      (p.promotionDiff ?? 0).toFixed(1),
      (p.demotionDiff ?? 0).toFixed(1),
      p.evaluationStatus,
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `player-evaluations-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredEvaluations.length} evaluations to CSV`);
  };
  
  const handleMigrateMembershipStatus = async () => {
    const confirmed = window.confirm(
      `Run Membership Status Migration?\n\nThis will update all existing players to set their membership status based on their current status:\n\n• "active" players → "accepted"\n• "archived" players → "former"\n• "rejected" players → "rejected"\n• "discord_member" → (no status, not yet evaluated)\n\nThis is a one-time migration to populate the new Member Management system.\n\nContinue?`
    );

    if (!confirmed) return;

    setIsMigrating(true);
    try {
      const result = await migrateMembershipStatus({});
      toast.success(result.message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Migration failed";
      toast.error(errorMessage);
    } finally {
      setIsMigrating(false);
    }
  };
  
  const handleFixPlacements = async () => {
    const confirmed = window.confirm(
      `Fix Yunite Leaderboard Placements?\n\nThis will re-fetch all Yunite tournament leaderboards and fix the placement values.\n\nProcesses 5 imports at a time to avoid timeouts.\n\nContinue?`
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
        `Complete! Fixed ${totalFixed} imports, updated ${totalUpdated} results and ${totalEventUpdated} event results.`
      );
      if (totalFailed > 0) {
        toast.warning(`${totalFailed} imports failed - check console for details`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Fix placements failed";
      toast.error(errorMessage);
    } finally {
      setIsFixingPlacements(false);
      setFixProgress(null);
    }
  };
  
  const handleRemoveAllTierRoles = async () => {
    const confirmed = window.confirm(
      `⚠️ REMOVE ALL TIER ROLES ⚠️\n\nThis will remove ALL tier roles (Tier S, A, B, C, D) from EVERY member in the Discord server.\n\nThis action affects real Discord roles and cannot be undone automatically.\n\nAre you sure you want to continue?`
    );
    if (!confirmed) return;

    setIsRemovingRoles(true);
    try {
      const result = await removeAllTierRoles({});
      toast.success(result.message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to remove tier roles";
      toast.error(errorMessage);
    } finally {
      setIsRemovingRoles(false);
    }
  };
  
  return (
    <div className="space-y-4">
            {/* Refresh All Stats */}
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
                <Button
                  size="sm"
                  onClick={handleRefreshAllStats}
                  disabled={isRefreshingAll}
                >
                  <RefreshCw className={`mr-2 h-3 w-3 ${isRefreshingAll ? "animate-spin" : ""}`} />
                  {isRefreshingAll ? `Running — ${refreshStep}...` : "Refresh All Stats"}
                </Button>
                {isRefreshingAll && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { cancelledRef.current = true; }}
                  >
                    Cancel
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions - Horizontal Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Export Player Evaluations */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Export Player Evaluations</CardTitle>
                  <CardDescription className="text-xs">
                    Export all player evaluation data to CSV
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    onClick={() => setIsExportDialogOpen(true)}
                    disabled={!evaluations || !evaluations.evaluations || evaluations.evaluations.length === 0}
                  >
                    <Download className="mr-2 h-3 w-3" />
                    Export Evaluations
                  </Button>
                </CardContent>
              </Card>
              
              {/* Merge Duplicate Players */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Merge Duplicate Players</CardTitle>
                  <CardDescription className="text-xs">
                    Merge duplicate player records into a single record
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    onClick={() => setIsMergeDialogOpen(true)}
                  >
                    <Users className="mr-2 h-3 w-3" />
                    Merge Players
                  </Button>
                </CardContent>
              </Card>
              
              {/* Relink Third Party Results */}
              <Card className="border-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-primary">
                    <Zap className="h-4 w-4" />
                    Relink Third Party Results
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Re-link tournament results. Use if player stats aren't showing after database changes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <RelinkResultsButton />
                </CardContent>
              </Card>
            </div>
            
            {/* Tier Snapshot Export Tool */}
            <TierSnapshotTool />
            
            {/* Database Migrations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="border-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
                    <Database className="h-4 w-4" />
                    Database Migration: Membership Status
                  </CardTitle>
                  <CardDescription className="text-xs">
                    One-time migration to populate membership status for existing players. Run this to make players appear in the Member Management tabs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleMigrateMembershipStatus}
                    disabled={isMigrating}
                  >
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
                    Re-fetch all Yunite tournament leaderboards and fix placement values. Use if team ranks appear incorrect.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleFixPlacements}
                    disabled={isFixingPlacements}
                  >
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
            
            {/* Dangerous Actions - Horizontal Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Remove All Tier Roles */}
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
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleRemoveAllTierRoles}
                    disabled={isRemovingRoles}
                  >
                    <ShieldOff className="mr-2 h-4 w-4" />
                    {isRemovingRoles ? "Removing Roles..." : "Remove All Tier Roles"}
                  </Button>
                </CardContent>
              </Card>

              {/* Archive No-Discord Players */}
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
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleArchiveNoDiscord}
                    disabled={isArchivingNoDiscord}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    {isArchivingNoDiscord ? "Archiving..." : "Archive No-Discord"}
                  </Button>
                </CardContent>
              </Card>

              {/* Clear Discord Members */}
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
              
              {/* Nuclear Option - Delete Everything */}
              <Card className="border-destructive">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    ⚠️ NUCLEAR OPTION: Delete Everything
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
            
            <GoogleSheetsManager />
            <YuniteDashboard showMatchData={false} />
      
      {/* Dialogs */}
      <ExportOptionsDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onExport={handleExportEvaluations}
      />
      
      <MergePlayersDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
      />
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <AdminPageLayout
      title="Features"
      description="Advanced admin tools and utilities"
    >
      <FeaturesContent />
    </AdminPageLayout>
  );
}

