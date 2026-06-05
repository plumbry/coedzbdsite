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
import { Badge } from "@/components/ui/badge.tsx";
import { AlertTriangle, CalendarCheck, Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { cn } from "@/lib/utils.ts";
import {
  type OffenseTrack,
  type PenaltyKind,
  defaultEventsFor,
  resolveBanType,
  showsEventCount,
  getDiscordRoleLabel,
  OFFENSE_TRACK_LABELS,
  PENALTY_KIND_LABELS,
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

type FormStep = "warning" | "player" | "track" | "penalty" | "reason" | "review";

type CreateBanDialogProps = {
  onEventPassed?: () => void;
};

const STEP_QUESTIONS: Record<Exclude<FormStep, "warning">, { title: string; description: string }> = {
  player: {
    title: "Who is this ban for?",
    description: "Search for a member or enter their Discord ID and display name.",
  },
  track: {
    title: "Is this a Minor or Major Incident?",
    description: "Choose minor, major, or probation based on the punishment matrix.",
  },
  penalty: {
    title: "What penalty should they receive?",
    description: "Apply a warning or an event ban for this offense.",
  },
  reason: {
    title: "What is the reason?",
    description: "Describe what happened. This is stored with the ban record.",
  },
  review: {
    title: "Review and apply",
    description: "Confirm the details below before applying the ban.",
  },
};

function QuestionProgress({ current, steps }: { current: FormStep; steps: FormStep[] }) {
  const index = steps.indexOf(current);
  if (index < 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Step {index + 1} of {steps.length}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-4 text-left transition-colors cursor-pointer",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

export default function CreateBanDialog({ onEventPassed }: CreateBanDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<FormStep>("player");
  const [stepError, setStepError] = useState<string | null>(null);
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

  const formSteps = useMemo((): FormStep[] => {
    const steps: FormStep[] = ["player", "track"];
    if (offenseTrack !== "probation") steps.push("penalty");
    steps.push("reason", "review");
    return steps;
  }, [offenseTrack]);

  useEffect(() => {
    if (offenseTrack === "probation") {
      setOriginalEvents("0");
      return;
    }
    setOriginalEvents(String(defaultEventsFor(offenseTrack, penaltyKind)));
  }, [offenseTrack, penaltyKind]);

  const getNextStep = (current: FormStep): FormStep | null => {
    if (current === "warning") return "player";
    if (current === "player") return "track";
    if (current === "track") return offenseTrack === "probation" ? "reason" : "penalty";
    if (current === "penalty") return "reason";
    if (current === "reason") return "review";
    return null;
  };

  const getPrevStep = (current: FormStep): FormStep | null => {
    if (current === "review") return "reason";
    if (current === "reason") return offenseTrack === "probation" ? "track" : "penalty";
    if (current === "penalty") return "track";
    if (current === "track") return "player";
    if (current === "player") return hasActiveBans ? "warning" : null;
    return null;
  };

  const validateStep = (current: FormStep): string | null => {
    if (current === "player") {
      if (!discordId.trim()) return "Discord ID is required";
      if (!playerTag.trim()) return "Player name is required";
      return null;
    }
    if (current === "penalty" && showsEventCount(offenseTrack, penaltyKind)) {
      const events = parseInt(originalEvents, 10);
      if (!originalEvents.trim() || isNaN(events) || events < 1) {
        return "Number of events is required (at least 1)";
      }
    }
    if (current === "reason" && !reason.trim()) return "Reason is required";
    return null;
  };

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
    setStepError(null);
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
    setStepError(null);
    setStep("player");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
      return;
    }
    setStep(hasActiveBans ? "warning" : "player");
    setStepError(null);
  };

  const handleEventPassedFromWarning = () => {
    handleOpenChange(false);
    onEventPassed?.();
  };

  const goNext = () => {
    const error = validateStep(step);
    if (error) {
      setStepError(error);
      toast.error(error);
      return;
    }
    setStepError(null);
    const next = getNextStep(step);
    if (next) setStep(next);
  };

  const goBack = () => {
    setStepError(null);
    const prev = getPrevStep(step);
    if (prev) setStep(prev);
  };

  const handleSubmit = async () => {
    const playerError = validateStep("player");
    const penaltyError = offenseTrack !== "probation" ? validateStep("penalty") : null;
    const reasonError = validateStep("reason");
    const error = playerError ?? penaltyError ?? reasonError;
    if (error) {
      setStepError(error);
      toast.error(error);
      return;
    }

    const events =
      offenseTrack === "probation" ? 0 : parseInt(originalEvents, 10);
    if (offenseTrack !== "probation" && penaltyKind === "event_ban" && (isNaN(events) || events < 1)) {
      toast.error("Number of events is required (at least 1)");
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

  const renderPlayerStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Search player</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Type a name to search..."
            value={playerSearch}
            onChange={(e) => {
              setPlayerSearch(e.target.value);
              setShowResults(true);
              if (selectedPlayer) setSelectedPlayer(null);
              setStepError(null);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-9"
          />
        </div>

        {showResults && searchResults && searchResults.length > 0 && !selectedPlayer && (
          <div className="max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
            {searchResults.map((player) => (
              <button
                key={player._id}
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                onClick={() => handleSelectPlayer(player)}
              >
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{player.discordUsername}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Epic: {player.epicUsername} | ID: {player.discordUserId}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {showResults && debouncedSearch.length >= 2 && searchResults && searchResults.length === 0 && !selectedPlayer && (
          <p className="text-xs text-muted-foreground">No players found. Enter their details below.</p>
        )}
      </div>

      {selectedPlayer && (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
          <User className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{selectedPlayer.discordUsername}</p>
            <p className="font-mono text-xs text-muted-foreground">{selectedPlayer.discordUserId}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer text-xs"
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

      <div className="space-y-3 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="discordId">
            Discord ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="discordId"
            placeholder="123456789012345678"
            value={discordId}
            onChange={(e) => {
              setDiscordId(e.target.value);
              setStepError(null);
            }}
            disabled={!!selectedPlayer}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="playerTag">
            Player name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="playerTag"
            placeholder="Display name for the ban record"
            value={playerTag}
            onChange={(e) => {
              setPlayerTag(e.target.value);
              setStepError(null);
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderTrackStep = () => (
    <div className="space-y-3">
      <ChoiceCard
        selected={offenseTrack === "minor"}
        onClick={() => {
          setOffenseTrack("minor");
          setStepError(null);
        }}
        title="Minor"
        description="Lower-severity incidents such as leaving an event early, no VODs after 2 reminders, in-game toxicity (emoting, shooting bodies, heated words), or outside-game toxicity. Escalates through warnings and event bans."
      />
      <ChoiceCard
        selected={offenseTrack === "major"}
        onClick={() => {
          setOffenseTrack("major");
          setStepError(null);
        }}
        title="Major"
        description="Serious offenses such as racist commentary, bullying, harassment, intentional griefing (with proof), or repeated major violations. Follows strict progression and can lead to removal."
      />
      <ChoiceCard
        selected={offenseTrack === "probation"}
        onClick={() => {
          setOffenseTrack("probation");
          setStepError(null);
        }}
        title="Probation"
        description="28-day server probation — applies the Probation role and removes tier roles."
      />
    </div>
  );

  const renderPenaltyStep = () => (
    <div className="space-y-4">
      {offenseHistory && discordId && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Auto-detected</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="border-yellow-200 bg-yellow-500/10 text-yellow-700">
              Minor: {offenseHistory.minorCount} prior
            </Badge>
            <Badge variant="secondary" className="border-red-200 bg-red-500/10 text-red-600">
              Major: {offenseHistory.majorCount} prior
            </Badge>
            <Badge className="border-primary/20 bg-primary/10 text-primary">
              Next: {offenseTrack === "minor" ? "Minor" : "Major"} #{nextOffenseNumber}
            </Badge>
          </div>
          {suggestedPenalty && (
            <p className="text-sm text-foreground">
              Suggested: <span className="font-medium">{suggestedPenalty.label}</span>
            </p>
          )}
        </div>
      )}

      <ChoiceCard
        selected={penaltyKind === "warning"}
        onClick={() => {
          setPenaltyKind("warning");
          setStepError(null);
        }}
        title="Warning"
        description="Recorded warning only — no event ban or Discord role."
      />
      <ChoiceCard
        selected={penaltyKind === "event_ban"}
        onClick={() => {
          setPenaltyKind("event_ban");
          setStepError(null);
        }}
        title="Event ban"
        description="Ban from events for a set number of events — syncs the Event Ban Discord role."
      />

      {showsEventCount(offenseTrack, penaltyKind) && (
        <div className="space-y-2 rounded-lg border p-4">
          <Label htmlFor="events">
            Number of events <span className="text-destructive">*</span>
          </Label>
          <Input
            id="events"
            type="number"
            min="1"
            value={originalEvents}
            onChange={(e) => {
              setOriginalEvents(e.target.value);
              setStepError(null);
            }}
          />
          {suggestedPenalty && suggestedPenalty.kind === "event_ban" && (
            <p className="text-xs text-muted-foreground">
              Suggested: {suggestedPenalty.events} event{suggestedPenalty.events !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderReasonStep = () => (
    <div className="space-y-2">
      <Label htmlFor="reason">
        Reason <span className="text-destructive">*</span>
      </Label>
      <Textarea
        id="reason"
        placeholder="Describe what happened..."
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setStepError(null);
        }}
        rows={5}
        className="min-h-[8rem]"
      />
    </div>
  );

  const renderReviewStep = () => {
    const events =
      offenseTrack === "probation" ? 0 : parseInt(originalEvents, 10);

    return (
      <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Player</span>
          <span className="text-right font-medium">{playerTag.trim()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Discord ID</span>
          <span className="font-mono text-right text-xs">{discordId.trim()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Offense track</span>
          <span className="font-medium">{OFFENSE_TRACK_LABELS[offenseTrack]}</span>
        </div>
        {offenseTrack !== "probation" && (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Penalty</span>
              <span className="font-medium">{PENALTY_KIND_LABELS[penaltyKind]}</span>
            </div>
            {penaltyKind === "event_ban" && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Events</span>
                <span className="font-medium">{events}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Stored as</span>
          <span className="font-medium">{banType}</span>
        </div>
        {getDiscordRoleLabel(banType) && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Discord role</span>
            <span className="font-medium">{getDiscordRoleLabel(banType)}</span>
          </div>
        )}
        <div className="border-t pt-3">
          <p className="text-muted-foreground">Reason</p>
          <p className="mt-1 whitespace-pre-wrap">{reason.trim()}</p>
        </div>
      </div>
    );
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
              <Button variant="outline" onClick={() => setStep("player")} className="cursor-pointer">
                Not Needed
              </Button>
              <Button variant="secondary" onClick={handleEventPassedFromWarning} className="cursor-pointer">
                <CalendarCheck className="mr-2 h-4 w-4" />
                Event Passed
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{STEP_QUESTIONS[step].title}</DialogTitle>
              <DialogDescription>{STEP_QUESTIONS[step].description}</DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <QuestionProgress current={step} steps={formSteps} />
              {stepError && (
                <p className="text-sm text-destructive">{stepError}</p>
              )}
              {step === "player" && renderPlayerStep()}
              {step === "track" && renderTrackStep()}
              {step === "penalty" && renderPenaltyStep()}
              {step === "reason" && renderReasonStep()}
              {step === "review" && renderReviewStep()}
            </DialogBody>

            <DialogFooter>
              {getPrevStep(step) ? (
                <Button variant="ghost" onClick={goBack} className="mr-auto cursor-pointer">
                  Back
                </Button>
              ) : (
                <span className="mr-auto" />
              )}
              <Button variant="ghost" onClick={() => handleOpenChange(false)} className="cursor-pointer">
                Cancel
              </Button>
              {step === "review" ? (
                <Button onClick={handleSubmit} disabled={isSubmitting} className="cursor-pointer">
                  {isSubmitting ? "Applying..." : "Apply Ban"}
                </Button>
              ) : (
                <Button onClick={goNext} className="cursor-pointer">
                  Continue
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
