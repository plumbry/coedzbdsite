import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowUpDown,
  ExternalLink,
  Search,
  Sun,
} from "lucide-react";
import PlayerProfileLink from "@/components/player-profile-link.tsx";
import { compareTierField } from "@/lib/tier-sort.ts";
import ScorePlayerDialog from "@/pages/_components/score-player-dialog.tsx";

type DashboardRow = {
  _id: Id<"bigSummerReEval">;
  playerId: Id<"players">;
  playerName: string;
  discordId: string;
  discordUsername: string;
  epicUsername: string;
  fortniteTrackerLink?: string;
  currentTier?: string;
  reEvalStatus: string;
  assignedAdminId?: Id<"users">;
  assignedAdminName?: string;
  finalDecision?: string;
  evaluationStatus?: string;
  evaluationStatusRaw?: string;
  evaluationTargetTier?: string;
  evaluatedAt?: number;
  triageOutcome?: string;
  triageSuggestedOutcome?: string;
  triageSuggestionReason?: string;
  triagedAt?: number;
  summerTotalScore?: number;
  summerTier?: string;
  eventsPlayedCount?: number;
  hasMatchData?: boolean;
  appliedAt?: number;
  appliedTier?: string;
  lastUpdatedAt: number;
  notes?: string;
};

type DashboardFilter = "all" | "S" | "A" | "B" | "C";
type EventsFilter = "all" | "0" | "1-2" | "3+";
type TriageFilter = "all" | "pending" | "no_change" | "needs_full_review" | "private_tracker";
type YuniteFilter = "all" | "yes" | "no";

const TRIAGE_LABELS: Record<string, string> = {
  no_change: "No Change",
  needs_full_review: "Needs Full Review",
  private_tracker: "Private Tracker",
  pending: "Pending",
};

const FILTER_OPTIONS: DashboardFilter[] = ["all", "S", "A", "B", "C"];

const FILTER_LABELS: Record<DashboardFilter, string> = {
  all: "All Players",
  S: "S Tier",
  A: "A Tier",
  B: "B Tier",
  C: "C Tier",
};

function reEvalBadgeClass(status: string): string {
  switch (status) {
    case "reviewed":
    case "tier_change_complete":
      return "bg-emerald-600 hover:bg-emerald-600 text-white";
    case "waiting_initial_5_days":
    case "extended_final_5_days":
    case "private_tracker":
      return "bg-amber-500 hover:bg-amber-500 text-black";
    case "deadline_passed":
    case "extension_deadline_passed":
    case "tier_removal_flagged":
    case "tier_change_failed":
    case "access_removed":
      return "bg-red-600 hover:bg-red-600 text-white";
    default:
      return "";
  }
}

function formatReEvalStatus(status: string): string {
  const map: Record<string, string> = {
    unchecked: "Unchecked",
    private_tracker: "Private Tracker",
    tier_removal_flagged: "Tier Removal Flagged",
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
  };
  return map[status] ?? status;
}

