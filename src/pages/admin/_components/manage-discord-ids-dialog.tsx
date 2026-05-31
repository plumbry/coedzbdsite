import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Link, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

interface ManageDiscordIdsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: Id<"players">;
  primaryDiscordId: string;
  alternateDiscordIds?: string[];
  playerName: string;
}

export default function ManageDiscordIdsDialog({
  open,
  onOpenChange,
  playerId,
  primaryDiscordId,
  alternateDiscordIds = [],
  playerName,
}: ManageDiscordIdsDialogProps) {
  const [newDiscordId, setNewDiscordId] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const addAlternate = useMutation(api.discord.addAlternateDiscordId);
  const removeAlternate = useMutation(api.discord.removeAlternateDiscordId);
  const setPrimary = useMutation(api.discord.setAlternateAsPrimary);

  const handleAddAlternate = async () => {
    if (!newDiscordId.trim()) {
      toast.error("Please enter a Discord ID");
      return;
    }

    setIsAdding(true);
    try {
      await addAlternate({
        playerId,
        newDiscordUserId: newDiscordId.trim(),
      });
      toast.success("Discord ID added successfully");
      setNewDiscordId("");
    } catch (error) {
      console.error("Error adding Discord ID:", error);
      const message = error instanceof Error ? error.message : "Failed to add Discord ID";
      toast.error(message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveAlternate = async (discordId: string) => {
    try {
      await removeAlternate({
        playerId,
        discordUserId: discordId,
      });
      toast.success("Discord ID removed");
    } catch (error) {
      console.error("Error removing Discord ID:", error);
      toast.error("Failed to remove Discord ID");
    }
  };

  const handleSetPrimary = async (discordId: string) => {
    try {
      await setPrimary({
        playerId,
        alternateDiscordUserId: discordId,
      });
      toast.success("Primary Discord ID updated");
    } catch (error) {
      console.error("Error setting primary:", error);
      toast.error("Failed to set as primary");
    }
  };

  const totalIds = 1 + alternateDiscordIds.length;
  const canAddMore = totalIds < 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Manage Discord IDs
          </DialogTitle>
          <DialogDescription>
            Manage linked Discord IDs for <strong>{playerName}</strong>. Players can have up to 3 Discord IDs.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Primary Discord ID */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Primary Discord ID</Label>
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <span className="font-mono text-sm">{primaryDiscordId}</span>
                <Badge variant="default" className="text-xs">Primary</Badge>
              </div>
            </div>
          </div>

          {/* Alternate Discord IDs */}
          {alternateDiscordIds.length > 0 && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Alternate Discord IDs</Label>
              <div className="space-y-2">
                {alternateDiscordIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between p-3 rounded-md border"
                  >
                    <span className="font-mono text-sm">{id}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetPrimary(id)}
                        className="text-xs"
                      >
                        <Star className="h-3.5 w-3.5 mr-1" />
                        Set as Primary
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAlternate(id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Discord ID */}
          {canAddMore && (
            <div>
              <Label htmlFor="newDiscordId" className="text-sm font-semibold mb-2 block">
                Add New Discord ID
              </Label>
              <div className="flex gap-2">
                <Input
                  id="newDiscordId"
                  placeholder="Enter Discord ID..."
                  value={newDiscordId}
                  onChange={(e) => setNewDiscordId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddAlternate();
                    }
                  }}
                />
                <Button
                  onClick={handleAddAlternate}
                  disabled={isAdding || !newDiscordId.trim()}
                >
                  {isAdding ? "Adding..." : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {totalIds} of 3 Discord IDs used
              </p>
            </div>
          )}

          {!canAddMore && (
            <div className="p-3 rounded-md bg-muted/50 border">
              <p className="text-sm text-muted-foreground">
                Maximum of 3 Discord IDs reached. Remove an alternate ID to add a new one.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
