import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";

export function LinkDiscordDialog({
  open,
  onOpenChange,
  userId,
  userLabel,
  initialDiscordUserId,
  initialDiscordUsername,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: Id<"users"> | null;
  userLabel: string;
  initialDiscordUserId?: string;
  initialDiscordUsername?: string;
}) {
  const setDiscordLink = useMutation(api.users.setDiscordLink);
  const [discordUserId, setDiscordUserId] = useState(initialDiscordUserId ?? "");
  const [discordUsername, setDiscordUsername] = useState(initialDiscordUsername ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDiscordUserId(initialDiscordUserId ?? "");
      setDiscordUsername(initialDiscordUsername ?? "");
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    if (!userId) return;
    setIsSaving(true);
    try {
      await setDiscordLink({
        userId,
        discordUserId: discordUserId.trim(),
        discordUsername: discordUsername.trim() || undefined,
      });
      toast.success(`Linked Discord for ${userLabel}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to link Discord account",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Discord</DialogTitle>
          <DialogDescription>
            Attach a Discord snowflake to {userLabel} so they can claim a Summer Slam
            passport. Use the Discord ID from Member Management.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="discord-snowflake">Discord user ID</Label>
            <Input
              id="discord-snowflake"
              className="font-mono"
              placeholder="480513730455666717"
              value={discordUserId}
              onChange={(event) => setDiscordUserId(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discord-username">Discord username (optional)</Label>
            <Input
              id="discord-username"
              placeholder="zygaah"
              value={discordUsername}
              onChange={(event) => setDiscordUsername(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving || !discordUserId.trim()}>
            {isSaving ? "Saving…" : "Save link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
