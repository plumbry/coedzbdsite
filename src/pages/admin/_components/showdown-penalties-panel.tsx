import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ShowdownPenaltiesPanelProps = {
  eventId: Id<"events">;
  penaltyAmount: number;
};

export default function ShowdownPenaltiesPanel({
  eventId,
  penaltyAmount,
}: ShowdownPenaltiesPanelProps) {
  const participants = useQuery(api.events.showdownPenalties.getParticipantPlayers, {
    eventId,
  });
  const penalties = useQuery(api.events.showdownPenalties.getPenalties, { eventId });
  const addPenalty = useMutation(api.events.showdownPenalties.addPenalty);
  const updatePenalty = useMutation(api.events.showdownPenalties.updatePenalty);
  const removePenalty = useMutation(api.events.showdownPenalties.removePenalty);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  if (participants === undefined || penalties === undefined) {
    return <Skeleton className="h-32 w-full" />;
  }

  const handleAdd = async () => {
    if (!selectedPlayerId) {
      toast.error("Select a player");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a penalty reason");
      return;
    }

    setIsAdding(true);
    try {
      await addPenalty({
        eventId,
        playerId: selectedPlayerId as Id<"players">,
        reason: reason.trim(),
      });
      setReason("");
      toast.success("Penalty added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add penalty");
    } finally {
      setIsAdding(false);
    }
  };

  const toggleExclude = async (
    penaltyId: Id<"eventPenalties">,
    excluded: boolean,
  ) => {
    await updatePenalty({ penaltyId, excluded: !excluded });
    toast.success(excluded ? "Penalty included" : "Penalty excluded");
  };

  const handleRemove = async (penaltyId: Id<"eventPenalties">) => {
    if (!confirm("Remove this penalty?")) return;
    await removePenalty({ penaltyId });
    toast.success("Penalty removed");
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <Label className="text-sm font-medium">Penalties</Label>
        <span className="text-xs text-muted-foreground">
          Default −{penaltyAmount} pts each; deducted from best-weekly totals.
        </span>
      </div>

      {participants.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Import Yunite data first — players appear here after they have results on this event.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 min-w-[180px]">
            <Label className="text-xs">Player</Label>
            <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select player" />
              </SelectTrigger>
              <SelectContent>
                {participants.map((player) => (
                  <SelectItem key={player._id} value={player._id}>
                    {player.discordUsername}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Missed check-in"
            />
          </div>
          <Button type="button" size="sm" onClick={() => void handleAdd()} disabled={isAdding}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      )}

      {penalties.length > 0 && (
        <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Player</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Reason</th>
                <th className="text-center py-2 px-3 font-medium text-muted-foreground">Amt</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {penalties.map((penalty) => (
                <tr
                  key={penalty._id}
                  className={`border-b border-muted/30 ${penalty.excluded ? "opacity-50 line-through" : ""}`}
                >
                  <td className="py-1.5 px-3">{penalty.playerName}</td>
                  <td className="py-1.5 px-3">{penalty.reason}</td>
                  <td className="py-1.5 px-3 text-center text-destructive">−{penalty.amount}</td>
                  <td className="py-1.5 px-3 text-right space-x-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => void toggleExclude(penalty._id, penalty.excluded)}
                    >
                      {penalty.excluded ? "Include" : "Exclude"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive"
                      onClick={() => void handleRemove(penalty._id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
