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

/** Post-deploy checklist for the playerStatsCache rollout. */
export function PlayerStatsCacheBackfillChecklist() {
  const summary = useQuery(api.playerStatsCache.getCacheStatusSummary, {});
  if (summary === undefined) {
    return null;
  }

  const cachePopulated = summary.populated;
  const statsBackfillDone = cachePopulated && !summary.activeRebuild;

  return (
    <Card className="border-blue-500/50 bg-blue-50/20 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          Post-deploy: player stats cache
        </CardTitle>
        <CardDescription className="text-xs">
          Run once after deploying the import/stats cache changes. Until step 1 completes,
          displayed stats and tier pools use legacy pre-backfill fallbacks only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 py-3">
        <ol className="space-y-3 text-sm">
          <StepRow
            done={statsBackfillDone}
            label='Run "Rebuild stats cache" (Data Maintenance)'
            detail={
              statsBackfillDone
                ? `${summary.totalRows.toLocaleString()} cache rows written.`
                : summary.activeRebuild
                  ? `Rebuild in progress (${summary.activeRebuild.processedCount}/${summary.activeRebuild.totalPlayers || "…"}).`
                  : "Builds playerStatsCache from matched import results only."
            }
          />
          <StepRow
            done={statsBackfillDone}
            label="Verify playerStatsCache row counts"
            detail={
              cachePopulated
                ? `Total with import data: ${summary.totalRows} · statsEligible (3+ events): ${summary.statsEligible} · below 3 events: ${summary.belowDisplayThreshold} · reevaluationEligible (8+): ${summary.reevaluationEligible}`
                : "Waiting for stats cache rebuild."
            }
          />
          <StepRow
            done={false}
            label='Run "Rebuild tier re-eval cache" if tier tools need refresh'
            detail="Optional after step 1. Only includes players with 8+ Yunite import events."
          />
        </ol>

        {!statsBackfillDone && (
          <Alert>
            <AlertTitle>Action required after deploy</AlertTitle>
            <AlertDescription className="text-xs space-y-2">
              <p>
                Open Data Maintenance and run <strong>Rebuild stats cache</strong> (confirmation
                required). Then confirm counts above before relying on displayed stats or tier
                re-evaluation pools.
              </p>
              <Button variant="link" size="sm" className="h-auto px-0" asChild>
                <Link to="/admin/data-maintenance">Open Data Maintenance</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {statsBackfillDone && (
          <p className="text-xs text-muted-foreground">
            Legacy hasMatchData / eventsPlayedCount fallbacks are disabled for tier and aggregate
            pools while playerStatsCache is populated.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
