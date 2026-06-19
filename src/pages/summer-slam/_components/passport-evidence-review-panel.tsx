import { AlertTriangle, CheckCircle2, Clock, Inbox } from "lucide-react";
import { cn } from "@/lib/utils.ts";
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
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
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

function ReviewRow({
  item,
  onOpen,
}: {
  item: ReviewItem;
  onOpen: (entry: QuestEntry) => void;
}) {
  const meta = SEAL_META[item.category];
  const config =
    item.kind === "pending"
      ? {
          icon: Clock,
          badge: "Awaiting Review",
          badgeClass: "bg-amber-100 text-amber-800",
          sub: item.timestamp ? `Submitted ${relativeTime(item.timestamp)}` : "Submitted",
        }
      : item.kind === "needs_fix"
        ? {
            icon: AlertTriangle,
            badge: "Needs Fix",
            badgeClass: "bg-red-100 text-red-700",
            sub: "Resubmit new evidence",
          }
        : {
            icon: CheckCircle2,
            badge: "Approved",
            badgeClass: "bg-emerald-100 text-emerald-700",
            sub: "Counts toward progress",
          };
  const Icon = config.icon;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item.entry)}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-left touch-manipulation hover:bg-slate-50"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${meta.accent}1f`, color: meta.accent }}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800">
            {item.entry.quest.title}
          </span>
          <span className="block text-xs text-slate-500">
            {meta.label} · {config.sub}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            config.badgeClass,
          )}
        >
          {config.badge}
        </span>
      </button>
    </li>
  );
}

/**
 * Review-outcome focused panel (not an activity feed): shows what happened to
 * submitted evidence — awaiting review, approved, or needs a fix.
 */
export function PassportEvidenceReviewPanel({
  quests,
  onOpenTask,
}: {
  quests: QuestEntry[];
  onOpenTask: (entry: QuestEntry) => void;
}) {
  const items = buildReviewItems(quests);

  return (
    <section
      aria-label="Evidence and review"
      className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-black tracking-tight text-slate-900">Evidence &amp; review</h2>
      <p className="mb-4 text-sm text-slate-600">
        Track what happened to the evidence you submitted.
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <Inbox className="h-6 w-6 text-slate-400" aria-hidden />
          <p className="text-sm font-medium text-slate-600">No evidence submitted yet</p>
          <p className="text-xs text-slate-500">
            Submit evidence from your next destination to start earning seals.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ReviewRow key={item.entry.quest._id} item={item} onOpen={onOpenTask} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-center text-[11px] text-slate-400">
        All evidence is reviewed by moderators · typical review time 24–48 hours.
      </p>
    </section>
  );
}
