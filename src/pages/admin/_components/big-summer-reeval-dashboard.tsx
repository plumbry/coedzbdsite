import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowUpDown,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Search,
  Sun,
} from "lucide-react";
import PlayerProfileLink from "@/components/player-profile-link.tsx";
import { compareTierField } from "@/lib/tier-sort.ts";

type DashboardRow = {
  _id: Id<"bigSummerReEval">;
  playerId: Id<"players">;
  playerName: string;
  discordId: string;
  discordUsername: string;
  epicId?: string;
  epicUsername: string;
  fortniteTrackerLink?: string;
  currentTier?: string;
  currentDiscordTierRole: string | null;
  trackerStatus: string;
  reEvalStatus: string;
  deadlineAt?: number;
  assignedAdminId?: Id<"users">;
  assignedAdminName?: string;
  memberResponse: string;
  finalDecision?: string;
  queueStatus: string | null;
  lastUpdatedAt: number;
  notes?: string;
};

type DashboardFilter =
  | "all"
  | "needs_action"
  | "needs_tracker_link"
  | "private_tracker"
  | "missing_tracker"
  | "waiting_for_public_tracker"
  | "deadline_passed"
  | "ready_to_review"
  | "reviewed"
  | "no_change"
  | "tier_changes"
  | "access_removal_queue"
  | "access_removed"
  | "retired";

const FILTER_LABELS: Record<DashboardFilter, string> = {
  all: "All Players",
  needs_action: "Needs Action",
  needs_tracker_link: "Needs Tracker Link",
  private_tracker: "Private Tracker",
  missing_tracker: "Missing Tracker",
  waiting_for_public_tracker: "Waiting For Public Tracker",
  deadline_passed: "Deadline Passed",
  ready_to_review: "Ready To Review",
  reviewed: "Reviewed",
  no_change: "No Change",
  tier_changes: "Tier Changes",
  access_removal_queue: "Access Removal Queue",
  access_removed: "Access Removed",
  retired: "Retired",
};

function trackerBadgeClass(status: string): string {
  switch (status) {
    case "public":
    case "tracker_fixed":
      return "bg-emerald-600 hover:bg-emerald-600 text-white";
    case "private":
    case "missing":
    case "mismatch":
      return "bg-red-600 hover:bg-red-600 text-white";
    case "waiting_for_public_tracker":
    case "waiting_for_public_tracker_extended":
      return "bg-amber-500 hover:bg-amber-500 text-black";
    default:
      return "";
  }
}

function reEvalBadgeClass(status: string): string {
  switch (status) {
    case "tracker_fixed":
    case "reviewed":
    case "tier_change_complete":
      return "bg-emerald-600 hover:bg-emerald-600 text-white";
    case "waiting_initial_5_days":
    case "extended_final_5_days":
    case "queued_for_access_removal":
    case "tier_change_queued":
      return "bg-amber-500 hover:bg-amber-500 text-black";
    case "deadline_passed":
    case "extension_deadline_passed":
    case "tier_change_failed":
    case "access_removed":
      return "bg-red-600 hover:bg-red-600 text-white";
    default:
      return "";
  }
}

function formatTrackerStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatReEvalStatus(status: string): string {
  const map: Record<string, string> = {
    unchecked: "Unchecked",
    waiting_initial_5_days: "Waiting - Initial 5 Days",
    deadline_passed: "Deadline Passed",
    extended_final_5_days: "Extended - Final 5 Days",
    extension_deadline_passed: "Extension Deadline Passed",
    ready_to_review: "Ready To Review",
    reviewed: "Reviewed",
    queued_for_access_removal: "Queued For Access Removal",
    access_removed: "Access Removed",
    tier_change_queued: "Tier Change Queued",
    tier_change_complete: "Tier Change Complete",
    tier_change_failed: "Tier Change Failed",
    retired: "Retired",
  };
  return map[status] ?? status;
}

function isNeedsActionRow(row: { reEvalStatus: string; queueStatus: string | null }): boolean {
  return (
    row.reEvalStatus === "deadline_passed" ||
    row.reEvalStatus === "extension_deadline_passed" ||
    row.reEvalStatus === "tier_change_failed" ||
    row.queueStatus === "failed"
  );
}

