/**
 * Yunite registration API helper.
 * Centralizes endpoint URL, request shape, and response parsing so only this file
 * needs updating if Yunite changes their API.
 *
 * Primary endpoint (yuniteapi.js): POST /api/v3/guild/{guildId}/registration/links
 * Body: { type: "DISCORD", userIds: string[] }
 *
 * Fallbacks used when POST returns no parseable match:
 * - GET  /guild/{guildId}/links/{discordId}
 * - GET  /guild/{guildId}/registration/links (full list, filter client-side)
 */

const YUNITE_API_BASE = "https://yunite.xyz/api/v3";

export interface YuniteRegistrationEntry {
  discordId?: string;
  userId?: string;
  epicId?: string;
  epicName?: string;
  name?: string;
  username?: string;
  displayName?: string;
  epicUsername?: string;
  verified?: boolean;
}

export interface YuniteRegistrationFetchResult {
  ok: boolean;
  status: number;
  entries: YuniteRegistrationEntry[];
  errorText?: string;
  source?: "post" | "link_by_id" | "get_all";
}

function buildRegistrationLinksUrl(guildId: string): string {
  return `${YUNITE_API_BASE}/guild/${guildId}/registration/links`;
}

function buildRegistrationLinkByDiscordIdUrl(
  guildId: string,
  discordUserId: string,
): string {
  return `${YUNITE_API_BASE}/guild/${guildId}/links/${discordUserId}`;
}

function isDiscordSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeDiscordId(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeRegistrationEntry(raw: unknown): YuniteRegistrationEntry {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const discordId =
    normalizeDiscordId(record.discordId) ??
    normalizeDiscordId(record.userId) ??
    normalizeDiscordId(record.id);

  return {
    discordId,
    userId: normalizeDiscordId(record.userId),
    epicId: normalizeDiscordId(record.epicId),
    epicName: pickString(record, [
      "epicName",
      "name",
      "username",
      "displayName",
      "epicUsername",
    ]),
    name: pickString(record, ["name"]),
    username: pickString(record, ["username"]),
    displayName: pickString(record, ["displayName"]),
    epicUsername: pickString(record, ["epicUsername"]),
    verified: typeof record.verified === "boolean" ? record.verified : undefined,
  };
}

function extractFromKeyedObject(
  record: Record<string, unknown>,
): YuniteRegistrationEntry[] {
  const entries: YuniteRegistrationEntry[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const entry = normalizeRegistrationEntry(value);
    if (!entry.discordId && isDiscordSnowflake(key)) {
      entry.discordId = key;
    }
    entries.push(entry);
  }

  return entries;
}

function extractRegistrationEntries(data: unknown): YuniteRegistrationEntry[] {
  if (Array.isArray(data)) {
    return data.map(normalizeRegistrationEntry);
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;

  for (const key of ["users", "links", "registrations", "results", "data"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map(normalizeRegistrationEntry);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = extractFromKeyedObject(value as Record<string, unknown>);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  if (Object.keys(record).some(isDiscordSnowflake)) {
    return extractFromKeyedObject(record);
  }

  if (record.discordId != null || record.userId != null || record.epicId != null) {
    return [normalizeRegistrationEntry(record)];
  }

  return [];
}

async function fetchYuniteJson(
  url: string,
  apiKey: string,
  init: RequestInit,
): Promise<YuniteRegistrationFetchResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "Y-Api-Token": apiKey,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      entries: [],
      errorText: error instanceof Error ? error.message : String(error),
    };
  }

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      status: response.status,
      entries: [],
      errorText,
    };
  }

  try {
    const data = await response.json();
    return {
      ok: true,
      status: response.status,
      entries: extractRegistrationEntries(data),
    };
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      entries: [],
      errorText: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchYuniteRegistrationByDiscordIds(
  discordUserIds: string[],
  apiKey: string,
  guildId: string,
): Promise<YuniteRegistrationFetchResult> {
  const result = await fetchYuniteJson(
    buildRegistrationLinksUrl(guildId),
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        type: "DISCORD",
        userIds: discordUserIds,
      }),
    },
  );

  return { ...result, source: "post" };
}

export async function fetchYuniteRegistrationLinkByDiscordId(
  discordUserId: string,
  apiKey: string,
  guildId: string,
): Promise<YuniteRegistrationFetchResult> {
  const result = await fetchYuniteJson(
    buildRegistrationLinkByDiscordIdUrl(guildId, discordUserId),
    apiKey,
    { method: "GET" },
  );

  return { ...result, source: "link_by_id" };
}

export async function fetchAllYuniteRegistrations(
  apiKey: string,
  guildId: string,
): Promise<YuniteRegistrationFetchResult> {
  const result = await fetchYuniteJson(
    buildRegistrationLinksUrl(guildId),
    apiKey,
    { method: "GET" },
  );

  return { ...result, source: "get_all" };
}

export function getEntryDiscordId(entry: YuniteRegistrationEntry): string | undefined {
  return normalizeDiscordId(entry.discordId ?? entry.userId);
}

export function findRegistrationForDiscordId(
  entries: YuniteRegistrationEntry[],
  discordUserId: string,
): YuniteRegistrationEntry | null {
  const target = normalizeDiscordId(discordUserId);
  if (!target) {
    return null;
  }

  const match = entries.find((entry) => getEntryDiscordId(entry) === target);
  if (!match) {
    return null;
  }

  const epicAccountId = match.epicId?.trim();
  const epicDisplayName = getEpicDisplayName(match);

  if (!epicAccountId && !epicDisplayName) {
    return null;
  }

  return match;
}

export function getEpicDisplayName(entry: YuniteRegistrationEntry): string | undefined {
  return (
    entry.epicName ??
    entry.name ??
    entry.username ??
    entry.displayName ??
    entry.epicUsername ??
    entry.epicId
  )?.trim() || undefined;
}

export function isYuniteVerifiedRegistration(entry: YuniteRegistrationEntry): boolean {
  if (typeof entry.verified === "boolean") {
    return entry.verified;
  }
  return Boolean(entry.epicId?.trim());
}

/**
 * Try POST lookup first, then per-user GET, then full GET list filtered by Discord ID.
 */
export async function lookupYuniteRegistrationForDiscordId(
  discordUserId: string,
  apiKey: string,
  guildId: string,
): Promise<{
  fetchResult: YuniteRegistrationFetchResult;
  registration: YuniteRegistrationEntry | null;
}> {
  const strategies: Array<() => Promise<YuniteRegistrationFetchResult>> = [
    () => fetchYuniteRegistrationByDiscordIds([discordUserId], apiKey, guildId),
    () => fetchYuniteRegistrationLinkByDiscordId(discordUserId, apiKey, guildId),
    () => fetchAllYuniteRegistrations(apiKey, guildId),
  ];

  let lastResult: YuniteRegistrationFetchResult = {
    ok: false,
    status: 0,
    entries: [],
    errorText: "No lookup strategies ran.",
  };

  for (const runStrategy of strategies) {
    const fetchResult = await runStrategy();
    lastResult = fetchResult;

    if (!fetchResult.ok) {
      continue;
    }

    const registration = findRegistrationForDiscordId(
      fetchResult.entries,
      discordUserId,
    );
    if (registration) {
      return { fetchResult, registration };
    }
  }

  return { fetchResult: lastResult, registration: null };
}
