import {
  ArrowLeft,
  Award,
  Check,
  ChevronRight,
  Clock,
  Square,
  Upload,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { ssLabel, ssPassportSpine, ssStampSize } from "./passport-dashboard-theme.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { PassportStatusBadge } from "./passport-status-badge.tsx";
import { PassportStampCelebration } from "./passport-stamp-celebration.tsx";
import {
  BONUS_STAMP_ID,
  BONUS_STAMP_META,
  type BonusStampId,
} from "./passport-bonus-stamp.ts";
import {
  formatSealDate,
  getActionableEntry,
  sealBadgeStatus,
  type SealProgress,
  type SealTask,
} from "./passport-seal.ts";
import {
  getQuestStatus,
  statusLabel,
  type QuestCategory,
  type QuestEntry,
} from "./passport-types.ts";

export type PassportPageId = QuestCategory | BonusStampId;

const PAGE_PAD = "p-2 sm:p-2.5";
const PAGE_SURFACE =
  "relative overflow-hidden rounded-lg border border-orange-100/80 bg-gradient-to-br from-[#FFFCF8] to-[#F8FFFE] lg:h-full lg:min-h-0";

function ChecklistIcon({ task, compact }: { task: SealTask; compact?: boolean }) {
  const size = compact ? "h-4 w-4" : "h-5 w-5";
  const iconSize = compact ? "h-2.5 w-2.5" : "h-3 w-3";

  if (task.done) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-teal-500 text-white", size)}>
        <Check className={iconSize} strokeWidth={3} />
      </span>
    );
  }
  if (task.pending) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-700",
          size,
        )}
      >
        <Clock className={iconSize} />
      </span>
    );
  }
  if (task.needsFix) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-red-400 bg-red-50 text-red-600",
          size,
        )}
        aria-label="Returned by staff — update evidence"
      >
        <span className={cn("font-bold leading-none", compact ? "text-[10px]" : "text-xs")}>!</span>
      </span>
    );
  }
  return <Square className={cn("shrink-0 text-orange-200", size)} aria-hidden />;
}

function PageCompletedBadge() {
  return (
    <div
      className="pointer-events-none absolute right-0 top-0 z-10 rotate-12 rounded border border-teal-600/70 bg-teal-50/95 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-teal-800"
      aria-hidden
    >
      Complete
    </div>
  );
}

function LeftPage({
  seal,
  isBonus,
  celebrating,
}: {
  seal: SealProgress;
  isBonus: boolean;
  celebrating: boolean;
}) {
  const { meta } = seal;
  const badgeStatus = sealBadgeStatus(seal);
  const isEarned = seal.state === "earned";
  const earnedDate = formatSealDate(seal.earnedAt);

  return (
    <div
      className={cn(
        PAGE_SURFACE,
        PAGE_PAD,
        "flex shrink-0 flex-row items-center gap-3 text-left lg:flex-col lg:items-center lg:justify-center lg:text-center",
      )}
    >
      {isEarned ? <PageCompletedBadge /> : null}
      <PassportStampCelebration active={celebrating} />

      <div className="relative shrink-0 lg:mb-1.5">
        <PassportSealImage
          meta={meta}
          state={seal.state}
          seal={seal}
          size={ssStampSize.challenge}
          showProgressRing
          animateEarned={celebrating}
        />
      </div>

      <div className="min-w-0 flex-1 lg:flex-none">
        <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-teal-800/60">
          {isBonus ? "Bonus" : "Page"}
        </p>
        <h2 className="font-display text-sm font-semibold leading-tight text-orange-950">{meta.label}</h2>
        <PassportStatusBadge status={badgeStatus} size="sm" withTooltip={false} className="mt-1" />
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-orange-900/55 lg:line-clamp-2">
          {meta.tagline}
        </p>
        <p
          className={cn(
            "mt-1.5 inline-block rounded-full px-2 py-px text-[9px] font-semibold",
            isEarned ? "bg-teal-50 text-teal-800" : "bg-orange-50/80 text-orange-800/65",
          )}
        >
          {isEarned
            ? earnedDate
              ? `Earned ${earnedDate}`
              : "Stamp earned"
            : `${seal.approved}/${seal.total} quests`}
        </p>
      </div>
    </div>
  );
}

