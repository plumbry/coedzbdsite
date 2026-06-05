/** Discord role applied for all event-ban penalties (minor, major, legacy). */
export const UNIFIED_EVENT_BAN_DISCORD_ROLE = "Event Ban";

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
