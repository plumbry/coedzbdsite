import { Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { InfoTooltip } from "./passport-info-tooltip.tsx";
import { ssLabel, ssStatCell } from "./passport-dashboard-theme.ts";

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
    <header className={cn("overflow-hidden", className)}>
      <div className={cn("flex flex-col items-center gap-3 px-1 pb-1 pt-1")}>
        <div className="flex flex-col items-center text-center">
          <h1 className="sr-only">{title}</h1>
          <img
            src="/summer-slam/passport-header.png"
            alt={title}
            width={747}
            height={329}
            className="h-40 w-auto max-w-full sm:h-52 lg:h-64"
          />
          <p className="mt-1 truncate text-xs text-orange-800/55">{playerName}</p>
        </div>

        <dl className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-stretch sm:justify-center sm:gap-2">
          <div className={ssStatCell}>
            <dt className={cn(ssLabel, "flex items-center gap-0.5")}>
              Progress
              <InfoTooltip
                label="About passport progress"
                text="Shows how close you are to completing your Summer Slam passport."
                className="h-4 w-4"
              />
            </dt>
            <dd className="text-sm font-bold tabular-nums text-orange-950">
              {percent}%
              <span className="ml-1 text-xs font-semibold text-orange-500">
                ({earnedSeals}/{totalSeals})
              </span>
            </dd>
          </div>

          <div className={ssStatCell}>
            <dt className={ssLabel}>Stamps</dt>
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
