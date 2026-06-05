import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_SPREADSHEET_ID = "1uOlY8PsM4jVyIIlQQ5IYxSdQvjYVcl1_F67DrpRQOqI";

export default function GoogleSheetsManager() {
  const exportPlayersToSheets = useAction(api.googleSheets.exportPlayersToSheets);
  const exportArchivedPlayersToSheets = useAction(api.googleSheets.exportArchivedPlayersToSheets);
  const exportRejectedPlayersToSheets = useAction(api.googleSheets.exportRejectedPlayersToSheets);
  const exportReEvaluationsToSheets = useAction(api.googleSheets.exportReEvaluationsToSheets);
  const exportHolisticScoresToSheets = useAction(api.googleSheets.exportHolisticScoresToSheets);
  const exportAllToSheets = useAction(api.googleSheets.exportAllToSheets);
  const importApplicationsFromSheets = useAction(api.googleSheets.importApplicationsFromSheets);
  const updatePlayersFromSheets = useAction(api.googleSheets.updatePlayersFromSheets);
  const checkApplicationStatus = useAction(api.googleSheets.checkApplicationStatus);
  const [spreadsheetId, setSpreadsheetId] = useState(DEFAULT_SPREADSHEET_ID);
  const [isExportingPlayers, setIsExportingPlayers] = useState(false);
  const [isExportingArchivedPlayers, setIsExportingArchivedPlayers] = useState(false);
  const [isExportingRejectedPlayers, setIsExportingRejectedPlayers] = useState(false);
  const [isExportingReEvaluations, setIsExportingReEvaluations] = useState(false);
  const [isExportingHolisticScores, setIsExportingHolisticScores] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isImportingApplications, setIsImportingApplications] = useState(false);
  const [isUpdatingPlayers, setIsUpdatingPlayers] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const handleExportPlayers = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsExportingPlayers(true);
    try {
      const result = await exportPlayersToSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      toast.success(
        `Exported ${result.playersExported} players to Google Sheets!`,
        { duration: 5000 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Export failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsExportingPlayers(false);
    }
  };

  const handleExportArchivedPlayers = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsExportingArchivedPlayers(true);
    try {
      const result = await exportArchivedPlayersToSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      toast.success(
        `Exported ${result.playersExported} archived players to Google Sheets!`,
        { duration: 5000 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Export failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsExportingArchivedPlayers(false);
    }
  };

  const handleExportRejectedPlayers = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsExportingRejectedPlayers(true);
    try {
      const result = await exportRejectedPlayersToSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      toast.success(
        `Exported ${result.playersExported} rejected players to Google Sheets!`,
        { duration: 5000 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Export failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsExportingRejectedPlayers(false);
    }
  };

  const handleExportReEvaluations = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsExportingReEvaluations(true);
    try {
      const result = await exportReEvaluationsToSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      toast.success(
        `Exported ${result.playersExported} tier re-evaluations to Google Sheets!`,
        { duration: 5000 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Export failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsExportingReEvaluations(false);
    }
  };

  const handleExportHolisticScores = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsExportingHolisticScores(true);
    try {
      const result = await exportHolisticScoresToSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      toast.success(
        `Exported ${result.playersExported} holistic scores to Google Sheets!`,
        { duration: 5000 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Export failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsExportingHolisticScores(false);
    }
  };

  const handleExportAll = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsExportingAll(true);
    try {
      const result = await exportAllToSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      if (result.success) {
        const totalExported = 
          (result.results.players?.playersExported || 0) +
          (result.results.archived?.playersExported || 0) +
          (result.results.rejected?.playersExported || 0) +
          (result.results.reEvaluations?.playersExported || 0) +
          (result.results.holisticScores?.playersExported || 0);
        
        toast.success(
          `Successfully exported all data! Total: ${totalExported} records across 5 sheets.`,
          { duration: 7000 }
        );
      } else {
        const successCount = Object.keys(result.results).length;
        toast.warning(
          `Export completed with ${result.errors.length} error(s). ${successCount} of 5 sheets exported successfully.`,
          { duration: 7000 }
        );
        console.warn("Export errors:", result.errors);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Export all failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleImportApplications = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsImportingApplications(true);
    try {
      const result = await importApplicationsFromSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      let message = `Imported ${result.playersImported} new players`;
      if (result.playersUpdated > 0) {
        message += `, updated ${result.playersUpdated} existing players`;
      }
      if (result.errors.length > 0) {
        message += `. ${result.errors.length} errors occurred`;
      }
      
      toast.success(message, { duration: 7000 });
      
      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
        toast.info("Check console for error details", { duration: 5000 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Import failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsImportingApplications(false);
    }
  };

  const handleUpdatePlayers = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsUpdatingPlayers(true);
    try {
      const result = await updatePlayersFromSheets({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      let message = `Updated ${result.playersUpdated} players`;
      if (result.errors.length > 0) {
        message += `. ${result.errors.length} errors occurred`;
      }
      
      toast.success(message, { duration: 7000 });
      
      if (result.errors.length > 0) {
        console.warn("Update errors:", result.errors);
        toast.info("Check console for error details", { duration: 5000 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Update failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsUpdatingPlayers(false);
    }
  };

  const handleCheckApplicationStatus = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a Spreadsheet ID");
      return;
    }
    
    setIsCheckingStatus(true);
    try {
      const result = await checkApplicationStatus({
        spreadsheetId: spreadsheetId.trim(),
      });
      
      toast.success(
        `Checked ${result.totalChecked} players: ${result.accepted} accepted (in server), ${result.notInServer} not in server. "Server Status" column updated in your sheet!`,
        { duration: 10000 }
      );
      
      if (result.errors.length > 0) {
        console.warn("Check status errors:", result.errors);
        toast.info("Check console for error details", { duration: 5000 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Check failed: ${errorMessage}`, { duration: 7000 });
      console.error(error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          <CardTitle className="text-sm">Google Sheets Integration</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Export player data or import applications from your Google Sheet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 py-3">
        <div className="space-y-2">
          <Label htmlFor="spreadsheetId">Spreadsheet ID</Label>
          <Input
            id="spreadsheetId"
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Find this in your Google Sheets URL: docs.google.com/spreadsheets/d/<span className="font-mono font-semibold">SPREADSHEET_ID</span>/edit
          </p>
        </div>
        
        <div className="space-y-3 pt-2 border-t">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-medium">Import Players</h3>
                <p className="text-xs text-muted-foreground">
                  Reads from "Applications" sheet. Only imports rows with Status = "Accepted" or "Rejected". Skips rows with no status.
                </p>
              </div>
              <Button
                onClick={handleImportApplications}
                disabled={isImportingApplications || !spreadsheetId.trim()}
                variant="secondary"
                size="sm"
              >
                {isImportingApplications ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
          
          <div className="pt-1.5 border-t">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-medium">Check Application Status</h3>
                <p className="text-xs text-muted-foreground">
                  Cross-references "Applications" sheet with Discord members. Adds a "Server Status" column showing who's accepted (in server) vs not.
                </p>
              </div>
              <Button
                onClick={handleCheckApplicationStatus}
                disabled={isCheckingStatus || !spreadsheetId.trim()}
                variant="secondary"
                size="sm"
              >
                {isCheckingStatus ? "Checking..." : "Check Status"}
              </Button>
            </div>
          </div>
          
          <div className="pt-1.5 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-medium">Update Players</h3>
                <p className="text-xs text-muted-foreground">
                  Updates scores and status from "Players" sheet. Note: Tier columns are read-only
                </p>
              </div>
              <Button
                onClick={handleUpdatePlayers}
                disabled={isUpdatingPlayers || !spreadsheetId.trim()}
                variant="secondary"
                size="sm"
              >
                {isUpdatingPlayers ? "Updating..." : "Update"}
              </Button>
            </div>
          </div>
          
          <div className="pt-1.5 border-t">
            <div className="mb-1.5">
              <h3 className="text-xs font-medium">Export Data</h3>
              <p className="text-xs text-muted-foreground">
                Export player data to Google Sheets (Players, Archived, Rejected, Re-Evaluations, Holistic Scores)
              </p>
            </div>
            <div className="space-y-2">
              <Button
                onClick={handleExportAll}
                disabled={isExportingAll || !spreadsheetId.trim()}
                size="lg"
                className="w-full"
              >
                {isExportingAll ? "Exporting All..." : "Export All Data"}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportPlayers}
                  disabled={isExportingPlayers || isExportingAll || !spreadsheetId.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  {isExportingPlayers ? "Exporting..." : "Export Players"}
                </Button>
                <Button
                  onClick={handleExportReEvaluations}
                  disabled={isExportingReEvaluations || isExportingAll || !spreadsheetId.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  {isExportingReEvaluations ? "Exporting..." : "Export Re-Evaluations"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportHolisticScores}
                  disabled={isExportingHolisticScores || isExportingAll || !spreadsheetId.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  {isExportingHolisticScores ? "Exporting..." : "Export Holistic Scores"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportArchivedPlayers}
                  disabled={isExportingArchivedPlayers || isExportingAll || !spreadsheetId.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  {isExportingArchivedPlayers ? "Exporting..." : "Export Archived"}
                </Button>
                <Button
                  onClick={handleExportRejectedPlayers}
                  disabled={isExportingRejectedPlayers || isExportingAll || !spreadsheetId.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  {isExportingRejectedPlayers ? "Exporting..." : "Export Rejected"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
