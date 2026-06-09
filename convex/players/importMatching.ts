import { internalQuery } from "../_generated/server";
import type { PlayerMatchFields } from "../lib/playerIdentity";
import { listPlayerMatchFieldsFromLookup } from "../helpers/playerImportLookup";

export const listPlayersForImportMatching = internalQuery({
  args: {},
  handler: async (ctx): Promise<PlayerMatchFields[]> => {
    return await listPlayerMatchFieldsFromLookup(ctx);
  },
});
