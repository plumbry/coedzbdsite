import { useMemo, useState } from "react";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
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
import { Download, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  ADMIN_CATEGORY_LABELS,
  DEMO_CAMPAIGN,
  DEMO_COUNTS,
  DEMO_PASSPORTS,
  DEMO_QUESTS,
  DEMO_REVIEW_QUEUE,
  type AdminCategory,
  type DemoQuest,
} from "./_components/admin-mock-data.ts";

type CompletionMethod = "auto" | "manual" | "admin";
type ReviewStatus = "pending_review" | "approved" | "rejected" | "needs_more_evidence";

const DEMO_NOTICE = "Demo mode — changes are not saved.";

export default function SummerSlamAdminDemoPage() {
  const [quests, setQuests] = useState<DemoQuest[]>(DEMO_QUESTS);
  const [questPendingDelete, setQuestPendingDelete] = useState<DemoQuest | null>(null);
  const [editingQuestId, setEditingQuestId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<AdminCategory>("traveller");
  const [description, setDescription] = useState("");
  const [evidenceInstructions, setEvidenceInstructions] = useState("");
  const [adminHint, setAdminHint] = useState("");
  const [sortOrder, setSortOrder] = useState(10);
  const [isActive, setIsActive] = useState(true);
  const [completionMethod, setCompletionMethod] = useState<CompletionMethod>("manual");
  const [stampReward, setStampReward] = useState(1);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("pending_review");
  const [filterText, setFilterText] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  const [campaignTitle, setCampaignTitle] = useState(DEMO_CAMPAIGN.title);
  const [campaignDescription, setCampaignDescription] = useState(DEMO_CAMPAIGN.description);
  const [campaignActive, setCampaignActive] = useState(DEMO_CAMPAIGN.isActive);
  const [stampName, setStampName] = useState(DEMO_CAMPAIGN.stampName);
  const [littleWheelEvery, setLittleWheelEvery] = useState(DEMO_CAMPAIGN.littleWheelEntryEveryStamps);
  const [bigWheelEvery, setBigWheelEvery] = useState(DEMO_CAMPAIGN.bigWheelEntryEveryStamps);

  const filteredReviewQueue = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    const byStatus = DEMO_REVIEW_QUEUE.filter((row) => row.status === reviewStatus);
    if (!term) return byStatus;
    return byStatus.filter(
      (row) =>
        row.discordUsername.toLowerCase().includes(term) ||
        row.epicUsername.toLowerCase().includes(term) ||
        row.questTitle.toLowerCase().includes(term) ||
        ADMIN_CATEGORY_LABELS[row.category].toLowerCase().includes(term) ||
        row.evidenceTypes.some((type) => type.toLowerCase().includes(term)),
    );
  }, [filterText, reviewStatus]);

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
  };

  const handleEditQuest = (quest: DemoQuest) => {
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
  };

  const handleDeleteQuest = () => {
    if (!questPendingDelete) return;
    setQuests((prev) => prev.filter((quest) => quest._id !== questPendingDelete._id));
    if (editingQuestId === questPendingDelete._id) {
      resetQuestForm();
    }
    toast.success("Quest deleted.");
    setQuestPendingDelete(null);
  };

  return (
    <PageShell maxWidth="wide">
      <PageHeader
        title="Summer Slam Passport — Admin Demo"
        description="A read-only preview of the staff control panel with mock data. Actions are disabled."
        variant="compact"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-orange-300 text-orange-700">
            Preview
          </Badge>
          <p className="text-xs text-orange-900/70">Mock data — nothing here is saved.</p>
        </div>
        <a href="/summer-slam/passport/demo" className="text-[11px] font-medium text-teal-700 hover:underline">
          Passport demo →
        </a>
      </div>

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
              <Button onClick={() => toast.info(DEMO_NOTICE)}>
                <Save className="mr-2 h-4 w-4" />
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
                <li>Export Little Wheel and Big Wheel tickets from Recalculate &amp; Exports.</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Tagged Events</p>
              <p className="text-2xl font-bold">{DEMO_COUNTS.taggedEvents}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active Quests</p>
              <p className="text-2xl font-bold">{DEMO_COUNTS.activeQuests}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pending Reviews</p>
              <p className="text-2xl font-bold">{DEMO_COUNTS.pendingSubmissions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Approved Points</p>
              <p className="text-2xl font-bold">{DEMO_COUNTS.approvedStamps}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="quests">
          <TabsList>
            <TabsTrigger value="quests">Quests</TabsTrigger>
            <TabsTrigger value="review">Review Queue</TabsTrigger>
            <TabsTrigger value="passports">Passports</TabsTrigger>
            <TabsTrigger value="exports">Recalculate &amp; Exports</TabsTrigger>
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
                    <Select value={category} onValueChange={(value) => setCategory(value as AdminCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ADMIN_CATEGORY_LABELS).map(([value, label]) => (
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

                <div className="flex gap-2">
                  <Button onClick={() => toast.info(DEMO_NOTICE)}>
                    <Save className="mr-2 h-4 w-4" />
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
                    {quests.map((quest) => (
                      <TableRow key={quest._id}>
                        <TableCell className="font-medium">{quest.title}</TableCell>
                        <TableCell>{ADMIN_CATEGORY_LABELS[quest.category]}</TableCell>
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
                              onClick={() => setQuestPendingDelete(quest)}
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
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.discordUsername}</div>
                          <div className="text-xs text-muted-foreground">{row.epicUsername}</div>
                        </TableCell>
                        <TableCell>
                          <div>{row.questTitle}</div>
                          <div className="text-xs text-muted-foreground">{ADMIN_CATEGORY_LABELS[row.category]}</div>
                        </TableCell>
                        <TableCell>{row.evidenceTypes.join(", ")}</TableCell>
                        <TableCell className="max-w-sm">
                          <div className="space-y-1 text-xs">
                            {row.evidenceUrls.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer" className="block truncate text-primary underline">{url}</a>
                            ))}
                            {row.notes && <p className="line-clamp-2 text-muted-foreground">{row.notes}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {row.status === "pending_review" ? (
                            <>
                              <Button size="sm" onClick={() => toast.info(DEMO_NOTICE)}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => toast.info(DEMO_NOTICE)}>Needs More</Button>
                              <Button size="sm" variant="destructive" onClick={() => toast.info(DEMO_NOTICE)}>Reject</Button>
                            </>
                          ) : (
                            <Badge variant="secondary">Reviewed</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredReviewQueue.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No submissions with this status.
                        </TableCell>
                      </TableRow>
                    )}
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
                    {DEMO_PASSPORTS.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.discordUsername}</div>
                          <div className="text-xs text-muted-foreground">{row.epicUsername}</div>
                        </TableCell>
                        <TableCell>{row.discordUsername}</TableCell>
                        <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
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
                <Button onClick={() => toast.info(DEMO_NOTICE)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recalculate Progress
                </Button>
                <Button variant="outline" onClick={() => toast.info(DEMO_NOTICE)}>
                  <Download className="mr-2 h-4 w-4" /> Full Progress
                </Button>
                <Button variant="outline" onClick={() => toast.info(DEMO_NOTICE)}>
                  <Download className="mr-2 h-4 w-4" /> Little Wheel
                </Button>
                <Button variant="outline" onClick={() => toast.info(DEMO_NOTICE)}>
                  <Download className="mr-2 h-4 w-4" /> Big Wheel
                </Button>
                <Button variant="outline" onClick={() => toast.info(DEMO_NOTICE)}>
                  <Download className="mr-2 h-4 w-4" /> Passports
                </Button>
                <Button variant="outline" onClick={() => toast.info(DEMO_NOTICE)}>
                  <Download className="mr-2 h-4 w-4" /> Manual Submissions
                </Button>
                <Button variant="outline" onClick={() => toast.info(DEMO_NOTICE)}>
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); handleDeleteQuest(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete quest
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
