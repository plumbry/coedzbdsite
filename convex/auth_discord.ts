import type { UserIdentity } from "convex/server";

/** Discord snowflakes are numeric strings, typically 17–20 digits. */
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

export function isValidDiscordSnowflake(id: string): boolean {
  return DISCORD_SNOWFLAKE_RE.test(id.trim());
}

function collectStringValues(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, out);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectStringValues(nested, out);
    }
  }
}

function readDiscordIdFromMetadata(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const id = record.discord_id ?? record.discordId;
    if (typeof id === "string" && isValidDiscordSnowflake(id)) {
      return id.trim();
    }
  }
  if (typeof value === "string") {
    try {
      return readDiscordIdFromMetadata(JSON.parse(value));
    } catch {
      if (isValidDiscordSnowflake(value)) {
        return value.trim();
      }
    }
  }
  return null;
}

/**
 * Reads Discord user id from a Convex JWT identity.
 * Primary: `discord_id` JWT claim (from Clerk template).
 * Also checks `public_metadata.discord_id` when embedded in the token.
 */
export function getDiscordUserIdFromIdentity(
  identity: UserIdentity,
): string | null {
  const record = identity as UserIdentity & Record<string, unknown>;

  const preferredKeys = ["discord_id", "discordId"];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && isValidDiscordSnowflake(value)) {
      return value.trim();
    }
  }

  for (const metaKey of ["public_metadata", "publicMetadata"]) {
    const fromMeta = readDiscordIdFromMetadata(record[metaKey]);
    if (fromMeta) {
      return fromMeta;
    }
  }

  const strings: string[] = [];
  collectStringValues(record, strings);
  for (const value of strings) {
    if (isValidDiscordSnowflake(value)) {
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

/** Dev-only: list identity keys/values for JWT troubleshooting (no secrets). */
export function summarizeIdentityForDebug(
  identity: UserIdentity,
): Record<string, unknown> {
  const record = identity as UserIdentity & Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    } else if (value === null || value === undefined) {
      summary[key] = value;
    } else {
      summary[key] = JSON.parse(JSON.stringify(value));
    }
  }
  return summary;
}
