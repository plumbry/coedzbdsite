import { Flag } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import {
  sealStateLabel,
  type SealProgress,
} from "./passport-seal.ts";

function StatePill({ seal }: { seal: SealProgress }) {
  const { state } = seal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        state === "earned" && "bg-emerald-100 text-emerald-700",
        state === "submitted" && "bg-amber-100 text-amber-800",
        state === "in_progress" && "bg-sky-100 text-sky-700",
        state === "locked" && "bg-slate-100 text-slate-500",
      )}
    >
      {state === "in_progress" && seal.total > 0
        ? `${seal.approved}/${seal.total} done`
        : sealStateLabel(state)}
    </span>
  );
}

function NextFlag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
      <Flag className="h-3 w-3" aria-hidden />
      Next destination
    </span>
  );
}

function JourneyNode({
  seal,
  isNext,
  index,
  size,
  onSelect,
}: {
  seal: SealProgress;
  isNext: boolean;
  index: number;
  size: number;
  onSelect: (seal: SealProgress) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(seal)}
      aria-label={`${seal.meta.title} — ${sealStateLabel(seal.state)}`}
      className="group flex min-h-11 flex-col items-center gap-2 rounded-2xl p-2 text-center touch-manipulation transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <span className="flex h-5 items-center">{isNext ? <NextFlag /> : null}</span>
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full transition-all duration-200",
          isNext && "ring-2 ring-sky-400 ring-offset-2 ring-offset-[#FDFBF7]",
        )}
        style={{ width: size + 12, height: size + 12 }}
      >
        <PassportSealImage
          meta={seal.meta}
          state={seal.state}
          size={size}
          className={cn(isNext && "scale-105", "transition-transform")}
        />
      </span>
      <span className="text-xs font-black uppercase tracking-wide text-slate-800">
        {seal.meta.label}
      </span>
      <StatePill seal={seal} />
      <span className="text-[10px] font-semibold text-slate-400">Stop {index + 1}</span>
    </button>
  );
}

/**
 * The core dashboard feature: five collectible seals laid out as a journey,
 * connected by a travel route. Seals are the largest elements on the page.
 */
export function PassportJourney({
  seals,
  nextSealId,
  onSelect,
}: {
  seals: SealProgress[];
  nextSealId: string | null;
  onSelect: (seal: SealProgress) => void;
}) {
  return (
    <section
      aria-label="Passport journey"
      className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-[#FDFBF7] p-5 shadow-sm sm:p-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(120,100,80,0.5) 0 1px, transparent 1px 16px)",
        }}
      />

      <div className="relative mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900">Your journey</h2>
          <p className="text-sm text-slate-600">
            Travel between destinations and collect all five seals.
          </p>
        </div>
      </div>

      {/* Desktop: horizontal route */}
      <div className="relative hidden md:block">
        <svg
          aria-hidden
          viewBox="0 0 1000 60"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-6 top-[52px] h-16 w-[calc(100%-3rem)] text-sky-300"
        >
          <path
            d="M0 30 C 150 0, 250 60, 400 30 S 650 0, 800 30 1000 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="ss-route-dash"
          />
        </svg>
        <ol className="relative flex items-start justify-between gap-2">
          {seals.map((seal, index) => (
            <li key={seal.id} className="flex-1">
              <JourneyNode
                seal={seal}
                index={index}
                isNext={seal.id === nextSealId}
                size={104}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ol>
      </div>

      {/* Mobile: vertical route */}
      <ol className="relative space-y-3 md:hidden">
        <span
          aria-hidden
          className="absolute bottom-6 left-[44px] top-6 w-0.5 border-l-2 border-dashed border-sky-300"
        />
        {seals.map((seal, index) => {
          const isNext = seal.id === nextSealId;
          return (
            <li key={seal.id} className="relative">
              <button
                type="button"
                onClick={() => onSelect(seal)}
                aria-label={`${seal.meta.title} — ${sealStateLabel(seal.state)}`}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border bg-white p-3 text-left touch-manipulation transition-colors",
                  isNext ? "border-sky-300 bg-sky-50/60" : "border-slate-200/80",
                )}
              >
                <span
                  className={cn(
                    "relative z-10 flex shrink-0 items-center justify-center rounded-full bg-[#FDFBF7]",
                    isNext && "ring-2 ring-sky-400 ring-offset-2 ring-offset-white",
                  )}
                >
                  <PassportSealImage meta={seal.meta} state={seal.state} size={72} />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-black uppercase tracking-wide text-slate-800">
                      {seal.meta.label}
                    </span>
                    {isNext ? <NextFlag /> : null}
                  </span>
                  <span className="block text-xs text-slate-500">Stop {index + 1}</span>
                  <StatePill seal={seal} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
