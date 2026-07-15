import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Gift,
  Square,
  Target,
  Unlock,
  Upload,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { ssLabel, ssPassportSpine } from "./passport-dashboard-theme.ts";
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
  SEAL_META,
  SEAL_ORDER,
  sealBadgeStatus,
  type SealProgress,
  type SealTask,
} from "./passport-seal.ts";
import {
  getQuestStatus,
  statusLabel,
  type QuestCategory,
  type QuestEntry,
  type QuestStatus,
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

function formatPageReward(stampReward: number): string {
  if (stampReward <= 0) return "Stamp for your passport";
  return `+${stampReward} Little Wheel Ticket${stampReward === 1 ? "" : "s"}`;
}

function getNextUnlockCopy(seal: SealProgress, isBonus: boolean): string {
  const isEarned = seal.state === "earned";

  if (isBonus) {
    return isEarned
      ? "Bonus stamp claimed — enjoy the glory"
      : "Finish these quests to claim your bonus stamp";
  }

  const index = SEAL_ORDER.indexOf(seal.id);
  const nextId = index >= 0 && index < SEAL_ORDER.length - 1 ? SEAL_ORDER[index + 1] : null;
  const nextLabel = nextId ? SEAL_META[nextId].label : null;

  if (isEarned) {
    if (nextLabel) return `${nextLabel} stamp unlocked`;
    return "Bonus Stamp unlocked";
  }

  if (nextLabel) return `Complete this page to unlock ${nextLabel}`;
  return "Complete this page to unlock the Bonus Stamp";
}

function PageSummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-orange-100/80 bg-white/70 px-2.5 py-2 text-left">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-50 text-teal-700">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-teal-800/65">{label}</p>
        <p className="text-[11px] font-semibold leading-snug text-orange-950 sm:text-xs">{value}</p>
      </div>
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
  const questProgressLabel =
    seal.total > 0
      ? `${seal.approved}/${seal.total} Quests Complete`
      : "Quests coming soon";
  const pageRewardLabel = formatPageReward(seal.stampReward);
  const nextUnlockLabel = getNextUnlockCopy(seal, isBonus);

  return (
    <div
      className={cn(
        PAGE_SURFACE,
        PAGE_PAD,
        "flex min-h-0 flex-col items-center text-center sm:p-3",
        "lg:h-full lg:min-h-0 lg:justify-start lg:gap-2.5 lg:overflow-y-auto lg:p-3",
      )}
    >
      {isEarned ? <PageCompletedBadge /> : null}
      <PassportStampCelebration active={celebrating} />

      <div className="flex w-full shrink-0 flex-col items-center">
        <div className="relative mx-auto mb-2.5 w-[6.75rem] sm:mb-3 sm:w-28 lg:w-[7.25rem]">
          <PassportSealImage
            meta={meta}
            state={seal.state}
            seal={seal}
            fill
            showProgressRing
            animateEarned={celebrating}
          />
        </div>

        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-teal-800/60">
          {isBonus ? "Bonus" : "Page"}
        </p>
        <h2 className="mt-0.5 font-display text-base font-semibold leading-tight text-orange-950 sm:text-lg">
          {meta.label}
        </h2>
        <PassportStatusBadge status={badgeStatus} size="sm" withTooltip={false} className="mt-1.5" />
        <p className="mt-1.5 max-w-[16rem] text-[11px] leading-snug text-orange-900/55 sm:text-xs">
          {meta.tagline}
        </p>
        {isEarned ? (
          <p className="mt-2 inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-[9px] font-semibold text-teal-800">
            {earnedDate ? `Earned ${earnedDate}` : "Stamp earned"}
          </p>
        ) : null}
      </div>

      <dl className="mt-3 flex w-full flex-col gap-1.5 sm:mt-4 lg:mt-auto lg:pt-2">
        <PageSummaryRow icon={Target} label="Quest Progress" value={questProgressLabel} />
        <PageSummaryRow icon={Gift} label="Stamp Completion Reward" value={pageRewardLabel} />
        <PageSummaryRow icon={Unlock} label="Next Unlock" value={nextUnlockLabel} />
      </dl>
    </div>
  );
}

function questCardStatusLabel(status: QuestStatus) {
  switch (status) {
    case "approved":
      return "Completed";
    case "pending_review":
      return "Pending Review";
    case "rejected":
      return "Rejected";
    case "needs_more_evidence":
      return "Needs Evidence";
    case "in_progress":
      return "In Progress";
    default:
      return "Not Started";
  }
}

function QuestCardStatus({ status }: { status: QuestStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em]",
        status === "approved" && "bg-teal-100 text-teal-800",
        status === "pending_review" && "bg-amber-100 text-amber-800",
        (status === "rejected" || status === "needs_more_evidence") && "bg-orange-100 text-orange-800",
        status === "not_started" && "bg-orange-50 text-orange-700/70",
        status === "in_progress" && "bg-sky-100 text-sky-800",
      )}
    >
      {questCardStatusLabel(status)}
    </span>
  );
}

