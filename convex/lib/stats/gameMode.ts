import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import type { QueryCtx } from "../../_generated/server";
import { getCachedImportRecord, type ImportRecordCache } from "./importRecordCache";

/** Event game mode — `ZB Main Map` is BR in product language. */
export type GameMode = "ZB Main Map" | "Reload";

export type EventModeCache = Map<string, GameMode | null>;

export async function resolveImportGameMode(
  ctx: QueryCtx,
  importId: Id<"thirdPartyImports">,
  importCache: ImportRecordCache,
  eventModeCache: EventModeCache,
): Promise<GameMode | null> {
  const importRecord = await getCachedImportRecord(ctx, importCache, importId);
  if (!importRecord?.eventId) {
    return null;
  }

  const eventKey = importRecord.eventId as string;
  if (!eventModeCache.has(eventKey)) {
    const event = await ctx.db.get(importRecord.eventId);
    eventModeCache.set(eventKey, (event?.mode as GameMode | undefined) ?? null);
  }

  return eventModeCache.get(eventKey) ?? null;
}

export async function buildImportGameModeMap(
  ctx: QueryCtx,
  importIds: Iterable<Id<"thirdPartyImports">>,
): Promise<Map<string, GameMode | null>> {
  const importCache: ImportRecordCache = new Map();
  const eventModeCache: EventModeCache = new Map();
  const modeByImport = new Map<string, GameMode | null>();

  for (const importId of importIds) {
    const key = importId as string;
    modeByImport.set(
      key,
      await resolveImportGameMode(ctx, importId, importCache, eventModeCache),
    );
  }

  return modeByImport;
}

export function importMatchesMode(
  modeByImport: Map<string, GameMode | null>,
  importId: Id<"thirdPartyImports">,
  mode: GameMode,
): boolean {
  return modeByImport.get(importId as string) === mode;
}