function QuestListPage({
  seal,
  onOpenTask,
  onSubmitEvidence,
}: {
  seal: SealProgress;
  onOpenTask: (entry: QuestEntry) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
}) {
  const actionableEntry = getActionableEntry(seal);
  const isEarned = seal.state === "earned";
  const isPending = !isEarned && !actionableEntry && seal.state === "submitted";

  return (
    <div className={cn(PAGE_SURFACE, PAGE_PAD, "flex min-h-0 flex-1 flex-col")}>
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
        <p className={ssLabel}>Quests</p>
        {!isEarned && seal.total > 0 ? (
          <span className="text-[10px] font-bold tabular-nums text-orange-950/70">
            {seal.approved}/{seal.total}
          </span>
        ) : null}
      </div>

      {!isEarned && seal.total > 0 ? (
        <div className="mb-1.5 h-1 shrink-0 overflow-hidden rounded-full bg-orange-100/90">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${seal.percent}%`, backgroundColor: seal.meta.accent }}
          />
        </div>
      ) : null}

      {seal.tasks.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-[10px] text-orange-800/50">
          Coming soon
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1">
          {seal.tasks.map((task) => (
            <li key={task.entry.quest._id}>
              <button
                type="button"
                onClick={() => onOpenTask(task.entry)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border bg-white/70 px-2 py-2 text-left touch-manipulation hover:border-teal-200/80 hover:bg-teal-50/30 lg:gap-1.5 lg:px-1.5 lg:py-1",
                  task.needsFix
                    ? "border-red-200/90 bg-red-50/20 hover:border-red-300 hover:bg-red-50/40"
                    : "border-orange-100/90",
                )}
              >
                <ChecklistIcon task={task} compact />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[11px] font-medium",
                    task.done ? "text-orange-800/45 line-through" : "text-orange-950",
                  )}
                >
                  {task.title}
                </span>
                <ChevronRight className="h-3 w-3 shrink-0 text-orange-300" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 shrink-0">
        {isEarned ? (
          <Button disabled size="sm" className="h-7 w-full px-2 text-[10px] touch-manipulation">
            <Award className="mr-1 h-3 w-3" />
            Stamp earned
          </Button>
        ) : actionableEntry ? (
          <Button
            size="sm"
            className="h-7 w-full px-2 text-[10px] touch-manipulation"
            onClick={() => onSubmitEvidence(actionableEntry)}
          >
            <Upload className="mr-1 h-3 w-3" />
            {seal.needsFix > 0 ? "Resubmit" : "Submit evidence"}
          </Button>
        ) : isPending ? (
          <Button disabled size="sm" variant="outline" className="h-7 w-full px-2 text-[10px] touch-manipulation">
            <Clock className="mr-1 h-3 w-3" />
            Awaiting review
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CompactQuestPage({
  entry,
  onSubmitEvidence,
}: {
  entry: QuestEntry;
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

  return (
    <div className={cn(PAGE_SURFACE, PAGE_PAD, "col-span-full flex min-h-0 flex-1 flex-col lg:col-span-2")}>
      <p className={ssLabel}>{quest.category.replace(/_/g, " ")}</p>
      <h2 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-orange-950">
        {quest.title}
      </h2>
      <p
        className={cn(
          "mt-1 inline-flex w-fit rounded-full px-2 py-px text-[9px] font-semibold uppercase",
          status === "approved" && "bg-teal-100 text-teal-800",
          status === "pending_review" && "bg-amber-100 text-amber-800",
          (status === "rejected" || status === "needs_more_evidence") && "bg-orange-100 text-orange-800",
          status === "not_started" && "bg-orange-50 text-orange-700/70",
          status === "in_progress" && "bg-sky-100 text-sky-800",
        )}
      >
        {statusLabel(status)}
      </p>
      <p className="mt-1.5 line-clamp-3 flex-1 text-[10px] leading-snug text-orange-900/60">
        {quest.description}
      </p>
      {progress?.awardLog && (status === "rejected" || status === "needs_more_evidence") ? (
        <p className="mt-1 line-clamp-2 rounded border border-orange-100 bg-orange-50/60 px-2 py-1 text-[10px] text-orange-900/70">
          {progress.awardLog}
        </p>
      ) : null}
      {(canSubmit || canResubmit) && (
        <Button
          size="sm"
          className="mt-2 h-7 shrink-0 px-2 text-[10px] touch-manipulation"
          onClick={onSubmitEvidence}
        >
          <Upload className="mr-1 h-3 w-3" />
          {canResubmit ? "Resubmit evidence" : "Submit evidence"}
        </Button>
      )}
    </div>
  );
}

export function PassportPageSpread({
  seal,
  selectedQuest,
  celebrating,
  onBackToCover,
  onOpenTask,
  onCloseQuest,
  onSubmitEvidence,
  className,
}: {
  seal: SealProgress;
  selectedQuest: QuestEntry | null;
  celebrating: boolean;
  onBackToCover: () => void;
  onOpenTask: (entry: QuestEntry) => void;
  onCloseQuest: () => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const isBonus = (seal.id as string) === BONUS_STAMP_ID;

  return (
    <motion.div
      className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={selectedQuest ? onCloseQuest : onBackToCover}
        className="mb-2 h-9 shrink-0 touch-manipulation px-2 text-xs text-teal-800 hover:bg-teal-50 hover:text-teal-950 lg:mb-1 lg:h-7 lg:px-1.5 lg:text-[11px]"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4 lg:mr-1 lg:h-3.5 lg:w-3.5" aria-hidden />
        {selectedQuest ? `Back to ${seal.meta.label}` : "Passport Overview"}
      </Button>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-0">
        <div aria-hidden className={cn(ssPassportSpine, "hidden lg:block")} />

        {selectedQuest ? (
          <CompactQuestPage
            entry={selectedQuest}
            onSubmitEvidence={() => onSubmitEvidence(selectedQuest)}
          />
        ) : (
          <>
            <LeftPage seal={seal} isBonus={isBonus} celebrating={celebrating} />
            <QuestListPage seal={seal} onOpenTask={onOpenTask} onSubmitEvidence={onSubmitEvidence} />
          </>
        )}
      </div>
    </motion.div>
  );
}

/** Build a synthetic bonus seal progress object for the hidden stamp page. */
export function buildBonusSealProgress(entries: QuestEntry[]): SealProgress {
  const tasks = entries.map((entry) => ({
    entry,
    title: entry.quest.title,
    done: entry.progress?.status === "approved",
    pending: entry.progress?.status === "pending_review",
    needsFix:
      entry.progress?.status === "rejected" || entry.progress?.status === "needs_more_evidence",
  }));
  const total = entries.length;
  const approved = tasks.filter((t) => t.done).length;
  const pending = tasks.filter((t) => t.pending).length;
  const needsFix = tasks.filter((t) => t.needsFix).length;
  const earned = total > 0 && approved === total;

  return {
    id: BONUS_STAMP_ID as unknown as QuestCategory,
    meta: {
      id: BONUS_STAMP_ID as unknown as QuestCategory,
      label: BONUS_STAMP_META.label,
      title: BONUS_STAMP_META.title,
      tagline: BONUS_STAMP_META.tagline,
      image: "",
      accent: BONUS_STAMP_META.accent,
      tint: BONUS_STAMP_META.tint,
      glow: "shadow-[0_10px_40px_-8px_rgba(201,162,39,0.55)]",
      text: "text-amber-600",
    },
    state: earned ? "earned" : approved > 0 || pending > 0 ? "in_progress" : "locked",
    entries,
    tasks,
    total,
    approved,
    pending,
    needsFix,
    remaining: total - approved,
    percent: total > 0 ? Math.round((approved / total) * 100) : 0,
    stampReward: entries.reduce((sum, e) => sum + e.quest.stampReward, 0),
  };
}
