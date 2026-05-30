import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Download, Calendar, Link2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function TierSnapshotTool() {
  const [leaderboardInput, setLeaderboardInput] = useState("");
  const [snapshotDate, setSnapshotDate] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryParams, setQueryParams] = useState<{
    leaderboardInputs: string[];
    snapshotDate: string;
  } | null>(null);

  const snapshotData = useQuery(
    api.tierSnapshot.getTierSnapshot,
    queryParams ?? "skip"
  );

  const handleSubmit = () => {
    if (!leaderboardInput.trim()) {
      toast.error("Please enter at least one leaderboard ID or URL");
      return;
    }
    if (!snapshotDate) {
      toast.error("Please select a date");
      return;
    }

    // Parse leaderboard inputs (one per line, or comma separated)
    const inputs = leaderboardInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (inputs.length === 0) {
      toast.error("No valid leaderboard IDs found");
      return;
    }

    setIsQuerying(true);
    setQueryParams({ leaderboardInputs: inputs, snapshotDate });
  };

  const handleDownloadCSV = () => {
    if (!snapshotData || snapshotData.players.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Epic Username",
      "Discord Username",
      "Tier on Date",
      "Current Tier",
    ];

    const rows = snapshotData.players.map((p) => [
      `"${p.epicUsername.replace(/"/g, '""')}"`,
      `"${(p.discordUsername ?? "").replace(/"/g, '""')}"`,
      p.tierOnDate,
      p.currentTier,
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tier-snapshot-${snapshotDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${snapshotData.players.length} players to CSV`);
  };

  // Reset query state when data arrives
  if (snapshotData && isQuerying) {
    setIsQuerying(false);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Tier Snapshot Export
        </CardTitle>
        <CardDescription className="text-xs">
          Generate a CSV showing player tiers on a specific date from given leaderboards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="leaderboard-ids" className="text-xs font-medium">
              Leaderboard IDs or URLs
            </Label>
            <Textarea
              id="leaderboard-ids"
              placeholder={"https://yunite.xyz/leaderboard/ABC-DEF\nhttps://yunite.xyz/leaderboard/GHI-JKL\nor just: ABC-DEF"}
              value={leaderboardInput}
              onChange={(e) => setLeaderboardInput(e.target.value)}
              rows={4}
              className="text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              One per line or comma-separated. Accepts full URLs or just IDs.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="snapshot-date" className="text-xs font-medium">
              Snapshot Date
            </Label>
            <Input
              id="snapshot-date"
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Returns each player's tier as of end-of-day on this date.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isQuerying || !leaderboardInput.trim() || !snapshotDate}
          >
            {isQuerying ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Link2 className="mr-2 h-3 w-3" />
                Find Players
              </>
            )}
          </Button>

          {snapshotData && snapshotData.players.length > 0 && (
            <Button size="sm" variant="secondary" onClick={handleDownloadCSV}>
              <Download className="mr-2 h-3 w-3" />
              Download CSV ({snapshotData.players.length} players)
            </Button>
          )}
        </div>

        {/* Results */}
        {snapshotData && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Found: <strong className="text-foreground">{snapshotData.totalFound}</strong> matched players</span>
              {snapshotData.unmatchedLeaderboards.length > 0 && (
                <span className="flex items-center gap-1 text-orange-600">
                  <AlertCircle className="h-3 w-3" />
                  {snapshotData.unmatchedLeaderboards.length} leaderboard(s) not found
                </span>
              )}
            </div>

            {snapshotData.unmatchedLeaderboards.length > 0 && (
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded p-2 text-xs">
                <p className="font-medium text-orange-700 dark:text-orange-400 mb-1">Unmatched leaderboards:</p>
                <ul className="list-disc list-inside text-orange-600 dark:text-orange-500">
                  {snapshotData.unmatchedLeaderboards.map((lb) => (
                    <li key={lb} className="font-mono">{lb}</li>
                  ))}
                </ul>
              </div>
            )}

            {snapshotData.players.length > 0 && (
              <div className="max-h-64 overflow-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Epic Username</th>
                      <th className="text-left p-2 font-medium">Discord</th>
                      <th className="text-left p-2 font-medium">Tier on {snapshotDate}</th>
                      <th className="text-left p-2 font-medium">Current Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotData.players.map((p) => (
                      <tr key={p.playerId} className="border-t">
                        <td className="p-2 font-mono">{p.epicUsername}</td>
                        <td className="p-2">{p.discordUsername ?? "—"}</td>
                        <td className="p-2">
                          <span className={p.tierOnDate === "Not tiered on this date" ? "text-muted-foreground italic" : "font-medium"}>
                            {p.tierOnDate}
                          </span>
                        </td>
                        <td className="p-2">{p.currentTier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
