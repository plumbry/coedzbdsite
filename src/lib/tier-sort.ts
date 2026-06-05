/** Canonical tier order: S first, then A, B, C, D. */
export const TIER_SORT_ORDER = ["S", "A", "B", "C", "D"] as const;

const TIER_RANK: Record<string, number> = Object.fromEntries(
  TIER_SORT_ORDER.map((tier, index) => [tier, index]),
);

const UNKNOWN_TIER_RANK = TIER_SORT_ORDER.length;

export function getTierRank(tier: string | undefined | null): number {
  if (!tier) return UNKNOWN_TIER_RANK;
  return TIER_RANK[tier] ?? UNKNOWN_TIER_RANK;
}

/** Negative when `a` sorts before `b` (S before A before B before C). */
export function compareTiers(
  a: string | undefined | null,
  b: string | undefined | null,
): number {
  return getTierRank(a) - getTierRank(b);
}

export function compareTierField(
  a: string | undefined | null,
  b: string | undefined | null,
  direction: "asc" | "desc",
): number {
  const cmp = compareTiers(a, b);
  return direction === "asc" ? cmp : -cmp;
}

export function sortByTier<T>(
  items: readonly T[],
  getTier: (item: T) => string | undefined | null,
  tiebreaker?: (a: T, b: T) => number,
): T[] {
  return [...items].sort((a, b) => {
    const byTier = compareTiers(getTier(a), getTier(b));
    if (byTier !== 0) return byTier;
    return tiebreaker?.(a, b) ?? 0;
  });
}

export const DEFAULT_PLAYER_LIST_SORT = {
  field: "tier",
  direction: "asc" as const,
};
