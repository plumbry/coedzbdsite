/**
 * Yunite "Get User Links" API helper.
 *
 * Primary: POST /api/v3/guild/{guildId}/registration/links
 *   Body: { type: "DISCORD", userIds: string[] }
 *   Response users[]: { discord: { id }, epic: { epicID, epicName }, dateVerified }
 *
 * Fallback: GET same URL (flat users[] with discordId / epicId — used by platform sync)
 */

import { yuniteFetch as yuniteApiFetch } from "../lib/yuniteRateLimit";

const YUNITE_API_BASE = "https://yunite.xyz/api/v3";

export interface YuniteRegistrationEntry {
  discordId?: string;
  discordName?: string;
  /** Hex Epic account ID — from users[].epic.epicID (POST) or epicId/epicID (GET) */
  epicId?: string;
  epicName?: string;
  dateVerified?: string;
  verified?: boolean;
}

export interface YuniteUserLinksResult {
  ok: boolean;
  status: number;
  entries: YuniteRegistrationEntry[];
  notLinked: string[];
  notFound: string[];
  errorText?: string;
  source?: "post" | "get_all";
}

function buildRegistrationLinksUrl(guildId: string): string {
  return `${YUNITE_API_BASE}/guild/${guildId}/registration/links`;
}

function normalizeId(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
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

/** POST response item: users[].epic.epicID + users[].epic.epicName */
function parsePostUserLinkEntry(raw: unknown): YuniteRegistrationEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const discord =
    record.discord && typeof record.discord === "object"
      ? (record.discord as Record<string, unknown>)
      : null;
  const epic =
    record.epic && typeof record.epic === "object"
      ? (record.epic as Record<string, unknown>)
      : null;

  if (!epic) {
    return null;
  }

  const epicId = normalizeId(epic.epicID);
  if (!epicId) {
    return null;
  }

  const dateVerified = pickString(record, ["dateVerified"]);
  return {
    discordId: normalizeId(discord?.id),
    discordName: pickString(discord ?? {}, ["name"]),
    epicId,
    epicName: pickString(epic, ["epicName"]),
    dateVerified,
    verified: Boolean(dateVerified),
  };
}

/** GET list item: flat discordId + epicId/epicID (platform sync shape) */
function parseGetListEntry(raw: unknown): YuniteRegistrationEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (record.epic && typeof record.epic === "object") {
    return parsePostUserLinkEntry(raw);
  }

  const epicId = normalizeId(record.epicID ?? record.epicId);
  if (!epicId) {
    return null;
  }

  const discordObj =
    record.discord && typeof record.discord === "object"
      ? (record.discord as Record<string, unknown>)
      : null;

  return {
    discordId: normalizeId(record.discordId ?? discordObj?.id),
    epicId,
    epicName: pickString(record, ["epicName", "name"]),
    dateVerified: pickString(record, ["dateVerified"]),
    verified: Boolean(epicId),
  };
}

function parsePostUserLinksResponse(data: unknown): Pick<
  YuniteUserLinksResult,
  "entries" | "notLinked" | "notFound"
> {
  if (!data || typeof data !== "object") {
    return { entries: [], notLinked: [], notFound: [] };
  }

  const record = data as Record<string, unknown>;
  const users = Array.isArray(record.users) ? record.users : [];
  const notLinked = Array.isArray(record.notLinked)
    ? record.notLinked.map((id) => String(id))
    : [];
  const notFound = Array.isArray(record.notFound)
    ? record.notFound.map((id) => String(id))
    : [];

  const entries = users
    .map(parsePostUserLinkEntry)
    .filter((entry): entry is YuniteRegistrationEntry => entry !== null);

  return { entries, notLinked, notFound };
}

function parseGetAllRegistrationsResponse(data: unknown): YuniteRegistrationEntry[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;
  const users = Array.isArray(record.users)
    ? record.users
    : Array.isArray(data)
      ? data
      : [];

  return users
    .map(parseGetListEntry)
    .filter((entry): entry is YuniteRegistrationEntry => entry !== null);
}

async function yuniteFetch(
  url: string,
  apiKey: string,
  init: RequestInit,
): Promise<{ response: Response } | { error: string }> {
  try {
    const response = await yuniteApiFetch(url, apiKey, init);
    return { response };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** POST Get User Links for Discord user IDs. */
export async function fetchYuniteUserLinksByDiscordIds(
  discordUserIds: string[],
  apiKey: string,
  guildId: string,
): Promise<YuniteUserLinksResult> {
  const url = buildRegistrationLinksUrl(guildId.trim());
  const fetched = await yuniteFetch(url, apiKey, {
    method: "POST",
    body: JSON.stringify({
      type: "DISCORD",
      userIds: discordUserIds,
    }),
  });

  if ("error" in fetched) {
    return {
      ok: false,
      status: 0,
      entries: [],
      notLinked: [],
      notFound: [],
      errorText: fetched.error,
      source: "post",
    };
  }

  const { response } = fetched;

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      status: response.status,
      entries: [],
      notLinked: [],
      notFound: [],
      errorText,
      source: "post",
    };
  }

  try {
    const data = await response.json();
    const parsed = parsePostUserLinksResponse(data);
    return {
      ok: true,
      status: response.status,
      ...parsed,
      source: "post",
    };
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      entries: [],
      notLinked: [],
      notFound: [],
      errorText: error instanceof Error ? error.message : String(error),
      source: "post",
    };
  }
}

