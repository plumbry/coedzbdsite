import { useState } from "react";
import { useQuery, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Download, Database, HardDrive, CheckCircle2 } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import RoleGate from "@/components/role-gate.tsx";
import { toast } from "sonner";

function DataBackupContent() {
  const { isAdmin } = useUserRole();
  const convex = useConvex();
  const smallTables = useQuery(api.dataBackup.getBackupSummarySmallTables, {});
  const resultsCount = useQuery(api.dataBackup.getBackupResultsCount, {});
  const matchStatsCount = useQuery(api.dataBackup.getBackupMatchStatsCount, {});
  const eventResultsCount = useQuery(api.dataBackup.getBackupEventResultsCount, {});
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  if (isAdmin === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!isAdmin) {
    return (
      <RoleGate
        allowed={false}
        description="This page is only accessible to administrators."
      />
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const createAndDownloadBackup = async (backupType: "full" | "players" | "events" | "results") => {
    setIsCreatingBackup(true);
    try {
      let data;
      let filename;
      
      switch (backupType) {
        case "full":
          data = await convex.query(api.dataBackup.createFullBackup, {});
          filename = `full-backup-${Date.now()}.json`;
          break;
        case "players":
          data = await convex.query(api.dataBackup.createPlayerBackup, {});
          filename = `players-backup-${Date.now()}.json`;
          break;
        case "events":
          data = await convex.query(api.dataBackup.createEventsBackup, {});
          filename = `events-backup-${Date.now()}.json`;
          break;
        case "results":
          data = await convex.query(api.dataBackup.createResultsBackup, {});
          filename = `results-backup-${Date.now()}.json`;
          break;
      }
      
      // Create blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Backup downloaded: ${filename}`);
    } catch (error) {
      console.error("Backup error:", error);
      toast.error("Failed to create backup. Check console for details.");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  return (
    <div className="space-y-4">
      {smallTables === undefined || resultsCount === undefined || matchStatsCount === undefined || eventResultsCount === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Backup Summary</CardTitle>
              <CardDescription>
                Overview of all data available for backup
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Players</div>
                  <div className="text-2xl font-bold">{smallTables.counts.players}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(smallTables.sizes.players)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Events</div>
                  <div className="text-2xl font-bold">{smallTables.counts.events}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(smallTables.sizes.events)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Imports</div>
                  <div className="text-2xl font-bold">{smallTables.counts.imports}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(smallTables.sizes.imports)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Results</div>
                  <div className="text-2xl font-bold">{resultsCount.count}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(resultsCount.size)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Match Stats</div>
                  <div className="text-2xl font-bold">{matchStatsCount.count}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(matchStatsCount.size)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Event Results</div>
                  <div className="text-2xl font-bold">{eventResultsCount.count}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(eventResultsCount.size)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Aggregate Stats</div>
                  <div className="text-2xl font-bold">{smallTables.counts.aggregateStatsCache}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(smallTables.sizes.aggregateStatsCache)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Holistic Scores</div>
                  <div className="text-2xl font-bold">{smallTables.counts.tierReEvaluationCache}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(smallTables.sizes.tierReEvaluationCache)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Tier Medians</div>
                  <div className="text-2xl font-bold">{smallTables.counts.tierMediansCache}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(smallTables.sizes.tierMediansCache)}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Backup Size</span>
                  <span className="text-lg font-bold">{formatBytes(
                    smallTables.sizes.players + smallTables.sizes.events + smallTables.sizes.imports +
                    resultsCount.size + matchStatsCount.size + eventResultsCount.size +
                    smallTables.sizes.aggregateStatsCache + smallTables.sizes.tierReEvaluationCache + smallTables.sizes.tierMediansCache
                  )}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Full Backup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Full Backup
              </CardTitle>
              <CardDescription>
                Export all data including players, events, results, and match statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Includes:</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      All player data with cached holistic scores, TC, DCA, and Top 5 flags
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      All events with leaderboard data
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      All tournament imports and results
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      All match-level statistics
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Sync status and timestamps
                    </li>
                  </ul>
                </div>
                <Button
                  onClick={() => createAndDownloadBackup("full")}
                  disabled={isCreatingBackup}
                  className="w-full"
                  size="lg"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isCreatingBackup ? "Creating Backup..." : "Download Full Backup"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Partial Backups */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Players Backup */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Players Only</CardTitle>
                <CardDescription className="text-sm">
                  All player data and cached stats
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {smallTables.counts.players} players ({formatBytes(smallTables.sizes.players)})
                  </div>
                  <Button
                    onClick={() => createAndDownloadBackup("players")}
                    disabled={isCreatingBackup}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Events Backup */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Events Only</CardTitle>
                <CardDescription className="text-sm">
                  All events and leaderboards
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {smallTables.counts.events} events ({formatBytes(smallTables.sizes.events)})
                  </div>
                  <Button
                    onClick={() => createAndDownloadBackup("events")}
                    disabled={isCreatingBackup}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results Backup */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Results & Stats</CardTitle>
                <CardDescription className="text-sm">
                  All tournament results and match data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {smallTables.counts.imports + resultsCount.count + matchStatsCount.count} records
                  </div>
                  <Button
                    onClick={() => createAndDownloadBackup("results")}
                    disabled={isCreatingBackup}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">💡 Backup Best Practices</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Create backups regularly (weekly recommended)</li>
                <li>• Store backups in multiple locations (local drive, cloud storage)</li>
                <li>• Keep at least 3 recent backups in case of corruption</li>
                <li>• Test restore process periodically to ensure backups are valid</li>
                <li>• Backups are in JSON format and can be imported back into Convex if needed</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function DataBackup() {
  return (
    <AdminPageLayout requireAdmin
      title="Data Backup"
      description="Export your cached data to JSON files for safekeeping"
      authTitle="Sign in to access data backups"
    >
      <DataBackupContent />
    </AdminPageLayout>
  );
}
