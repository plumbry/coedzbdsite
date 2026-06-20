import { Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { InfoTooltip } from "./passport-info-tooltip.tsx";
import { PASSPORT_HEADER } from "./passport-assets.ts";
import { ssLabel, ssStatCell } from "./passport-dashboard-theme.ts";

export function PassportHero({
  title,
  daysRemaining,
  earnedSeals,
  totalSeals,
  approvedQuests,
  totalQuests,
  questPercent,
  currentDestination,
  className,
}: {
  title: string;
  daysRemaining: number | null;
  earnedSeals: number;
  totalSeals: number;
  approvedQuests: number;
  totalQuests: number;
  questPercent: number;
  currentDestination: string | null;
  className?: string;
}) {
  return (
    <header className={cn("overflow-hidden", className)}>
      <div className={cn("flex flex-col items-center gap-3 px-1 pb-1 pt-1")}>
        <div className="flex flex-col items-center text-center">
          <h1 className="sr-only">{title}</h1>
          <img
            src={PASSPORT_HEADER.src}
            alt={title}
            width={PASSPORT_HEADER.width}
            height={PASSPORT_HEADER.height}
            className="h-32 w-auto max-w-full sm:h-40 lg:max-h-[12.875rem] lg:h-auto"
          />
        </div>

        <dl className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-stretch sm:justify-center sm:gap-2">
          <div className={ssStatCell}>
            <dt className={cn(ssLabel, "flex items-center gap-0.5")}>
              Quest Progress
              <InfoTooltip
                label="About quest progress"
                text="Shows how many Summer Slam quests you've completed so far."
                className="h-4 w-4"
              />
            </dt>
            <dd className="text-sm font-bold tabular-nums text-orange-950">
              {questPercent}%
              <span className="ml-1 text-xs font-semibold text-orange-500">
                ({approvedQuests}/{totalQuests})
              </span>
            </dd>
          </div>

          <div className={ssStatCell}>
            <dt className={cn(ssLabel, "flex items-center gap-0.5")}>
              Stamp Progress
              <InfoTooltip
                label="About stamp progress"
                text="Each stamp is earned by completing all the quests in its category."
                className="h-4 w-4"
              />
            </dt>
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
