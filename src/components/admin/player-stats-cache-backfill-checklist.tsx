import { Link } from "react-router-dom";
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
import { Button } from "@/components/ui/button.tsx";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { PlayerStatsCacheStatusCard } from "@/components/admin/player-stats-cache-status.tsx";

function StepRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className={done ? "text-muted-foreground line-through" : ""}>{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

/** Post-deploy checklist — defers to stats cache status before recommending a full rebuild. */
export function PlayerStatsCacheBackfillChecklist() {
  const summary = useQuery(api.playerStatsCache.getCacheStatusSummary, {});
  if (summary === undefined) {
    return null;
  }

  const cachePopulated = summary.populated;
  const statsBackfillDone =
    cachePopulated && !summary.activeRebuild && summary.recommendation !== "full_rebuild";
  const needsFullRebuild = summary.recommendation === "full_rebuild";
  const needsIncremental = summary.recommendation === "incremental";

  return (
    <div className="space-y-4">
      <PlayerStatsCacheStatusCard />

      <Card className="border-blue-500/50 bg-blue-50/20 dark:bg-blue-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Player stats cache maintenance
          </CardTitle>
          <CardDescription className="text-xs">
            Check status first. Full rebuild is only needed when the cache is empty, the formula
            version changed, or you explicitly run an emergency rebuild.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 py-3">
          <ol className="space-y-3 text-sm">
            <StepRow
              done={cachePopulated}
              label="Confirm playerStatsCache is populated"
              detail={
                cachePopulated
                  ? `${summary.totalRows.toLocaleString()} rows with imported data.`
                  : "Cache is empty — run emergency full rebuild once."
              }
            />
            <StepRow
              done={statsBackfillDone && !needsIncremental}
              label="Apply pending import changes to cache"
              detail={
                needsIncremental
                  ? `${summary.estimatedAffectedPlayers} player(s) affected since last rebuild — use Recalculate affected players.`
                  : needsFullRebuild
                    ? summary.recommendationReason
                    : summary.activeRebuild
                      ? `Rebuild in progress (${summary.activeRebuild.processedCount}/${summary.activeRebuild.totalPlayers || "…"}).`
                      : "No incremental updates needed."
              }
            />
            <StepRow
              done={cachePopulated}
              label="Verify row counts"
              detail={
                cachePopulated
                  ? `statsEligible (3+): ${summary.statsEligible} · below 3: ${summary.belowDisplayThreshold} · reevaluationEligible (8+): ${summary.reevaluationEligible}`
                  : "Waiting for initial cache population."
              }
            />
            <StepRow
              done={false}
              label='Run "Rebuild tier re-eval cache" only if tier tools need refresh'
              detail="Optional. Includes players with 8+ Yunite import events."
            />
          </ol>

          {needsFullRebuild && !summary.activeRebuild && (
            <Alert>
              <AlertTitle>Full rebuild required</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <p>{summary.recommendationReason}</p>
                <Button variant="link" size="sm" className="h-auto px-0" asChild>
                  <Link to="/admin/data-maintenance">Open Data Maintenance</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {needsIncremental && !summary.activeRebuild && (
            <Alert>
              <AlertTitle>Incremental update recommended</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <p>
                  Use <strong>Recalculate affected players</strong> in Data Maintenance — not a full
                  rebuild.
                </p>
                <Button variant="link" size="sm" className="h-auto px-0" asChild>
                  <Link to="/admin/data-maintenance">Open Data Maintenance</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {statsBackfillDone && !needsIncremental && (
            <p className="text-xs text-muted-foreground">
              Cache is current. Legacy hasMatchData fallbacks stay disabled while playerStatsCache
              is populated.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
