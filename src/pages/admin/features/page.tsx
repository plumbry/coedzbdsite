import { useTierEvaluationCache } from "@/hooks/use-tier-evaluation-cache.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Download, Users, Zap, Wrench, ArrowRight, RefreshCw, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import ExportOptionsDialog from "../_components/export-options-dialog.tsx";
import MergePlayersDialog from "../_components/merge-players-dialog.tsx";
import RelinkResultsButton from "../_components/relink-results-button.tsx";
import GoogleSheetsManager from "../_components/google-sheets-manager.tsx";
import TierSnapshotTool from "../_components/tier-snapshot-tool.tsx";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";

function FeaturesContent() {
  const evaluations = useTierEvaluationCache();

  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isSyncingDiscordMembers, setIsSyncingDiscordMembers] = useState(false);
  const syncDiscordMembers = useAction(api["discord/sync"].syncDiscordMembers);

  const handleExportEvaluations = (filters?: { tiers: string[]; statuses: string[] }) => {
    if (!evaluations?.evaluations || evaluations.evaluations.length === 0) {
      toast.error("No evaluations to export");
      return;
    }

    let filteredEvaluations = evaluations.evaluations;
    if (filters) {
      filteredEvaluations = evaluations.evaluations.filter((evaluation) => {
        const tierMatch = filters.tiers.includes(evaluation.tier);
        const statusMatch = filters.statuses.includes(evaluation.evaluationStatus);
        return tierMatch && statusMatch;
      });
    }

    if (filteredEvaluations.length === 0) {
      toast.error("No evaluations match the selected filters");
      return;
    }

    const headers = [
      "Player Name",
      "Discord Username",
      "Tier",
      "Events",
      "Holistic Score",
      "Placement Score",
      "Win Rate Score",
      "Kills Score",
      "Deaths Score",
      "Avg Placement",
      "Win Rate %",
      "Kills/Match",
      "Deaths/Match",
      "Power Score",
      "Avg PR per Event",
      "vs Tier %",
      "vs Above %",
      "vs Below %",
      "Evaluation Status",
    ];

    const rows = filteredEvaluations.map((p) => [
      p.playerName,
      p.discordUsername,
      p.tier,
      p.totalEvents,
      p.holisticScore.toFixed(1),
      p.placementScore.toFixed(1),
      p.winRateScore.toFixed(1),
      p.killsScore.toFixed(1),
      (p.deathsScore ?? 0).toFixed(1),
      p.avgPlacement.toFixed(1),
      p.winRate.toFixed(1),
      p.killsPerMatch.toFixed(1),
      (p.deathsPerMatch ?? 0).toFixed(1),
      p.finalPowerScore.toFixed(2),
      p.avgPRPerEvent.toFixed(2),
      (p.holisticVsSameTier ?? 0).toFixed(1),
      (p.promotionDiff ?? 0).toFixed(1),
      (p.demotionDiff ?? 0).toFixed(1),
      p.evaluationStatus,
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `player-evaluations-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredEvaluations.length} evaluations to CSV`);
  };

  const handleSyncDiscordMembers = async () => {
    setIsSyncingDiscordMembers(true);
    try {
      const result = await syncDiscordMembers();
      toast.success(
        `Discord sync complete: ${result.totalMembers} members processed, ${result.added} added, ${result.updated} updated, ${result.archived} archived`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync Discord members");
    } finally {
      setIsSyncingDiscordMembers(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Data Maintenance
          </CardTitle>
          <CardDescription className="text-xs">
            Bulk stat refresh, migrations, and destructive cleanup tools live on a separate page.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-3">
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/data-maintenance">
              Open Data Maintenance
              <ArrowRight className="ml-2 h-3 w-3" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Export Player Evaluations</CardTitle>
            <CardDescription className="text-xs">
              Export all player evaluation data to CSV
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button
              size="sm"
              onClick={() => setIsExportDialogOpen(true)}
              disabled={!evaluations || !evaluations.evaluations || evaluations.evaluations.length === 0}
            >
              <Download className="mr-2 h-3 w-3" />
              Export Evaluations
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Merge Duplicate Players</CardTitle>
            <CardDescription className="text-xs">
              Merge duplicate player records into a single record
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <Button size="sm" onClick={() => setIsMergeDialogOpen(true)}>
              <Users className="mr-2 h-3 w-3" />
              Merge Players
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-primary">
              <Zap className="h-4 w-4" />
              Relink Third Party Results
            </CardTitle>
            <CardDescription className="text-xs">
              Re-link tournament results. Use if player stats aren&apos;t showing after database changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <RelinkResultsButton />
          </CardContent>
        </Card>

      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Discord Tools</CardTitle>
          <CardDescription className="text-xs">
            Trigger Discord bot utilities for member and role data sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-3">
          <Button size="sm" variant="secondary" onClick={handleSyncDiscordMembers} disabled={isSyncingDiscordMembers}>
            {isSyncingDiscordMembers ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3 w-3" />
            )}
            Sync Discord Bot
          </Button>
        </CardContent>
      </Card>

      <TierSnapshotTool />
      <GoogleSheetsManager />

      <ExportOptionsDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onExport={handleExportEvaluations}
      />

      <MergePlayersDialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen} />
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <AdminPageLayout
      requireAdmin
      title="Features & Integrations"
      description="Exports, merges, Google Sheets, and utility tools"
    >
      <FeaturesContent />
    </AdminPageLayout>
  );
}
