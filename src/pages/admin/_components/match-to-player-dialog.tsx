import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Users, Link } from "lucide-react";
import { toast } from "sonner";
import { sortByTier } from "@/lib/tier-sort.ts";

interface MatchToPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discordMemberId: Id<"players"> | null;
}

export default function MatchToPlayerDialog({
  open,
  onOpenChange,
  discordMemberId,
}: MatchToPlayerDialogProps) {
  const players = useQuery(
    api.players.getDiscordMembersAdmin,
    open ? {} : "skip"
  );
  const discordMember = useQuery(
    api.players.getPlayerById,
    open && discordMemberId ? { id: discordMemberId } : "skip"
  );
  const manualMatch = useMutation(api.discord.manualMatchToPlayer);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [isMatching, setIsMatching] = useState(false);

  // Filter players to show all players except the current discord member
  const eligiblePlayers = useMemo(() => {
    if (!players) return [];
    return players.filter((p) => {
      // Show all players except the one we're trying to match
      return p._id !== discordMemberId;
    });
  }, [players, discordMemberId]);

  // Filter by search
  const filteredPlayers = useMemo(() => {
    const base = !searchQuery
      ? eligiblePlayers
      : eligiblePlayers.filter((p) => {
          const query = searchQuery.toLowerCase();
          return (
            p.discordUsername?.toLowerCase().includes(query) ||
            p.epicUsername?.toLowerCase().includes(query)
          );
        });
    return sortByTier(base, (p) => p.tier, (a, b) =>
      (a.discordUsername ?? "").localeCompare(b.discordUsername ?? ""),
    ).slice(0, 50);
  }, [eligiblePlayers, searchQuery]);

  const handleMatch = async () => {
    if (!selectedPlayerId || !discordMemberId) return;

    setIsMatching(true);
    try {
      await manualMatch({
        discordMemberId,
        targetPlayerId: selectedPlayerId,
      });
      toast.success("Successfully matched Discord member to player");
      onOpenChange(false);
    } catch (error) {
      console.error("Error matching player:", error);
      toast.error("Failed to match player");
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Match Discord Member to Player
          </DialogTitle>
          <DialogDescription>
            {discordMember ? (
              <>
                Select an existing player to link <strong>{discordMember.discordUsername}</strong> to. This will update the player record with Discord data.
              </>
            ) : (
              "Loading Discord member..."
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
        {discordMember && (
          <div className="rounded-md border p-3 bg-muted/50">
            <div className="text-sm space-y-1">
              <p className="text-xs text-muted-foreground mb-2">
                This Discord member's data will be merged into the selected player:
              </p>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Discord:</span>
                <span className="font-medium">{discordMember.discordUsername}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Epic:</span>
                <span className="font-medium">{discordMember.epicUsername}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Discord ID:</span>
                <span className="font-mono text-xs">{discordMember.discordUserId}</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Input
            placeholder="Search by Discord or Epic username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Showing {filteredPlayers.length} of {eligiblePlayers.length} players{!searchQuery && " — type to search"}
          </p>

          {players === undefined ? (
            <Skeleton className="h-64 w-full" />
          ) : filteredPlayers.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>No players found</EmptyTitle>
                <EmptyDescription>
                  {searchQuery
                    ? "Try adjusting your search criteria"
                    : "No eligible players available"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2 space-y-1">
                {filteredPlayers.map((player) => (
                  <button
                    key={player._id}
                    onClick={() => setSelectedPlayerId(player._id)}
                    className={`w-full p-3 rounded-md border text-left transition-colors ${
                      selectedPlayerId === player._id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.epicUsername}</span>
                        {player.tier && (
                          <Badge variant="outline" className="text-xs">
                            Tier {player.tier}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Discord: {player.discordUsername}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedPlayerId || isMatching}
          >
            {isMatching ? "Matching..." : "Match to Player"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
