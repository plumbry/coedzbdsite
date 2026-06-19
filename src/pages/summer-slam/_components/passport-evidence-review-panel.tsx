import { CheckCircle2, Clock, Inbox, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { ssCard, ssSectionDesc, ssSectionTitle } from "./passport-dashboard-theme.ts";
import { SEAL_META } from "./passport-seal.ts";
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
    .slice(0, 8);
}

function TimelineRow({
  item,
  onOpen,
  isLast,
}: {
  item: ReviewItem;
  onOpen: (entry: QuestEntry) => void;
  isLast: boolean;
}) {
  const meta = SEAL_META[item.category];
  const config =
    item.kind === "pending"
      ? {
          icon: Clock,
          label: "Awaiting review",
          tone: "text-amber-700 bg-amber-50 border-amber-100",
          detail: item.timestamp ? `Submitted ${relativeTime(item.timestamp)}` : "Submitted",
        }
      : item.kind === "needs_fix"
        ? {
            icon: AlertCircle,
            label: "Needs update",
            tone: "text-orange-800 bg-orange-50 border-orange-100",
            detail: "Staff requested changes",
          }
        : {
            icon: CheckCircle2,
            label: "Approved",
            tone: "text-teal-800 bg-teal-50 border-teal-100",
            detail: "Counts toward your seal",
          };
  const Icon = config.icon;

  return (
    <li className="relative pl-8">
      {!isLast ? (
        <span className="absolute left-[11px] top-8 bottom-0 w-px bg-stone-200" aria-hidden />
      ) : null}
      <span
        className={cn(
          "absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border",
          config.tone,
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <button
        type="button"
        onClick={() => onOpen(item.entry)}
        className="mb-4 w-full rounded-xl border border-stone-200/80 bg-white p-3 text-left touch-manipulation transition-colors hover:border-stone-300 hover:bg-stone-50/80"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-900">{item.entry.quest.title}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              {meta.label} · {config.detail}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              config.tone,
            )}
          >
            {config.label}
          </span>
        </div>
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
    <section className={cn(ssCard, "p-6 sm:p-7")} aria-label="Recent activity">
      <h2 className={ssSectionTitle}>Recent activity</h2>
      <p className={ssSectionDesc}>Evidence submissions and staff review outcomes.</p>

      {items.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-10 text-center">
          <Inbox className="h-6 w-6 text-stone-400" aria-hidden />
          <p className="text-sm font-medium text-stone-700">No submissions yet</p>
          <p className="max-w-sm text-xs text-stone-500">
            Complete a challenge and submit evidence to see review status here.
          </p>
        </div>
      ) : (
        <ul className="relative mt-5">
          {items.map((item, index) => (
            <TimelineRow
              key={item.entry.quest._id}
              item={item}
              onOpen={onOpenTask}
              isLast={index === items.length - 1}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-center text-[11px] text-stone-400">
        Typical staff review time · 24–48 hours
      </p>
    </section>
  );
}
