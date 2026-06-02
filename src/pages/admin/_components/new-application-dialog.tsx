import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Loader2, ArrowRight, ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";

type ScoreState = {
  thirdPartyExperience: number | "";
  thirdPartyPerformance: number | "";
  inGameTourneyPerformance: number | "";
  officialEarnings: number | "";
  rankedPerformance: number | "";
  hoursPlayed: number | "";
  notorietyTeammates: number | "";
  age: number | "";
  gender: number | "";
  ability: number | "";
  region: number | "";
  gameSense: number | "";
  seasonPerformance: number | "";
  modifiers: number | "";
};

const INITIAL_SCORES: ScoreState = {
  thirdPartyExperience: "",
  thirdPartyPerformance: "",
  inGameTourneyPerformance: "",
  officialEarnings: "",
  rankedPerformance: "",
  hoursPlayed: "",
  notorietyTeammates: "",
  age: "",
  gender: "",
  ability: "",
  region: "",
  gameSense: "",
  seasonPerformance: "",
  modifiers: "",
};

const CATEGORIES: { key: keyof ScoreState; label: string }[] = [
  { key: "thirdPartyExperience", label: "3rd Party Experience" },
  { key: "thirdPartyPerformance", label: "3rd Party Performance" },
  { key: "inGameTourneyPerformance", label: "In Game Tourney Performance" },
  { key: "officialEarnings", label: "Official Earnings" },
  { key: "rankedPerformance", label: "Ranked Performance" },
  { key: "hoursPlayed", label: "Hours Played" },
  { key: "notorietyTeammates", label: "Notoriety/Teammates" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "ability", label: "Ability" },
  { key: "region", label: "Region" },
  { key: "gameSense", label: "Game Sense" },
  { key: "seasonPerformance", label: "Season Performance" },
  { key: "modifiers", label: "Modifiers" },
];

function calculateTier(totalScore: number): string {
  if (totalScore >= 1000) return "S";
  if (totalScore >= 850) return "A";
  if (totalScore >= 700) return "B";
  return "C";
}

function getTierColor(tier: string): "default" | "secondary" | "destructive" {
  if (tier === "S") return "default";
  if (tier === "A") return "secondary";
  return "secondary";
}

// Preset score values per category for each tier
// Values are multiples of 5 to match the rounding behavior
const TIER_PRESETS: Record<"S" | "A" | "B" | "C", ScoreState> = {
  S: {
    thirdPartyExperience: 80,
    thirdPartyPerformance: 80,
    inGameTourneyPerformance: 80,
    officialEarnings: 80,
    rankedPerformance: 80,
    hoursPlayed: 80,
    notorietyTeammates: 80,
    age: 80,
    gender: 100,
    ability: 80,
    region: 80,
    gameSense: 80,
    seasonPerformance: 80,
    modifiers: 0,
  },
  A: {
    thirdPartyExperience: 70,
    thirdPartyPerformance: 70,
    inGameTourneyPerformance: 70,
    officialEarnings: 70,
    rankedPerformance: 70,
    hoursPlayed: 70,
    notorietyTeammates: 70,
    age: 70,
    gender: 100,
    ability: 70,
    region: 70,
    gameSense: 70,
    seasonPerformance: 70,
    modifiers: 0,
  },
  B: {
    thirdPartyExperience: 55,
    thirdPartyPerformance: 55,
    inGameTourneyPerformance: 55,
    officialEarnings: 55,
    rankedPerformance: 55,
    hoursPlayed: 55,
    notorietyTeammates: 55,
    age: 55,
    gender: 100,
    ability: 55,
    region: 55,
    gameSense: 55,
    seasonPerformance: 55,
    modifiers: 0,
  },
  C: {
    thirdPartyExperience: 35,
    thirdPartyPerformance: 35,
    inGameTourneyPerformance: 35,
    officialEarnings: 35,
    rankedPerformance: 35,
    hoursPlayed: 35,
    notorietyTeammates: 35,
    age: 35,
    gender: 100,
    ability: 35,
    region: 35,
    gameSense: 35,
    seasonPerformance: 35,
    modifiers: 0,
  },
};

type NewApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PlayerScoreRecord = {
  thirdPartyExperience: number;
  thirdPartyPerformance: number;
  inGameTourneyPerformance: number;
  officialEarnings: number;
  rankedPerformance: number;
  hoursPlayed: number;
  notorietyTeammates: number;
  age: number;
  gender: number;
  ability: number;
  region: number;
  gameSense: number;
  seasonPerformance?: number;
  modifiers?: number;
  femaleVerified?: boolean;
  verificationMethod?: string;
};

