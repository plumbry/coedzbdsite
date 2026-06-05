import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  loadFemaleVerificationLookup,
  enrichPlayerWithFemaleVerification,
} from "./femaleVerification";
import { filterVisibleMembers, isVisibleInMemberLists } from "./playerAlt";
import { sortByTier } from "./tierSort";

/** Rebuild the public home directory snapshot (async, full accepted-member scan). */
export async function schedulePublicMemberDirectoryRebuild(ctx: MutationCtx) {
  await ctx.scheduler.runAfter(
    0,
    internal.memberManagement.storePublicMemberDirectoryCache,
    {},
  );
}

/** Rebuild only when the player can appear on the public member directory. */
export async function schedulePublicMemberDirectoryRebuildForPlayer(
  ctx: MutationCtx,
  player: Pick<Doc<"players">, "currentMembershipStatus" | "isAlt">,
) {
  if (
    player.currentMembershipStatus === "accepted" &&
    isVisibleInMemberLists(player)
  ) {
    await schedulePublicMemberDirectoryRebuild(ctx);
  }
}

/** Slim row served to the public home page and stored in publicMemberDirectoryCache. */
export type PublicMemberDirectoryEntry = {
  _id: Id<"players">;
  discordUsername: string;
  epicUsername: string;
  nickname?: string;
  tier?: string;
  avatarUrl?: string;
  totalScore?: number;
  gender?: number;
  femaleVerified: boolean;
  isActive: boolean;
};

export async function buildPublicMemberDirectory(
  ctx: QueryCtx,
): Promise<PublicMemberDirectoryEntry[]> {
  const players = filterVisibleMembers(
    await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "accepted"),
      )
      .order("desc")
      .collect(),
  );

  const verificationLookup = await loadFemaleVerificationLookup(ctx);

  const directory = players.map((player) => {
    const verification = enrichPlayerWithFemaleVerification(player, verificationLookup);

    return {
      _id: player._id,
      discordUsername: player.discordUsername,
      epicUsername: player.epicUsername,
      nickname: player.nickname,
      tier: player.tier,
      avatarUrl: player.avatarUrl,
      totalScore: player.totalScore,
      gender: player.gender,
      femaleVerified: verification.femaleVerified,
      isActive: player.isRecentlyActive ?? false,
    };
  });

  return sortByTier(directory, (p) => p.tier, (a, b) =>
    a.discordUsername.localeCompare(b.discordUsername),
  );
}
