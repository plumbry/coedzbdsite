import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { toast } from "sonner";

export type EditableBan = {
  _id: string;
  discordId: string;
  playerTag: string;
  banType: string;
  originalEvents: number;
  remainingEvents: number;
  startDate: string;
  lastUpdated: string;
  reason: string;
  moderatorTag: string;
  status: string;
  offenseTrack?: string;
  offenseNumber?: number;
};

type EditBanDialogProps = {
  ban: EditableBan | null;
  onOpenChange: (open: boolean) => void;
};

export default function EditBanDialog({ ban, onOpenChange }: EditBanDialogProps) {
  const updateBanAction = useAction(api.eventBans.sync.updateBan);
  const [isSaving, setIsSaving] = useState(false);

  const [discordId, setDiscordId] = useState("");
  const [playerTag, setPlayerTag] = useState("");
  const [banType, setBanType] = useState("Minor Event Ban");
  const [originalEvents, setOriginalEvents] = useState("1");
  const [remainingEvents, setRemainingEvents] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [reason, setReason] = useState("");
  const [moderatorTag, setModeratorTag] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [offenseTrack, setOffenseTrack] = useState<string>("none");
  const [offenseNumber, setOffenseNumber] = useState("");

  useEffect(() => {
    if (!ban) return;
    setDiscordId(ban.discordId);
    setPlayerTag(ban.playerTag);
    setBanType(ban.banType);
    setOriginalEvents(String(ban.originalEvents));
    setRemainingEvents(String(ban.remainingEvents));
    setStartDate(ban.startDate);
    setLastUpdated(ban.lastUpdated);
    setReason(ban.reason);
    setModeratorTag(ban.moderatorTag);
    setStatus(ban.status);
    setOffenseTrack(ban.offenseTrack ?? "none");
    setOffenseNumber(ban.offenseNumber !== undefined ? String(ban.offenseNumber) : "");
  }, [ban]);

  const handleSave = async () => {
    if (!ban) return;

    if (!discordId.trim() || !playerTag.trim()) {
      toast.error("Player tag and Discord ID are required");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (!moderatorTag.trim()) {
      toast.error("Moderator is required");
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(startDate.trim()) || !/^\d{2}\/\d{2}\/\d{4}$/.test(lastUpdated.trim())) {
      toast.error("Dates must be DD/MM/YYYY");
      return;
    }

    const parsedOriginal = parseInt(originalEvents, 10);
    const parsedRemaining = parseInt(remainingEvents, 10);
    if (isNaN(parsedOriginal) || parsedOriginal < 0 || isNaN(parsedRemaining) || parsedRemaining < 0) {
      toast.error("Event counts must be 0 or higher");
      return;
    }

    const parsedOffenseNumber =
      offenseNumber.trim() === "" ? undefined : parseInt(offenseNumber, 10);
    if (parsedOffenseNumber !== undefined && (isNaN(parsedOffenseNumber) || parsedOffenseNumber < 1)) {
      toast.error("Offense number must be 1 or higher");
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateBanAction({
        banId: ban._id as Id<"eventBans">,
        discordId: discordId.trim(),
        playerTag: playerTag.trim(),
        banType,
        originalEvents: parsedOriginal,
        remainingEvents: parsedRemaining,
        startDate: startDate.trim(),
        lastUpdated: lastUpdated.trim(),
        reason: reason.trim(),
        moderatorTag: moderatorTag.trim(),
        status,
        offenseTrack: offenseTrack === "none" ? undefined : offenseTrack,
        offenseNumber: parsedOffenseNumber,
      });

      if (result.updatedInSheet) {
        toast.success("Ban updated on site and Google Sheet");
      } else {
        toast.success("Ban updated on site (could not find matching row in sheet)");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update ban");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={ban !== null} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Edit ban</DialogTitle>
          <DialogDescription>
            Update all fields for {ban?.playerTag}. Changes sync to the Google Sheet when a matching row is found.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-player-tag">Player tag</Label>
              <Input
                id="edit-player-tag"
                value={playerTag}
                onChange={(e) => setPlayerTag(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-discord-id">Discord ID</Label>
              <Input
                id="edit-discord-id"
                value={discordId}
                onChange={(e) => setDiscordId(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Ban type</Label>
              <Select value={banType} onValueChange={setBanType}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Minor Warning" className="cursor-pointer">Minor Warning</SelectItem>
                  <SelectItem value="Major Warning" className="cursor-pointer">Major Warning</SelectItem>
                  <SelectItem value="Minor Event Ban" className="cursor-pointer">Minor Event Ban</SelectItem>
                  <SelectItem value="Major Event Ban" className="cursor-pointer">Major Event Ban</SelectItem>
                  <SelectItem value="Event Ban" className="cursor-pointer">Event Ban</SelectItem>
                  <SelectItem value="Probation" className="cursor-pointer">Probation (28-day server ban)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE" className="cursor-pointer">Active</SelectItem>
                  <SelectItem value="ENDED" className="cursor-pointer">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Offense track</Label>
              <Select value={offenseTrack} onValueChange={setOffenseTrack}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="cursor-pointer">None</SelectItem>
                  <SelectItem value="minor" className="cursor-pointer">Minor</SelectItem>
                  <SelectItem value="major" className="cursor-pointer">Major</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-offense-number">Offense #</Label>
              <Input
                id="edit-offense-number"
                type="number"
                min={1}
                placeholder="Optional"
                value={offenseNumber}
                onChange={(e) => setOffenseNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-original-events">Original events</Label>
              <Input
                id="edit-original-events"
                type="number"
                min={0}
                value={originalEvents}
                onChange={(e) => setOriginalEvents(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-remaining-events">Remaining events</Label>
              <Input
                id="edit-remaining-events"
                type="number"
                min={0}
                value={remainingEvents}
                onChange={(e) => setRemainingEvents(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-start-date">Start date</Label>
              <Input
                id="edit-start-date"
                placeholder="DD/MM/YYYY"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-last-updated">Last updated</Label>
              <Input
                id="edit-last-updated"
                placeholder="DD/MM/YYYY"
                value={lastUpdated}
                onChange={(e) => setLastUpdated(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-moderator">Moderator</Label>
            <Input
              id="edit-moderator"
              value={moderatorTag}
              onChange={(e) => setModeratorTag(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-reason">Reason</Label>
            <Textarea
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Enter ban reason..."
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
