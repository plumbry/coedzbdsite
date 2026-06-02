import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export type FemaleVerificationLookup = {
  discordIds: Set<string>;
  discordUsernames: Set<string>;
  verificationMethodByDiscordId: Map<string, string>;
};

export async function loadFemaleVerificationLookup(
  ctx: QueryCtx,
): Promise<FemaleVerificationLookup> {
  const records = await ctx.db.query("girlRoleVerifications").collect();
  const discordIds = new Set<string>();
  const discordUsernames = new Set<string>();
  const verificationMethodByDiscordId = new Map<string, string>();

  for (const record of records) {
    if (record.discordUserId) {
      discordIds.add(record.discordUserId);
      if (record.verificationMethod) {
        verificationMethodByDiscordId.set(
          record.discordUserId,
          record.verificationMethod,
        );
      }
    }
    if (record.discordUsername) {
      discordUsernames.add(record.discordUsername);
    }
  }

  return { discordIds, discordUsernames, verificationMethodByDiscordId };
}

type PlayerVerificationFields = Pick<
  Doc<"players">,
  "discordUserId" | "discordUsername" | "alternateDiscordUserIds"
>;

export function getPlayerFemaleVerification(
  player: PlayerVerificationFields,
  lookup: FemaleVerificationLookup,
): { femaleVerified: boolean; verificationMethod?: string } {
  const candidateIds = [
    player.discordUserId,
    ...(player.alternateDiscordUserIds ?? []),
  ];

  for (const id of candidateIds) {
    if (!id || id.startsWith("placeholder_")) continue;
    if (lookup.discordIds.has(id)) {
      return {
        femaleVerified: true,
        verificationMethod: lookup.verificationMethodByDiscordId.get(id),
      };
    }
  }

  const username = player.discordUsername?.toLowerCase().trim();
  if (username && lookup.discordUsernames.has(username)) {
    return { femaleVerified: true };
  }

  return { femaleVerified: false };
}

export function enrichPlayerWithFemaleVerification<
  T extends PlayerVerificationFields,
>(player: T, lookup: FemaleVerificationLookup) {
  const verification = getPlayerFemaleVerification(player, lookup);
  return {
    ...player,
    femaleVerified: verification.femaleVerified,
    verificationMethod: verification.verificationMethod,
  };
}
