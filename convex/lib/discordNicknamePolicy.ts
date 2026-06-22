type DiscordRoleLike = {
  name: string;
};

const VIEWER_ROLE_NAME = "viewer";
const NICKNAME_ALLOWED_ROLE_PATTERNS = [
  /\badmin\b/i,
  /\bmod(?:erator|eration)?\b/i,
  /\bstaff\b/i,
];

export function hasViewerRole(
  roles: DiscordRoleLike[] | null | undefined,
): boolean {
  return (roles ?? []).some((role) => role.name.toLowerCase() === VIEWER_ROLE_NAME);
}

export function hasNicknamePrivilegedRole(
  roles: DiscordRoleLike[] | null | undefined,
): boolean {
  return (roles ?? []).some((role) =>
    NICKNAME_ALLOWED_ROLE_PATTERNS.some((pattern) => pattern.test(role.name)),
  );
}

export function canUseDiscordNickname(
  roles: DiscordRoleLike[] | null | undefined,
): boolean {
  return !hasViewerRole(roles) || hasNicknamePrivilegedRole(roles);
}

export function sanitizeDiscordNickname(
  nickname: string | null | undefined,
  roles: DiscordRoleLike[] | null | undefined,
): string | undefined {
  const trimmed = nickname?.trim();
  if (!trimmed || !canUseDiscordNickname(roles)) {
    return undefined;
  }
  return trimmed;
}
