import { BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Button } from "@/components/ui/button.tsx";

const ACCEPTED_EXAMPLES = [
  "Screenshot clearly showing the required in-game result, with the player's Epic name visible.",
  "Public clip link (YouTube, Medal, Twitch, etc.) showing the full moment that satisfies the quest.",
  "Yunite or match link when the quest specifically asks for tournament or event proof.",
  "Image or link that matches the quest's stated game mode and format (Duos, Trios, Squads).",
];

const REJECTED_EXAMPLES = [
  "Blurry or cropped screenshots where the required detail cannot be verified.",
  "Private Discord attachments, expired links, or links that require login.",
  "Evidence from the wrong game mode, wrong event, or another player's account.",
  "Duplicate proof already used for a different quest in this passport.",
  "Notes-only submissions when the quest requires a screenshot or link.",
];

const EDGE_CASES = [
  "If evidence is borderline, use Needs More Evidence and ask for a specific follow-up rather than rejecting outright.",
  "Auto-complete quests should never appear in the review queue — if one does, check the quest's completion method in Quests.",
  "Resubmissions after Needs More Evidence create a new submission row; review only the latest pending submission.",
  "When a quest awards more than 1 wheel point (stamp reward), approval still follows the same evidence standards.",
  "If the player name in evidence does not match their linked Epic account, reject with Wrong game mode or Missing information as appropriate.",
];

export function SummerSlamReviewGuidance() {
  return (
    <Collapsible defaultOpen={false}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4" />
                Reviewer Guidance
              </CardTitle>
              <CardDescription>
                Internal reference for consistent evidence decisions. Not visible to players.
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                Show guidance
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="grid gap-4 border-t pt-4 md:grid-cols-3">
            <section>
              <h3 className="text-sm font-semibold">Accepted evidence</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {ACCEPTED_EXAMPLES.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-semibold">Rejected evidence</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {REJECTED_EXAMPLES.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-semibold">Edge cases</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {EDGE_CASES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
