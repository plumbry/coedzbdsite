import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useAction, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Search, Ban, Clock, AlertTriangle, TrendingUp, Trash2, CalendarCheck, Undo2, Lock, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/use-user-role.ts";
import CreateBanDialog from "./create-ban-dialog.tsx";
import EditBanDialog, { type EditableBan } from "./edit-ban-dialog.tsx";
import PageHeader from "@/components/page-header.tsx";
import ConfirmDialog from "@/components/confirm-dialog.tsx";
import { formatDistanceToNow } from "date-fns";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";

type PendingConfirm = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => Promise<void>;
} | null;

function formatPendingAge(ageMs: number) {
  return formatDistanceToNow(Date.now() - ageMs, { addSuffix: true });
}

interface EventBansManagerProps {
  readOnly?: boolean;
  viewerToken?: string;
  onEndViewSession?: () => void;
}

export default function EventBansManager({
  readOnly = false,
  viewerToken,
  onEndViewSession,
}: EventBansManagerProps) {
  const { hasEventBanAccess } = useUserRole();
  const canEdit = !readOnly && hasEventBanAccess;
  const queryArgs = viewerToken ? { viewerToken } : {};

  const [activeTab, setActiveTab] = useState<"active" | "history" | "offenses">("active");
  const [searchQuery, setSearchQuery] = useState("");

  const activeBans = useQuery(api.eventBans.queries.getActiveBans, queryArgs);
  const {
    results: endedBans,
    status: endedBansStatus,
    loadMore: loadMoreEndedBans,
  } = usePaginatedQuery(
    api.eventBans.queries.getEndedBansPaginated,
    activeTab === "history" ? queryArgs : "skip",
    { initialNumItems: 25 },
  );
  const syncStatus = useQuery(api.eventBans.queries.getSyncStatus, queryArgs);
  const roleSyncVisibility = useQuery(
    api.eventBans.queries.getRoleSyncVisibility,
    readOnly ? "skip" : {},
  );
  const offenseCounts = useQuery(api.eventBans.queries.getOffenseCounts, queryArgs);
  const eventPassedMeta = useQuery(api.eventBans.queries.getEventPassedMetadata, queryArgs);
  const eventPassedMutation = useMutation(api.eventBans.mutations.eventPassed);
  const undoEventPassedMutation = useMutation(api.eventBans.mutations.undoEventPassed);
  const forceRoleSyncAction = useAction(api.eventBans.roleSync.forceRoleSync);
  const [isEventPassing, setIsEventPassing] = useState(false);
  const [isRoleSyncing, setIsRoleSyncing] = useState(false);
  const [eventPassedCountdown, setEventPassedCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [eventPassedQty, setEventPassedQty] = useState(1);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const cancelEventPassed = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setEventPassedCountdown(null);
    toast.info("Event passed cancelled.");
  }, []);

  const handleEventPassed = () => {
    if (eventPassedCountdown !== null) {
      // Already counting down, treat click as cancel
      cancelEventPassed();
      return;
    }

    setEventPassedCountdown(30);
    toast.info(`Event Passed (×${eventPassedQty}) will execute in 30 seconds. Click the button again to cancel.`);

    countdownRef.current = setInterval(() => {
      setEventPassedCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Fire the mutation when countdown reaches null after being active
  const prevCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevCountdownRef.current;
    prevCountdownRef.current = eventPassedCountdown;

    // Countdown just finished (prev was a number, now it's null)
    if (prev !== null && prev <= 1 && eventPassedCountdown === null) {
      const executeMutation = async () => {
        setIsEventPassing(true);
        try {
          const result = await eventPassedMutation({ count: eventPassedQty });
          toast.success(`Event passed (×${eventPassedQty}): ${result.decremented} bans decremented, ${result.ended} bans ended`);
        } catch (error) {
          toast.error("Failed to process event passed.");
        } finally {
          setIsEventPassing(false);
        }
      };
      executeMutation();
    }
  }, [eventPassedCountdown, eventPassedMutation, eventPassedQty]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  const handleForceRoleSync = async () => {
    setIsRoleSyncing(true);
    try {
      const result = await forceRoleSyncAction({});
      if (result.rolesAdded === 0 && result.rolesRemoved === 0 && result.errors === 0) {
        toast.info("No pending Discord role syncs");
        return;
      }

      const parts = [];
      if (result.rolesAdded > 0) {
        parts.push(`${result.rolesAdded} role${result.rolesAdded === 1 ? "" : "s"} added`);
      }
      if (result.rolesRemoved > 0) {
        parts.push(`${result.rolesRemoved} role${result.rolesRemoved === 1 ? "" : "s"} removed`);
      }

      const errorSuffix =
        result.errors > 0
          ? `${result.errors} error${result.errors === 1 ? "" : "s"}${
              result.errorMessages.length > 0
                ? `: ${result.errorMessages.slice(0, 3).join("; ")}`
                : ""
            }`
          : "";

      if (result.errors > 0 && parts.length === 0) {
        toast.error(`Role sync failed with ${errorSuffix}`);
      } else if (result.errors > 0) {
        toast.warning(`Role sync partially complete: ${parts.join(", ")}. ${errorSuffix}`);
      } else {
        toast.success(`Role sync complete: ${parts.join(", ")}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run role sync");
    } finally {
      setIsRoleSyncing(false);
    }
  };

  const handleUndoEventPassed = () => {
    setPendingConfirm({
      title: "Undo last event passed?",
      description:
        "This will increment remaining events and reactivate any bans ended today.",
      confirmLabel: "Undo",
      variant: "destructive",
      onConfirm: async () => {
        setIsUndoing(true);
        try {
          const result = await undoEventPassedMutation({});
          toast.success(
            `Undo complete: ${result.incremented} bans incremented, ${result.reactivated} bans reactivated`,
          );
        } catch {
          toast.error("Failed to undo event passed.");
        } finally {
          setIsUndoing(false);
        }
      },
    });
  };


  const filterBans = (bans: typeof activeBans) => {
    if (!bans) return [];
    if (!searchQuery.trim()) return bans;
    const query = searchQuery.toLowerCase();
    return bans.filter(
      (ban) =>
        ban.playerTag.toLowerCase().includes(query) ||
        ban.discordId.includes(query) ||
        ban.reason.toLowerCase().includes(query) ||
        ban.moderatorTag.toLowerCase().includes(query) ||
        (ban.epicUsername && ban.epicUsername.toLowerCase().includes(query))
    );
  };

  const filterOffenses = (counts: typeof offenseCounts) => {
    if (!counts) return [];
    if (!searchQuery.trim()) return counts;
    const query = searchQuery.toLowerCase();
    return counts.filter(
      (entry) =>
        entry.playerTag.toLowerCase().includes(query) ||
        entry.discordId.includes(query) ||
        (entry.epicUsername && entry.epicUsername.toLowerCase().includes(query))
    );
  };

  const filteredActive = filterBans(activeBans);
  const filteredEnded = filterBans(endedBans);
  const filteredOffenses = filterOffenses(offenseCounts);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Event Bans"
        description="Synced to the Mod Log Google Sheet"
        icon={Ban}
        actions={
          readOnly ? (
            <>
              <Badge variant="secondary" className="text-xs">
                View only
              </Badge>
              {onEndViewSession && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="cursor-pointer h-8 text-xs sm:text-sm"
                  onClick={onEndViewSession}
                >
                  <Lock className="mr-1 h-3.5 w-3.5" />
                  End session
                </Button>
              )}
            </>
          ) : canEdit ? (
            <>
              <div className="flex flex-col items-start gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CreateBanDialog onEventPassed={handleEventPassed} />
                  <Button
                    onClick={handleEventPassed}
                    disabled={isEventPassing}
                    size="sm"
                    variant={eventPassedCountdown !== null ? "destructive" : "secondary"}
                    className="cursor-pointer h-8 text-xs sm:text-sm"
                  >
                    <CalendarCheck className={`mr-1 h-3.5 w-3.5 ${isEventPassing ? "animate-pulse" : ""}`} />
                    {isEventPassing
                      ? "Processing..."
                      : eventPassedCountdown !== null
                        ? `Cancel (${eventPassedCountdown}s)`
                        : `Event Passed${eventPassedQty > 1 ? ` (×${eventPassedQty})` : ""}`}
                  </Button>
                </div>
                {syncStatus && syncStatus.activeBans > 0 && (
                  <p className="max-w-[16rem] sm:max-w-xs text-[10px] sm:text-xs leading-snug text-amber-700">
                    If an event has just finished, click Event Passed before adding a ban.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] sm:text-xs text-muted-foreground">Qty:</span>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={eventPassedQty}
                  onChange={(e) => setEventPassedQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="w-12 h-7 sm:h-8 text-center text-xs sm:text-sm"
                  disabled={isEventPassing || eventPassedCountdown !== null}
                />
              </div>
              <Button
                onClick={handleUndoEventPassed}
                disabled={isUndoing}
                size="sm"
                variant="ghost"
                className="cursor-pointer h-8 text-xs sm:text-sm"
              >
                <Undo2 className={`mr-1 h-3.5 w-3.5 ${isUndoing ? "animate-pulse" : ""}`} />
                {isUndoing ? "..." : "Undo"}
              </Button>
              <Button
                onClick={handleForceRoleSync}
                disabled={isRoleSyncing}
                size="sm"
                variant="outline"
                className="cursor-pointer h-8 text-xs sm:text-sm"
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isRoleSyncing ? "animate-spin" : ""}`} />
                {isRoleSyncing ? "Syncing..." : "Role Sync"}
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Last Event Passed indicator */}
      {eventPassedMeta && (
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Last &quot;Event Passed&quot;:{" "}
            {formatDistanceToNow(new Date(eventPassedMeta.lastEventPassedAt), { addSuffix: true })}
            {eventPassedMeta.lastEventPassedBy && (
              <span className="ml-1">by {eventPassedMeta.lastEventPassedBy}</span>
            )}
          </span>
        </div>
      )}

      {/* Stats */}
      {syncStatus && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-4">
          <Card>
            <CardContent className="p-2 sm:pt-6 sm:p-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-3">
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Ban className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-destructive" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-2xl font-bold">{syncStatus.activeBans}</p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2 sm:pt-6 sm:p-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-3">
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-2xl font-bold">{syncStatus.endedBans}</p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Historical</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2 sm:pt-6 sm:p-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-3">
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-2xl font-bold">{syncStatus.totalBans}</p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2 sm:pt-6 sm:p-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-3">
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-amber-600" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-2xl font-bold">
                    {roleSyncVisibility
                      ? roleSyncVisibility.pendingRoleAdds + roleSyncVisibility.pendingRoleRemovals
                      : "-"}
                  </p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Role sync</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {roleSyncVisibility &&
        roleSyncVisibility.pendingRoleAdds + roleSyncVisibility.pendingRoleRemovals > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3 text-sm text-amber-950">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-medium">Discord role sync pending</p>
                  <p className="text-xs">
                    {roleSyncVisibility.pendingRoleAdds} add
                    {roleSyncVisibility.pendingRoleAdds === 1 ? "" : "s"} and{" "}
                    {roleSyncVisibility.pendingRoleRemovals} removal
                    {roleSyncVisibility.pendingRoleRemovals === 1 ? "" : "s"} are waiting
                    for Discord. Use Role Sync to process them now, or wait for the bot poll.
                    {roleSyncVisibility.oldestPendingAddAgeMs !== null && (
                      <>
                        {" "}
                        Oldest pending add:{" "}
                        {formatPendingAge(roleSyncVisibility.oldestPendingAddAgeMs)}.
                      </>
                    )}
                    {roleSyncVisibility.oldestPendingRemovalAgeMs !== null && (
                      <>
                        {" "}
                        Oldest pending removal:{" "}
                        {formatPendingAge(roleSyncVisibility.oldestPendingRemovalAgeMs)}.
                      </>
                    )}
                  </p>
                </div>
                </div>
                <Button
                  onClick={handleForceRoleSync}
                  disabled={isRoleSyncing}
                  size="sm"
                  variant="outline"
                  className="cursor-pointer shrink-0 border-amber-400 bg-white/80 hover:bg-white"
                >
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isRoleSyncing ? "animate-spin" : ""}`} />
                  {isRoleSyncing ? "Syncing..." : "Role Sync"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Tabs & Search */}
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-0.5 sm:gap-2">
          <Button
            variant={activeTab === "active" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("active")}
            className="cursor-pointer text-xs sm:text-sm h-8 px-2 sm:px-3"
          >
            Active
            {activeBans && (
              <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
                {filteredActive.length}
              </Badge>
            )}
          </Button>
          <Button
            variant={activeTab === "history" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("history")}
            className="cursor-pointer text-xs sm:text-sm h-8 px-2 sm:px-3"
          >
            History
            {syncStatus && (
              <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
                {activeTab === "history" ? filteredEnded.length : syncStatus.endedBans}
              </Badge>
            )}
          </Button>
          <Button
            variant={activeTab === "offenses" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("offenses")}
            className="cursor-pointer text-xs sm:text-sm h-8 px-2 sm:px-3"
          >
            <TrendingUp className="mr-0.5 sm:mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Offenses
            {offenseCounts && (
              <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
                {filteredOffenses.length}
              </Badge>
            )}
          </Button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search player, reason, mod..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 sm:h-9 text-sm"
          />
        </div>
      </div>

      {/* Content */}
      {activeTab === "offenses" ? (
        <OffenseCountsTable
          offenses={filteredOffenses}
          isLoading={offenseCounts === undefined}
          canDelete={canEdit}
        />
      ) : (
        <BansTable
          bans={activeTab === "active" ? filteredActive : filteredEnded}
          isLoading={
            activeTab === "active"
              ? activeBans === undefined
              : endedBansStatus === "LoadingFirstPage"
          }
          emptyMessage={
            searchQuery
              ? "No bans match your search"
              : activeTab === "active"
                ? "No active event bans"
                : "No historical bans yet"
          }
          canDelete={canEdit}
        />
      )}
      {activeTab === "history" && endedBansStatus === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => loadMoreEndedBans(25)}>
            Load more
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel}
        variant={pendingConfirm?.variant}
        onConfirm={async () => {
          if (pendingConfirm) await pendingConfirm.onConfirm();
        }}
      />
    </div>
  );
}

function BansTable({
  bans,
  isLoading,
  emptyMessage,
  canDelete,
}: {
  bans: Array<EditableBan>;
  isLoading: boolean;
  emptyMessage: string;
  canDelete: boolean;
}) {
  const deleteBanAction = useAction(api.eventBans.sync.deleteBan);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingBan, setEditingBan] = useState<EditableBan | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const bansPagination = useClientPagination(bans);

  const handleDelete = (ban: { _id: string; playerTag: string }) => {
    setPendingConfirm({
      title: `Delete ban for ${ban.playerTag}?`,
      description:
        "This will remove the ban from the site and the Google Sheet.",
      confirmLabel: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        setDeletingId(ban._id);
        try {
          const result = await deleteBanAction({ banId: ban._id as Id<"eventBans"> });
          if (result.removedFromSheet) {
            toast.success("Ban deleted from site and Google Sheet");
          } else {
            toast.success("Ban deleted from site (could not find matching row in sheet)");
          }
        } catch {
          toast.error("Failed to delete ban");
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (bans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Ban className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Mobile card view */}
      <div className="sm:hidden space-y-3">
        {(bansPagination.pageItems ?? []).map((ban) => (
          <Card key={ban._id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{ban.playerTag}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{ban.discordId}</p>
                </div>
                {canDelete && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 cursor-pointer"
                      onClick={() => setEditingBan(ban)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      disabled={deletingId === ban._id}
                      onClick={() => handleDelete(ban)}
                    >
                      <Trash2 className={`h-4 w-4 ${deletingId === ban._id ? "animate-pulse" : ""}`} />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <BanTypeBadge type={ban.banType} />
                <OffenseTrackBadge track={ban.offenseTrack} number={ban.offenseNumber} />
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {ban.remainingEvents}/{ban.originalEvents} events
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{ban.reason}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Mod: {ban.moderatorTag}</span>
                <span>{ban.startDate}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop table view */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Player</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Track</th>
                  <th className="text-left p-3 font-medium">Events</th>
                  <th className="text-left p-3 font-medium">Start</th>
                  <th className="text-left p-3 font-medium">Updated</th>
                  <th className="text-left p-3 font-medium">Reason</th>
                  <th className="text-left p-3 font-medium">Moderator</th>
                  {canDelete && <th className="text-left p-3 font-medium w-20"></th>}
                </tr>
              </thead>
              <tbody>
                {(bansPagination.pageItems ?? []).map((ban) => (
                  <tr key={ban._id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{ban.playerTag}</p>
                        <p className="text-xs text-muted-foreground font-mono">{ban.discordId}</p>
                      </div>
                    </td>
                    <td className="p-3">
                      <BanTypeBadge type={ban.banType} />
                    </td>
                    <td className="p-3">
                      <OffenseTrackBadge track={ban.offenseTrack} number={ban.offenseNumber} />
                    </td>
                    <td className="p-3">
                      <span className="font-mono">
                        {ban.remainingEvents}/{ban.originalEvents}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">{ban.startDate}</td>
                    <td className="p-3 whitespace-nowrap">{ban.lastUpdated}</td>
                    <td className="p-3 max-w-xs">
                      <p className="truncate" title={ban.reason}>
                        {ban.reason}
                      </p>
                    </td>
                    <td className="p-3 whitespace-nowrap">{ban.moderatorTag}</td>
                    {canDelete && (
                      <td className="p-3">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 cursor-pointer"
                            onClick={() => setEditingBan(ban)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            disabled={deletingId === ban._id}
                            onClick={() => handleDelete(ban)}
                          >
                            <Trash2 className={`h-4 w-4 ${deletingId === ban._id ? "animate-pulse" : ""}`} />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <TablePagination
        page={bansPagination.page}
        totalPages={bansPagination.totalPages}
        totalCount={bansPagination.totalCount}
        startIndex={bansPagination.startIndex}
        endIndex={bansPagination.endIndex}
        onPageChange={bansPagination.setPage}
        itemLabel="bans"
      />

      <EditBanDialog
        ban={editingBan}
        onOpenChange={(open) => !open && setEditingBan(null)}
      />

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel}
        variant={pendingConfirm?.variant}
        onConfirm={async () => {
          if (pendingConfirm) await pendingConfirm.onConfirm();
        }}
      />
    </>
  );
}

function OffenseCountsTable({
  offenses,
  isLoading,
  canDelete,
}: {
  offenses: Array<{
    discordId: string;
    playerTag: string;
    minorCount: number;
    majorCount: number;
    highestMinor: number;
    highestMajor: number;
  }>;
  isLoading: boolean;
  canDelete: boolean;
}) {
  const deleteOffenses = useAction(api.eventBans.sync.deletePlayerOffenses);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const handleDeleteOffenses = (discordId: string, playerTag: string) => {
    setPendingConfirm({
      title: `Delete all offenses for ${playerTag}?`,
      description:
        "This removes all ban entries with offense tracking for this player from both the site and the Google Sheet.",
      confirmLabel: "Delete all",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const result = await deleteOffenses({ discordId });
          toast.success(
            `Deleted ${result.deleted} offense record(s) for ${playerTag}${result.removedFromSheet > 0 ? ` (${result.removedFromSheet} removed from sheet)` : ""}`,
          );
        } catch {
          toast.error("Failed to delete offense records.");
        }
      },
    });
  };

  const sorted = useMemo(
    () =>
      [...offenses].sort(
        (a, b) => b.minorCount + b.majorCount - (a.minorCount + a.majorCount),
      ),
    [offenses],
  );
  const offensesPagination = useClientPagination(sorted);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (offenses.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No offense data tracked yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Offenses are parsed from bans with "[Minor offense #N]" or "[Major offense #N]" in the reason
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-sm sm:text-base">Offense Progression per Player</CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Shows how far each player is along the minor and major discipline tracks
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile card view */}
        <div className="sm:hidden divide-y">
          {(offensesPagination.pageItems ?? []).map((entry) => (
            <div key={entry.discordId} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{entry.playerTag}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{entry.discordId}</p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => handleDeleteOffenses(entry.discordId, entry.playerTag)}
                    className="text-destructive hover:text-destructive/80 cursor-pointer shrink-0"
                    title="Delete all offenses for this player"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[10px]">Minor</p>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-amber-600 font-semibold">{entry.minorCount}</span>
                    <MinorStageBadge count={entry.highestMinor || entry.minorCount} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[10px]">Major</p>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-red-600 font-semibold">{entry.majorCount}</span>
                    <MajorStageBadge count={entry.highestMajor || entry.majorCount} />
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Total: <span className="font-mono font-semibold text-foreground">{entry.minorCount + entry.majorCount}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Player</th>
                <th className="text-left p-3 font-medium">Minor Offenses</th>
                <th className="text-left p-3 font-medium">Minor Stage</th>
                <th className="text-left p-3 font-medium">Major Offenses</th>
                <th className="text-left p-3 font-medium">Major Stage</th>
                <th className="text-left p-3 font-medium">Total</th>
                {canDelete && <th className="p-3 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {(offensesPagination.pageItems ?? []).map((entry) => (
                <tr key={entry.discordId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div>
                      <p className="font-medium">{entry.playerTag}</p>
                      <p className="text-xs text-muted-foreground font-mono">{entry.discordId}</p>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-amber-600 font-semibold">
                      {entry.minorCount}
                    </span>
                  </td>
                  <td className="p-3">
                    <MinorStageBadge count={entry.highestMinor || entry.minorCount} />
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-red-600 font-semibold">
                      {entry.majorCount}
                    </span>
                  </td>
                  <td className="p-3">
                    <MajorStageBadge count={entry.highestMajor || entry.majorCount} />
                  </td>
                  <td className="p-3">
                    <span className="font-mono font-semibold">
                      {entry.minorCount + entry.majorCount}
                    </span>
                  </td>
                  {canDelete && (
                    <td className="p-3">
                      <button
                        onClick={() => handleDeleteOffenses(entry.discordId, entry.playerTag)}
                        className="text-destructive hover:text-destructive/80 cursor-pointer"
                        title="Delete all offenses for this player"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <TablePagination
      page={offensesPagination.page}
      totalPages={offensesPagination.totalPages}
      totalCount={offensesPagination.totalCount}
      startIndex={offensesPagination.startIndex}
      endIndex={offensesPagination.endIndex}
      onPageChange={offensesPagination.setPage}
      itemLabel="players"
    />

    <ConfirmDialog
      open={pendingConfirm !== null}
      onOpenChange={(open) => !open && setPendingConfirm(null)}
      title={pendingConfirm?.title ?? ""}
      description={pendingConfirm?.description ?? ""}
      confirmLabel={pendingConfirm?.confirmLabel}
      variant={pendingConfirm?.variant}
      onConfirm={async () => {
        if (pendingConfirm) await pendingConfirm.onConfirm();
      }}
    />
  </>
  );
}

function BanTypeBadge({ type }: { type: string }) {
  const lower = type.toLowerCase();
  if (lower === "probation") {
    return (
      <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border-purple-200">
        Probation (Server Ban)
      </Badge>
    );
  }
  if (lower === "minor warning") {
    return (
      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">
        Minor Warning
      </Badge>
    );
  }
  if (lower === "major warning") {
    return (
      <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-200">
        Major Warning
      </Badge>
    );
  }
  if (lower.includes("minor")) {
    return (
      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">
        {type}
      </Badge>
    );
  }
  if (lower.includes("major")) {
    return (
      <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-200">
        {type}
      </Badge>
    );
  }
  if (lower === "event ban") {
    return (
      <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 border-orange-200">
        Event Ban
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      {type || "All Events"}
    </Badge>
  );
}

function OffenseTrackBadge({ track, number }: { track?: string; number?: number }) {
  if (!track) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  if (track === "minor") {
    return (
      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">
        Minor #{number ?? "?"}
      </Badge>
    );
  }
  if (track === "major") {
    return (
      <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-200">
        Major #{number ?? "?"}
      </Badge>
    );
  }
  if (track === "probation") {
    return (
      <Badge variant="secondary" className="bg-red-500/10 text-red-700 border-red-200">
        Probation
      </Badge>
    );
  }
  return <span className="text-muted-foreground text-xs">—</span>;
}

// Minor progression: 1=Warning, 2=1 Event Ban, 3=Extended Ban, ∞=Probation
function MinorStageBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground text-xs">None</span>;
  if (count === 1) return <Badge variant="secondary" className="bg-green-500/10 text-green-700 border-green-200">1st - Warning</Badge>;
  if (count === 2) return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">2nd - 1 Event Ban</Badge>;
  if (count === 3) return <Badge variant="secondary" className="bg-orange-500/10 text-orange-700 border-orange-200">3rd - Extended Ban</Badge>;
  return <Badge variant="destructive">Probation</Badge>;
}

// Major progression: 1=Warning, 2=Multi-Event Ban, 3=Probation, 4=Final Warning, 5+=Kick
function MajorStageBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground text-xs">None</span>;
  if (count === 1) return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">1st - Warning</Badge>;
  if (count === 2) return <Badge variant="secondary" className="bg-orange-500/10 text-orange-700 border-orange-200">2nd - Multi-Event Ban</Badge>;
  if (count === 3) return <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-200">3rd - Probation</Badge>;
  if (count === 4) return <Badge variant="destructive">4th - Final Warning</Badge>;
  return <Badge variant="destructive">5+ - Removal</Badge>;
}
