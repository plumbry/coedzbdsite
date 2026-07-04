import { useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function PlayerTierExportCard() {
  const convex = useConvex();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await convex.query(api.playerTierExport.exportPlayersAndTierHistory, {});
      const filename = `player-tier-history-export-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${data.players.length} players and ${data.tierHistory.length} tier history records`,
      );
    } catch (error) {
      console.error("Player tier export error:", error);
      toast.error("Failed to export player and tier history data");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Export Players &amp; Tier History</CardTitle>
        <CardDescription className="text-xs">
          Download a JSON file of all players who have participated in at least one ZBD event,
          including their complete tier history.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-3">
        <Button size="sm" onClick={handleExport} disabled={isExporting}>
          <Download className="mr-2 h-3 w-3" />
          {isExporting ? "Exporting..." : "Download JSON Export"}
        </Button>
      </CardContent>
    </Card>
  );
}
