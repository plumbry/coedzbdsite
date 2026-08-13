const ISO_TIMESTAMP_WITH_ZONE_RE =
  /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/;

/** Six weeks — same window as recently-active play on /members. */
export const RECENT_DISCORD_JOIN_MS = 6 * 7 * 24 * 60 * 60 * 1000;

export function normalizeJoinedAt(
  value: string | null | undefined,
): string | null {
  if (!value || !ISO_TIMESTAMP_WITH_ZONE_RE.test(value)) {
    return null;
  }

  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return null;
  }

  return new Date(time).toISOString();
}

export function pickEarliestJoinedAt(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const normalizedCurrent = normalizeJoinedAt(current);
  const normalizedIncoming = normalizeJoinedAt(incoming);

  if (!normalizedCurrent) {
    return normalizedIncoming;
  }
  if (!normalizedIncoming) {
    return normalizedCurrent;
  }

  return Date.parse(normalizedIncoming) < Date.parse(normalizedCurrent)
    ? normalizedIncoming
    : normalizedCurrent;
}

export function validateJoinedAtContractValue(
  value: string | null,
): string | null {
  if (value === null) {
    return null;
  }

  const normalized = normalizeJoinedAt(value);
  if (normalized !== value) {
    throw new Error(
      "joinedAt must be null or an ISO-8601 UTC timestamp like 2026-04-18T13:42:10.000Z",
    );
  }

  return value;
}

function parseLooseTimestamp(value: string | undefined): string | undefined {
  const canonical = normalizeJoinedAt(value);
  if (canonical) return canonical;
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString();
}

/** Canonical Discord join time, falling back to serverJoinDate when joinedAt is missing. */
export function resolvePlayerJoinedAtIso(
  joinedAt?: string,
  serverJoinDate?: string,
): string | undefined {
  return parseLooseTimestamp(joinedAt) ?? parseLooseTimestamp(serverJoinDate);
}

/** True when the Discord join timestamp is within the last 6 weeks. */
export function isRecentDiscordJoin(
  joinedAt: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!joinedAt) return false;
  const time = Date.parse(joinedAt);
  if (!Number.isFinite(time)) return false;
  return time >= now - RECENT_DISCORD_JOIN_MS;
}
