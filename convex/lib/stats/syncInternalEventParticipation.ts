import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import { fetchThirdPartyResultsForPlayer } from "../../helpers/playerResults";
import { activityFromLastActiveAt } from "../memberActivity";
import { isYuniteImport } from "../importSource";
import { yuniteImportPlayTime } from "../yunite";
import { getCachedImportRecord, type ImportRecordCache } from "./importRecordCache";

/**
 * Recompute `eventsPlayedCount` (Yunite imports only), `lastEventDate`, and activity flags.
 * Play date prefers Yunite `tournamentStartedAt` (leaderboard startDate), then `eventDate`.
 */
export async function syncInternalEventParticipationFromResults(
  ctx: MutationCtx,
  playerId: Id<"players">,
  thirdPartyResults: Doc<"thirdPartyResults">[],
) {
  const importCache: ImportRecordCache = new Map();
  const yuniteImportIds = new Set<string>();
  let lastEventDate: string | undefined;
  let lastActiveAt: number | undefined;

  for (const result of thirdPartyResults) {
    const importRecord = await getCachedImportRecord(ctx, importCache, result.importId);
    if (!importRecord || !isYuniteImport(importRecord)) {
      continue;
    }

    yuniteImportIds.add(result.importId as string);

    const play = yuniteImportPlayTime(importRecord);
    if (!play) {
      continue;
    }

    if (lastActiveAt === undefined || play.lastActiveAt > lastActiveAt) {
      lastActiveAt = play.lastActiveAt;
      lastEventDate = play.lastEventDate;
    }
  }

  const activity = activityFromLastActiveAt(lastActiveAt);

  await ctx.db.patch(playerId, {
    eventsPlayedCount: yuniteImportIds.size,
    lastEventDate,
    ...activity,
  });
}

export async function syncInternalEventParticipation(
  ctx: MutationCtx,
  playerId: Id<"players">,
) {
  const player = await ctx.db.get(playerId);
  if (!player) {
    return;
  }

  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);
  await syncInternalEventParticipationFromResults(ctx, playerId, thirdPartyResults);
}
