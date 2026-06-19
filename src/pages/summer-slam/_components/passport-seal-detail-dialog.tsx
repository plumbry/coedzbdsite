import { AlertTriangle, Award, Check, Clock, Stamp, Upload } from "lucide-react";
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
import { ssStatusChip } from "./passport-dashboard-theme.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import {
  formatSealDate,
  sealStateLabel,
  type SealProgress,
  type SealTask,
} from "./passport-seal.ts";
import { getQuestStatus, type QuestEntry } from "./passport-types.ts";

function statusMeta(task: SealTask) {
  if (task.done) return { label: "Earned", className: "text-emerald-700", icon: Check };
  if (task.pending) return { label: "Awaiting review", className: "text-amber-700", icon: Clock };
  if (task.needsFix) return { label: "Needs fix", className: "text-red-700", icon: AlertTriangle };
  return { label: "Not done", className: "text-slate-500", icon: null };
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
  const earnedDate = formatSealDate(seal.earnedAt);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <PassportSealImage meta={meta} state={seal.state} size={96} />
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">{meta.title}</h2>
          <span className={ssStatusChip(seal.state)}>{sealStateLabel(seal.state)}</span>
          <p className="text-sm text-stone-600">{meta.tagline}</p>
        </div>
      </div>

      {earnedDate ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          <Award className="h-4 w-4" aria-hidden />
          Seal earned on {earnedDate}
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Progress</span>
          <span className="tabular-nums text-slate-700">
            {seal.approved} / {seal.total} tasks
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${seal.percent}%`, backgroundColor: meta.accent }}
          />
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Requirements & tasks
        </h3>
        {seal.tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
            Tasks for this seal are being set up.
          </p>
        ) : (
          <ul className="space-y-2">
            {seal.tasks.map((task) => {
              const info = statusMeta(task);
              const status = getQuestStatus(task.entry);
              const canSubmit =
                task.entry.quest.completionMethod === "manual" &&
                status !== "approved" &&
                status !== "pending_review";
              return (
                <li
                  key={task.entry.quest._id}
                  className="rounded-xl border border-slate-200/80 bg-white p-3"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenTask(task.entry)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {task.entry.quest.description}
                      </p>
                      <span
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide",
                          info.className,
                        )}
                      >
                        {info.icon ? <info.icon className="h-3 w-3" /> : null}
                        {info.label}
                      </span>
                    </button>
                    {canSubmit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-9 shrink-0 touch-manipulation"
                        onClick={() => onSubmitEvidence(task.entry)}
                      >
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        {task.needsFix ? "Resubmit" : "Submit"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <Stamp className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span>
          Reward:{" "}
          <span className="font-bold text-slate-900">
            {seal.meta.label} seal
          </span>{" "}
          + {seal.stampReward} passport stamp{seal.stampReward === 1 ? "" : "s"} toward prize wheel
          entries.
        </span>
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
