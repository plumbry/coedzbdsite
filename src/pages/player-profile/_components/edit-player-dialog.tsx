import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  EditPlayerFormFields,
  type EditPlayerFormValues,
} from "@/components/edit-player-form-fields.tsx";

interface Player {
  _id: Id<"players">;
  discordUsername: string;
  nickname?: string;
  discordUserId: string;
  serverJoinDate: string;
  epicUsername: string;
  twitterUsername?: string;
  twitchUsername?: string;
  youtubeUsername?: string;
  adminComments?: string;
}

interface EditPlayerDialogProps {
  player: Player;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyValues: EditPlayerFormValues = {
  discordUsername: "",
  nickname: "",
  epicUsername: "",
  epicId: "",
  twitterUsername: "",
  twitchUsername: "",
  youtubeUsername: "",
  adminComments: "",
  discordUserId: "",
  serverJoinDate: "",
};

export default function EditPlayerDialog({ player, open, onOpenChange }: EditPlayerDialogProps) {
  const [values, setValues] = useState<EditPlayerFormValues>(emptyValues);
  const [isSaving, setIsSaving] = useState(false);

  const updatePlayer = useMutation(api.players.updatePlayer);

  useEffect(() => {
    setValues({
      discordUsername: player.discordUsername,
      nickname: player.nickname || "",
      epicUsername: player.epicUsername,
      epicId: "",
      twitterUsername: player.twitterUsername || "",
      twitchUsername: player.twitchUsername || "",
      youtubeUsername: player.youtubeUsername || "",
      adminComments: player.adminComments || "",
      discordUserId: player.discordUserId,
      serverJoinDate: player.serverJoinDate,
    });
  }, [player]);

  const handleFieldChange = (field: keyof EditPlayerFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!values.discordUsername.trim() || !values.epicUsername.trim() || !values.discordUserId.trim()) {
      toast.error("Discord Username, Epic Username, and Discord User ID are required");
      return;
    }

    setIsSaving(true);
    try {
      await updatePlayer({
        playerId: player._id,
        discordUsername: values.discordUsername.trim(),
        nickname: values.nickname.trim() || undefined,
        discordUserId: values.discordUserId.trim(),
        serverJoinDate: values.serverJoinDate,
        epicUsername: values.epicUsername.trim(),
        twitterUsername: values.twitterUsername.trim() || undefined,
        twitchUsername: values.twitchUsername.trim() || undefined,
        youtubeUsername: values.youtubeUsername.trim() || undefined,
        adminComments: values.adminComments.trim() || undefined,
      });

      toast.success("Player updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update player");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit Player</DialogTitle>
          <DialogDescription>
            Update player information and social media links
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <EditPlayerFormFields
            values={values}
            onChange={handleFieldChange}
            showDiscordUserId
            showServerJoinDate
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
