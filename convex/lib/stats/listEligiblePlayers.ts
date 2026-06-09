import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import { filterVisibleMembers, isAltAccount } from "../../helpers/playerAlt";

/** Paginate only public active members (excludes discord_member, archived, rejected). */
export async function paginateActivePlayers(
  ctx: QueryCtx | MutationCtx,
  cursor: string | null,
  numItems: number,
) {
  return ctx.db
    .query("players")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .paginate({ numItems, cursor });
}

/** Active competitive member (pool membership is determined by playerStatsCache, not hasMatchData). */
export function isActivePlayerWithMatchData(
  player: Pick<Doc<"players">, "status" | "isAlt">,
): boolean {
  return (
    (player.status === "active" || player.status === undefined) &&
    !isAltAccount(player)
  );
}

const isValidDiscordId = (id: string | undefined): boolean => {
  if (!id || id === "") return false;
  if (id === "imported") return false;
  if (id.startsWith("placeholder_")) return false;
  return true;
};

/** Active members with match data used for TC, DCA, top-five, and tier-eval caches. */
export async function listEligibleMatchDataPlayerIds(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"players">[]> {
  const fromCache = await ctx.db
    .query("playerStatsCache")
    .withIndex("by_reevaluation_eligible", (q) => q.eq("reevaluationEligible", true))
    .collect();

  const players: Doc<"players">[] = [];
  for (const row of fromCache) {
    const player = await ctx.db.get(row.playerId);
    if (
      player &&
      isActivePlayerWithMatchData(player) &&
      isValidDiscordId(player.discordUserId)
    ) {
      players.push(player);
    }
  }
  return filterVisibleMembers(players).map((p) => p._id);
}

export async function listStatsEligiblePlayerIds(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"players">[]> {
  const rows = await ctx.db
    .query("playerStatsCache")
    .withIndex("by_stats_eligible", (q) => q.eq("statsEligible", true))
    .collect();
  return rows.map((row) => row.playerId);
}

export function phaseLabel(phase: string): string {
  switch (phase) {
    case "event_participation":
      return "Syncing Yunite import counts";
    case "contribution_score":
      return "Recalculating Team Contribution (TC)";
    case "dca":
      return "Recalculating Duo Carry Adjustment (DCA)";
    case "dca_mutual":
      return "Applying mutual-duo DCA correction";
    case "top_five":
      return "Refreshing recent top-5 badges";
    case "tier_eval":
      return "Rebuilding tier evaluation / holistic scores";
    case "aggregate_stats":
      return "Refreshing population average stats";
    case "completed":
      return "Completed";
    default:
      return phase;
  }
}
