import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  formatHowToCompleteLabel,
  type EvidenceInput,
} from "@/pages/summer-slam/_components/passport-quest-meta.ts";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const CAMPAIGN_SLUG = "summer-slam";

type SelectedPlayer = {
  _id: Id<"players">;
  discordUsername: string;
  epicUsername: string;
};

type Category =
  | "traveller"
  | "competitor"
  | "summer_spirit"
  | "team_player"
  | "community"
  | "summer_legend";

const categoryLabels: Record<Category, string> = {
  traveller: "Traveller",
  competitor: "Competitor",
  summer_spirit: "Summer Spirit",
  team_player: "Team Player",
  community: "Community",
  summer_legend: "Bonus",
};

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "in_progress":
      return "In progress";
    case "pending_review":
      return "Pending review";
    case "rejected":
      return "Rejected";
    case "needs_more_evidence":
      return "Needs more evidence";
    default:
      return "Not started";
  }
}

function statusVariant(
  status: string | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "approved":
      return "default";
    case "in_progress":
      return "secondary";
    case "pending_review":
      return "outline";
    case "rejected":
    case "needs_more_evidence":
      return "destructive";
    default:
      return "outline";
  }
}

function PlayerSearchField({
  selectedPlayer,
  onSelect,
  onClear,
}: {
  selectedPlayer: SelectedPlayer | null;
  onSelect: (player: SelectedPlayer) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");

  const candidates = useQuery(
    api.players.searchPlayersForLinking,
    !selectedPlayer && search.trim().length >= 2 ? { search: search.trim(), limit: 8 } : "skip",
  );

  if (selectedPlayer) {
    return (
      <div className="space-y-1.5">
        <Label>Player</Label>
        <div className="flex items-center gap-2 rounded-md border bg-background p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectedPlayer.discordUsername}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedPlayer.epicUsername}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear player">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>Player</Label>
      <Input
        placeholder="Search by Discord or Epic name..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {search.trim().length >= 2 && (candidates?.length ?? 0) > 0 ? (
        <div className="max-h-48 overflow-y-auto rounded-md border bg-popover shadow-sm">
          {(candidates ?? []).map((player) => (
            <button
              key={player._id}
              type="button"
              className="flex w-full items-start justify-between px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onSelect({
                  _id: player._id,
                  discordUsername: player.discordUsername,
                  epicUsername: player.epicUsername,
                });
                setSearch("");
              }}
            >
              <span className="font-medium">{player.discordUsername}</span>
              <span className="text-xs text-muted-foreground">{player.epicUsername}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SummerSlamManualAwards() {
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null);
  const [awardNote, setAwardNote] = useState(
    "Yunite import unavailable — verified and awarded manually by staff.",
  );
  const [awardingQuestId, setAwardingQuestId] = useState<Id<"seasonalQuests"> | null>(null);

  const playerProgress = useQuery(
    api.seasonal.getAdminPlayerQuestProgress,
    selectedPlayer ? { slug: CAMPAIGN_SLUG, playerId: selectedPlayer._id } : "skip",
  );
  const awardQuestManually = useMutation(api.seasonal.awardQuestManually);

  const handleAward = async (questId: Id<"seasonalQuests">, questTitle: string) => {
    if (!selectedPlayer) return;
    setAwardingQuestId(questId);
    try {
      await awardQuestManually({
        slug: CAMPAIGN_SLUG,
        questId,
        playerId: selectedPlayer._id,
        note: awardNote.trim() || undefined,
      });
      toast.success(`Awarded "${questTitle}" to ${selectedPlayer.discordUsername}.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not award quest.");
    } finally {
      setAwardingQuestId(null);
    }
  };

  const awardableCount = playerProgress?.quests.filter((row) => row.canAward).length ?? 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Manual Quest Awards</CardTitle>
          <CardDescription>
            Tick off auto-tracked (or any) quests for specific players when Yunite data is missing or
            wrong. Manual awards are kept after recalculation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <PlayerSearchField
            selectedPlayer={selectedPlayer}
            onSelect={setSelectedPlayer}
            onClear={() => setSelectedPlayer(null)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="manual-award-note">Award note (optional)</Label>
            <Textarea
              id="manual-award-note"
              value={awardNote}
              onChange={(event) => setAwardNote(event.target.value)}
              rows={3}
              placeholder="Reason shown in the award log..."
            />
          </div>
        </CardContent>
      </Card>

      {selectedPlayer ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedPlayer.discordUsername}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {selectedPlayer.epicUsername}
              </span>
            </CardTitle>
            <CardDescription>
              {playerProgress === undefined
                ? "Loading quest progress…"
                : playerProgress === null
                  ? "Player could not be found."
                  : `${awardableCount} quest${awardableCount === 1 ? "" : "s"} can be awarded manually.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quest</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playerProgress === undefined ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : playerProgress === null ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Player could not be found.
                    </TableCell>
                  </TableRow>
                ) : playerProgress.quests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No quests configured for this campaign.
                    </TableCell>
                  </TableRow>
                ) : (
                  playerProgress.quests.map((row) => {
                    const progress = row.progress;
                    const status = progress?.status;
                    const method = row.quest.completionMethod;
                    const evidenceInput = row.quest.evidenceInput as EvidenceInput | undefined;
                    return (
                      <TableRow key={row.quest._id}>
                        <TableCell>
                          <div className="font-medium">{row.quest.title}</div>
                          {!row.quest.isActive ? (
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              Inactive
                            </Badge>
                          ) : null}
                          {row.criteria ? (
                            <div className="mt-1 max-w-[280px] text-xs text-muted-foreground">
                              {row.criteria}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{categoryLabels[row.quest.category as Category]}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatHowToCompleteLabel(method, evidenceInput)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
                          {progress?.awardSource === "admin" && status === "approved" ? (
                            <div className="mt-1 text-xs text-muted-foreground">Staff awarded</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {progress?.progressCurrent != null && progress.progressTarget != null
                            ? `${progress.progressCurrent}/${progress.progressTarget}`
                            : status === "approved"
                              ? "Complete"
                              : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.canAward ? (
                            <Button
                              size="sm"
                              onClick={() => handleAward(row.quest._id, row.quest.title)}
                              disabled={awardingQuestId === row.quest._id}
                            >
                              {awardingQuestId === row.quest._id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              )}
                              Award
                            </Button>
                          ) : status === "approved" ? (
                            <span className="text-xs text-muted-foreground">Done</span>
                          ) : status === "pending_review" ? (
                            <span className="text-xs text-muted-foreground">In review queue</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
