import { cn } from "@/lib/utils.ts";
import {
  buildCategorySlots,
  getQuestStatus,
  SLOTS_PER_CATEGORY,
  type QuestEntry,
} from "./passport-types.ts";

export function CategoryStampDots({
  entries,
  slotCount = SLOTS_PER_CATEGORY,
  className,
}: {
  entries: QuestEntry[];
  slotCount?: number;
  className?: string;
}) {
  const slots = buildCategorySlots(entries, slotCount);

  return (
    <div className={cn("flex items-center gap-1", className)} aria-hidden>
      {slots.map((entry, index) => {
        const status = entry ? getQuestStatus(entry) : "not_started";
        const filled = status === "approved";
        const pending = status === "pending_review";
        const needsFix = status === "rejected" || status === "needs_more_evidence";
        const inProgress = status === "in_progress";

        return (
          <span
            key={entry?.quest._id ?? `dot-${index}`}
            className={cn(
              "h-2.5 w-2.5 rounded-full transition-colors",
              filled && "bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]",
              pending && "bg-amber-400 ring-2 ring-amber-200",
              needsFix && "bg-red-400 ring-2 ring-red-200",
              inProgress && "border-2 border-slate-400 bg-slate-200",
              !entry && "border border-dashed border-slate-300 bg-white",
              !filled && !pending && !needsFix && !inProgress && entry && "border border-slate-300 bg-white",
            )}
          />
        );
      })}
    </div>
  );
}

export function CategoryStampBar({
  entries,
  slotCount = SLOTS_PER_CATEGORY,
  className,
}: {
  entries: QuestEntry[];
  slotCount?: number;
  className?: string;
}) {
  const slots = buildCategorySlots(entries, slotCount);

  return (
    <div className={cn("flex h-1.5 w-full max-w-[72px] overflow-hidden rounded-full bg-slate-200/80", className)}>
      {slots.map((entry, index) => {
        const status = entry ? getQuestStatus(entry) : "not_started";
        const filled = status === "approved";

        return (
          <span
            key={entry?.quest._id ?? `seg-${index}`}
            className={cn(
              "flex-1 border-r border-white/40 last:border-r-0",
              filled ? "bg-emerald-500" : "bg-transparent",
              status === "pending_review" && "bg-amber-300",
              (status === "rejected" || status === "needs_more_evidence") && "bg-red-300",
              status === "in_progress" && "bg-slate-300",
            )}
          />
        );
      })}
    </div>
  );
}
