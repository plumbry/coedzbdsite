/**
 * Yunite registration API helper.
 * Centralizes endpoint URL, request shape, and response parsing so only this file
 * needs updating if Yunite changes their API.
 *
 * Official endpoint (via yuniteapi.js): POST /api/v3/guild/{guildId}/registration/links
 * Body: { type: "DISCORD", userIds: string[] }
 */

const YUNITE_API_BASE = "https://yunite.xyz/api/v3";

export interface YuniteRegistrationEntry {
  discordId?: string;
  epicId?: string;
  epicName?: string;
  name?: string;
  verified?: boolean;
}

export interface YuniteRegistrationFetchResult {
  ok: boolean;
  status: number;
  entries: YuniteRegistrationEntry[];
  errorText?: string;
}

function buildRegistrationLinksUrl(guildId: string): string {
  return `${YUNITE_API_BASE}/guild/${guildId}/registration/links`;
}

function extractRegistrationEntries(data: unknown): YuniteRegistrationEntry[] {
  if (Array.isArray(data)) {
    return data as YuniteRegistrationEntry[];
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.users)) {
      return record.users as YuniteRegistrationEntry[];
    }
    if (Array.isArray(record.links)) {
      return record.links as YuniteRegistrationEntry[];
    }
    if (typeof record.discordId === "string") {
      return [record as YuniteRegistrationEntry];
    }
  }

  return [];
}

export async function fetchYuniteRegistrationByDiscordIds(
  discordUserIds: string[],
  apiKey: string,
  guildId: string,
): Promise<YuniteRegistrationFetchResult> {
  const url = buildRegistrationLinksUrl(guildId);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Y-Api-Token": apiKey,
      },
      body: JSON.stringify({
        type: "DISCORD",
        userIds: discordUserIds,
      }),
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

export function findRegistrationForDiscordId(
  entries: YuniteRegistrationEntry[],
  discordUserId: string,
): YuniteRegistrationEntry | null {
  const match = entries.find((entry) => entry.discordId === discordUserId);
  if (!match) {
    return null;
  }

  const epicAccountId = match.epicId?.trim();
  const epicDisplayName = (match.epicName ?? match.name ?? epicAccountId)?.trim();

  if (!epicAccountId && !epicDisplayName) {
    return null;
  }

  return match;
}

export function getEpicDisplayName(entry: YuniteRegistrationEntry): string | undefined {
  return (entry.epicName ?? entry.name ?? entry.epicId)?.trim() || undefined;
}

export function isYuniteVerifiedRegistration(entry: YuniteRegistrationEntry): boolean {
  if (typeof entry.verified === "boolean") {
    return entry.verified;
  }
  return Boolean(entry.epicId?.trim());
}
