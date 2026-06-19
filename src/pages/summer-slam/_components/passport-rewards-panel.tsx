import { Stamp, Star, Ticket, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { SEASON_REWARDS } from "./passport-destinations.ts";
import { ssCard, ssCardPad, ssLabel, ssSectionTitle, ssStatCell } from "./passport-dashboard-theme.ts";
import type { SeasonSummary } from "./passport-seal.ts";

const REWARD_ICONS = {
  passport: Stamp,
  ticket: Ticket,
  trophy: Trophy,
  star: Star,
  users: Users,
} as const;

export function PassportRewardsPanel({
  season,
  littleWheelEntries,
  bigWheelEntries,
  approvedStamps,
  className,
}: {
  season: SeasonSummary;
  littleWheelEntries: number;
  bigWheelEntries: number;
  approvedStamps: number;
  className?: string;
}) {
  const { isComplete } = season;

  return (
    <section className={cn(ssCard, ssCardPad, className)} aria-label="Rewards">
      <h2 className={cn(ssSectionTitle, "mb-2")}>Rewards</h2>

      <dl className="mb-2 grid grid-cols-3 gap-1.5">
        <div className={ssStatCell}>
          <dt className={ssLabel}>Quests</dt>
          <dd className="text-sm font-bold tabular-nums text-orange-950">{approvedStamps}</dd>
        </div>
        <div className={ssStatCell}>
          <dt className={ssLabel}>Little</dt>
          <dd className="text-sm font-bold tabular-nums text-teal-800">{littleWheelEntries}</dd>
        </div>
        <div className={ssStatCell}>
          <dt className={ssLabel}>Big</dt>
          <dd className="text-sm font-bold tabular-nums text-violet-800">{bigWheelEntries}</dd>
        </div>
      </dl>

      {isComplete ? (
        <p className="mb-2 rounded-lg border border-teal-200/60 bg-teal-50/50 px-2 py-1 text-[11px] font-semibold text-teal-900">
          Passport complete — Hall of Fame eligible
        </p>
      ) : null}

      <ul className="flex flex-wrap gap-1">
        {SEASON_REWARDS.map((reward) => {
          const Icon = REWARD_ICONS[reward.icon];
          const unlocked =
            reward.id === "passport"
              ? isComplete
              : reward.id === "little-wheel"
                ? littleWheelEntries > 0
                : reward.id === "big-wheel"
                  ? bigWheelEntries > 0
                  : false;

          return (
            <li
              key={reward.id}
              title={reward.description}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                unlocked
                  ? "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-orange-100 bg-white text-orange-700/70",
              )}
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden />
              {reward.title}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
