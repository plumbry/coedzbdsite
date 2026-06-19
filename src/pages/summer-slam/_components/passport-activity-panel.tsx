import { useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const PLACEHOLDER_ITEMS = [
  { title: "Evidence submitted", detail: "Quest review pending" },
  { title: "Stamp approved", detail: "Staff verified your submission" },
  { title: "Quest updated", detail: "Progress tracked automatically" },
  { title: "New quest available", detail: "Check your passport" },
  { title: "Category milestone", detail: "Almost complete" },
];

const COLLAPSED_COUNT = 3;

export function PassportActivityPanel({ embedded = false }: { embedded?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded
    ? PLACEHOLDER_ITEMS.slice(0, 5)
    : PLACEHOLDER_ITEMS.slice(0, COLLAPSED_COUNT);

  return (
    <section
      className={cn(
        embedded ? "pt-1" : "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm",
      )}
      aria-label="Recent activity"
    >
      {!embedded ? (
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-bold text-slate-900">Your Activity</h2>
        </div>
      ) : null}

      <p className="mb-3 text-xs text-slate-500">
        Live activity feed coming soon — preview layout below.
      </p>

      <ul className="space-y-2">
        {visibleItems.map((item) => (
          <li
            key={item.title}
            className="flex min-h-11 items-start gap-3 rounded-lg border border-slate-100 bg-[#F7F8FA] px-3 py-2.5"
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">{item.title}</p>
              <p className="text-xs text-slate-400">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        className="mt-2 min-h-11 w-full touch-manipulation text-slate-600"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <>
            Show less
            <ChevronUp className="ml-1 h-4 w-4" />
          </>
        ) : (
          <>
            Show more
            <ChevronDown className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </section>
  );
}
