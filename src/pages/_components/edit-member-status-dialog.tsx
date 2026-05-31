import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";

interface EditMemberStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: Id<"players">;
}

export default function EditMemberStatusDialog({ open, onOpenChange, playerId }: EditMemberStatusDialogProps) {
  const players = useQuery(api.players.getPlayers, {});
  const formerMembers = useQuery(api.memberManagement.getFormerMembers);
  const rejectedMembers = useQuery(api.memberManagement.getRejectedMembers);
  const updateMemberStatus = useMutation(api.memberManagement.updateMemberStatus);
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
    status: "accepted" as "accepted" | "former" | "rejected",
    archiveReason: "left server" as "left server" | "application incomplete" | "no tier role" | "banned" | "other",
    rejectionReason: "Incomplete Application",
  });
  
  // Load player data when dialog opens
  useEffect(() => {
    if (playerId && open) {
      // Try to find the player in all three lists
      const acceptedMember = players?.find(m => m._id === playerId);
      const formerMember = formerMembers?.find(m => m._id === playerId);
      const rejectedMember = rejectedMembers?.find(m => m._id === playerId);
      
      const member = acceptedMember || formerMember || rejectedMember;
      const currentStatus: "accepted" | "former" | "rejected" = 
        acceptedMember ? "accepted" : 
        formerMember ? "former" : 
        "rejected";
      
      if (member) {
        setFormData({
          discordUsername: member.discordUsername,
          nickname: member.nickname || "",
          discordUserId: member.discordUserId,
          serverJoinDate: member.serverJoinDate,
          epicUsername: member.epicUsername,
          twitterUsername: member.twitterUsername || "",
          twitchUsername: member.twitchUsername || "",
          youtubeUsername: member.youtubeUsername || "",
          adminComments: member.adminComments || "",
          status: currentStatus,
          archiveReason: (member.archiveReason as typeof formData.archiveReason) || "left server",
          rejectionReason: member.rejectionReason || "Incomplete Application",
        });
      }
    }
  }, [players, formerMembers, rejectedMembers, playerId, open]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields based on status
    if (formData.status === "former" && !formData.archiveReason) {
      toast.error("Archive reason is required for former members");
      return;
    }
    
    if (formData.status === "rejected" && !formData.rejectionReason) {
      toast.error("Rejection reason is required for rejected members");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await updateMemberStatus({
        playerId,
        discordUsername: formData.discordUsername,
        nickname: formData.nickname || undefined,
        discordUserId: formData.discordUserId,
        serverJoinDate: formData.serverJoinDate,
        epicUsername: formData.epicUsername,
        twitterUsername: formData.twitterUsername || undefined,
        twitchUsername: formData.twitchUsername || undefined,
        youtubeUsername: formData.youtubeUsername || undefined,
        adminComments: formData.adminComments || undefined,
        status: formData.status,
        archiveReason: formData.status === "former" ? formData.archiveReason : undefined,
        rejectionReason: formData.status === "rejected" ? formData.rejectionReason : undefined,
      });
      
      toast.success("Member updated successfully!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update member. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit Member Status</DialogTitle>
          <DialogDescription>
            Update member information and status
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Member Status *</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  status: value as typeof formData.status 
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="former">Former</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {formData.status === "former" && (
              <div className="space-y-2">
                <Label htmlFor="archiveReason">Archive Reason *</Label>
                <Select
                  value={formData.archiveReason}
                  onValueChange={(value) => setFormData({ 
                    ...formData, 
                    archiveReason: value as typeof formData.archiveReason 
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left server">Left Server</SelectItem>
                    <SelectItem value="application incomplete">Application Incomplete</SelectItem>
                    <SelectItem value="no tier role">No Tier Role</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {formData.status === "rejected" && (
              <div className="space-y-2">
                <Label htmlFor="rejectionReason">Rejection Reason *</Label>
                <Select
                  value={formData.rejectionReason}
                  onValueChange={(value) => setFormData({ 
                    ...formData, 
                    rejectionReason: value 
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Incomplete Application">Incomplete Application</SelectItem>
                    <SelectItem value="Previously Rejected">Previously Rejected</SelectItem>
                    <SelectItem value="Information mismatch">Information mismatch</SelectItem>
                    <SelectItem value="Sus clips/behaviour elsewhere">Sus clips/behaviour elsewhere</SelectItem>
                    <SelectItem value="Unsure if legitimate account">Unsure if legitimate account</SelectItem>
                    <SelectItem value="Too good">Too good</SelectItem>
                    <SelectItem value="Lied in app">Lied in app</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
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
                placeholder="Add notes or comments about this member (only visible to admins)"
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
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
