import { useState } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Download, FileJson } from "lucide-react";
import { toast } from "sonner";
import {
  ZBD_RAW_COLLECTIONS,
  ZBD_RAW_CONTRACT,
  ZBD_RAW_SCHEMA_VERSION,
  type ZbdRawCollectionName,
  type ZbdRawDocument,
  type ZbdRawPlayer,
  type ZbdRawIdentityAlias,
  type ZbdRawTierChange,
  type ZbdRawEvaluation,
  type ZbdRawMembershipApplication,
  type ZbdRawMembershipStatusEvent,
  type ZbdRawCompetitionEvent,
  type ZbdRawResultBatch,
  type ZbdRawEventResultEntry,
  type ZbdRawMatchParticipation,
  type ZbdRawMatchStatOverride,
  type ZbdRawManualEventResult,
  type ZbdRawPreassignedRoster,
  type ZbdRawTierSnapshot,
  type ZbdRawEventPenalty,
  type ZbdRawPrizeEarning,
  type ZbdRawInGameEarnings,
  type ZbdRawReplayMatch,
  type ZbdRawReplayPlayerResult,
} from "@/convex/lib/zbdRaw/types.ts";

const GENERATOR = {
  system: "zbd-website",
  systemVersion: "zbd.raw.v1-producer",
} as const;

type PageResult<T> = {
  records: T[];
  continueCursor: string;
  isDone: boolean;
};

async function scanAllRecords<T>(
  fetchPage: (cursor: string | null) => Promise<PageResult<T>>,
): Promise<T[]> {
  const records: T[] = [];
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const page = await fetchPage(cursor);
    records.push(...page.records);
    isDone = page.isDone;
    cursor = page.continueCursor;
  }
  return records;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildCounts(doc: Omit<ZbdRawDocument, "contentHash" | "generatedAt" | "counts">): Record<
  ZbdRawCollectionName,
  number
> {
  const counts = {} as Record<ZbdRawCollectionName, number>;
  for (const name of ZBD_RAW_COLLECTIONS) {
    counts[name] = (doc[name] as unknown[]).length;
  }
  return counts;
}

