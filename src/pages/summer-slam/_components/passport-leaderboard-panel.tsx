import { useQuery } from "convex/react";
import { Trophy } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  ssCard,
  ssCardPad,
  ssPassportStretchPanel,
  ssSectionTitle,
  ssSkeleton,
} from "./passport-dashboard-theme.ts";
import { CAMPAIGN_SLUG } from "./passport-types.ts";

const LEADERBOARD_LIMIT = 10;

export function PassportLeaderboardPanel({ className }: { className?: string }) {
  const leaderboard = useQuery(api.seasonal.getQuestLeaderboard, {
    slug: CAMPAIGN_SLUG,
    limit: LEADERBOARD_LIMIT,
  });

  return (
    <section
      className={cn(ssCard, ssCardPad, ssPassportStretchPanel, className)}
      aria-label="Leaderboard"
    >
      <div className="mb-2 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-orange-600" />
        <h2 className={ssSectionTitle}>Leaderboard</h2>
      </div>
      <p className="text-[11px] text-orange-900/55">Most quests completed</p>

      {leaderboard === undefined ? (
        <ul className="mt-3 space-y-1.5">
          {Array.from({ length: LEADERBOARD_LIMIT }, (_, index) => (
            <li key={index}>
              <Skeleton className={cn("h-8 w-full", ssSkeleton)} />
            </li>
          ))}
        </ul>
      ) : leaderboard.length === 0 ? (
        <p className="mt-4 text-center text-xs text-orange-800/45">No quests completed yet.</p>
      ) : (
        <ol className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {leaderboard.map((entry) => (
            <li
              key={`${entry.rank}-${entry.displayName}`}
              className="flex min-h-8 items-center gap-2 rounded-lg border border-orange-100/80 bg-orange-50/40 px-2.5 py-1.5 text-xs"
            >
              <span className="w-6 shrink-0 font-bold tabular-nums text-orange-400">#{entry.rank}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-orange-950">
                {entry.displayName}
              </span>
              <span className="shrink-0 tabular-nums text-orange-800/70">
                {entry.completedQuests} quest{entry.completedQuests === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
