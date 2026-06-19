import { cn } from "@/lib/utils.ts";
import {
  CATEGORY_PAGES,
  buildCategorySlots,
  countCategoryStats,
  getCategoryPage,
  type QuestCategory,
  type QuestEntry,
} from "./passport-types.ts";
import { CategoryStampDots } from "./passport-category-progress.tsx";
import { PassportPrizeTicket } from "./passport-prize-ticket.tsx";
import { PassportStampSlot } from "./passport-stamp-slot.tsx";

export { useStampDropAnimation } from "./passport-stamp-animation-hook.ts";

export function PassportCard({
  questsByCategory,
  approvedStamps,
  totalStamps,
  littleWheelEntries,
  bigWheelEntries,
  bigWheelEveryStamps,
  onSlotClick,
  animatingQuestIds,
  onAnimationComplete,
  reduceMotion,
}: {
  questsByCategory: Map<string, QuestEntry[]>;
  approvedStamps: number;
  totalStamps: number;
  littleWheelEntries: number;
  bigWheelEntries: number;
  bigWheelEveryStamps: number;
  onSlotClick: (entry: QuestEntry | null, category: QuestCategory) => void;
  animatingQuestIds: Set<string>;
  onAnimationComplete: (questId: string) => void;
  reduceMotion: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border-2 border-slate-400/30 bg-[#FDFBF7] shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
      aria-label="Summer Slam Passport"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(120,100,80,0.07) 24px)",
        }}
      />
      <div className="absolute inset-y-0 left-0 hidden w-2 border-r-2 border-double border-slate-400/30 bg-slate-100/40 sm:block" />

      <div className="relative px-3 py-3 sm:pl-5 md:px-5 md:pl-7">
        <div className="mb-3 border-b border-slate-400/20 pb-2">
          <p className="text-[9px] font-black uppercase tracking-[0.32em] text-slate-600">
            Summer Slam Passport
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            {approvedStamps} of {totalStamps} seals collected · tap a seal for quest details
          </p>
        </div>

        <div className="space-y-3">
          {CATEGORY_PAGES.map((page) => {
            const entries = questsByCategory.get(page.id) ?? [];
            const stats = countCategoryStats(entries);
            const slots = buildCategorySlots(entries);

            return (
              <div
                key={page.id}
                className={cn(
                  "border-b border-slate-400/15 pb-3 last:border-b-0 last:pb-0",
                  stats.isComplete && page.completeGlow,
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-base leading-none" aria-hidden>
                      {page.emoji}
                    </span>
                    <span className="truncate text-[10px] font-black uppercase tracking-wide text-slate-800">
                      {page.label}
                    </span>
                  </div>
                  <CategoryStampDots entries={entries} />
                </div>

                <div className="flex gap-1 sm:gap-1.5">
                  {slots.map((entry, index) => {
                    const questId = entry?.quest._id;
                    const isAnimating = questId ? animatingQuestIds.has(questId) : false;
                    const categoryPage = getCategoryPage(page.id);

                    return (
                      <PassportStampSlot
                        key={entry?.quest._id ?? `${page.id}-empty-${index}`}
                        entry={entry}
                        category={{ ...categoryPage, id: page.id }}
                        slotIndex={index}
                        isAnimating={isAnimating}
                        reduceMotion={reduceMotion}
                        onClick={() => onSlotClick(entry, page.id)}
                        onAnimationComplete={() => {
                          if (questId) onAnimationComplete(questId);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PassportPrizeTicket
        approvedStamps={approvedStamps}
        totalStamps={totalStamps}
        littleWheelEntries={littleWheelEntries}
        bigWheelEntries={bigWheelEntries}
        bigWheelEveryStamps={bigWheelEveryStamps}
      />
    </section>
  );
}
