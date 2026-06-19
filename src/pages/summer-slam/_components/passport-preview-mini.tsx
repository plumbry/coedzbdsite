import { useMemo } from "react";
import { cn } from "@/lib/utils.ts";
import {
  ssAccentBarClass,
  ssCard,
  ssLabel,
  ssMutedSurface,
} from "./passport-dashboard-theme.ts";
import { MOCK_CAMPAIGN, MOCK_QUEST_ENTRIES } from "./passport-mock-data.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { buildSeals, summariseSeason } from "./passport-seal.ts";
import { CATEGORY_PAGES, type QuestEntry } from "./passport-types.ts";

/** Read-only mini passport for landing/marketing — uses mock data, no backend. */
export function PassportPreviewMini({ className }: { className?: string }) {
  const { seals, season } = useMemo(() => {
    const byCategory = new Map<string, QuestEntry[]>();
    for (const page of CATEGORY_PAGES) byCategory.set(page.id, []);
    for (const entry of MOCK_QUEST_ENTRIES) {
      byCategory.set(entry.quest.category, [...(byCategory.get(entry.quest.category) ?? []), entry]);
    }
    const built = buildSeals(byCategory);
    return { seals: built, season: summariseSeason(built, MOCK_CAMPAIGN) };
  }, []);

  return (
    <div className={cn("relative overflow-hidden", ssCard, className)} aria-hidden>
      <div className={ssAccentBarClass} />
      <div className="border-b border-stone-100 px-4 py-3 sm:px-5">
        <p className={ssLabel}>Passport preview</p>
        <p className="mt-1 text-sm font-semibold text-stone-900">
          {season.earnedSeals} / {season.totalSeals} seals collected
        </p>
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-teal-500"
            style={{ width: `${season.percent}%` }}
          />
        </div>

        <div className="grid grid-cols-5 gap-2">
          {seals.map((seal) => (
            <div key={seal.id} className="flex flex-col items-center gap-1.5">
              <PassportSealImage meta={seal.meta} state={seal.state} size={44} showBadge={false} />
              <span className="truncate text-[9px] font-medium text-stone-600">{seal.meta.label}</span>
            </div>
          ))}
        </div>

        <div className={cn("mt-4 rounded-xl px-3 py-2.5 text-center", ssMutedSurface)}>
          <p className="text-[11px] text-stone-600">
            Your live passport tracks real quest progress and staff review status.
          </p>
        </div>
      </div>
    </div>
  );
}
