import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
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
import { Download, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

const CAMPAIGN_SLUG = "summer-slam";

type Category = "traveller" | "competitor" | "summer_spirit" | "team_player" | "community";
type CompletionMethod = "auto" | "manual" | "admin";
type TeamFormat = "duos" | "trios" | "squads";
type RuleType = "play_events" | "play_team_format" | "play_all_team_formats" | "reach_top" | "win_game";
type ReviewStatus = "pending_review" | "approved" | "rejected" | "needs_more_evidence";

const categoryLabels: Record<Category, string> = {
  traveller: "Traveller",
  competitor: "Competitor",
  summer_spirit: "Summer Spirit",
  team_player: "Team Player",
  community: "Community",
};

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

function buildRule(args: {
  ruleType: RuleType;
  threshold: number;
  placement: number;
  eventCount: number;
  teamFormat: TeamFormat;
  useTeamFormat: boolean;
}) {
  if (args.ruleType === "play_events") {
    return { type: "play_events" as const, count: args.threshold };
  }
  if (args.ruleType === "play_team_format") {
    return { type: "play_team_format" as const, teamFormat: args.teamFormat };
  }
  if (args.ruleType === "play_all_team_formats") {
    return { type: "play_all_team_formats" as const };
  }
  if (args.ruleType === "reach_top") {
    return {
      type: "reach_top" as const,
      placement: args.placement,
      eventCount: args.eventCount,
      ...(args.useTeamFormat ? { teamFormat: args.teamFormat } : {}),
    };
  }
  return {
    type: "win_game" as const,
    ...(args.useTeamFormat ? { teamFormat: args.teamFormat } : {}),
  };
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
  const [stampReward, setStampReward] = useState(1);
  const [ruleType, setRuleType] = useState<RuleType>("play_events");
  const [threshold, setThreshold] = useState(1);
  const [placement, setPlacement] = useState(10);
  const [eventCount, setEventCount] = useState(1);
  const [teamFormat, setTeamFormat] = useState<TeamFormat>("trios");
  const [useTeamFormat, setUseTeamFormat] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("pending_review");
  const [filterText, setFilterText] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignActive, setCampaignActive] = useState(true);
  const [stampName, setStampName] = useState("Passport Stamp");
  const [littleWheelEvery, setLittleWheelEvery] = useState(1);
  const [bigWheelEvery, setBigWheelEvery] = useState(5);
  const [isSavingQuest, setIsSavingQuest] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [questPendingDelete, setQuestPendingDelete] = useState<
    { _id: Id<"seasonalQuests">; title: string } | null
  >(null);
  const [isDeletingQuest, setIsDeletingQuest] = useState(false);
  const { isAdmin } = useUserRole();

  const ensureCampaign = useMutation(api.seasonal.ensureSummerSlamCampaign);
  const updateCampaign = useMutation(api.seasonal.updateCampaign);
  const saveQuest = useMutation(api.seasonal.saveQuest);
  const deleteQuest = useMutation(api.seasonal.deleteQuest);
  const reviewSubmission = useMutation(api.seasonal.reviewSubmission);
  const recalculateCampaign = useMutation(api.seasonal.recalculateCampaign);
  const dashboard = useQuery(api.seasonal.getAdminDashboard, isAdmin ? { slug: CAMPAIGN_SLUG } : "skip");
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
    setStampName(dashboard.campaign.stampName);
    setLittleWheelEvery(dashboard.campaign.littleWheelEntryEveryStamps);
    setBigWheelEvery(dashboard.campaign.bigWheelEntryEveryStamps);
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
    setStampReward(1);
    setRuleType("play_events");
    setThreshold(1);
    setPlacement(10);
    setEventCount(1);
    setTeamFormat("trios");
    setUseTeamFormat(false);
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
    setStampReward(quest.stampReward);
    const rule = quest.qualificationRule;
    if (!rule) return;
    setRuleType(rule.type);
    if (rule.type === "play_events") setThreshold(rule.count);
    if (rule.type === "play_team_format") setTeamFormat(rule.teamFormat);
    if (rule.type === "reach_top") {
      setPlacement(rule.placement);
      setEventCount(rule.eventCount ?? 1);
      setUseTeamFormat(!!rule.teamFormat);
      if (rule.teamFormat) setTeamFormat(rule.teamFormat);
    }
    if (rule.type === "win_game") {
      setUseTeamFormat(!!rule.teamFormat);
      if (rule.teamFormat) setTeamFormat(rule.teamFormat);
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
        completionMethod,
        stampReward,
        qualificationRule:
          completionMethod === "auto"
            ? buildRule({ ruleType, threshold, placement, eventCount, teamFormat, useTeamFormat })
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

  const handleReview = async (submissionId: Id<"seasonalQuestSubmissions">, status: ReviewStatus) => {
    try {
      await reviewSubmission({
        submissionId,
        status,
        reviewNote: reviewNote || undefined,
        rejectionReason:
          status === "rejected"
            ? reviewNote || "Rejected by admin."
            : status === "needs_more_evidence"
              ? reviewNote || undefined
              : undefined,
      });
      toast.success("Submission reviewed.");
      setReviewNote("");
    } catch (error) {
      console.error(error);
      toast.error("Could not review submission.");
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
        stampName,
        littleWheelEntryEveryStamps: littleWheelEvery,
        bigWheelEntryEveryStamps: bigWheelEvery,
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
    <AdminPageLayout
      requireAdmin
      title="Summer Slam Passport"
      description="Campaign-based seasonal quest configuration, evidence review, progress, and wheel exports."
      authTitle="Sign in to manage Summer Slam"
      maxWidth="wide"
    >
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Settings</CardTitle>
              <CardDescription>Create, activate, edit, or archive the current Summer Slam campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Campaign Title</Label>
                  <Input value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Stamp Name</Label>
                  <Input value={stampName} onChange={(event) => setStampName(event.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Little Wheel Ticket Every X Points</Label>
                  <Input type="number" min={1} value={littleWheelEvery} onChange={(event) => setLittleWheelEvery(Number(event.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Big Wheel Ticket Every X Points</Label>
                  <Input type="number" min={1} value={bigWheelEvery} onChange={(event) => setBigWheelEvery(Number(event.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{campaignActive ? "Active" : "Archived"}</Label>
                  <div className="flex h-10 items-center gap-2">
                    <Switch checked={campaignActive} onCheckedChange={setCampaignActive} />
                    <span className="text-sm text-muted-foreground">
                      {campaignActive ? "Players can access passports" : "Campaign is archived"}
                    </span>
                  </div>
                </div>
              </div>
              <Button onClick={handleSaveCampaign} disabled={isSavingCampaign}>
                {isSavingCampaign ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Campaign
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Launch Checklist</CardTitle>
              <CardDescription>Use this checklist before opening Summer Slam Passport to players.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Activate the campaign in Campaign Settings.</li>
                <li>Tag Summer Slam events in Events Manager and assign Duos, Trios, or Squads.</li>
                <li>Configure manual and MVP auto quests in the Quests tab.</li>
                <li>Test one linked player Passport at /summer-slam/passport.</li>
                <li>Test one manual submission, then approve/reject/request more evidence.</li>
                <li>Run recalculation after imports, quest changes, or event tag changes.</li>
                <li>Export Little Wheel and Big Wheel tickets from Recalculate & Exports.</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Tagged Events</p>
              <p className="text-2xl font-bold">{dashboard?.counts.taggedEvents ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active Quests</p>
              <p className="text-2xl font-bold">{dashboard?.counts.activeQuests ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pending Reviews</p>
              <p className="text-2xl font-bold">{dashboard?.counts.pendingSubmissions ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Approved Points</p>
              <p className="text-2xl font-bold">{dashboard?.counts.approvedStamps ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="quests">
          <TabsList>
            <TabsTrigger value="quests">Quests</TabsTrigger>
            <TabsTrigger value="review">Review Queue</TabsTrigger>
            <TabsTrigger value="passports">Passports</TabsTrigger>
            <TabsTrigger value="exports">Recalculate & Exports</TabsTrigger>
          </TabsList>

          <TabsContent value="quests" className="mt-4 grid gap-4 lg:grid-cols-[420px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>{editingQuestId ? "Edit Quest" : "Create Quest"}</CardTitle>
                <CardDescription>Quest definitions stay campaign-based; Summer Slam is the active campaign.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Completion</Label>
                    <Select value={completionMethod} onValueChange={(value) => setCompletionMethod(value as CompletionMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="manual">Manual evidence</SelectItem>
                        <SelectItem value="admin">Admin-only award</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Evidence Instructions</Label>
                  <Textarea
                    value={evidenceInstructions}
                    onChange={(event) => setEvidenceInstructions(event.target.value)}
                    placeholder="Video evidence should be submitted as a link. Please upload clips to YouTube, Twitch, TikTok, Medal, Streamable, Discord, etc. and paste the link here."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Admin Hint (optional)</Label>
                  <Textarea
                    value={adminHint}
                    onChange={(event) => setAdminHint(event.target.value)}
                    placeholder="Extra tips shown to players (e.g. modes to play, who counts as a teammate). Not required."
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Sort</Label>
                    <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Wheel Points</Label>
                    <Input type="number" min={1} value={stampReward} onChange={(event) => setStampReward(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Active</Label>
                    <div className="flex h-10 items-center">
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                  </div>
                </div>

                {completionMethod === "auto" && (
                  <div className="rounded-lg border p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Auto Rule</Label>
                      <Select value={ruleType} onValueChange={(value) => setRuleType(value as RuleType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="play_events">Play X campaign events</SelectItem>
                          <SelectItem value="play_team_format">Play a format</SelectItem>
                          <SelectItem value="play_all_team_formats">Play Duos, Trios and Squads</SelectItem>
                          <SelectItem value="reach_top">Reach Top X</SelectItem>
                          <SelectItem value="win_game">Win a game</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {ruleType === "play_events" && (
                      <div className="space-y-1.5">
                        <Label>Event Count</Label>
                        <Input type="number" min={1} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
                      </div>
                    )}
                    {(ruleType === "play_team_format" || ruleType === "reach_top" || ruleType === "win_game") && (
                      <div className="grid grid-cols-2 gap-3">
                        {ruleType !== "play_team_format" && (
                          <label className="flex items-center gap-2 text-sm">
                            <Switch checked={useTeamFormat} onCheckedChange={setUseTeamFormat} />
                            Limit to format
                          </label>
                        )}
                        {(ruleType === "play_team_format" || useTeamFormat) && (
                          <Select value={teamFormat} onValueChange={(value) => setTeamFormat(value as TeamFormat)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="duos">Duos</SelectItem>
                              <SelectItem value="trios">Trios</SelectItem>
                              <SelectItem value="squads">Squads</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    {ruleType === "reach_top" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Top Placement</Label>
                          <Input type="number" min={1} value={placement} onChange={(event) => setPlacement(Number(event.target.value))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Different Events</Label>
                          <Input type="number" min={1} value={eventCount} onChange={(event) => setEventCount(Number(event.target.value))} />
                        </div>
                      </div>
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
                      <TableHead>Quest</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dashboard?.quests ?? []).map((quest) => (
                      <TableRow key={quest._id}>
                        <TableCell className="font-medium">{quest.title}</TableCell>
                        <TableCell>{categoryLabels[quest.category]}</TableCell>
                        <TableCell>{quest.completionMethod}</TableCell>
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

          <TabsContent value="review" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-3">
              <Input className="max-w-sm" placeholder="Filter by player, quest, category, evidence..." value={filterText} onChange={(event) => setFilterText(event.target.value)} />
              <Select value={reviewStatus} onValueChange={(value) => setReviewStatus(value as ReviewStatus)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="needs_more_evidence">Needs More Evidence</SelectItem>
                </SelectContent>
              </Select>
              <Input className="max-w-md" placeholder="Tell the player what to fix or add (shown on their passport)" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Quest</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Links / Images</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReviewQueue.map((row) => (
                      <TableRow key={row.submission._id}>
                        <TableCell>
                          <div className="font-medium">{row.player?.discordUsername ?? "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{row.player?.epicUsername}</div>
                        </TableCell>
                        <TableCell>
                          <div>{row.quest?.title ?? "Unknown quest"}</div>
                          {row.quest && <div className="text-xs text-muted-foreground">{categoryLabels[row.quest.category]}</div>}
                        </TableCell>
                        <TableCell>{row.submission.evidenceTypes.join(", ")}</TableCell>
                        <TableCell className="max-w-sm">
                          <div className="space-y-1 text-xs">
                            {row.submission.evidenceUrls?.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer" className="block truncate text-primary underline">{url}</a>
                            ))}
                            {row.images.map((image) => image.url && (
                              <a key={image._id} href={image.url} target="_blank" rel="noreferrer" className="block truncate text-primary underline">{image.fileName}</a>
                            ))}
                            {row.submission.notes && <p className="line-clamp-2 text-muted-foreground">{row.submission.notes}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {row.submission.status === "pending_review" ? (
                            <>
                              <Button size="sm" onClick={() => handleReview(row.submission._id, "approved")}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => handleReview(row.submission._id, "needs_more_evidence")}>Needs More</Button>
                              <Button size="sm" variant="destructive" onClick={() => handleReview(row.submission._id, "rejected")}>Reject</Button>
                            </>
                          ) : (
                            <Badge variant="secondary">Reviewed</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="passports" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Player Passports</CardTitle>
                <CardDescription>Automatically created passports for players who visited the campaign page.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Discord User</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Approved Points</TableHead>
                      <TableHead>Little Tickets</TableHead>
                      <TableHead>Big Tickets</TableHead>
                      <TableHead>Completed Quests</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(passports ?? []).map((row) => (
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
                        <TableCell>{row.completedQuests}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exports" className="mt-4">
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
  );
}
