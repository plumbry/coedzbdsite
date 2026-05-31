import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { CrosshairIcon, SkullIcon, TargetIcon } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export function TierBadge({ tier }: { tier: string | undefined }) {
  const tierColors: Record<string, string> = {
    S: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    A: "bg-red-500/20 text-red-400 border-red-500/30",
    B: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    C: "bg-green-500/20 text-green-400 border-green-500/30",
    D: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  if (!tier) {
    return <Badge variant="outline" className="text-muted-foreground">?</Badge>;
  }

  return (
    <Badge variant="outline" className={cn("font-bold", tierColors[tier] || "")}>
      {tier}
    </Badge>
  );
}

export function TierDiffBadge({ diff }: { diff: number }) {
  if (diff === 0) return null;

  const isUpset = diff > 0;
  const diffText = diff > 0 ? `+${diff}` : `${diff}`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "ml-2 font-mono",
        isUpset
          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
          : "bg-gray-500/20 text-gray-400",
      )}
    >
      {diffText}
    </Badge>
  );
}

export default function PlayerKillsDialog({
  playerId,
  open,
  onOpenChange,
}: {
  playerId: Id<"players"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const playerKills = useQuery(
    api.upsetKills.getAllPlayerKills,
    playerId ? { playerId, paginationOpts: { numItems: 100, cursor: null } } : "skip",
  );

  const isLoading = !playerKills;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CrosshairIcon className="h-5 w-5" />
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <>
                {playerKills.playerName}
                <TierBadge tier={playerKills.playerTier} />
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <DialogBody>
            <div className="space-y-4 py-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          </DialogBody>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-3 py-2 border-b shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{playerKills.stats.totalKills}</p>
                <p className="text-xs text-muted-foreground">Kills</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{playerKills.stats.totalDeaths}</p>
                <p className="text-xs text-muted-foreground">Deaths</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{playerKills.stats.kdRatio}</p>
                <p className="text-xs text-muted-foreground">K/D</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-500">{playerKills.stats.upsetKills}</p>
                <p className="text-xs text-muted-foreground">Upset Kills</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-500">{playerKills.stats.upsetDeaths}</p>
                <p className="text-xs text-muted-foreground">Upset Deaths</p>
              </div>
            </div>

            <DialogBody className="flex-1 min-h-0 flex flex-col">
              <Tabs defaultValue="kills" className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-2 shrink-0">
                  <TabsTrigger value="kills" className="gap-2">
                    <TargetIcon className="h-4 w-4" />
                    Kills ({playerKills.kills.length})
                  </TabsTrigger>
                  <TabsTrigger value="deaths" className="gap-2">
                    <SkullIcon className="h-4 w-4" />
                    Deaths ({playerKills.deaths.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="kills" className="flex-1 min-h-0 overflow-auto mt-4">
                  {playerKills.kills.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No kills recorded</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Victim</TableHead>
                          <TableHead>Tier</TableHead>
                          <TableHead>Weapon</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead className="text-right">Upset</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {playerKills.kills.map((kill) => (
                          <TableRow
                            key={kill._id}
                            className={cn(kill.isUpset && "bg-amber-500/5")}
                          >
                            <TableCell>
                              {kill.opponentPlayerId ? (
                                <Link
                                  to={`/player-profile/${kill.opponentPlayerId}`}
                                  className="text-primary hover:underline font-medium"
                                  onClick={() => onOpenChange(false)}
                                >
                                  {kill.opponentName}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">{kill.opponentName}</span>
                              )}
                            </TableCell>
                            <TableCell><TierBadge tier={kill.opponentTier} /></TableCell>
                            <TableCell className="text-muted-foreground text-sm">{kill.weapon || "-"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                              {kill.eventName}
                            </TableCell>
                            <TableCell className="text-right">
                              {kill.isUpset ? (
                                <TierDiffBadge diff={kill.tierDifference} />
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="deaths" className="flex-1 min-h-0 overflow-auto mt-4">
                  {playerKills.deaths.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No deaths recorded</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Killed By</TableHead>
                          <TableHead>Tier</TableHead>
                          <TableHead>Weapon</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead className="text-right">Upset</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {playerKills.deaths.map((death) => (
                          <TableRow
                            key={death._id}
                            className={cn(death.isUpset && "bg-red-500/5")}
                          >
                            <TableCell>
                              {death.opponentPlayerId ? (
                                <Link
                                  to={`/player-profile/${death.opponentPlayerId}`}
                                  className="text-primary hover:underline font-medium"
                                  onClick={() => onOpenChange(false)}
                                >
                                  {death.opponentName}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">{death.opponentName}</span>
                              )}
                            </TableCell>
                            <TableCell><TierBadge tier={death.opponentTier} /></TableCell>
                            <TableCell className="text-muted-foreground text-sm">{death.weapon || "-"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                              {death.eventName}
                            </TableCell>
                            <TableCell className="text-right">
                              {death.isUpset ? (
                                <TierDiffBadge diff={death.tierDifference} />
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </DialogBody>

            {playerId && (
              <div className="pt-3 border-t flex justify-end shrink-0">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/player-profile/${playerId}`} onClick={() => onOpenChange(false)}>
                    View Full Profile
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
