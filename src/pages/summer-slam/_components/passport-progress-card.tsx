import { Progress } from "@/components/ui/progress.tsx";
import { CalendarClock, MapPin, Ticket, Trophy } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { computeNextBigEntry } from "./passport-types.ts";
import { ssCard, ssLabel, ssSectionDesc, ssSectionTitle } from "./passport-dashboard-theme.ts";
import { InfoTooltip } from "./passport-info-tooltip.tsx";
import type { SeasonSummary } from "./passport-seal.ts";

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-stone-50/90 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-stone-600 shadow-sm">
        {icon}
      </span>
      <div>
        <p className={ssLabel}>{label}</p>
        <p className="text-lg font-semibold tabular-nums text-stone-900">{value}</p>
      </div>
    </div>
  );
}

export function PassportProgressCard({
  season,
  approvedStamps,
  littleWheelEntries,
  bigWheelEntries,
  bigWheelEveryStamps,
}: {
  season: SeasonSummary;
  approvedStamps: number;
  littleWheelEntries: number;
  bigWheelEntries: number;
  bigWheelEveryStamps: number;
}) {
  const { earnedSeals, totalSeals, percent, nextSeal, isComplete, daysRemaining } = season;
  const nextBig = computeNextBigEntry(approvedStamps, bigWheelEveryStamps);
  const stampsToBig = !isComplete && bigWheelEveryStamps > 0 ? nextBig.remaining : 0;

  return (
    <section className={cn(ssCard, "p-6 sm:p-7")} aria-label="Season progress">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className={ssSectionTitle}>Passport progress</h2>
            <InfoTooltip
              label="About passport progress"
              text="Shows how close you are to completing your Summer Slam passport."
            />
          </div>
          <p className={ssSectionDesc}>
            {isComplete
              ? "All category seals collected for this season."
              : "Track your path to the next seal and prize entries."}
          </p>
        </div>
        {!isComplete && nextSeal ? (
          <div className="flex max-w-xs items-start gap-2 rounded-xl border border-teal-200/70 bg-teal-50/50 px-3 py-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
            <div className="min-w-0">
              <p className={ssLabel}>Current focus</p>
              <p className="text-sm font-semibold text-stone-900">{nextSeal.meta.title}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold tabular-nums text-stone-900">
            {earnedSeals}
            <span className="text-lg font-medium text-stone-400"> / {totalSeals}</span>
          </p>
          <span className="text-sm font-medium tabular-nums text-stone-600">{percent}%</span>
        </div>
        <Progress
          value={percent}
          className="h-2.5 bg-stone-100 [&>div]:bg-gradient-to-r [&>div]:from-orange-400 [&>div]:to-teal-500"
        />
        {!isComplete && stampsToBig > 0 ? (
          <p className="text-xs text-stone-600">
            <span className="font-medium text-orange-700">
              {stampsToBig} stamp{stampsToBig === 1 ? "" : "s"}
            </span>{" "}
            until your next Big Wheel entry
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={<MapPin className="h-4 w-4" />}
          label="Seals earned"
          value={`${earnedSeals} of ${totalSeals}`}
        />
        <Metric
          icon={<CalendarClock className="h-4 w-4" />}
          label="Days remaining"
          value={daysRemaining != null ? String(daysRemaining) : "—"}
        />
        <Metric icon={<Ticket className="h-4 w-4" />} label="Little entries" value={String(littleWheelEntries)} />
        <Metric icon={<Trophy className="h-4 w-4" />} label="Big entries" value={String(bigWheelEntries)} />
      </div>
    </section>
  );
}
