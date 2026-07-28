import { AlertTriangle, Check, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  sealBadgeStatus,
  sealStateLabel,
  type SealMeta,
  type SealProgress,
  type SealState,
} from "./passport-seal.ts";
import { resolveSealArtwork } from "./passport-assets.ts";

/**
 * Official Summer Slam seal artwork — collectible stamp treatment with state styling.
 */
export function PassportSealImage({
  meta,
  state,
  seal,
  size = 120,
  fill = false,
  className,
  showBadge = true,
  animateEarned = false,
}: {
  meta: SealMeta;
  state: SealState;
  seal?: SealProgress;
  size?: number;
  /** When true, stamp fills the parent width (square aspect). */
  fill?: boolean;
  className?: string;
  showBadge?: boolean;
  animateEarned?: boolean;
}) {
  const badgeStatus = seal ? sealBadgeStatus(seal) : null;
  const locked = state === "locked";
  const earned = state === "earned";
  const submitted = state === "submitted";
  const needsChanges = badgeStatus === "needs_changes";
  const inProgress = state === "in_progress" && !needsChanges;
  const hasArtwork = Boolean(meta.image);
  const artwork = hasArtwork ? resolveSealArtwork(meta) : null;
  const src = artwork?.src ?? "";
  const srcSet = artwork?.srcSet ?? "";
  const intrinsic = fill ? 256 : size <= 96 ? 160 : size <= 180 ? 256 : 320;

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        fill && "aspect-square w-full",
        className,
      )}
      style={fill ? undefined : { width: size, height: size }}
    >
      {hasArtwork ? (
        <img
          src={src}
          srcSet={srcSet}
          alt={`${meta.title} — ${sealStateLabel(state)}`}
          width={intrinsic}
          height={intrinsic}
          sizes={fill ? "(min-width: 1024px) 140px, (min-width: 640px) 100px, 72px" : `${size}px`}
          loading="lazy"
          draggable={false}
          className={cn(
            "relative h-full w-full select-none object-contain transition-all duration-300",
            locked && "opacity-50 saturate-[0.35] brightness-105",
            submitted && "opacity-95",
            inProgress && "drop-shadow-[0_4px_12px_rgba(249,115,22,0.15)]",
            earned && "drop-shadow-[0_8px_20px_rgba(20,184,166,0.25)]",
            earned && animateEarned && "motion-safe:animate-[sealPop_0.6s_ease-out]",
          )}
        />
      ) : (
        <div
          className={cn(
            "relative flex h-full w-full items-center justify-center rounded-full border-2 border-dashed",
            earned
              ? "border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700"
              : "border-orange-300 bg-white text-orange-400",
            earned && animateEarned && "motion-safe:animate-[sealPop_0.6s_ease-out]",
          )}
          aria-hidden
        >
          <span className="font-display text-lg font-bold">{earned ? "★" : "?"}</span>
        </div>
      )}

      {showBadge && locked ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-300 shadow-sm">
          <Lock className="h-2.5 w-2.5" aria-hidden />
        </span>
      ) : null}

      {showBadge && earned ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white shadow-[0_2px_8px_rgba(20,184,166,0.4)]"
          aria-hidden
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : null}

      {showBadge && submitted ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
          aria-hidden
        >
          <Clock className="h-3 w-3" strokeWidth={2.5} />
        </span>
      ) : null}

      {showBadge && needsChanges ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-400 text-white shadow-sm"
          aria-hidden
        >
          <AlertTriangle className="h-2.5 w-2.5" />
        </span>
      ) : null}
    </div>
  );
}
