/** CoEd ZBD Discord server ID. */
export const COED_ZBD_DISCORD_GUILD_ID = "1371615693392576580";

/** Discord role applied for all event-ban penalties (minor, major, legacy). */
export const UNIFIED_EVENT_BAN_DISCORD_ROLE = "Event Ban";

/** Guild role ID for the unified event ban role (name may differ in Discord). */
export const EVENT_BAN_DISCORD_ROLE_ID = "1463660686231207956";

/** Known role IDs keyed by logical role name used in ban sync. */
const DISCORD_ROLE_IDS_BY_NAME: Record<string, string> = {
  [UNIFIED_EVENT_BAN_DISCORD_ROLE]: EVENT_BAN_DISCORD_ROLE_ID,
};

/** Direct ban-type → role ID mapping (avoids relying on guild role names). */
const DISCORD_ROLE_IDS_BY_BAN_TYPE: Record<string, string> = {
  "Minor Event Ban": EVENT_BAN_DISCORD_ROLE_ID,
  "Major Event Ban": EVENT_BAN_DISCORD_ROLE_ID,
  "Event Ban": EVENT_BAN_DISCORD_ROLE_ID,
};

const ROLE_SYNC_BAN_TYPES = new Set([
  "Minor Event Ban",
  "Major Event Ban",
  "Event Ban",
  "Probation",
]);

const EVENT_BAN_TYPES = new Set([
  "Minor Event Ban",
  "Major Event Ban",
  "Event Ban",
]);

export function requiresDiscordRoleSync(banType: string): boolean {
  return ROLE_SYNC_BAN_TYPES.has(banType);
}

/** Maps stored ban type to the Discord role name to add or remove. */
export function getDiscordRoleNameForBanType(banType: string): string | null {
  if (!requiresDiscordRoleSync(banType)) return null;
  if (banType === "Probation") return "Probation";
  if (EVENT_BAN_TYPES.has(banType)) return UNIFIED_EVENT_BAN_DISCORD_ROLE;
  return null;
}

/** Maps stored ban type to a known Discord role ID, when configured. */
export function getDiscordRoleIdForBanType(banType: string): string | null {
  if (DISCORD_ROLE_IDS_BY_BAN_TYPE[banType]) {
    return DISCORD_ROLE_IDS_BY_BAN_TYPE[banType];
  }
  const roleName = getDiscordRoleNameForBanType(banType);
  if (!roleName) return null;
  return DISCORD_ROLE_IDS_BY_NAME[roleName] ?? null;
}

/** Resolves a logical role name to a guild role ID (configured ID first, then live lookup). */
export function resolveDiscordRoleId(
  discordRoleName: string,
  roleNameToId: Map<string, string>,
): string | null {
  return DISCORD_ROLE_IDS_BY_NAME[discordRoleName] ?? roleNameToId.get(discordRoleName) ?? null;
}
