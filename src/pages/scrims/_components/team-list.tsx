import { Users, User, Shield, ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";

type Team = {
  teamName: string;
  players: string[];
  playerTiers?: string[];
  isFill?: boolean;
};

type Solo = {
  playerName: string;
};

type TeamListProps = {
  teams: Team[];
  solos?: Solo[];
  isAdmin?: boolean;
  onSwap?: (fillTeamIndex: number, droppedTeamIndex: number) => void;
};

export default function TeamList({
  teams,
  solos,
  isAdmin = false,
  onSwap,
}: TeamListProps) {
  const hasSolos = solos && solos.length > 0;

  const hasSTier = (team: Team) =>
    team.playerTiers?.some((t) => t.toUpperCase() === "S");

  // Separate active and fill teams (preserving original indices)
  const activeTeams = teams
    .map((team, idx) => ({ team, idx }))
    .filter(({ team }) => !team.isFill);
  const fillTeams = teams
    .map((team, idx) => ({ team, idx }))
    .filter(({ team }) => team.isFill);

  // Swap dialog state
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedFillIndex, setSelectedFillIndex] = useState<number | null>(null);

  const handleFillClick = (fillIndex: number) => {
    if (!isAdmin || !onSwap) return;
    setSelectedFillIndex(fillIndex);
    setSwapDialogOpen(true);
  };

  const handleSwapConfirm = (droppedIndex: number) => {
    if (selectedFillIndex === null || !onSwap) return;
    onSwap(selectedFillIndex, droppedIndex);
    setSwapDialogOpen(false);
    setSelectedFillIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* Active Duos */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Registered Duos ({activeTeams.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {activeTeams.map(({ team, idx }) => (
            <div
              key={idx}
              className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${
                hasSTier(team) ? "border-amber-500/40 bg-amber-500/5" : ""
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  hasSTier(team)
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm truncate">{team.teamName}</p>
                  {hasSTier(team) && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                      <Shield className="h-2.5 w-2.5" />
                      S
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {team.players.map((player, pIdx) => {
                    const tier = team.playerTiers?.[pIdx];
                    const isS = tier?.toUpperCase() === "S";
                    return (
                      <span key={pIdx}>
                        {pIdx > 0 && ", "}
                        <span className={isS ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
                          {player}
                          {tier ? ` (${tier})` : ""}
                        </span>
                      </span>
                    );
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fill Teams */}
      {fillTeams.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Fill Teams ({fillTeams.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {fillTeams.map(({ team, idx }) => (
              <div
                key={idx}
                onClick={() => handleFillClick(idx)}
                className={`flex items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors ${
                  isAdmin && onSwap
                    ? "cursor-pointer hover:border-primary hover:bg-primary/5"
                    : ""
                } ${
                  hasSTier(team)
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-muted-foreground/30 bg-muted/30"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    hasSTier(team)
                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm truncate">{team.teamName}</p>
                    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                      FILL
                    </span>
                    {hasSTier(team) && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                        <Shield className="h-2.5 w-2.5" />
                        S
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {team.players.map((player, pIdx) => {
                      const tier = team.playerTiers?.[pIdx];
                      const isS = tier?.toUpperCase() === "S";
                      return (
                        <span key={pIdx}>
                          {pIdx > 0 && ", "}
                          <span className={isS ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
                            {player}
                            {tier ? ` (${tier})` : ""}
                          </span>
                        </span>
                      );
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {isAdmin && onSwap && (
            <p className="text-xs text-muted-foreground">
              Click a fill team to swap them in for a team that has dropped out.
            </p>
          )}
        </div>
      )}

      {/* Solos */}
      {hasSolos && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Solo Players ({solos.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {solos.map((solo, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-lg border border-dashed bg-card p-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 text-sm font-bold">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{solo.playerName}</p>
                  <p className="text-xs text-muted-foreground">Solo</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Swap Dialog: pick the team to replace */}
      <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Swap Fill Team In</DialogTitle>
            <DialogDescription>
              Select the team that has dropped out. The fill team will take their spot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto pt-2">
            {activeTeams.map(({ team, idx }) => (
              <button
                key={idx}
                onClick={() => handleSwapConfirm(idx)}
                className="w-full flex items-center gap-3 rounded-lg border bg-card p-3 hover:border-destructive hover:bg-destructive/5 transition-colors cursor-pointer text-left"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{team.teamName}</p>
                  <p className="text-xs text-muted-foreground">
                    {team.players.join(", ")}
                  </p>
                </div>
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
