import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Lock, Unlock, RefreshCw } from "lucide-react";

type Team = {
  teamName: string;
  players: string[];
};

type PairingData = {
  game: number;
  squads: { duo1Index: number; duo2Index: number }[];
  byeTeamIndex?: number;
};

type PairingsTableProps = {
  pairings: PairingData[];
  teams: Team[];
  isAdmin?: boolean;
  lockedGames?: number[];
  onToggleLock?: (gameNumber: number) => void;
  onRegenerateGame?: (gameNumber: number) => void;
};

export default function PairingsTable({
  pairings,
  teams,
  isAdmin = false,
  lockedGames = [],
  onToggleLock,
  onRegenerateGame,
}: PairingsTableProps) {
  return (
    <div className="space-y-6">
      {pairings.map((gamePairing) => {
        const isLocked = lockedGames.includes(gamePairing.game);
        return (
          <div key={gamePairing.game} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">
                  Game {gamePairing.game}
                </h3>
                {isLocked && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" />
                    Locked
                  </Badge>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="cursor-pointer h-8 gap-1"
                    onClick={() => onToggleLock?.(gamePairing.game)}
                    title={isLocked ? "Unlock this game" : "Lock this game"}
                  >
                    {isLocked ? (
                      <Unlock className="h-3.5 w-3.5" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    {isLocked ? "Unlock" : "Lock"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="cursor-pointer h-8 gap-1"
                    onClick={() => onRegenerateGame?.(gamePairing.game)}
                    disabled={isLocked}
                    title={isLocked ? "Unlock to regenerate" : "Regenerate this game"}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reroll
                  </Button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Squad</th>
                    <th className="px-4 py-2 text-left font-medium">Team 1</th>
                    <th className="px-4 py-2 text-left font-medium">Players</th>
                    <th className="px-4 py-2 text-left font-medium">Team 2</th>
                    <th className="px-4 py-2 text-left font-medium">Players</th>
                  </tr>
                </thead>
                <tbody>
                  {gamePairing.squads.map((squad, squadIdx) => {
                    const duo1 = teams[squad.duo1Index];
                    const duo2 = teams[squad.duo2Index];
                    return (
                      <tr key={squadIdx} className="border-t">
                        <td className="px-4 py-3 font-medium">
                          Squad {squadIdx + 1}
                        </td>
                        <td className="px-4 py-3 font-medium text-primary">
                          {duo1?.teamName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {duo1?.players.join(", ")}
                        </td>
                        <td className="px-4 py-3 font-medium text-primary">
                          {duo2?.teamName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {duo2?.players.join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {gamePairing.byeTeamIndex !== undefined && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Bye</Badge>
                <span className="text-sm text-muted-foreground">
                  {teams[gamePairing.byeTeamIndex]?.teamName} sits out this game
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
