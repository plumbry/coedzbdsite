import { cn } from "@/lib/utils.ts";
import {
  CATEGORY_PAGES,
  buildCategorySlots,
  getQuestStatus,
  type QuestEntry,
} from "./passport-types.ts";
import { MOCK_QUEST_ENTRIES } from "./passport-mock-data.ts";

function slotDotClass(entry: QuestEntry | null) {
  if (!entry) return "border-dashed border-slate-300 bg-slate-50";
  const status = getQuestStatus(entry);
  if (status === "approved") return "border-emerald-500 bg-emerald-100";
  if (status === "pending_review") return "border-amber-400 bg-amber-50";
  if (status === "rejected" || status === "needs_more_evidence") return "border-red-400 bg-red-50";
  if (status === "in_progress") return "border-slate-400 bg-slate-100";
  return "border-dashed border-slate-300 bg-white";
}

/** Read-only mini passport for landing/marketing — uses mock data, no backend. */
export function PassportPreviewMini({ className }: { className?: string }) {
  const byCategory = new Map<string, QuestEntry[]>();
  for (const page of CATEGORY_PAGES) {
    byCategory.set(page.id, []);
  }
  for (const entry of MOCK_QUEST_ENTRIES) {
    byCategory.set(entry.quest.category, [...(byCategory.get(entry.quest.category) ?? []), entry]);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-300/60 bg-[#FAFAF8] shadow-[0_4px_24px_rgba(15,23,42,0.06)]",
        className,
      )}
      aria-hidden
    >
      <div className="border-b border-slate-200/80 bg-white/80 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
          Passport preview
        </p>
        <p className="mt-0.5 text-sm font-semibold text-slate-900">5 / 12 stamps collected</p>
      </div>
      <div className="space-y-2.5 p-3">
        {CATEGORY_PAGES.map((page) => {
          const entries = byCategory.get(page.id) ?? [];
          const slots = buildCategorySlots(entries);
          return (
            <div key={page.id} className="rounded-lg border border-slate-200/70 bg-white/70 p-2">
              <div className={cn("mb-2 flex items-center gap-1.5 rounded px-2 py-1", page.headerBg)}>
                <span className="text-sm">{page.emoji}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700">
                  {page.label}
                </span>
              </div>
              <div className="flex gap-1.5">
                {slots.map((entry, index) => (
                  <div
                    key={entry?.quest._id ?? `${page.id}-${index}`}
                    className={cn("h-8 min-w-0 flex-1 rounded-md border-2", slotDotClass(entry))}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
