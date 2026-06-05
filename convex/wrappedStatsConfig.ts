/**
 * Central configuration for all wrapped statistics
 * Add new stats here and they'll automatically appear in the admin UI
 */

export const STAT_CATEGORIES = {
  EVENT: "Event Stats",
  SITE: "Site Stats",
} as const;

export interface StatDefinition {
  id: string;
  displayName: string;
  category: typeof STAT_CATEGORIES[keyof typeof STAT_CATEGORIES];
  needsPlayerCount?: boolean;
  supportsCustomText: boolean;
  description?: string;
}

export const WRAPPED_STATS: readonly StatDefinition[] = [
  // Event Stats
  {
    id: "totalEvents",
    displayName: "Total Events",
    category: STAT_CATEGORIES.EVENT,
    supportsCustomText: true,
    description: "Total number of events in the selected year",
  },
  {
    id: "peakAttendance",
    displayName: "Peak Event Attendance",
    category: STAT_CATEGORIES.EVENT,
    supportsCustomText: true,
    description: "Top 3 events with the highest player attendance",
  },
  {
    id: "playersPaid",
    displayName: "Players Paid Out",
    category: STAT_CATEGORIES.EVENT,
    supportsCustomText: true,
    description: "Number of unique players who received earnings",
  },
  {
    id: "mostActive",
    displayName: "Most Active Players",
    category: STAT_CATEGORIES.EVENT,
    needsPlayerCount: true,
    supportsCustomText: true,
    description: "Players with the most event participations",
  },
  {
    id: "mostTop5s",
    displayName: "Most Top 5 Finishes",
    category: STAT_CATEGORIES.EVENT,
    needsPlayerCount: true,
    supportsCustomText: true,
    description: "Players with the most top 5 placements",
  },
  {
    id: "mostWins",
    displayName: "Most Wins",
    category: STAT_CATEGORIES.EVENT,
    needsPlayerCount: true,
    supportsCustomText: true,
    description: "Players with the most first-place finishes",
  },
  {
    id: "highestWinRate",
    displayName: "Highest Win Rate",
    category: STAT_CATEGORIES.EVENT,
    needsPlayerCount: true,
    supportsCustomText: true,
    description: "Players with the best win percentage",
  },
  {
    id: "mostEliminations",
    displayName: "Most Eliminations",
    category: STAT_CATEGORIES.EVENT,
    needsPlayerCount: true,
    supportsCustomText: true,
    description: "Players with the most total eliminations",
  },
  {
    id: "eventsByType",
    displayName: "Events by Type",
    category: STAT_CATEGORIES.EVENT,
    supportsCustomText: true,
    description: "Breakdown of events by type (solos, duos, etc.)",
  },

  // Site Stats
  {
    id: "totalPlayers",
    displayName: "Total Players",
    category: STAT_CATEGORIES.SITE,
    supportsCustomText: true,
    description: "Total number of active players on the platform",
  },
  {
    id: "tierBreakdown",
    displayName: "Tier Breakdown",
    category: STAT_CATEGORIES.SITE,
    supportsCustomText: true,
    description: "Distribution of players across tiers",
  },
  {
    id: "mostActiveTier",
    displayName: "Most Active Tier",
    category: STAT_CATEGORIES.SITE,
    supportsCustomText: true,
    description: "Total events played by each tier",
  },
  {
    id: "topHolisticScores",
    displayName: "Top Holistic Scores",
    category: STAT_CATEGORIES.SITE,
    needsPlayerCount: true,
    supportsCustomText: true,
    description: "Players with the highest tier-eval holistic scores",
  },
  {
    id: "averageStatsByTier",
    displayName: "Average Stats by Tier",
    category: STAT_CATEGORIES.SITE,
    supportsCustomText: true,
    description: "Average performance metrics for each tier",
  },

  // Custom
  {
    id: "custom",
    displayName: "Custom Statistic",
    category: STAT_CATEGORIES.EVENT,
    supportsCustomText: true,
    description: "Enter a custom statistic with your own value",
  },
] as const;

// Derive TypeScript types from the config
export type StatType = typeof WRAPPED_STATS[number]["id"];

// Helper to get stat definition by ID
export function getStatDefinition(statId: StatType): StatDefinition | undefined {
  return WRAPPED_STATS.find((stat) => stat.id === statId);
}

// Helper to get stats by category
export function getStatsByCategory(category: string): readonly StatDefinition[] {
  return WRAPPED_STATS.filter((stat) => stat.category === category);
}

/** TODO(remove-by-2026-09-01): legacy ids still stored on published wrapped sections. */
export const DEPRECATED_WRAPPED_STAT_IDS = ["topPowerScores"] as const;

// Export valid stat IDs for schema validation (includes deprecated ids for existing content)
export const VALID_STAT_IDS = [
  ...WRAPPED_STATS.map((stat) => stat.id),
  ...DEPRECATED_WRAPPED_STAT_IDS,
];
