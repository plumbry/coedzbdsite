import { cn } from "@/lib/utils.ts";

/** Compact mobile button sizing — applied via Button when compact mobile is enabled. */
export const mobileCompactButtonClass =
  "max-sm:h-7 max-sm:min-h-7 max-sm:px-1 max-sm:py-0 max-sm:text-[10px] max-sm:leading-none max-sm:gap-0.5 max-sm:has-[>svg]:px-1 max-sm:[&_svg:not([class*='size-'])]:size-3 touch-manipulation";

export const mobileCompactIconButtonClass = "max-sm:!size-7 max-sm:min-h-7 max-sm:min-w-7";

/** Shared single-row mobile layout for button groups without mobile scrollbars. */
export const mobileButtonRowClass =
  "max-sm:min-w-0 max-sm:flex-nowrap max-sm:justify-center max-sm:gap-0.5 max-sm:overflow-x-hidden max-sm:[&_[data-slot=button]]:min-w-0 max-sm:[&_[data-slot=button]]:w-auto max-sm:[&_[data-slot=button]]:shrink";

/** Page header action rows — children with `contents` participate in this row on mobile. */
export const mobilePageHeaderActionsClass = cn(
  "flex w-full flex-wrap items-center gap-2",
  mobileButtonRowClass,
);

/** Inline action buttons (e.g. Edit / Accept / Reject / Delete). */
export const mobileActionRowClass = cn(
  "mobile-button-group flex flex-wrap gap-1",
  mobileButtonRowClass,
);

/** Discord sync compact wrapper — inline in parent row on mobile. */
export const mobileActionGroupContentsClass = "contents sm:flex sm:w-auto sm:flex-wrap sm:gap-2";

export function mobileButtonOnlyGroupClass(className?: string) {
  return cn("flex flex-wrap gap-2", mobileButtonRowClass, className);
}
