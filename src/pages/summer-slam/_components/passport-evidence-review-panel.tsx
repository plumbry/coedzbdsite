import { CheckCircle2, Clock, Inbox, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { PassportSectionHeader } from "./passport-section-header.tsx";
import {
  ssCard,
  ssCardPad,
} from "./passport-dashboard-theme.ts";
import { getDestination } from "./passport-destinations.ts";
import {
  getQuestStatus,
  type QuestCategory,
  type QuestEntry,
} from "./passport-types.ts";

type ReviewItem = {
  entry: QuestEntry;
  category: QuestCategory;
  kind: "pending" | "needs_fix" | "approved";
  timestamp: number;
};

function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return "Recently";
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildReviewItems(quests: QuestEntry[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const entry of quests) {
    const status = getQuestStatus(entry);
    const category = entry.quest.category as QuestCategory;
    const updatedAt = entry.progress?.updatedAt ?? entry.progress?.approvedAt ?? 0;
    if (status === "pending_review") {
      items.push({ entry, category, kind: "pending", timestamp: updatedAt });
    } else if (status === "rejected" || status === "needs_more_evidence") {
      items.push({ entry, category, kind: "needs_fix", timestamp: updatedAt });
    } else if (status === "approved" && entry.progress?.awardSource !== "auto") {
      items.push({
        entry,
        category,
        kind: "approved",
        timestamp: entry.progress?.approvedAt ?? updatedAt,
      });
    }
  }

  const rank = { pending: 0, needs_fix: 1, approved: 2 } as const;
  return items
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.timestamp - a.timestamp)
    .slice(0, 6);
}

function TimelineRow({
  item,
  onOpen,
}: {
  item: ReviewItem;
  onOpen: (entry: QuestEntry) => void;
}) {
  const dest = getDestination(item.category);
  const config =
    item.kind === "pending"
      ? {
          icon: Clock,
          label: "Review",
          tone: "text-amber-700 bg-amber-50 border-amber-100",
          detail: relativeTime(item.timestamp),
        }
      : item.kind === "needs_fix"
        ? {
            icon: AlertCircle,
            label: "Update",
            tone: "text-orange-800 bg-orange-50 border-orange-100",
            detail: "Needs changes",
          }
        : {
            icon: CheckCircle2,
            label: "Approved",
            tone: "text-teal-800 bg-teal-50 border-teal-100",
            detail: relativeTime(item.timestamp),
          };
  const Icon = config.icon;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item.entry)}
        className="flex w-full items-center gap-2 rounded-lg border border-orange-100/80 bg-white/90 px-2 py-1.5 text-left touch-manipulation hover:border-teal-200 hover:bg-teal-50/30"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            config.tone,
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-orange-950">
          {item.entry.quest.title}
        </span>
        <span className="shrink-0 text-[10px] text-orange-700/50">{dest.name.split(" ")[0]}</span>
        <span className={cn("shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase", config.tone)}>
          {config.label}
        </span>
      </button>
    </li>
  );
}

export function PassportEvidenceReviewPanel({
  quests,
  onOpenTask,
}: {
  quests: QuestEntry[];
  onOpenTask: (entry: QuestEntry) => void;
}) {
  const items = buildReviewItems(quests);

  return (
    <section className={cn(ssCard, ssCardPad)} aria-label="Recent activity">
      <PassportSectionHeader title="Recent activity" description="Submissions & reviews" />

      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-orange-200 bg-orange-50/40 px-3 py-4 text-xs text-orange-800/60">
          <Inbox className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          No submissions yet — complete a challenge to see review status here.
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <TimelineRow key={item.entry.quest._id} item={item} onOpen={onOpenTask} />
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] text-orange-400/70">Typical review · 24–48h</p>
    </section>
  );
}
