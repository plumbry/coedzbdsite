import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Loader2, Plus, Trash2, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";

interface EditPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: Id<"players">;
}

export default function EditPlayerDialog({ open, onOpenChange, playerId }: EditPlayerDialogProps) {
  const player = useQuery(
    api.players.getPlayerById,
    open ? { id: playerId } : "skip",
  );
  const updatePlayer = useMutation(api.players.updatePlayerProfile);
  const addAlternateId = useMutation(api.discord.addAlternateDiscordId);
  const removeAlternateId = useMutation(api.discord.removeAlternateDiscordId);
  const setAsPrimary = useMutation(api.discord.setAlternateAsPrimary);
  
  const [discordUsername, setDiscordUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [epicUsername, setEpicUsername] = useState("");
  const [epicId, setEpicId] = useState("");
  const [twitterUsername, setTwitterUsername] = useState("");
  const [twitchUsername, setTwitchUsername] = useState("");
  const [youtubeUsername, setYoutubeUsername] = useState("");
  const [adminComments, setAdminComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAlternateId, setNewAlternateId] = useState("");
  const [isAddingAlternate, setIsAddingAlternate] = useState(false);
  
  // Populate form when player data loads
  useEffect(() => {
    if (player) {
      setDiscordUsername(player.discordUsername || "");
      setNickname(player.nickname || "");
      setEpicUsername(player.epicUsername || "");
      setEpicId(player.epicId || "");
      setTwitterUsername(player.twitterUsername || "");
      setTwitchUsername(player.twitchUsername || "");
      setYoutubeUsername(player.youtubeUsername || "");
      setAdminComments(player.adminComments || "");
    }
  }, [player]);
  
  const handleSubmit = async () => {
    if (!epicUsername.trim()) {
      toast.error("Epic Username is required");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await updatePlayer({
        playerId,
        discordUsername: discordUsername.trim() || player?.discordUsername || "",
        nickname: nickname.trim() || undefined,
        epicUsername: epicUsername.trim(),
        epicId: epicId.trim() || undefined,
        twitterUsername: twitterUsername.trim() || undefined,
        twitchUsername: twitchUsername.trim() || undefined,
        youtubeUsername: youtubeUsername.trim() || undefined,
        adminComments: adminComments.trim() || undefined,
      });
      
      toast.success("Player profile updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update player");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit Player Profile</DialogTitle>
          <DialogDescription>
            Update player information and social links
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        {!player ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discord-username">Discord Username *</Label>
                <Input
                  id="discord-username"
                  value={discordUsername}
                  onChange={(e) => setDiscordUsername(e.target.value)}
                  placeholder="username"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname (Display Name)</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Optional nickname"
                />
              </div>
            </div>
            
            {/* Alternate Discord IDs Section */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Discord IDs</Label>
                <span className="text-xs text-muted-foreground">
                  {1 + (player.alternateDiscordUserIds?.length || 0)} of 3 slots used
                </span>
              </div>
              
              {/* Primary Discord ID */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">Primary</span>
                <code className="text-sm font-mono flex-1">{player.discordUserId}</code>
              </div>
              
              {/* Alternate Discord IDs */}
              {player.alternateDiscordUserIds?.map((altId, index) => (
                <div key={altId} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">Alt {index + 1}</span>
                  <code className="text-sm font-mono flex-1">{altId}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    title="Make primary"
                    onClick={async () => {
                      try {
                        await setAsPrimary({ playerId, alternateDiscordUserId: altId });
                        toast.success("Discord ID promoted to primary");
                      } catch (error) {
                        const msg = error instanceof ConvexError
                          ? (error.data as { message: string }).message
                          : error instanceof Error ? error.message : "Failed to set as primary";
                        toast.error(msg);
                      }
                    }}
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    title="Remove"
                    onClick={async () => {
                      try {
                        await removeAlternateId({ playerId, discordUserId: altId });
                        toast.success("Alternate Discord ID removed");
                      } catch (error) {
                        const msg = error instanceof ConvexError
                          ? (error.data as { message: string }).message
                          : error instanceof Error ? error.message : "Failed to remove";
                        toast.error(msg);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              
              {/* Add new alternate */}
              {(player.alternateDiscordUserIds?.length || 0) < 2 && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newAlternateId}
                    onChange={(e) => setNewAlternateId(e.target.value)}
                    placeholder="New Discord User ID"
                    className="h-8 text-sm font-mono"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={!newAlternateId.trim() || isAddingAlternate}
                    onClick={async () => {
                      if (!newAlternateId.trim()) return;
                      setIsAddingAlternate(true);
                      try {
                        await addAlternateId({ playerId, newDiscordUserId: newAlternateId.trim() });
                        toast.success("Alternate Discord ID added");
                        setNewAlternateId("");
                      } catch (error) {
                        const msg = error instanceof ConvexError
                          ? (error.data as { message: string }).message
                          : error instanceof Error ? error.message : "Failed to add alternate ID";
                        toast.error(msg);
                      } finally {
                        setIsAddingAlternate(false);
                      }
                    }}
                  >
                    {isAddingAlternate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    <span className="ml-1">Add</span>
                  </Button>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="epic-username">Epic Username *</Label>
              <Input
                id="epic-username"
                value={epicUsername}
                onChange={(e) => setEpicUsername(e.target.value)}
                placeholder="EpicGamesUsername"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="epic-id">Epic Account ID</Label>
              <Input
                id="epic-id"
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
                placeholder="abc123def456..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Unique Epic Account ID (from Yunite). Changing this saves the old ID to history.
              </p>
              {player?.previousEpicIds && player.previousEpicIds.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Previous IDs:</p>
                  {player.previousEpicIds.map((prev, i) => (
                    <div key={i} className="text-xs font-mono text-muted-foreground">
                      {prev.epicId} <span className="text-muted-foreground/60">({new Date(prev.changedAt).toLocaleDateString()})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Social Links</h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="twitter">Twitter Username</Label>
                  <Input
                    id="twitter"
                    value={twitterUsername}
                    onChange={(e) => setTwitterUsername(e.target.value)}
                    placeholder="username"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="twitch">Twitch Username</Label>
                  <Input
                    id="twitch"
                    value={twitchUsername}
                    onChange={(e) => setTwitchUsername(e.target.value)}
                    placeholder="username"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="youtube">YouTube Username</Label>
                  <Input
                    id="youtube"
                    value={youtubeUsername}
                    onChange={(e) => setYoutubeUsername(e.target.value)}
                    placeholder="@username"
                  />
                </div>
              </div>
            </div>
            
            <div className="border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="admin-comments">Admin Comments (Private)</Label>
                <Textarea
                  id="admin-comments"
                  value={adminComments}
                  onChange={(e) => setAdminComments(e.target.value)}
                  placeholder="Internal notes visible only to admins..."
                  rows={4}
                />
              </div>
            </div>
          </div>
        )}
        </DialogBody>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !player}>
            {isSubmitting ? (
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
