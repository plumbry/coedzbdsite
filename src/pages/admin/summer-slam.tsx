import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { CompactMobileButtonsOptOut } from "@/components/compact-mobile-buttons.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
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
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils.ts";
import {
  formatHowToCompleteLabel,
  type EvidenceInput,
  type HowToComplete,
} from "@/pages/summer-slam/_components/passport-quest-meta.ts";
import { SEAL_META, SEAL_ORDER } from "@/pages/summer-slam/_components/passport-seal.ts";
import { BONUS_STAMP_META } from "@/pages/summer-slam/_components/passport-bonus-stamp.ts";
import { SummerSlamReviewGuidance } from "@/pages/admin/_components/summer-slam-review-guidance.tsx";
import {
  SummerSlamReviewSheet,
  type ReviewQueueRow,
  type ReviewStatus,
} from "@/pages/admin/_components/summer-slam-review-sheet.tsx";
import { getCampaignPhase } from "@/pages/summer-slam/_components/campaign-phase.ts";

const CAMPAIGN_SLUG = "summer-slam";

/** Visible field chrome — theme `--input` is nearly white on cards. */
const fieldClass = "border-foreground/20 bg-background";

type SortDirection = "asc" | "desc";

function compareOptionalString(a: string | undefined | null, b: string | undefined | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function SortableHead({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  className,
}: {
  label: string;
  column: string;
  sortColumn: string;
  sortDirection: SortDirection;
  onSort: (column: string) => void;
  className?: string;
}) {
  const icon =
    sortColumn !== column ? (
      <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
    ) : sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-2 transition-colors hover:text-foreground"
      >
        {label}
        {icon}
      </button>
    </TableHead>
  );
}

function useColumnSort<T extends string>(defaultColumn: T, defaultDirection: SortDirection = "asc") {
  const [sortColumn, setSortColumn] = useState<T>(defaultColumn);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const handleSort = (column: string) => {
    const next = column as T;
    if (sortColumn === next) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(next);
      setSortDirection("asc");
    }
  };

  return { sortColumn, sortDirection, handleSort };
}

type Category = "traveller" | "competitor" | "summer_spirit" | "team_player" | "community" | "summer_legend";
type CompletionMethod = "auto" | "manual" | "admin";
type RuleType =
  | "play_events"
  | "play_all_team_formats"
  | "reach_top_5"
  | "reach_top_3"
  | "reach_top_10"
  | "win_game"
  | "play_event_type"
  | "distinct_teammates"
  | "new_member_teammate"
  | "new_teammates";

