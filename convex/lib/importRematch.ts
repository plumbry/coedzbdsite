import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import { matchPlayerForImportFromLookup } from "./stats/matchPlayerFromLookup";

export type ImportRematchResult = {
  playersMatched: number;
  playersUnmatched: number;
  newMatches: number;
  affectedPlayerIds: Id<"players">[];
  rowsProcessed: number;
  rowsPatched: number;
  skippedNoChange: number;
};

/** Re-match import rows using indexed playerImportLookup (no full player scan). */
export async function rematchImportResults(
  ctx: MutationCtx,
  importId: Id<"thirdPartyImports">,
): Promise<ImportRematchResult> {
  const results = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .collect();

  let playersMatched = 0;
  let playersUnmatched = 0;
  let newMatches = 0;
  let rowsPatched = 0;
  let skippedNoChange = 0;
  const affectedPlayerIds = new Set<Id<"players">>();

  for (const result of results) {
    const { playerId: matchedPlayerId } = await matchPlayerForImportFromLookup(ctx, {
      discordId: result.discordId,
      epicId: result.epicId,
      epicUsername: result.epicUsername,
      discordUsername: result.discordUsername,
    });

    const isNowMatched = matchedPlayerId != null;
    if (isNowMatched) {
      playersMatched += 1;
      if (!result.matched) {
        newMatches += 1;
      }
      affectedPlayerIds.add(matchedPlayerId);
    } else {
      playersUnmatched += 1;
    }

    if (result.playerId && result.playerId !== matchedPlayerId) {
      affectedPlayerIds.add(result.playerId);
    }

    const nextPatch: Partial<Doc<"thirdPartyResults">> = {
      playerId: matchedPlayerId ?? undefined,
      matched: isNowMatched,
    };

    if (result.matched !== isNowMatched || result.playerId !== matchedPlayerId) {
      await ctx.db.patch(result._id, nextPatch);
      rowsPatched += 1;
    } else {
      skippedNoChange += 1;
    }
  }

  await ctx.db.patch(importId, { playersMatched, playersUnmatched });

  return {
    playersMatched,
    playersUnmatched,
    newMatches,
    affectedPlayerIds: [...affectedPlayerIds],
    rowsProcessed: results.length,
    rowsPatched,
    skippedNoChange,
  };
}

export async function collectAffectedPlayerIdsForImport(
  ctx: MutationCtx,
  importId: Id<"thirdPartyImports">,
): Promise<Id<"players">[]> {
  const results = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .collect();

  const ids = new Set<Id<"players">>();
  for (const result of results) {
    if (result.playerId && result.matched) {
      ids.add(result.playerId);
    }
  }
  return [...ids];
}
