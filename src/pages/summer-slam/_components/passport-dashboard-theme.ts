import { cn } from "@/lib/utils.ts";
import type { SealState } from "./passport-seal.ts";

/** Shared visual tokens for the premium Summer Slam passport dashboard. */
export const ssPageBg = "bg-[#FAF8F5]";
export const ssMutedSurface = "bg-stone-50/90";
export const ssCard =
  "rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_3px_rgba(28,25,23,0.06)]";
export const ssCardHover =
  "transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(28,25,23,0.08)]";
export const ssSectionTitle = "text-base font-semibold tracking-tight text-stone-900";
export const ssSectionDesc = "mt-1 text-sm text-stone-500";
export const ssLabel = "text-[11px] font-medium uppercase tracking-wider text-stone-500";
export const ssSkeleton = "rounded-2xl bg-stone-200/50";

export function ssStatusChip(state: SealState, extra?: string) {
  return cn(
    "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
    state === "earned" && "bg-teal-50 text-teal-800",
    state === "submitted" && "bg-amber-50 text-amber-800",
    state === "in_progress" && "bg-orange-50 text-orange-800",
    state === "locked" && "bg-stone-100 text-stone-500",
    extra,
  );
}

export const ssAccentBarClass =
  "h-1 w-full rounded-t-2xl bg-gradient-to-r from-orange-400 via-orange-300 to-teal-400";
