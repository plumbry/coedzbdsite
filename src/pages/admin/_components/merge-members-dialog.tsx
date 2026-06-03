import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { Label } from "@/components/ui/label.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type MergePreviewPlayer = {
  _id: Id<"players">;
  discordUsername: string;
  epicUsername: string;
  discordUserId: string;
  nickname?: string;
  serverJoinDate: string;
  tier?: string;
  totalScore?: number;
  discordRoles?: Array<{ id: string; name: string }>;
  _creationTime: number;
  evaluation?: {
    totalScore: number;
    tier: string;
    gender?: number;
  } | null;
};

interface MergeMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: readonly [MergePreviewPlayer, MergePreviewPlayer];
  onMerged?: () => void;
}

const isPlaceholderId = (id: string) =>
  id.startsWith("placeholder_") || id === "imported";

function suggestSurviving(players: readonly [MergePreviewPlayer, MergePreviewPlayer]) {
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

function suggestProfileSource(players: readonly [MergePreviewPlayer, MergePreviewPlayer]) {
  const withRealId = players.filter((p) => !isPlaceholderId(p.discordUserId));
  if (withRealId.length === 1) return withRealId[0];
  return suggestSurviving(players);
}

function suggestEvaluationSource(players: readonly [MergePreviewPlayer, MergePreviewPlayer]) {
  const withEval = players.filter((p) => p.evaluation);
  if (withEval.length === 1) return withEval[0];
  if (withEval.length === 2) {
    return withEval.sort(
      (a, b) => (b.evaluation?.totalScore ?? 0) - (a.evaluation?.totalScore ?? 0),
    )[0];
  }
  const withTier = players.filter((p) => p.tier);
  if (withTier.length === 1) return withTier[0];
  return suggestSurviving(players);
}

function formatEvaluation(player: MergePreviewPlayer) {
  if (player.evaluation) {
    const gender =
      player.evaluation.gender === 50
        ? "Female"
        : player.evaluation.gender === 100
          ? "Male"
          : null;
    return `Tier ${player.evaluation.tier}, score ${player.evaluation.totalScore}${gender ? `, ${gender}` : ""}`;
  }
  if (player.tier) {
    return `Tier ${player.tier}${player.totalScore != null ? `, score ${player.totalScore}` : ""} (player record only)`;
  }
  return "No evaluation";
}

function formatProfile(player: MergePreviewPlayer) {
  const idLabel = isPlaceholderId(player.discordUserId) ? "placeholder ID" : player.discordUserId;
  return `${player.discordUsername} · ${player.epicUsername} · ${idLabel}`;
}

function AspectChoice({
  title,
  description,
  value,
  onValueChange,
  players,
  renderDetails,
}: {
  title: string;
  description: string;
  value: string;
  onValueChange: (id: string) => void;
  players: readonly [MergePreviewPlayer, MergePreviewPlayer];
  renderDetails: (player: MergePreviewPlayer) => string;
}) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <RadioGroup value={value} onValueChange={onValueChange} className="space-y-2">
        {players.map((player, index) => (
          <div
            key={player._id}
            className="flex items-start gap-3 rounded-md border p-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted/40"
          >
            <RadioGroupItem value={player._id} id={`${title}-${player._id}`} className="mt-0.5" />
            <label htmlFor={`${title}-${player._id}`} className="flex-1 cursor-pointer text-sm">
              <span className="font-medium">Record {index + 1}</span>
              <span className="block text-muted-foreground text-xs mt-0.5">
                {renderDetails(player)}
              </span>
            </label>
          </div>
        ))}
      </RadioGroup>
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
  const preview = useQuery(
    api.players.getPlayersMergePreview,
    open
      ? { playerIdA: players[0]._id, playerIdB: players[1]._id }
      : "skip",
  );

  const displayPlayers = useMemo((): readonly [MergePreviewPlayer, MergePreviewPlayer] | null => {
    if (!preview) return null;
    return [preview.a, preview.b];
  }, [preview]);

  const [survivingId, setSurvivingId] = useState<Id<"players">>(players[0]._id);
  const [profileSourceId, setProfileSourceId] = useState<Id<"players">>(players[0]._id);
  const [evaluationSourceId, setEvaluationSourceId] = useState<Id<"players">>(players[0]._id);
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    if (!open || !displayPlayers) return;
    const suggested = suggestSurviving(displayPlayers);
    setSurvivingId(suggested._id);
    setProfileSourceId(suggestProfileSource(displayPlayers)._id);
    setEvaluationSourceId(suggestEvaluationSource(displayPlayers)._id);
  }, [open, preview?.a._id, preview?.b._id]);

  const resolvedPlayers = displayPlayers ?? players;
  const profileSource =
    resolvedPlayers.find((p) => p._id === profileSourceId) ?? resolvedPlayers[0];
  const evaluationSource =
    resolvedPlayers.find((p) => p._id === evaluationSourceId) ?? resolvedPlayers[0];
  const removedPlayer =
    resolvedPlayers.find((p) => p._id !== survivingId) ?? resolvedPlayers[1];

  const handleMerge = async () => {
    const secondaryId = removedPlayer._id;
    setIsMerging(true);
    try {
      await mergePlayers({
        primaryPlayerId: survivingId,
        secondaryPlayerId: secondaryId,
        selections: {
          profilePlayerId: profileSourceId,
          evaluationPlayerId: evaluationSourceId,
        },
      });
      toast.success(
        `Merged ${removedPlayer.discordUsername} into ${resolvedPlayers.find((p) => p._id === survivingId)?.discordUsername}`,
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
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Members</DialogTitle>
          <DialogDescription>
            Choose which record survives and which fields to keep from each member. The other
            record is permanently deleted.
          </DialogDescription>
        </DialogHeader>

        {!displayPlayers ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 border rounded-md bg-amber-50 dark:bg-amber-950/20 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-amber-900 dark:text-amber-100">
                This cannot be undone. Tier history from the removed record is still copied to
                the surviving record.
              </p>
            </div>

            <AspectChoice
              title="Surviving record"
              description="The player row that remains in the database (all linked data stays on this ID)."
              value={survivingId}
              onValueChange={(id) => setSurvivingId(id as Id<"players">)}
              players={resolvedPlayers}
              renderDetails={(p) => formatProfile(p)}
            />

            <AspectChoice
              title="Profile & identity"
              description="Discord username, Epic name, Discord ID, social links, roles, and join date."
              value={profileSourceId}
              onValueChange={(id) => setProfileSourceId(id as Id<"players">)}
              players={resolvedPlayers}
              renderDetails={(p) => formatProfile(p)}
            />

            <AspectChoice
              title="Evaluation"
              description="Tier, holistic score, and manual evaluation (gender, category scores)."
              value={evaluationSourceId}
              onValueChange={(id) => setEvaluationSourceId(id as Id<"players">)}
              players={resolvedPlayers}
              renderDetails={(p) => formatEvaluation(p)}
            />

            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1.5">
              <p className="font-medium">Result preview</p>
              <p>
                <span className="text-muted-foreground">Profile:</span>{" "}
                {profileSource.discordUsername} / {profileSource.epicUsername}
              </p>
              <p>
                <span className="text-muted-foreground">Evaluation:</span>{" "}
                {formatEvaluation(evaluationSource)}
              </p>
              <p>
                <span className="text-muted-foreground">Removes:</span>{" "}
                {removedPlayer.discordUsername}
                {removedPlayer.tier && (
                  <Badge variant="outline" className="ml-1.5 text-[10px]">
                    was {removedPlayer.tier}
                  </Badge>
                )}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleMerge}
            disabled={isMerging || !displayPlayers}
          >
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
