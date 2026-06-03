import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { AlertTriangle, ArrowLeftRight, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

export type MergeMemberRecord = {
  _id: Id<"players">;
  discordUsername: string;
  epicUsername: string;
  discordUserId: string;
  tier?: string;
  discordRoles?: Array<{ id: string; name: string }>;
  _creationTime: number;
};

interface MergeMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: [MergeMemberRecord, MergeMemberRecord];
  onMerged?: () => void;
}

const isPlaceholderId = (id: string) =>
  id.startsWith("placeholder_") || id === "imported";

function suggestPrimary(players: [MergeMemberRecord, MergeMemberRecord]): MergeMemberRecord {
  return [...players].sort((a, b) => {
    if (a.tier && !b.tier) return -1;
    if (!a.tier && b.tier) return 1;
    const aHasReal = !isPlaceholderId(a.discordUserId);
    const bHasReal = !isPlaceholderId(b.discordUserId);
    if (aHasReal && !bHasReal) return -1;
    if (!aHasReal && bHasReal) return 1;
    const aRoles = a.discordRoles?.length || 0;
    const bRoles = b.discordRoles?.length || 0;
    if (aRoles !== bRoles) return bRoles - aRoles;
    return a._creationTime - b._creationTime;
  })[0];
}

function MemberPreview({
  player,
  variant,
}: {
  player: MergeMemberRecord;
  variant: "keep" | "remove";
}) {
  const isKeep = variant === "keep";
  return (
    <div
      className={
        isKeep
          ? "p-3 border rounded-md bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
          : "p-3 border rounded-md bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
      }
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {isKeep ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <X className="h-4 w-4 text-red-600" />
          )}
          <span
            className={`text-sm font-medium ${
              isKeep
                ? "text-green-900 dark:text-green-100"
                : "text-red-900 dark:text-red-100"
            }`}
          >
            {isKeep ? "Keep (primary)" : "Remove (merged into primary)"}
          </span>
        </div>
        {player.tier && <Badge variant="outline">Tier {player.tier}</Badge>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Discord:</span> {player.discordUsername}
        </div>
        <div>
          <span className="text-muted-foreground">Epic:</span> {player.epicUsername}
        </div>
        <div className="font-mono text-xs sm:col-span-2">
          <span className="text-muted-foreground">Discord ID:</span> {player.discordUserId}
        </div>
      </div>
    </div>
  );
}

export default function MergeMembersDialog({
  open,
  onOpenChange,
  players,
  onMerged,
}: MergeMembersDialogProps) {
  const mergePlayers = useMutation(api.players.mergePlayers);
  const [primaryId, setPrimaryId] = useState<Id<"players">>(() =>
    suggestPrimary(players)._id,
  );
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    if (open) {
      setPrimaryId(suggestPrimary(players)._id);
    }
  }, [open, players[0]._id, players[1]._id]);

  const primary = players.find((p) => p._id === primaryId) ?? players[0];
  const secondary = players.find((p) => p._id !== primaryId) ?? players[1];

  const handleSwap = () => {
    setPrimaryId(secondary._id);
  };

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await mergePlayers({
        primaryPlayerId: primary._id,
        secondaryPlayerId: secondary._id,
      });
      toast.success(
        `Merged ${secondary.discordUsername} into ${primary.discordUsername}`,
      );
      onOpenChange(false);
      onMerged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge members");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Merge Members</DialogTitle>
          <DialogDescription>
            Combine two member records into one. The primary record is kept; the other is
            permanently deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 border rounded-md bg-amber-50 dark:bg-amber-950/20 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-amber-900 dark:text-amber-100">
              This cannot be undone. Scores and tier history from the removed record are
              migrated when the primary record does not already have them.
            </p>
          </div>

          <MemberPreview player={primary} variant="keep" />
          <MemberPreview player={secondary} variant="remove" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={handleSwap}
          >
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Swap keep / remove
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleMerge} disabled={isMerging}>
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              "Merge Members"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
