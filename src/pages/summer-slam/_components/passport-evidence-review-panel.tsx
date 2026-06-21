import { AlertCircle, Clock, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { PassportSectionHeader } from "./passport-section-header.tsx";
import { ssCard, ssCardPad, ssPassportStretchPanel } from "./passport-dashboard-theme.ts";
import { getDestination } from "./passport-destinations.ts";
import {
  getQuestStatus,
  type QuestCategory,
  type QuestEntry,
} from "./passport-types.ts";

type OutstandingItem = {
  entry: QuestEntry;
  category: QuestCategory;
  kind: "pending" | "needs_update";
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

function buildOutstandingItems(quests: QuestEntry[]): OutstandingItem[] {
  const items: OutstandingItem[] = [];
  for (const entry of quests) {
    const status = getQuestStatus(entry);
    const category = entry.quest.category as QuestCategory;
    const timestamp = entry.progress?.updatedAt ?? 0;
    if (status === "pending_review") {
      items.push({ entry, category, kind: "pending", timestamp });
    } else if (status === "rejected" || status === "needs_more_evidence") {
      items.push({ entry, category, kind: "needs_update", timestamp });
    }
  }

  const rank = { needs_update: 0, pending: 1 } as const;
  return items
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.timestamp - a.timestamp)
    .slice(0, 3);
}

function OutstandingRow({
  item,
  onUpdateEvidence,
}: {
  item: OutstandingItem;
  onUpdateEvidence: (entry: QuestEntry) => void;
}) {
  const dest = getDestination(item.category);
  const staffNote = item.entry.progress?.awardLog?.trim();
  const canUpdate = item.kind === "needs_update";

  return (
    <li className="rounded-lg border border-orange-100/90 bg-white/90 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            canUpdate
              ? "border-red-300 bg-red-50 text-red-600"
              : "border-amber-300 bg-amber-50 text-amber-700",
          )}
          aria-hidden
        >
          {canUpdate ? (
            <span className="text-[11px] font-bold leading-none">!</span>
          ) : (
            <Clock className="h-3 w-3" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-orange-950">{item.entry.quest.title}</p>
          <p className="text-[10px] text-orange-700/50">
            {dest.name.split(" ")[0]} · {relativeTime(item.timestamp)}
          </p>
          {canUpdate && staffNote ? (
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-red-800/70">{staffNote}</p>
          ) : null}
          {!canUpdate ? (
            <p className="mt-1 text-[10px] text-amber-800/70">Awaiting staff review</p>
          ) : null}
        </div>

        {canUpdate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 touch-manipulation border-red-200 px-2 text-[10px] text-red-800 hover:bg-red-50 hover:text-red-900"
            onClick={() => onUpdateEvidence(item.entry)}
          >
            Update
          </Button>
        ) : (
          <span className="shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100">
            Pending
          </span>
        )}
      </div>
    </li>
  );
}

export function PassportEvidenceReviewPanel({
  quests,
  onUpdateEvidence,
  className,
}: {
  quests: QuestEntry[];
  onUpdateEvidence: (entry: QuestEntry) => void;
  className?: string;
}) {
  const items = buildOutstandingItems(quests);

  return (
    <section
      className={cn(ssCard, ssCardPad, ssPassportStretchPanel, className)}
      aria-label="Recent activity"
    >
      <PassportSectionHeader
        title="Recent Activity"
        description="Outstanding evidence submissions"
      />

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-orange-200 bg-orange-50/40 px-3 py-4 text-xs text-orange-800/60">
            <Inbox className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            No outstanding submissions — evidence you send for review will appear here.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <OutstandingRow
                key={item.entry.quest._id}
                item={item}
                onUpdateEvidence={onUpdateEvidence}
              />
            ))}
          </ul>
        )}

        <p className="mt-auto pt-3 text-[10px] text-orange-400/70">
          {items.some((item) => item.kind === "needs_update") ? (
            <span className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-red-500" aria-hidden />A red mark means staff
              returned a quest — update your evidence and resubmit.
            </span>
          ) : (
            "Typical review · 48–72h"
          )}
        </p>
      </div>
    </section>
  );
}
