import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Loader2 } from "lucide-react";
import { textToBullets } from "@/pages/summer-slam/_components/passport-quest-meta.ts";
import {
  buildReviewMessage,
  REJECTION_REASON_TEMPLATES,
} from "./summer-slam-rejection-reasons.ts";

type ReviewStatus = "pending_review" | "approved" | "rejected" | "needs_more_evidence";

type Category = "traveller" | "competitor" | "summer_spirit" | "team_player" | "community";

type QualificationRule =
  | { type: "play_events"; count: number }
  | { type: "play_team_format"; teamFormat: string }
  | { type: "play_all_team_formats" }
  | { type: "reach_top"; placement: number; eventCount?: number; teamFormat?: string }
  | { type: "win_game"; teamFormat?: string };

type ReviewQueueRow = {
  submission: {
    _id: Id<"seasonalQuestSubmissions">;
    status: ReviewStatus;
    evidenceTypes: string[];
    evidenceUrls?: string[];
    notes?: string;
    submittedAt: number;
    reviewNote?: string;
    rejectionReason?: string;
    reviewedAt?: number;
  };
  quest: {
    title: string;
    category: Category;
    description: string;
    evidenceInstructions?: string;
    adminHint?: string;
    stampReward: number;
    completionMethod: string;
    evidenceInput?: string;
    qualificationRule?: QualificationRule;
  } | null;
  player: {
    discordUsername: string;
    epicUsername: string;
  } | null;
  images: Array<{
    _id: Id<"seasonalSubmissionImages">;
    url: string | null;
    fileName: string;
  }>;
};

const categoryLabels: Record<Category, string> = {
  traveller: "Traveller",
  competitor: "Competitor",
  summer_spirit: "Summer Spirit",
  team_player: "Team Player",
  community: "Community",
};

function formatQualificationRule(rule: QualificationRule): string {
  switch (rule.type) {
    case "play_events":
      return `Play ${rule.count} campaign event${rule.count === 1 ? "" : "s"}`;
    case "play_team_format":
      return `Play a ${rule.teamFormat} event`;
    case "play_all_team_formats":
      return "Play Duos, Trios, and Squads events";
    case "reach_top":
      return `Reach top ${rule.placement} in ${rule.eventCount ?? 1} event${(rule.eventCount ?? 1) === 1 ? "" : "s"}${rule.teamFormat ? ` (${rule.teamFormat})` : ""}`;
    case "win_game":
      return `Win a game${rule.teamFormat ? ` in ${rule.teamFormat}` : ""}`;
    default:
      return "Auto-tracked quest";
  }
}

function formatSubmittedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SummerSlamReviewSheetProps = {
  row: ReviewQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: (
    submissionId: Id<"seasonalQuestSubmissions">,
    status: ReviewStatus,
    reviewNote?: string,
    rejectionReason?: string,
  ) => Promise<void>;
  isReviewing?: boolean;
};

export function SummerSlamReviewSheet({
  row,
  open,
  onOpenChange,
  onReview,
  isReviewing = false,
}: SummerSlamReviewSheetProps) {
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [extraNote, setExtraNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setTemplateId(undefined);
    setExtraNote("");
  }, [open, row?.submission._id]);

  if (!row) return null;

  const isPending = row.submission.status === "pending_review";
  const quest = row.quest;
  const playerMessage = buildReviewMessage(templateId || undefined, extraNote);

  const handleReview = async (status: ReviewStatus) => {
    if (status === "approved") {
      await onReview(row.submission._id, status);
      return;
    }
    await onReview(
      row.submission._id,
      status,
      extraNote.trim() || undefined,
      playerMessage,
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{quest?.title ?? "Submission review"}</SheetTitle>
          <SheetDescription>
            {row.player?.discordUsername ?? "Unknown player"}
            {row.player?.epicUsername ? ` · ${row.player.epicUsername}` : ""}
            {" · "}
            Submitted {formatSubmittedAt(row.submission.submittedAt)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 py-4">
          {quest ? (
            <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{categoryLabels[quest.category]}</Badge>
                <Badge variant="secondary">{quest.stampReward} wheel point{quest.stampReward === 1 ? "" : "s"}</Badge>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Quest requirements</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
                  {textToBullets(quest.description).map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
              {quest.evidenceInstructions ? (
                <div>
                  <h3 className="text-sm font-semibold">Evidence instructions</h3>
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                    {quest.evidenceInstructions}
                  </p>
                </div>
              ) : null}
              {quest.adminHint ? (
                <div>
                  <h3 className="text-sm font-semibold">Admin hint</h3>
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{quest.adminHint}</p>
                </div>
              ) : null}
              {quest.qualificationRule ? (
                <div>
                  <h3 className="text-sm font-semibold">Auto rule</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatQualificationRule(quest.qualificationRule)}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Submitted evidence</h3>
            <div className="flex flex-wrap gap-1">
              {row.submission.evidenceTypes.map((type) => (
                <Badge key={type} variant="outline">
                  {type.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
            {row.submission.evidenceUrls?.map((url) => (
              <div key={url} className="rounded-md border p-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm text-primary underline"
                >
                  {url}
                </a>
              </div>
            ))}
            {row.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {row.images.map((image) =>
                  image.url ? (
                    <a
                      key={image._id}
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border"
                    >
                      <img
                        src={image.url}
                        alt={image.fileName}
                        className="aspect-video w-full object-cover"
                      />
                      <p className="truncate px-2 py-1 text-xs text-muted-foreground">{image.fileName}</p>
                    </a>
                  ) : null,
                )}
              </div>
            ) : null}
            {row.submission.notes ? (
              <div className="rounded-md border bg-muted/20 p-2">
                <p className="text-xs font-medium text-muted-foreground">Player notes</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{row.submission.notes}</p>
              </div>
            ) : null}
          </section>

          {!isPending && (row.submission.reviewNote || row.submission.rejectionReason) ? (
            <section className="rounded-lg border border-dashed p-3">
              <h3 className="text-sm font-semibold">Review note</h3>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                {row.submission.rejectionReason ?? row.submission.reviewNote}
              </p>
              {row.submission.reviewedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Reviewed {formatSubmittedAt(row.submission.reviewedAt)}
                </p>
              ) : null}
            </section>
          ) : null}

          {isPending ? (
            <section className="space-y-3 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Review note for player</h3>
              <div className="space-y-1.5">
                <Label>Rejection / needs-more template</Label>
                <Select
                  value={templateId}
                  onValueChange={setTemplateId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason (optional for approve)" />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_REASON_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="review-extra-note">Additional note (optional)</Label>
                <Textarea
                  id="review-extra-note"
                  value={extraNote}
                  onChange={(event) => setExtraNote(event.target.value)}
                  placeholder="Add specific feedback for the player..."
                  rows={3}
                />
              </div>
              {playerMessage ? (
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-xs font-medium text-muted-foreground">Player will see</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{playerMessage}</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        {isPending ? (
          <SheetFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => handleReview("approved")} disabled={isReviewing}>
              {isReviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Quick approve
            </Button>
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleReview("needs_more_evidence")}
                disabled={isReviewing}
              >
                Needs more
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => handleReview("rejected")}
                disabled={isReviewing}
              >
                Reject
              </Button>
            </div>
          </SheetFooter>
        ) : (
          <SheetFooter>
            <Badge variant="secondary">{row.submission.status.replace(/_/g, " ")}</Badge>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

export type { ReviewQueueRow, ReviewStatus };
