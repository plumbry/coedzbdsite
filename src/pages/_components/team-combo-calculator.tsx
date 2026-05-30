import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Calculator, X, Search } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

interface Player {
  _id: Id<"players">;
  discordUsername: string;
  epicUsername: string;
  tier?: string;
}

interface TeamComboCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
}

const ALLOWED_COMBOS = ["SBC", "SCC", "AAC", "ABB", "ABC", "ACC", "BBB", "BBC", "CCC"];

export default function TeamComboCalculator({ open, onOpenChange, players }: TeamComboCalculatorProps) {
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const handlePlayerClick = (player: Player) => {
    if (selectedPlayers.length < 3 && !selectedPlayers.find(p => p._id === player._id)) {
      setSelectedPlayers([...selectedPlayers, player]);
    }
  };
  
  const handleRemovePlayer = (playerId: Id<"players">) => {
    setSelectedPlayers(selectedPlayers.filter(p => p._id !== playerId));
  };
  
  const handleClear = () => {
    setSelectedPlayers([]);
  };
  
  const getCurrentCombo = () => {
    if (selectedPlayers.length !== 3) return null;
    const tiers = selectedPlayers.map(p => p.tier || "").filter(t => t);
    if (tiers.length !== 3) return null;
    return tiers.sort().join("");
  };
  
  const currentCombo = getCurrentCombo();
  const isValidCombo = currentCombo && ALLOWED_COMBOS.includes(currentCombo);
  
  // Filter players with tiers and by search query
  const availablePlayers = players
    .filter(p => p.tier) // Only show players with tiers
    .filter(p => !selectedPlayers.find(sp => sp._id === p._id)) // Exclude already selected
    .filter(p => {
      const query = searchQuery.toLowerCase();
      return (
        p.discordUsername.toLowerCase().includes(query) ||
        p.epicUsername.toLowerCase().includes(query)
      );
    });
  
  const getTierBadgeVariant = (tier: string) => {
    return tier === "S" ? "default" : "secondary";
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Team Combo Calculator
          </DialogTitle>
          <DialogDescription>
            Select three players to check if their tier combination is allowed
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Selected Players */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Selected Team ({selectedPlayers.length}/3)</label>
            <div className="min-h-[100px] p-4 border rounded-lg bg-muted/50">
              {selectedPlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Select players from the list below</p>
              ) : (
                <div className="space-y-2">
                  {selectedPlayers.map((player) => (
                    <div key={player._id} className="flex items-center justify-between bg-background p-3 rounded-md">
                      <div className="flex items-center gap-3">
                        <Badge 
                          className="text-lg font-bold px-3 py-1"
                          variant={getTierBadgeVariant(player.tier || "")}
                        >
                          {player.tier}
                        </Badge>
                        <div>
                          <p className="font-medium">{player.epicUsername}</p>
                          <p className="text-sm text-muted-foreground">{player.discordUsername}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemovePlayer(player._id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Player Search and Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Available Players</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by Discord or Epic username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-[200px] border rounded-lg">
              <div className="p-2 space-y-1">
                {availablePlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    {searchQuery ? "No players found" : "No more available players"}
                  </p>
                ) : (
                  availablePlayers.map((player) => (
                    <Button
                      key={player._id}
                      variant="ghost"
                      className="w-full justify-start gap-3"
                      onClick={() => handlePlayerClick(player)}
                      disabled={selectedPlayers.length >= 3}
                    >
                      <Badge 
                        className="font-bold"
                        variant={getTierBadgeVariant(player.tier || "")}
                      >
                        {player.tier}
                      </Badge>
                      <div className="text-left">
                        <p className="font-medium">{player.epicUsername}</p>
                        <p className="text-xs text-muted-foreground">{player.discordUsername}</p>
                      </div>
                    </Button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          
          {/* Result */}
          {selectedPlayers.length === 3 && (
            <div className={`p-4 rounded-lg border-2 ${isValidCombo ? "bg-green-500/10 border-green-500" : "bg-destructive/10 border-destructive"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium mb-1">Combination: {currentCombo || "Invalid"}</p>
                  <p className={`text-lg font-bold ${isValidCombo ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                    {isValidCombo ? "✓ Valid Team Combo" : "✗ Invalid Team Combo"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleClear}>
                  Clear
                </Button>
              </div>
            </div>
          )}
          
          {/* Allowed Combos Reference */}
          <div className="space-y-2 pt-4 border-t">
            <label className="text-sm font-medium">Allowed Combinations</label>
            <div className="flex flex-wrap gap-2">
              {ALLOWED_COMBOS.map((combo) => (
                <Badge key={combo} variant="outline" className="font-mono">
                  {combo}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
