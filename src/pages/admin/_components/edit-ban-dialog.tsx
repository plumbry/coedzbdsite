import { useEffect, useMemo, useState } from "react";
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
import {
  type OffenseTrack,
  type PenaltyKind,
  defaultEventsFor,
  parseBanToForm,
  resolveBanType,
  showsEventCount,
  getDiscordRoleLabel,
} from "@/lib/event-ban-form.ts";

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
  const [offenseTrack, setOffenseTrack] = useState<OffenseTrack>("minor");
  const [penaltyKind, setPenaltyKind] = useState<PenaltyKind>("warning");
  const [originalEvents, setOriginalEvents] = useState("1");
  const [remainingEvents, setRemainingEvents] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [reason, setReason] = useState("");
  const [moderatorTag, setModeratorTag] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [offenseNumber, setOffenseNumber] = useState("");

  const banType = useMemo(
    () =>
      offenseTrack === "probation"
        ? "Probation"
        : resolveBanType(offenseTrack, penaltyKind),
    [offenseTrack, penaltyKind],
  );

  useEffect(() => {
    if (!ban) return;
    const parsed = parseBanToForm(ban.banType, ban.offenseTrack);
    setDiscordId(ban.discordId);
    setPlayerTag(ban.playerTag);
    setOffenseTrack(parsed.track);
    setPenaltyKind(parsed.kind ?? "warning");
    setOriginalEvents(String(ban.originalEvents));
    setRemainingEvents(String(ban.remainingEvents));
    setStartDate(ban.startDate);
    setLastUpdated(ban.lastUpdated);
    setReason(ban.reason);
    setModeratorTag(ban.moderatorTag);
    setStatus(ban.status);
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

    const parsedOriginal =
      offenseTrack === "probation" ? 0 : parseInt(originalEvents, 10);
    const parsedRemaining =
      offenseTrack === "probation" ? 0 : parseInt(remainingEvents, 10);
    if (
      isNaN(parsedOriginal) ||
      parsedOriginal < 0 ||
      isNaN(parsedRemaining) ||
      parsedRemaining < 0
    ) {
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
        offenseTrack,
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
              <Label>Offense track</Label>
              <Select
                value={offenseTrack}
                onValueChange={(value) => {
                  const track = value as OffenseTrack;
                  setOffenseTrack(track);
                  if (track === "probation") {
                    setOriginalEvents("0");
                    setRemainingEvents("0");
                  } else if (showsEventCount(track, penaltyKind)) {
                    const events = defaultEventsFor(track, penaltyKind);
                    setOriginalEvents(String(events));
                    setRemainingEvents(String(events));
                  } else {
                    setOriginalEvents("0");
                    setRemainingEvents("0");
                  }
                }}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor" className="cursor-pointer">Minor</SelectItem>
                  <SelectItem value="major" className="cursor-pointer">Major</SelectItem>
                  <SelectItem value="probation" className="cursor-pointer">Probation</SelectItem>
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

          {offenseTrack === "probation" ? (
            <div className="rounded-md border border-red-200 bg-red-500/5 p-3 text-sm">
              <p className="font-medium text-red-700">28-day server probation</p>
              <p className="mt-1 text-muted-foreground">
                Applies the Probation Discord role and removes any tier role.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Penalty</Label>
                <Select
                  value={penaltyKind}
                  onValueChange={(value) => {
                    const kind = value as PenaltyKind;
                    setPenaltyKind(kind);
                    const events = defaultEventsFor(offenseTrack, kind);
                    setOriginalEvents(String(events));
                    if (kind === "warning") {
                      setRemainingEvents("0");
                    }
                  }}
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning" className="cursor-pointer">Warning</SelectItem>
                    <SelectItem value="event_ban" className="cursor-pointer">Event ban</SelectItem>
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
          )}

          {showsEventCount(offenseTrack, penaltyKind) && (
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
          )}

          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Stored as <span className="font-medium text-foreground">{banType}</span>
            {getDiscordRoleLabel(banType) &&
              ` — will sync "${getDiscordRoleLabel(banType)}" Discord role`}
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
