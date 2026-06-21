import { cn } from "@/lib/utils.ts";
import type { SealBadgeStatus } from "./passport-seal.ts";

/** Shared visual tokens — warm summer passport, compact & scannable. */
export const ssPageBg =
  "bg-[#FFF9F2] bg-gradient-to-b from-[#FFF9F2] via-[#FFF5EB] to-[#F0FAFA]";
export const ssMutedSurface = "bg-orange-50/70";
export const ssCard =
  "rounded-xl border border-orange-200/50 bg-white/95 shadow-[0_1px_8px_rgba(249,115,22,0.05)]";
export const ssCardPad = "p-3 sm:p-4";
export const ssStack = "space-y-4";
export const ssGridGap = "gap-4";
/** Shared page chrome — landing, passport, demo, and loading states. */
export const ssPageContent = cn(ssStack, "pb-8 pt-1");
export const ssPageContainer = "mx-auto w-full max-w-6xl px-3 sm:px-4";
export const ssPassportHeroClass = "mb-4 w-full";
/** Two-column passport dashboard layout — shared by live, demo, and complete demo. */
export const ssPassportGrid =
  "flex flex-col gap-6 lg:grid lg:min-h-0 lg:items-stretch lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)] lg:gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]";
export const ssPassportMainColumn = "min-w-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col";
export const ssPassportSidebar = "flex min-w-0 flex-col gap-4 lg:h-full lg:min-h-0";
export const ssPassportStretchMain = "flex min-h-0 flex-col lg:h-full lg:flex-1";
export const ssPassportStretchCard = "min-h-0 lg:flex-1";
export const ssPassportStretchPanel = "flex min-h-0 flex-col lg:flex-1";
/** Align dashboard sections with the passport card and keep side breathing room. */
export const ssDashboardInset = "mx-auto w-full max-w-2xl px-3 sm:px-4";
export const ssCardHover =
  "transition-all duration-200 hover:shadow-[0_8px_20px_rgba(20,184,166,0.1)] hover:border-teal-300/50";
export const ssInteractiveCard =
  "cursor-pointer transition-[transform,box-shadow,border-color] duration-150 ease-out " +
  "hover:-translate-y-0.5 hover:border-teal-400/60 hover:shadow-[0_8px_20px_rgba(249,115,22,0.12)] " +
  "active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0";
/** Sora display face — reserved for hero, milestone & seasonal headline titles. */
export const ssDisplayTitle =
  "font-display font-semibold tracking-[0.02em] text-orange-950";
/** Outfit section heading — confident but compact, used for dashboard sections. */
export const ssSectionTitle =
  "text-lg font-semibold tracking-[0.01em] text-orange-950";
export const ssSectionDesc = "text-[13px] text-orange-900/55";
export const ssLabel = "text-[10px] font-medium uppercase tracking-[0.06em] text-teal-800/75";
export const ssSkeleton = "rounded-xl bg-orange-100/50";
export const ssStatCell =
  "rounded-lg border border-orange-200/60 bg-orange-50/40 px-2.5 py-1.5 min-w-0";

export function ssStatusChip(status: SealBadgeStatus, extra?: string) {
  return cn(
    "inline-flex items-center rounded-full px-2 py-px text-[9px] font-semibold uppercase tracking-[0.05em]",
    status === "earned" && "bg-teal-100 text-teal-800",
    status === "pending" && "bg-amber-100 text-amber-800",
    status === "needs_changes" && "bg-orange-100 text-orange-800",
    status === "in_progress" && "bg-sky-100 text-sky-800",
    status === "locked" && "bg-orange-50 text-orange-400/80",
    extra,
  );
}

export const ssAccentBarClass =
  "h-1 w-full bg-gradient-to-r from-orange-400 via-rose-400 to-teal-400";

export const ssPassportPage =
  "relative rounded-lg border border-orange-100/80 bg-gradient-to-br from-[#FFFCF8] to-[#F8FFFE] p-3";

export const ssPassportSpine =
  "absolute inset-y-2 left-1/2 hidden w-px -translate-x-1/2 border-l border-dashed border-orange-300/50 lg:block";

/** Stamp image display sizes (px) — keep in sync across passport views. */
export const ssStampSize = {
  challenge: 56,
  detail: 120,
  hero: 180,
  mini: 42,
  animation: 64,
  default: 120,
  journey: 136,
  journeyMobile: 96,
  category: 52,
} as const;
