/** Tier Discord role display names used in the CoEd ZBD guild. */
export const TIER_DISCORD_ROLE_NAMES = [
  "Tier S",
  "Tier A",
  "Tier B",
  "Tier C",
  "Tier D",
] as const;

export const TIER_LETTERS = ["S", "A", "B", "C", "D"] as const;

/** Yunite Verified — required for Summer Re-Eval and tier mismatch checks. */
export const YUNITE_VERIFIED_ROLE_ID = "1371623256855154818";

export function hasYuniteVerifiedRole(
  roles: Array<{ id: string; name: string }> | undefined,
): boolean {
  return (roles ?? []).some((role) => role.id === YUNITE_VERIFIED_ROLE_ID);
}

export function tierLetterFromDiscordRoleName(roleName: string): string | null {
  const match = roleName.match(/^Tier ([SABCD])$/);
  return match ? match[1] : null;
}

export function discordRoleNameForTier(tier: string): string {
  return `Tier ${tier}`;
}

export function getDiscordTierRoleFromRoles(
  roles: Array<{ id: string; name: string }> | undefined,
): { id: string; name: string } | null {
  if (!roles) return null;
  return roles.find((role) => TIER_DISCORD_ROLE_NAMES.includes(role.name as (typeof TIER_DISCORD_ROLE_NAMES)[number])) ?? null;
}
