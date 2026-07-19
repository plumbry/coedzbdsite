import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Gift,
  Square,
  Stamp,
  Target,
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
  sealBadgeStatus,
  type SealProgress,
  type SealTask,
} from "./passport-seal.ts";
import { getQuestTypeInfo } from "./passport-quest-meta.ts";
import { QuestMarkdown } from "./quest-markdown.tsx";
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

function getStampGoalCopy(seal: SealProgress, isBonus: boolean): string {
  if (seal.state === "earned") {
    return isBonus ? "Bonus stamp claimed" : `${seal.meta.label} stamp earned`;
  }

  if (seal.total <= 0) {
    return "Quests coming soon";
  }

  const remaining = Math.max(seal.total - seal.approved, 0);
  if (remaining === 0) {
    return isBonus ? "Bonus stamp ready to claim" : `${seal.meta.label} stamp ready to claim`;
  }

  if (isBonus) {
    return remaining === 1
      ? "1 quest left to claim your bonus stamp"
      : `${remaining} quests left to claim your bonus stamp`;
  }

  return remaining === 1
    ? `1 quest left to earn the ${seal.meta.label} stamp`
    : `${remaining} quests left to earn the ${seal.meta.label} stamp`;
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
    <div className="flex items-start gap-2 rounded-md border border-orange-100/80 bg-white/70 px-2 py-1.5 text-left">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-teal-700">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-teal-800/65">{label}</p>
        <p className="text-[11px] font-semibold leading-snug text-orange-950">{value}</p>
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
  const stampGoalLabel = getStampGoalCopy(seal, isBonus);

  return (
    <div
      className={cn(
        PAGE_SURFACE,
        PAGE_PAD,
        "flex min-h-0 flex-col items-center text-center sm:p-2.5",
        "lg:h-full lg:min-h-0 lg:justify-between lg:gap-2 lg:overflow-hidden lg:p-2.5",
      )}
    >
      {isEarned ? <PageCompletedBadge /> : null}
      <PassportStampCelebration active={celebrating} />

      <div className="flex w-full shrink-0 flex-col items-center">
        <div className="relative mx-auto mb-2 w-24 sm:w-[6.5rem] lg:w-[6.75rem]">
          <PassportSealImage
            meta={meta}
            state={seal.state}
            seal={seal}
            fill
            animateEarned={celebrating}
          />
        </div>

        <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-teal-800/60">
          {isBonus ? "Bonus" : "Page"}
        </p>
        <h2 className="mt-0.5 font-display text-sm font-semibold leading-tight text-orange-950 sm:text-base">
          {meta.label}
        </h2>
        <PassportStatusBadge status={badgeStatus} size="sm" withTooltip={false} className="mt-1" />
        <p className="mt-1 max-w-[15rem] text-[10px] leading-snug text-orange-900/55 sm:text-[11px]">
          {meta.tagline}
        </p>
        {isEarned ? (
          <p className="mt-1.5 inline-block rounded-full bg-teal-50 px-2 py-px text-[8px] font-semibold text-teal-800">
            {earnedDate ? `Earned ${earnedDate}` : "Stamp earned"}
          </p>
        ) : null}
      </div>

      <dl className="mt-2.5 flex w-full shrink-0 flex-col gap-1 sm:mt-3">
        <PageSummaryRow icon={Target} label="Quest Progress" value={questProgressLabel} />
        <PageSummaryRow icon={Gift} label="Stamp Completion Reward" value={pageRewardLabel} />
        <PageSummaryRow icon={Stamp} label="Stamp Goal" value={stampGoalLabel} />
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

            return (
              <li key={task.entry.quest._id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.entry)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-2.5 rounded-md border bg-white/70 px-2.5 py-2 text-left touch-manipulation hover:border-teal-200/80 hover:bg-teal-50/30 sm:gap-3 sm:px-3 sm:py-2.5",
                    task.needsFix
                      ? "border-red-200/90 bg-red-50/20 hover:border-red-300 hover:bg-red-50/40"
                      : "border-orange-100/90",
                  )}
                >
                  <span className="shrink-0">
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
                    <QuestCardStatus status={status} />
                  </span>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-orange-300"
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
  const typeInfo = getQuestTypeInfo(quest.completionMethod, quest.evidenceInput);
  const canSubmit =
    typeInfo.requiresSubmission &&
    status !== "approved" &&
    status !== "pending_review";
  const canResubmit =
    typeInfo.requiresSubmission &&
    (status === "rejected" || status === "needs_more_evidence");
  const showSubmitButton = (canSubmit || canResubmit) && submissionsOpen;
  const showClosedNote = (canSubmit || canResubmit) && !submissionsOpen;
  const showPendingNote = typeInfo.requiresSubmission && status === "pending_review";
  const showAutoNote = quest.completionMethod === "auto" && status !== "approved";

  return (
    <div
      className={cn(
        PAGE_SURFACE,
        PAGE_PAD,
        "col-span-full flex min-h-0 flex-1 flex-col items-center text-center lg:col-span-2 lg:min-h-0",
      )}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto">
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
        <div className="mt-3 max-w-md text-sm leading-snug text-orange-900/60 sm:text-[13px]">
          <QuestMarkdown className="text-orange-900/60 sm:text-[13px]">{quest.description}</QuestMarkdown>
        </div>
        {quest.evidenceInstructions && typeInfo.requiresSubmission ? (
          <div className="mt-2 max-w-md rounded-lg border border-orange-100/80 bg-orange-50/50 px-2.5 py-2 text-left text-xs leading-snug text-orange-900/70">
            <QuestMarkdown className="text-xs text-orange-900/70">{quest.evidenceInstructions}</QuestMarkdown>
          </div>
        ) : null}
        {progress?.awardLog && (status === "rejected" || status === "needs_more_evidence") ? (
          <p className="mt-2 max-w-md rounded border border-orange-100 bg-orange-50/60 px-2.5 py-1.5 text-left text-xs text-orange-900/70">
            {progress.awardLog}
          </p>
        ) : null}
      </div>

      <div className="mt-3 w-full max-w-md shrink-0 space-y-2">
        {showSubmitButton ? (
          <Button
            size="sm"
            className="h-10 w-full px-3 text-xs touch-manipulation sm:h-9"
            onClick={onSubmitEvidence}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {canResubmit ? "Resubmit evidence" : "Submit evidence"}
          </Button>
        ) : null}
        {showClosedNote ? (
          <p className="text-xs text-orange-800/60">Evidence submissions are not open right now.</p>
        ) : null}
        {showPendingNote ? (
          <p className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-2 text-xs text-amber-900/80">
            Evidence submitted — awaiting staff review (typically 48–72 hours).
          </p>
        ) : null}
        {showAutoNote ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled
            className="h-10 w-full whitespace-normal px-3 text-xs leading-snug touch-manipulation sm:h-9"
          >
            Quest Auto-Completes via Admin Approved Yunite Leaderboards
          </Button>
        ) : null}
        {status === "approved" ? (
          <p className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-2.5 py-2 text-xs font-semibold text-teal-900">
            Quest complete
          </p>
        ) : null}
      </div>
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
