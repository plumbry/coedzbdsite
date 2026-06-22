import type { ReactNode } from "react";
import { HelpCircle, Stamp } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { SEASON_REWARDS } from "./passport-destinations.ts";
import { PassportCertificateDownloadButton } from "./passport-certificate-download-button.tsx";
import { ssCard, ssCardPad, ssLabel, ssSectionTitle, ssStatCell } from "./passport-dashboard-theme.ts";
import type { SealProgress, SeasonSummary } from "./passport-seal.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";

const REWARD_ICONS = {
  passport: Stamp,
} as const;

export function PassportRewardsPanel({
  season,
  littleWheelEntries,
  bigWheelEntries,
  approvedStamps,
  playerName,
  avatarId,
  birthplaceId,
  seals,
  seasonStartsAt,
  seasonEndsAt,
  certificateDownload,
  className,
}: {
  season: SeasonSummary;
  littleWheelEntries: number;
  bigWheelEntries: number;
  approvedStamps: number;
  playerName?: string;
  avatarId?: PassportAvatarId | null;
  birthplaceId?: PassportBirthplaceId | null;
  seals?: SealProgress[];
  seasonStartsAt?: number;
  seasonEndsAt?: number;
  certificateDownload?: ReactNode;
  className?: string;
}) {
  const { isComplete } = season;

  return (
    <section className={cn(ssCard, ssCardPad, className)} aria-label="Rewards">
      <h2 className={cn(ssSectionTitle, "mb-2")}>Rewards</h2>

      <dl className="mb-2 grid grid-cols-3 gap-1.5 sm:gap-2">
        <div className={ssStatCell}>
          <dt className={ssLabel}>Quests</dt>
          <dd className="text-base font-bold tabular-nums text-orange-950 sm:text-sm">{approvedStamps}</dd>
        </div>
        <div className={ssStatCell}>
          <dt className={ssLabel}>Little</dt>
          <dd className="text-base font-bold tabular-nums text-teal-800 sm:text-sm">{littleWheelEntries}</dd>
        </div>
        <div className={ssStatCell}>
          <dt className={ssLabel}>Big</dt>
          <dd className="text-base font-bold tabular-nums text-violet-800 sm:text-sm">{bigWheelEntries}</dd>
        </div>
      </dl>

      {isComplete ? (
        <div className="mb-2 space-y-2">
          <p className="rounded-lg border border-teal-200/60 bg-teal-50/50 px-2.5 py-2 text-xs font-semibold text-teal-900 sm:px-2 sm:py-1 sm:text-[11px]">
            Passport complete — certificate &amp; Discord role unlocked
          </p>
          {certificateDownload ??
            (playerName && seals ? (
              <PassportCertificateDownloadButton
                playerName={playerName}
                avatarId={avatarId}
                birthplaceId={birthplaceId}
                seals={seals}
                seasonStartsAt={seasonStartsAt}
                seasonEndsAt={seasonEndsAt}
                className="w-full"
                variant="outline"
              />
            ) : null)}
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-1">
        {SEASON_REWARDS.map((reward) => {
          const Icon = REWARD_ICONS[reward.icon];
          const unlocked = reward.id === "passport" ? isComplete : false;

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
              <HelpCircle className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