export default function BigSummerReEvalDashboard() {
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("playerName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<Id<"bigSummerReEval"> | null>(null);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [queueConfirmOpen, setQueueConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [trackerLinkDraft, setTrackerLinkDraft] = useState("");
  const [epicIdDraft, setEpicIdDraft] = useState("");

  const initStatus = useQuery(api.bigSummerReEval.queries.getInitializationStatus, {});
  const progress = useQuery(api.bigSummerReEval.queries.getReEvalProgress, {});
  const filterCounts = useQuery(api.bigSummerReEval.queries.getFilterCounts, {});
  const rows = useQuery(api.bigSummerReEval.queries.listDashboard, {
    filter,
    search: search.trim() || undefined,
    sortField,
    sortDirection,
  });
  const admins = useQuery(api.bigSummerReEval.queries.getAdmins, {});
  const selectedDetail = useQuery(
    api.bigSummerReEval.queries.getPlayerDetail,
    selectedId ? { reEvalId: selectedId } : "skip",
  );

  const queueHealth = useQuery(api.bigSummerReEval.queries.getQueueHealth, {});
  const queuePreview = useQuery(
    api.bigSummerReEval.queries.previewQueueDiscordRoleChanges,
    queueConfirmOpen ? {} : "skip",
  );

  const initialize = useMutation(api.bigSummerReEval.mutations.initializeForActivePlayers);
  const setTrackerStatus = useMutation(api.bigSummerReEval.mutations.setTrackerStatus);
  const markDmSent = useMutation(api.bigSummerReEval.mutations.markDmSent);
  const markTicketSent = useMutation(api.bigSummerReEval.mutations.markTicketSent);
  const assignAdmin = useMutation(api.bigSummerReEval.mutations.assignAdmin);
  const setMemberResponse = useMutation(api.bigSummerReEval.mutations.setMemberResponse);
  const extendDeadline = useMutation(api.bigSummerReEval.mutations.extendDeadline);
  const removeTierAccess = useMutation(api.bigSummerReEval.mutations.removeTierAccessFromDeadline);
  const markReadyToReview = useMutation(api.bigSummerReEval.mutations.markReadyToReview);
  const markReviewed = useMutation(api.bigSummerReEval.mutations.markReviewed);
  const setFinalDecision = useMutation(api.bigSummerReEval.mutations.setFinalDecision);
  const updateNotes = useMutation(api.bigSummerReEval.mutations.updateNotes);
  const updateTrackerLink = useMutation(api.bigSummerReEval.mutations.updateTrackerLink);
  const updateEpicId = useMutation(api.bigSummerReEval.mutations.updateEpicId);
  const markActive = useMutation(api.bigSummerReEval.mutations.markActive);
  const markRetired = useMutation(api.bigSummerReEval.mutations.markRetired);
  const queueDiscordRoleChanges = useMutation(api.bigSummerReEval.mutations.queueDiscordRoleChanges);
  const resetStuckQueue = useMutation(api.bigSummerReEval.mutations.resetStuckProcessingQueueItems);

  const [isInitializing, setIsInitializing] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [isResettingQueue, setIsResettingQueue] = useState(false);

  const sortedRows = useMemo((): DashboardRow[] => {
    if (!rows) return [];
    if (sortField !== "currentTier") return rows as DashboardRow[];
    return [...(rows as DashboardRow[])].sort((a, b) => {
      return compareTierField(a.currentTier, b.currentTier, sortDirection);
    });
  }, [rows, sortField, sortDirection]);

  const pagination = useClientPagination(sortedRows, {
    pageSize: 50,
    resetDeps: [filter, search, sortField, sortDirection],
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      const result = await initialize({});
      toast.success(`Enrolled ${result.created} active members for review`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Initialization failed");
    } finally {
      setIsInitializing(false);
    }
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  const handleMemberResponse = async (
    reEvalId: Id<"bigSummerReEval">,
    response: "yes" | "no" | "unset",
    currentStatus?: string,
  ) => {
    if (response === "no" && currentStatus === "deadline_passed") {
      setSelectedId(reEvalId);
      setDeadlineModalOpen(true);
      return;
    }
    await runAction("Response updated", () =>
      setMemberResponse({ reEvalId, memberResponse: response }),
    );
  };

  const handleOpenQueueConfirm = () => {
    setQueueConfirmOpen(true);
  };

  const handleConfirmQueue = async () => {
    setIsQueueing(true);
    try {
      const result = await queueDiscordRoleChanges({});
      toast.success(`Queued ${result.queued} Discord role change(s)`);
      setQueueConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue role changes");
    } finally {
      setIsQueueing(false);
    }
  };

  const handleResetStuckQueue = async (forceAll: boolean) => {
    setIsResettingQueue(true);
    try {
      const result = await resetStuckQueue({ forceAll });
      if (result.resetCount === 0) {
        toast.message("No stuck processing items to reset");
      } else {
        toast.success(`Reset ${result.resetCount} stuck queue item(s) to pending`);
      }
      setResetConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset queue");
    } finally {
      setIsResettingQueue(false);
    }
  };

  const openDetail = (id: Id<"bigSummerReEval">, row?: { notes?: string; fortniteTrackerLink?: string; epicId?: string }) => {
    setSelectedId(id);
    setNotesDraft(row?.notes ?? "");
    setTrackerLinkDraft(row?.fortniteTrackerLink ?? "");
    setEpicIdDraft(row?.epicId ?? "");
  };

  if (initStatus === undefined || filterCounts === undefined || progress === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sun className="h-5 w-5 text-amber-500" />
                Summer Re-Eval
              </CardTitle>
              <CardDescription className="max-w-2xl">
                Member Management re-eval mode: review every active member and record a
                decision. Most members will be <strong>No Change</strong> — Discord updates
                are only queued when a decision differs from the member&apos;s current tier
                or access.
              </CardDescription>
              {progress.enrolled > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Reviewed: <strong className="text-foreground">{progress.withDecision}</strong> / {progress.enrolled}
                  </span>
                  <span>
                    No change: <strong className="text-foreground">{progress.noChange}</strong>
                  </span>
                  <span>
                    Pending review: <strong className="text-foreground">{progress.pendingReview}</strong>
                  </span>
                  <span>
                    Need Discord update: <strong className="text-foreground">{progress.needsDiscordUpdate}</strong>
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {initStatus.needsInitialization && (
                <Button size="sm" onClick={handleInitialize} disabled={isInitializing}>
                  {isInitializing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enroll All Active Members
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={handleOpenQueueConfirm}
                disabled={progress.needsDiscordUpdate === 0}
                title={
                  progress.needsDiscordUpdate === 0
                    ? "No reviewed decisions require a Discord change"
                    : undefined
                }
              >
                Queue Discord Updates ({progress.needsDiscordUpdate})
              </Button>
              {(queueHealth?.stuckProcessing ?? 0) > 0 && (
                <Button size="sm" variant="outline" onClick={() => setResetConfirmOpen(true)}>
                  Reset Stuck Queue ({queueHealth?.stuckProcessing})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FILTER_LABELS) as DashboardFilter[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? "default" : "outline"}
                className="text-xs"
                onClick={() => setFilter(key)}
              >
                {FILTER_LABELS[key]}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {filterCounts[key] ?? 0}
                </Badge>
              </Button>
            ))}
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name, Discord, Epic, tier, admin, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {!rows ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => toggleSort("playerName")}>
                          Player <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Discord ID</TableHead>
                      <TableHead>Epic ID</TableHead>
                      <TableHead>Tracker</TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => toggleSort("currentTier")}>
                          Tier <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Discord Role</TableHead>
                      <TableHead>Tracker Status</TableHead>
                      <TableHead>Re-Eval Status</TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => toggleSort("deadlineAt")}>
                          Deadline <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Queue</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.pageItems && pagination.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="text-center text-muted-foreground py-8">
                          No players match this filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagination.pageItems?.map((row) => (
                        <TableRow
                          key={row._id}
                          className={
                            isNeedsActionRow(row) ? "bg-red-500/5" : undefined
                          }
                        >
                          <TableCell className="font-medium whitespace-nowrap">
                            <PlayerProfileLink discordUsername={row.discordUsername}>
                              {row.playerName}
                            </PlayerProfileLink>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.discordId}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[120px] truncate" title={row.epicId}>
                            {row.epicId ?? "—"}
                          </TableCell>
                          <TableCell>
                            {row.fortniteTrackerLink ? (
                              <a
                                href={row.fortniteTrackerLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center text-primary hover:underline text-xs"
                              >
                                Link <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>{row.currentTier ?? "—"}</TableCell>
                          <TableCell className="text-xs">{row.currentDiscordTierRole ?? "—"}</TableCell>
                          <TableCell>
                            <Badge className={trackerBadgeClass(row.trackerStatus)}>
                              {formatTrackerStatus(row.trackerStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={reEvalBadgeClass(row.reEvalStatus)}>
                              {formatReEvalStatus(row.reEvalStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {row.deadlineAt ? format(new Date(row.deadlineAt), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{row.assignedAdminName ?? "—"}</TableCell>
                          <TableCell className="text-xs capitalize">{row.memberResponse}</TableCell>
                          <TableCell className="text-xs">
                            {row.finalDecision?.replace("_", " ") ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs capitalize">{row.queueStatus ?? "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(row.lastUpdatedAt), "MMM d HH:mm")}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => openDetail(row._id, row)}>
                                  Open details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => runAction("Marked public", () => setTrackerStatus({ reEvalId: row._id, trackerStatus: "public" }))}>
                                  Mark Public
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => runAction("Marked private", () => setTrackerStatus({ reEvalId: row._id, trackerStatus: "private" }))}>
                                  Mark Private
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => runAction("Marked missing", () => setTrackerStatus({ reEvalId: row._id, trackerStatus: "missing" }))}>
                                  Mark Missing
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => runAction("Marked mismatch", () => setTrackerStatus({ reEvalId: row._id, trackerStatus: "mismatch" }))}>
                                  Mark Mismatch
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => runAction("Waiting for tracker", () => setTrackerStatus({ reEvalId: row._id, trackerStatus: "waiting_for_public_tracker" }))}>
                                  Mark Waiting For Public Tracker
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => runAction("Tracker fixed", () => setTrackerStatus({ reEvalId: row._id, trackerStatus: "tracker_fixed" }))}>
                                  Mark Tracker Fixed
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => runAction("DM sent", () => markDmSent({ reEvalId: row._id }))}>
                                  Mark DM Sent
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => runAction("Ticket sent", () => markTicketSent({ reEvalId: row._id }))}>
                                  Mark Ticket Sent
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => runAction("Ready to review", () => markReadyToReview({ reEvalId: row._id }))}>
                                  Mark Ready To Review
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => runAction("Reviewed", () => markReviewed({ reEvalId: row._id }))}>
                                  Mark Reviewed
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={pagination.setPage}
                totalCount={pagination.totalCount}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                itemLabel="players"
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDetail?.playerName ?? "Player"} — Re-Eval</DialogTitle>
            <DialogDescription>
              Review tracker, assign admin, record decisions, and leave internal notes.
            </DialogDescription>
          </DialogHeader>
          {selectedDetail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div><span className="text-muted-foreground">Tier:</span> {selectedDetail.currentTier ?? "—"}</div>
                <div><span className="text-muted-foreground">Events:</span> {selectedDetail.eventsPlayedCount ?? 0}</div>
                <div><span className="text-muted-foreground">Yunite match data:</span> {selectedDetail.hasMatchData ? "Yes" : "No"}</div>
              </div>

              <div className="space-y-2">
                <Label>Epic ID</Label>
                <div className="flex gap-2">
                  <Input value={epicIdDraft} onChange={(e) => setEpicIdDraft(e.target.value)} />
                  <Button
                    size="sm"
                    onClick={() =>
                      selectedId &&
                      runAction("Epic ID updated", () =>
                        updateEpicId({ reEvalId: selectedId, epicId: epicIdDraft }),
                      )
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Fortnite Tracker Link</Label>
                <div className="flex gap-2">
                  <Input value={trackerLinkDraft} onChange={(e) => setTrackerLinkDraft(e.target.value)} />
                  <Button
                    size="sm"
                    onClick={() =>
                      selectedId &&
                      runAction("Tracker link updated", () =>
                        updateTrackerLink({ reEvalId: selectedId, fortniteTrackerLink: trackerLinkDraft }),
                      )
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Assigned Admin</Label>
                  <Select
                    value={selectedDetail.assignedAdminId ?? "none"}
                    onValueChange={(value) =>
                      selectedId &&
                      runAction("Admin assigned", () =>
                        assignAdmin({
                          reEvalId: selectedId,
                          assignedAdminId: value === "none" ? undefined : (value as Id<"users">),
                        }),
                      )
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {admins?.map((admin: { _id: Id<"users">; name: string }) => (
                        <SelectItem key={admin._id} value={admin._id}>{admin.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Response From Member</Label>
                  <Select
                    value={selectedDetail.memberResponse}
                    onValueChange={(value) =>
                      selectedId &&
                      handleMemberResponse(
                        selectedId,
                        value as "yes" | "no" | "unset",
                        selectedDetail.reEvalStatus,
                      )
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Unset</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Final Decision</Label>
                <Select
                  value={selectedDetail.finalDecision ?? "none"}
                  onValueChange={(value) =>
                    selectedId &&
                    value !== "none" &&
                    runAction("Decision saved", () =>
                      setFinalDecision({
                        reEvalId: selectedId,
                        finalDecision: value as "S" | "A" | "B" | "C" | "no_change" | "remove_access" | "retired",
                      }),
                    )
                  }
                >
                  <SelectTrigger><SelectValue placeholder="No decision" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No decision</SelectItem>
                    <SelectItem value="S">S — Promote</SelectItem>
                    <SelectItem value="A">A — Promote</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C — Demote</SelectItem>
                    <SelectItem value="no_change">No Change — keep current tier</SelectItem>
                    <SelectItem value="remove_access">Remove Access</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Internal Notes</Label>
                <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    selectedId &&
                    runAction("Notes saved", () => updateNotes({ reEvalId: selectedId, notes: notesDraft }))
                  }
                >
                  Save Notes
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => selectedId && runAction("Marked active", () => markActive({ reEvalId: selectedId }))}>
                  Mark Active
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectedId && runAction("Marked retired", () => markRetired({ reEvalId: selectedId }))}>
                  Mark Retired
                </Button>
              </div>

              {selectedDetail.auditLogs && selectedDetail.auditLogs.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <Label>Recent Audit</Label>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {selectedDetail.auditLogs.map((log: { _id: string; _creationTime: number; userName?: string; action: string; newValue?: string }) => (
                      <li key={log._id}>
                        {format(new Date(log._creationTime), "MMM d HH:mm")} — {log.userName ?? "System"}: {log.action}
                        {log.newValue ? ` → ${log.newValue}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deadlineModalOpen} onOpenChange={setDeadlineModalOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Tracker Deadline Reached</DialogTitle>
            <DialogDescription>
              This member has not responded or has not provided a public tracker. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() =>
                selectedId &&
                runAction("Deadline extended", async () => {
                  await extendDeadline({ reEvalId: selectedId });
                  await setMemberResponse({ reEvalId: selectedId, memberResponse: "no" });
                  setDeadlineModalOpen(false);
                })
              }
            >
              Extend 5 More Days
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                selectedId &&
                runAction("Access removal queued", async () => {
                  await removeTierAccess({ reEvalId: selectedId });
                  await setMemberResponse({ reEvalId: selectedId, memberResponse: "no" });
                  setDeadlineModalOpen(false);
                })
              }
            >
              Remove Tier Access
            </Button>
            <Button variant="outline" onClick={() => setDeadlineModalOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={queueConfirmOpen} onOpenChange={setQueueConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Queue Discord Updates</DialogTitle>
            <DialogDescription>
              Only members whose final decision differs from their current tier or access
              will be queued. Everyone else stays as-is on Discord.
            </DialogDescription>
          </DialogHeader>
          {queuePreview === undefined ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating changes...
            </div>
          ) : queuePreview.queued === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No reviewed decisions require a Discord update right now.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <p>Promotions: {queuePreview.promotions}</p>
                <p>Demotions: {queuePreview.demotions}</p>
                <p>Access Removals: {queuePreview.accessRemovals}</p>
                <p>Retirements: {queuePreview.retirements}</p>
                <p className="font-medium pt-1">Total: {queuePreview.queued}</p>
              </div>
              {queuePreview.players.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded border p-2 text-xs text-muted-foreground">
                  {queuePreview.players.slice(0, 25).map((player) => (
                    <li key={`${player.playerName}-${player.action}`}>
                      {player.playerName}
                      {player.currentTier ? ` (${player.currentTier}` : ""}
                      {player.targetTier ? ` → ${player.targetTier})` : player.currentTier ? ")" : ""}
                      {player.action === "remove_access" ? " — remove access" : ""}
                      {player.action === "retire" ? " — retire" : ""}
                    </li>
                  ))}
                  {queuePreview.players.length > 25 && (
                    <li>…and {queuePreview.players.length - 25} more</li>
                  )}
                </ul>
              )}
              <p className="text-muted-foreground">Proceed?</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueueConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmQueue}
              disabled={isQueueing || !queuePreview || queuePreview.queued === 0}
            >
              {isQueueing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reset Stuck Queue Items</DialogTitle>
            <DialogDescription>
              {queueHealth?.stuckProcessing ?? 0} item(s) have been processing for 15+ minutes.
              Stop the Discord bot before resetting to avoid duplicate role changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => handleResetStuckQueue(false)}
              disabled={isResettingQueue}
            >
              {isResettingQueue && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset stuck items (15+ min)
            </Button>
            {(queueHealth?.processing ?? 0) > (queueHealth?.stuckProcessing ?? 0) && (
              <Button
                variant="destructive"
                onClick={() => handleResetStuckQueue(true)}
                disabled={isResettingQueue}
              >
                Reset all processing ({queueHealth?.processing})
              </Button>
            )}
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
