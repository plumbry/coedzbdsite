import type { UserIdentity } from "convex/server";

/** Discord snowflakes are numeric strings, typically 17–20 digits. */
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

export function isValidDiscordSnowflake(id: string): boolean {
  return DISCORD_SNOWFLAKE_RE.test(id.trim());
}

/**
 * Reads Discord user id from a Convex JWT identity.
 * Requires Clerk JWT template claim: `"discord_id": "{{user.external_accounts.discord.provider_user_id}}"`.
 */
export function getDiscordUserIdFromIdentity(
  identity: UserIdentity,
): string | null {
  const record = identity as UserIdentity & Record<string, unknown>;
  const candidates = [record.discord_id, record.discordId];

  for (const value of candidates) {
    if (typeof value === "string" && isValidDiscordSnowflake(value)) {
      return value.trim();
    }
  }

  return null;
}

export function buildProfilePatch(
  identity: UserIdentity,
  discordUsername?: string,
): {
  name?: string;
  email?: string;
  discordUsername?: string;
} {
  const patch: {
    name?: string;
    email?: string;
    discordUsername?: string;
  } = {};

  if (identity.name) {
    patch.name = identity.name;
  }
  if (identity.email) {
    patch.email = identity.email;
  }
  if (discordUsername) {
    patch.discordUsername = discordUsername;
  }

  return patch;
}
