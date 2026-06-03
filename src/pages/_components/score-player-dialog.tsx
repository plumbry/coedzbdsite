import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import GirlRoleVerificationStatus from "@/components/girl-role-verification-status.tsx";
import { toast } from "sonner";

interface ScorePlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: Id<"players">;
}

interface ScoreState {
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
  modifiers: number | "";
}

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
const INITIAL_SCORES: ScoreState = {
  thirdPartyExperience: "",
  thirdPartyPerformance: "",
  inGameTourneyPerformance: "",
  officialEarnings: 0,
  rankedPerformance: "",
  hoursPlayed: "",
  notorietyTeammates: "",
  age: "",
  gender: "",
  ability: 100,
  region: 100,
  gameSense: "",
  modifiers: "",
};

function scoreRecordToState(score: {
  thirdPartyExperience?: number;
  thirdPartyPerformance?: number;
  inGameTourneyPerformance?: number;
  officialEarnings?: number;
  rankedPerformance?: number;
  hoursPlayed?: number;
  notorietyTeammates?: number;
  age?: number;
  gender?: number;
  ability?: number;
  region?: number;
  gameSense?: number;
  modifiers?: number;
}): ScoreState {
  return {
    thirdPartyExperience: score.thirdPartyExperience ?? "",
    thirdPartyPerformance: score.thirdPartyPerformance ?? "",
    inGameTourneyPerformance: score.inGameTourneyPerformance ?? "",
    officialEarnings: score.officialEarnings ?? 0,
    rankedPerformance: score.rankedPerformance ?? "",
    hoursPlayed: score.hoursPlayed ?? "",
    notorietyTeammates: score.notorietyTeammates ?? "",
    age: score.age ?? "",
    gender:
      score.gender === 50 || score.gender === 100 ? score.gender : "",
    ability: score.ability ?? 100,
    region: score.region ?? 100,
    gameSense: score.gameSense ?? "",
    modifiers: score.modifiers ?? "",
  };
}

const TIER_PRESETS: Record<"S" | "A" | "B" | "C", ScoreState> = {
  S: {
    thirdPartyExperience: 80,
    thirdPartyPerformance: 80,
    inGameTourneyPerformance: 80,
    officialEarnings: 0,
    rankedPerformance: 80,
    hoursPlayed: 80,
    notorietyTeammates: 80,
    age: 80,
    gender: 100,
    ability: 100,
    region: 100,
    gameSense: 80,
    modifiers: 0,
  },
  A: {
    thirdPartyExperience: 70,
    thirdPartyPerformance: 70,
    inGameTourneyPerformance: 70,
    officialEarnings: 0,
    rankedPerformance: 70,
    hoursPlayed: 70,
    notorietyTeammates: 70,
    age: 70,
    gender: 100,
    ability: 100,
    region: 100,
    gameSense: 70,
    modifiers: 0,
  },
  B: {
    thirdPartyExperience: 55,
    thirdPartyPerformance: 55,
    inGameTourneyPerformance: 55,
    officialEarnings: 0,
    rankedPerformance: 55,
    hoursPlayed: 55,
    notorietyTeammates: 55,
    age: 55,
    gender: 100,
    ability: 100,
    region: 100,
    gameSense: 55,
    modifiers: 0,
  },
  C: {
    thirdPartyExperience: 35,
    thirdPartyPerformance: 35,
    inGameTourneyPerformance: 35,
    officialEarnings: 0,
    rankedPerformance: 35,
    hoursPlayed: 35,
    notorietyTeammates: 35,
    age: 35,
    gender: 100,
    ability: 100,
    region: 100,
    gameSense: 35,
    modifiers: 0,
  },
};

