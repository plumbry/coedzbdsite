import { AlertTriangle, Check, ChevronRight, Clock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { ssCard, ssSectionDesc, ssSectionTitle, ssStatusChip } from "./passport-dashboard-theme.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { sealStateLabel, type SealProgress, type SealTask } from "./passport-seal.ts";
import type { QuestEntry } from "./passport-types.ts";

function TaskLine({
  task,
  onOpen,
}: {
  task: SealTask;
  onOpen: () => void;
}) {
  const { done, pending, needsFix, title } = task;
  const statusText = done
    ? "Earned"
    : pending
      ? "In review"
      : needsFix
        ? "Needs fix"
        : "Open";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left touch-manipulation hover:bg-stone-50"
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          done && "border-teal-500 bg-teal-500 text-white",
          pending && "border-amber-300 bg-amber-50 text-amber-700",
          needsFix && "border-orange-300 bg-orange-50 text-orange-700",
          !done && !pending && !needsFix && "border-stone-300 bg-white",
        )}
      >
        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        {pending ? <Clock className="h-3 w-3" /> : null}
        {needsFix ? <AlertTriangle className="h-3 w-3" /> : null}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          done ? "text-stone-400 line-through" : "text-stone-800",
        )}
      >
        {title}
      </span>
      <span className="shrink-0 text-[11px] font-medium text-stone-500">{statusText}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" />
    </button>
  );
}

function ChallengeCard({
  seal,
  isNext,
  actionableEntry,
  onOpenTask,
  onSubmitEvidence,
  onViewSeal,
}: {
  seal: SealProgress;
  isNext: boolean;
  actionableEntry: QuestEntry | null;
  onOpenTask: (entry: QuestEntry) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
  onViewSeal: (seal: SealProgress) => void;
}) {
  const { meta, state, approved, total, percent } = seal;
  const showSubmit =
    actionableEntry &&
    seal.entries.some((entry) => entry.quest._id === actionableEntry.quest._id);

  return (
    <article
      className={cn(
        ssCard,
        "flex flex-col overflow-hidden",
        isNext && "ring-1 ring-teal-400/40",
      )}
    >
      <div
        className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 sm:px-5"
        style={{ backgroundColor: `${meta.tint}88` }}
      >
        <PassportSealImage meta={meta} state={state} size={48} showBadge={false} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">{meta.title}</h3>
            {isNext ? (
              <span className="rounded-md bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                Focus
              </span>
            ) : null}
          </div>
          <p className="text-xs text-stone-600">{sealStateLabel(state)}</p>
        </div>
        {total > 0 ? (
          <span className="shrink-0 text-xs font-medium tabular-nums text-stone-600">
            {approved}/{total}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-4 py-3 sm:px-5">
        {total > 0 ? (
          <>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${percent}%`, backgroundColor: meta.accent }}
              />
            </div>
            <ul className="space-y-0.5">
              {seal.tasks.map((task) => (
                <li key={task.entry.quest._id}>
                  <TaskLine task={task} onOpen={() => onOpenTask(task.entry)} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-stone-500">Challenges coming soon.</p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {showSubmit ? (
            <Button size="sm" className="min-h-9" onClick={() => onSubmitEvidence(actionableEntry)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Submit evidence
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className="min-h-9" onClick={() => onViewSeal(seal)}>
            Details
          </Button>
        </div>
      </div>
    </article>
  );
}

export function PassportChallengeGrid({
  seals,
  nextSealId,
  actionableEntry,
  onOpenTask,
  onSubmitEvidence,
  onViewSeal,
}: {
  seals: SealProgress[];
  nextSealId: string | null;
  actionableEntry: QuestEntry | null;
  onOpenTask: (entry: QuestEntry) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
  onViewSeal: (seal: SealProgress) => void;
}) {
  return (
    <section aria-label="Challenge details">
      <div className="mb-4">
        <h2 className={ssSectionTitle}>Challenge details</h2>
        <p className={ssSectionDesc}>
          What to complete in each category, current status, and evidence review state.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {seals.map((seal) => (
          <ChallengeCard
            key={seal.id}
            seal={seal}
            isNext={seal.id === nextSealId}
            actionableEntry={seal.id === nextSealId ? actionableEntry : null}
            onOpenTask={onOpenTask}
            onSubmitEvidence={onSubmitEvidence}
            onViewSeal={onViewSeal}
          />
        ))}
      </div>
    </section>
  );
}