export default function ZbdRawExportCard() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const handleExport = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in is required before producing zbd.raw.v1");
      return;
    }

    setIsExporting(true);
    setProgress("Starting…");
    try {
      const q = api.zbdRawExport;

      setProgress("players…");
      const players = await scanAllRecords<ZbdRawPlayer>((cursor) =>
        convex.query(q.pagePlayers, { cursor }),
      );
      setProgress("identityAliases…");
      const identityAliases = await scanAllRecords<ZbdRawIdentityAlias>((cursor) =>
        convex.query(q.pageIdentityAliases, { cursor }),
      );
      setProgress("tierChanges…");
      const tierChanges = await scanAllRecords<ZbdRawTierChange>((cursor) =>
        convex.query(q.pageTierChanges, { cursor }),
      );
      setProgress("evaluations…");
      const evaluations = await scanAllRecords<ZbdRawEvaluation>((cursor) =>
        convex.query(q.pageEvaluations, { cursor }),
      );
      setProgress("membershipApplications…");
      const membershipApplications = await scanAllRecords<ZbdRawMembershipApplication>((cursor) =>
        convex.query(q.pageMembershipApplications, { cursor }),
      );
      setProgress("membershipStatusEvents…");
      const membershipStatusEvents = await scanAllRecords<ZbdRawMembershipStatusEvent>((cursor) =>
        convex.query(q.pageMembershipStatusEvents, { cursor }),
      );
      setProgress("competitionEvents…");
      const competitionEvents = await scanAllRecords<ZbdRawCompetitionEvent>((cursor) =>
        convex.query(q.pageCompetitionEvents, { cursor }),
      );
      setProgress("resultBatches…");
      const resultBatches = await scanAllRecords<ZbdRawResultBatch>((cursor) =>
        convex.query(q.pageResultBatches, { cursor }),
      );
      setProgress("eventResultEntries…");
      const eventResultEntries = await scanAllRecords<ZbdRawEventResultEntry>((cursor) =>
        convex.query(q.pageEventResultEntries, { cursor }),
      );
      setProgress("matchParticipations…");
      const matchParticipations = await scanAllRecords<ZbdRawMatchParticipation>((cursor) =>
        convex.query(q.pageMatchParticipations, { cursor }),
      );
      setProgress("matchStatOverrides…");
      const matchStatOverrides = await scanAllRecords<ZbdRawMatchStatOverride>((cursor) =>
        convex.query(q.pageMatchStatOverrides, { cursor }),
      );
      setProgress("manualEventResults…");
      const manualEventResults = await scanAllRecords<ZbdRawManualEventResult>((cursor) =>
        convex.query(q.pageManualEventResults, { cursor }),
      );
      setProgress("preassignedRosters…");
      const preassignedRosters = await scanAllRecords<ZbdRawPreassignedRoster>((cursor) =>
        convex.query(q.pagePreassignedRosters, { cursor }),
      );
      setProgress("tierSnapshots…");
      const tierSnapshots = await scanAllRecords<ZbdRawTierSnapshot>((cursor) =>
        convex.query(q.pageTierSnapshots, { cursor }),
      );
      setProgress("eventPenalties…");
      const eventPenalties = await scanAllRecords<ZbdRawEventPenalty>((cursor) =>
        convex.query(q.pageEventPenalties, { cursor }),
      );
      setProgress("prizeEarnings…");
      const prizeEarnings = await scanAllRecords<ZbdRawPrizeEarning>((cursor) =>
        convex.query(q.pagePrizeEarnings, { cursor }),
      );
      setProgress("inGameEarnings…");
      const inGameEarnings = await scanAllRecords<ZbdRawInGameEarnings>((cursor) =>
        convex.query(q.pageInGameEarnings, { cursor }),
      );
      setProgress("replayMatches…");
      const replayMatches = await scanAllRecords<ZbdRawReplayMatch>((cursor) =>
        convex.query(q.pageReplayMatches, { cursor }),
      );
      setProgress("replayPlayerResults…");
      const replayPlayerResults = await scanAllRecords<ZbdRawReplayPlayerResult>((cursor) =>
        convex.query(q.pageReplayPlayerResults, { cursor }),
      );

      setProgress("Hashing…");
      const partial = {
        contract: ZBD_RAW_CONTRACT,
        schemaVersion: ZBD_RAW_SCHEMA_VERSION,
        generator: GENERATOR,
        scope: { full: true as const },
        players,
        identityAliases,
        tierChanges,
        evaluations,
        membershipApplications,
        membershipStatusEvents,
        competitionEvents,
        resultBatches,
        eventResultEntries,
        matchParticipations,
        matchStatOverrides,
        manualEventResults,
        preassignedRosters,
        tierSnapshots,
        eventPenalties,
        prizeEarnings,
        inGameEarnings,
        replayMatches,
        replayPlayerResults,
        extensions: {},
      };

      const counts = buildCounts(partial);
      const generatedAt = new Date().toISOString();
      const hashInput = JSON.stringify({ ...partial, counts });
      const contentHash = await sha256Hex(hashInput);

      const contractDocument: ZbdRawDocument = {
        ...partial,
        generatedAt,
        contentHash,
        counts,
      };

      const json = JSON.stringify(contractDocument, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `zbd.raw.v1-${generatedAt.slice(0, 10)}.json`;
      window.document.body.appendChild(anchor);
      anchor.click();
      window.document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      toast.success(
        `Produced zbd.raw.v1 (${total.toLocaleString()} records across ${ZBD_RAW_COLLECTIONS.length} collections)`,
      );
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to produce zbd.raw.v1",
      );
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileJson className="h-4 w-4" />
          zbd.raw.v1 Producer
        </CardTitle>
        <CardDescription className="text-xs">
          Canonical raw-facts contract document (no analytics). Downloads a full
          JSON snapshot for Tier Tool consumption.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-3 space-y-2">
        <Button size="sm" onClick={handleExport} disabled={isExporting}>
          <Download className="mr-2 h-3 w-3" />
          {isExporting ? "Producing…" : "Download zbd.raw.v1"}
        </Button>
        {progress ? (
          <p className="text-xs text-muted-foreground">Loading {progress}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