export default function ScorePlayerDialog({ open, onOpenChange, playerId }: ScorePlayerDialogProps) {
  const player = useQuery(
    api.players.getPlayerProfile,
    open ? { id: playerId } : "skip",
  );
  const existingScore = useQuery(
    api.scores.getPlayerScore,
    open ? { playerId } : "skip",
  );
  const createOrUpdateScore = useMutation(api.scores.createOrUpdateScore);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scores, setScores] = useState<ScoreState>(INITIAL_SCORES);

  useEffect(() => {
    if (!open || existingScore === undefined) {
      return;
    }
    setScores(existingScore ? scoreRecordToState(existingScore) : INITIAL_SCORES);
  }, [open, playerId, existingScore]);

  const isLoadingScores = open && existingScore === undefined;
  
  const currentPlayer = player;
  const totalScore = Object.values(scores).reduce((sum, score) => sum + (typeof score === "number" ? score : 0), 0);
  const tier = calculateTier(totalScore);
  
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSubmitting(true);
    
    try {
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
        seasonPerformance: 0,
        modifiers: typeof scores.modifiers === "number" ? scores.modifiers : 0,
      });
      
      toast.success("Player evaluation saved successfully!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to save evaluation. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const updateScore = (category: keyof ScoreState, value: string) => {
    // Allow empty string
    if (value === "") {
      setScores({ ...scores, [category]: "" });
      return;
    }
    
    const numValue = parseInt(value);
    if (isNaN(numValue)) return;
    
    // Modifiers have no maximum, other categories capped at 100
    const maxValue = category === "modifiers" ? null : 100;
    const clampedValue = maxValue === null 
      ? Math.max(0, numValue) 
      : Math.max(0, Math.min(maxValue, numValue));
    setScores({ ...scores, [category]: clampedValue });
  };
  
  const handleBlur = (category: keyof ScoreState) => {
    const currentValue = scores[category];
    
    // If empty, leave it empty
    if (currentValue === "") return;
    
    // Round to nearest multiple of 5 when user finishes editing
    const maxValue = category === "modifiers" ? null : 100;
    
    // Ensure value is within bounds (minimum 0, and max if applicable)
    const bounded = maxValue === null 
      ? Math.max(0, currentValue) 
      : Math.max(0, Math.min(maxValue, currentValue));
    const rounded = Math.round(bounded / 5) * 5;
    
    if (rounded !== currentValue) {
      setScores({ ...scores, [category]: rounded });
    }
  };
  
  const categories: { key: keyof ScoreState; label: string }[] = [
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
    { key: "modifiers", label: "Modifiers" },
  ];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Evaluate Player</DialogTitle>
          <DialogDescription>
            {currentPlayer?.discordUsername} - Rate each category from 0-100
          </DialogDescription>
        </DialogHeader>
        
        <DialogBody className="flex-1 min-h-0">
        <form onSubmit={handleSubmit} className="space-y-6 pr-2">
          {isLoadingScores && (
            <p className="text-sm text-muted-foreground">Loading evaluation…</p>
          )}
          {!isLoadingScores && existingScore === null && player?.tier && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No saved evaluation categories for this player yet. Their tier ({player.tier}) may have been set outside the evaluation form.
            </p>
          )}
          {/* Tier preset auto-fill buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground mr-1">Auto-fill:</span>
            {(["S", "A", "B", "C"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={tier === t ? "default" : "secondary"}
                className="cursor-pointer min-w-[48px]"
                onClick={() => setScores(TIER_PRESETS[t])}
              >
                {t} Tier
              </Button>
            ))}
          </div>

          <div
            className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 ${isLoadingScores ? "opacity-50 pointer-events-none" : ""}`}
          >
            {categories.map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="text-sm font-medium">
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
                ) : key === "modifiers" ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="cursor-pointer px-2 shrink-0"
                      onClick={() => {
                        const current = typeof scores.modifiers === "number" ? scores.modifiers : 0;
                        setScores({ ...scores, modifiers: Math.max(0, current - 50) });
                      }}
                    >
                      -50
                    </Button>
                    <Input
                      id={key}
                      type="number"
                      min="0"
                      max="500"
                      value={scores[key]}
                      onChange={(e) => updateScore(key, e.target.value)}
                      onBlur={() => handleBlur(key)}
                      className="w-full"
                      placeholder="0"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="cursor-pointer px-2 shrink-0"
                      onClick={() => {
                        const current = typeof scores.modifiers === "number" ? scores.modifiers : 0;
                        setScores({ ...scores, modifiers: current + 50 });
                      }}
                    >
                      +50
                    </Button>
                  </div>
                ) : (
                  <Input
                    id={key}
                    type="number"
                    min="0"
                    max="100"
                    value={scores[key]}
                    onChange={(e) => updateScore(key, e.target.value)}
                    onBlur={() => handleBlur(key)}
                    className="w-full"
                    placeholder="0-100"
                  />
                )}
              </div>
            ))}
          </div>
          
          {scores.gender === 50 && (
            <GirlRoleVerificationStatus
              femaleVerified={player?.femaleVerified ?? false}
              verificationMethod={player?.verificationMethod}
              loading={player === undefined}
            />
          )}
          
          {/* Score Summary */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total Score:</span>
              <span>{totalScore} / 1800</span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Tier:</span>
              <Badge variant={getTierColor(tier)} className="text-xl font-bold px-4 py-1">
                {tier}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              <div>C: &lt;700 | B: 700-849 | A: 850-999 | S: 1000+</div>
              <div className="mt-1 text-muted-foreground/80">Base: 1200 + Modifiers (no max)</div>
            </div>
          </div>
        </form>
        </DialogBody>
        
        <div className="flex justify-end gap-3 border-t pt-4 mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isLoadingScores}>
            {isSubmitting ? "Saving..." : "Save Evaluation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