/** GET full registration list (fallback — same endpoint used by platform sync). */
export async function fetchAllYuniteRegistrations(
  apiKey: string,
  guildId: string,
): Promise<YuniteUserLinksResult> {
  const url = buildRegistrationLinksUrl(guildId.trim());
  const fetched = await yuniteFetch(url, apiKey, { method: "GET" });

  if ("error" in fetched) {
    return {
      ok: false,
      status: 0,
      entries: [],
      notLinked: [],
      notFound: [],
      errorText: fetched.error,
      source: "get_all",
    };
  }

  const { response } = fetched;

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      status: response.status,
      entries: [],
      notLinked: [],
      notFound: [],
      errorText,
      source: "get_all",
    };
  }

  try {
    const data = await response.json();
    return {
      ok: true,
      status: response.status,
      entries: parseGetAllRegistrationsResponse(data),
      notLinked: [],
      notFound: [],
      source: "get_all",
    };
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      entries: [],
      notLinked: [],
      notFound: [],
      errorText: error instanceof Error ? error.message : String(error),
      source: "get_all",
    };
  }
}

export function findRegistrationForDiscordId(
  entries: YuniteRegistrationEntry[],
  discordUserId: string,
): YuniteRegistrationEntry | null {
  const target = normalizeId(discordUserId);
  if (!target) {
    return null;
  }

  return (
    entries.find(
      (entry) => normalizeId(entry.discordId) === target && entry.epicId,
    ) ?? null
  );
}

export function isDiscordIdInList(ids: string[], discordUserId: string): boolean {
  const target = normalizeId(discordUserId);
  if (!target) {
    return false;
  }
  return ids.some((id) => normalizeId(id) === target);
}

export function getEpicDisplayName(entry: YuniteRegistrationEntry): string | undefined {
  return entry.epicName?.trim() || undefined;
}

/** Returns users[].epic.epicID (or GET list epicId) */
export function getEpicAccountId(entry: YuniteRegistrationEntry): string | undefined {
  return entry.epicId?.trim() || undefined;
}

export function isYuniteVerifiedRegistration(entry: YuniteRegistrationEntry): boolean {
  return Boolean(entry.epicId?.trim() && entry.dateVerified);
}

function buildLookupErrorMessage(results: YuniteUserLinksResult[]): string {
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return "Could not fetch Yunite registration. Check API key, endpoint, or Yunite permissions.";
  }

  const statuses = [...new Set(failed.map((result) => result.status).filter(Boolean))];
  const statusHint = statuses.length > 0 ? ` (HTTP ${statuses.join(", ")})` : "";

  if (statuses.includes(401) || statuses.includes(403)) {
    return `Could not fetch Yunite registration${statusHint}. Verify YUNITE_API_KEY has Get User Links permission for this guild.`;
  }

  if (statuses.includes(429)) {
    return `Yunite Get User Links quota exceeded${statusHint}. Try again after the quota resets.`;
  }

  return `Could not fetch Yunite registration${statusHint}. Check API key, endpoint, or Yunite permissions.`;
}

/**
 * Discord User ID → POST Get User Links → users[].epic.epicID
 * Falls back to GET registration list if POST is unavailable.
 */
export async function lookupYuniteRegistrationForDiscordId(
  discordUserId: string,
  apiKey: string,
  guildId: string,
): Promise<{
  linksResult: YuniteUserLinksResult;
  registration: YuniteRegistrationEntry | null;
  attemptedResults: YuniteUserLinksResult[];
}> {
  const attemptedResults: YuniteUserLinksResult[] = [];

  const postResult = await fetchYuniteUserLinksByDiscordIds(
    [discordUserId],
    apiKey,
    guildId,
  );
  attemptedResults.push(postResult);

  if (postResult.ok) {
    const registration = findRegistrationForDiscordId(
      postResult.entries,
      discordUserId,
    );
    if (registration) {
      return { linksResult: postResult, registration, attemptedResults };
    }

    if (
      isDiscordIdInList(postResult.notLinked, discordUserId) ||
      isDiscordIdInList(postResult.notFound, discordUserId)
    ) {
      return { linksResult: postResult, registration: null, attemptedResults };
    }
  }

  const getResult = await fetchAllYuniteRegistrations(apiKey, guildId);
  attemptedResults.push(getResult);

  if (getResult.ok) {
    const registration = findRegistrationForDiscordId(
      getResult.entries,
      discordUserId,
    );
    return { linksResult: getResult, registration, attemptedResults };
  }

  const linksResult = postResult.ok ? postResult : getResult;
  return { linksResult, registration: null, attemptedResults };
}

export function formatYuniteLookupError(
  attemptedResults: YuniteUserLinksResult[],
): string {
  return buildLookupErrorMessage(attemptedResults);
}
