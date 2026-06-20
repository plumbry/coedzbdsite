import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Square,
  Stamp,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { cn } from "@/lib/utils.ts";
import { getDestination } from "./passport-destinations.ts";
import { ssStampSize } from "./passport-dashboard-theme.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { PassportStatusBadge } from "./passport-status-badge.tsx";
import {
  formatSealDate,
  getActionableEntry,
  sealBadgeStatus,
  type SealProgress,
  type SealTask,
} from "./passport-seal.ts";
import { type QuestEntry } from "./passport-types.ts";

function ChecklistIcon({ task }: { task: SealTask }) {
  if (task.done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (task.pending) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-700">
        <Clock className="h-3 w-3" />
      </span>
    );
  }
  if (task.needsFix) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-orange-300 bg-orange-50 text-orange-700">
        <AlertTriangle className="h-3 w-3" />
      </span>
    );
  }
  return <Square className="h-5 w-5 shrink-0 text-stone-300" aria-hidden />;
}

function taskStatusText(task: SealTask) {
  if (task.done) return { label: "Completed", className: "text-teal-700" };
  if (task.pending) return { label: "Pending review", className: "text-amber-700" };
  if (task.needsFix) return { label: "Needs changes", className: "text-orange-700" };
  return { label: "Not started", className: "text-stone-500" };
}

function SealDetailBody({
  seal,
  onOpenTask,
  onSubmitEvidence,
}: {
  seal: SealProgress;
  onOpenTask: (entry: QuestEntry) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
}) {
  const { meta } = seal;
  const destination = getDestination(seal.id);
  const earnedDate = formatSealDate(seal.earnedAt);
  const badgeStatus = sealBadgeStatus(seal);
  const actionableEntry = getActionableEntry(seal);
  const isEarned = seal.state === "earned";
  const isPending = !isEarned && !actionableEntry && seal.state === "submitted";

  const progressText = isEarned
    ? earnedDate
      ? `Stamp earned on ${earnedDate}`
      : "Stamp earned"
    : `${seal.approved} of ${seal.total} requirements completed`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <PassportSealImage meta={meta} state={seal.state} seal={seal} size={ssStampSize.detail} showProgressRing />
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
            {destination.name}
          </p>
          <h2 className="font-display text-xl font-semibold tracking-[0.02em] text-stone-900">
            {meta.title}
          </h2>
          <PassportStatusBadge status={badgeStatus} size="md" withTooltip={false} />
          <p className="text-sm text-stone-600">{meta.tagline}</p>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium",
          isEarned
            ? "border-teal-200 bg-teal-50 text-teal-800"
            : "border-stone-200 bg-stone-50 text-stone-700",
        )}
      >
        {isEarned ? (
          <Award className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
        )}
        {progressText}
      </div>

      {!isEarned ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>Progress</span>
            <span className="tabular-nums text-stone-700">
              {seal.approved} / {seal.total}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${seal.percent}%`, backgroundColor: meta.accent }}
            />
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Requirements</h3>
        {seal.tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-center text-sm text-stone-500">
            Challenges for this seal are being set up. Check back soon.
          </p>
        ) : (
          <ul className="space-y-2">
            {seal.tasks.map((task) => {
              const status = taskStatusText(task);
              return (
                <li key={task.entry.quest._id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.entry)}
                    className="flex w-full items-start gap-3 rounded-xl border border-stone-200/80 bg-white p-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                  >
                    <span className="mt-0.5">
                      <ChecklistIcon task={task} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm font-semibold",
                          task.done ? "text-stone-500" : "text-stone-800",
                        )}
                      >
                        {task.title}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px] font-semibold uppercase tracking-wide",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-300" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
        <Stamp className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
        <span>
          Reward: the <span className="font-bold text-stone-900">{meta.label} stamp</span>. Every
          quest you complete also earns a Little Wheel ticket (every 5 quests = a Big Wheel ticket).
        </span>
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 border-t border-stone-200 bg-white px-1 pt-3 sm:flex-row sm:justify-end">
        {isEarned ? (
          <Button disabled className="min-h-11 touch-manipulation sm:min-w-44">
            <Award className="mr-1.5 h-4 w-4" />
            Seal earned
          </Button>
        ) : actionableEntry ? (
          <Button
            className="min-h-11 touch-manipulation sm:min-w-44"
            onClick={() => onSubmitEvidence(actionableEntry)}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {seal.needsFix > 0 ? "Resubmit evidence" : "Submit evidence"}
          </Button>
        ) : isPending ? (
          <Button disabled variant="outline" className="min-h-11 touch-manipulation sm:min-w-44">
            <Clock className="mr-1.5 h-4 w-4" />
            Awaiting review
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PassportSealDetailDialog({
  open,
  seal,
  onClose,
  onOpenTask,
  onSubmitEvidence,
}: {
  open: boolean;
  seal: SealProgress | null;
  onClose: () => void;
  onOpenTask: (entry: QuestEntry) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
}) {
  const isMobile = useIsMobile();
  if (!seal) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()} direction="bottom">
        <DrawerContent className="max-h-[92vh] overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="sr-only">{seal.meta.title}</DrawerTitle>
            <DrawerDescription className="sr-only">{seal.meta.tagline}</DrawerDescription>
          </DrawerHeader>
          <SealDetailBody
            seal={seal}
            onOpenTask={onOpenTask}
            onSubmitEvidence={onSubmitEvidence}
          />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{seal.meta.title}</DialogTitle>
          <DialogDescription className="sr-only">{seal.meta.tagline}</DialogDescription>
        </DialogHeader>
        <SealDetailBody seal={seal} onOpenTask={onOpenTask} onSubmitEvidence={onSubmitEvidence} />
      </DialogContent>
    </Dialog>
  );
}
