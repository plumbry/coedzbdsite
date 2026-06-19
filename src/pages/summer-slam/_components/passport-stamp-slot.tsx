import { cn } from "@/lib/utils.ts";
import { getQuestStatus, type QuestEntry } from "./passport-types.ts";
import { PassportStampMark } from "./passport-stamp-mark.tsx";
import { StampDropOverlay } from "./passport-stamp-animation.tsx";

type CategoryStyle = {
  id?: string;
  stampBorder: string;
  stampBg: string;
  stampText: string;
};

function SlotContent({
  entry,
  category,
  slotIndex,
}: {
  entry: QuestEntry | null;
  category: CategoryStyle;
  slotIndex: number;
}) {
  const title = entry?.quest.title;
  const shortTitle = title ? (title.length > 14 ? `${title.slice(0, 12)}…` : title) : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-0.5 px-0.5">
      <PassportStampMark entry={entry} category={category} slotIndex={slotIndex} size="sm" />
      {shortTitle ? (
        <span className="line-clamp-1 w-full text-center text-[9px] font-medium leading-tight text-slate-700">
          {shortTitle}
        </span>
      ) : null}
    </div>
  );
}

export function PassportStampSlot({
  entry,
  category,
  slotIndex,
  isAnimating,
  reduceMotion,
  onClick,
  onAnimationComplete,
}: {
  entry: QuestEntry | null;
  category: CategoryStyle;
  slotIndex: number;
  isAnimating: boolean;
  reduceMotion: boolean;
  onClick: () => void;
  onAnimationComplete: () => void;
}) {
  const status = entry ? getQuestStatus(entry) : "not_started";
  const isInteractive = !!entry;

  return (
    <button
      type="button"
      disabled={!isInteractive}
      onClick={onClick}
      className={cn(
        "relative flex min-h-[72px] min-w-[36px] flex-1 flex-col rounded-md transition-all touch-manipulation active:scale-[0.97]",
        isInteractive
          ? "cursor-pointer hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
          : "cursor-default opacity-50",
      )}
      aria-label={
        entry
          ? `${entry.quest.title}, ${status.replace(/_/g, " ")}`
          : `Empty passport slot ${slotIndex + 1}`
      }
    >
      <SlotContent entry={entry} category={category} slotIndex={slotIndex} />

      {isAnimating && status === "approved" && entry ? (
        <StampDropOverlay
          show
          categoryId={entry.quest.category}
          reduceMotion={reduceMotion}
          onComplete={onAnimationComplete}
        />
      ) : null}
    </button>
  );
}
