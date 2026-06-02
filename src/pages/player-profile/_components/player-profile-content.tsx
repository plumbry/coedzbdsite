import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { ExternalLink, Activity, Gamepad2, Edit, RefreshCw } from "lucide-react";
import FemaleVerifiedBadge from "@/components/female-verified-badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { toast } from "sonner";
import AddEventDialog from "./add-event-dialog.tsx";
import EditPlayerDialog from "./edit-player-dialog.tsx";
import ZBDPerformanceTab from "./zbd-performance-tab.tsx";
import InGameStatsTab from "./ingame-stats-tab.tsx";
import ThirdPartiesTab from "./third-parties-tab.tsx";

interface PlayerProfileContentProps {
  playerId: Id<"players">;
}

export default function PlayerProfileContent({ playerId }: PlayerProfileContentProps) {
  const player = useQuery(api.players.getPlayerProfile, { id: playerId });
  const tierChange = useQuery(api.tierHistory.getLatestTierChange, { playerId });
  const { isAdmin, isModeratorOrAdmin } = useUserRole();
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isEditPlayerOpen, setIsEditPlayerOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("zbd");
  const syncPlayerMatchData = useAction(api.yunite.sync.syncPlayerMatchData);
  
  const handleSyncMatchData = async () => {
    setIsSyncing(true);
    try {
      const result = await syncPlayerMatchData({ playerId });
      
      if (result.synced > 0) {
        toast.success(
          `Successfully synced ${result.synced} tournament${result.synced === 1 ? "" : "s"}!`,
          {
            description: result.alreadySynced > 0 
              ? `${result.alreadySynced} already synced` 
              : undefined
          }
        );
      } else if (result.alreadySynced > 0) {
        toast.info("All tournaments already synced", {
          description: `${result.alreadySynced} tournament${result.alreadySynced === 1 ? "" : "s"} already have match data`
        });
      }
      
      if (result.failed > 0) {
        toast.error(`Failed to sync ${result.failed} tournament${result.failed === 1 ? "" : "s"}`, {
          description: result.errors.length > 0 ? result.errors[0].error : undefined
        });
      }
    } catch (error) {
      console.error("Failed to sync match data:", error);
      toast.error(error instanceof Error ? error.message : "Failed to sync match data");
    } finally {
      setIsSyncing(false);
    }
  };
  
  if (player === undefined || tierChange === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  if (!player) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">Player not found</h2>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Player Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-3xl">{player.discordUsername}</CardTitle>
                {player.tier && (
                  <Badge variant="default" className="text-xl font-bold px-4 py-1">
                    Tier {player.tier}
                  </Badge>
                )}
                {player.femaleVerified && (
                  <div className="flex items-center gap-2">
                    <FemaleVerifiedBadge />
                    {player.verificationMethod && (
                      <Badge variant="outline" className="text-xs">
                        {player.verificationMethod}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {player.nickname && (
                <CardDescription className="text-lg">
                  Nickname: "{player.nickname}"
                </CardDescription>
              )}
              {tierChange && tierChange.previousTier && (
                <div className="text-sm text-muted-foreground">
                  Previous Tier: <span className="font-semibold">{tierChange.previousTier}</span>
                  {" • "}
                  Changed: {tierChange.changedDate}
                </div>
              )}
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSyncMatchData}
                  disabled={isSyncing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Syncing..." : "Sync Match Data"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsEditPlayerOpen(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Player
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Epic Username:</span>
              <div className="font-medium">{player.epicUsername}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Discord ID:</span>
              <div className="font-mono text-xs">{player.discordUserId}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Server Join Date:</span>
              <div>{new Date(player.serverJoinDate).toLocaleDateString()}</div>
            </div>
          </div>
          
          {(player.twitterUsername || player.twitchUsername || player.youtubeUsername) && (
            <div className="flex gap-4 pt-4 border-t">
              {player.twitterUsername && (
                <a
                  href={`https://twitter.com/${player.twitterUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  Twitter <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {player.twitchUsername && (
                <a
                  href={`https://twitch.tv/${player.twitchUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  Twitch <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {player.youtubeUsername && (
                <a
                  href={`https://youtube.com/${player.youtubeUsername.startsWith('@') ? player.youtubeUsername : '@' + player.youtubeUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  YouTube <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          
          {isModeratorOrAdmin && player.adminComments && (
            <div className="pt-4 border-t">
              <div className="bg-muted p-3 rounded-lg">
                <div className="text-xs font-semibold text-muted-foreground mb-1">Admin Comments {isAdmin ? "(Admin Only)" : "(Moderator/Admin)"}</div>
                <div className="text-sm whitespace-pre-wrap">{player.adminComments}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Performance Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="zbd" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            ZBD Performance
          </TabsTrigger>
          <TabsTrigger value="ingame" className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" />
            Zero Build Stats
          </TabsTrigger>
          <TabsTrigger value="thirdparty" className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            3rd Parties
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="zbd">
          {activeTab === "zbd" && (
            <ZBDPerformanceTab
              playerId={playerId}
              onAddEvent={() => setIsAddEventOpen(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="ingame">
          {activeTab === "ingame" && (
            <InGameStatsTab epicUsername={player.epicUsername} />
          )}
        </TabsContent>

        <TabsContent value="thirdparty">
          {activeTab === "thirdparty" && (
            <ThirdPartiesTab playerId={playerId} />
          )}
        </TabsContent>
      </Tabs>
      
      {isAdmin && (
        <>
          <AddEventDialog
            open={isAddEventOpen}
            onOpenChange={setIsAddEventOpen}
            playerId={playerId}
          />
          <EditPlayerDialog
            player={player}
            open={isEditPlayerOpen}
            onOpenChange={setIsEditPlayerOpen}
          />
        </>
      )}
    </div>
  );
}
