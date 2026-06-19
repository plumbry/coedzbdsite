import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils.ts";
import { getDestination } from "./passport-destinations.ts";
import { PassportSectionHeader } from "./passport-section-header.tsx";
import {
  ssCard,
  ssCardPad,
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
}: {
  seal: SealProgress;
  isNext: boolean;
  isCelebrating: boolean;
  onSelect: (seal: SealProgress) => void;
}) {
  const dest = getDestination(seal.id);
  const status = sealBadgeStatus(seal);
  const earned = seal.state === "earned";
  const earnedDate = formatSealDate(seal.earnedAt);

  return (
    <button
      type="button"
      onClick={() => onSelect(seal)}
      className={cn(
        ssInteractiveCard,
        "relative flex min-w-0 flex-col items-center rounded-lg border p-2 text-center touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50",
        earned
          ? "border-teal-300/60 bg-teal-50/30"
          : isNext
            ? "border-orange-400/50 bg-orange-50/50 ring-1 ring-orange-300/30"
            : "border-orange-100/80 bg-white/80",
        isCelebrating && "motion-safe:animate-[stampImpact_0.7s_ease-out]",
      )}
      aria-label={`${dest.name} — ${sealStateLabel(seal.state)}`}
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
        size={56}
        showBadge
        animateEarned={isCelebrating}
        showProgressRing
      />

      <p className="mt-1 w-full truncate text-[10px] font-bold text-orange-950">{dest.name}</p>
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
        <span className="mt-0.5 text-[9px] text-teal-700/70">{earnedDate}</span>
      ) : null}
    </button>
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
    <section className={cn(className)} aria-label="Seal collection">
      <PassportSectionHeader title="Seal collection" description="Tap for tasks & details" />

      <div className={cn(ssCard, ssCardPad)}>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {seals.map((seal) => (
            <SealSlot
              key={seal.id}
              seal={seal}
              isNext={seal.id === nextSealId}
              isCelebrating={!reduceMotion && celebrating.includes(seal.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