function QuestListPage({
  seal,
  onOpenTask,
}: {
  seal: SealProgress;
  onOpenTask: (entry: QuestEntry) => void;
}) {
  const isEarned = seal.state === "earned";

  return (
    <div className={cn(PAGE_SURFACE, PAGE_PAD, "flex min-h-0 flex-1 flex-col justify-start lg:min-h-0 lg:overflow-hidden")}>
      <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
        <p className={ssLabel}>Quests</p>
        {!isEarned && seal.total > 0 ? (
          <span className="text-[10px] font-bold tabular-nums text-orange-950/70">
            {seal.approved}/{seal.total}
          </span>
        ) : null}
      </div>

      {!isEarned && seal.total > 0 ? (
        <div className="mb-2.5 h-1 shrink-0 overflow-hidden rounded-full bg-orange-100/90">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${seal.percent}%`, backgroundColor: seal.meta.accent }}
          />
        </div>
      ) : null}

      {seal.tasks.length === 0 ? (
        <p className="py-6 text-center text-[10px] text-orange-800/50">Coming soon</p>
      ) : (
        <ul className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {seal.tasks.map((task) => {
            const status = getQuestStatus(task.entry);
            const description = task.entry.quest.description?.trim();

            return (
              <li key={task.entry.quest._id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.entry)}
                  className={cn(
                    "flex min-h-[4.75rem] w-full items-start gap-2.5 rounded-md border bg-white/70 px-2.5 py-2.5 text-left touch-manipulation hover:border-teal-200/80 hover:bg-teal-50/30 sm:min-h-[5rem] sm:gap-3 sm:px-3 sm:py-3",
                    task.needsFix
                      ? "border-red-200/90 bg-red-50/20 hover:border-red-300 hover:bg-red-50/40"
                      : "border-orange-100/90",
                  )}
                >
                  <span className="mt-0.5">
                    <ChecklistIcon task={task} />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span
                      className={cn(
                        "block text-[13px] font-semibold leading-snug sm:text-sm",
                        task.done ? "text-orange-800/45 line-through" : "text-orange-950",
                      )}
                    >
                      {task.title}
                    </span>
                    {description ? (
                      <span className="line-clamp-2 block text-[11px] leading-snug text-orange-900/55 sm:text-xs">
                        {description}
                      </span>
                    ) : null}
                    <QuestCardStatus status={status} />
                  </span>
                  <ChevronRight
                    className="mt-1 h-3.5 w-3.5 shrink-0 self-center text-orange-300"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CompactQuestPage({
  entry,
  onSubmitEvidence,
  submissionsOpen,
}: {
  entry: QuestEntry;
  onSubmitEvidence: () => void;
  submissionsOpen: boolean;
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
    <div className={cn(PAGE_SURFACE, PAGE_PAD, "col-span-full flex min-h-0 flex-1 flex-col items-center text-center lg:col-span-2")}>
      <p className={cn(ssLabel, "text-xs sm:text-[11px]")}>{quest.category.replace(/_/g, " ")}</p>
      <h2 className="mt-1 line-clamp-2 text-xl font-semibold leading-snug text-orange-950 sm:text-2xl">
        {quest.title}
      </h2>
      <p
        className={cn(
          "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase sm:text-[11px]",
          status === "approved" && "bg-teal-100 text-teal-800",
          status === "pending_review" && "bg-amber-100 text-amber-800",
          (status === "rejected" || status === "needs_more_evidence") && "bg-orange-100 text-orange-800",
          status === "not_started" && "bg-orange-50 text-orange-700/70",
          status === "in_progress" && "bg-sky-100 text-sky-800",
        )}
      >
        {statusLabel(status)}
      </p>
      <p className="mt-3 line-clamp-4 max-w-md flex-1 text-sm leading-snug text-orange-900/60 sm:text-[13px]">
        {quest.description}
      </p>
      {progress?.awardLog && (status === "rejected" || status === "needs_more_evidence") ? (
        <p className="mt-2 line-clamp-3 w-full max-w-md rounded border border-orange-100 bg-orange-50/60 px-2.5 py-1.5 text-xs text-orange-900/70">
          {progress.awardLog}
        </p>
      ) : null}
      {(canSubmit || canResubmit) && submissionsOpen && (
        <Button
          size="sm"
          className="mt-3 h-9 w-full max-w-md shrink-0 px-3 text-xs touch-manipulation sm:h-8"
          onClick={onSubmitEvidence}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {canResubmit ? "Resubmit evidence" : "Submit evidence"}
        </Button>
      )}
      {(canSubmit || canResubmit) && !submissionsOpen ? (
        <p className="mt-3 text-xs text-orange-800/60">Submissions are closed for this season.</p>
      ) : null}
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
  submissionsOpen = true,
  className,
}: {
  seal: SealProgress;
  selectedQuest: QuestEntry | null;
  celebrating: boolean;
  onBackToCover: () => void;
  onOpenTask: (entry: QuestEntry) => void;
  onCloseQuest: () => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
  submissionsOpen?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const isBonus = (seal.id as string) === BONUS_STAMP_ID;

  return (
    <motion.div
      className={cn("flex min-h-0 flex-col lg:h-full lg:overflow-hidden", className)}
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

      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 lg:min-h-0 lg:grid-cols-2 lg:gap-0 lg:overflow-hidden lg:[&>*]:min-h-0 lg:[&>*]:h-full">
        <div aria-hidden className={cn(ssPassportSpine, "hidden lg:block")} />

        {selectedQuest ? (
          <CompactQuestPage
            entry={selectedQuest}
            onSubmitEvidence={() => onSubmitEvidence(selectedQuest)}
            submissionsOpen={submissionsOpen}
          />
        ) : (
          <>
            <LeftPage seal={seal} isBonus={isBonus} celebrating={celebrating} />
            <QuestListPage seal={seal} onOpenTask={onOpenTask} />
          </>
        )}
      </div>
    </motion.div>
  );
}

/** Build a synthetic bonus seal progress object for the hidden stamp page. */
export function buildBonusSealProgress(
  entries: QuestEntry[],
  taglineOverride?: string,
): SealProgress {
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
      tagline: taglineOverride ?? BONUS_STAMP_META.tagline,
      image: BONUS_STAMP_META.image,
      accent: BONUS_STAMP_META.accent,
      tint: BONUS_STAMP_META.tint,
      glow: "shadow-[0_10px_40px_-8px_rgba(147,51,234,0.45)]",
      text: "text-violet-600",
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
