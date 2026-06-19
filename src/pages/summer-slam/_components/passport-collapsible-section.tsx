import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { cn } from "@/lib/utils.ts";

export function PassportCollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
  contentClassName,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={className}>
      <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-3 p-4 touch-manipulation">
          <div className="min-w-0 text-left">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {summary ? <p className="truncate text-sm text-slate-600">{summary}</p> : null}
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn("border-t border-slate-100 px-4 pb-4 pt-2", contentClassName)}>
            {children}
          </div>
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}
