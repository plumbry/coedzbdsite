import { useState } from "react";
import { useConvex, useConvexAuth, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import type { YuniteExportScope } from "@/convex/yuniteExport.ts";
import {
  buildYuniteCacheZip,
  downloadBlob,
} from "@/lib/yunite-cache-export.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Download, History } from "lucide-react";
import { toast } from "sonner";

async function scanAllPages<TRow>(
  fetchPage: (cursor: string | null) => Promise<{
    continueCursor: string;
    isDone: boolean;
    rows: TRow[];
  }>,
  onRows: (rows: TRow[]) => void,
) {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const page = await fetchPage(cursor);
    onRows(page.rows);
    isDone = page.isDone;
    cursor = page.continueCursor;
  }
}

type YuniteCacheExportCardProps = {
  compact?: boolean;
};

export default function YuniteCacheExportCard({
  compact = false,
}: YuniteCacheExportCardProps) {
  const convex = useConvex();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const [scope, setScope] = useState<YuniteExportScope>("finalized");
  const [isExporting, setIsExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const summary = useQuery(api.yuniteExport.getYuniteExportSummary, { scope });
  const backfillStatus = useQuery(
    api.yunite.backfillTournamentStartedAtHelpers.getTournamentStartedAtBackfillStatus,
    {},
  );
  const backfillBatch = useAction(
    api.yunite.backfillTournamentStartedAt.backfillTournamentStartedAtBatch,
  );

  const handleBackfillStartedAt = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in is required before backfilling");
      return;
    }

    setIsBackfilling(true);
    setBackfillProgress(null);

    let nextIndex: number | null = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    try {
      while (nextIndex !== null) {
        const result = await backfillBatch({ startIndex: nextIndex });

        setBackfillProgress({
          current: result.nextIndex ?? result.totalImports,
          total: result.totalImports,
        });

        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        totalFailed += result.failed;

        if (result.errors.length > 0) {
          console.warn("Backfill batch errors:", result.errors);
        }

        nextIndex = result.nextIndex;

        if (!result.isComplete && result.nextIndex !== null) {
          toast.info(
            `Backfill progress: ${result.nextIndex}/${result.totalImports} imports processed…`,
          );
        }
      }

      if (totalUpdated === 0 && totalFailed === 0 && totalSkipped === 0) {
        toast.info("All Yunite imports already have tournament start times");
      } else {
        toast.success(
          `Backfill complete: ${totalUpdated} updated, ${totalSkipped} skipped, ${totalFailed} failed`,
        );
      }
    } catch (error) {
      console.error("Tournament startedAt backfill error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to backfill tournament start times",
      );
    } finally {
      setIsBackfilling(false);
      setBackfillProgress(null);
    }
  };

  const handleExport = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in is required before exporting");
      return;
    }

    setIsExporting(true);
    setExportPhase("Loading tournaments");
    try {
      const imports = await convex.query(api.yuniteExport.listYuniteImports, {
        scope,
      });

      if (imports.length === 0) {
        toast.error("No tournaments match the selected export scope");
        return;
      }

      const yuniteImportIds = imports.map(
        (importRecord) => importRecord._id as string,
      );

      setExportPhase("Loading leaderboard rows");
      const results: Doc<"thirdPartyResults">[] = [];
      await scanAllPages(
        (cursor) =>
          convex.query(api.yuniteExport.scanYuniteResultsPage, {
            cursor,
            yuniteImportIds,
          }),
        (rows) => {
          results.push(...rows);
        },
      );

      setExportPhase("Loading match stats");
      const matchStats: Doc<"matchPlayerStats">[] = [];
      await scanAllPages(
        (cursor) =>
          convex.query(api.yuniteExport.scanYuniteMatchStatsPage, {
            cursor,
            yuniteImportIds,
          }),
        (rows) => {
          matchStats.push(...rows);
        },
      );

      setExportPhase("Loading elimination overrides");
      const eliminationOverrides: Doc<"matchEliminationOverrides">[] = [];
      await scanAllPages(
        (cursor) =>
          convex.query(api.yuniteExport.scanYuniteEliminationOverridesPage, {
            cursor,
            yuniteImportIds,
          }),
        (rows) => {
          eliminationOverrides.push(...rows);
        },
      );

      setExportPhase("Building ZIP");
      const { blob, summary: exportSummary } = buildYuniteCacheZip({
        scope,
        imports,
        results,
        matchStats,
        eliminationOverrides,
      });

      const scopeLabel = scope === "finalized" ? "finalized" : "all";
      const filename = `yunite-cache-export-${scopeLabel}-${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(blob, filename);

      if (exportSummary.tournamentsWithoutMatchData > 0) {
        toast.warning(
          `Exported ${exportSummary.tournamentCount} tournaments. ${exportSummary.tournamentsWithoutMatchData} had no match data.`,
        );
      } else {
        toast.success(
          `Exported ${exportSummary.tournamentCount} tournaments with ${exportSummary.matchStatRows} match stat rows`,
        );
      }
    } catch (error) {
      console.error("Yunite cache export error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to export cached Yunite data";
      toast.error(message);
    } finally {
      setIsExporting(false);
      setExportPhase(null);
    }
  };

  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className={compact ? "text-sm" : undefined}>
          Export Cached Yunite Data
        </CardTitle>
        <CardDescription className={compact ? "text-xs" : undefined}>
          Download a ZIP with one folder per tournament. Each folder contains
          tournament metadata (including `tournamentStartedAt`), a leaderboard CSV,
          and match-level stats CSV.
        </CardDescription>
      </CardHeader>
      <CardContent className={compact ? "space-y-3 py-3" : "space-y-4"}>
        <div className="space-y-2">
          <Label htmlFor="yunite-export-scope">Export scope</Label>
          <Select
            value={scope}
            onValueChange={(value) => setScope(value as YuniteExportScope)}
          >
            <SelectTrigger id="yunite-export-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finalized">
                Finalized Yunite imports only (default)
              </SelectItem>
              <SelectItem value="all">
                All Yunite API imports (including in-progress)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {summary ? (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Tournaments</div>
              <div className="font-semibold">{summary.imports}</div>
            </div>
            <div>
              <div className="text-muted-foreground">With match data</div>
              <div className="font-semibold">{summary.withMatchData}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Finalized</div>
              <div className="font-semibold">{summary.finalized}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Loading summary…</div>
        )}

        {backfillStatus && backfillStatus.missingCount > 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-muted-foreground">
              {backfillStatus.missingCount} of {backfillStatus.yuniteImportCount}{" "}
              Yunite imports are missing `tournamentStartedAt`. Backfill fetches
              start times from the Yunite API before you export.
            </p>
            {backfillProgress ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Processing {backfillProgress.current}/{backfillProgress.total}…
              </p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={handleBackfillStartedAt}
              disabled={
                isBackfilling ||
                isExporting ||
                isAuthLoading ||
                !isAuthenticated
              }
            >
              <History className="mr-2 h-4 w-4" />
              {isBackfilling ? "Backfilling..." : "Backfill Start Times"}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
        <Button
          size={compact ? "sm" : "default"}
          onClick={handleExport}
          disabled={
            isExporting ||
            isBackfilling ||
            isAuthLoading ||
            !isAuthenticated
          }
        >
          <Download className="mr-2 h-4 w-4" />
          {isExporting
            ? exportPhase
              ? `${exportPhase}...`
              : "Exporting..."
            : "Download ZIP Export"}
        </Button>
        </div>
      </CardContent>
    </Card>
  );
}
