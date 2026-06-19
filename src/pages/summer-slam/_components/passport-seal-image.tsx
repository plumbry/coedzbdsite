import { Check, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { sealStateLabel, type SealMeta, type SealState } from "./passport-seal.ts";

/**
 * Renders an official Summer Slam seal medallion (transparent PNG) with the
 * correct visual treatment for its state. The artwork is always the focus —
 * locked seals are desaturated, active seals keep full colour.
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
      {earned ? (
        <span
          aria-hidden
          className={cn("absolute inset-1 rounded-full blur-xl", meta.glow)}
          style={{ backgroundColor: meta.accent, opacity: 0.18 }}
        />
      ) : null}

      <img
        src={meta.image}
        alt={`${meta.title} — ${sealStateLabel(state)}`}
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className={cn(
          "relative h-full w-full select-none object-contain transition-all duration-500",
          locked && "opacity-45 grayscale",
          submitted && "opacity-95",
          earned && animateEarned && "motion-safe:animate-[sealPop_0.6s_ease-out]",
        )}
      />

      {showBadge && locked ? (
        <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-sm">
          <Lock className="h-3.5 w-3.5" />
        </span>
      ) : null}

      {showBadge && earned ? (
        <span
          className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white shadow-md"
          aria-hidden
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      ) : null}

      {showBadge && submitted ? (
        <span
          className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-amber-400 text-amber-950 shadow-md"
          aria-hidden
        >
          <Clock className="h-4 w-4" strokeWidth={2.5} />
        </span>
      ) : null}
    </div>
  );
}
