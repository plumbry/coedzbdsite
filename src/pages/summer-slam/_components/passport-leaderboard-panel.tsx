import { ChevronRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

const PLACEHOLDER_RANKS = [1, 2, 3, 4, 5];

export function PassportLeaderboardPanel({ embedded = false }: { embedded?: boolean }) {
  return (
    <section
      className={cn(
        embedded ? "pt-1" : "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm",
      )}
      aria-label="Leaderboard"
    >
      {!embedded ? (
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-bold text-slate-900">Leaderboard</h2>
        </div>
      ) : null}

      <div className="space-y-1.5">
        {PLACEHOLDER_RANKS.map((rank) => (
          <div
            key={rank}
            className="flex min-h-11 items-center justify-between rounded-lg border border-slate-100 bg-[#F7F8FA] px-3 py-2 text-sm"
          >
            <span className="w-7 font-bold tabular-nums text-slate-400">#{rank}</span>
            <span className="flex-1 truncate text-slate-400">Coming soon</span>
            <span className="shrink-0 tabular-nums text-slate-400">—</span>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="mt-3 min-h-11 w-full touch-manipulation"
        onClick={() => toast.info("Full leaderboard will be available during the season.")}
      >
        View Full Leaderboard
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </section>
  );
}
