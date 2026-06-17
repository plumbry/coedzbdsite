import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

export type AdminActionItem = {
  id: string;
  category: string;
  recordId: string;
  recordLabel: string;
  reason: string;
  reasonCode: string;
  actionLabel: string;
  href: string;
};

type OperationsGroup = {
  title: string;
  count: number;
  description: string;
  href: string;
  items: AdminActionItem[];
};

function ActionItemRow({ item }: { item: AdminActionItem }) {
  return (
    <Link
      to={item.href}
      className="flex items-start justify-between gap-3 rounded-md border p-3 transition-colors hover:border-primary/50 hover:bg-muted/40 group"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium truncate">{item.recordLabel}</p>
        <p className="text-xs text-muted-foreground">{item.reason}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
          {item.actionLabel}
        </Badge>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
      </div>
    </Link>
  );
}

function OperationsGroupCard({ group }: { group: OperationsGroup }) {
  const hasItems = group.items.length > 0;
  const tone = group.count > 0 ? "attention" : "good";

  return (
    <Card className="h-full py-0">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {tone === "attention" ? (
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              )}
              {group.title}
            </CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </div>
          <Badge variant={group.count > 0 ? "destructive" : "secondary"}>
            {group.count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {hasItems ? (
          group.items.slice(0, 4).map((item) => <ActionItemRow key={item.id} item={item} />)
        ) : (
          <p className="text-xs text-muted-foreground py-2">Nothing needs attention.</p>
        )}
        {group.count > group.items.length && (
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link to={group.href}>View all ({group.count})</Link>
          </Button>
        )}
        {!hasItems && group.count === 0 && (
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link to={group.href}>Open</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function OperationsAttentionPanel({
  eventActionItems,
  eventAttentionCount,
  importActionItems,
  unmatchedPlayers,
  unlinkedImports,
  unsyncedYuniteImports,
  importsWithKillDiscrepancies,
  unsyncedEventCount,
  showImports,
  showEvents,
}: {
  eventActionItems: AdminActionItem[];
  eventAttentionCount: number;
  importActionItems: AdminActionItem[];
  unmatchedPlayers: number;
  unlinkedImports: number;
  unsyncedYuniteImports: number;
  importsWithKillDiscrepancies: number;
  unsyncedEventCount: number;
  showImports: boolean;
  showEvents: boolean;
}) {
  const unmatchedItems = importActionItems.filter(
    (item) => item.reasonCode === "player_matching_incomplete",
  );
  const unlinkedItems = importActionItems.filter(
    (item) => item.reasonCode === "unlinked_import",
  );
  const unsyncedImportItems = importActionItems.filter(
    (item) => item.reasonCode === "unsynced_yunite",
  );
  const killDiscrepancyItems = importActionItems.filter(
    (item) => item.reasonCode === "kill_discrepancy",
  );
  const unsyncedEventItems = eventActionItems.filter(
    (item) => item.reasonCode === "match_sync_pending",
  );

  const groups: OperationsGroup[] = [];

  if (showEvents) {
    groups.push({
      title: "Events needing setup",
      count: eventAttentionCount,
      description: "Each item shows what is wrong and where to fix it.",
      href: "/admin/events-manager",
      items: eventActionItems,
    });
  }

  if (showImports) {
    groups.push(
      {
        title: "Unmatched import players",
        count: unmatchedPlayers,
        description: "Players from imports that still need matching.",
        href: "/admin/uploads",
        items: unmatchedItems,
      },
      {
        title: "Unlinked imports",
        count: unlinkedImports,
        description: "Imports not yet linked to a calendar event.",
        href: "/admin/uploads",
        items: unlinkedItems,
      },
      {
        title: "Unsynced Yunite match data",
        count: unsyncedYuniteImports,
        description: "Yunite imports missing match-level sync.",
        href: "/admin/uploads",
        items: unsyncedImportItems,
      },
      {
        title: "Kill discrepancies",
        count: importsWithKillDiscrepancies,
        description: "API team kills do not match kill-feed totals.",
        href: "/admin/uploads",
        items: killDiscrepancyItems,
      },
    );
  }

  if (showEvents && unsyncedEventCount > 0) {
    groups.push({
      title: "Events with unsynced Yunite",
      count: unsyncedEventCount,
      description: "Linked events with Yunite imports awaiting match sync.",
      href: "/admin/events-manager",
      items: unsyncedEventItems,
    });
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {groups.map((group) => (
        <OperationsGroupCard key={group.title} group={group} />
      ))}
    </div>
  );
}
