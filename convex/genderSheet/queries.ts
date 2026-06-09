import { internalQuery } from "../_generated/server";
import { listGenderSheetEntries } from "../helpers/genderSheetEntries";

export const listEntries = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await listGenderSheetEntries(ctx);
  },
});
