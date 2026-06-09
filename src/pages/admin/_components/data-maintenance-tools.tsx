import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  AlertTriangle,
  Archive,
  Database,
  ShieldOff,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/confirm-dialog.tsx";
import {
  PlayerStatsRebuildButton,
  PlayerStatsRebuildProgress,
  PlayerStatsRebuildRunningAlert,
} from "@/components/admin/player-stats-rebuild-button.tsx";
import { PlayerStatsMigrationChecklist } from "@/components/admin/player-stats-migration-checklist.tsx";

type PendingConfirm = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  confirmText?: string;
  onConfirm: () => Promise<void>;
} | null;

export default function DataMaintenanceTools() {
  const players = useQuery(api.players.getPlayers);
  const deprecatedRankingCounts = useQuery(
    api.clearDeprecatedPlayerRankingFields.countPlayersWithDeprecatedRankingFields,
  );
  const deprecatedTierEvalPrCounts = useQuery(
    api.clearDeprecatedTierEvalPrFields.countRowsWithDeprecatedTierEvalPrFields,
  );

  const deleteDiscordOnlyMembers = useMutation(api.players.deleteDiscordOnlyMembers);
  const deleteAllPlayers = useMutation(api.players.deleteAllPlayers);
  const archiveAllWithoutDiscordId = useMutation(api.discord.archiveAllWithoutDiscordId);
  const migrateMembershipStatus = useMutation(api.migrateMembershipStatus.migratePlayerMembershipStatus);
  const fixPlacementsBatch = useAction(api.yunite.fixPlacements.fixPlacementsBatch);
  const removeAllTierRoles = useAction(api.discord.removeAllTierRoles.removeAllTierRoles);
  const clearDeprecatedRankingFields = useMutation(
    api.clearDeprecatedPlayerRankingFields.clearDeprecatedPlayerRankingFields,
  );
  const clearDeprecatedTierEvalPrFields = useMutation(
    api.clearDeprecatedTierEvalPrFields.clearDeprecatedTierEvalPrFields,
  );
  const activeStatsRebuild = useQuery(api.playerStatsRebuild.getActiveRebuildJob, {});
  const activeCacheRebuild = useQuery(api.playerStatsCache.getActiveCacheRebuildJob, {});
  const rebuildAllPlayerStatsCache = useMutation(api.playerStatsCache.rebuildAllPlayerStatsCache);
  const rebuildTierReevaluation = useMutation(api.playerStatsCache.rebuildTierReevaluationForEligible);

  const [isDeletingDiscordOnly, setIsDeletingDiscordOnly] = useState(false);
  const [isDeletingAllPlayers, setIsDeletingAllPlayers] = useState(false);
  const [isArchivingNoDiscord, setIsArchivingNoDiscord] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isFixingPlacements, setIsFixingPlacements] = useState(false);
  const [isRemovingRoles, setIsRemovingRoles] = useState(false);
  const [isClearingDeprecatedRanking, setIsClearingDeprecatedRanking] = useState(false);
  const [isClearingTierEvalPr, setIsClearingTierEvalPr] = useState(false);
  const [fixProgress, setFixProgress] = useState<{ current: number; total: number } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const runClearDeprecatedRankingFields = async () => {
    setIsClearingDeprecatedRanking(true);
    try {
      const result = await clearDeprecatedRankingFields({});
      if (result.started) {
        toast.success(result.message);
      } else {
        toast.info(result.message);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to clear legacy player stat fields",
      );
    } finally {
      setIsClearingDeprecatedRanking(false);
    }
  };

  const runClearDeprecatedTierEvalPrFields = async () => {
    setIsClearingTierEvalPr(true);
    try {
      const result = await clearDeprecatedTierEvalPrFields({});
      if (result.started) {
        toast.success(result.message);
      } else {
        toast.info(result.message);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to clear legacy tier-evaluation fields",
      );
    } finally {
      setIsClearingTierEvalPr(false);
    }
  };

  const runDeleteDiscordOnlyMembers = async () => {
    if (!players) return;

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

  const runDeleteAllPlayers = async () => {
    if (!players) return;

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

  const runArchiveNoDiscord = async () => {
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

  const runMigrateMembershipStatus = async () => {
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

  const runFixPlacements = async () => {
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

  const runRemoveAllTierRoles = async () => {
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

  const promptClearDiscordSync = () => {
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

    setPendingConfirm({
      title: "Clear Discord sync data?",
      description: `This will delete ${discordOnlyCount} Discord member${discordOnlyCount === 1 ? "" : "s"} who have NOT been evaluated/assigned a tier.\n\nYour ${players.length - discordOnlyCount} evaluated player${players.length - discordOnlyCount === 1 ? "" : "s"} with tier assignments will be preserved.`,
      confirmLabel: "Clear Discord Sync Data",
      variant: "destructive",
      onConfirm: runDeleteDiscordOnlyMembers,
    });
  };

  return (
    <div className="space-y-4">
      <PlayerStatsMigrationChecklist
        variant="maintenance"
        clearingPlayerPr={isClearingDeprecatedRanking}
        clearingTierEvalPr={isClearingTierEvalPr}
        onRequestClearPlayerPr={() =>
          setPendingConfirm({
            title: "Clear legacy player stat fields?",
            description:
              deprecatedRankingCounts?.withDeprecatedFields
                ? `This will unset powerScore and rankingStats on ${deprecatedRankingCounts.withDeprecatedFields} player document(s) in the background.`
                : "No legacy fields were found. The migration will exit immediately.",
            confirmLabel: "Clear Legacy Fields",
            onConfirm: runClearDeprecatedRankingFields,
          })
        }
        onRequestClearTierEvalPr={() =>
          setPendingConfirm({
            title: "Clear legacy tier-evaluation fields?",
            description:
              deprecatedTierEvalPrCounts?.withDeprecatedFields
                ? `This will remove avgPRPerEvent and finalPowerScore from ${deprecatedTierEvalPrCounts.withDeprecatedFields} tier-eval cache row(s) in the background.`
                : "No legacy fields were found. The migration will exit immediately.",
            confirmLabel: "Clear tier-evaluation fields",
            onConfirm: runClearDeprecatedTierEvalPrFields,
          })
        }
      />

      <Card className="border-primary bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-primary">Rebuild Player Stats</CardTitle>
          <CardDescription className="text-xs">
            Unified pipeline: event participation, TC, DCA, top-five cache, and tier-eval holistic
            scores (with raw + TC/DCA-adjusted values).
          </CardDescription>
        </CardHeader>
        <CardContent className="py-3 space-y-2">
          <PlayerStatsRebuildRunningAlert />
          {!activeStatsRebuild && (
            <PlayerStatsRebuildProgress className="text-xs text-muted-foreground" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <PlayerStatsRebuildButton
              size="sm"
              label="Rebuild all player stats"
              showPhaseHint={false}
              linkToDataCache
            />
            <PlayerStatsRebuildButton size="sm" variant="outline" label="TC/DCA only" tcDcaOnly />
            <PlayerStatsRebuildButton size="sm" variant="outline" label="Top 5 only" topFiveOnly />
            <PlayerStatsRebuildButton
              size="sm"
              variant="outline"
              label="Tier-eval only"
              tierEvalOnly
            />
            <PlayerStatsRebuildButton
              size="sm"
              variant="outline"
              label="Average stats only"
              aggregateStatsOnly
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!!activeCacheRebuild}
              onClick={() =>
                setPendingConfirm({
                  title: "Rebuild all player stats cache?",
                  description:
                    "Rebuilds per-player stats cache rows for every matched import result. Runs in batches and only touches players with imported data.",
                  confirmLabel: "Rebuild cache",
                  onConfirm: async () => {
                    const result = await rebuildAllPlayerStatsCache({ confirm: true });
                    toast.success(
                      result.collectingPlayerIds
                        ? "Player stats cache rebuild started (collecting players with import data)…"
                        : `Player stats cache rebuild started for ${result.playerCount} players.`,
                    );
                  },
                })
              }
            >
              Rebuild stats cache
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!activeStatsRebuild}
              onClick={() =>
                setPendingConfirm({
                  title: "Rebuild tier re-evaluation cache?",
                  description:
                    "Rebuilds tier evaluation entries for players with 8+ Yunite import events only.",
                  confirmLabel: "Rebuild tier eval",
                  onConfirm: async () => {
                    const result = await rebuildTierReevaluation({ confirm: true });
                    toast.success(result.message);
                  },
                })
              }
            >
              Rebuild tier re-eval
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setPendingConfirm({
                  title: "Run membership status migration?",
                  description:
                    'This will update all existing players:\n\n• "active" → "accepted"\n• "archived" → "former"\n• "rejected" → "rejected"\n• "discord_member" → (no status)\n\nThis is a one-time migration.',
                  confirmLabel: "Run Migration",
                  onConfirm: runMigrateMembershipStatus,
                })
              }
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
              Re-fetch all Yunite tournament leaderboards and fix placement values.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setPendingConfirm({
                  title: "Fix Yunite leaderboard placements?",
                  description:
                    "This will re-fetch all Yunite tournament leaderboards and fix placement values.\n\nProcesses 5 imports at a time to avoid timeouts.",
                  confirmLabel: "Fix Placements",
                  onConfirm: runFixPlacements,
                })
              }
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setPendingConfirm({
                  title: "Remove all tier roles?",
                  description:
                    "This will remove ALL tier roles (Tier S, A, B, C, D) from EVERY member in the Discord server.\n\nThis affects real Discord roles and cannot be undone automatically.",
                  confirmLabel: "Remove All Tier Roles",
                  variant: "destructive",
                  onConfirm: runRemoveAllTierRoles,
                })
              }
              disabled={isRemovingRoles}
            >
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setPendingConfirm({
                  title: "Archive no-Discord players?",
                  description:
                    'This will archive ALL active players who have no real Discord ID (placeholder IDs only).\n\nThey will be set to "former" status.',
                  confirmLabel: "Archive No-Discord",
                  variant: "destructive",
                  onConfirm: runArchiveNoDiscord,
                })
              }
              disabled={isArchivingNoDiscord}
            >
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
              onClick={promptClearDiscordSync}
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
              onClick={() => {
                if (!players || players.length === 0) return;
                setPendingConfirm({
                  title: "Delete ALL players?",
                  description: `This will permanently delete all ${players.length} players, scores, tier history, and related data. This cannot be undone.`,
                  confirmLabel: "Delete EVERYTHING",
                  variant: "destructive",
                  confirmText: "DELETE ALL",
                  onConfirm: runDeleteAllPlayers,
                });
              }}
              disabled={isDeletingAllPlayers || !players || players.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeletingAllPlayers ? "Deleting..." : "Delete EVERYTHING"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel}
        variant={pendingConfirm?.variant}
        confirmText={pendingConfirm?.confirmText}
        onConfirm={async () => {
          if (pendingConfirm) await pendingConfirm.onConfirm();
        }}
      />
    </div>
  );
}
