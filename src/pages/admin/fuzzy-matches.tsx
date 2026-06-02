import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { toast } from "sonner";
import { Sparkles, Link as LinkIcon } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";

export default function FuzzyMatches() {
  const matches = useQuery(api.discord.findMatches.findPotentialMatches, {});
  const matchesPagination = useClientPagination(matches?.matches, {
    resetDeps: [matches?.totalMatches],
  });
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
    <AdminPageLayout requireAdmin
      title="Fuzzy Match Suggestions"
      description="Automatically detected potential matches between Discord members and existing players"
      header={{
        back: { label: "Back to Discord Members", href: "/admin/discord-members" },
        icon: Sparkles,
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Potential Matches</CardTitle>
            <CardDescription>
            Review and approve suggested matches based on username similarity. Imports never
            auto-link fuzzy matches — only explicit IDs and exact usernames match during import.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matches === undefined ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="flex gap-6 mb-6 p-4 bg-muted/50 rounded-lg">
                <div className="text-sm">
                  <span className="font-semibold text-lg">{matches.totalMatches}</span>
                  <div className="text-muted-foreground">potential matches found</div>
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="bg-blue-500 text-white">USERNAME</Badge>
                    <span className="font-semibold">{matches.matches.filter(m => m.matchType === "username").length}</span>
                  </div>
                  <div className="text-muted-foreground text-xs">Exact username matches</div>
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="bg-orange-500 text-white">FUZZY</Badge>
                    <span className="font-semibold">{matches.matches.filter(m => m.matchType === "fuzzy").length}</span>
                  </div>
                  <div className="text-muted-foreground text-xs">Similar username matches</div>
                </div>
              </div>

              {matches.totalMatches === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No potential matches found</p>
                  <p className="text-sm">All Discord members are either already matched or have no similar player profiles.</p>
                </div>
              ) : (
                <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[250px]">Discord Member</TableHead>
                        <TableHead className="w-[60px] text-center">⟶</TableHead>
                        <TableHead className="w-[250px]">Existing Player</TableHead>
                        <TableHead className="w-[180px]">Match Type</TableHead>
                        <TableHead className="w-[120px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(matchesPagination.pageItems ?? []).map((match, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{match.discordMemberName}</div>
                              <div className="text-xs text-muted-foreground mt-1">{match.discordMemberEpic}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            <LinkIcon className="h-4 w-4 mx-auto" />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{match.manualPlayerName}</div>
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
                              <div className="text-xs text-muted-foreground">{match.matchedOn}</div>
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
                              Link Players
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={matchesPagination.page}
                  totalPages={matchesPagination.totalPages}
                  totalCount={matchesPagination.totalCount}
                  startIndex={matchesPagination.startIndex}
                  endIndex={matchesPagination.endIndex}
                  onPageChange={matchesPagination.setPage}
                  itemLabel="matches"
                />
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </AdminPageLayout>
  );
}
