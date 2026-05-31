import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Loader2, Plus, Trash2, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  EditPlayerFormFields,
  type EditPlayerFormValues,
} from "@/components/edit-player-form-fields.tsx";

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
  
  const [values, setValues] = useState<EditPlayerFormValues>({
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
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAlternateId, setNewAlternateId] = useState("");
  const [isAddingAlternate, setIsAddingAlternate] = useState(false);
  
  // Populate form when player data loads
  useEffect(() => {
    if (player) {
      setValues({
        discordUsername: player.discordUsername || "",
        nickname: player.nickname || "",
        epicUsername: player.epicUsername || "",
        epicId: player.epicId || "",
        twitterUsername: player.twitterUsername || "",
        twitchUsername: player.twitchUsername || "",
        youtubeUsername: player.youtubeUsername || "",
        adminComments: player.adminComments || "",
        discordUserId: player.discordUserId || "",
        serverJoinDate: player.serverJoinDate || "",
      });
    }
  }, [player]);

  const handleFieldChange = (field: keyof EditPlayerFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };
  
  const handleSubmit = async () => {
    if (!values.epicUsername.trim()) {
      toast.error("Epic Username is required");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await updatePlayer({
        playerId,
        discordUsername: values.discordUsername.trim() || player?.discordUsername || "",
        nickname: values.nickname.trim() || undefined,
        epicUsername: values.epicUsername.trim(),
        epicId: values.epicId.trim() || undefined,
        twitterUsername: values.twitterUsername.trim() || undefined,
        twitchUsername: values.twitchUsername.trim() || undefined,
        youtubeUsername: values.youtubeUsername.trim() || undefined,
        adminComments: values.adminComments.trim() || undefined,
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
            <EditPlayerFormFields
              values={values}
              onChange={handleFieldChange}
              showEpic={false}
              showSocial={false}
              showAdminComments={false}
            />

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
                value={values.epicUsername}
                onChange={(e) => handleFieldChange("epicUsername", e.target.value)}
                placeholder="EpicGamesUsername"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="epic-id">Epic Account ID</Label>
              <Input
                id="epic-id"
                value={values.epicId}
                onChange={(e) => handleFieldChange("epicId", e.target.value)}
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

            <EditPlayerFormFields
              values={values}
              onChange={handleFieldChange}
              showIdentity={false}
              showEpic={false}
            />
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
