/** Shared Yunite API fetch helper: spacing, 429/524/5xx retries, rate-limit headers. */

export const YUNITE_DEFAULT_REQUEST_GAP_MS = 600;
export const YUNITE_DEFAULT_MAX_RETRIES = 3;

export type YuniteRetryDelaySource =
  | "Y-RateLimit-ResetIn"
  | "Retry-After"
  | "exponential-backoff";

export type YuniteRetryDelay = {
  waitMs: number;
  source: YuniteRetryDelaySource;
};

export type YuniteFetchOptions = {
  /** Minimum ms between consecutive Yunite API calls in this runtime. Default 600. */
  requestGapMs?: number;
  maxRetries?: number;
  /** Skip pre-request spacing (first call in a fresh batch). */
  skipSpacing?: boolean;
  /**
   * Log rate-limit response headers on 429/524 for calibration (Convex logs).
   * Default true.
   */
  logRateLimitHeaders?: boolean;
};

let lastYuniteRequestAt = 0;

export function isYuniteRetryableStatus(status: number): boolean {
  return status === 429 || status === 524 || status >= 500;
}

/** Collect Yunite / standard rate-limit headers from a response (for logging). */
export function collectRateLimitHeaders(
  response: Response,
): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "retry-after" ||
      lower.startsWith("y-ratelimit") ||
      lower.startsWith("x-ratelimit")
    ) {
      headers[key] = value;
    }
  });
  return headers;
}

/**
 * Parse Retry-After per RFC 7231: integer seconds or HTTP-date.
 * Returns null when missing or unparseable.
 */
export function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter?.trim()) {
    return null;
  }

  const trimmed = retryAfter.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.max(seconds * 1000, 1000);
    }
    return null;
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? Math.max(delta, 1000) : null;
  }

  return null;
}

/** Resolve retry delay: Y-RateLimit-ResetIn → Retry-After → exponential backoff. */
export function yuniteRetryDelay(
  response: Response,
  attempt: number,
): YuniteRetryDelay {
  const resetIn = response.headers.get("Y-RateLimit-ResetIn");
  if (resetIn) {
    const seconds = parseInt(resetIn, 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return {
        waitMs: Math.max(seconds * 1000, 1000),
        source: "Y-RateLimit-ResetIn",
      };
    }
  }

  const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
  if (retryAfterMs !== null) {
    return { waitMs: retryAfterMs, source: "Retry-After" };
  }

  return {
    waitMs: Math.min(120_000, 2000 * Math.pow(2, attempt)),
    source: "exponential-backoff",
  };
}

/** @deprecated Use yuniteRetryDelay().waitMs */
export function yuniteRetryDelayMs(response: Response, attempt: number): number {
  return yuniteRetryDelay(response, attempt).waitMs;
}

function logYuniteRateLimitEvent(
  url: string,
  response: Response,
  attempt: number,
  maxRetries: number,
  delay: YuniteRetryDelay,
): void {
  const headers = collectRateLimitHeaders(response);
  console.warn(
    "[Yunite rate limit]",
    JSON.stringify({
      url,
      status: response.status,
      attempt: attempt + 1,
      maxRetries,
      waitMs: delay.waitMs,
      delaySource: delay.source,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    }),
  );
}

function isTransientNetworkError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      parts.push(cause.message);
    } else if (cause != null) {
      parts.push(String(cause));
    }
  } else {
    parts.push(String(error));
  }

  const combined = parts.join(" ").toLowerCase();
  return (
    combined.includes("fetch failed") ||
    combined.includes("econnreset") ||
    combined.includes("etimedout") ||
    combined.includes("econnrefused") ||
    combined.includes("socket hang up") ||
    combined.includes("network error") ||
    combined.includes("timed out")
  );
}

async function waitForRequestGap(gapMs: number): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastYuniteRequestAt;
  if (lastYuniteRequestAt > 0 && elapsed < gapMs) {
    await new Promise((resolve) => setTimeout(resolve, gapMs - elapsed));
  }
  lastYuniteRequestAt = Date.now();
}

