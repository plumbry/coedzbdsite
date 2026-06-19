import { useMemo } from "react";
import { cn } from "@/lib/utils.ts";
import { DESTINATION_ORDER } from "./passport-destinations.ts";
import {
  ssAccentBarClass,
  ssCardPad,
  ssLabel,
} from "./passport-dashboard-theme.ts";
import { MOCK_CAMPAIGN, MOCK_PLAYER, MOCK_QUEST_ENTRIES } from "./passport-mock-data.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { buildSeals, summariseSeason } from "./passport-seal.ts";
import { CATEGORY_PAGES, type QuestEntry } from "./passport-types.ts";

/** Compact passport preview for landing — mock data only. */
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
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-orange-200/60 bg-white/95 shadow-sm",
        className,
      )}
      aria-hidden
    >
      <div className={ssAccentBarClass} />
      <div className={cn(ssCardPad, "border-b border-orange-100/80")}>
        <p className={ssLabel}>Preview</p>
        <p className="text-sm font-bold text-orange-950">{MOCK_PLAYER.discordUsername}</p>
        <p className="text-[11px] tabular-nums text-orange-800/55">
          {season.earnedSeals}/{season.totalSeals} seals · {season.percent}%
        </p>
      </div>

      <div className={ssCardPad}>
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-orange-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-teal-400"
            style={{ width: `${season.percent}%` }}
          />
        </div>
        <div className="grid grid-cols-5 gap-1">
          {seals.map((seal, index) => (
            <div key={seal.id} className="flex flex-col items-center gap-0.5">
              <PassportSealImage meta={seal.meta} state={seal.state} seal={seal} size={32} showBadge={false} />
              <span className="truncate text-[8px] font-semibold text-orange-800/60">
                {DESTINATION_ORDER[index]?.name.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
