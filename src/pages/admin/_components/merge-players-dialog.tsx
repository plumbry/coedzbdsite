import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Users, AlertTriangle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

interface MergePlayersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MergePlayersDialog({
  open,
  onOpenChange,
}: MergePlayersDialogProps) {
  const duplicateGroups = useQuery(api.players.findPotentialDuplicates, {});
  const mergePlayers = useMutation(api.players.mergePlayers);
  const [mergingGroupIndex, setMergingGroupIndex] = useState<number | null>(null);

  const handleMergeGroup = async (
    primaryId: Id<"players">,
    secondaryId: Id<"players">,
    groupIndex: number
  ) => {
    setMergingGroupIndex(groupIndex);
    try {
      await mergePlayers({
        primaryPlayerId: primaryId,
        secondaryPlayerId: secondaryId,
      });
      toast.success("Players merged successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to merge players";
      toast.error(errorMessage);
    } finally {
      setMergingGroupIndex(null);
    }
  };

  const getDuplicateTypeLabel = (type: string) => {
    switch (type) {
      case "epic":
        return "Same Epic Username";
      case "discord":
        return "Same Discord Username";
      case "discordId":
        return "Same Discord ID";
      default:
        return "Duplicate";
    }
  };

  const isPlaceholder = (id: string) => id.startsWith("placeholder_");

  // Sort players: tier > real Discord ID > roles > creation time
  const getSuggestedPrimary = (players: Array<{
    _id: Id<"players">;
    discordUsername: string;
    epicUsername: string;
    discordUserId: string;
    tier?: string;
    discordRoles?: Array<{ id: string; name: string }>;
    _creationTime: number;
  }>) => {
    return [...players].sort((a, b) => {
      // Prioritize tiered players
      if (a.tier && !b.tier) return -1;
      if (!a.tier && b.tier) return 1;
      
      // Then prioritize real Discord IDs
      const aHasReal = !isPlaceholder(a.discordUserId);
      const bHasReal = !isPlaceholder(b.discordUserId);
      if (aHasReal && !bHasReal) return -1;
      if (!aHasReal && bHasReal) return 1;
      
      // Then by role count
      const aRoles = a.discordRoles?.length || 0;
      const bRoles = b.discordRoles?.length || 0;
      if (aRoles !== bRoles) return bRoles - aRoles;
      
      // Finally by creation time (oldest first)
      return a._creationTime - b._creationTime;
    })[0];
  };

  if (duplicateGroups === undefined) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Finding Duplicate Players...
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Potential Duplicate Players
          </DialogTitle>
          <DialogDescription>
            Review and merge duplicate player records. The suggested primary player (marked with ✓) will be kept.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        <div className="space-y-4">
          {duplicateGroups.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Check className="h-8 w-8" />
                </EmptyMedia>
                <EmptyTitle>No Duplicates Found</EmptyTitle>
                <EmptyDescription>
                  All player records appear to be unique.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="flex items-start gap-2 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 text-sm">
                <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    {duplicateGroups.length} duplicate group{duplicateGroups.length === 1 ? '' : 's'} found
                  </p>
                  <p className="text-blue-800 dark:text-blue-200 mt-1">
                    Review each group and merge duplicates. The player with ✓ will be kept as the primary record.
                  </p>
                </div>
              </div>

              {duplicateGroups.map((group, groupIndex) => {
                const suggestedPrimary = getSuggestedPrimary(group.players);
                const secondaryPlayers = group.players.filter(p => p._id !== suggestedPrimary._id);

                return (
                  <Card key={groupIndex} className="border-orange-200 dark:border-orange-900">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge variant="outline">{getDuplicateTypeLabel(group.type)}</Badge>
                          <span className="text-muted-foreground font-normal">
                            {group.key}
                          </span>
                        </CardTitle>
                        <Badge variant="secondary">
                          {group.players.length} records
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Suggested Primary */}
                      <div className="p-3 border rounded-md bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-900 dark:text-green-100">
                              Suggested Primary (Keep)
                            </span>
                          </div>
                          {suggestedPrimary.tier && (
                            <Badge variant="outline">Tier {suggestedPrimary.tier}</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Discord:</span>{" "}
                            {suggestedPrimary.discordUsername}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Epic:</span>{" "}
                            {suggestedPrimary.epicUsername}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Discord ID:</span>{" "}
                            <span className={isPlaceholder(suggestedPrimary.discordUserId) ? "text-orange-600" : ""}>
                              {isPlaceholder(suggestedPrimary.discordUserId) ? "Placeholder" : "Real"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Roles:</span>{" "}
                            {suggestedPrimary.discordRoles?.length || 0}
                          </div>
                        </div>
                      </div>

                      {/* Secondary Players */}
                      {secondaryPlayers.map((player) => (
                        <div
                          key={player._id}
                          className="p-3 border rounded-md bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <X className="h-4 w-4 text-red-600" />
                              <span className="text-sm font-medium text-red-900 dark:text-red-100">
                                Will be Removed
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {player.tier && (
                                <Badge variant="outline">Tier {player.tier}</Badge>
                              )}
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleMergeGroup(suggestedPrimary._id, player._id, groupIndex)}
                                disabled={mergingGroupIndex === groupIndex}
                              >
                                {mergingGroupIndex === groupIndex ? "Merging..." : "Merge Now"}
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Discord:</span>{" "}
                              {player.discordUsername}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Epic:</span>{" "}
                              {player.epicUsername}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Discord ID:</span>{" "}
                              <span className={isPlaceholder(player.discordUserId) ? "text-orange-600" : ""}>
                                {isPlaceholder(player.discordUserId) ? "Placeholder" : "Real"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Roles:</span>{" "}
                              {player.discordRoles?.length || 0}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
