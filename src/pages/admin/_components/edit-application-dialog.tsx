import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import GirlRoleVerificationStatus from "@/components/girl-role-verification-status.tsx";
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

type ApplicationData = {
  _id: Id<"applications">;
  discordUsername: string;
  discordId: string;
  fortniteProfileLink: string;
  playerId?: Id<"players">;
};

type EditApplicationDialogProps = {
  application: ApplicationData | null;
  onClose: () => void;
};

export default function EditApplicationDialog({ application, onClose }: EditApplicationDialogProps) {
  const [step, setStep] = useState<"info" | "evaluation">("info");
  const [discordUsername, setDiscordUsername] = useState("");
  const [epicUsername, setEpicUsername] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [scores, setScores] = useState<ScoreState>(INITIAL_SCORES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoresLoaded, setScoresLoaded] = useState(false);

  const updateApplication = useMutation(api.memberManagement.updateApplication);
  const createOrUpdateScore = useMutation(api.scores.createOrUpdateScore);
  const createPlayerForApplication = useMutation(api.memberManagement.createPlayerForApplication);

  // Fetch existing scores if the application has a linked player
  const existingScore = useQuery(
    api.scores.getPlayerScore,
    application?.playerId ? { playerId: application.playerId } : "skip"
  );

  const playerProfile = useQuery(
    api.players.getPlayerProfile,
    application?.playerId ? { id: application.playerId } : "skip",
  );

  // Initialize form with application data
  useEffect(() => {
    if (application) {
      setDiscordUsername(application.discordUsername);
      setEpicUsername(application.fortniteProfileLink.split("/").pop() || "");
      setDiscordId(application.discordId || "");
      setStep("info");
      setScoresLoaded(false);
    }
  }, [application]);

  // Load existing scores when they become available
  useEffect(() => {
    if (existingScore && !scoresLoaded) {
      setScores({
        thirdPartyExperience: existingScore.thirdPartyExperience ?? 0,
        thirdPartyPerformance: existingScore.thirdPartyPerformance ?? 0,
        inGameTourneyPerformance: existingScore.inGameTourneyPerformance ?? 0,
        officialEarnings: existingScore.officialEarnings ?? 0,
        rankedPerformance: existingScore.rankedPerformance ?? 0,
        hoursPlayed: existingScore.hoursPlayed ?? 0,
        notorietyTeammates: existingScore.notorietyTeammates ?? 0,
        age: existingScore.age ?? 0,
        gender: existingScore.gender ?? 0,
        ability: existingScore.ability ?? 0,
        region: existingScore.region ?? 0,
        gameSense: existingScore.gameSense ?? 0,
        seasonPerformance: existingScore.seasonPerformance ?? 0,
        modifiers: existingScore.modifiers ?? 0,
      });
      setScoresLoaded(true);
    } else if ((existingScore === null || existingScore === undefined) && !scoresLoaded && application) {
      // Reset to initial scores when no existing score found or query is skipped (no playerId)
      setScores(INITIAL_SCORES);
      setScoresLoaded(true);
    }
  }, [existingScore, scoresLoaded, application]);

  const totalScore = Object.values(scores).reduce<number>((sum, score) => sum + (typeof score === "number" ? score : 0), 0);
  const tier = calculateTier(totalScore);

  const handleClose = () => {
    setStep("info");
    setScoresLoaded(false);
    onClose();
  };

  const handleNext = () => {
    if (!discordUsername.trim() || !epicUsername.trim()) {
      toast.error("Discord and Epic usernames are required");
      return;
    }
    setStep("evaluation");
  };

  const handleSubmit = async () => {
    if (!application) return;
    setIsSubmitting(true);
    try {
      // Step 1: Update application details
      await updateApplication({
        applicationId: application._id,
        discordUsername: discordUsername.trim(),
        epicUsername: epicUsername.trim(),
        discordId: discordId.trim() || undefined,
      });

      // Step 2: Save evaluation scores
      const hasScores = Object.values(scores).some((v) => typeof v === "number");
      if (hasScores) {
        let playerId = application.playerId;

        // If no player record exists yet, create one
        if (!playerId) {
          playerId = await createPlayerForApplication({ applicationId: application._id });
        }

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
        });
      }

      toast.success("Application and evaluation updated");
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update application");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveInfoOnly = async () => {
    if (!application) return;
    if (!discordUsername.trim() || !epicUsername.trim()) {
      toast.error("Discord and Epic usernames are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await updateApplication({
        applicationId: application._id,
        discordUsername: discordUsername.trim(),
        epicUsername: epicUsername.trim(),
        discordId: discordId.trim() || undefined,
      });
      toast.success("Application updated");
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update application");
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

  if (!application) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size={step === "evaluation" ? "lg" : "sm"}>
        <DialogHeader>
          <DialogTitle>
            {step === "info" ? "Edit Application" : "Edit Evaluation Scores"}
          </DialogTitle>
          <DialogDescription>
            {step === "info"
              ? "Update application details, then optionally edit the evaluation"
              : `Evaluate ${discordUsername} - Rate each category from 0-100`}
          </DialogDescription>
        </DialogHeader>

        {step === "info" && (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-discord-username">Discord Username *</Label>
                <Input
                  id="edit-discord-username"
                  placeholder="username"
                  value={discordUsername}
                  onChange={(e) => setDiscordUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-epic-username">Epic Username *</Label>
                <Input
                  id="edit-epic-username"
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
              <div className="space-y-2">
                <Label htmlFor="edit-discord-id">Discord ID</Label>
                <Input
                  id="edit-discord-id"
                  placeholder="123456789012345678"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Optional - can be linked later</p>
              </div>
            </div>
            <DialogFooter className="flex justify-between sm:justify-between">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleSaveInfoOnly} disabled={isSubmitting} className="cursor-pointer">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Info Only
                </Button>
                <Button onClick={handleNext} className="cursor-pointer">
                  Edit Evaluation
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
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
                    variant={tier === t ? "default" : "outline"}
                    className="cursor-pointer min-w-[48px]"
                    onClick={() => setScores(TIER_PRESETS[t])}
                  >
                    {t} Tier
                  </Button>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`edit-score-${key}`} className="text-sm font-medium">
                      {label}
                    </Label>
                    {key === "gender" ? (
                      <Select
                        value={scores.gender === 100 ? "100" : scores.gender === 50 ? "50" : ""}
                        onValueChange={(value) => {
                          setScores({ ...scores, gender: parseInt(value) });
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
                        id={`edit-score-${key}`}
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

              {scores.gender === 50 && (
                <GirlRoleVerificationStatus
                  femaleVerified={playerProfile?.femaleVerified ?? false}
                  verificationMethod={playerProfile?.verificationMethod}
                  loading={!!application?.playerId && playerProfile === undefined}
                  noPlayerHint={!application?.playerId}
                />
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
              <Button variant="outline" onClick={() => setStep("info")} className="cursor-pointer">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="cursor-pointer">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save All Changes"
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
