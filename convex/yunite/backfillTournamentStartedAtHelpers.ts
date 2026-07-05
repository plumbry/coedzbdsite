import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";
import { isYuniteImport } from "../lib/importSource";

function isMissingTournamentStartedAt(importRecord: {
  tournamentStartedAt?: string;
}): boolean {
  return !importRecord.tournamentStartedAt?.trim();
}

/** Yunite imports that still need `tournamentStartedAt` backfilled. */
export const listImportsMissingTournamentStartedAt = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const imports = await ctx.db.query("thirdPartyImports").collect();
    return imports.filter(
      (importRecord) =>
        isYuniteImport(importRecord) &&
        isMissingTournamentStartedAt(importRecord),
    );
  },
});

export const getTournamentStartedAtBackfillStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const imports = await ctx.db.query("thirdPartyImports").collect();
    const yuniteImports = imports.filter(isYuniteImport);
    const missing = yuniteImports.filter(isMissingTournamentStartedAt);

    return {
      yuniteImportCount: yuniteImports.length,
      missingCount: missing.length,
      backfilledCount: yuniteImports.length - missing.length,
    };
  },
});

export const setTournamentStartedAt = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
    tournamentStartedAt: v.string(),
    eventDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: {
      tournamentStartedAt: string;
      eventDate?: string;
    } = {
      tournamentStartedAt: args.tournamentStartedAt,
    };
    if (args.eventDate !== undefined) {
      patch.eventDate = args.eventDate;
    }
    await ctx.db.patch(args.importId, patch);
    return { updated: true };
  },
});
