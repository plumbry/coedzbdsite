import { useState } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Download } from "lucide-react";
import { toast } from "sonner";

type ExportPlayer = {
  discordIds: string[];
  discordUsername: string;
  epicUsername: string;
  status: "active" | "former";
};

type ExportTierHistoryRecord = {
  discordIds: string[];
  previousTier?: string;
  newTier: string;
  date: string;
};

async function scanAllPages<T>(
  fetchPage: (cursor: string | null) => Promise<{
    continueCursor: string;
    isDone: boolean;
  } & T>,
  onPage: (page: T) => void,
) {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const page = await fetchPage(cursor);
    onPage(page);
    isDone = page.isDone;
    cursor = page.continueCursor;
  }
}

function mergeParticipantIds(...lists: Array<Array<Id<"players">>>): Id<"players">[] {
  const seen = new Set<string>();
  const merged: Id<"players">[] = [];
  for (const list of lists) {
    for (const playerId of list) {
      const key = playerId as string;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(playerId);
    }
  }
  return merged;
}

export default function PlayerTierExportCard() {
  const convex = useConvex();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in is required before exporting");
      return;
    }

    setIsExporting(true);
    try {
      const yuniteImportIds = await convex.query(api.playerTierExport.getYuniteImportIds, {});

      const eventParticipantIds: Id<"players">[] = [];
      await scanAllPages(
        (cursor) => convex.query(api.playerTierExport.scanEventResultsPage, { cursor }),
        (page) => {
          eventParticipantIds.push(...page.playerIds);
        },
      );

      const thirdPartyParticipantIds: Id<"players">[] = [];
      await scanAllPages(
        (cursor) =>
          convex.query(api.playerTierExport.scanThirdPartyResultsPage, {
            cursor,
            yuniteImportIds,
          }),
        (page) => {
          thirdPartyParticipantIds.push(...page.playerIds);
        },
      );

      const participantIds = mergeParticipantIds(
        eventParticipantIds,
        thirdPartyParticipantIds,
      );

      const players: ExportPlayer[] = [];
      const discordIdsByPlayerId = new Map<string, string[]>();
      for (let index = 0; index < participantIds.length; index += 200) {
        const batch = participantIds.slice(index, index + 200);
        const batchPlayers = await convex.query(api.playerTierExport.getPlayersExportBatch, {
          playerIds: batch,
        });
        for (const row of batchPlayers) {
          const { playerId, ...player } = row;
          players.push(player);
          if (player.discordIds.length > 0) {
            discordIdsByPlayerId.set(playerId as string, player.discordIds);
          }
        }
      }

      players.sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));

      const tierHistory: ExportTierHistoryRecord[] = [];
      await scanAllPages(
        (cursor) =>
          convex.query(api.playerTierExport.scanTierHistoryPage, {
            cursor,
            participantIds,
          }),
        (page) => {
          for (const record of page.records) {
            const discordIds = discordIdsByPlayerId.get(record.playerId as string);
            if (!discordIds || discordIds.length === 0) {
              continue;
            }
            tierHistory.push({
              discordIds,
              ...(record.previousTier ? { previousTier: record.previousTier } : {}),
              newTier: record.newTier,
              date: record.date,
            });
          }
        },
      );

      tierHistory.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return (a.discordIds[0] ?? "").localeCompare(b.discordIds[0] ?? "");
      });

      const data = { players, tierHistory };
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
      const message =
        error instanceof Error ? error.message : "Failed to export player and tier history data";
      toast.error(message);
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
        <Button
          size="sm"
          onClick={handleExport}
          disabled={isExporting || isAuthLoading || !isAuthenticated}
        >
          <Download className="mr-2 h-3 w-3" />
          {isExporting ? "Exporting..." : "Download JSON Export"}
        </Button>
      </CardContent>
    </Card>
  );
}
