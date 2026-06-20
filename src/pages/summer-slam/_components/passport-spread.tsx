import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { getDestination } from "./passport-destinations.ts";
import { PassportSectionHeader } from "./passport-section-header.tsx";
import { SEAL_BADGE_CONFIG } from "./passport-status-badge.tsx";
import {
  ssCard,
  ssInteractiveCard,
  ssStatusChip,
} from "./passport-dashboard-theme.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import {
  formatSealDate,
  sealBadgeStatus,
  sealStateLabel,
  type SealProgress,
} from "./passport-seal.ts";
import type { QuestCategory } from "./passport-types.ts";

const STORAGE_KEY = "summer-slam-earned-seals";

function SealSlot({
  seal,
  isNext,
  isCelebrating,
  onSelect,
  className,
}: {
  seal: SealProgress;
  isNext: boolean;
  isCelebrating: boolean;
  onSelect: (seal: SealProgress) => void;
  className?: string;
}) {
  const dest = getDestination(seal.id);
  const status = sealBadgeStatus(seal);
  const earned = seal.state === "earned";
  const earnedDate = formatSealDate(seal.earnedAt);
  const statusTooltip = SEAL_BADGE_CONFIG[status].tooltip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(seal)}
          className={cn(
            ssInteractiveCard,
            "relative flex w-full min-w-0 flex-col items-center rounded-lg border px-1 py-1.5 text-center touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50",
            earned
              ? "border-teal-300/60 bg-teal-50/30"
              : isNext
                ? "border-orange-400/50 bg-orange-50/50 ring-1 ring-orange-300/30"
                : "border-orange-100/80 bg-white/80",
            isCelebrating && "motion-safe:animate-[stampImpact_0.7s_ease-out]",
            className,
          )}
          aria-label={`${dest.name} — ${SEAL_BADGE_CONFIG[status].label}. ${statusTooltip} Tap to view requirements and progress.`}
        >
          {isNext && !earned ? (
            <span className="absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange-500 px-1.5 py-px text-[8px] font-bold uppercase text-white">
              Next
            </span>
          ) : null}

          <PassportSealImage
            meta={seal.meta}
            state={seal.state}
            seal={seal}
            fill
            showBadge
            animateEarned={isCelebrating}
            showProgressRing
            className="w-full"
          />

          <p className="mt-0.5 w-full truncate text-[9px] font-bold text-orange-950 sm:text-[10px]">{dest.name}</p>
          <span className={ssStatusChip(status, "mt-0.5")}>
            {status === "needs_changes"
              ? "Fix"
              : status === "pending"
                ? "Review"
                : earned
                  ? "Earned"
                  : seal.total > 0
                    ? `${seal.approved}/${seal.total}`
                    : "Locked"}
          </span>
          {earnedDate ? (
            <span className="mt-0.5 hidden text-[9px] text-teal-700/70 sm:inline">{earnedDate}</span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[13rem] text-center">
        <span className="font-semibold">{SEAL_BADGE_CONFIG[status].label}</span> — {statusTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function PassportSpread({
  seals,
  nextSealId,
  onSelect,
  className,
}: {
  seals: SealProgress[];
  nextSealId: QuestCategory | null;
  onSelect: (seal: SealProgress) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [celebrating, setCelebrating] = useState<string[]>([]);

  useEffect(() => {
    const earnedIds = seals.filter((s) => s.state === "earned").map((s) => s.id);
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
    const newlyEarned = earnedIds.filter((id) => !prev.includes(id));
    if (newlyEarned.length > 0) {
      setCelebrating(newlyEarned);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(earnedIds));
      const timer = window.setTimeout(() => setCelebrating([]), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [seals]);

  return (
    <section className={cn(className)} aria-label="Stamp collection">
      <PassportSectionHeader
        title="Stamp Collection"
        description="Tap any stamp for requirements & progress"
        info="Collect stamps by completing Summer Slam challenges. Click any stamp to view requirements and progress."
        className="px-1 sm:px-2"
      />

      <div className={cn(ssCard, "p-2 sm:p-4")}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-2.5">
          {seals.map((seal, index) => (
            <SealSlot
              key={seal.id}
              seal={seal}
              isNext={seal.id === nextSealId}
              isCelebrating={!reduceMotion && celebrating.includes(seal.id)}
              onSelect={onSelect}
              className={cn(
                index === 3 && "col-start-1 sm:col-start-auto",
                index === 4 && "col-start-3 sm:col-start-auto",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
