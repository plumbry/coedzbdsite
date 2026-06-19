import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { PassportQuestEntry } from "./passport-quest-entry.tsx";
import { CategoryStampDots } from "./passport-category-progress.tsx";
import {
  CATEGORY_PAGES,
  countCategoryStats,
  type QuestCategory,
  type QuestEntry,
} from "./passport-types.ts";
import { categoryQuestsLabel } from "./passport-quest-meta.ts";

function CategoryQuestList({
  entries,
  onQuestClick,
}: {
  entries: QuestEntry[];
  onQuestClick: (entry: QuestEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-[#F7F8FA] p-6 text-center">
        <p className="font-medium text-slate-800">No quests in this category yet</p>
        <p className="mt-1 text-sm text-slate-500">New stamps may appear here during the season.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-3">
      {entries.map((entry) => (
        <PassportQuestEntry
          key={entry.quest._id}
          entry={entry}
          compact
          onOpen={() => onQuestClick(entry)}
          onSubmitEvidence={() => onQuestClick(entry)}
        />
      ))}
    </div>
  );
}

function CategoryHeaderSummary({
  page,
  stats,
  entries,
}: {
  page: (typeof CATEGORY_PAGES)[number];
  stats: ReturnType<typeof countCategoryStats>;
  entries: QuestEntry[];
}) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-xl">{page.emoji}</span>
        <div className="min-w-0 text-left">
          <h3 className="truncate text-base font-bold text-slate-900">
            {categoryQuestsLabel(page.label)}
          </h3>
          <CategoryStampDots entries={entries} className="mt-1.5" />
          <p className="mt-1 truncate text-xs tabular-nums text-slate-600">
            {stats.approved}/{stats.total} stamps
            {stats.pending > 0 ? ` · ${stats.pending} in review` : ""}
            {stats.needsAttention > 0 ? ` · ${stats.needsAttention} fix` : ""}
          </p>
        </div>
      </div>
      {stats.isComplete ? (
        <span className="shrink-0 rounded-full border border-emerald-300/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
          Complete
        </span>
      ) : stats.remaining > 0 ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {stats.remaining} left
        </span>
      ) : null}
    </>
  );
}

function MobileCategoriesAccordion({
  questsByCategory,
  onQuestClick,
}: {
  questsByCategory: Map<string, QuestEntry[]>;
  onQuestClick: (entry: QuestEntry) => void;
}) {
  const [expanded, setExpanded] = useState<QuestCategory | null>(null);

  return (
    <div className="space-y-2">
      {CATEGORY_PAGES.map((page) => {
        const entries = questsByCategory.get(page.id) ?? [];
        const stats = countCategoryStats(entries);
        const isOpen = expanded === page.id;

        return (
          <Collapsible
            key={page.id}
            open={isOpen}
            onOpenChange={(open) => setExpanded(open ? page.id : null)}
          >
            <article
              className={cn(
                "rounded-2xl border border-slate-200/80 bg-white shadow-sm",
                stats.isComplete && page.completeGlow,
              )}
            >
              <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 p-4 touch-manipulation">
                <CategoryHeaderSummary page={page} stats={stats} entries={entries} />
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-slate-400 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-slate-100 px-4 pb-4">
                  <CategoryQuestList entries={entries} onQuestClick={onQuestClick} />
                </div>
              </CollapsibleContent>
            </article>
          </Collapsible>
        );
      })}
    </div>
  );
}

function DesktopCategoriesSection({
  questsByCategory,
  onQuestClick,
}: {
  questsByCategory: Map<string, QuestEntry[]>;
  onQuestClick: (entry: QuestEntry) => void;
}) {
  return (
    <div className="space-y-4">
      {CATEGORY_PAGES.map((page) => {
        const entries = questsByCategory.get(page.id) ?? [];
        const stats = countCategoryStats(entries);

        return (
          <article
            key={page.id}
            className={cn(
              "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm",
              stats.isComplete && page.completeGlow,
            )}
          >
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <CategoryHeaderSummary page={page} stats={stats} entries={entries} />
            </header>
            <CategoryQuestList entries={entries} onQuestClick={onQuestClick} />
          </article>
        );
      })}
    </div>
  );
}

export function PassportCategoriesSection({
  questsByCategory,
  onQuestClick,
}: {
  questsByCategory: Map<string, QuestEntry[]>;
  onQuestClick: (entry: QuestEntry) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Quest categories">
      <div>
        <h2 className="text-lg font-bold text-slate-900">All quests</h2>
        <p className="text-sm text-slate-600">Tap a category to browse. Type badges show if evidence is needed.</p>
      </div>

      <div className="md:hidden">
        <MobileCategoriesAccordion
          questsByCategory={questsByCategory}
          onQuestClick={onQuestClick}
        />
      </div>

      <div className="hidden md:block">
        <DesktopCategoriesSection
          questsByCategory={questsByCategory}
          onQuestClick={onQuestClick}
        />
      </div>
    </section>
  );
}

export type { QuestCategory };
