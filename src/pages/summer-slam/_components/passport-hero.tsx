import { Calendar, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { ssAccentBarClass, ssCard } from "./passport-dashboard-theme.ts";

export function PassportHero({
  title,
  seasonLabel,
  playerName,
  daysRemaining,
  className,
}: {
  title: string;
  seasonLabel: string;
  playerName: string;
  daysRemaining: number | null;
  className?: string;
}) {
  return (
    <header className={cn("relative overflow-hidden", ssCard, className)}>
      <div className={ssAccentBarClass} aria-hidden />
      <div className="px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-teal-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Seasonal event
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
              {title}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-stone-600">
              Complete challenges, collect official seals, and earn prize wheel entries throughout
              the summer season.
            </p>
            <p className="text-xs font-medium text-stone-500">{seasonLabel}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <div className="rounded-xl border border-stone-200/80 bg-stone-50/80 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Player
              </p>
              <p className="mt-0.5 text-sm font-semibold text-stone-900">{playerName}</p>
            </div>
            {daysRemaining != null ? (
              <div className="rounded-xl border border-orange-200/80 bg-orange-50/60 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-orange-800/80">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  Time left
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-stone-900">
                  {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
