import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Activity, CheckCircle2, AlertTriangle } from "lucide-react";

function formatTs(ts: number | null | undefined): string {
  if (ts == null) return "—";
  return new Date(ts).toLocaleString();
}

function recommendationBadge(
  recommendation: "none" | "incremental" | "full_rebuild",
): { label: string; variant: "default" | "secondary" | "destructive" } {
  switch (recommendation) {
    case "none":
      return { label: "Up to date", variant: "secondary" };
    case "incremental":
      return { label: "Incremental update", variant: "default" };
    case "full_rebuild":
      return { label: "Full rebuild needed", variant: "destructive" };
  }
}

/** Admin health check for playerStatsCache — avoids recommending unnecessary full rebuilds. */
export function PlayerStatsCacheStatusCard() {
  const status = useQuery(api.playerStatsCache.getStatsCacheStatus, {});

  if (status === undefined) {
    return null;
  }

  const badge = recommendationBadge(status.recommendation);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Stats cache status
        </CardTitle>
        <CardDescription className="text-xs">
          Indexed snapshot of playerStatsCache health. Does not scan the players table.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {status.appearsStale ? (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              May be stale
            </span>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              Appears current
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{status.recommendationReason}</p>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Cache rows</dt>
            <dd className="font-medium">{status.rowCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">statsEligible (3+ events)</dt>
            <dd className="font-medium">{status.statsEligibleCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">reevaluationEligible (8+ events)</dt>
            <dd className="font-medium">{status.reevaluationEligibleCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Below display threshold</dt>
            <dd className="font-medium">{status.belowDisplayThreshold.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">lastCalculatedAt (oldest)</dt>
            <dd className="font-medium">{formatTs(status.lastCalculatedAt.oldest)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">lastCalculatedAt (newest)</dt>
            <dd className="font-medium">{formatTs(status.lastCalculatedAt.newest)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Newest import activity</dt>
            <dd className="font-medium">{formatTs(status.importActivity.newestImportActivityAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Newest result row</dt>
            <dd className="font-medium">{formatTs(status.importActivity.newestResultAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last successful full rebuild</dt>
            <dd className="font-medium">{formatTs(status.lastSuccessfulRebuildAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Affected since rebuild</dt>
            <dd className="font-medium">
              {status.estimatedAffectedPlayers.toLocaleString()} player(s) ·{" "}
              {status.importsSinceLastRebuild} import job(s)
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">sourceVersion</dt>
            <dd className="font-medium">
              v{status.currentSourceVersion}
              {status.sourceVersionMismatch ? " (mismatch)" : ""}
            </dd>
          </div>
        </dl>

        {status.activeRebuild && (
          <Alert>
            <AlertTitle>Rebuild in progress</AlertTitle>
            <AlertDescription className="text-xs">
              {status.activeRebuild.collectingPlayerIds
                ? "Collecting players with import data…"
                : `${status.activeRebuild.processedCount} / ${status.activeRebuild.totalPlayers || "…"} processed`}
            </AlertDescription>
          </Alert>
        )}

        {status.recommendation === "none" && !status.activeRebuild && (
          <p className="text-xs text-muted-foreground">
            No full rebuild recommended. Use per-import recalculation or the incremental button
            after new imports if needed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
