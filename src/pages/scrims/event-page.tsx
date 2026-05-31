import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  RotateCcw,
  Trophy,
  Copy,
  Check,
  Info,
  Dices,
  Download,
  ExternalLink,
  Pencil,
  Link2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ShieldCheck,
  Hash,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import TeamList from "./_components/team-list.tsx";
import PairingsTable from "./_components/pairings-table.tsx";
import SpinWheel from "./_components/spin-wheel.tsx";
import { generateSingleGamePairing, buildUnifiedTeamList } from "./_lib/pairing-algorithm.ts";
import type { TierRestrictedOptions } from "./_lib/pairing-algorithm.ts";
import { formatPairingsForDiscord } from "./_lib/discord-format.ts";
import { exportPairingsToCSV } from "./_lib/csv-export.ts";

export default function ScrimEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  // Determine if param looks like a Convex document ID or a slug
  const isConvexId = eventId ? /^[a-z0-9]{20,}$/i.test(eventId) : false;

  // Lookup by slug (preferred) or by direct ID (legacy/fallback)
  const eventBySlug = useQuery(
    api.scrims.queries.getEventBySlug,
    !isConvexId && eventId ? { slug: eventId } : "skip"
  );
  const eventById = useQuery(
    api.scrims.queries.getEvent,
    isConvexId && eventId ? { eventId: eventId as Id<"scrimEvents"> } : "skip"
  );

  // Use whichever query resolved
  const event = isConvexId ? eventById : eventBySlug;

  const savePairings = useMutation(api.scrims.mutations.savePairings);
  const clearPairings = useMutation(api.scrims.mutations.clearPairings);
  const toggleGameLock = useMutation(api.scrims.mutations.toggleGameLock);
  const saveSingleGamePairing = useMutation(api.scrims.mutations.saveSingleGamePairing);
  const setLeaderboardUrl = useMutation(api.scrims.mutations.setLeaderboardUrl);
  const swapFillTeam = useMutation(api.scrims.mutations.swapFillTeam);
  const saveNumberAssignments = useMutation(api.scrims.mutations.saveNumberAssignments);
  const clearNumberAssignments = useMutation(api.scrims.mutations.clearNumberAssignments);
  const clearTeams = useMutation(api.scrims.mutations.clearTeams);
  const updateEvent = useMutation(api.scrims.mutations.updateEvent);
  const deleteEvent = useMutation(api.scrims.mutations.deleteEvent);
  const convex = useConvex();

  const [copied, setCopied] = useState(false);
  const [editingLeaderboardUrl, setEditingLeaderboardUrl] = useState(false);
  const [leaderboardUrlInput, setLeaderboardUrlInput] = useState("");

  // Edit event dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editGames, setEditGames] = useState("5");
  const [editSaving, setEditSaving] = useState(false);

  // Code lock state - controls are hidden until the correct code is entered
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [unlockError, setUnlockError] = useState(false);

  // Streamer mode - hides all sensitive info (codes, bot setup, etc.)
  const [streamerMode, setStreamerMode] = useState(false);

  // Auto-unlock for admins/mods - they don't need a code
  const { hasEventBanAccess } = useUserRole();
  useEffect(() => {
    if (hasEventBanAccess && !isUnlocked) {
      setIsUnlocked(true);
    }
  }, [hasEventBanAccess, isUnlocked]);

  // Spin mode: "random" (default with S-tier guard) or "tier_restricted" (full tier composition rules)
  const [spinMode, setSpinMode] = useState<"random" | "tier_restricted">("random");

  const handleUnlock = useCallback(async () => {
    if (!event || !unlockCode.trim()) return;
    const valid = await convex.query(api.scrims.queries.verifyAdminCode, {
      eventId: event._id,
      code: unlockCode.trim(),
    });
    if (valid) {
      setIsUnlocked(true);
      setShowUnlockDialog(false);
      setUnlockCode("");
      setUnlockError(false);
      toast.success("Controls unlocked!");
    } else {
      setUnlockError(true);
    }
  }, [convex, event, unlockCode]);

  // Build unified team list (duos + solo pairs) for display and pairing
  const solos = event && "solos" in event ? (event.solos ?? []) : [];
  const unifiedTeams = useMemo(() => {
    if (!event) return [];
    return buildUnifiedTeamList(event.teams, solos);
  }, [event, solos]);

  // Build S-tier forbidden set: indices into the unified team list that have any S-tier player
  // Two S-tier teams must NEVER be paired on the same squad
  const sTierIndices = useMemo(() => {
    const indices = new Set<number>();
    if (event) {
      // unifiedTeams indices correspond to active (non-fill) teams then solos
      // We need to map from unified index to tier data from the original active teams
      const activeTeams = event.teams.filter((t) => !t.isFill);
      activeTeams.forEach((team, idx) => {
        if (team.playerTiers?.some((t) => t.toUpperCase() === "S")) {
          indices.add(idx);
        }
      });
    }
    return indices;
  }, [event]);
  const pairingOptions = useMemo(
    () => (sTierIndices.size > 0 ? { forbiddenPairIndices: sTierIndices } : undefined),
    [sTierIndices],
  );

  // Build tier-restricted options: map from unified team index to player tiers
  const tierRestrictedOptions = useMemo((): TierRestrictedOptions | undefined => {
    if (!event || spinMode !== "tier_restricted") return undefined;
    const teamTiers = new Map<number, string[]>();
    const activeTeams = event.teams.filter((t) => !t.isFill);
    activeTeams.forEach((team, idx) => {
      if (team.playerTiers && team.playerTiers.length > 0) {
        teamTiers.set(idx, team.playerTiers);
      }
    });
    // Only return if we have tier data for at least some teams
    return teamTiers.size > 0 ? { teamTiers } : undefined;
  }, [event, spinMode]);

  // Check if any teams have tier data (to show/hide the spin mode dropdown)
  const hasTierData = useMemo(() => {
    if (!event) return false;
    return event.teams.some((t) => !t.isFill && t.playerTiers && t.playerTiers.length > 0);
  }, [event]);

  // Invalid - no param provided
  if (!eventId) {
    return (
      <PageShell className="max-w-5xl">
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Event Not Found</h1>
            <p className="text-muted-foreground">
              This event does not exist or the link is invalid.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  // Loading state
  if (event === undefined) {
    return (
      <PageShell className="max-w-5xl">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </PageShell>
    );
  }

  // Not found
  if (event === null) {
    return (
      <PageShell className="max-w-5xl">
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Event Not Found</h1>
            <p className="text-muted-foreground">
              This event does not exist or the link is invalid.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  const lockedGames: number[] = ("lockedGames" in event && event.lockedGames) ? event.lockedGames : [];
  const currentPairings = event.pairings ?? [];
  const gamesGenerated = currentPairings.length;
  const allGamesGenerated = gamesGenerated >= event.games;
  const nextGameNumber = gamesGenerated + 1;

  // Detect number_only event type
  const isNumberOnly = event.eventType === "number_only";
  const numberAssignments: number[] = ("numberAssignments" in event && event.numberAssignments) ? event.numberAssignments : [];
  const hasNumberAssignments = numberAssignments.length > 0;

  // The unified team count is used for pairing (duos + solo-pairs)
  const totalSlots = unifiedTeams.length;
  const hasSolos = solos.length > 0;



  // When all teams have been picked off the wheel, generate pairings from the pick order
  const handleGameComplete = async (orderedIndices: number[]) => {
    // Number-only mode: just save the order as number assignments
    if (isNumberOnly) {
      try {
        await saveNumberAssignments({
          eventId: event._id,
          token: token || undefined,
          assignments: orderedIndices,
        });
        toast.success("Numbers assigned!");
      } catch (err) {
        toast.error("Failed to save number assignments");
        console.error(err);
      }
      return;
    }

    if (allGamesGenerated) return;

    try {
      // Pair teams in the order they were picked: [0,1] = squad 1, [2,3] = squad 2, etc.
      const squads: { duo1Index: number; duo2Index: number }[] = [];
      let byeTeamIndex: number | undefined;

      for (let i = 0; i < orderedIndices.length; i += 2) {
        if (i + 1 < orderedIndices.length) {
          squads.push({ duo1Index: orderedIndices[i], duo2Index: orderedIndices[i + 1] });
        } else {
          // Odd team out gets a bye
          byeTeamIndex = orderedIndices[i];
        }
      }

      const newPairing = { game: nextGameNumber, squads, byeTeamIndex };
      const updatedPairings = [...currentPairings, newPairing];
      await savePairings({
        eventId: event._id,
        token: token || undefined,
        pairings: updatedPairings,
      });
      toast.success(`Game ${nextGameNumber} pairings generated!`);
    } catch (err) {
      toast.error("Failed to generate pairings");
      console.error(err);
    }
  };

  const handleRegenerateGame = async (gameNumber: number) => {
    if (!event.pairings) return;
    try {
      const newPairing = generateSingleGamePairing(
        totalSlots,
        gameNumber,
        event.pairings,
        spinMode === "random" ? pairingOptions : undefined,
        spinMode === "tier_restricted" ? tierRestrictedOptions : undefined,
      );
      await saveSingleGamePairing({
        eventId: event._id,
        token: token || undefined,
        gameNumber,
        pairing: newPairing,
      });
      toast.success(`Game ${gameNumber} regenerated!`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to regenerate game";
      toast.error(errorMsg);
      console.error(err);
    }
  };

  const handleToggleLock = async (gameNumber: number) => {
    try {
      await toggleGameLock({
        eventId: event._id,
        token: token || undefined,
        gameNumber,
      });
    } catch (err) {
      toast.error("Failed to toggle lock");
      console.error(err);
    }
  };

  const handleReset = async () => {
    try {
      if (isNumberOnly) {
        await clearNumberAssignments({
          eventId: event._id,
          token: token || undefined,
        });
        toast.success("Number assignments cleared");
      } else {
        await clearPairings({
          eventId: event._id,
          token: token || undefined,
        });
        toast.success("Pairings cleared");
      }
    } catch (err) {
      toast.error("Failed to reset");
      console.error(err);
    }
  };

  const handleCopyDiscord = async () => {
    if (!event.pairings || event.pairings.length === 0) return;
    const text = formatPairingsForDiscord(event.eventName, event.pairings, unifiedTeams);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard! Paste in Discord.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleExportCSV = () => {
    if (!event.pairings || event.pairings.length === 0) return;
    exportPairingsToCSV(event.eventName, event.pairings, unifiedTeams);
    toast.success("CSV downloaded!");
  };

  const handleSaveLeaderboardUrl = async () => {
    const url = leaderboardUrlInput.trim();
    if (!url) {
      toast.error("Please enter a URL");
      return;
    }
    try {
      await setLeaderboardUrl({
        eventId: event._id,
        token: token || undefined,
        leaderboardUrl: url,
      });
      setEditingLeaderboardUrl(false);
      toast.success("Leaderboard URL saved!");
    } catch {
      toast.error("Failed to save leaderboard URL");
    }
  };

  const leaderboardUrl = ("leaderboardUrl" in event ? event.leaderboardUrl : undefined) ?? "";
  const linkCode = ("linkCode" in event ? event.linkCode : undefined) ?? "";
  const awaitingTeams = event.teams.length === 0;

  // Count label for header
  const entryLabel = hasSolos
    ? `${event.teams.length} duos + ${solos.length} solos`
    : `${event.teams.length} duos`;

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title={event.eventName}
        icon={Trophy}
        variant="compact"
        actions={
          <>
            <Button
              size="sm"
              variant={isUnlocked ? "secondary" : "ghost"}
              className="cursor-pointer"
              onClick={() => {
                if (isUnlocked) {
                  setIsUnlocked(false);
                  toast.success("Controls locked");
                } else {
                  setShowUnlockDialog(true);
                }
              }}
            >
              {isUnlocked ? (
                <><Unlock className="h-4 w-4 mr-1.5" /> Unlocked</>
              ) : (
                <><Lock className="h-4 w-4 mr-1.5" /> Locked</>
              )}
            </Button>
            {isUnlocked && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer"
                  onClick={() => {
                    setEditName(event.eventName);
                    setEditType(event.eventType);
                    setEditGames(String(event.games));
                    setShowEditDialog(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="cursor-pointer text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{event.eventName}" and all its data. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={async () => {
                          try {
                            await deleteEvent({
                              eventId: event._id,
                              token: token || undefined,
                            });
                            toast.success("Event deleted");
                            navigate("/spin");
                          } catch (err) {
                            toast.error("Failed to delete event");
                            console.error(err);
                          }
                        }}
                      >
                        Delete Event
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {isUnlocked && (
              <Button
                size="sm"
                variant={streamerMode ? "default" : "secondary"}
                className="cursor-pointer shrink-0 gap-1.5"
                onClick={() => {
                  setStreamerMode(!streamerMode);
                  toast.success(streamerMode ? "Streamer mode off" : "Streamer mode on — sensitive info hidden");
                }}
              >
                {streamerMode ? (
                  <><EyeOff className="h-4 w-4" /> Streamer</>
                ) : (
                  <><Eye className="h-4 w-4" /> Streamer</>
                )}
              </Button>
            )}
            {currentPairings.length > 0 && isUnlocked && !isNumberOnly && (
              <>
                <Button
                  size="sm"
                  onClick={handleCopyDiscord}
                  variant="secondary"
                  className="cursor-pointer"
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  {copied ? "Copied!" : "Copy for Discord"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleExportCSV}
                  variant="secondary"
                  className="cursor-pointer"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  onClick={handleReset}
                  variant="destructive"
                  className="cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset All
                </Button>
              </>
            )}
            {isNumberOnly && hasNumberAssignments && isUnlocked && (
              <Button
                size="sm"
                onClick={handleReset}
                variant="destructive"
                className="cursor-pointer"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-primary font-medium capitalize">
          {event.eventType.replace(/_/g, " ")}
        </span>
        <span>{event.games} games</span>
        <span>{entryLabel}</span>
        {gamesGenerated > 0 && (
          <span className="font-medium text-foreground">
            {gamesGenerated}/{event.games} generated
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {leaderboardUrl && !editingLeaderboardUrl ? (
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary shrink-0" />
            <a
              href={leaderboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1 cursor-pointer truncate max-w-xs"
            >
              Yunite Leaderboard
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            {isUnlocked && (
              <button
                onClick={() => {
                  setLeaderboardUrlInput(leaderboardUrl);
                  setEditingLeaderboardUrl(true);
                }}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : editingLeaderboardUrl && isUnlocked ? (
          <div className="flex items-center gap-2 w-full max-w-md">
            <Input
              value={leaderboardUrlInput}
              onChange={(e) => setLeaderboardUrlInput(e.target.value)}
              placeholder="https://yunite.xyz/leaderboard/..."
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveLeaderboardUrl();
                if (e.key === "Escape") setEditingLeaderboardUrl(false);
              }}
              autoFocus
            />
            <Button
              size="sm"
              className="h-8 cursor-pointer"
              onClick={handleSaveLeaderboardUrl}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 cursor-pointer"
              onClick={() => setEditingLeaderboardUrl(false)}
            >
              Cancel
            </Button>
          </div>
        ) : !leaderboardUrl && isUnlocked ? (
          <button
            onClick={() => {
              setLeaderboardUrlInput("");
              setEditingLeaderboardUrl(true);
            }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer"
          >
            <Link2 className="h-3.5 w-3.5" />
            Add Yunite leaderboard link
          </button>
        ) : null}
      </div>

      <div className="space-y-4">
        {/* Awaiting teams banner */}
        {awaitingTeams && linkCode && isUnlocked && !streamerMode && (
          <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center space-y-4">
            <Dices className="h-10 w-10 mx-auto text-primary" />
            <h3 className="text-lg font-semibold">Awaiting Teams from Discord</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Use this link code in your Discord <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/scrim</code> command to connect teams to this event.
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="rounded-lg bg-background border px-6 py-3 font-mono text-2xl font-bold tracking-widest select-all">
                {linkCode}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="cursor-pointer"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(linkCode);
                    toast.success("Code copied!");
                  } catch {
                    toast.error("Failed to copy");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Team & solo list */}
        {!awaitingTeams && (
          <>
            <TeamList
              teams={event.teams}
              solos={hasSolos ? solos : undefined}
              isAdmin={isUnlocked}
              onSwap={async (fillTeamIndex, droppedTeamIndex) => {
                try {
                  await swapFillTeam({
                    eventId: event._id,
                    token: token || undefined,
                    fillTeamIndex,
                    droppedTeamIndex,
                  });
                  toast.success("Team swapped in!");
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Failed to swap team";
                  toast.error(msg);
                }
              }}
            />
            {isUnlocked && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="cursor-pointer">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Teams
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all teams?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all teams and solos from this event, along with any generated pairings or number assignments. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        try {
                          await clearTeams({
                            eventId: event._id,
                            token: token || undefined,
                          });
                          toast.success("Teams cleared");
                        } catch (err) {
                          toast.error("Failed to clear teams");
                          console.error(err);
                        }
                      }}
                    >
                      Clear Teams
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}

        {/* Spinning Wheel - visible to everyone */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {isNumberOnly
                ? (hasNumberAssignments ? "Numbers Assigned" : "Spin to Assign Numbers")
                : (allGamesGenerated
                  ? "All Games Generated"
                  : `Spin to Generate Game ${nextGameNumber} of ${event.games}`)}
            </h3>
            <div className="flex items-center gap-2">
              {/* Spin mode selector - only show when tier data is available and controls are unlocked */}
              {!isNumberOnly && hasTierData && isUnlocked && (
                <Select value={spinMode} onValueChange={(v) => setSpinMode(v as "random" | "tier_restricted")}>
                  <SelectTrigger className="w-[200px] h-8 text-xs cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random" className="cursor-pointer">
                      <span className="flex items-center gap-1.5">
                        <Dices className="h-3.5 w-3.5" />
                        Random
                      </span>
                    </SelectItem>
                    <SelectItem value="tier_restricted" className="cursor-pointer">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Tier Restricted
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {/* Show active tier mode indicator for non-admin viewers */}
              {!isNumberOnly && spinMode === "tier_restricted" && !isUnlocked && hasTierData && (
                <span className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Tier Restricted
                </span>
              )}
              {!isNumberOnly && allGamesGenerated && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  Use reroll buttons below to redo specific games
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-8">
            <SpinWheel
              teams={unifiedTeams}
              isAdmin={isUnlocked}
              disabled={isNumberOnly ? (hasNumberAssignments || !isUnlocked) : (allGamesGenerated || !isUnlocked)}
              onGameComplete={handleGameComplete}
              nextGameNumber={isNumberOnly ? undefined : (allGamesGenerated ? undefined : nextGameNumber)}
            />
          </div>
        </div>

        {/* Number Assignments Results (number_only mode) */}
        {isNumberOnly && hasNumberAssignments && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Number Assignments
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {numberAssignments.map((teamIdx, position) => {
                const team = unifiedTeams[teamIdx];
                return (
                  <div
                    key={`${teamIdx}-${position}`}
                    className="flex items-center gap-3 rounded-lg border bg-card p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                      {position + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{team?.teamName ?? "Unknown"}</p>
                      {team?.players && (
                        <p className="text-xs text-muted-foreground truncate">
                          {team.players.join(" & ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pairings (non-number_only modes) */}
        {!isNumberOnly && currentPairings.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Generated Pairings</h2>
              {lockedGames.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  <span>Locked games are preserved during rerolls</span>
                </div>
              )}
            </div>
            <PairingsTable
              pairings={currentPairings}
              teams={unifiedTeams}
              isAdmin={isUnlocked}
              lockedGames={lockedGames}
              onToggleLock={handleToggleLock}
              onRegenerateGame={handleRegenerateGame}
            />
          </div>
        )}

        {/* No pairings yet - empty state */}
        {!isNumberOnly && currentPairings.length === 0 && allGamesGenerated && (
          <div className="rounded-lg border-2 border-dashed p-12 text-center">
            <Dices className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No Pairings Generated Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Spin the wheel above to generate pairings for each game.
            </p>
          </div>
        )}

        {/* Discord Bot Setup Info - only visible when unlocked, not number_only, and not in streamer mode */}
        {isUnlocked && !isNumberOnly && !streamerMode && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Discord Bot Setup
          </h3>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm text-muted-foreground">
              To create scrim events directly from Discord, set up a bot with the following slash command:
            </p>
            <div className="rounded-lg bg-muted/50 p-4 font-mono text-xs space-y-2 overflow-x-auto">
              <p className="font-sans text-sm font-medium text-foreground mb-2">
                /scrim command parameters:
              </p>
              <div className="space-y-1 text-muted-foreground">
                <p><span className="text-primary">event_name</span> - Name of the scrim event</p>
                <p><span className="text-primary">games</span> - Number of games (1-10)</p>
                <p><span className="text-primary">duos</span> - Comma-separated list of duo names (e.g. "Team1, Team2, Team3")</p>
                <p><span className="text-primary">players</span> - Comma-separated player pairs matching duo order (e.g. "P1+P2, P3+P4, P5+P6")</p>
                <p><span className="text-primary">solos</span> - <span className="italic">(optional)</span> Comma-separated solo player names (e.g. "Player7, Player8")</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              The bot should POST to your app's <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/scrim-events</code> endpoint. Solo players are randomly paired into temporary duos before squad generation.
            </p>
          </div>
        </div>
        )}
      </div>

      {/* Unlock Dialog - uses password field so code is not visible on screen share */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Enter Admin Code</DialogTitle>
            <DialogDescription>
              Enter the event admin code to unlock controls.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              type="password"
              value={unlockCode}
              onChange={(e) => {
                setUnlockCode(e.target.value);
                setUnlockError(false);
              }}
              placeholder="Admin code"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUnlock();
              }}
              autoFocus
            />
            {unlockError && (
              <p className="text-sm text-destructive">Incorrect code. Try again.</p>
            )}
            <Button
              className="w-full cursor-pointer"
              onClick={handleUnlock}
              disabled={!unlockCode.trim()}
            >
              <Unlock className="h-4 w-4 mr-2" />
              Unlock Controls
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>
              Update the event name, type, or number of games.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Event Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Event name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Event Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="duos_into_squads" className="cursor-pointer">Duos into Squads</SelectItem>
                  <SelectItem value="duos_and_solos" className="cursor-pointer">Duos and Solos</SelectItem>
                  <SelectItem value="number_only" className="cursor-pointer">Number Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-games">Number of Games</Label>
              <Select value={editGames} onValueChange={setEditGames}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)} className="cursor-pointer">
                      {n} {n === 1 ? "game" : "games"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" className="cursor-pointer" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              disabled={editSaving || !editName.trim()}
              onClick={async () => {
                setEditSaving(true);
                try {
                  await updateEvent({
                    eventId: event._id,
                    token: token || undefined,
                    eventName: editName.trim(),
                    eventType: editType,
                    games: parseInt(editGames, 10) || 5,
                  });
                  setShowEditDialog(false);
                  toast.success("Event updated!");
                } catch (err) {
                  toast.error("Failed to update event");
                  console.error(err);
                } finally {
                  setEditSaving(false);
                }
              }}
            >
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}


