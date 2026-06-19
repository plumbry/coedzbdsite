import { Info } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

export function PassportAdminHint({
  hint,
  className,
}: {
  hint?: string;
  className?: string;
}) {
  const trimmed = hint?.trim();
  if (!trimmed) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 shrink-0 text-slate-500 hover:text-slate-800", className)}
          aria-label="Helpful tip"
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs text-sm leading-relaxed" align="start">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Helpful tip</p>
        <p className="whitespace-pre-wrap text-slate-800">{trimmed}</p>
      </PopoverContent>
    </Popover>
  );
}

export function PassportAdminHintSection({ hint }: { hint?: string }) {
  const trimmed = hint?.trim();
  if (!trimmed) return null;

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-950">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-800">
        <Info className="h-3.5 w-3.5" aria-hidden />
        Helpful tip
      </p>
      <p className="whitespace-pre-wrap leading-relaxed">{trimmed}</p>
    </section>
  );
}