function scoreRecordToState(score: PlayerScoreRecord): ScoreState {
  return {
    thirdPartyExperience: score.thirdPartyExperience,
    thirdPartyPerformance: score.thirdPartyPerformance,
    inGameTourneyPerformance: score.inGameTourneyPerformance,
    officialEarnings: score.officialEarnings,
    rankedPerformance: score.rankedPerformance,
    hoursPlayed: score.hoursPlayed,
    notorietyTeammates: score.notorietyTeammates,
    age: score.age,
    gender: score.gender,
    ability: score.ability,
    region: score.region,
    gameSense: score.gameSense,
    seasonPerformance: score.seasonPerformance ?? 0,
    modifiers: score.modifiers ?? 0,
  };
}

const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  former: "Former",
  rejected: "Rejected",
};

export default function NewApplicationDialog({ open, onOpenChange }: NewApplicationDialogProps) {
  const [step, setStep] = useState<"info" | "evaluation">("info");
  const [discordUsername, setDiscordUsername] = useState("");
  const [epicUsername, setEpicUsername] = useState("");
  const [beenMemberBefore, setBeenMemberBefore] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [linkedPlayerId, setLinkedPlayerId] = useState<Id<"players"> | null>(null);
  const [scores, setScores] = useState<ScoreState>(INITIAL_SCORES);
  const [femaleVerified, setFemaleVerified] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<"ID" | "FACECAM" | "TRUSTED SERVER" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitApplication = useMutation(api.memberManagement.submitApplication);
  const createPlayerForApplication = useMutation(api.memberManagement.createPlayerForApplication);
  const createOrUpdateScore = useMutation(api.scores.createOrUpdateScore);

  const memberSearchResults = useQuery(
    api.memberManagement.searchPlayersForApplicationLink,
    open && beenMemberBefore && memberSearch.length >= 2
      ? { search: memberSearch }
      : "skip",
  );

  const linkedPlayerScore = useQuery(
    api.scores.getPlayerScore,
    open && linkedPlayerId ? { playerId: linkedPlayerId } : "skip",
  );

  const prefilledPlayerIdRef = useRef<Id<"players"> | null>(null);

  useEffect(() => {
    if (step !== "evaluation" || !linkedPlayerId || linkedPlayerScore === undefined) {
      return;
    }
    if (prefilledPlayerIdRef.current === linkedPlayerId) {
      return;
    }
    prefilledPlayerIdRef.current = linkedPlayerId;
    if (linkedPlayerScore) {
      setScores(scoreRecordToState(linkedPlayerScore));
      setFemaleVerified(linkedPlayerScore.femaleVerified ?? false);
      setVerificationMethod(
        (linkedPlayerScore.verificationMethod as "ID" | "FACECAM" | "TRUSTED SERVER") ?? "",
      );
    }
  }, [step, linkedPlayerId, linkedPlayerScore]);

  const totalScore = Object.values(scores).reduce<number>((sum, score) => sum + (typeof score === "number" ? score : 0), 0);
  const tier = calculateTier(totalScore);

  const selectedLinkedPlayer = useMemo(
    () => memberSearchResults?.find((p) => p._id === linkedPlayerId) ?? null,
    [memberSearchResults, linkedPlayerId],
  );

  const resetForm = () => {
    setStep("info");
    setDiscordUsername("");
    setEpicUsername("");
    setBeenMemberBefore(false);
    setMemberSearch("");
    setLinkedPlayerId(null);
    prefilledPlayerIdRef.current = null;
    setScores(INITIAL_SCORES);
    setFemaleVerified(false);
    setVerificationMethod("");
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const handleNext = () => {
    if (!discordUsername.trim() || !epicUsername.trim()) {
      toast.error("Both fields are required");
      return;
    }
    if (beenMemberBefore && !linkedPlayerId) {
      toast.error("Select the existing member to link this application to");
      return;
    }
    if (!linkedPlayerId) {
      setScores(INITIAL_SCORES);
      setFemaleVerified(false);
      setVerificationMethod("");
    }
    setStep("evaluation");
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Step 1: Create the application
      const applicationId = await submitApplication({
        discordUsername: discordUsername.trim(),
        epicUsername: epicUsername.trim(),
        existingPlayerId: linkedPlayerId ?? undefined,
      });

      // Step 2: Create a player record for evaluation
      const playerId = await createPlayerForApplication({ applicationId });

      // Step 3: Save evaluation scores (if any were filled in)
      const hasScores = Object.values(scores).some((v) => typeof v === "number");
      if (hasScores) {
        await createOrUpdateScore({
          playerId,
          thirdPartyExperience: typeof scores.thirdPartyExperience === "number" ? scores.thirdPartyExperience : 0,
          thirdPartyPerformance: typeof scores.thirdPartyPerformance === "number" ? scores.thirdPartyPerformance : 0,
          inGameTourneyPerformance: typeof scores.inGameTourneyPerformance === "number" ? scores.inGameTourneyPerformance : 0,
          officialEarnings: typeof scores.officialEarnings === "number" ? scores.officialEarnings : 0,
          rankedPerformance: typeof scores.rankedPerformance === "number" ? scores.rankedPerformance : 0,
          hoursPlayed: typeof scores.hoursPlayed === "number" ? scores.hoursPlayed : 0,
          notorietyTeammates: typeof scores.notorietyTeammates === "number" ? scores.notorietyTeammates : 0,
          age: typeof scores.age === "number" ? scores.age : 0,
          gender: typeof scores.gender === "number" ? scores.gender : 0,
          ability: typeof scores.ability === "number" ? scores.ability : 0,
          region: typeof scores.region === "number" ? scores.region : 0,
          gameSense: typeof scores.gameSense === "number" ? scores.gameSense : 0,
          seasonPerformance: typeof scores.seasonPerformance === "number" ? scores.seasonPerformance : 0,
          modifiers: typeof scores.modifiers === "number" ? scores.modifiers : 0,
          femaleVerified: scores.gender === 50 && femaleVerified ? femaleVerified : undefined,
          verificationMethod: scores.gender === 50 && femaleVerified && verificationMethod ? verificationMethod as "ID" | "FACECAM" | "TRUSTED SERVER" : undefined,
        });
      }

      toast.success(
        linkedPlayerId
          ? "Application submitted and linked to existing member"
          : "Application submitted with evaluation",
      );
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit application");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateScore = (category: keyof ScoreState, value: string) => {
    if (value === "") {
      setScores({ ...scores, [category]: "" });
      return;
    }
    const numValue = parseInt(value);
    if (isNaN(numValue)) return;
    const maxValue = category === "modifiers" ? null : 100;
    const clampedValue = maxValue === null
      ? Math.max(0, numValue)
      : Math.max(0, Math.min(maxValue, numValue));
    setScores({ ...scores, [category]: clampedValue });
  };

  const handleBlur = (category: keyof ScoreState) => {
    const currentValue = scores[category];
    if (currentValue === "") return;
    const maxValue = category === "modifiers" ? null : 100;
    const bounded = maxValue === null
      ? Math.max(0, currentValue)
      : Math.max(0, Math.min(maxValue, currentValue));
    const rounded = Math.round(bounded / 5) * 5;
    if (rounded !== currentValue) {
      setScores({ ...scores, [category]: rounded });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size={step === "evaluation" ? "lg" : beenMemberBefore ? "md" : "sm"}>
        <DialogHeader>
          <DialogTitle>
            {step === "info" ? "New Application" : "Evaluation Scores"}
          </DialogTitle>
          <DialogDescription>
            {step === "info"
              ? "Enter the applicant's details"
              : linkedPlayerId
                ? `Re-evaluate ${discordUsername} (linked to existing member) — Rate each category from 0-100`
                : `Evaluate ${discordUsername} - Rate each category from 0-100`}
          </DialogDescription>
        </DialogHeader>

        {step === "info" && (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-discord-username">Discord Username *</Label>
                <Input
                  id="new-discord-username"
                  placeholder="username"
                  value={discordUsername}
                  onChange={(e) => setDiscordUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-epic-username">Epic Username *</Label>
                <Input
                  id="new-epic-username"
                  placeholder="EpicPlayer123"
                  value={epicUsername}
                  onChange={(e) => setEpicUsername(e.target.value)}
                />
                {epicUsername.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Profile:{" "}
                    <a
                      href={`https://fortnitetracker.com/profile/all/${encodeURIComponent(epicUsername.trim())}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      fortnitetracker.com/profile/all/{epicUsername.trim()}
                    </a>
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t">
                <Checkbox
                  id="been-member-before"
                  checked={beenMemberBefore}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    setBeenMemberBefore(isChecked);
                    if (!isChecked) {
                      setMemberSearch("");
                      setLinkedPlayerId(null);
                    }
                  }}
                />
                <Label htmlFor="been-member-before" className="text-sm font-medium cursor-pointer">
                  Been a member before?
                </Label>
              </div>

              {beenMemberBefore && (
                <div className="space-y-3 rounded-lg border p-3 bg-muted/50">
                  <p className="text-xs text-muted-foreground">
                    Search for their existing record. New Discord and Epic details above will update that member when you submit.
                  </p>
                  <Input
                    placeholder="Search by Discord or Epic username..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                  {memberSearch.length > 0 && memberSearch.length < 2 && (
                    <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
                  )}
                  {memberSearch.length >= 2 && memberSearchResults === undefined && (
                    <Skeleton className="h-32 w-full" />
                  )}
                  {memberSearch.length >= 2 && memberSearchResults?.length === 0 && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      No matching members found
                    </p>
                  )}
                  {memberSearchResults && memberSearchResults.length > 0 && (
                    <ScrollArea className="h-40 rounded-md border bg-background">
                      <div className="p-1 space-y-1">
                        {memberSearchResults.map((player) => (
                          <button
                            key={player._id}
                            type="button"
                            onClick={() => setLinkedPlayerId(player._id)}
                            className={`w-full p-2 rounded-md border text-left text-sm transition-colors ${
                              linkedPlayerId === player._id
                                ? "bg-primary text-primary-foreground border-primary"
                                : "hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{player.epicUsername}</span>
                              <span className="opacity-80">({player.discordUsername})</span>
                              {player.tier && (
                                <Badge variant="outline" className="text-xs">
                                  Tier {player.tier}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {MEMBERSHIP_STATUS_LABEL[player.currentMembershipStatus ?? ""] ??
                                  player.currentMembershipStatus}
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  {linkedPlayerId && selectedLinkedPlayer && (
                    <p className="text-xs text-primary">
                      Linked to {selectedLinkedPlayer.epicUsername} — existing evaluation will pre-fill on the next step.
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleNext} className="cursor-pointer">
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "evaluation" && (
          <>
            <DialogBody className="space-y-6 pr-2">
              {/* Tier preset auto-fill buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground mr-1">Auto-fill:</span>
                {(["S", "A", "B", "C"] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={tier === t ? "default" : "secondary"}
                    className="cursor-pointer min-w-[48px]"
                    onClick={() => {
                      setScores(TIER_PRESETS[t]);
                      setFemaleVerified(false);
                      setVerificationMethod("");
                    }}
                  >
                    {t} Tier
                  </Button>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`new-${key}`} className="text-sm font-medium">
                      {label}
                    </Label>
                    {key === "gender" ? (
                      <Select
                        value={scores.gender === 100 ? "100" : scores.gender === 50 ? "50" : ""}
                        onValueChange={(value) => {
                          setScores({ ...scores, gender: parseInt(value) });
                          if (parseInt(value) !== 50) {
                            setFemaleVerified(false);
                            setVerificationMethod("");
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select value..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`new-${key}`}
                        type="number"
                        min="0"
                        max={key === "modifiers" ? "500" : "100"}
                        value={scores[key]}
                        onChange={(e) => updateScore(key, e.target.value)}
                        onBlur={() => handleBlur(key)}
                        className="w-full"
                        placeholder={key === "modifiers" ? "0" : "0-100"}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Female Verification Section */}
              {scores.gender === 50 && (
                <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="new-femaleVerified"
                      checked={femaleVerified}
                      onCheckedChange={(checked) => {
                        setFemaleVerified(checked as boolean);
                        if (!checked) setVerificationMethod("");
                      }}
                    />
                    <Label htmlFor="new-femaleVerified" className="text-sm font-medium cursor-pointer">
                      Female Verified?
                    </Label>
                  </div>
                  {femaleVerified && (
                    <div className="space-y-2">
                      <Label htmlFor="new-verificationMethod" className="text-sm font-medium">
                        Verification Method
                      </Label>
                      <Select
                        value={verificationMethod}
                        onValueChange={(value) => setVerificationMethod(value as "ID" | "FACECAM" | "TRUSTED SERVER")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select method..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ID">ID</SelectItem>
                          <SelectItem value="FACECAM">FACECAM</SelectItem>
                          <SelectItem value="TRUSTED SERVER">TRUSTED SERVER</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Score Summary */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>Total Score:</span>
                  <span>{totalScore} / 1900</span>
                </div>
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>Tier:</span>
                  <Badge variant={getTierColor(tier)} className="text-xl font-bold px-4 py-1">
                    {tier}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  <div>C: &lt;700 | B: 700-849 | A: 850-999 | S: 1000+</div>
                  <div className="mt-1 text-muted-foreground/80">Base: 1300 + Modifiers (no max)</div>
                </div>
              </div>
            </DialogBody>

            <div className="flex justify-between border-t pt-4 mt-4">
              <Button variant="secondary" onClick={() => setStep("info")} className="cursor-pointer">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="cursor-pointer">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Application"
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
