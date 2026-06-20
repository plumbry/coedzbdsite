import { AlertTriangle, Check, ChevronRight, Clock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { PassportSectionHeader } from "./passport-section-header.tsx";
import {
  ssCard,
  ssCardPad,
  ssStampSize,
  ssStatusChip,
} from "./passport-dashboard-theme.ts";
import { getDestination } from "./passport-destinations.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { sealBadgeStatus, sealStateLabel, type SealProgress, type SealTask } from "./passport-seal.ts";
import type { QuestCategory, QuestEntry } from "./passport-types.ts";

function TaskLine({ task, onOpen }: { task: SealTask; onOpen: () => void }) {
  const { done, pending, needsFix, title } = task;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left touch-manipulation hover:bg-orange-50/80"
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          done && "border-teal-500 bg-teal-500 text-white",
          pending && "border-amber-300 bg-amber-50 text-amber-700",
          needsFix && "border-orange-300 bg-orange-50 text-orange-700",
          !done && !pending && !needsFix && "border-orange-200 bg-white",
        )}
      >
        {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
        {pending ? <Clock className="h-2.5 w-2.5" /> : null}
        {needsFix ? <AlertTriangle className="h-2.5 w-2.5" /> : null}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs",
          done ? "text-orange-400 line-through" : "text-orange-950",
        )}
      >
        {title}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-orange-300" />
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
  const dest = getDestination(seal.id);
  const status = sealBadgeStatus(seal);
  const showSubmit =
    actionableEntry &&
    seal.entries.some((entry) => entry.quest._id === actionableEntry.quest._id);

  return (
    <article className={cn(ssCard, isNext && "ring-1 ring-orange-400/40")}>
      <div
        className="flex items-center gap-2 border-b border-orange-100 px-3 py-2"
        style={{ backgroundColor: `${dest.tint}cc` }}
      >
        <PassportSealImage meta={meta} state={state} seal={seal} size={ssStampSize.challenge} showBadge={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-bold text-orange-950">{dest.name}</p>
            {isNext ? (
              <span className="shrink-0 rounded-full bg-orange-500 px-1.5 py-px text-[8px] font-bold uppercase text-white">
                Focus
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className={ssStatusChip(status)}>{sealStateLabel(state)}</span>
            {total > 0 ? (
              <span className="text-[10px] tabular-nums text-orange-700/60">
                {approved}/{total} · {percent}%
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn(ssCardPad, "pt-2")}>
        {total > 0 ? (
          <>
            <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-orange-100">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${percent}%`, backgroundColor: meta.accent }}
              />
            </div>
            <ul className="space-y-0">
              {seal.tasks.map((task) => (
                <li key={task.entry.quest._id}>
                  <TaskLine task={task} onOpen={() => onOpenTask(task.entry)} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="py-2 text-center text-xs text-orange-800/50">Coming soon</p>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {showSubmit ? (
            <Button
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => onSubmitEvidence(actionableEntry)}
            >
              <Upload className="mr-1 h-3 w-3" />
              Submit
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-orange-200 px-2.5 text-xs"
            onClick={() => onViewSeal(seal)}
          >
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
  nextSealId: QuestCategory | null;
  actionableEntry: QuestEntry | null;
  onOpenTask: (entry: QuestEntry) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
  onViewSeal: (seal: SealProgress) => void;
}) {
  return (
    <section aria-label="Challenge details">
      <PassportSectionHeader title="Challenges" description="Status & tasks by destination" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