export default function BigSummerReEvalDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFinalStageView = searchParams.get("stage") === "final";
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [eventsFilter, setEventsFilter] = useState<EventsFilter>("all");
  const [adminFilter, setAdminFilter] = useState("all");
  const [triageFilter, setTriageFilter] = useState<TriageFilter>("all");
  const [yuniteFilter, setYuniteFilter] = useState<YuniteFilter>("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("playerName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<Id<"bigSummerReEval"> | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [scoreRow, setScoreRow] = useState<DashboardRow | null>(null);
  const [firstStageConfirmOpen, setFirstStageConfirmOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [trackerLinkDraft, setTrackerLinkDraft] = useState("");

  const workflowState = useQuery(api.bigSummerReEval.queries.getWorkflowState, {});
  const finalReview = useQuery(
    api.bigSummerReEval.queries.listFinalReview,
    isFinalStageView ? {} : "skip",
  );
  const progress = useQuery(api.bigSummerReEval.queries.getReEvalProgress, {});
  const filterCounts = useQuery(api.bigSummerReEval.queries.getFilterCounts, {});
  const rows = useQuery(api.bigSummerReEval.queries.listDashboard, {});
  const admins = useQuery(api.bigSummerReEval.queries.getAdmins, {});
  const selectedDetail = useQuery(
    api.bigSummerReEval.queries.getPlayerDetail,
    selectedId ? { reEvalId: selectedId } : "skip",
  );

  const saveSummerEvaluationScore = useMutation(api.bigSummerReEval.mutations.saveSummerEvaluationScore);
  const setTriageOutcome = useMutation(api.bigSummerReEval.mutations.setTriageOutcome);
  const bulkSetTriageOutcome = useMutation(api.bigSummerReEval.mutations.bulkSetTriageOutcome);
  const completeFirstStage = useMutation(api.bigSummerReEval.mutations.completeFirstStage);
  const completeReEval = useMutation(api.bigSummerReEval.mutations.completeReEval);
  const updateNotes = useMutation(api.bigSummerReEval.mutations.updateNotes);
  const updateTrackerLink = useMutation(api.bigSummerReEval.mutations.updateTrackerLink);

  const sortedRows = useMemo((): DashboardRow[] => {
    if (!rows) return [];
    const searchTerm = search.trim().toLowerCase();
    const filtered = (rows as DashboardRow[]).filter((row) => {
      if (filter !== "all" && row.currentTier !== filter) return false;
      const events = row.eventsPlayedCount ?? 0;
      if (eventsFilter === "0" && events !== 0) return false;
      if (eventsFilter === "1-2" && (events < 1 || events > 2)) return false;
      if (eventsFilter === "3+" && events < 3) return false;
      if (adminFilter !== "all" && (row.assignedAdminId ?? "unassigned") !== adminFilter) return false;
      if (triageFilter === "pending" && row.triageOutcome) return false;
      if (triageFilter !== "all" && triageFilter !== "pending" && row.triageOutcome !== triageFilter) return false;
      if (yuniteFilter === "yes" && !row.hasMatchData) return false;
      if (yuniteFilter === "no" && row.hasMatchData) return false;
      if (!searchTerm) return true;
      const haystack = [
        row.playerName,
        row.discordUsername,
        row.discordId,
        row.epicUsername,
        row.currentTier,
        row.triageOutcome ? TRIAGE_LABELS[row.triageOutcome] : "Pending",
        row.triageSuggestedOutcome ? TRIAGE_LABELS[row.triageSuggestedOutcome] : undefined,
        row.assignedAdminName,
        row.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    });

    return [...filtered].sort((a, b) => {
      if (sortField === "currentTier") {
        return compareTierField(a.currentTier, b.currentTier, sortDirection);
      }
      const dir = sortDirection === "asc" ? 1 : -1;
      const av = (a as Record<string, unknown>)[sortField];
      const bv = (b as Record<string, unknown>)[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [adminFilter, eventsFilter, filter, rows, search, sortDirection, sortField, triageFilter, yuniteFilter]);

  const pagination = useClientPagination(sortedRows, {
    pageSize: 50,
    resetDeps: [filter, eventsFilter, adminFilter, triageFilter, yuniteFilter, search, sortField, sortDirection],
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
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

  const openDetail = (id: Id<"bigSummerReEval">, row?: { notes?: string; fortniteTrackerLink?: string }) => {
    setSelectedId(id);
    setNotesDraft(row?.notes ?? "");
    setTrackerLinkDraft(row?.fortniteTrackerLink ?? "");
  };

  const openScoreDialog = (row: DashboardRow) => {
    setScoreRow(row);
  };

  const setTriage = async (
    reEvalId: Id<"bigSummerReEval">,
    outcome: "no_change" | "needs_full_review" | "private_tracker",
  ) => {
    await setTriageOutcome({ reEvalId, outcome });
    setSelectedId(null);
  };

  const selectedReEvalIds = Array.from(selectedRows) as Id<"bigSummerReEval">[];

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllPageSelected = (checked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      for (const row of pagination.pageItems ?? []) {
        if (checked) next.add(row._id);
        else next.delete(row._id);
      }
      return next;
    });
  };

  const runBulkTriage = async (
    outcome: "no_change" | "needs_full_review" | "private_tracker",
  ) => {
    if (selectedReEvalIds.length === 0) {
      toast.error("Select at least one player first");
      return;
    }
    const result = await bulkSetTriageOutcome({ reEvalIds: selectedReEvalIds, outcome });
    toast.success(`Updated ${result.updated} player(s)`);
    setSelectedRows(new Set());
  };

  const handleCompleteFirstStage = async () => {
    setIsCompleting(true);
    try {
      await completeFirstStage({});
      setFirstStageConfirmOpen(false);
      toast.success("First stage completed");
      navigate("/admin/member-management/big-reeval?stage=final");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete first stage");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleCompleteReEval = async () => {
    setIsCompleting(true);
    try {
      const result = await completeReEval({});
      setCompleteConfirmOpen(false);
      toast.success(
        `Re-eval completed: ${result.updated} tier change(s), ${result.flaggedForTierRemoval} private tracker(s) flagged`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete re-eval");
    } finally {
      setIsCompleting(false);
    }
  };

  if (filterCounts === undefined || progress === undefined || workflowState === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const scoreDialog = scoreRow ? (
    <ScorePlayerDialog
      open={!!scoreRow}
      onOpenChange={(open) => {
        if (!open) setScoreRow(null);
      }}
      playerId={scoreRow.playerId}
      title="Summer Re-Evaluation"
      saveLabel="Save Summer Evaluation"
      successMessage="Summer evaluation saved for review"
      onSaveEvaluation={async ({ totalScore: _totalScore, tier: _tier, ...scores }) => {
        await saveSummerEvaluationScore({
          reEvalId: scoreRow._id,
          ...scores,
        });
        openDetail(scoreRow._id, scoreRow);
      }}
    />
  ) : null;

  if (isFinalStageView) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sun className="h-5 w-5 text-amber-500" />
                  Summer Re-Eval Final Review
                </CardTitle>
                <CardDescription className="max-w-2xl">
                  Work through players marked Needs Full Review or Private Tracker before
                  applying Summer decisions to the live player list. Private trackers can still be made public and re-evaluated here; any that
                  remain private when completed will be flagged for tier removal.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/admin/member-management/big-reeval")}
                >
                  Back To First Stage
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setCompleteConfirmOpen(true)}
                  disabled={workflowState.stage === "completed"}
                >
                  Complete Re-Eval
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!finalReview ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Tabs defaultValue="changed">
                <TabsList>
                  <TabsTrigger value="changed">
                    Needs Full Review ({finalReview.changedPlayers.length})
                  </TabsTrigger>
                  <TabsTrigger value="private">
                    Private Trackers ({finalReview.privateTrackers.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="changed" className="mt-4">
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead>Current Tier</TableHead>
                              <TableHead>Summer Tier</TableHead>
                          <TableHead>Evaluation</TableHead>
                          <TableHead>Evaluated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {finalReview.changedPlayers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                              No players currently need full review.
                            </TableCell>
                          </TableRow>
                        ) : (
                          finalReview.changedPlayers.map((row: DashboardRow) => (
                            <TableRow key={row._id}>
                              <TableCell className="font-medium">
                                <PlayerProfileLink discordUsername={row.discordUsername}>
                                  {row.playerName}
                                </PlayerProfileLink>
                              </TableCell>
                              <TableCell>{row.currentTier ?? "—"}</TableCell>
                              <TableCell>{row.finalDecision ?? "—"}</TableCell>
                              <TableCell className="text-xs">{row.evaluationStatus ?? "—"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {row.evaluatedAt ? format(new Date(row.evaluatedAt), "MMM d HH:mm") : "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                <TabsContent value="private" className="mt-4">
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead>Tracker</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {finalReview.privateTrackers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                              No private trackers remain.
                            </TableCell>
                          </TableRow>
                        ) : (
                          finalReview.privateTrackers.map((row: DashboardRow) => (
                            <TableRow key={row._id} className="bg-amber-500/5">
                              <TableCell className="font-medium">
                                <PlayerProfileLink discordUsername={row.discordUsername}>
                                  {row.playerName}
                                </PlayerProfileLink>
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
                              <TableCell>
                                <Badge className={reEvalBadgeClass(row.reEvalStatus)}>
                                  {formatReEvalStatus(row.reEvalStatus)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  onClick={() => openScoreDialog(row)}
                                >
                                  Mark Public + Re-Evaluate
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <Dialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>
                This will update the live player list with Summer Re-Eval tier changes.
                Any players still in Private Trackers will be flagged for tier removal.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleCompleteReEval} disabled={isCompleting}>
                {isCompleting ? "Completing..." : "Complete Re-Eval"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {scoreDialog}
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
                Member Management re-eval mode. All active members are automatically
                included — review everyone and record a Summer-only decision. These
                results do not update the main player list or Discord roles.
              </CardDescription>
              {progress.enrolled > 0 && (
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>Total Members: <strong className="text-foreground">{progress.enrolled}</strong></span>
                    <span>Pending: <strong className="text-foreground">{progress.breakdown.pending}</strong></span>
                    <span>No Change: <strong className="text-foreground">{progress.breakdown.noChange}</strong></span>
                    <span>Needs Full Review: <strong className="text-foreground">{progress.breakdown.needsFullReview}</strong></span>
                    <span>Private Tracker: <strong className="text-foreground">{progress.breakdown.privateTracker}</strong></span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {(["S", "A", "B", "C"] as const).map((tier) => (
                      <span key={tier}>
                        {tier} Tier:{" "}
                        <strong className="text-foreground">
                          {progress.byTier[tier].completed} / {progress.byTier[tier].total}
                        </strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setFirstStageConfirmOpen(true)}
                disabled={workflowState.stage === "completed"}
              >
                Complete First Stage
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filter} onValueChange={(value) => setFilter(value as DashboardFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {FILTER_LABELS[key]} ({filterCounts[key] ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={eventsFilter} onValueChange={(value) => setEventsFilter(value as EventsFilter)}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Events" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="0">0 Events</SelectItem>
                <SelectItem value="1-2">1-2 Events</SelectItem>
                <SelectItem value="3+">3+ Events</SelectItem>
              </SelectContent>
            </Select>
            <Select value={triageFilter} onValueChange={(value) => setTriageFilter(value as TriageFilter)}>
              <SelectTrigger className="w-[190px]"><SelectValue placeholder="Triage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Triage</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="no_change">No Change</SelectItem>
                <SelectItem value="needs_full_review">Needs Full Review</SelectItem>
                <SelectItem value="private_tracker">Private Tracker</SelectItem>
              </SelectContent>
            </Select>
            <Select value={adminFilter} onValueChange={setAdminFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Admin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Admins</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {admins?.map((admin: { _id: Id<"users">; name: string }) => (
                  <SelectItem key={admin._id} value={admin._id}>{admin.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={yuniteFilter} onValueChange={(value) => setYuniteFilter(value as YuniteFilter)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Yunite Data" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Yunite</SelectItem>
                <SelectItem value="yes">Yunite: Yes</SelectItem>
                <SelectItem value="no">Yunite: No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedRows.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
              <span className="font-medium">{selectedRows.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => void runBulkTriage("no_change")}>Mark No Change</Button>
              <Button size="sm" variant="outline" onClick={() => void runBulkTriage("needs_full_review")}>Needs Full Review</Button>
              <Button size="sm" variant="outline" onClick={() => void runBulkTriage("private_tracker")}>Private Tracker</Button>
            </div>
          )}

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
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          checked={(pagination.pageItems ?? []).length > 0 && (pagination.pageItems ?? []).every((row) => selectedRows.has(row._id))}
                          onChange={(e) => setAllPageSelected(e.target.checked)}
                        />
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => toggleSort("playerName")}>
                          Player <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => toggleSort("currentTier")}>
                          Tier <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Tracker</TableHead>
                      <TableHead>Suggested Outcome</TableHead>
                      <TableHead>Triage Status</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Final Decision</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.pageItems && pagination.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No players match this filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagination.pageItems?.map((row) => (
                        <TableRow
                          key={row._id}
                          className={row.reEvalStatus === "private_tracker" ? "bg-amber-500/5" : undefined}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row._id)}
                              onChange={(e) => toggleRowSelection(row._id, e.target.checked)}
                            />
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            <PlayerProfileLink discordUsername={row.discordUsername}>
                              {row.playerName}
                            </PlayerProfileLink>
                          </TableCell>
                          <TableCell>
                            {row.currentTier ?? "—"}/{row.summerTier ?? "-"}
                          </TableCell>
                          <TableCell>{row.eventsPlayedCount ?? 0}</TableCell>
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
                          <TableCell className="text-xs max-w-[220px]">
                            <div className="font-medium">
                              {row.triageSuggestedOutcome ? TRIAGE_LABELS[row.triageSuggestedOutcome] : "—"}
                            </div>
                            <div className="text-muted-foreground">
                              {row.triageSuggestionReason ?? ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={row.triageOutcome ? reEvalBadgeClass(row.reEvalStatus) : ""}>
                              {row.triageOutcome ? TRIAGE_LABELS[row.triageOutcome] : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{row.assignedAdminName ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            {row.finalDecision?.replace("_", " ") ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(row.lastUpdatedAt), "MMM d HH:mm")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => openDetail(row._id, row)}
                              >
                                Review
                              </Button>
                            </div>
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
              Triage this member quickly, or open the full Summer evaluation only when needed.
            </DialogDescription>
          </DialogHeader>
          {selectedDetail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div><span className="text-muted-foreground">Tier:</span> {selectedDetail.currentTier ?? "—"}</div>
                <div><span className="text-muted-foreground">Events:</span> {selectedDetail.eventsPlayedCount ?? 0}</div>
                <div><span className="text-muted-foreground">Yunite match data:</span> {selectedDetail.hasMatchData ? "Yes" : "No"}</div>
                <div><span className="text-muted-foreground">Evaluation:</span> {selectedDetail.evaluationStatus ?? "—"}</div>
                <div><span className="text-muted-foreground">Suggested tier:</span> {selectedDetail.evaluationTargetTier ?? "—"}</div>
                <div>
                  <span className="text-muted-foreground">Evaluated:</span>{" "}
                  {selectedDetail.evaluatedAt ? format(new Date(selectedDetail.evaluatedAt), "MMM d HH:mm") : "—"}
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-sm text-muted-foreground">Suggested Outcome</div>
                <div className="text-base font-semibold">
                  {selectedDetail.triageSuggestedOutcome
                    ? TRIAGE_LABELS[selectedDetail.triageSuggestedOutcome]
                    : "—"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {selectedDetail.triageSuggestionReason ?? "No suggestion available."}
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

              <div className="space-y-2">
                <Label>Previous Notes / Internal Notes</Label>
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
                <Button
                  size="sm"
                  onClick={() => selectedDetail && openScoreDialog(selectedDetail as DashboardRow)}
                >
                  Open Full Evaluation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    selectedId &&
                    runAction("Marked no change", () => setTriage(selectedId, "no_change"))
                  }
                >
                  No Change
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    selectedId &&
                    runAction("Marked needs full review", () =>
                      setTriage(selectedId, "needs_full_review"),
                    )
                  }
                >
                  Needs Full Review
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    selectedId &&
                    runAction("Marked private tracker", () => setTriage(selectedId, "private_tracker"))
                  }
                >
                  Private Tracker
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

      <Dialog open={firstStageConfirmOpen} onOpenChange={setFirstStageConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This will lock in the first-stage Summer Re-Eval review and move you to
              the final review view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFirstStageConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCompleteFirstStage} disabled={isCompleting}>
              {isCompleting ? "Completing..." : "Complete First Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {scoreDialog}
    </div>
  );
}
