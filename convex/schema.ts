import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { VALID_STAT_IDS } from "./wrappedStatsConfig.js";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    role: v.optional(v.union(
      v.literal("admin"),
      v.literal("event_mod"),
      v.literal("viewer")
    )),
    /** Discord snowflake — pre-seeded before first Clerk Discord login (Phase 1 migration). */
    discordUserId: v.optional(v.string()),
    /** Display-only; not used for auth matching. */
    discordUsername: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"])
    .index("by_username", ["username"])
    .index("by_discord_user_id", ["discordUserId"]),
  
  players: defineTable({
    discordUsername: v.string(),
    name: v.optional(v.string()), // Cached display name from Discord
    nickname: v.optional(v.string()),
    avatarUrl: v.optional(v.string()), // Cached Discord avatar URL
    discordUserId: v.string(),
    alternateDiscordUserIds: v.optional(v.array(v.string())), // Up to 2 additional Discord IDs (total of 3)
    serverJoinDate: v.string(),
    lastDiscordSync: v.optional(v.number()), // Timestamp of last Discord data sync
    epicUsername: v.string(),
    previousEpicIds: v.optional(v.array(v.object({
      epicId: v.string(),
      changedAt: v.string(), // ISO 8601 timestamp when the ID was changed
    }))), // History of previous Epic Account IDs
    epicId: v.optional(v.string()), // Epic Account ID from Yunite API
    platform: v.optional(v.union(
      v.literal("PC"),
      v.literal("PS4"),
      v.literal("XB1"),
      v.literal("SWITCH"),
      v.literal("MOBILE"),
    )), // Gaming platform from Yunite registration
    hasMatchData: v.optional(v.boolean()), // True if player has match-level stats from Yunite
    discordRoles: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
    }))),
    // Social links (usernames only)
    twitterUsername: v.optional(v.string()),
    twitchUsername: v.optional(v.string()),
    youtubeUsername: v.optional(v.string()),
    // Temporary deprecated fields - will be removed after cleanup
    twitterUrl: v.optional(v.string()),
    twitchUrl: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    // These will be calculated and updated later from scores
    totalScore: v.optional(v.number()),
    tier: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    // Status: active (public), archived (admin only), rejected (admin only), discord_member (bot synced, not evaluated)
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("rejected"),
      v.literal("discord_member")
    )),
    // Current membership status for new application system
    currentMembershipStatus: v.optional(v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("former")
    )),
    // Alternate account — hidden from member directory and profiles (Features panel)
    isAlt: v.optional(v.boolean()),
    // Admin-only comments
    adminComments: v.optional(v.string()),
    // Rejection reason (when status is rejected)
    rejectionReason: v.optional(v.string()),
    // Archive reason (when status is archived)
    archiveReason: v.optional(v.union(
      v.literal("left server"),
      v.literal("application incomplete"),
      v.literal("no tier role"),
      v.literal("banned"),
      v.literal("other")
    )),
    // Review flag for bulk uploads that need info checking
    needsReview: v.optional(v.boolean()),
    // Flag if player has left Discord server (no longer appears in member sync)
    hasLeftServer: v.optional(v.boolean()),
    /** Cached: played in an event linked to a recent import (refreshed by cron). */
    isRecentlyActive: v.optional(v.boolean()),
    /** Denormalized unique event count across eventResults + thirdPartyResults. */
    eventsPlayedCount: v.optional(v.number()),
    /** Denormalized most recent event date (ISO string). */
    lastEventDate: v.optional(v.string()),
    /** Denormalized from manualScores.gender for public directory (avoids N+1 score reads). */
    gender: v.optional(v.number()),
    // Discord sync match quality (when bot syncs Discord members)
    matchConfidence: v.optional(v.union(
      v.literal("exact"), // Exact Discord ID match
      v.literal("username"), // Exact username match (case-insensitive)
      v.literal("fuzzy"), // Fuzzy/partial username match
      v.literal("manual") // Manually created/linked
    )),
    // Cached Team Contribution (TC) - updated when match data changes
    contributionScore: v.optional(v.object({
      score: v.number(), // Overall TC (0.00-1.00)
      breakdown: v.object({
        killShare: v.number(), // Kill share component
        top5Rate: v.optional(v.number()), // Top-5 placement rate component (new)
        impactScore: v.optional(v.number()), // Impact ratio component (deprecated - replaced by top5Rate)
        survivalRate: v.number(), // Survival rate component
        clutchScore: v.number(), // Clutch factor component
      }),
      matchesAnalyzed: v.number(), // Number of matches used in calculation
      averageKillsPerMatch: v.optional(v.number()), // Cached avg kills per match (from matchPlayerStats)
      averageDeathsPerMatch: v.optional(v.number()), // Cached avg deaths per match (from matchPlayerStats)
      profileKillsPerMatch: v.optional(v.number()), // Cached avg kills per match (from thirdPartyResults - matches player profile)
      duoPartner: v.optional(v.string()), // Deprecated: Epic username of consistent duo
      lastUpdated: v.number(), // Timestamp of last calculation
    })),
    // Cached top-5 data (updated when results are added/changed)
    topFiveCache: v.optional(v.object({
      recentTop5Count: v.number(), // Number of top-5 finishes in last 5 events
      recentTop4Count: v.optional(v.number()), // Number of top-4 finishes in last 5 events
      recentTop3Count: v.number(), // Number of top-3 finishes in last 5 events
      hasRecentActivity: v.boolean(), // Played within last 8 weeks
      mostRecentEventTime: v.number(), // Timestamp of most recent event
      consistentTeammateName: v.optional(v.string()), // Most frequent teammate's name
      recentTop5WithTeammate: v.optional(v.number()), // Number of recent top-5s with consistent teammate
      lastUpdated: v.number(), // When this cache was last updated
    })),
    // Cached DCA (Duo Carry Adjustment) data - updated when match data changes
    dcaCache: v.optional(v.object({
      dca: v.number(), // The DCA multiplier (0.75 - 1.25)
      consistentDuoEpic: v.union(v.string(), v.null()), // Epic username of consistent duo
      performanceRatio: v.union(v.number(), v.null()), // Legacy performance ratio for display
      withoutDuoCount: v.number(), // Number of events without consistent duo
      hasMutualDependency: v.boolean(), // True if both players are each other's consistent duo
      lastUpdated: v.number(), // Timestamp of last calculation
    })),
    // TODO(remove-after-migration): optional until clearDeprecatedPlayerRankingFields finishes on prod
    powerScore: v.optional(v.number()),
    rankingStats: v.optional(
      v.object({
        averagePlacement: v.optional(v.number()),
        averageTeamElims: v.optional(v.number()),
        averageTeamKD: v.optional(v.number()),
        top3Finishes: v.optional(v.number()),
        totalEvents: v.optional(v.number()),
        totalTeamElims: v.optional(v.number()),
        totalTeamScore: v.optional(v.number()),
        unfilteredTotalEvents: v.optional(v.number()),
        winRate: v.optional(v.number()),
      }),
    ),
  })
    .index("by_discord_username", ["discordUsername"])
    .index("by_discord_user_id", ["discordUserId"])
    .index("by_epic_username", ["epicUsername"])
    .index("by_status", ["status"])
    .index("by_membership_status", ["currentMembershipStatus"])
    .index("by_is_alt", ["isAlt"]),

  /** Indexed Discord ID → player lookup for alternates (webhook-safe; no full-table scan). */
  playerDiscordAliases: defineTable({
    discordUserId: v.string(),
    playerId: v.id("players"),
  })
    .index("by_discord_user_id", ["discordUserId"])
    .index("by_player", ["playerId"]),
  
  manualScores: defineTable({
    playerId: v.id("players"),
    applicationId: v.optional(v.id("applications")), // Link to application for new system
    // Score categories (0-100 each)
    thirdPartyExperience: v.optional(v.number()),
    thirdPartyPerformance: v.optional(v.number()),
    inGameTourneyPerformance: v.optional(v.number()),
    officialEarnings: v.optional(v.number()),
    rankedPerformance: v.optional(v.number()),
    hoursPlayed: v.optional(v.number()),
    notorietyTeammates: v.optional(v.number()),
    age: v.optional(v.number()),
    gender: v.optional(v.number()),
    ability: v.optional(v.number()),
    region: v.optional(v.number()),
    gameSense: v.optional(v.number()),
    seasonPerformance: v.optional(v.number()),
    modifiers: v.optional(v.number()),
    // Female verification (only if gender = 50)
    femaleVerified: v.optional(v.boolean()),
    verificationMethod: v.optional(v.union(
      v.literal("ID"),
      v.literal("FACECAM"),
      v.literal("TRUSTED SERVER")
    )),
    // Old fields for backward compatibility
    communication: v.optional(v.number()),
    teamFit: v.optional(v.number()),
    maturity: v.optional(v.number()),
    rankExperience: v.optional(v.number()),
    fpsHardware: v.optional(v.number()),
    // Calculated fields
    totalScore: v.number(),
    tier: v.string(),
    evaluatedBy: v.optional(v.id("users")),
  })
    .index("by_player", ["playerId"])
    .index("by_application", ["applicationId"])
    .index("by_gender", ["gender"]),
  
  // Member Applications System
  applications: defineTable({
    discordUsername: v.string(),
    discordId: v.string(),
    fortniteProfileLink: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected")
    ),
    notes: v.optional(v.string()),
    // Flags for repeat applicants
    isPreviouslyApplied: v.boolean(),
    isPreviouslyAccepted: v.boolean(),
    isFormerMember: v.boolean(),
    // Final decision
    rejectionReason: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    autoAcceptedByDiscordSync: v.optional(v.boolean()),
    rejectedAt: v.optional(v.number()),
    // Linked player record (created on acceptance)
    playerId: v.optional(v.id("players")),
    // Admin who processed
    processedBy: v.optional(v.id("users")),
    processedByName: v.optional(v.string()),
  })
    .index("by_discord_id", ["discordId"])
    .index("by_discord_id_and_status", ["discordId", "status"])
    .index("by_discord_username", ["discordUsername"])
    .index("by_status", ["status"])
    .index("by_player_id", ["playerId"]),
  
  // Status change audit log
  statusEvents: defineTable({
    entityType: v.union(
      v.literal("application"),
      v.literal("member")
    ),
    entityId: v.string(), // Application ID or Player ID
    discordId: v.string(),
    discordUsername: v.string(),
    previousStatus: v.optional(v.string()),
    newStatus: v.string(),
    action: v.string(), // "submitted", "accepted", "rejected", "left", "kicked", "banned"
    reason: v.optional(v.string()),
    performedBy: v.optional(v.id("users")),
    performedByName: v.optional(v.string()),
    isSystemAction: v.boolean(), // True if automated (e.g., Discord bot sync)
  })
    .index("by_discord_id", ["discordId"])
    .index("by_entity", ["entityType", "entityId"]),
  
  eventResults: defineTable({
    playerId: v.id("players"),
    eventName: v.string(),
    eventDate: v.string(),
    placement: v.number(),
    eliminations: v.number(),
    kdRatio: v.number(),
    eventScore: v.number(),
    yuniteLeaderboardUrl: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    importId: v.optional(v.id("thirdPartyImports")), // Link to import metadata
    eventId: v.optional(v.id("events")), // Link to Event from Event Manager
  })
    .index("by_player", ["playerId"])
    .index("by_event_date", ["eventDate"])
    .index("by_import", ["importId"]),
  
  syncStatus: defineTable({
    syncType: v.string(), // "discord" or "yunite"
    lastSyncTime: v.number(),
    status: v.string(), // "success", "error", "in_progress"
    errorMessage: v.optional(v.string()),
    recordsAdded: v.optional(v.number()),
    recordsUpdated: v.optional(v.number()),
    recordsArchived: v.optional(v.number()),
  }).index("by_type", ["syncType"]),
  
  auditLogs: defineTable({
    userId: v.id("users"),
    userName: v.optional(v.string()),
    action: v.string(), // "player_created", "player_status_changed", "score_updated", etc.
    entityType: v.string(), // "player", "score", "event", etc.
    entityId: v.optional(v.string()), // ID of the affected entity (optional for bulk operations)
    details: v.optional(v.string()), // JSON string with additional details
    previousValue: v.optional(v.string()), // Previous state (if applicable)
    newValue: v.optional(v.string()), // New state
  })
    .index("by_user", ["userId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_action", ["action"]),
  
  tierHistory: defineTable({
    playerId: v.id("players"),
    tier: v.string(),
    previousTier: v.optional(v.string()),
    totalScore: v.number(),
    changedBy: v.optional(v.id("users")),
  }).index("by_player", ["playerId"]),
  
  thirdPartyImports: defineTable({
    leaderboardUrl: v.string(),
    leaderboardId: v.string(),
    eventName: v.string(),
    eventDate: v.optional(v.string()), // Optional event date
    organizer: v.optional(v.string()), // Optional organizer/guild
    source: v.string(), // "Yunite", "CSV", "Yunite API"
    importMethod: v.optional(v.string()), // "api" or "csv"
    playersMatched: v.number(),
    playersUnmatched: v.number(),
    totalPlayers: v.number(),
    importedBy: v.id("users"),
    importedByName: v.optional(v.string()),
    eventId: v.optional(v.id("events")), // Link to event if auto-imported
    isManualImport: v.optional(v.boolean()), // True for imports from debug tool (admin-only)
    matchDataSynced: v.optional(v.boolean()), // True if match data has been fetched and aggregated
    matchDataSyncedAt: v.optional(v.number()), // Timestamp when match data was last synced
    totalMatchKills: v.optional(v.number()), // Sum of all team kills across all matches (from match-level data)
    dataFullyCached: v.optional(v.boolean()), // True if all data (leaderboard + matches) is fully cached
  }).index("by_leaderboard_id", ["leaderboardId"])
    .index("by_event", ["eventId"])
    .index("by_manual", ["isManualImport"])
    .index("by_source", ["source"]),
  
  thirdPartyResults: defineTable({
    importId: v.id("thirdPartyImports"),
    playerId: v.optional(v.id("players")), // null if unmatched
    eventName: v.string(),
    source: v.string(), // "Yunite"
    leaderboardUrl: v.string(),
    // Player identifiers from leaderboard
    epicUsername: v.string(),
    epicId: v.optional(v.string()), // Epic ID from Yunite API
    discordUsername: v.optional(v.string()),
    discordId: v.optional(v.string()),
    // Team info
    teamId: v.optional(v.string()),
    teamName: v.optional(v.string()),
    // Stats
    placement: v.number(),
    points: v.number(),
    eliminations: v.optional(v.number()), // Individual player kills (finishes only)
    teamKills: v.optional(v.number()), // Team total kills
    damage: v.optional(v.number()), // Total damage dealt
    deaths: v.optional(v.number()), // Total deaths
    knocks: v.optional(v.number()), // Total knocks (DBNOs that weren't finished)
    wins: v.optional(v.number()), // Number of games won (1st place finishes)
    matchesPlayed: v.optional(v.number()), // Total matches/games played in this tournament
    averagePlacement: v.optional(v.number()),
    averageSecondsSurvived: v.optional(v.number()),
    teamMembers: v.optional(v.array(v.string())),
    // Match status
    matched: v.boolean(),
    manuallyLinked: v.optional(v.boolean()), // True if admin manually linked
    // Manual duo selection for dynamic events
    duoAssignment: v.optional(v.union(v.literal("duo1"), v.literal("duo2"), v.null())), // Which duo this player belongs to
  })
    .index("by_player", ["playerId"])
    .index("by_import", ["importId"])
    .index("by_import_discord", ["importId", "discordId"])
    .index("by_event_name", ["eventName"])
    .index("by_source", ["source"])
    .index("by_matched", ["importId", "matched"]),
  
  events: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("scrim"), 
      v.literal("minicup"), 
      v.literal("season"), 
      v.literal("mini-season"),
      v.literal("random"), 
      v.literal("random-squads"), 
      v.literal("random-trios"),
      v.literal("solos-meets-duos"),
      v.literal("scrim-series"),
      v.literal("showdown")
    ),
    mode: v.union(v.literal("ZB Main Map"), v.literal("Reload")),
    startDate: v.string(),
    endDate: v.string(),
    description: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    status: v.union(v.literal("upcoming"), v.literal("ongoing"), v.literal("completed")),
    season: v.optional(v.string()),
    lastYunitSync: v.optional(v.number()), // Timestamp of last Yunite API sync
    totalTeams: v.optional(v.number()), // Cached total teams from leaderboard
    totalPlayers: v.optional(v.number()), // Cached total players from leaderboard
    // Money earnings tracking (all event types)
    placementEarningsTopN: v.optional(v.number()), // Track earnings for top N teams (e.g., 2, 3, 5, 10)
    matchWinEarnings: v.optional(v.boolean()), // True if tracking game winners
    // Random Trios specific: separate earnings for duo and solo leaderboards
    duoPlacementEarningsTopN: v.optional(v.number()), // Top N duos on duo cumulative leaderboard
    soloPlacementEarningsTopN: v.optional(v.number()), // Top N solos on solo cumulative leaderboard
    // Deprecated: old literal-based earnings tracking (kept for backwards compatibility)
    placementEarnings: v.optional(v.union(
      v.literal("top2teams"),
      v.literal("top3teams"),
      v.literal("top5teams")
    )),
    // Deprecated: old single-field earnings tracking (kept for backwards compatibility)
    earningsType: v.optional(v.union(
      v.literal("top3teams"),
      v.literal("top5teams"),
      v.literal("gamewinners")
    )),
    // Standard leaderboards (optional) - yunite.xyz/leaderboard/{id} links
    standardLeaderboards: v.optional(v.array(v.string())),
    // Two-lobby mode: second set of leaderboard URLs (Lobby B)
    twoLobbies: v.optional(v.boolean()),
    standardLeaderboardsLobby2: v.optional(v.array(v.string())),
    // Mini-season specific: qualifier and finals leaderboards
    qualifierLobby1Leaderboards: v.optional(v.array(v.string())),
    qualifierLobby2Leaderboards: v.optional(v.array(v.string())),
    finalsLeaderboards: v.optional(v.array(v.string())),
    // Deprecated field (kept for backward compatibility with old events)
    apiLeaderboards: v.optional(v.array(v.string())),
    // Dynamic pair detection for random-team events (deprecated - use type instead)
    dynamicPairDetection: v.optional(v.boolean()),
    // Exclude lowest score from cumulative for random events
    excludeLowestScore: v.optional(v.boolean()),
    // Season ID for grouping events (e.g., "season-1", "season-2")
    seasonId: v.optional(v.string()),
    // Skip first N weeks of points in cumulative (for seasons)
    skipFirstNWeeksPoints: v.optional(v.number()),
    // Manual flag to exclude from analytics and internal stats (replaces automatic "No Money" name detection)
    isNoMoneyEvent: v.optional(v.boolean()),
    // Solos-meets-duos team size: "duo" (2 players) or "trio" (3 players)
    smdTeamSize: v.optional(v.union(v.literal("duo"), v.literal("trio"))),
    // Scrim Series: best N games per player for cumulative leaderboard
    bestNGames: v.optional(v.number()),
    // Scrim Series: duration in weeks (3 or 6)
    seriesDurationWeeks: v.optional(v.union(v.literal(3), v.literal(6))),
    // Showdown: best N weekly totals (default 2 of up to 4 weeks)
    showdownBestWeeks: v.optional(v.number()),
    // Showdown: default points deducted per penalty (individual penalties may override)
    penaltyAmount: v.optional(v.number()),
    // Link to standalone /scrim-series product (admin/scrim-series)
    linkedScrimSeriesId: v.optional(v.id("scrimSeries")),
    createdBy: v.id("users"),
    // Discord Scheduled Event sync
    discordEventId: v.optional(v.string()), // Discord scheduled event ID
    needsSetup: v.optional(v.boolean()), // True if imported from Discord and needs admin to complete details
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_date", ["startDate"])
    .index("by_season_id", ["seasonId"])
    .index("by_discord_event_id", ["discordEventId"])
    .index("by_linked_scrim_series", ["linkedScrimSeriesId"]),
  
  // Pre-assigned groups for solos-meets-duos events (duos or trios)
  eventDuoPairs: defineTable({
    eventId: v.id("events"),
    player1Id: v.id("players"),
    player2Id: v.id("players"),
    player3Id: v.optional(v.id("players")), // Only set for trio groups
  })
    .index("by_event", ["eventId"]),
  
  // Showdown: snapshot of player tiers locked at event start
  showdownTierSnapshots: defineTable({
    eventId: v.id("events"),
    playerId: v.id("players"),
    tier: v.string(), // S, A, B, C
  })
    .index("by_event", ["eventId"])
    .index("by_event_and_player", ["eventId", "playerId"]),

  // Showdown: manual penalties deducted from weekly-best totals
  eventPenalties: defineTable({
    eventId: v.id("events"),
    playerId: v.id("players"),
    reason: v.string(),
    amount: v.number(),
    excluded: v.boolean(),
    dedupKey: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_and_player", ["eventId", "playerId"]),
  
  replays: defineTable({
    fileName: v.string(),
    storageId: v.id("_storage"), // Original replay file
    eventId: v.optional(v.id("events")), // Linked event
    uploadedBy: v.id("users"),
    uploadedByName: v.optional(v.string()),
    parsedAt: v.optional(v.number()), // Timestamp when parsed
    parseStatus: v.union(
      v.literal("pending"),
      v.literal("parsing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    parseError: v.optional(v.string()),
    // Match metadata from replay
    matchId: v.optional(v.string()),
    gameMode: v.optional(v.string()),
    mapName: v.optional(v.string()),
    matchDuration: v.optional(v.number()), // in seconds
    recordingStartTime: v.optional(v.string()),
    recordingEndTime: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_status", ["parseStatus"])
    .index("by_uploaded_by", ["uploadedBy"]),
  
  replayTeamStats: defineTable({
    replayId: v.id("replays"),
    teamId: v.optional(v.string()),
    teamName: v.optional(v.string()),
    placement: v.optional(v.number()),
    totalEliminations: v.number(),
    totalDamage: v.optional(v.number()),
    matchesPlayed: v.number(),
  })
    .index("by_replay", ["replayId"]),
  
  replayPlayerStats: defineTable({
    replayId: v.id("replays"),
    playerId: v.optional(v.id("players")), // Linked to our player DB
    epicUsername: v.string(),
    epicId: v.optional(v.string()),
    teamId: v.optional(v.string()),
    // Stats
    eliminations: v.number(),
    deaths: v.number(),
    damage: v.optional(v.number()),
    assists: v.optional(v.number()),
    revives: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    materials: v.optional(v.number()),
    // Matching status
    matched: v.boolean(),
  })
    .index("by_replay", ["replayId"])
    .index("by_player", ["playerId"]),
  
  supportTickets: defineTable({
    discordUsername: v.string(),
    message: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("archived")
    ),
    archivedBy: v.optional(v.id("users")),
    archivedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"]),
  
  matchEliminationOverrides: defineTable({
    importId: v.id("thirdPartyImports"),
    sessionId: v.string(), // Match session ID
    discordId: v.string(), // Player's Discord ID
    eliminations: v.number(), // Manual override value
    editedBy: v.id("users"),
    editedByName: v.optional(v.string()),
  })
    .index("by_import", ["importId"])
    .index("by_match", ["importId", "sessionId"])
    .index("by_player", ["importId", "sessionId", "discordId"]),
  
  matchPlayerStats: defineTable({
    importId: v.id("thirdPartyImports"), // Link to tournament
    sessionId: v.string(), // Match session ID
    playerId: v.id("players"), // Player who participated
    discordId: v.string(), // Player's Discord ID (for faster lookups)
    // Team info
    teamId: v.optional(v.string()),
    duoDiscordId: v.optional(v.string()), // Discord ID of duo partner in this match
    // Match stats
    placement: v.number(),
    eliminations: v.number(), // Player's eliminations (finishes only)
    knocks: v.number(), // Player's knocks (DBNOs without finish)
    deaths: v.number(), // Number of times player was eliminated in this match (0 only if placement=1, otherwise ≥1; assumes 1 death if kill feed data missing)
    teamTotalKills: v.number(), // Team's total kills in this match
    deathTime: v.optional(v.number()), // Time of death (seconds since match start), null if survived
    // Duo-specific stats (only if duo was in this match)
    duoDeathTime: v.optional(v.number()), // Time when duo died (null if duo survived)
    killsAfterDuoDeath: v.optional(v.number()), // Kills after duo died
    timeAliveAfterDuoDeath: v.optional(v.number()), // Seconds survived after duo died
  })
    .index("by_import", ["importId"])
    .index("by_player", ["playerId"])
    .index("by_discord", ["discordId"])
    .index("by_match", ["importId", "sessionId"]),
  
  // Cached aggregate statistics
  aggregateStatsCache: defineTable({
    playerCount: v.number(),
    avgTotalEvents: v.number(),
    avgTotalEliminations: v.number(),
    avgAveragePlacement: v.number(),
    avgAverageScore: v.number(),
    avgAverageKD: v.number(),
    avgWinRate: v.number(),
    avgTop3Finishes: v.number(),
    medianTotalEvents: v.number(),
    medianAveragePlacement: v.number(),
    medianAverageScore: v.number(),
    medianAverageKD: v.number(),
    perTierStats: v.object({
      S: v.object({
        playerCount: v.number(),
        avgTotalEvents: v.number(),
        avgTotalEliminations: v.number(),
        avgAveragePlacement: v.number(),
        avgAverageScore: v.number(),
        avgAverageKD: v.number(),
        avgWinRate: v.number(),
        avgTop3Finishes: v.number(),
        medianTotalEvents: v.number(),
        medianAveragePlacement: v.number(),
        medianAverageScore: v.number(),
        medianAverageKD: v.number(),
      }),
      A: v.object({
        playerCount: v.number(),
        avgTotalEvents: v.number(),
        avgTotalEliminations: v.number(),
        avgAveragePlacement: v.number(),
        avgAverageScore: v.number(),
        avgAverageKD: v.number(),
        avgWinRate: v.number(),
        avgTop3Finishes: v.number(),
        medianTotalEvents: v.number(),
        medianAveragePlacement: v.number(),
        medianAverageScore: v.number(),
        medianAverageKD: v.number(),
      }),
      B: v.object({
        playerCount: v.number(),
        avgTotalEvents: v.number(),
        avgTotalEliminations: v.number(),
        avgAveragePlacement: v.number(),
        avgAverageScore: v.number(),
        avgAverageKD: v.number(),
        avgWinRate: v.number(),
        avgTop3Finishes: v.number(),
        medianTotalEvents: v.number(),
        medianAveragePlacement: v.number(),
        medianAverageScore: v.number(),
        medianAverageKD: v.number(),
      }),
      C: v.object({
        playerCount: v.number(),
        avgTotalEvents: v.number(),
        avgTotalEliminations: v.number(),
        avgAveragePlacement: v.number(),
        avgAverageScore: v.number(),
        avgAverageKD: v.number(),
        avgWinRate: v.number(),
        avgTop3Finishes: v.number(),
        medianTotalEvents: v.number(),
        medianAveragePlacement: v.number(),
        medianAverageScore: v.number(),
        medianAverageKD: v.number(),
      }),
      D: v.object({
        playerCount: v.number(),
        avgTotalEvents: v.number(),
        avgTotalEliminations: v.number(),
        avgAveragePlacement: v.number(),
        avgAverageScore: v.number(),
        avgAverageKD: v.number(),
        avgWinRate: v.number(),
        avgTop3Finishes: v.number(),
        medianTotalEvents: v.number(),
        medianAveragePlacement: v.number(),
        medianAverageScore: v.number(),
        medianAverageKD: v.number(),
      }),
    }),
    lastUpdated: v.number(),
  }),

  aggregateStatsJobs: defineTable({
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    totalCount: v.number(),
    processedCount: v.number(),
    nextPlayerIndex: v.number(),
    players: v.array(
      v.object({
        playerId: v.id("players"),
        tier: v.optional(v.string()),
      }),
    ),
    accumulatedStats: v.array(
      v.object({
        tier: v.optional(v.string()),
        totalGames: v.number(),
        totalEliminations: v.number(),
        averagePlacement: v.number(),
        averageScore: v.number(),
        averageKD: v.number(),
        winRate: v.number(),
        top3Finishes: v.number(),
      }),
    ),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    lastProgressAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),

  playerStatsRebuildJobs: defineTable({
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    phase: v.string(),
    playersCursor: v.union(v.string(), v.null()),
    tierEvalBatch: v.number(),
    tierEvalBatchCount: v.number(),
    tierEvalPlayerIds: v.optional(v.array(v.id("players"))),
    tierEvalRecentMediansDone: v.optional(v.boolean()),
    tierEvalClearDone: v.optional(v.boolean()),
    tierEvalMediansDone: v.optional(v.boolean()),
    tierEvalInitialized: v.optional(v.boolean()),
    includeAggregateStats: v.boolean(),
    stopAfterPhase: v.optional(
      v.union(
        v.literal("event_participation"),
        v.literal("dca_mutual"),
        v.literal("top_five"),
        v.literal("tier_eval"),
        v.literal("aggregate_stats"),
      ),
    ),
    tierEvalRecentOnly: v.boolean(),
    rebuildKind: v.optional(
      v.union(
        v.literal("full"),
        v.literal("through_tier_eval"),
        v.literal("event_participation"),
        v.literal("tc_dca"),
        v.literal("top_five"),
        v.literal("tier_eval"),
        v.literal("aggregate_stats"),
      ),
    ),
    applyDuoAdjustment: v.optional(v.boolean()),
    applyTCPenalty: v.optional(v.boolean()),
    applyTCDCAToHolistic: v.optional(v.boolean()),
    processedInPhase: v.number(),
    totalProcessed: v.number(),
    startedAt: v.number(),
    lastProgressAt: v.number(),
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  }).index("by_status", ["status"]),

  // Precomputed public home member directory (one row; avoids N full player reads per visitor).
  publicMemberDirectoryCache: defineTable({
    members: v.array(
      v.object({
        _id: v.id("players"),
        discordUsername: v.string(),
        epicUsername: v.string(),
        nickname: v.optional(v.string()),
        tier: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        totalScore: v.optional(v.number()),
        gender: v.optional(v.number()),
        femaleVerified: v.boolean(),
        isActive: v.boolean(),
      }),
    ),
    lastUpdated: v.number(),
  }),

  // Player snapshot for a single Discord member sync run (reused across batches).
  discordMemberSyncRuns: defineTable({
    syncRunId: v.string(),
    players: v.array(
      v.object({
        _id: v.id("players"),
        discordUserId: v.optional(v.string()),
        discordUsername: v.string(),
        epicUsername: v.string(),
        nickname: v.optional(v.string()),
        alternateDiscordUserIds: v.optional(v.array(v.string())),
        tier: v.optional(v.string()),
        status: v.optional(v.string()),
        currentMembershipStatus: v.optional(v.string()),
        discordRoles: v.optional(
          v.array(
            v.object({
              id: v.string(),
              name: v.string(),
            }),
          ),
        ),
      }),
    ),
    createdAt: v.number(),
  }).index("by_sync_run_id", ["syncRunId"]),

  // Cached audience insights donuts (admin audience-insights page)
  audienceInsightsSnapshot: defineTable({
    insightsCacheVersion: v.optional(v.number()),
    totalMembers: v.number(),
    gender: v.array(
      v.object({
        label: v.string(),
        value: v.number(),
        color: v.string(),
      }),
    ),
    tier: v.array(
      v.object({
        label: v.string(),
        value: v.number(),
        color: v.string(),
      }),
    ),
    tierActive: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.number(),
          color: v.string(),
        }),
      ),
    ),
    totalActiveMembers: v.optional(v.number()),
    tenure: v.array(
      v.object({
        label: v.string(),
        value: v.number(),
        color: v.string(),
      }),
    ),
    events: v.array(
      v.object({
        label: v.string(),
        value: v.number(),
        color: v.string(),
      }),
    ),
    recentEvents: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.number(),
          color: v.string(),
        }),
      ),
    ),
    eventsReady: v.boolean(),
    segmentMembersIndexed: v.optional(v.boolean()),
    lastUpdated: v.number(),
  }),

  audienceInsightsSegmentMembers: defineTable({
    chart: v.union(
      v.literal("gender"),
      v.literal("tier"),
      v.literal("tenure"),
      v.literal("events"),
      v.literal("recentEvents"),
    ),
    segment: v.string(),
    playerId: v.id("players"),
    discordUsername: v.string(),
    epicUsername: v.string(),
    tier: v.optional(v.string()),
    eventsPlayedCount: v.number(),
    genderLabel: v.string(),
    serverJoinDate: v.string(),
    isRecentlyActive: v.optional(v.boolean()),
  })
    .index("by_chart_segment", ["chart", "segment"])
    .index("by_chart_segment_active", ["chart", "segment", "isRecentlyActive"]),

  audienceInsightsJobs: defineTable({
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    totalCount: v.number(),
    processedCount: v.number(),
    playersCursor: v.union(v.string(), v.null()),
    male: v.number(),
    female: v.number(),
    genderUnknown: v.number(),
    tierS: v.number(),
    tierA: v.number(),
    tierB: v.number(),
    tierC: v.number(),
    tierOther: v.number(),
    // Optional for backward compatibility with jobs created before active-tier counters
    totalActiveMembers: v.optional(v.number()),
    tierSActive: v.optional(v.number()),
    tierAActive: v.optional(v.number()),
    tierBActive: v.optional(v.number()),
    tierCActive: v.optional(v.number()),
    tierOtherActive: v.optional(v.number()),
    tenureUnder3m: v.number(),
    tenure3to6m: v.number(),
    tenure6to12m: v.number(),
    tenure1to2y: v.number(),
    tenure2yPlus: v.number(),
    tenureUnknown: v.number(),
    eventsOverFive: v.number(),
    eventsFiveOrLess: v.number(),
    recentEventsOverThree: v.optional(v.number()),
    recentEventsThreeOrLess: v.optional(v.number()),
    startedAt: v.number(),
    lastProgressAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  }).index("by_status", ["status"]),

  // Cached per-import leaderboard analytics (leaderboard-stats admin page)
  leaderboardStatsCache: defineTable({
    stats: v.array(
      v.object({
        importId: v.id("thirdPartyImports"),
        eventName: v.string(),
        eventDate: v.optional(v.string()),
        eventType: v.union(v.string(), v.null()),
        mode: v.union(v.string(), v.null()),
        isNoMoneyEvent: v.boolean(),
        totalTeams: v.number(),
        top3Players: v.number(),
        top4Players: v.number(),
        top5Players: v.number(),
        totalPlayers: v.number(),
        top3Percentage: v.number(),
        top4Percentage: v.number(),
        top5Percentage: v.number(),
        tierSPlayers: v.number(),
        tierAPlayers: v.number(),
        tierBPlayers: v.number(),
        tierCPlayers: v.number(),
      }),
    ),
    lastUpdated: v.number(),
  }),

  // Cached tier re-evaluation data
  tierReEvaluationCache: defineTable({
    playerId: v.id("players"),
    playerName: v.string(),
    discordUsername: v.string(),
    discordUserId: v.optional(v.string()),
    tier: v.string(),
    totalEvents: v.number(),
    killsPerMatch: v.number(),
    deathsPerMatch: v.optional(v.number()), // Optional for backward compatibility with old cache
    tierKillsMedian: v.optional(v.number()),
    killsVsTierDiff: v.optional(v.number()),
    // Holistic evaluation scores
    holisticScore: v.number(),
    avgPlacement: v.number(),
    winRate: v.number(),
    // Component scores
    placementScore: v.number(),
    winRateScore: v.number(),
    killsScore: v.number(),
    deathsScore: v.optional(v.number()), // Optional for backward compatibility with old cache
    // Tier-gap adjustment fields (for carry inflation reduction)
    rawAvgPlacement: v.optional(v.number()), // Raw placement before adjustment
    adjustedAvgPlacement: v.optional(v.number()), // Adjusted placement after tier-gap scaling
    rawPlacementScore: v.optional(v.number()), // Raw placement score before adjustment
    rawHolisticScore: v.optional(v.number()), // Holistic before TC/DCA (after tier-gap placement if any)
    preTierGapHolisticScore: v.optional(v.number()), // Holistic before tier-gap placement adjustment
    avgTeammateTier: v.optional(v.number()), // Average teammate tier (1=C, 2=B, 3=A, 4=S)
    tierGapAdjustment: v.optional(v.number()), // Multiplier applied (1.0, 0.85, 0.70, 0.55)
    // Tier comparisons
    tierAbove: v.optional(v.string()),
    tierAboveAvg: v.optional(v.number()),
    tierAboveHolistic: v.optional(v.number()),
    tierBelow: v.optional(v.string()),
    tierBelowAvg: v.optional(v.number()),
    tierBelowHolistic: v.optional(v.number()),
    sameTierAvg: v.optional(v.number()),
    sameTierHolistic: v.optional(v.number()),
    sameTierDiff: v.optional(v.number()),
    holisticVsSameTier: v.optional(v.number()),
    promotionDiff: v.optional(v.number()),
    demotionDiff: v.optional(v.number()),
    recentTop5Count: v.number(),
    recentTop4Count: v.number(),
    recentTop3Count: v.number(),
    recentTop5WithTeammate: v.number(),
    consistentTeammateName: v.optional(v.string()),
    lastEventDate: v.optional(v.string()),
    evaluationStatus: v.string(),
    // Recent (last 6 weeks) holistic score fields
    recentHolisticScore: v.optional(v.number()),
    recentRawHolisticScore: v.optional(v.number()),
    recentKillsPerMatch: v.optional(v.number()),
    recentDeathsPerMatch: v.optional(v.number()),
    recentAvgPlacement: v.optional(v.number()),
    recentWinRate: v.optional(v.number()),
    recentTotalEvents: v.optional(v.number()),
    recentPlacementScore: v.optional(v.number()),
    recentWinRateScore: v.optional(v.number()),
    recentKillsScore: v.optional(v.number()),
    recentDeathsScore: v.optional(v.number()),
    // Recent (last 6 weeks) tier comparison diffs
    recentHolisticVsSameTier: v.optional(v.number()),
    recentPromotionDiff: v.optional(v.number()),
    recentDemotionDiff: v.optional(v.number()),
    lastUpdated: v.number(),
    // TODO(remove-after-migration): optional until clearDeprecatedTierEvalPrFields finishes on prod
    avgPRPerEvent: v.optional(v.number()),
    finalPowerScore: v.optional(v.number()),
  })
    .index("by_player", ["playerId"])
    .index("by_tier", ["tier"]),
  
  // Tier medians for re-evaluation
  tierMediansCache: defineTable({
    // Per-tier placement score medians (legacy field name: tierAverages)
    tierAverages: v.object({
      S: v.optional(v.number()),
      A: v.optional(v.number()),
      B: v.optional(v.number()),
      C: v.optional(v.number()),
    }),
    // Holistic score medians
    tierHolisticMedians: v.object({
      S: v.optional(v.number()),
      A: v.optional(v.number()),
      B: v.optional(v.number()),
      C: v.optional(v.number()),
    }),
    // Kills per match medians
    tierKillsMedians: v.object({
      S: v.optional(v.number()),
      A: v.optional(v.number()),
      B: v.optional(v.number()),
      C: v.optional(v.number()),
    }),
    // Recent (last 6 weeks) holistic score medians
    recentTierHolisticMedians: v.optional(v.object({
      S: v.optional(v.number()),
      A: v.optional(v.number()),
      B: v.optional(v.number()),
      C: v.optional(v.number()),
    })),
    lastUpdated: v.number(),
    hasTCDCAAdjustments: v.optional(v.boolean()), // Deprecated - kept for backward compatibility with old cache data
    /** Accumulated during tier-eval rebuild; cleared when recent medians are finalized. */
    partialRecentHolisticByTier: v.optional(
      v.object({
        S: v.array(v.number()),
        A: v.array(v.number()),
        B: v.array(v.number()),
        C: v.array(v.number()),
      }),
    ),
    recentMediansCacheCursor: v.optional(v.union(v.string(), v.null())),
  }),

  // Player earnings from scrim events
  playerEarnings: defineTable({
    playerId: v.id("players"),
    eventId: v.id("events"),
    importId: v.optional(v.id("thirdPartyImports")), // Link to specific import
    sessionId: v.optional(v.string()), // Match session ID (for game winners)
    eventName: v.string(),
    eventDate: v.string(),
    earningType: v.union(
      v.literal("placement"), // Top N team placement
      v.literal("gamewinner"), // Won individual match
      // Deprecated literal types (kept for backwards compatibility)
      v.literal("top2teams"),
      v.literal("top3teams"),
      v.literal("top5teams")
    ),
    placement: v.optional(v.number()), // Team placement (for placement earnings)
    topN: v.optional(v.number()), // How many teams earned (e.g., top 3, top 5)
    teammates: v.optional(v.array(v.string())), // Teammate names
  })
    .index("by_player", ["playerId"])
    .index("by_event", ["eventId"])
    .index("by_player_and_event", ["playerId", "eventId"]),

  // Official in-game tournament earnings (from Osirion Fortnite API)
  inGameEarnings: defineTable({
    playerId: v.id("players"),
    epicUsername: v.string(),
    totalEarnings: v.number(), // Lifetime total in USD
    tournaments: v.array(v.object({
      name: v.string(),
      placement: v.number(),
      earnings: v.number(), // USD
      date: v.string(), // ISO date string
    })),
    lastFetchedAt: v.number(), // Timestamp of last API fetch
    hasNewEarnings: v.boolean(), // Flag for admin to see new earnings since last review
    previousTotalEarnings: v.optional(v.number()), // Total before last refresh (for diff)
  })
    .index("by_player", ["playerId"])
    .index("by_has_new", ["hasNewEarnings"])
    .index("by_total_earnings", ["totalEarnings"]),

  // Cached USD-payout tournament leaderboards for Osirion earnings scans
  tournamentScanCache: defineTable({
    leaderboards: v.array(v.object({
      leaderboardEventId: v.string(),
      leaderboardEventWindowId: v.string(),
      tournamentName: v.string(),
      eventDate: v.string(),
      maxPages: v.number(),
      payouts: v.array(v.object({
        rank: v.number(),
        usd: v.number(),
      })),
    })),
    updatedAt: v.number(),
  }),

  // Background job tracker for in-game earnings bulk fetch
  earningsFetchJob: defineTable({
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed")
    ),
    totalPlayers: v.number(),
    processed: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    remainingPlayerIds: v.array(v.string()),
    remainingEpicUsernames: v.array(v.string()),
    // Osirion scan state for the player currently being processed
    currentPlayerId: v.optional(v.string()),
    currentEpicUsername: v.optional(v.string()),
    scanAccountId: v.optional(v.string()),
    scanLeaderboardIndex: v.optional(v.number()),
    partialTournaments: v.optional(v.array(v.object({
      name: v.string(),
      placement: v.number(),
      earnings: v.number(),
      date: v.string(),
    }))),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),

  // 2025 Wrapped content (year-end review page)
  wrappedContent: defineTable({
    year: v.number(), // 2025
    isPublished: v.boolean(), // Whether the wrapped page is live
    introTagline: v.optional(v.string()), // Tagline for intro slide (e.g., "Your year in competitive Fortnite")
    sponsors: v.array(v.object({
      name: v.string(),
      logoUrl: v.optional(v.string()),
    })),
    customMessage: v.optional(v.string()), // Optional message from admin
    sections: v.array(v.object({
      name: v.string(), // Section title (e.g., "Player Stats", "Tier Breakdown")
      tagline: v.optional(v.string()), // Optional tagline/comment for section (e.g., "Celebrating our top competitors")
      stats: v.array(v.object({
        type: v.union(
          // Dynamically generated from wrappedStatsConfig.ts
          ...VALID_STAT_IDS.map(id => v.literal(id))
        ),
        customText: v.string(), // Display text for the stat
        playerCount: v.optional(v.number()), // How many players to show (for player list stats)
        customValue: v.optional(v.string()), // Manual value for custom stats
      })),
    })),
    publishedBy: v.optional(v.id("users")),
    publishedAt: v.optional(v.number()),
    lastEditedBy: v.id("users"),
    /** Precomputed stat sections — populated on publish to avoid live full-table scans. */
    computedSections: v.optional(v.array(v.object({
      name: v.string(),
      tagline: v.optional(v.string()),
      stats: v.array(v.object({
        type: v.string(),
        label: v.string(),
        value: v.optional(v.number()),
        subtitle: v.optional(v.string()),
        players: v.optional(v.array(v.object({
          name: v.string(),
          value: v.number(),
          metric: v.string(),
        }))),
        tierData: v.optional(v.array(v.object({
          tier: v.string(),
          count: v.number(),
          percentage: v.number(),
        }))),
        breakdown: v.optional(v.record(v.string(), v.union(v.number(), v.string()))),
      })),
    }))),
    computedSectionsUpdatedAt: v.optional(v.number()),
  }).index("by_year", ["year"]),

  // Scrim random squad pairing events (created via Discord bot)
  scrimEvents: defineTable({
    eventName: v.string(),
    eventType: v.string(), // "duos_into_squads" | "duos_and_solos"
    games: v.number(), // Number of games to generate pairings for (1-10)
    teams: v.array(v.object({
      teamName: v.string(),
      players: v.array(v.string()),
      // Player tiers for constraint enforcement (e.g. "S", "A", "B")
      playerTiers: v.optional(v.array(v.string())),
      // Fill teams sit on the bench until swapped in for a dropped team
      isFill: v.optional(v.boolean()),
    })),
    // Solo players (mixed in with duos to form squads)
    solos: v.optional(v.array(v.object({
      playerName: v.string(),
    }))),
    // Generated pairings (null until generated)
    pairings: v.optional(v.array(v.object({
      game: v.number(),
      squads: v.array(v.object({
        duo1Index: v.number(), // Index into teams array
        duo2Index: v.number(), // Index into teams array
      })),
      byeTeamIndex: v.optional(v.number()), // Index of unpaired team (odd count)
    }))),
    // Number assignments for "number_only" events (ordered team indices from wheel spin)
    numberAssignments: v.optional(v.array(v.number())),
    // Locked game numbers (preserved during regeneration)
    lockedGames: v.optional(v.array(v.number())),
    // Discord context (optional for shell events created from web)
    discordGuildId: v.optional(v.string()),
    discordChannelId: v.optional(v.string()),
    createdByDiscordId: v.optional(v.string()),
    // Short link code for connecting web-created events to Discord
    linkCode: v.optional(v.string()),
    // Yunite leaderboard link
    leaderboardUrl: v.optional(v.string()),
    // Access control
    adminToken: v.string(), // Secure token for admin URL access

    // URL-friendly slug derived from event name (e.g. "friday-duos-into-squads")
    slug: v.string(),
  }).index("by_admin_token", ["adminToken"])
    .index("by_link_code", ["linkCode"])
    .index("by_slug", ["slug"]),

  // Admin team chat messages
  chatMessages: defineTable({
    userId: v.id("users"),
    userName: v.string(),
    text: v.string(),
  }),

  // Female verifications synced from Mod Log "Girl Role" sheet
  girlRoleVerifications: defineTable({
    discordUserId: v.optional(v.string()),
    discordUsername: v.optional(v.string()),
    verificationMethod: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_discord_user_id", ["discordUserId"])
    .index("by_discord_username", ["discordUsername"]),

  // Metadata for event bans feature (single-document table)
  eventBansMetadata: defineTable({
    lastEventPassedAt: v.string(), // ISO 8601 UTC timestamp of last "Event Passed" usage
    lastEventPassedBy: v.optional(v.string()), // Name of user who last triggered it
  }),

  // Event bans synced from Google Sheet "Event Bans" tab
  eventBans: defineTable({
    discordId: v.string(),
    playerTag: v.string(),
    banType: v.string(), // "Minor Event Ban", "Major Event Ban", "Probation", "Event Ban", etc.
    originalEvents: v.number(), // Number of events originally banned
    remainingEvents: v.number(), // Events remaining (0 if ended)
    startDate: v.string(), // DD/MM/YYYY format from sheet
    lastUpdated: v.string(), // DD/MM/YYYY format from sheet
    reason: v.string(),
    moderatorTag: v.string(),
    messageId: v.string(), // Discord message ID or "PROBATION" - unique identifier per ban
    status: v.string(), // "ACTIVE" or "ENDED"
    offenseTrack: v.optional(v.string()), // "minor", "major", or undefined if not categorized
    offenseNumber: v.optional(v.number()), // Which offense # in the track (1, 2, 3...)
    syncedToDiscord: v.optional(v.boolean()), // Whether the Discord bot has been notified for role sync
    roleRemovedFromDiscord: v.optional(v.boolean()), // Whether the Discord bot has removed the role after ban ended
  })
    .index("by_discord_id", ["discordId"])
    .index("by_status", ["status"])
    .index("by_message_id", ["messageId"])
    .index("by_synced_to_discord", ["syncedToDiscord"])
    .index("by_role_removed", ["roleRemovedFromDiscord"])
    .index("by_synced_and_role_removed", ["syncedToDiscord", "roleRemovedFromDiscord"]),

  // Queued role removals for deleted bans (bot polls and acknowledges these)
  pendingRoleRemovals: defineTable({
    discordId: v.string(),
    banType: v.string(),
  }),

  // Short-lived tokens for password-gated read-only event bans access
  eventBansViewerSessions: defineTable({
    token: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  // ─── Scrim Series Leaderboard ───────────────────────────────────────────────

  // A scrim series (e.g. "Season 1") with configurable settings
  scrimSeries: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    // How many top individual game scores to sum for "Best N"
    bestN: v.number(),
    // Number of games per session, e.g. [6, 6, 5, 6, 6, 6] for S1-S6
    gamesPerSession: v.array(v.number()),
    // Flat penalty amount deducted per penalty
    penaltyAmount: v.number(),
    // Participation threshold percentage (0-100). Player must play >= this % of total games to be "Valid"
    participationThreshold: v.number(),
    // Whether the series is currently active/visible
    isActive: v.boolean(),
  }).index("by_slug", ["slug"]),

  // Players enrolled in a scrim series
  scrimSeriesPlayers: defineTable({
    seriesId: v.id("scrimSeries"),
    playerName: v.string(),
    epicId: v.string(),
    teamId: v.optional(v.string()),
  }).index("by_series", ["seriesId"]),

  // Individual game scores for a player within a series
  scrimSeriesScores: defineTable({
    seriesId: v.id("scrimSeries"),
    playerId: v.id("scrimSeriesPlayers"),
    sessionIndex: v.number(), // 0-based session index (S1 = 0, S2 = 1, ...)
    gameIndex: v.number(), // 0-based game index within the session
    score: v.number(),
  }).index("by_series", ["seriesId"])
    .index("by_player", ["playerId"])
    .index("by_series_and_player", ["seriesId", "playerId"]),

  // Penalties assigned to players in a series
  scrimSeriesPenalties: defineTable({
    seriesId: v.id("scrimSeries"),
    playerId: v.id("scrimSeriesPlayers"),
    reason: v.string(),
    amount: v.number(), // Deduction amount (usually same as series penaltyAmount)
    excluded: v.boolean(), // If true, penalty is excluded from final calculation
    dedupKey: v.optional(v.string()), // Dedup key for Yunite-sourced penalties: {tournamentId}|{session}|{correctionId}|{epicId}
  }).index("by_series", ["seriesId"])
    .index("by_player", ["playerId"])
    .index("by_series_and_player", ["seriesId", "playerId"]),

  // Import log for scrim series Yunite imports (tracks which tournaments/sessions have been imported)
  scrimSeriesImportLog: defineTable({
    seriesId: v.id("scrimSeries"),
    tournamentId: v.string(),
    sessionNumber: v.number(), // 1-based session number
    playersUpdated: v.number(),
    penaltiesLogged: v.number(),
    importedAt: v.string(), // ISO 8601 UTC
  }).index("by_series", ["seriesId"])
    .index("by_series_and_tournament", ["seriesId", "tournamentId"]),
});
