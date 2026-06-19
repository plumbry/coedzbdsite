import { AlertTriangle, Check, ChevronRight, Clock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import type { SealProgress, SealTask } from "./passport-seal.ts";
import type { QuestEntry } from "./passport-types.ts";

function TaskRow({ task, onOpen }: { task: SealTask; onOpen: () => void }) {
  const { done, pending, needsFix, title } = task;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left touch-manipulation hover:bg-slate-50"
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
            done && "border-emerald-500 bg-emerald-500 text-white",
            pending && "border-amber-400 bg-amber-50 text-amber-600",
            needsFix && "border-red-400 bg-red-50 text-red-600",
            !done && !pending && !needsFix && "border-slate-300 bg-white",
          )}
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
          {pending ? <Clock className="h-3.5 w-3.5" /> : null}
          {needsFix ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium",
            done ? "text-slate-400 line-through" : "text-slate-800",
          )}
        >
          {title}
        </span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {done ? "Done" : pending ? "In review" : needsFix ? "Fix" : "To do"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      </button>
    </li>
  );
}

/**
 * The single most important section: always identifies the next seal to unlock
 * and guides the player toward it with a clear checklist and submit action.
 */
export function PassportNextDestination({
  seal,
  actionableEntry,
  onOpenTask,
  onSubmitEvidence,
  onViewSeal,
}: {
  seal: SealProgress | null;
  actionableEntry: QuestEntry | null;
  onOpenTask: (entry: QuestEntry) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
  onViewSeal: (seal: SealProgress) => void;
}) {
  if (!seal) {
    return (
      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-emerald-800">Journey complete!</h2>
        <p className="mt-1 text-sm text-emerald-700">
          You've collected every Summer Slam seal. Keep an eye on Discord for prize wheel draws.
        </p>
      </section>
    );
  }

  const { meta } = seal;

  return (
    <section
      aria-label="Next destination"
      className="relative overflow-hidden rounded-3xl border-2 p-5 shadow-md sm:p-6"
      style={{ borderColor: `${meta.accent}66` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundColor: meta.accent }}
      />
      <div className="relative">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm"
            style={{ backgroundColor: meta.accent }}
          >
            Next destination
          </span>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={() => onViewSeal(seal)}
            className="mx-auto shrink-0 rounded-full touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:mx-0"
            aria-label={`View ${meta.title}`}
          >
            <PassportSealImage meta={meta} state={seal.state} size={128} />
          </button>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">{meta.title}</h2>
              <p className="text-sm text-slate-600">{meta.tagline}</p>
            </div>

            {seal.total > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums text-slate-800">
                    {seal.approved} / {seal.total} complete
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${seal.percent}%`, backgroundColor: meta.accent }}
                    />
                  </div>
                </div>

                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white">
                  {seal.tasks.map((task) => (
                    <TaskRow
                      key={task.entry.quest._id}
                      task={task}
                      onOpen={() => onOpenTask(task.entry)}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Tasks for this seal are being set up. Check back soon.
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {actionableEntry ? (
                <Button
                  onClick={() => onSubmitEvidence(actionableEntry)}
                  className="min-h-11 touch-manipulation"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Submit Evidence
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => onViewSeal(seal)}
                className="min-h-11 touch-manipulation"
              >
                View seal details
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
