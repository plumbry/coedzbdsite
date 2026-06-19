import { CalendarDays, MapPin, Compass, Stamp } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { SeasonSummary } from "./passport-seal.ts";

function StatChip({
  icon,
  value,
  label,
  className,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm",
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600">
        {icon}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-lg font-black tabular-nums text-slate-900">{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/**
 * First actionable information a player sees: who they are, how far through the
 * season they are, and the destination they are working toward.
 */
export function PassportWelcome({
  playerName,
  season,
}: {
  playerName: string;
  season: SeasonSummary;
}) {
  const { earnedSeals, totalSeals, percent, nextSeal, daysRemaining, isComplete } = season;

  return (
    <section
      aria-label="Welcome"
      className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">
            Welcome back,{" "}
            <span className="bg-gradient-to-r from-sky-500 to-orange-500 bg-clip-text text-transparent">
              {playerName}
            </span>
          </h2>
          <p className="text-sm text-slate-600">
            {isComplete
              ? "Every seal collected — you've completed the Summer Slam journey!"
              : "Keep exploring, keep growing, and complete your Summer Slam journey."}
          </p>
        </div>

        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border px-4 py-3",
            isComplete
              ? "border-emerald-200 bg-emerald-50"
              : "border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50",
          )}
        >
          <MapPin
            className={cn("h-5 w-5 shrink-0", isComplete ? "text-emerald-600" : "text-sky-600")}
            aria-hidden
          />
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {isComplete ? "Journey complete" : "Current destination"}
            </p>
            <p className="text-sm font-black text-slate-900">
              {isComplete ? "All seals earned" : (nextSeal?.meta.title ?? "—")}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatChip
          icon={<Compass className="h-4 w-4" />}
          value={`${percent}%`}
          label="Season progress"
        />
        <StatChip
          icon={<Stamp className="h-4 w-4" />}
          value={`${earnedSeals} / ${totalSeals}`}
          label="Seals earned"
        />
        <StatChip
          icon={<CalendarDays className="h-4 w-4" />}
          value={daysRemaining != null ? String(daysRemaining) : "—"}
          label={daysRemaining != null ? "Days remaining" : "Season dates TBA"}
        />
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Passport progress</span>
          <span className="tabular-nums text-slate-700">
            {earnedSeals} / {totalSeals} seals
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-orange-400 transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}
