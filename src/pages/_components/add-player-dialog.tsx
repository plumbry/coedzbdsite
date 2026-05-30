import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";

interface AddPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddPlayerDialog({ open, onOpenChange }: AddPlayerDialogProps) {
  const createPlayer = useMutation(api.players.createPlayer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    discordUsername: "",
    nickname: "",
    discordUserId: "",
    serverJoinDate: "",
    epicUsername: "",
    twitterUsername: "",
    twitchUsername: "",
    youtubeUsername: "",
    adminComments: "",
  });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await createPlayer({
        discordUsername: formData.discordUsername,
        nickname: formData.nickname || undefined,
        discordUserId: formData.discordUserId,
        serverJoinDate: formData.serverJoinDate,
        epicUsername: formData.epicUsername,
        twitterUsername: formData.twitterUsername || undefined,
        twitchUsername: formData.twitchUsername || undefined,
        youtubeUsername: formData.youtubeUsername || undefined,
        adminComments: formData.adminComments || undefined,
      });
      
      toast.success("Player added successfully!");
      onOpenChange(false);
      
      // Reset form
      setFormData({
        discordUsername: "",
        nickname: "",
        discordUserId: "",
        serverJoinDate: "",
        epicUsername: "",
        twitterUsername: "",
        twitchUsername: "",
        youtubeUsername: "",
        adminComments: "",
      });
    } catch (error) {
      toast.error("Failed to add player. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Player</DialogTitle>
          <DialogDescription>
            Enter player information and social links
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
              {isSubmitting ? "Adding..." : "Add Player"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
