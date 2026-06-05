import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
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
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { AlertTriangle, CalendarCheck, Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce.ts";
import {
  type OffenseTrack,
  type PenaltyKind,
  defaultEventsFor,
  resolveBanType,
  showsEventCount,
  getDiscordRoleLabel,
} from "@/lib/event-ban-form.ts";

const TRACK_SUGGESTIONS: Record<
  Exclude<OffenseTrack, "probation">,
  Record<number, { label: string; kind: PenaltyKind; events: number }>
> = {
  minor: {
    1: { label: "1st minor — warning", kind: "warning", events: 0 },
    2: { label: "2nd minor — event ban", kind: "event_ban", events: 1 },
  },
  major: {
    1: { label: "1st major — warning", kind: "warning", events: 0 },
    2: { label: "2nd major — event ban", kind: "event_ban", events: 3 },
  },
};

type CreateBanDialogProps = {
  onEventPassed?: () => void;
};

export default function CreateBanDialog({ onEventPassed }: CreateBanDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"warning" | "form">("form");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [playerSearch, setPlayerSearch] = useState("");
  const [debouncedSearch] = useDebounce(playerSearch, 300);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    discordUsername: string;
    epicUsername: string;
    discordUserId: string;
    nickname?: string;
  } | null>(null);
  const [showResults, setShowResults] = useState(false);

  const [discordId, setDiscordId] = useState("");
  const [playerTag, setPlayerTag] = useState("");
  const [offenseTrack, setOffenseTrack] = useState<OffenseTrack>("minor");
  const [penaltyKind, setPenaltyKind] = useState<PenaltyKind>("warning");
  const [originalEvents, setOriginalEvents] = useState("0");
  const [reason, setReason] = useState("");

  const searchResults = useQuery(
    api.eventBans.queries.searchPlayersForBan,
    debouncedSearch.length >= 2 ? { search: debouncedSearch } : "skip",
  );

  const offenseHistory = useQuery(
    api.eventBans.queries.getPlayerOffenseHistory,
    discordId ? { discordId } : "skip",
  );

  const syncStatus = useQuery(api.eventBans.queries.getSyncStatus, {});
  const createBan = useMutation(api.eventBans.mutations.createBan);
  const hasActiveBans = (syncStatus?.activeBans ?? 0) > 0;

  const banType = useMemo(
    () =>
      offenseTrack === "probation"
        ? "Probation"
        : resolveBanType(offenseTrack, penaltyKind),
    [offenseTrack, penaltyKind],
  );

  const nextOffenseNumber =
    offenseTrack === "probation"
      ? undefined
      : offenseTrack === "minor"
        ? (offenseHistory?.minorCount ?? 0) + 1
        : (offenseHistory?.majorCount ?? 0) + 1;

  const suggestedPenalty =
    offenseTrack !== "probation" && nextOffenseNumber
      ? TRACK_SUGGESTIONS[offenseTrack][Math.min(nextOffenseNumber, 2)]
      : null;

  useEffect(() => {
    if (offenseTrack === "probation") {
      setOriginalEvents("0");
      return;
    }
    setOriginalEvents(String(defaultEventsFor(offenseTrack, penaltyKind)));
  }, [offenseTrack, penaltyKind]);

  const handleSelectPlayer = (player: {
    discordUsername: string;
    epicUsername: string;
    discordUserId: string;
    nickname?: string;
  }) => {
    setSelectedPlayer(player);
    setDiscordId(player.discordUserId);
    setPlayerTag(player.discordUsername || player.epicUsername);
    setPlayerSearch(player.discordUsername || player.epicUsername);
    setShowResults(false);
  };

  const resetForm = () => {
    setPlayerSearch("");
    setSelectedPlayer(null);
    setDiscordId("");
    setPlayerTag("");
    setOffenseTrack("minor");
    setPenaltyKind("warning");
    setOriginalEvents("0");
    setReason("");
    setStep("form");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
      return;
    }
    setStep(hasActiveBans ? "warning" : "form");
  };

  const handleEventPassedFromWarning = () => {
    handleOpenChange(false);
    onEventPassed?.();
  };

  const handleSubmit = async () => {
    if (!discordId.trim()) {
      toast.error("Please select a player or enter a Discord ID");
      return;
    }
    if (!playerTag.trim()) {
      toast.error("Player tag is required");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    const events =
      offenseTrack === "probation" ? 0 : parseInt(originalEvents, 10);
    if (isNaN(events) || events < 0) {
      toast.error("Events must be 0 or higher");
      return;
    }

    setIsSubmitting(true);
    try {
      await createBan({
        discordId: discordId.trim(),
        playerTag: playerTag.trim(),
        banType,
        originalEvents: events,
        reason: reason.trim(),
        offenseTrack,
        offenseNumber: nextOffenseNumber,
      });

      const trackLabel =
        offenseTrack === "probation"
          ? "probation"
          : `${offenseTrack} offense #${nextOffenseNumber}`;
      toast.success(`Ban applied to ${playerTag.trim()} (${trackLabel})`);
      resetForm();
      setOpen(false);
    } catch {
      toast.error("Failed to create ban");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 cursor-pointer text-xs sm:text-sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Create Ban
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        {step === "warning" ? (
          <>
            <DialogHeader>
              <DialogTitle>Check Event Passed first</DialogTitle>
              <DialogDescription>
                Active bans are on the list. Run Event Passed or confirm it is not needed before creating a new ban.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium">
                    If an event has just finished, click Event Passed before adding a ban.
                  </p>
                  <p className="text-amber-900/80">
                    {syncStatus?.activeBans ?? 0} active ban
                    {(syncStatus?.activeBans ?? 0) === 1 ? "" : "s"} currently on the list.
                  </p>
                </div>
              </div>
            </DialogBody>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("form")}
                className="cursor-pointer"
              >
                Not Needed
              </Button>
              <Button
                variant="secondary"
                onClick={handleEventPassedFromWarning}
                className="cursor-pointer"
              >
                <CalendarCheck className="mr-2 h-4 w-4" />
                Event Passed
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
        <DialogHeader>
          <DialogTitle>Create Event Ban</DialogTitle>
          <DialogDescription>
            Choose an offense track, then apply a warning or event ban. Probation applies the probation role and removes tier roles.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label>Search Player</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type a name to search..."
                value={playerSearch}
                onChange={(e) => {
                  setPlayerSearch(e.target.value);
                  setShowResults(true);
                  if (selectedPlayer) setSelectedPlayer(null);
                }}
                onFocus={() => setShowResults(true)}
                className="pl-9"
              />
            </div>

            {showResults && searchResults && searchResults.length > 0 && !selectedPlayer && (
              <div className="border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                {searchResults.map((player) => (
                  <button
                    key={player._id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 cursor-pointer transition-colors"
                    onClick={() => handleSelectPlayer(player)}
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{player.discordUsername}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Epic: {player.epicUsername} | ID: {player.discordUserId}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showResults && debouncedSearch.length >= 2 && searchResults && searchResults.length === 0 && !selectedPlayer && (
              <p className="text-xs text-muted-foreground">No players found. You can enter details manually below.</p>
            )}
          </div>

          {selectedPlayer && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
              <User className="h-4 w-4 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{selectedPlayer.discordUsername}</p>
                <p className="text-xs text-muted-foreground font-mono">{selectedPlayer.discordUserId}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer h-7 text-xs"
                onClick={() => {
                  setSelectedPlayer(null);
                  setPlayerSearch("");
                  setDiscordId("");
                  setPlayerTag("");
                }}
              >
                Clear
              </Button>
            </div>
          )}

          {!selectedPlayer && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="discordId">Discord ID</Label>
                <Input
                  id="discordId"
                  placeholder="123456789012345678"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="playerTag">Player Tag</Label>
                <Input
                  id="playerTag"
                  placeholder="PlayerName"
                  value={playerTag}
                  onChange={(e) => setPlayerTag(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Offense track</Label>
            <Select
              value={offenseTrack}
              onValueChange={(value) => setOffenseTrack(value as OffenseTrack)}
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

          {offenseTrack === "probation" ? (
            <div className="rounded-md border border-red-200 bg-red-500/5 p-3 text-sm">
              <p className="font-medium text-red-700">28-day server probation</p>
              <p className="mt-1 text-muted-foreground">
                Applies the Probation Discord role and removes any tier role. No warning or event-ban sub-choice is needed.
              </p>
            </div>
          ) : (
            <>
              {offenseHistory && discordId && (
                <div className="p-3 bg-muted/50 rounded-md space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auto-detected</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">
                      Minor: {offenseHistory.minorCount} prior
                    </Badge>
                    <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-200">
                      Major: {offenseHistory.majorCount} prior
                    </Badge>
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      Next: {offenseTrack === "minor" ? "Minor" : "Major"} #{nextOffenseNumber}
                    </Badge>
                  </div>
                  {suggestedPenalty && (
                    <p className="text-sm text-foreground mt-1">
                      Suggested: <span className="font-medium">{suggestedPenalty.label}</span> ({suggestedPenalty.events} events)
                    </p>
                  )}
                </div>
              )}

              <div className={showsEventCount(offenseTrack, penaltyKind) ? "grid grid-cols-2 gap-3" : "space-y-2"}>
                <div className="space-y-2">
                  <Label>Penalty</Label>
                  <Select
                    value={penaltyKind}
                    onValueChange={(value) => setPenaltyKind(value as PenaltyKind)}
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
                {showsEventCount(offenseTrack, penaltyKind) && (
                  <div className="space-y-2">
                    <Label htmlFor="events">Number of events</Label>
                    <Input
                      id="events"
                      type="number"
                      min="1"
                      value={originalEvents}
                      onChange={(e) => setOriginalEvents(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {suggestedPenalty && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                  Suggested: <span className="font-medium text-foreground">{suggestedPenalty.label}</span>
                  {" "}
                  ({suggestedPenalty.events === 0 ? "warning only" : `${suggestedPenalty.events} event${suggestedPenalty.events !== 1 ? "s" : ""}`})
                </p>
              )}
            </>
          )}

          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Stored as <span className="font-medium text-foreground">{banType}</span>
            {getDiscordRoleLabel(banType) &&
              ` — will sync "${getDiscordRoleLabel(banType)}" Discord role`}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              placeholder="Reason for the ban..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          {hasActiveBans && (
            <Button
              variant="ghost"
              onClick={() => setStep("warning")}
              className="cursor-pointer mr-auto"
            >
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={() => handleOpenChange(false)} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="cursor-pointer">
            {isSubmitting ? "Creating..." : "Apply Ban"}
          </Button>
        </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
