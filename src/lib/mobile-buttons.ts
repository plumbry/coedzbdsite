import { cn } from "@/lib/utils.ts";

/** Compact touch-friendly button sizing — applied via Button when compact mobile is enabled. */
export const mobileCompactButtonClass =
  "max-sm:h-8 max-sm:min-h-8 max-sm:px-1.5 max-sm:text-[11px] max-sm:leading-tight max-sm:gap-1 touch-manipulation";

export const mobileCompactIconButtonClass = "max-sm:!size-8 max-sm:min-h-8 max-sm:min-w-8";

/** Page header / toolbar action rows with multiple buttons. */
export const mobilePageHeaderActionsClass =
  "flex w-full flex-wrap gap-2 max-sm:grid max-sm:grid-cols-2 max-sm:gap-1.5 max-sm:[&_[data-slot=button]]:w-full max-sm:[&_[data-slot=button]]:justify-center sm:items-center";

/** Inline row of 3–4 equal action buttons (e.g. Edit / Accept / Reject / Delete). */
export const mobileActionRowClass =
  "mobile-button-group flex flex-wrap gap-1 max-sm:grid max-sm:w-full max-sm:grid-cols-4 max-sm:gap-1 max-sm:[&_[data-slot=button]]:w-full max-sm:[&_[data-slot=button]]:justify-center";

/** Discord sync compact wrapper — children participate in parent action grid on mobile. */
export const mobileActionGroupContentsClass = "contents sm:flex sm:w-auto sm:flex-wrap sm:gap-2";

export function mobileButtonOnlyGroupClass(className?: string) {
  return cn(
    "flex flex-wrap gap-2",
    "max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:gap-1.5",
    "max-sm:[&>[data-slot=button]]:w-full max-sm:[&>[data-slot=button]]:justify-center",
    "max-sm:[&>[data-slot=button]:nth-child(3):last-child]:col-span-2",
    "max-sm:has-[>[data-slot=button]:nth-child(4):last-child]:grid-cols-4",
    className,
  );
}
