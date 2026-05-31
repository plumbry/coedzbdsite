import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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

export default function EditPlayerDialog({ player, open, onOpenChange }: EditPlayerDialogProps) {
  const [discordUsername, setDiscordUsername] = useState(player.discordUsername);
  const [nickname, setNickname] = useState(player.nickname || "");
  const [discordUserId, setDiscordUserId] = useState(player.discordUserId);
  const [serverJoinDate, setServerJoinDate] = useState(player.serverJoinDate);
  const [epicUsername, setEpicUsername] = useState(player.epicUsername);
  const [twitterUsername, setTwitterUsername] = useState(player.twitterUsername || "");
  const [twitchUsername, setTwitchUsername] = useState(player.twitchUsername || "");
  const [youtubeUsername, setYoutubeUsername] = useState(player.youtubeUsername || "");
  const [adminComments, setAdminComments] = useState(player.adminComments || "");
  const [isSaving, setIsSaving] = useState(false);

  const updatePlayer = useMutation(api.players.updatePlayer);

  // Reset form when player changes
  useEffect(() => {
    setDiscordUsername(player.discordUsername);
    setNickname(player.nickname || "");
    setDiscordUserId(player.discordUserId);
    setServerJoinDate(player.serverJoinDate);
    setEpicUsername(player.epicUsername);
    setTwitterUsername(player.twitterUsername || "");
    setTwitchUsername(player.twitchUsername || "");
    setYoutubeUsername(player.youtubeUsername || "");
    setAdminComments(player.adminComments || "");
  }, [player]);

  const handleSave = async () => {
    if (!discordUsername.trim() || !epicUsername.trim() || !discordUserId.trim()) {
      toast.error("Discord Username, Epic Username, and Discord User ID are required");
      return;
    }

    setIsSaving(true);
    try {
      await updatePlayer({
        playerId: player._id,
        discordUsername: discordUsername.trim(),
        nickname: nickname.trim() || undefined,
        discordUserId: discordUserId.trim(),
        serverJoinDate,
        epicUsername: epicUsername.trim(),
        twitterUsername: twitterUsername.trim() || undefined,
        twitchUsername: twitchUsername.trim() || undefined,
        youtubeUsername: youtubeUsername.trim() || undefined,
        adminComments: adminComments.trim() || undefined,
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="discordUsername">Discord Username *</Label>
              <Input
                id="discordUsername"
                value={discordUsername}
                onChange={(e) => setDiscordUsername(e.target.value)}
                placeholder="username#1234"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">Server Nickname</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Optional nickname"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="epicUsername">Epic Username *</Label>
              <Input
                id="epicUsername"
                value={epicUsername}
                onChange={(e) => setEpicUsername(e.target.value)}
                placeholder="Epic Games username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discordUserId">Discord User ID *</Label>
              <Input
                id="discordUserId"
                value={discordUserId}
                onChange={(e) => setDiscordUserId(e.target.value)}
                placeholder="123456789012345678"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serverJoinDate">Server Join Date</Label>
            <Input
              id="serverJoinDate"
              type="date"
              value={serverJoinDate.split('T')[0]}
              onChange={(e) => setServerJoinDate(new Date(e.target.value).toISOString())}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Social Media (Optional)</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="twitterUsername" className="text-xs">Twitter/X</Label>
                <Input
                  id="twitterUsername"
                  value={twitterUsername}
                  onChange={(e) => setTwitterUsername(e.target.value)}
                  placeholder="@username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitchUsername" className="text-xs">Twitch</Label>
                <Input
                  id="twitchUsername"
                  value={twitchUsername}
                  onChange={(e) => setTwitchUsername(e.target.value)}
                  placeholder="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="youtubeUsername" className="text-xs">YouTube</Label>
                <Input
                  id="youtubeUsername"
                  value={youtubeUsername}
                  onChange={(e) => setYoutubeUsername(e.target.value)}
                  placeholder="@username"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminComments">Admin Comments</Label>
            <Textarea
              id="adminComments"
              value={adminComments}
              onChange={(e) => setAdminComments(e.target.value)}
              placeholder="Internal notes (only visible to admins/moderators)"
              rows={3}
            />
          </div>
        </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
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
