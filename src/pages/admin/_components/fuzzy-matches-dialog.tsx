import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { toast } from "sonner";
import { Sparkles, Link as LinkIcon } from "lucide-react";

interface FuzzyMatchesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FuzzyMatchesDialog({ open, onOpenChange }: FuzzyMatchesDialogProps) {
  const matches = useQuery(api.discord.findMatches.findPotentialMatches, {});
  const manualMatch = useMutation(api.discord.manualMatchToPlayer);

  const handleMatch = async (discordMemberId: Id<"players">, targetPlayerId: Id<"players">, discordName: string, playerName: string) => {
    try {
      await manualMatch({
        discordMemberId,
        targetPlayerId,
      });
      toast.success(`Matched ${discordName} to ${playerName}`);
    } catch (error) {
      toast.error("Failed to match players");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Fuzzy Match Suggestions
          </DialogTitle>
          <DialogDescription>
            Automatically detected potential matches between Discord members and existing players
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {matches === undefined ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex gap-4 text-sm text-muted-foreground mb-4">
                <div>
                  <span className="font-semibold">{matches.totalMatches}</span> potential matches found
                </div>
                <div>
                  <Badge variant="secondary" className="bg-blue-500 text-white">USERNAME</Badge>
                  <span className="ml-1">{matches.matches.filter(m => m.matchType === "username").length}</span>
                </div>
                <div>
                  <Badge variant="secondary" className="bg-orange-500 text-white">FUZZY</Badge>
                  <span className="ml-1">{matches.matches.filter(m => m.matchType === "fuzzy").length}</span>
                </div>
              </div>

            {/* Matches Table */}
            {matches.totalMatches === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No potential matches found. All Discord members are either already matched or have no similar player profiles.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Discord Member</TableHead>
                      <TableHead className="w-[40px]">⟶</TableHead>
                      <TableHead className="min-w-[150px]">Existing Player</TableHead>
                      <TableHead className="min-w-[140px]">Match Type</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.matches.map((match, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm whitespace-nowrap">{match.discordMemberName}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{match.discordMemberEpic}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          <LinkIcon className="h-4 w-4 mx-auto" />
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm whitespace-nowrap">{match.manualPlayerName}</div>
                            {match.manualPlayerTier && (
                              <Badge variant="outline" className="text-xs mt-1">Tier {match.manualPlayerTier}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {match.matchType === "username" ? (
                              <Badge variant="secondary" className="bg-blue-500 text-white text-xs">
                                USERNAME
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-orange-500 text-white text-xs">
                                FUZZY
                              </Badge>
                            )}
                            <div className="text-xs text-muted-foreground truncate max-w-[140px]">{match.matchedOn}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleMatch(
                              match.discordMemberId as Id<"players">,
                              match.manualPlayerId as Id<"players">,
                              match.discordMemberName,
                              match.manualPlayerName
                            )}
                          >
                            Link
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
