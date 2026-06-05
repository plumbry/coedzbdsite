import type { ReactNode } from "react";
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
import { PlayerStatsRebuildButton } from "@/components/admin/player-stats-rebuild-button.tsx";

type PlayerStatsMigrationChecklistProps = {
  /** Show clear-field actions (Data Maintenance). Otherwise link to that page. */
  variant?: "maintenance" | "cache";
  onRequestClearPlayerPr?: () => void;
  onRequestClearTierEvalPr?: () => void;
  clearingPlayerPr?: boolean;
  clearingTierEvalPr?: boolean;
};

function StepRow({
  done,
  label,
  detail,
  action,
}: {
  done: boolean;
  label: string;
  detail: string;
  action?: ReactNode;
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
        {action}
      </div>
    </li>
  );
}

export function PlayerStatsMigrationChecklist({
  variant = "maintenance",
  onRequestClearPlayerPr,
  onRequestClearTierEvalPr,
  clearingPlayerPr = false,
  clearingTierEvalPr = false,
}: PlayerStatsMigrationChecklistProps) {
  const playerCounts = useQuery(
    api.clearDeprecatedPlayerRankingFields.countPlayersWithDeprecatedRankingFields,
  );
  const tierEvalCounts = useQuery(
    api.clearDeprecatedTierEvalPrFields.countRowsWithDeprecatedTierEvalPrFields,
  );
  const lastFullRebuild = useQuery(api.playerStatsRebuild.getLastFullPlayerStatsRebuild, {});
  const activeRebuild = useQuery(api.playerStatsRebuild.getActiveRebuildJob, {});

  if (
    playerCounts === undefined ||
    tierEvalCounts === undefined ||
    lastFullRebuild === undefined
  ) {
    return null;
  }

  const playerPrClear = playerCounts.withDeprecatedFields === 0;
  const tierEvalPrClear = tierEvalCounts.withDeprecatedFields === 0;
  const migrationReady = playerPrClear && tierEvalPrClear;
  const fullRebuildDone = lastFullRebuild !== null;
  const migrationComplete = migrationReady && fullRebuildDone;

  if (variant === "cache" && migrationComplete) {
    return null;
  }

  if (migrationComplete && variant === "maintenance") {
    return (
      <Card className="border-green-600/40 bg-green-50/50 dark:bg-green-950/20">
        <CardContent className="py-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Internal stats migration complete
          </p>
          <p className="mt-1 text-xs">
            Last full rebuild finished{" "}
            {new Date(lastFullRebuild.completedAt).toLocaleString()}.
            Use Data Cache for partial refreshes after Yunite imports.
          </p>
        </CardContent>
      </Card>
    );
  }

  const playerPrDetail = playerPrClear
    ? "No player documents have legacy powerScore / rankingStats."
    : `${playerCounts.withDeprecatedFields} of ${playerCounts.totalPlayers} player(s) still have legacy fields.`;

  const tierEvalPrDetail = tierEvalPrClear
    ? "No tier-eval cache rows have legacy avgPRPerEvent / finalPowerScore."
    : `${tierEvalCounts.withDeprecatedFields} of ${tierEvalCounts.totalRows} cache row(s) still have legacy fields.`;

  const maintenanceLink = (
    <Button variant="link" size="sm" className="h-auto px-0" asChild>
      <Link to="/admin/data-maintenance">Open Data Maintenance</Link>
    </Button>
  );

  return (
    <Card className={migrationReady ? "border-green-600/40 bg-green-50/50 dark:bg-green-950/20" : "border-amber-500/60 bg-amber-50/30 dark:bg-amber-950/20"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          Internal stats migration
        </CardTitle>
        <CardDescription className="text-xs">
          One-time cleanup of legacy stat fields, then unified rebuild after Yunite imports or
          policy changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 py-3">
        <ol className="space-y-3 text-sm">
          <StepRow
            done={playerPrClear}
            label="Clear legacy player stat fields"
            detail={playerPrDetail}
            action={
              !playerPrClear &&
              (variant === "maintenance" && onRequestClearPlayerPr ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-1"
                  disabled={clearingPlayerPr}
                  onClick={onRequestClearPlayerPr}
                >
                  {clearingPlayerPr ? "Starting cleanup…" : "Clear legacy fields"}
                </Button>
              ) : (
                maintenanceLink
              ))
            }
          />
          <StepRow
            done={tierEvalPrClear}
            label="Clear legacy tier-evaluation fields"
            detail={tierEvalPrDetail}
            action={
              !tierEvalPrClear &&
              (variant === "maintenance" && onRequestClearTierEvalPr ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-1"
                  disabled={clearingTierEvalPr}
                  onClick={onRequestClearTierEvalPr}
                >
                  {clearingTierEvalPr ? "Starting cleanup…" : "Clear tier-evaluation fields"}
                </Button>
              ) : (
                maintenanceLink
              ))
            }
          />
          <StepRow
            done={fullRebuildDone}
            label="Rebuild all player stats"
            detail={
              fullRebuildDone && lastFullRebuild
                ? `Last full rebuild completed ${new Date(lastFullRebuild.completedAt).toLocaleString()}.`
                : "Full pipeline: Yunite event counts → TC → DCA → top-five → tier-eval → population averages."
            }
            action={
              !fullRebuildDone &&
              (variant === "maintenance" ? (
                <PlayerStatsRebuildButton
                  size="sm"
                  className="mt-1"
                  label="Rebuild all player stats"
                  linkToDataCache
                  disabled={!migrationReady || !!activeRebuild}
                />
              ) : (
                <PlayerStatsRebuildButton
                  size="sm"
                  className="mt-1"
                  label="Rebuild all player stats"
                  disabled={!migrationReady || !!activeRebuild}
                />
              ))
            }
          />
        </ol>

        {!migrationReady && (
          <Alert>
            <AlertTitle>Finish legacy field cleanup first</AlertTitle>
            <AlertDescription className="text-xs">
              Run steps 1 and 2 before a full rebuild so tier-eval and holistic caches are not
              rebuilt with stale legacy stat fields.
            </AlertDescription>
          </Alert>
        )}

        {migrationReady && variant === "maintenance" && (
          <p className="text-xs text-muted-foreground">
            Migration steps 1–2 are complete. Run a full rebuild after Yunite imports, or use partial
            rebuilds on Data Cache.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
