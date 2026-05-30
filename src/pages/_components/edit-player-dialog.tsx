import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";

interface EditPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: Id<"players">;
}

export default function EditPlayerDialog({ open, onOpenChange, playerId }: EditPlayerDialogProps) {
  const players = useQuery(api.players.getPlayers, {});
  const updatePlayer = useMutation(api.players.updatePlayer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    discordUsername: "",
    nickname: "",
    discordUserId: "",
    serverJoinDate: "",
    epicUsername: "",
    epicId: "",
    twitterUsername: "",
    twitchUsername: "",
    youtubeUsername: "",
    adminComments: "",
  });
  
  // Load player data when dialog opens
  useEffect(() => {
    if (players && playerId) {
      const player = players.find(p => p._id === playerId);
      if (player) {
        setFormData({
          discordUsername: player.discordUsername,
          nickname: player.nickname || "",
          discordUserId: player.discordUserId,
          serverJoinDate: player.serverJoinDate,
          epicUsername: player.epicUsername,
          epicId: player.epicId || "",
          twitterUsername: player.twitterUsername || "",
          twitchUsername: player.twitchUsername || "",
          youtubeUsername: player.youtubeUsername || "",
          adminComments: player.adminComments || "",
        });
      }
    }
  }, [players, playerId, open]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await updatePlayer({
        playerId,
        discordUsername: formData.discordUsername,
        nickname: formData.nickname || undefined,
        discordUserId: formData.discordUserId,
        serverJoinDate: formData.serverJoinDate,
        epicUsername: formData.epicUsername,
        epicId: formData.epicId || undefined,
        twitterUsername: formData.twitterUsername || undefined,
        twitchUsername: formData.twitchUsername || undefined,
        youtubeUsername: formData.youtubeUsername || undefined,
        adminComments: formData.adminComments || undefined,
      });
      
      toast.success("Player updated successfully!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update player. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Player</DialogTitle>
          <DialogDescription>
            Update player information and social links
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discordUsername">Discord Username *</Label>
              <Input
                id="discordUsername"
                placeholder="username#1234"
                value={formData.discordUsername}
                onChange={(e) => setFormData({ ...formData, discordUsername: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                placeholder="Player nickname"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="discordUserId">Discord User ID *</Label>
              <Input
                id="discordUserId"
                placeholder="123456789012345678"
                value={formData.discordUserId}
                onChange={(e) => setFormData({ ...formData, discordUserId: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Change this to fix incorrect Discord profile links. After saving, go to Admin → Features → "Relink Third Party Results" to update tournament data.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="serverJoinDate">Server Join Date *</Label>
              <Input
                id="serverJoinDate"
                type="date"
                value={formData.serverJoinDate}
                onChange={(e) => setFormData({ ...formData, serverJoinDate: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="epicUsername">Epic/Fortnite Username *</Label>
              <Input
                id="epicUsername"
                placeholder="EpicGamerTag"
                value={formData.epicUsername}
                onChange={(e) => setFormData({ ...formData, epicUsername: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="epicId">Epic Account ID</Label>
              <Input
                id="epicId"
                placeholder="abc123def456..."
                value={formData.epicId}
                onChange={(e) => setFormData({ ...formData, epicId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The unique Epic Account ID (from Yunite). Changing this will save the old ID to history.
              </p>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-medium">Social Links (Optional)</h3>
            
            <div className="space-y-2">
              <Label htmlFor="twitterUsername">Twitter/X Username</Label>
              <Input
                id="twitterUsername"
                placeholder="username"
                value={formData.twitterUsername}
                onChange={(e) => setFormData({ ...formData, twitterUsername: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="twitchUsername">Twitch Username</Label>
              <Input
                id="twitchUsername"
                placeholder="username"
                value={formData.twitchUsername}
                onChange={(e) => setFormData({ ...formData, twitchUsername: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="youtubeUsername">YouTube Username</Label>
              <Input
                id="youtubeUsername"
                placeholder="@username"
                value={formData.youtubeUsername}
                onChange={(e) => setFormData({ ...formData, youtubeUsername: e.target.value })}
              />
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-medium">Admin Comments (Admin Only)</h3>
            <div className="space-y-2">
              <Label htmlFor="adminComments">Comments</Label>
              <Textarea
                id="adminComments"
                placeholder="Add notes or comments about this player (only visible to admins)"
                value={formData.adminComments}
                onChange={(e) => setFormData({ ...formData, adminComments: e.target.value })}
                rows={4}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
