import { AlertTriangle, Check, ChevronRight, Clock, Compass, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { getDestination } from "./passport-destinations.ts";
import { PassportAtmosphere } from "./passport-atmosphere.tsx";
import { ssCard, ssLabel, ssStampSize } from "./passport-dashboard-theme.ts";
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
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left touch-manipulation hover:bg-orange-50/60"
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
            done && "border-teal-500 bg-teal-500 text-white",
            pending && "border-amber-400 bg-amber-50 text-amber-600",
            needsFix && "border-orange-400 bg-orange-50 text-orange-600",
            !done && !pending && !needsFix && "border-orange-200 bg-white",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
          {pending ? <Clock className="h-3.5 w-3.5" /> : null}
          {needsFix ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium",
            done ? "text-orange-400 line-through" : "text-orange-950",
          )}
        >
          {title}
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
          {done ? "Done" : pending ? "In review" : needsFix ? "Update" : "To do"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-orange-300" />
      </button>
    </li>
  );
}

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
      <section className="relative overflow-hidden rounded-2xl border border-teal-300/60 bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50 p-6 text-center shadow-[0_8px_32px_rgba(20,184,166,0.12)]">
        <PassportAtmosphere className="opacity-50" />
        <div className="relative">
          <h2 className="font-display text-2xl font-semibold tracking-[0.02em] text-teal-900">
            You&apos;ve reached Summer Finale!
          </h2>
          <p className="mt-1 text-sm text-teal-700/80">
            Every destination visited, every stamp collected. Watch Discord for prize wheel draws and
            Hall of Fame recognition.
          </p>
        </div>
      </section>
    );
  }

  const { meta, state } = seal;
  const dest = getDestination(seal.id);

  return (
    <section
      aria-label="Next destination"
      className="relative overflow-hidden rounded-2xl border-2 p-5 shadow-[0_8px_28px_rgba(249,115,22,0.1)] sm:p-6"
      style={{ borderColor: `${dest.accent}55` }}
    >
      <PassportAtmosphere className="opacity-40" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ background: `linear-gradient(135deg, ${dest.tint}, transparent)` }}
      />

      <div className="relative">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${dest.accent}, ${meta.accent})` }}
          >
            <Compass className="h-3 w-3" aria-hidden />
            Next destination
          </span>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => onViewSeal(seal)}
            className="mx-auto shrink-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 sm:mx-0 sm:self-center"
            aria-label={`View ${meta.title}`}
          >
            <PassportSealImage meta={meta} state={state} seal={seal} size={ssStampSize.hero} showProgressRing />
          </button>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className={ssLabel}>{dest.name}</p>
              <h2 className="font-display text-2xl font-semibold tracking-[0.02em] text-orange-950">
                {meta.title}
              </h2>
              <p className="text-sm text-orange-900/60">{meta.tagline}</p>
            </div>

            {seal.total > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums text-orange-950">
                    {seal.approved} / {seal.total} complete
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-orange-100">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${seal.percent}%`, backgroundColor: meta.accent }}
                    />
                  </div>
                </div>

                <ul className="divide-y divide-orange-100 rounded-2xl border border-orange-200/60 bg-white/80">
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
              <p className="rounded-2xl border border-dashed border-orange-200 bg-white/80 px-4 py-6 text-center text-sm text-orange-800/50">
                Challenges for this destination are being set up. Check back soon.
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {actionableEntry ? (
                <Button
                  onClick={() => onSubmitEvidence(actionableEntry)}
                  className="min-h-11 touch-manipulation bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Submit evidence
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => onViewSeal(seal)}
                className="min-h-11 border-orange-200 touch-manipulation hover:bg-orange-50"
              >
                View stamp details
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
