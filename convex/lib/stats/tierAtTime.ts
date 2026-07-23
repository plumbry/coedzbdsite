/**
 * Resolve a player's tier / evaluation score as of a point in time
 * from tierHistory (same approach as admin tier snapshots).
 */

export type TierHistoryEntryLike = {
  _creationTime: number;
  tier: string;
  previousTier?: string;
  totalScore: number;
};

export type TierStateAtTime = {
  tier?: string;
  totalScore?: number;
  source: "history" | "pre_history_previous_tier" | "current_fallback";
};

/**
 * Parse an event date or ISO timestamp for as-of lookups.
 * Date-only values use end-of-day UTC so the whole event day is included.
 */
export function eventAsOfTimestamp(dateOrIso: string): number | undefined {
  const trimmed = dateOrIso.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ms = Date.parse(`${trimmed}T23:59:59.999Z`);
    return Number.isFinite(ms) ? ms : undefined;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Latest tierHistory state at or before `targetTimestamp`.
 *
 * - Prefer the newest history entry with `_creationTime <= target`.
 * - If all history is after the event, use `previousTier` of the earliest
 *   change when present (score unknown for that case).
 * - If the player has never had history, fall back to current tier/score.
 * - Do not apply current values when history exists only after the event
 *   without a previousTier (would leak post-event promotions into the past).
 */
export function resolveTierStateAtTime(
  history: readonly TierHistoryEntryLike[],
  targetTimestamp: number,
  currentFallback?: { tier?: string; totalScore?: number | null },
): TierStateAtTime | null {
  if (!Number.isFinite(targetTimestamp)) return null;

  const sorted = [...history].sort((a, b) => b._creationTime - a._creationTime);

  for (const entry of sorted) {
    if (entry._creationTime <= targetTimestamp) {
      return {
        tier: entry.tier,
        totalScore: entry.totalScore,
        source: "history",
      };
    }
  }

  if (sorted.length > 0) {
    const earliest = sorted[sorted.length - 1]!;
    if (earliest.previousTier) {
      return {
        tier: earliest.previousTier,
        source: "pre_history_previous_tier",
      };
    }
    return null;
  }

  const tier = currentFallback?.tier;
  const totalScore =
    typeof currentFallback?.totalScore === "number"
      ? currentFallback.totalScore
      : undefined;
  if (!tier && totalScore === undefined) return null;

  return {
    tier,
    totalScore,
    source: "current_fallback",
  };
}
