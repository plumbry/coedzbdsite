import { Check, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { sealStateLabel, type SealMeta, type SealState } from "./passport-seal.ts";

/**
 * Official Summer Slam seal artwork with premium, consistent state treatment.
 */
export function PassportSealImage({
  meta,
  state,
  size = 96,
  className,
  showBadge = true,
  animateEarned = false,
}: {
  meta: SealMeta;
  state: SealState;
  size?: number;
  className?: string;
  showBadge?: boolean;
  animateEarned?: boolean;
}) {
  const locked = state === "locked";
  const earned = state === "earned";
  const submitted = state === "submitted";

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={meta.image}
        alt={`${meta.title} — ${sealStateLabel(state)}`}
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className={cn(
          "relative h-full w-full select-none object-contain transition-all duration-300",
          locked && "opacity-40 saturate-[0.15]",
          submitted && "opacity-90",
          earned && "drop-shadow-[0_6px_16px_rgba(0,0,0,0.12)]",
          earned && animateEarned && "motion-safe:animate-[sealPop_0.6s_ease-out]",
        )}
      />

      {showBadge && locked ? (
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm">
          <Lock className="h-3 w-3" aria-hidden />
        </span>
      ) : null}

      {showBadge && earned ? (
        <span
          className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm"
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : null}

      {showBadge && submitted ? (
        <span
          className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
          aria-hidden
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </div>
  );
}