function buildYuniteHeaders(
  apiKey: string,
  init: RequestInit,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Y-Api-Token": apiKey.trim(),
  };
  if (init.body) {
    headers["Content-Type"] = "application/json";
  }
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, init.headers);
    }
  }
  return headers;
}

/**
 * Fetch a Yunite API URL with consistent spacing and automatic retry on
 * rate limits (429), gateway timeouts (524), and server errors (5xx).
 */
export async function yuniteFetch(
  url: string,
  apiKey: string,
  init: RequestInit = {},
  options: YuniteFetchOptions = {},
): Promise<Response> {
  const gapMs = options.requestGapMs ?? YUNITE_DEFAULT_REQUEST_GAP_MS;
  const maxRetries = options.maxRetries ?? YUNITE_DEFAULT_MAX_RETRIES;
  const logRateLimitHeaders = options.logRateLimitHeaders ?? true;

  if (!options.skipSpacing) {
    await waitForRequestGap(gapMs);
  } else {
    lastYuniteRequestAt = Date.now();
  }

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: buildYuniteHeaders(apiKey, init),
      });
    } catch (error) {
      if (attempt < maxRetries && isTransientNetworkError(error)) {
        const waitMs = Math.min(120_000, 2000 * Math.pow(2, attempt));
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Yunite network error for ${url}: ${message}. Retrying in ${waitMs}ms (${attempt + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }

    lastYuniteRequestAt = Date.now();

    if (response.ok || !isYuniteRetryableStatus(response.status)) {
      return response;
    }

    lastResponse = response;

    if (attempt < maxRetries) {
      const delay = yuniteRetryDelay(response, attempt);
      if (
        logRateLimitHeaders &&
        (response.status === 429 || response.status === 524)
      ) {
        logYuniteRateLimitEvent(url, response, attempt, maxRetries, delay);
      } else {
        console.warn(
          `Yunite API ${response.status} for ${url}. Retrying in ${delay.waitMs}ms (${attempt + 1}/${maxRetries}, ${delay.source})...`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay.waitMs));
    } else if (
      logRateLimitHeaders &&
      (response.status === 429 || response.status === 524)
    ) {
      const headers = collectRateLimitHeaders(response);
      console.warn(
        "[Yunite rate limit]",
        JSON.stringify({
          url,
          status: response.status,
          attempt: attempt + 1,
          maxRetries,
          retriesExhausted: true,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        }),
      );
    }
  }

  return lastResponse!;
}

function looksLikeHtml(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

/** Human-readable Yunite/Cloudflare error (never dump raw HTML into the UI). */
export function formatYuniteApiError(status: number, bodyText: string): string {
  if (looksLikeHtml(bodyText)) {
    if (status === 429) {
      return "Yunite API rate limited (429). Wait and retry.";
    }
    if (status === 502 || status === 524 || status === 503) {
      return `Yunite API ${status} — gateway timeout. Wait a few minutes and run Process Import again.`;
    }
    return `Yunite API returned an HTML error page (HTTP ${status}). Try again later.`;
  }

  const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 200);
  if (status === 429) {
    return snippet
      ? `Yunite API rate limited (429): ${snippet}`
      : "Yunite API rate limited (429). Wait and retry.";
  }
  return snippet
    ? `Yunite API error ${status}: ${snippet}`
    : `Yunite API error ${status}`;
}

/** Parse Yunite JSON; reject HTML/garbage with a clear message. */
export async function yuniteResponseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (looksLikeHtml(text)) {
    throw new Error(formatYuniteApiError(response.status, text));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Yunite API returned invalid JSON (HTTP ${response.status}).`,
    );
  }
}

/** Fetch and throw a descriptive error when the response is not ok. */
export async function yuniteFetchOrThrow(
  url: string,
  apiKey: string,
  init: RequestInit = {},
  options: YuniteFetchOptions = {},
): Promise<Response> {
  const response = await yuniteFetch(url, apiKey, init, options);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(formatYuniteApiError(response.status, errorText));
  }
  return response;
}
