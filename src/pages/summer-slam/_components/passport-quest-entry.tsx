import { cn } from "@/lib/utils.ts";
import { ChevronRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { PassportAdminHint } from "./passport-admin-hint.tsx";
import { PassportStampBadge } from "./passport-stamp-badge.tsx";
import { PassportQuestTypeBadge } from "./passport-quest-type-badge.tsx";
import { getQuestStatus, type QuestEntry } from "./passport-types.ts";

export function PassportQuestEntry({
  entry,
  compact,
  onOpen,
  onSubmitEvidence,
}: {
  entry: QuestEntry;
  compact?: boolean;
  onOpen?: () => void;
  onSubmitEvidence: () => void;
}) {
  const { quest, progress } = entry;
  const status = getQuestStatus(entry);
  const canSubmit =
    quest.completionMethod === "manual" &&
    status !== "approved" &&
    status !== "pending_review";
  const canResubmit =
    quest.completionMethod === "manual" &&
    (status === "rejected" || status === "needs_more_evidence");

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen ?? onSubmitEvidence}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-[#F7F8FA] p-3 text-left transition-colors hover:border-slate-300 hover:bg-white",
          status === "approved" && "ring-1 ring-emerald-100",
          (status === "rejected" || status === "needs_more_evidence") && "ring-1 ring-red-100",
          status === "pending_review" && "ring-1 ring-amber-100",
        )}
      >
        <div className="shrink-0 scale-75">
          <PassportStampBadge entry={entry} compact />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate font-semibold text-slate-900">{quest.title}</p>
            <PassportAdminHint hint={quest.adminHint} className="h-7 w-7" />
          </div>
          <div className="mt-0.5">
            <PassportQuestTypeBadge
              method={quest.completionMethod}
              evidenceInput={quest.evidenceInput}
              variant="inline"
            />
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
    );
  }

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm",
        status === "approved" && "ring-1 ring-emerald-100",
        (status === "rejected" || status === "needs_more_evidence") && "ring-1 ring-red-100",
      )}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="space-y-2 pr-2">
          <div className="flex items-start gap-1">
            <h3 className="flex-1 text-lg font-bold leading-tight text-slate-900">{quest.title}</h3>
            <PassportAdminHint hint={quest.adminHint} />
          </div>
          <PassportQuestTypeBadge
            method={quest.completionMethod}
            evidenceInput={quest.evidenceInput}
            variant="inline"
          />
          <p className="text-sm leading-relaxed text-slate-600">{quest.description}</p>
          {quest.evidenceInstructions && quest.completionMethod === "manual" && (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {quest.evidenceInstructions}
            </p>
          )}
          {progress?.awardLog && status === "approved" && (
            <p className="text-xs text-emerald-700">{progress.awardLog}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3">
          <PassportStampBadge entry={entry} />
          {(canSubmit || canResubmit) && (
            <Button size="lg" className="w-full min-w-[160px]" onClick={onSubmitEvidence}>
              <Upload className="mr-2 h-4 w-4" />
              {canResubmit ? "Resubmit Evidence" : "Submit Evidence"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
