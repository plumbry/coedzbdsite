import { Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  ssAccentBarClass,
  ssCard,
  ssCardPad,
  ssLabel,
  ssStatCell,
} from "./passport-dashboard-theme.ts";

export function PassportHero({
  title,
  playerName,
  daysRemaining,
  earnedSeals,
  totalSeals,
  percent,
  currentDestination,
  className,
}: {
  title: string;
  playerName: string;
  daysRemaining: number | null;
  earnedSeals: number;
  totalSeals: number;
  percent: number;
  currentDestination: string | null;
  className?: string;
}) {
  return (
    <header className={cn(ssCard, "overflow-hidden", className)}>
      <div className={ssAccentBarClass} aria-hidden />
      <div className={cn(ssCardPad, "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between")}>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-orange-950 sm:text-lg">{title}</h1>
          <p className="truncate text-xs text-orange-800/55">{playerName}</p>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:gap-2">
          <div className={ssStatCell}>
            <dt className={ssLabel}>Progress</dt>
            <dd className="text-sm font-bold tabular-nums text-orange-950">
              {percent}%
              <span className="ml-1 text-xs font-semibold text-orange-500">
                ({earnedSeals}/{totalSeals})
              </span>
            </dd>
          </div>

          <div className={ssStatCell}>
            <dt className={ssLabel}>Seals</dt>
            <dd className="text-sm font-bold tabular-nums text-teal-800">
              {earnedSeals}
              <span className="text-xs font-medium text-teal-600/70"> / {totalSeals}</span>
            </dd>
          </div>

          {currentDestination ? (
            <div className={cn(ssStatCell, "col-span-2 sm:col-span-1 sm:max-w-[11rem]")}>
              <dt className={ssLabel}>Destination</dt>
              <dd className="flex items-center gap-1 truncate text-sm font-bold text-orange-950">
                <MapPin className="h-3 w-3 shrink-0 text-orange-500" aria-hidden />
                <span className="truncate">{currentDestination}</span>
              </dd>
            </div>
          ) : (
            <div className={cn(ssStatCell, "col-span-2 sm:col-span-1")}>
              <dt className={ssLabel}>Status</dt>
              <dd className="text-sm font-bold text-teal-800">Complete</dd>
            </div>
          )}

          {daysRemaining != null ? (
            <div className={ssStatCell}>
              <dt className={ssLabel}>
                <Calendar className="mr-0.5 inline h-3 w-3" aria-hidden />
                Left
              </dt>
              <dd className="text-sm font-bold tabular-nums text-orange-950">
                {daysRemaining}d
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </header>
  );
}
