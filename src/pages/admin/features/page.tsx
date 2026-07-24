import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Users, Zap, Wrench, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import MergePlayersDialog from "../_components/merge-players-dialog.tsx";
import ImportPlayersDialog from "../../_components/import-players-dialog.tsx";
import RelinkResultsButton from "../_components/relink-results-button.tsx";
import GoogleSheetsManager from "../_components/google-sheets-manager.tsx";
import TierSnapshotTool from "../_components/tier-snapshot-tool.tsx";
import AltAccountsTool from "../_components/alt-accounts-tool.tsx";
import PlayerTierExportCard from "../_components/player-tier-export-card.tsx";
import ZbdRawExportCard from "../_components/zbd-raw-export-card.tsx";
import { DiscordSyncTools } from "../_components/discord-sync-tools.tsx";

function FeaturesContent() {
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isImportPlayersDialogOpen, setIsImportPlayersDialogOpen] = useState(false);

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Import Player CSV</CardTitle>
          <CardDescription className="text-xs">
            Import player data from a CSV file.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-3">
          <Button size="sm" onClick={() => setIsImportPlayersDialogOpen(true)}>
            <Users className="mr-2 h-3 w-3" />
            Import Player CSV
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <ZbdRawExportCard />
        <PlayerTierExportCard />

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
              Relink Tournament Results
            </CardTitle>
            <CardDescription className="text-xs">
              Re-link Yunite and third-party CSV results to players. Use if profile stats are missing after database changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <RelinkResultsButton />
          </CardContent>
        </Card>

      </div>

      <DiscordSyncTools featured />

      <AltAccountsTool />

      <TierSnapshotTool />
      <GoogleSheetsManager />

      <MergePlayersDialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen} />
      <ImportPlayersDialog
        open={isImportPlayersDialogOpen}
        onOpenChange={setIsImportPlayersDialogOpen}
      />
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
