import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel.d.ts";
import { fetchThirdPartyResultsForPlayer } from "../../helpers/playerResults";
import { isYuniteImport } from "../importSource";
import { getCachedImportRecord, type ImportRecordCache } from "./importRecordCache";

/** Recompute `eventsPlayedCount` (Yunite imports only) and `lastEventDate` for a player. */
export async function syncInternalEventParticipation(
  ctx: MutationCtx,
  playerId: Id<"players">,
) {
  const player = await ctx.db.get(playerId);
  if (!player) {
    return;
  }

  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);
  const importCache: ImportRecordCache = new Map();
  const yuniteImportIds = new Set<string>();
  let lastEventDate: string | undefined;

  for (const result of thirdPartyResults) {
    const importRecord = await getCachedImportRecord(ctx, importCache, result.importId);
    if (!importRecord || !isYuniteImport(importRecord)) {
      continue;
    }

    yuniteImportIds.add(result.importId as string);

    const eventDate = importRecord.eventDate;
    if (eventDate && (!lastEventDate || eventDate > lastEventDate)) {
      lastEventDate = eventDate;
    }
  }

  await ctx.db.patch(playerId, {
    eventsPlayedCount: yuniteImportIds.size,
    lastEventDate,
  });
}
