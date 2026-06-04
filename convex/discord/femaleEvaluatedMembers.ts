import { internalQuery } from "../_generated/server";
import { listFemaleEvaluatedDiscordMembers } from "../helpers/evaluationGender";

/**
 * Discord bot: members evaluated female (gender = 50), including application evaluations.
 */
export const getFemaleEvaluatedDiscordMembers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const members = await listFemaleEvaluatedDiscordMembers(ctx);
    return { members };
  },
});
