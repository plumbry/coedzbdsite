import { cn } from "@/lib/utils.ts";
import { AlertCircle, Check, Clock } from "lucide-react";
import type { QuestEntry } from "./passport-types.ts";
import { getCategoryPage, getQuestStatus } from "./passport-types.ts";

function formatApprovalDate(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function approvalSourceLabel(source?: string) {
  if (source === "auto") return "Auto Awarded";
  if (source === "manual_review") return "Approved by Staff";
  if (source === "admin") return "Awarded by Staff";
  return null;
}

export function PassportStampBadge({
  entry,
  compact,
}: {
  entry: QuestEntry;
  compact?: boolean;
}) {
  const status = getQuestStatus(entry);
  const progressCurrent = entry.progress?.progressCurrent ?? 0;
  const progressTarget = entry.progress?.progressTarget;
  const approvalDate = formatApprovalDate(entry.progress?.approvedAt);
  const sourceLabel = approvalSourceLabel(entry.progress?.awardSource);
  const category = getCategoryPage(entry.quest.category);

  const sizeClass = compact ? "h-16 w-16" : "h-28 w-28";
  const textSize = compact ? "text-[8px]" : "text-[10px]";

  if (status === "approved") {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex rotate-[-8deg] flex-col items-center justify-center rounded-full border-[3px] shadow-sm",
            sizeClass,
            category.stampBorder,
            category.stampBg,
          )}
        >
          <Check className={cn(compact ? "h-4 w-4" : "h-6 w-6", category.stampText)} strokeWidth={3} />
          {!compact && (
            <span className={cn("font-bold uppercase tracking-widest", textSize, category.stampText)}>
              Stamp
            </span>
          )}
        </div>
        {!compact && approvalDate && (
          <p className="text-center text-xs text-slate-500">{approvalDate}</p>
        )}
        {!compact && sourceLabel && (
          <p className="text-center text-xs font-medium text-emerald-700">{sourceLabel}</p>
        )}
      </div>
    );
  }

  if (status === "pending_review") {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex items-center justify-center rounded-full border-2 border-dashed border-amber-400 bg-amber-50",
            sizeClass,
          )}
        >
          <Clock className={cn(compact ? "h-5 w-5" : "h-7 w-7", "text-amber-600")} />
        </div>
        {!compact && (
          <p className="text-center text-xs font-bold uppercase text-amber-700">In Review</p>
        )}
      </div>
    );
  }

  if (status === "rejected" || status === "needs_more_evidence") {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex items-center justify-center rounded-full border-2 border-red-300 bg-red-50",
            sizeClass,
          )}
        >
          <AlertCircle className={cn(compact ? "h-5 w-5" : "h-7 w-7", "text-red-600")} />
        </div>
        {!compact && (
          <>
            <p className="text-center text-xs font-bold uppercase text-red-700">
              {status === "needs_more_evidence" ? "More Evidence Needed" : "Rejected"}
            </p>
            {entry.progress?.awardLog && (
              <p className="max-w-[140px] text-center text-xs text-red-600">
                {entry.progress.awardLog}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  if (status === "in_progress" && progressTarget) {
    const pct = Math.min(100, Math.round((progressCurrent / progressTarget) * 100));
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "relative flex items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-50",
            sizeClass,
          )}
        >
          <div className="text-center">
            <p className={cn("font-bold tabular-nums text-slate-800", compact ? "text-xs" : "text-lg")}>
              {progressCurrent}/{progressTarget}
            </p>
            {!compact && (
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Progress</p>
            )}
          </div>
          {!compact && (
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${pct * 2.76} 276`}
                className="text-slate-600"
              />
            </svg>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 opacity-70">
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50",
          sizeClass,
        )}
      />
      {!compact && (
        <p className="text-xs text-slate-500">Stamp not earned</p>
      )}
    </div>
  );
}