function timestampToDatetimeLocal(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function datetimeLocalToTimestamp(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return new Date(trimmed).getTime();
}

function formatTaggedEventDate(startDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(startDate);
  if (Number.isNaN(date.getTime())) return startDate;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const categoryLabels: Record<Category, string> = {
  traveller: "Traveller",
  competitor: "Competitor",
  summer_spirit: "Summer Spirit",
  team_player: "Team Player",
  community: "Community",
  summer_legend: "Bonus",
};

const DEFAULT_CATEGORY_TAGLINES: Record<Category, string> = {
  traveller: SEAL_META.traveller.tagline,
  competitor: SEAL_META.competitor.tagline,
  summer_spirit: SEAL_META.summer_spirit.tagline,
  team_player: SEAL_META.team_player.tagline,
  community: SEAL_META.community.tagline,
  summer_legend: BONUS_STAMP_META.tagline,
};

const TAGLINE_EDIT_ORDER: Category[] = [...SEAL_ORDER, "summer_legend"];

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    toast.info("No rows to export yet.");
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildRule(args: { ruleType: RuleType; threshold: number }) {
  if (args.ruleType === "play_events") {
    return { type: "play_events" as const, count: args.threshold };
  }
  if (args.ruleType === "play_all_team_formats") {
    return { type: "play_all_team_formats" as const };
  }
  if (args.ruleType === "reach_top_5") {
    return { type: "reach_top_5" as const };
  }
  if (args.ruleType === "reach_top_3") {
    return { type: "reach_top_3" as const };
  }
  if (args.ruleType === "reach_top_10") {
    return { type: "reach_top_10" as const };
  }
  if (args.ruleType === "play_event_type") {
    return { type: "play_event_type" as const, eventType: "showdown" as const };
  }
  if (args.ruleType === "distinct_teammates") {
    return { type: "distinct_teammates" as const, count: args.threshold };
  }
  if (args.ruleType === "new_member_teammate") {
    return { type: "new_member_teammate" as const, maxEvents: args.threshold };
  }
  if (args.ruleType === "new_teammates") {
    return { type: "new_teammates" as const, count: args.threshold };
  }
  return { type: "win_game" as const };
}

function defaultThresholdForRule(ruleType: RuleType): number {
  if (ruleType === "distinct_teammates") return 3;
  if (ruleType === "new_member_teammate") return 5;
  if (ruleType === "new_teammates") return 2;
  return 1;
}

export default function SummerSlamAdminPage() {
  const [editingQuestId, setEditingQuestId] = useState<Id<"seasonalQuests"> | undefined>();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("traveller");
  const [description, setDescription] = useState("");
  const [evidenceInstructions, setEvidenceInstructions] = useState("");
  const [adminHint, setAdminHint] = useState("");
  const [sortOrder, setSortOrder] = useState(10);
  const [isActive, setIsActive] = useState(true);
  const [completionMethod, setCompletionMethod] = useState<CompletionMethod>("manual");
  const [evidenceInput, setEvidenceInput] = useState<EvidenceInput>("link");
  const [stampReward, setStampReward] = useState(1);
  const [ruleType, setRuleType] = useState<RuleType>("play_events");
  const [threshold, setThreshold] = useState(1);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("pending_review");
  const [filterText, setFilterText] = useState("");
  const [selectedReviewRow, setSelectedReviewRow] = useState<ReviewQueueRow | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignActive, setCampaignActive] = useState(true);
  const [campaignStartsAt, setCampaignStartsAt] = useState("");
  const [campaignEndsAt, setCampaignEndsAt] = useState("");
  const [campaignSubmissionsEnabled, setCampaignSubmissionsEnabled] = useState(false);
  const [stampName, setStampName] = useState("Passport Stamp");
  const [littleWheelEvery, setLittleWheelEvery] = useState(1);
  const [bigWheelEvery, setBigWheelEvery] = useState(5);
  const [categoryTaglines, setCategoryTaglines] = useState<Record<Category, string>>({
    ...DEFAULT_CATEGORY_TAGLINES,
  });
  const [isSavingQuest, setIsSavingQuest] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [questPendingDelete, setQuestPendingDelete] = useState<
    { _id: Id<"seasonalQuests">; title: string } | null
  >(null);
  const [isDeletingQuest, setIsDeletingQuest] = useState(false);
  const [activeTab, setActiveTab] = useState("quests");
  const questSort = useColumnSort<"title" | "category" | "method" | "status">("title");
  const eventSort = useColumnSort<"event" | "date" | "type" | "mode" | "teamFormat" | "status">("date", "desc");
  const reviewSort = useColumnSort<"player" | "quest" | "submitted">("submitted", "desc");
  const passportSort = useColumnSort<
    "player" | "discordUser" | "created" | "approvedPoints" | "littleTickets" | "bigTickets"
  >("created", "desc");
  const { isAdmin } = useUserRole();

  const ensureCampaign = useMutation(api.seasonal.ensureSummerSlamCampaign);
  const updateCampaign = useMutation(api.seasonal.updateCampaign);
  const saveQuest = useMutation(api.seasonal.saveQuest);
  const deleteQuest = useMutation(api.seasonal.deleteQuest);
  const reviewSubmission = useMutation(api.seasonal.reviewSubmission);
  const recalculateCampaign = useMutation(api.seasonal.recalculateCampaign);
  const dashboard = useQuery(api.seasonal.getAdminDashboard, isAdmin ? { slug: CAMPAIGN_SLUG } : "skip");
  const taggedEvents = useQuery(api.seasonal.getAdminTaggedEvents, isAdmin ? { slug: CAMPAIGN_SLUG } : "skip");
  const reviewQueue = useQuery(api.seasonal.getReviewQueue, isAdmin ? { slug: CAMPAIGN_SLUG, status: reviewStatus } : "skip");
  const passports = useQuery(api.seasonal.getAdminPassports, isAdmin ? { slug: CAMPAIGN_SLUG } : "skip");
  const exportData = useQuery(api.seasonal.getProgressExport, isAdmin ? { slug: CAMPAIGN_SLUG } : "skip");

  useEffect(() => {
    if (!isAdmin) return;
    void ensureCampaign().catch((error) => {
      console.error(error);
      toast.error("Could not initialise Summer Slam campaign.");
    });
  }, [ensureCampaign, isAdmin]);

  useEffect(() => {
    if (!dashboard?.campaign) return;
    setCampaignTitle(dashboard.campaign.title);
    setCampaignDescription(dashboard.campaign.description ?? "");
    setCampaignActive(dashboard.campaign.isActive);
    setCampaignStartsAt(timestampToDatetimeLocal(dashboard.campaign.startsAt));
    setCampaignEndsAt(timestampToDatetimeLocal(dashboard.campaign.endsAt));
    setCampaignSubmissionsEnabled(dashboard.campaign.submissionsEnabled !== false);
    setStampName(dashboard.campaign.stampName);
    setLittleWheelEvery(dashboard.campaign.littleWheelEntryEveryStamps);
    setBigWheelEvery(dashboard.campaign.bigWheelEntryEveryStamps);
    const stored = dashboard.campaign.categoryTaglines;
    setCategoryTaglines({
      traveller: stored?.traveller ?? DEFAULT_CATEGORY_TAGLINES.traveller,
      competitor: stored?.competitor ?? DEFAULT_CATEGORY_TAGLINES.competitor,
      summer_spirit: stored?.summer_spirit ?? DEFAULT_CATEGORY_TAGLINES.summer_spirit,
      team_player: stored?.team_player ?? DEFAULT_CATEGORY_TAGLINES.team_player,
      community: stored?.community ?? DEFAULT_CATEGORY_TAGLINES.community,
      summer_legend: stored?.summer_legend ?? DEFAULT_CATEGORY_TAGLINES.summer_legend,
    });
  }, [dashboard?.campaign]);

  const filteredReviewQueue = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    if (!term) return reviewQueue ?? [];
    return (reviewQueue ?? []).filter((row) => {
      const player = row.player;
      const quest = row.quest;
      return (
        player?.discordUsername.toLowerCase().includes(term) ||
        player?.epicUsername.toLowerCase().includes(term) ||
        quest?.title.toLowerCase().includes(term) ||
        quest?.category.toLowerCase().includes(term) ||
        row.submission.evidenceTypes.some((type) => type.toLowerCase().includes(term))
      );
    });
  }, [filterText, reviewQueue]);

  const sortedQuests = useMemo(() => {
    const rows = [...(dashboard?.quests ?? [])];
    const direction = questSort.sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let comparison = 0;
      switch (questSort.sortColumn) {
        case "title":
          comparison = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
          break;
        case "category":
          comparison =
            TAGLINE_EDIT_ORDER.indexOf(a.category) - TAGLINE_EDIT_ORDER.indexOf(b.category);
          break;
        case "method":
          comparison = formatHowToCompleteLabel(a.completionMethod, a.evidenceInput).localeCompare(
            formatHowToCompleteLabel(b.completionMethod, b.evidenceInput),
          );
          break;
        case "status":
          comparison = Number(a.isActive) - Number(b.isActive);
          break;
      }
      return comparison * direction;
    });
    return rows;
  }, [dashboard?.quests, questSort.sortColumn, questSort.sortDirection]);

  const sortedTaggedEvents = useMemo(() => {
    const rows = [...(taggedEvents ?? [])];
    const direction = eventSort.sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let comparison = 0;
      switch (eventSort.sortColumn) {
        case "event":
          comparison = compareOptionalString(a.event?.name, b.event?.name);
          break;
        case "date":
          comparison = compareOptionalString(a.event?.startDate, b.event?.startDate);
          break;
        case "type":
          comparison = compareOptionalString(a.event?.type, b.event?.type);
          break;
        case "mode":
          comparison = compareOptionalString(a.event?.mode, b.event?.mode);
          break;
        case "teamFormat":
          comparison = a.teamFormat.localeCompare(b.teamFormat, undefined, { sensitivity: "base" });
          break;
        case "status":
          comparison = compareOptionalString(a.event?.status, b.event?.status);
          break;
      }
      return comparison * direction;
    });
    return rows;
  }, [taggedEvents, eventSort.sortColumn, eventSort.sortDirection]);

  const sortedReviewQueue = useMemo(() => {
    const rows = [...filteredReviewQueue];
    const direction = reviewSort.sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let comparison = 0;
      switch (reviewSort.sortColumn) {
        case "player":
          comparison = compareOptionalString(a.player?.discordUsername, b.player?.discordUsername);
          break;
        case "quest":
          comparison = compareOptionalString(a.quest?.title, b.quest?.title);
          break;
        case "submitted":
          comparison = a.submission.submittedAt - b.submission.submittedAt;
          break;
      }
      return comparison * direction;
    });
    return rows;
  }, [filteredReviewQueue, reviewSort.sortColumn, reviewSort.sortDirection]);

  const sortedPassports = useMemo(() => {
    const rows = [...(passports ?? [])];
    const direction = passportSort.sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let comparison = 0;
      switch (passportSort.sortColumn) {
        case "player":
          comparison = compareOptionalString(a.player?.discordUsername, b.player?.discordUsername);
          break;
        case "discordUser":
          comparison = compareOptionalString(
            a.user?.discordUsername ?? a.user?.username ?? a.user?.name,
            b.user?.discordUsername ?? b.user?.username ?? b.user?.name,
          );
          break;
        case "created":
          comparison = a.passport.createdAt - b.passport.createdAt;
          break;
        case "approvedPoints":
          comparison = a.approvedStamps - b.approvedStamps;
          break;
        case "littleTickets":
          comparison = a.littleWheelEntries - b.littleWheelEntries;
          break;
        case "bigTickets":
          comparison = a.bigWheelEntries - b.bigWheelEntries;
          break;
      }
      return comparison * direction;
    });
    return rows;
  }, [passports, passportSort.sortColumn, passportSort.sortDirection]);

  const isPreLaunchPreview = useMemo(() => {
    const campaign = dashboard?.campaign;
    if (!campaign) return false;
    return getCampaignPhase(campaign) === "not_started";
  }, [dashboard?.campaign]);

  const howToComplete: HowToComplete =
    completionMethod === "manual" ? "submit" : "auto";

  const resetQuestForm = () => {
    setEditingQuestId(undefined);
    setTitle("");
    setCategory("traveller");
    setDescription("");
    setEvidenceInstructions("");
    setAdminHint("");
    setSortOrder(10);
    setIsActive(true);
    setCompletionMethod("manual");
    setEvidenceInput("link");
    setStampReward(1);
    setRuleType("play_events");
    setThreshold(1);
  };

  const handleEditQuest = (quest: NonNullable<typeof dashboard>["quests"][number]) => {
    setEditingQuestId(quest._id);
    setTitle(quest.title);
    setCategory(quest.category);
    setDescription(quest.description);
    setEvidenceInstructions(quest.evidenceInstructions ?? "");
    setAdminHint(quest.adminHint ?? "");
    setSortOrder(quest.sortOrder);
    setIsActive(quest.isActive);
    setCompletionMethod(quest.completionMethod);
    setEvidenceInput(quest.evidenceInput ?? "link");
    setStampReward(quest.stampReward);
    const rule = quest.qualificationRule;
    if (!rule) return;
    if (rule.type === "play_events") {
      setRuleType("play_events");
      setThreshold(rule.count);
      return;
    }
    if (rule.type === "play_all_team_formats") {
      setRuleType("play_all_team_formats");
      return;
    }
    if (rule.type === "reach_top_5") {
      setRuleType("reach_top_5");
      return;
    }
    if (rule.type === "reach_top_3") {
      setRuleType("reach_top_3");
      return;
    }
    if (rule.type === "win_game") {
      setRuleType("win_game");
      return;
    }
    if (rule.type === "reach_top_10") {
      setRuleType("reach_top_10");
      return;
    }
    if (rule.type === "play_event_type") {
      setRuleType("play_event_type");
      return;
    }
    if (rule.type === "distinct_teammates") {
      setRuleType("distinct_teammates");
      setThreshold(rule.count);
      return;
    }
    if (rule.type === "new_member_teammate") {
      setRuleType("new_member_teammate");
      setThreshold(rule.maxEvents);
      return;
    }
    if (rule.type === "new_teammates") {
      setRuleType("new_teammates");
      setThreshold(rule.count);
      return;
    }
    // Legacy rules map to the closest current option when editing.
    if (rule.type === "play_team_format") {
      setRuleType("play_events");
      setThreshold(1);
      return;
    }
    if (rule.type === "reach_top") {
      if (rule.placement <= 3) setRuleType("reach_top_3");
      else if (rule.placement <= 5) setRuleType("reach_top_5");
      else setRuleType("reach_top_10");
    }
  };

  const handleSaveQuest = async () => {
    setIsSavingQuest(true);
    try {
      await saveQuest({
        slug: CAMPAIGN_SLUG,
        questId: editingQuestId,
        title,
        category,
        description,
        evidenceInstructions: evidenceInstructions || undefined,
        adminHint: adminHint || undefined,
        sortOrder,
        isActive,
        completionMethod: howToComplete === "auto" ? "auto" : "manual",
        evidenceInput: howToComplete === "submit" ? evidenceInput : undefined,
        stampReward,
        qualificationRule:
          howToComplete === "auto"
            ? buildRule({ ruleType, threshold })
            : undefined,
      });
      toast.success(editingQuestId ? "Quest updated." : "Quest created.");
      resetQuestForm();
    } catch (error) {
      console.error(error);
      toast.error("Could not save quest.");
    } finally {
      setIsSavingQuest(false);
    }
  };

  const handleDeleteQuest = async () => {
    if (!questPendingDelete) return;
    setIsDeletingQuest(true);
    try {
      await deleteQuest({ slug: CAMPAIGN_SLUG, questId: questPendingDelete._id });
      toast.success("Quest deleted.");
      if (editingQuestId === questPendingDelete._id) {
        resetQuestForm();
      }
      setQuestPendingDelete(null);
    } catch (error) {
      console.error(error);
      toast.error("Could not delete quest.");
    } finally {
      setIsDeletingQuest(false);
    }
  };

  const handleReview = async (
    submissionId: Id<"seasonalQuestSubmissions">,
    status: ReviewStatus,
    reviewNote?: string,
    rejectionReason?: string,
  ) => {
    setIsReviewing(true);
    try {
      await reviewSubmission({
        submissionId,
        status,
        reviewNote,
        rejectionReason:
          status === "rejected" || status === "needs_more_evidence"
            ? rejectionReason ?? reviewNote
            : undefined,
      });
      toast.success("Submission reviewed.");
      setSelectedReviewRow(null);
    } catch (error) {
      console.error(error);
      const message = String(
        (error as { data?: { message?: string } })?.data?.message ||
          (error as Error)?.message ||
          "",
      );
      toast.error(message || "Could not review submission.");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await recalculateCampaign({ slug: CAMPAIGN_SLUG });
      toast.success("Recalculation started.");
    } catch (error) {
      console.error(error);
      toast.error("Could not start recalculation.");
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSaveCampaign = async () => {
    setIsSavingCampaign(true);
    try {
      await updateCampaign({
        slug: CAMPAIGN_SLUG,
        title: campaignTitle,
        description: campaignDescription || undefined,
        isActive: campaignActive,
        startsAt: datetimeLocalToTimestamp(campaignStartsAt),
        endsAt: datetimeLocalToTimestamp(campaignEndsAt),
        submissionsEnabled: campaignSubmissionsEnabled,
        stampName,
        littleWheelEntryEveryStamps: littleWheelEvery,
        bigWheelEntryEveryStamps: bigWheelEvery,
        categoryTaglines,
      });
      toast.success(campaignActive ? "Campaign saved." : "Campaign archived.");
    } catch (error) {
      console.error(error);
      toast.error("Could not save campaign.");
    } finally {
      setIsSavingCampaign(false);
    }
  };

  return (
    <CompactMobileButtonsOptOut>
    <AdminPageLayout
      requireAdmin
      title="Summer Slam Passport"
      description="Campaign-based seasonal quest configuration, evidence review, progress, and wheel exports."
      authTitle="Sign in to manage Summer Slam"
      maxWidth="wide"
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Campaign Settings</CardTitle>
              <CardDescription>Create, activate, edit, or archive the current Summer Slam campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Campaign Title</Label>
                  <Input className={fieldClass} value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Stamp Name</Label>
                  <Input className={fieldClass} value={stampName} onChange={(event) => setStampName(event.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea className={fieldClass} value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Season start</Label>
                  <Input
                    className={fieldClass}
                    type="datetime-local"
                    value={campaignStartsAt}
                    onChange={(event) => setCampaignStartsAt(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    From this time, players can claim and view passports.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Season end (submission deadline)</Label>
                  <Input
                    className={fieldClass}
                    type="datetime-local"
                    value={campaignEndsAt}
                    onChange={(event) => setCampaignEndsAt(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hard close for evidence — staff can still review after this date.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Evidence submissions</Label>
                  <div className="flex h-9 items-center gap-2 rounded-md border border-foreground/20 bg-background px-3">
                    <Switch
                      checked={campaignSubmissionsEnabled}
                      onCheckedChange={setCampaignSubmissionsEnabled}
                    />
                    <span className="text-sm text-muted-foreground">
                      {campaignSubmissionsEnabled
                        ? "Players can submit evidence"
                        : "Claim/view only — submissions off"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Independent of season start. Turn on when you are ready for quest evidence.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>{campaignActive ? "Active" : "Archived"}</Label>
                  <div className="flex h-9 items-center gap-2 rounded-md border border-foreground/20 bg-background px-3">
                    <Switch checked={campaignActive} onCheckedChange={setCampaignActive} />
                    <span className="text-sm text-muted-foreground">
                      {campaignActive ? "Campaign is live" : "Campaign is archived"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Little Wheel Ticket Every X Points</Label>
                  <Input className={fieldClass} type="number" min={1} value={littleWheelEvery} onChange={(event) => setLittleWheelEvery(Number(event.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Big Wheel Ticket Every X Points</Label>
                  <Input className={fieldClass} type="number" min={1} value={bigWheelEvery} onChange={(event) => setBigWheelEvery(Number(event.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <Label>Stamp page taglines</Label>
                  <p className="text-xs text-muted-foreground">
                    Short lines shown under each stamp page title on the player passport.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {TAGLINE_EDIT_ORDER.map((key) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`tagline-${key}`}>{categoryLabels[key]}</Label>
                      <Textarea
                        id={`tagline-${key}`}
                        className={cn(fieldClass, "min-h-[72px]")}
                        value={categoryTaglines[key]}
                        onChange={(event) =>
                          setCategoryTaglines((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={handleSaveCampaign} disabled={isSavingCampaign}>
                {isSavingCampaign ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Campaign
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Launch Checklist</CardTitle>
              <CardDescription>Before opening passports to players.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
                <li>Activate the campaign and set season start/end dates.</li>
                <li>Tag Summer Slam events in Events Manager (Duos, Trios, or Squads).</li>
                <li>Configure quests. Use Bonus for secret end-of-season quests.</li>
                <li>
                  Preview at{" "}
                  <Link to="/summer-slam/passport" className="font-medium text-primary underline">
                    /summer-slam/passport
                  </Link>
                  .
                </li>
                <li>Test one manual submission in Review Queue.</li>
                <li>Recalculate after imports, quest, or tag changes.</li>
                <li>Export wheel tickets from Recalculate & Exports.</li>
              </ol>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/summer-slam/passport">Preview player passport</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setActiveTab("tagged-events")}
            className="rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
          >
            <p className="text-xs text-muted-foreground">Tagged Events</p>
            <p className="text-xl font-bold">{dashboard?.counts.taggedEvents ?? 0}</p>
          </button>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Active Quests</p>
            <p className="text-xl font-bold">{dashboard?.counts.activeQuests ?? 0}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("review")}
            className="rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
          >
            <p className="text-xs text-muted-foreground">Pending Reviews</p>
            <p className="text-xl font-bold">{dashboard?.counts.pendingSubmissions ?? 0}</p>
          </button>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Approved Points</p>
            <p className="text-xl font-bold">{dashboard?.counts.approvedStamps ?? 0}</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-3">
          <TabsList className="inline-flex h-auto w-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="quests">Quests</TabsTrigger>
            <TabsTrigger value="tagged-events">Tagged Events</TabsTrigger>
            <TabsTrigger value="review">Review Queue</TabsTrigger>
            <TabsTrigger value="passports">Passports</TabsTrigger>
            <TabsTrigger value="exports">Recalculate & Exports</TabsTrigger>
          </TabsList>

          <TabsContent value="quests" className="mt-0 grid gap-3 lg:grid-cols-[minmax(280px,360px)_1fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>{editingQuestId ? "Edit Quest" : "Create Quest"}</CardTitle>
                <CardDescription>Quest definitions stay campaign-based; Summer Slam is the active campaign.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
                      <SelectTrigger className={cn("w-full", fieldClass)}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>How to complete</Label>
                    <Select
                      value={howToComplete}
                      onValueChange={(value) => {
                        const next = value as HowToComplete;
                        setCompletionMethod(next === "auto" ? "auto" : "manual");
                      }}
                    >
                      <SelectTrigger className={cn("w-full", fieldClass)}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto Complete</SelectItem>
                        <SelectItem value="submit">Submit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {category === "summer_legend" && (
                  <p className="text-sm text-muted-foreground">
                    Bonus quests stay hidden on player passports until all five main stamps are earned.
                    They then appear on the Summer Legend bonus stamp page.
                  </p>
                )}
                {howToComplete === "submit" && (
                  <div className="space-y-1.5">
                    <Label>Submit as</Label>
                    <Select
                      value={evidenceInput}
                      onValueChange={(value) => setEvidenceInput(value as EvidenceInput)}
                    >
                      <SelectTrigger className={cn("w-full", fieldClass)}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Screenshot link</SelectItem>
                        <SelectItem value="link">Link (clip / other)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {evidenceInput === "image"
                        ? "Players paste a public screenshot URL (recommend postimages.org). Files are not uploaded to our servers."
                        : "Players paste a clip, Yunite, or other evidence link."}
                    </p>
                  </div>
                )}
                {completionMethod === "admin" && (
                  <p className="text-sm text-muted-foreground">
                    This quest is currently staff-awarded. Choose Auto Complete or Submit to change how players complete it.
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea className={fieldClass} value={description} onChange={(event) => setDescription(event.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Markdown supported — e.g.{" "}
                    <code className="rounded bg-muted px-1">[Postimages](https://postimages.org/)</code>,{" "}
                    <code className="rounded bg-muted px-1">**bold**</code>, lists.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Evidence Instructions</Label>
                  <Textarea
                    className={fieldClass}
                    value={evidenceInstructions}
                    onChange={(event) => setEvidenceInstructions(event.target.value)}
                    placeholder="Upload screenshots to https://postimages.org/ and paste the link. Video clips: Medal, Streamable, Twitch, TikTok, Discord, etc."
                  />
                  <p className="text-xs text-muted-foreground">Markdown supported for links and formatting.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Admin Hint (optional)</Label>
                  <Textarea
                    className={fieldClass}
                    value={adminHint}
                    onChange={(event) => setAdminHint(event.target.value)}
                    placeholder="Extra tips shown to players (e.g. modes to play, who counts as a teammate). Not required."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">Markdown supported for links and formatting.</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Sort</Label>
                    <Input className={fieldClass} type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Wheel Points</Label>
                    <Input className={fieldClass} type="number" min={1} value={stampReward} onChange={(event) => setStampReward(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Active</Label>
                    <div className="flex h-9 items-center rounded-md border border-foreground/20 bg-background px-3">
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                  </div>
                </div>

                {howToComplete === "auto" && (
                  <div className="rounded-lg border p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Auto Rule</Label>
                      <Select
                        value={ruleType}
                        onValueChange={(value) => {
                          const next = value as RuleType;
                          setRuleType(next);
                          setThreshold(defaultThresholdForRule(next));
                        }}
                      >
                        <SelectTrigger className={cn("w-full", fieldClass)}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="play_events">Play X Summer Slam Scrims</SelectItem>
                          <SelectItem value="play_all_team_formats">Play Duos, Trios and Squads</SelectItem>
                          <SelectItem value="play_event_type">Play a Showdown event</SelectItem>
                          <SelectItem value="reach_top_10">Reach Top 10</SelectItem>
                          <SelectItem value="reach_top_5">Reach Top 5</SelectItem>
                          <SelectItem value="reach_top_3">Reach Top 3</SelectItem>
                          <SelectItem value="win_game">Win a game (1st place)</SelectItem>
                          <SelectItem value="distinct_teammates">Play with X different teammates</SelectItem>
                          <SelectItem value="new_member_teammate">Play with a new member (&lt;X events)</SelectItem>
                          <SelectItem value="new_teammates">Team with X never-played-with players</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Auto rules use Yunite results from Summer Slam tagged events. Teammate rules
                        match by Discord ID from import history.
                      </p>
                    </div>
                    {ruleType === "play_events" && (
                      <div className="space-y-1.5">
                        <Label>Scrim Count</Label>
                        <Input className={fieldClass} type="number" min={1} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
                      </div>
                    )}
                    {ruleType === "distinct_teammates" && (
                      <div className="space-y-1.5">
                        <Label>Different teammates required</Label>
                        <Input className={fieldClass} type="number" min={1} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
                        <p className="text-xs text-muted-foreground">
                          Counts unique teammates across all Summer Slam events (a squads scrim can
                          complete this in one event).
                        </p>
                      </div>
                    )}
                    {ruleType === "new_member_teammate" && (
                      <div className="space-y-1.5">
                        <Label>New member max prior events</Label>
                        <Input className={fieldClass} type="number" min={1} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
                        <p className="text-xs text-muted-foreground">
                          Completes when a Summer Slam teammate has appeared on fewer than this many
                          Yunite leaderboards total.
                        </p>
                      </div>
                    )}
                    {ruleType === "new_teammates" && (
                      <div className="space-y-1.5">
                        <Label>Never-played-with teammates required</Label>
                        <Input className={fieldClass} type="number" min={1} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
                        <p className="text-xs text-muted-foreground">
                          Completes when one Summer Slam team includes this many players with no prior
                          Yunite coplay on record.
                        </p>
                      </div>
                    )}
                    {ruleType === "play_event_type" && (
                      <p className="text-sm text-muted-foreground">
                        Auto-completes when the player appears on a Yunite leaderboard for a Summer
                        Slam tagged event whose type is Showdown.
                      </p>
                    )}
                    {ruleType === "reach_top_10" && (
                      <p className="text-sm text-muted-foreground">
                        Auto-completes when the player finishes Top 10 on the overall Yunite
                        leaderboard for any tagged Summer Slam scrim (tournament standings, not an
                        individual game).
                      </p>
                    )}
                    {ruleType === "reach_top_5" && (
                      <p className="text-sm text-muted-foreground">
                        Auto-completes when the player finishes Top 5 on the overall Yunite
                        leaderboard for any tagged Summer Slam scrim (tournament standings, not an
                        individual game).
                      </p>
                    )}
                    {ruleType === "reach_top_3" && (
                      <p className="text-sm text-muted-foreground">
                        Auto-completes when the player finishes Top 3 on the overall Yunite
                        leaderboard for any tagged Summer Slam scrim (tournament standings, not an
                        individual game).
                      </p>
                    )}
                    {ruleType === "win_game" && (
                      <p className="text-sm text-muted-foreground">
                        Auto-completes when the player wins an individual match (1st place in a
                        single game) in any tagged Summer Slam scrim.
                      </p>
                    )}
                    {ruleType === "play_all_team_formats" && (
                      <p className="text-sm text-muted-foreground">
                        Auto-completes when the player has played Duos, Trios, and Squads Summer Slam
                        events.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleSaveQuest} disabled={isSavingQuest}>
                    {isSavingQuest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Quest
                  </Button>
                  {editingQuestId && <Button variant="outline" onClick={resetQuestForm}>Cancel</Button>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configured Quests</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Quest"
                        column="title"
                        sortColumn={questSort.sortColumn}
                        sortDirection={questSort.sortDirection}
                        onSort={questSort.handleSort}
                      />
                      <SortableHead
                        label="Category"
                        column="category"
                        sortColumn={questSort.sortColumn}
                        sortDirection={questSort.sortDirection}
                        onSort={questSort.handleSort}
                      />
                      <SortableHead
                        label="Method"
                        column="method"
                        sortColumn={questSort.sortColumn}
                        sortDirection={questSort.sortDirection}
                        onSort={questSort.handleSort}
                      />
                      <SortableHead
                        label="Status"
                        column="status"
                        sortColumn={questSort.sortColumn}
                        sortDirection={questSort.sortDirection}
                        onSort={questSort.handleSort}
                      />
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedQuests.map((quest) => (
                      <TableRow key={quest._id}>
                        <TableCell className="font-medium">{quest.title}</TableCell>
                        <TableCell>{categoryLabels[quest.category]}</TableCell>
                        <TableCell>
                          {formatHowToCompleteLabel(quest.completionMethod, quest.evidenceInput)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={quest.isActive ? "default" : "secondary"}>{quest.isActive ? "Active" : "Inactive"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEditQuest(quest)}>Edit</Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setQuestPendingDelete({ _id: quest._id, title: quest.title })}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete quest</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tagged-events" className="mt-0">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Summer Slam Tagged Events</CardTitle>
                <CardDescription>
                  Events marked for this campaign in Events Manager. Auto quests only count results from these events.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Event"
                        column="event"
                        sortColumn={eventSort.sortColumn}
                        sortDirection={eventSort.sortDirection}
                        onSort={eventSort.handleSort}
                      />
                      <SortableHead
                        label="Date"
                        column="date"
                        sortColumn={eventSort.sortColumn}
                        sortDirection={eventSort.sortDirection}
                        onSort={eventSort.handleSort}
                      />
                      <SortableHead
                        label="Type"
                        column="type"
                        sortColumn={eventSort.sortColumn}
                        sortDirection={eventSort.sortDirection}
                        onSort={eventSort.handleSort}
                      />
                      <SortableHead
                        label="Mode"
                        column="mode"
                        sortColumn={eventSort.sortColumn}
                        sortDirection={eventSort.sortDirection}
                        onSort={eventSort.handleSort}
                      />
                      <SortableHead
                        label="Team Format"
                        column="teamFormat"
                        sortColumn={eventSort.sortColumn}
                        sortDirection={eventSort.sortDirection}
                        onSort={eventSort.handleSort}
                      />
                      <SortableHead
                        label="Status"
                        column="status"
                        sortColumn={eventSort.sortColumn}
                        sortDirection={eventSort.sortDirection}
                        onSort={eventSort.handleSort}
                      />
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taggedEvents === undefined ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          Loading tagged events…
                        </TableCell>
                      </TableRow>
                    ) : sortedTaggedEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No events tagged yet. Open{" "}
                          <Link to="/admin/events-manager" className="font-medium text-primary underline">
                            Events Manager
                          </Link>{" "}
                          and enable Summer Slam on an event.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedTaggedEvents.map((row) => (
                        <TableRow key={row.tagId}>
                          <TableCell className="font-medium">
                            {row.event?.name ?? "Missing event"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {row.event?.startDate ? formatTaggedEventDate(row.event.startDate) : "—"}
                          </TableCell>
                          <TableCell className="capitalize">{row.event?.type ?? "—"}</TableCell>
                          <TableCell>{row.event?.mode ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize">
                              {row.teamFormat}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">{row.event?.status ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/events/${row.eventId}`}>
                                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                View
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="review" className="mt-0 space-y-3">
            {isPreLaunchPreview ? (
              <p className="rounded-lg border border-violet-200/80 bg-violet-50/70 px-3 py-2 text-sm text-violet-950/90">
                Pre-launch testing — the season has not started yet. You can review submissions here,
                including your own test evidence from the passport preview.
              </p>
            ) : null}
            <SummerSlamReviewGuidance />
            <div className="flex flex-wrap gap-3">
              <Input className={cn("max-w-sm", fieldClass)} placeholder="Filter by player, quest, category, evidence..." value={filterText} onChange={(event) => setFilterText(event.target.value)} />
              <Select value={reviewStatus} onValueChange={(value) => setReviewStatus(value as ReviewStatus)}>
                <SelectTrigger className={cn("w-56", fieldClass)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="needs_more_evidence">Needs More Evidence</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Player"
                        column="player"
                        sortColumn={reviewSort.sortColumn}
                        sortDirection={reviewSort.sortDirection}
                        onSort={reviewSort.handleSort}
                      />
                      <SortableHead
                        label="Quest"
                        column="quest"
                        sortColumn={reviewSort.sortColumn}
                        sortDirection={reviewSort.sortDirection}
                        onSort={reviewSort.handleSort}
                      />
                      <SortableHead
                        label="Submitted"
                        column="submitted"
                        sortColumn={reviewSort.sortColumn}
                        sortDirection={reviewSort.sortDirection}
                        onSort={reviewSort.handleSort}
                      />
                      <TableHead>Preview</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedReviewQueue.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No submissions match this filter.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {sortedReviewQueue.map((row) => (
                      <TableRow key={row.submission._id}>
                        <TableCell>
                          <div className="font-medium">{row.player?.discordUsername ?? "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{row.player?.epicUsername}</div>
                        </TableCell>
                        <TableCell>
                          <div>{row.quest?.title ?? "Unknown quest"}</div>
                          {row.quest && <div className="text-xs text-muted-foreground">{categoryLabels[row.quest.category]}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(row.submission.submittedAt).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-[240px] flex-col gap-1">
                            {row.images[0]?.url ? (
                              <a
                                href={row.images[0].url}
                                target="_blank"
                                rel="noreferrer"
                                className="w-fit"
                                title="Open uploaded image"
                              >
                                <img
                                  src={row.images[0].url}
                                  alt=""
                                  className="h-10 w-14 rounded border object-cover"
                                />
                              </a>
                            ) : null}
                            {row.submission.evidenceUrls?.length ? (
                              row.submission.evidenceUrls.map((url) => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-xs text-primary underline"
                                  title={url}
                                >
                                  {url}
                                </a>
                              ))
                            ) : !row.images[0]?.url ? (
                              <span className="text-xs text-muted-foreground">
                                {row.submission.evidenceTypes.join(", ") || "No evidence"}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedReviewRow(row as ReviewQueueRow)}
                          >
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            Review
                          </Button>
                          {row.submission.status === "pending_review" ? (
                            <Button
                              size="sm"
                              onClick={() => handleReview(row.submission._id, "approved")}
                              disabled={isReviewing}
                            >
                              Approve
                            </Button>
                          ) : (
                            <Badge variant="secondary">{row.submission.status.replace(/_/g, " ")}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <SummerSlamReviewSheet
              row={selectedReviewRow}
              open={!!selectedReviewRow}
              onOpenChange={(open) => {
                if (!open) setSelectedReviewRow(null);
              }}
              onReview={handleReview}
              isReviewing={isReviewing}
            />
          </TabsContent>

          <TabsContent value="passports" className="mt-0">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle>Player Passports</CardTitle>
                  <CardDescription>
                    Automatically created passports for players who visited the campaign page. Approved
                    points drive Little/Big ticket totals (usually 1 point per completed quest).
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() =>
                    downloadCsv(
                      "summer-slam-passport-tickets.csv",
                      sortedPassports.map((row) => ({
                        discordUsername: row.player?.discordUsername ?? "",
                        epicUsername: row.player?.epicUsername ?? "",
                        siteUser: row.user?.discordUsername ?? row.user?.username ?? row.user?.name ?? "",
                        approvedPoints: row.approvedStamps,
                        littleTickets: row.littleWheelEntries,
                        bigTickets: row.bigWheelEntries,
                        createdAt: new Date(row.passport.createdAt).toISOString(),
                      })),
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Export Tickets
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Player"
                        column="player"
                        sortColumn={passportSort.sortColumn}
                        sortDirection={passportSort.sortDirection}
                        onSort={passportSort.handleSort}
                      />
                      <SortableHead
                        label="Discord User"
                        column="discordUser"
                        sortColumn={passportSort.sortColumn}
                        sortDirection={passportSort.sortDirection}
                        onSort={passportSort.handleSort}
                      />
                      <SortableHead
                        label="Created"
                        column="created"
                        sortColumn={passportSort.sortColumn}
                        sortDirection={passportSort.sortDirection}
                        onSort={passportSort.handleSort}
                      />
                      <SortableHead
                        label="Approved Points"
                        column="approvedPoints"
                        sortColumn={passportSort.sortColumn}
                        sortDirection={passportSort.sortDirection}
                        onSort={passportSort.handleSort}
                      />
                      <SortableHead
                        label="Little Tickets"
                        column="littleTickets"
                        sortColumn={passportSort.sortColumn}
                        sortDirection={passportSort.sortDirection}
                        onSort={passportSort.handleSort}
                      />
                      <SortableHead
                        label="Big Tickets"
                        column="bigTickets"
                        sortColumn={passportSort.sortColumn}
                        sortDirection={passportSort.sortDirection}
                        onSort={passportSort.handleSort}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPassports.map((row) => (
                      <TableRow key={row.passport._id}>
                        <TableCell>
                          <div className="font-medium">{row.player?.discordUsername ?? "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{row.player?.epicUsername}</div>
                        </TableCell>
                        <TableCell>{row.user?.discordUsername ?? row.user?.username ?? row.user?.name ?? "Unknown"}</TableCell>
                        <TableCell>{new Date(row.passport.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{row.approvedStamps}</TableCell>
                        <TableCell>{row.littleWheelEntries}</TableCell>
                        <TableCell>{row.bigWheelEntries}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exports" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Recalculation and Wheel Exports</CardTitle>
                <CardDescription>Recalculation runs in the background and only uses campaign-tagged events.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button onClick={handleRecalculate} disabled={isRecalculating}>
                  {isRecalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Recalculate Progress
                </Button>
                <Button variant="outline" onClick={() => downloadCsv("summer-slam-progress.csv", exportData?.progress ?? [])}>
                  <Download className="mr-2 h-4 w-4" /> Full Progress
                </Button>
                <Button variant="outline" onClick={() => downloadCsv("summer-slam-little-wheel.csv", exportData?.littleWheelEntries ?? [])}>
                  <Download className="mr-2 h-4 w-4" /> Little Wheel
                </Button>
                <Button variant="outline" onClick={() => downloadCsv("summer-slam-big-wheel.csv", exportData?.bigWheelEntries ?? [])}>
                  <Download className="mr-2 h-4 w-4" /> Big Wheel
                </Button>
                <Button variant="outline" onClick={() => downloadCsv("summer-slam-passports.csv", (passports ?? []).map((row) => ({
                  passportId: row.passport._id,
                  playerId: row.passport.playerId,
                  discordName: row.player?.discordUsername ?? "",
                  epicName: row.player?.epicUsername ?? "",
                  createdAt: new Date(row.passport.createdAt).toISOString(),
                  approvedStamps: row.approvedStamps,
                  littleWheelEntries: row.littleWheelEntries,
                  bigWheelEntries: row.bigWheelEntries,
                  completedQuests: row.completedQuests,
                })))}>
                  <Download className="mr-2 h-4 w-4" /> Passports
                </Button>
                <Button variant="outline" onClick={() => downloadCsv("summer-slam-submissions.csv", (exportData?.submissions ?? []).map((row) => ({
                  submissionId: row._id,
                  questId: row.questId,
                  playerId: row.playerId,
                  status: row.status,
                  submittedAt: new Date(row.submittedAt).toISOString(),
                  evidenceTypes: row.evidenceTypes.join("; "),
                })))}>
                  <Download className="mr-2 h-4 w-4" /> Manual Submissions
                </Button>
                <Button variant="outline" onClick={() => downloadCsv("summer-slam-approved-points.csv", (exportData?.approvedStamps ?? []).map((row) => ({
                  progressId: row._id,
                  questId: row.questId,
                  playerId: row.playerId,
                  points: row.stampReward,
                  approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : "",
                  source: row.awardSource ?? "",
                  log: row.awardLog ?? "",
                })))}>
                  <Download className="mr-2 h-4 w-4" /> Approved Points
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!questPendingDelete} onOpenChange={(open) => { if (!open) setQuestPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quest?</AlertDialogTitle>
            <AlertDialogDescription>
              {questPendingDelete ? (
                <>
                  This permanently deletes <strong>{questPendingDelete.title}</strong> along with every player's
                  progress and submissions for it. Wheel tickets and stamp totals will be recalculated. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingQuest}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void handleDeleteQuest(); }}
              disabled={isDeletingQuest}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingQuest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete quest
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPageLayout>
    </CompactMobileButtonsOptOut>
  );
}
