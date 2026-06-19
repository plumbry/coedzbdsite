import { Info } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";

/**
 * A small, focusable info affordance that explains a section of the passport.
 * Built on Radix Tooltip so it opens on hover, keyboard focus, and touch focus.
 */
export function InfoTooltip({
  label,
  text,
  className,
}: {
  /** Accessible name, e.g. "About passport progress". */
  label: string;
  text: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">{text}</TooltipContent>
    </Tooltip>
  );
}
