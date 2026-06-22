import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils.ts";
import { mobileActionGroupContentsClass } from "@/lib/mobile-buttons.ts";

type DiscordSyncToolsProps = {
  compact?: boolean;
  /** Single prominent button for Admin Features — runs full sync workflow. */
  featured?: boolean;
};

export function DiscordSyncTools({ compact = false, featured = false }: DiscordSyncToolsProps) {
  const syncAcceptedMembers = useAction(api.discord.sync.syncAcceptedMembers);
  const syncAllGuildMembers = useAction(api.discord.sync.syncAllGuildMembers);
  const syncPendingRoleChanges = useAction(api.discord.adminSync.syncPendingRoleChanges);
  const rebuildDiscordSyncCache = useMutation(api.discord.rebuildDiscordSyncCache);

  const syncStatus = useQuery(api.sync.getSyncStatus, { syncType: "discord" });

  const [isSyncingAccepted, setIsSyncingAccepted] = useState(false);
  const [isSyncingRoles, setIsSyncingRoles] = useState(false);
  const [isRebuildingCache, setIsRebuildingCache] = useState(false);
  const [isRunningFullSync, setIsRunningFullSync] = useState(false);
  const [confirmAcceptedOpen, setConfirmAcceptedOpen] = useState(false);
  const [confirmFullSyncOpen, setConfirmFullSyncOpen] = useState(false);

  const isBusy =
    isSyncingAccepted || isSyncingRoles || isRebuildingCache || isRunningFullSync;
  const inProgress = syncStatus?.status === "in_progress";

  const handleSyncAcceptedMembers = async () => {
    setConfirmAcceptedOpen(false);
    setIsSyncingAccepted(true);
    try {
      const result = await syncAcceptedMembers();
      const autoAcceptedSummary =
        result.autoAccepted > 0 ? `, ${result.autoAccepted} auto-accepted` : "";
      toast.success(
        `Synced ${result.totalMembers} member(s): ${result.added} added, ${result.updated} updated${autoAcceptedSummary}${result.skipped > 0 ? `, ${result.skipped} not in server` : ""}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync members");
    } finally {
      setIsSyncingAccepted(false);
    }
  };

  const handleSyncPendingRoles = async () => {
    setIsSyncingRoles(true);
    try {
      const result = await syncPendingRoleChanges();
      if (result.rolesAdded === 0 && result.rolesRemoved === 0) {
        toast.info("No pending Discord role changes");
      } else {
        toast.success(
          `Role sync: ${result.rolesAdded} added, ${result.rolesRemoved} removed${result.errors > 0 ? `, ${result.errors} error(s)` : ""}`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync pending roles");
    } finally {
      setIsSyncingRoles(false);
    }
  };

  const handleRebuildCache = async () => {
    setIsRebuildingCache(true);
    try {
      const result = await rebuildDiscordSyncCache();
      toast.success(`Discord sync cache rebuilt (${result.playerCount} players)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rebuild cache");
    } finally {
      setIsRebuildingCache(false);
    }
  };

  const handleFullDiscordSync = async () => {
    setConfirmFullSyncOpen(false);
    setIsRunningFullSync(true);
    const loadingId = toast.loading("Discord sync in progress…");
    try {
      const cache = await rebuildDiscordSyncCache();
      const members = await syncAllGuildMembers();
      const roles = await syncPendingRoleChanges();

      const roleSummary =
        roles.rolesAdded === 0 && roles.rolesRemoved === 0
          ? "no pending role changes"
          : `${roles.rolesAdded} role(s) added, ${roles.rolesRemoved} removed`;

      const autoAcceptedSummary =
        members.autoAccepted > 0 ? `, ${members.autoAccepted} auto-accepted` : "";

      toast.success(
        `Discord sync complete: cache ${cache.playerCount} players, ${members.totalMembers} member(s) synced (${members.updated} updated${autoAcceptedSummary})${members.archived != null && members.archived > 0 ? `, ${members.archived} archived` : ""}, ${roleSummary}`,
        { id: loadingId },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Discord sync failed", {
        id: loadingId,
      });
    } finally {
      setIsRunningFullSync(false);
    }
  };

  const statusLine =
    syncStatus?.lastSyncTime != null
      ? `${syncStatus.status} · ${format(new Date(syncStatus.lastSyncTime), "MMM d, yyyy h:mm a")}`
      : "No sync run yet";

  const buttons = (
    <div
      className={cn(
        compact ? mobileActionGroupContentsClass : "flex flex-wrap gap-2",
      )}
    >
      <Button
        size="sm"
        variant="secondary"
        disabled={isBusy || inProgress}
        onClick={() => setConfirmAcceptedOpen(true)}
        className={compact ? "h-7 px-1.5 text-[11px] sm:h-8 sm:px-3 sm:text-sm" : undefined}
      >
        {isSyncingAccepted || inProgress ? (
          <Loader2 className={compact ? "h-3.5 w-3.5 animate-spin sm:mr-1.5" : "mr-1.5 h-3.5 w-3.5 animate-spin"} />
        ) : (
          <RefreshCw className={compact ? "h-3.5 w-3.5 sm:mr-1.5" : "mr-1.5 h-3.5 w-3.5"} />
        )}
        {compact ? (
          <>
            <span className="sm:hidden">Discord</span>
            <span className="hidden sm:inline">Sync membership from Discord</span>
          </>
        ) : (
          "Sync membership from Discord"
        )}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={isBusy}
        onClick={handleSyncPendingRoles}
        className={compact ? "h-7 px-1.5 text-[11px] sm:h-8 sm:px-3 sm:text-sm" : undefined}
      >
        {isSyncingRoles ? (
          <Loader2 className={compact ? "h-3.5 w-3.5 animate-spin sm:mr-1.5" : "mr-1.5 h-3.5 w-3.5 animate-spin"} />
        ) : (
          <RefreshCw className={compact ? "h-3.5 w-3.5 sm:mr-1.5" : "mr-1.5 h-3.5 w-3.5"} />
        )}
        {compact ? (
          <>
            <span className="sm:hidden">Role sync</span>
            <span className="hidden sm:inline">Sync pending role changes</span>
          </>
        ) : (
          "Sync pending role changes"
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isBusy}
        onClick={handleRebuildCache}
        className={compact ? "h-7 px-1.5 text-[11px] sm:h-8 sm:px-3 sm:text-sm" : undefined}
      >
        {isRebuildingCache ? (
          <Loader2 className={compact ? "h-3.5 w-3.5 animate-spin sm:mr-1.5" : "mr-1.5 h-3.5 w-3.5 animate-spin"} />
        ) : (
          <RefreshCw className={compact ? "h-3.5 w-3.5 sm:mr-1.5" : "mr-1.5 h-3.5 w-3.5"} />
        )}
        {compact ? (
          <>
            <span className="sm:hidden">Rebuild</span>
            <span className="hidden sm:inline">Rebuild sync cache</span>
          </>
        ) : (
          "Rebuild sync cache"
        )}
      </Button>
    </div>
  );

  const fullSyncConfirmDialog = (
    <AlertDialog open={confirmFullSyncOpen} onOpenChange={setConfirmFullSyncOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run full Discord sync?</AlertDialogTitle>
          <AlertDialogDescription>
            This will rebuild the sync cache, sync every Discord guild member (including pending
            applications and former members), archive members who left the server, then apply any
            pending event-ban or probation role changes. It may take several minutes for large
            rosters.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleFullDiscordSync}>Discord Sync</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (featured) {
    return (
      <Card className="border-primary">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-primary">
            <Zap className="h-4 w-4" />
            Discord Sync
          </CardTitle>
          <CardDescription className="text-xs">
            Daily auto-sync at 5:00 AM UTC · {statusLine}
            {inProgress && syncStatus?.recordsAdded != null && (
              <>
                {" "}
                · {syncStatus.recordsUpdated ?? 0}/{syncStatus.recordsAdded} members processed
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="py-3 space-y-2">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={isBusy || inProgress}
            onClick={() => setConfirmFullSyncOpen(true)}
          >
            {isRunningFullSync || inProgress ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Discord Sync
          </Button>
          <p className="text-xs text-muted-foreground">
            Rebuilds cache, runs a full guild sync, and applies pending role changes. Per-member
            sync is in Edit Player on Member Management.
          </p>
        </CardContent>
        {fullSyncConfirmDialog}
      </Card>
    );
  }

  if (compact) {
    return (
      <>
        {buttons}
        <AlertDialog open={confirmAcceptedOpen} onOpenChange={setConfirmAcceptedOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sync membership from Discord?</AlertDialogTitle>
              <AlertDialogDescription>
                Fetches Discord profile and role data for accepted members, former members, pending
                applications, and Discord-tab members. Members with tier roles are auto-accepted or
                restored to Accepted. This may take several minutes for large rosters.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSyncAcceptedMembers}>
                Sync now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Discord Sync</CardTitle>
        <CardDescription className="text-xs">
          Daily auto-sync at 5:00 AM UTC. Status updates via live subscription — {statusLine}
          {inProgress && syncStatus?.recordsAdded != null && (
            <>
              {" "}
              · {syncStatus.recordsUpdated ?? 0}/{syncStatus.recordsAdded} processed
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="py-3 space-y-3">
        {buttons}
        <p className="text-xs text-muted-foreground">
          Per-member sync is available in the Edit Player dialog. Full guild sync runs automatically
          once daily via cron.
        </p>
      </CardContent>
      <AlertDialog open={confirmAcceptedOpen} onOpenChange={setConfirmAcceptedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync membership from Discord?</AlertDialogTitle>
            <AlertDialogDescription>
              Fetches Discord profile and role data for accepted members, former members, pending
              applications, and Discord-tab members. Members with tier roles are auto-accepted or
              restored to Accepted. This may take several minutes for large rosters.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSyncAcceptedMembers}>Sync now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
