import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";

/**
 * Info affordance that works on hover (desktop) and tap (mobile).
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
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 touch-manipulation",
        className,
      )}
    >
      <Info className="h-4 w-4" aria-hidden />
    </button>
  );

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="max-w-[16rem] text-sm" side="top" align="center">
          {text}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">{text}</TooltipContent>
    </Tooltip>
  );
}
