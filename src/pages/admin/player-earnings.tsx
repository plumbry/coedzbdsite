import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { RefreshCw, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";

function PlayerEarningsContent() {
  const navigate = useNavigate();
  const [isRecalculating, setIsRecalculating] = useState(false);
  
  const playersWithEarnings = useQuery(api.playerEarnings.getAllPlayersWithEarnings);
  const recalculateAll = useMutation(api.playerEarnings.recalculateAllEarnings);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const result = await recalculateAll();
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to recalculate earnings");
    } finally {
      setIsRecalculating(false);
    }
  };

  const getEarningTypeBadge = (
    type: "placement" | "gamewinner" | "top2teams" | "top3teams" | "top5teams", 
    topN?: number
  ) => {
    if (type === "placement" && topN) {
      return <Badge variant="default" className="text-xs">Top {topN}</Badge>;
    }
    switch (type) {
      case "top2teams":
        return <Badge variant="default" className="text-xs bg-purple-600">Top 2</Badge>;
      case "top3teams":
        return <Badge variant="default" className="text-xs">Top 3</Badge>;
      case "top5teams":
        return <Badge variant="secondary" className="text-xs">Top 5</Badge>;
      case "gamewinner":
        return <Badge className="bg-amber-600 text-xs">Win</Badge>;
      default:
        return <Badge className="text-xs">{type}</Badge>;
    }
  };

  if (!playersWithEarnings) {
    return (
      <>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardDescription>
              Track which players have earned money in scrim events
            </CardDescription>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRecalculate}
              disabled={isRecalculating}
            >
              {isRecalculating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Recalculating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recalculate All
                </>
              )}
            </Button>
          </div>
          {playersWithEarnings.length > 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="font-medium">{playersWithEarnings.length}</span>
              <span>{playersWithEarnings.length === 1 ? 'player has' : 'players have'} earned</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {playersWithEarnings.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Trophy />
                </EmptyMedia>
                <EmptyTitle>No earnings tracked yet</EmptyTitle>
                <EmptyDescription>
                  Add earnings tracking to scrim events to see player earnings here
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Placements</TableHead>
                    <TableHead className="text-center">Wins</TableHead>
                    <TableHead>Recent Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playersWithEarnings.map((player) => (
                    <TableRow
                      key={player.playerId}
                      className={player.epicUsername !== "unknown" ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => {
                        if (player.epicUsername !== "unknown") {
                          navigate(`/player/${player.epicUsername}`);
                        }
                      }}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {player.playerName}
                            {player.epicUsername === "unknown" && (
                              <Badge variant="outline" className="ml-2 text-xs">Archived</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            @{player.discordUsername}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {player.totalEarnings}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {player.placementEarnings || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {player.gameWinnerEarnings || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {player.events.map((event, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              {getEarningTypeBadge(event.earningType, event.topN)}
                              <span className="text-xs text-muted-foreground">
                                {event.eventName.substring(0, 20)}
                                {event.eventName.length > 20 ? "..." : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">About Earnings Tracking</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Earnings are automatically calculated based on the earnings type set for each event:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Placement Earnings:</strong> Players whose team placed in the top N (e.g., Top 2, Top 3, Top 5, Top 10)</li>
            <li><strong>Season Events:</strong> Awards earnings to top N teams on cumulative leaderboard PLUS the top team from each individual week</li>
            <li><strong>Random Trios:</strong> Automatically awards earnings to top N duos from cumulative duo leaderboard AND top N solos from cumulative solo leaderboard (where N is the placement earnings value)</li>
            <li><strong>Game Winners:</strong> Players who won individual matches (1st place finishes)</li>
          </ul>
          <p className="mt-4">
            Click "Recalculate All" to update earnings for all events retroactively.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlayerEarnings() {
  return (
    <AdminPageLayout
      title="Player Earnings"
      description="Track which players have earned money in scrim events"
      authTitle="Sign in to access player earnings"
    >
      <PlayerEarningsContent />
    </AdminPageLayout>
  );
}
