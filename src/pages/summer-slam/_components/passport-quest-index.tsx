import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { indexStatusLabel } from "./passport-category-seals.tsx";
import {
  CATEGORY_PAGES,
  getCategoryPage,
  getQuestStatus,
  type QuestEntry,
} from "./passport-types.ts";

export function PassportQuestIndex({
  quests,
  onQuestClick,
}: {
  quests: QuestEntry[];
  onQuestClick: (entry: QuestEntry) => void;
}) {
  if (quests.length === 0) return null;

  const sorted = [...quests].sort((a, b) => {
    const catA = CATEGORY_PAGES.findIndex((page) => page.id === a.quest.category);
    const catB = CATEGORY_PAGES.findIndex((page) => page.id === b.quest.category);
    if (catA !== catB) return catA - catB;
    return a.quest.title.localeCompare(b.quest.title);
  });

  return (
    <Collapsible defaultOpen={false}>
      <section aria-label="Quest index" className="rounded-xl border border-slate-200/70 bg-white/80">
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 touch-manipulation">
          <div className="text-left">
            <h2 className="text-sm font-bold text-slate-900">Quest index</h2>
            <p className="text-xs text-slate-500">
              {quests.length} quest{quests.length === 1 ? "" : "s"} — tap passport stamps for details
            </p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="border-t border-slate-100 px-2 py-1">
            {sorted.map((entry) => {
              const category = getCategoryPage(entry.quest.category);
              const status = getQuestStatus(entry);
              const statusText = indexStatusLabel(status);

              return (
                <li key={entry.quest._id}>
                  <button
                    type="button"
                    onClick={() => onQuestClick(entry)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm touch-manipulation hover:bg-slate-50"
                  >
                    <span className="shrink-0 text-base leading-none" aria-hidden>
                      {category.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {entry.quest.title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        status === "approved" && "text-emerald-700",
                        status === "pending_review" && "text-amber-700",
                        (status === "rejected" || status === "needs_more_evidence") && "text-red-700",
                        status === "in_progress" && "text-slate-600",
                        status === "not_started" && "text-slate-500",
                      )}
                    >
                      {statusText}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
