import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import { filterVisibleMembers } from "../../helpers/playerAlt";

const isValidDiscordId = (id: string | undefined): boolean => {
  if (!id || id === "") return false;
  if (id === "imported") return false;
  if (id.startsWith("placeholder_")) return false;
  return true;
};

/** Active/accepted members with match data used for TC, DCA, top-five, and tier-eval caches. */
export async function listEligibleMatchDataPlayerIds(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"players">[]> {
  const activePlayers = await ctx.db
    .query("players")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  const acceptedMembers = await ctx.db
    .query("players")
    .withIndex("by_membership_status", (q) =>
      q.eq("currentMembershipStatus", "accepted"),
    )
    .collect();

  const playerMap = new Map<string, (typeof activePlayers)[0]>();
  for (const p of [...activePlayers, ...acceptedMembers]) {
    playerMap.set(p._id, p);
  }

  return filterVisibleMembers(
    Array.from(playerMap.values()).filter(
      (p) =>
        p.hasMatchData === true &&
        p.status !== "archived" &&
        isValidDiscordId(p.discordUserId),
    ),
  ).map((p) => p._id);
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
