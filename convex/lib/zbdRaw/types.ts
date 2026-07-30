/**
 * zbd.raw.v1 — public raw-facts contract types.
 * Transport-agnostic. No derived analytics fields.
 */

export const ZBD_RAW_CONTRACT = "zbd.raw" as const;
export const ZBD_RAW_SCHEMA_VERSION = "1" as const;

export const ZBD_RAW_COLLECTIONS = [
  "players",
  "identityAliases",
  "tierChanges",
  "evaluations",
  "membershipApplications",
  "membershipStatusEvents",
  "competitionEvents",
  "resultBatches",
  "eventResultEntries",
  "matchParticipations",
  "matchStatOverrides",
  "manualEventResults",
  "preassignedRosters",
  "tierSnapshots",
  "eventPenalties",
  "prizeEarnings",
  "inGameEarnings",
  "replayMatches",
  "replayPlayerResults",
] as const;

export type ZbdRawCollectionName = (typeof ZBD_RAW_COLLECTIONS)[number];

export type ZbdRawPlayer = {
  id: string;
  discordIds: string[];
  discordUsername: string;
  displayName: string | null;
  nickname: string | null;
  epicUsername: string;
  epicId: string | null;
  previousEpicIds: Array<{ epicId: string; changedAt: string }>;
  platform: "PC" | "PS4" | "XB1" | "SWITCH" | "MOBILE" | null;
  recordStatus: "active" | "archived" | "rejected" | "discord_member" | null;
  membershipStatus: "accepted" | "rejected" | "former" | null;
  officialTier: string | null;
  evaluationTotalScore: number | null;
  /**
   * Canonical Discord/community join timestamp.
   * Source: players.joinedAt from Discord Guild Member joined_at.
   */
  joinedAt: string | null;
  serverJoinDate: string | null;
  isAlt: boolean;
  hasLeftServer: boolean | null;
  social: {
    twitterUsername: string | null;
    twitchUsername: string | null;
    youtubeUsername: string | null;
  };
  archiveReason: string | null;
  rejectionReason: string | null;
  recordedAt: string | null;
  lastDiscordSyncAt: string | null;
};

export type ZbdRawIdentityAlias = {
  id: string;
  discordId: string;
  playerId: string;
};

export type ZbdRawTierChange = {
  id: string;
  playerId: string;
  previousTier: string | null;
  newTier: string;
  totalScore: number | null;
  changedAt: string;
  changedByUserId: string | null;
};

export type ZbdRawEvaluation = {
  id: string;
  playerId: string;
  applicationId: string | null;
  categories: {
    thirdPartyExperience: number | null;
    thirdPartyPerformance: number | null;
    inGameTourneyPerformance: number | null;
    officialEarnings: number | null;
    rankedPerformance: number | null;
    hoursPlayed: number | null;
    notorietyTeammates: number | null;
    age: number | null;
    gender: number | null;
    ability: number | null;
    region: number | null;
    gameSense: number | null;
    seasonPerformance: number | null;
    modifiers: number | null;
    /** Legacy category fields retained as raw stored facts. */
    communication: number | null;
    teamFit: number | null;
    maturity: number | null;
    rankExperience: number | null;
    fpsHardware: number | null;
  };
  femaleVerified: boolean | null;
  verificationMethod: "ID" | "FACECAM" | "TRUSTED SERVER" | null;
  totalScore: number;
  tier: string;
  evaluatedAt: string | null;
  evaluatedByUserId: string | null;
};

export type ZbdRawMembershipApplication = {
  id: string;
  discordId: string;
  discordUsername: string;
  fortniteProfileLink: string;
  status: "pending" | "accepted" | "rejected";
  source: "TikTok" | "Twitter" | "Teammate" | "Other" | null;
  notes: string | null;
  isPreviouslyApplied: boolean;
  isPreviouslyAccepted: boolean;
  isFormerMember: boolean;
  rejectionReason: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  autoAcceptedByDiscordSync: boolean | null;
  playerId: string | null;
  processedByUserId: string | null;
  recordedAt: string | null;
};

export type ZbdRawMembershipStatusEvent = {
  id: string;
  entityType: "application" | "member";
  entityId: string;
  discordId: string;
  discordUsername: string;
  previousStatus: string | null;
  newStatus: string;
  action: string;
  reason: string | null;
  performedByUserId: string | null;
  isSystemAction: boolean;
  recordedAt: string | null;
};

export type ZbdRawCompetitionEvent = {
  id: string;
  name: string;
  slug: string | null;
  type: string;
  mode: "ZB Main Map" | "Reload";
  startDate: string;
  endDate: string;
  status: "upcoming" | "ongoing" | "completed";
  season: string | null;
  seasonId: string | null;
  description: string | null;
  teamFormat: "solos" | "duos" | "trios" | "squads" | null;
  isNoMoneyEvent: boolean;
  excludeLowestScore: boolean | null;
  bestNGames: number | null;
  showdownBestWeeks: number | null;
  penaltyAmount: number | null;
  smdTeamSize: "duo" | "trio" | null;
  twoLobbies: boolean | null;
  linkedScrimSeriesId: string | null;
  discordEventId: string | null;
  recordedAt: string | null;
};

export type ZbdRawResultBatch = {
  id: string;
  competitionEventId: string | null;
  name: string;
  occurredAt: string | null;
  occurredOn: string | null;
  sourceSystem: "yunite" | "csv" | "manual" | "other";
  sourceMethod: "api" | "csv" | null;
  externalLeaderboardId: string;
  externalLeaderboardUrl: string | null;
  organizer: string | null;
  teamFormat: "duos" | "trios" | "squads" | null;
  matchDataPresent: boolean;
  finalizedAt: string | null;
  isManual: boolean;
  excludeFromCompetitiveAnalytics: boolean | null;
  recordedAt: string | null;
};

export type ZbdRawEventResultEntry = {
  id: string;
  resultBatchId: string;
  competitionEventId: string | null;
  playerId: string | null;
  matched: boolean;
  manuallyLinked: boolean | null;
  identity: {
    epicUsername: string;
    epicId: string | null;
    discordUsername: string | null;
    discordId: string | null;
  };
  team: {
    sourceTeamKey: string | null;
    name: string | null;
    memberLabels: string[] | null;
  };
  placement: number;
  points: number;
  playerEliminations: number | null;
  teamKills: number | null;
  damage: number | null;
  deaths: number | null;
  knocks: number | null;
  wins: number | null;
  matchesPlayed: number | null;
  averagePlacement: number | null;
  averageSecondsSurvived: number | null;
  duoAssignment: "duo1" | "duo2" | null;
  grain: "event";
};

export type ZbdRawMatchParticipation = {
  id: string;
  resultBatchId: string;
  competitionEventId: string | null;
  sessionId: string;
  playerId: string;
  discordId: string;
  team: {
    sourceTeamKey: string | null;
    duoDiscordId: string | null;
  };
  placement: number;
  playerEliminations: number;
  knocks: number;
  deaths: number;
  teamKills: number;
  score: number | null;
  teamKillDiscrepancy: number | null;
  deathTimeSeconds: number | null;
  duoDeathTimeSeconds: number | null;
  killsAfterDuoDeath: number | null;
  timeAliveAfterDuoDeathSeconds: number | null;
  grain: "match";
};

export type ZbdRawMatchStatOverride = {
  id: string;
  resultBatchId: string;
  sessionId: string;
  discordId: string;
  eliminations: number;
  editedByUserId: string;
  recordedAt: string | null;
};

export type ZbdRawManualEventResult = {
  id: string;
  playerId: string;
  competitionEventId: string | null;
  resultBatchId: string | null;
  eventName: string;
  eventDate: string;
  placement: number;
  eliminations: number;
  kdRatio: number;
  eventScore: number;
  yuniteLeaderboardUrl: string | null;
  recordedAt: string | null;
};

export type ZbdRawPreassignedRoster = {
  id: string;
  competitionEventId: string;
  playerIds: string[];
};

export type ZbdRawTierSnapshot = {
  id: string;
  competitionEventId: string;
  playerId: string;
  tier: string;
  recordedAt: string | null;
};

export type ZbdRawEventPenalty = {
  id: string;
  competitionEventId: string;
  playerId: string;
  reason: string;
  amount: number;
  excluded: boolean;
  dedupKey: string | null;
  recordedAt: string | null;
};

export type ZbdRawPrizeEarning = {
  id: string;
  playerId: string;
  competitionEventId: string;
  resultBatchId: string | null;
  sessionId: string | null;
  eventName: string;
  eventDate: string;
  earningType: string;
  placement: number | null;
  topN: number | null;
  teammateLabels: string[] | null;
  recordedAt: string | null;
};

export type ZbdRawInGameEarnings = {
  id: string;
  playerId: string;
  epicUsername: string;
  totalEarnings: number;
  tournaments: Array<{
    name: string;
    placement: number;
    earnings: number;
    date: string;
  }>;
  lastFetchedAt: string | null;
  previousTotalEarnings: number | null;
};

export type ZbdRawReplayMatch = {
  id: string;
  competitionEventId: string | null;
  fileName: string;
  parseStatus: string;
  parseError: string | null;
  matchId: string | null;
  gameMode: string | null;
  mapName: string | null;
  matchDurationSeconds: number | null;
  recordingStartTime: string | null;
  recordingEndTime: string | null;
  parsedAt: string | null;
  recordedAt: string | null;
};

export type ZbdRawReplayPlayerResult = {
  id: string;
  replayMatchId: string;
  playerId: string | null;
  epicUsername: string;
  epicId: string | null;
  sourceTeamKey: string | null;
  eliminations: number;
  deaths: number;
  damage: number | null;
  assists: number | null;
  revives: number | null;
  accuracy: number | null;
  materials: number | null;
  matched: boolean;
};

export type ZbdRawDocument = {
  contract: typeof ZBD_RAW_CONTRACT;
  schemaVersion: typeof ZBD_RAW_SCHEMA_VERSION;
  generatedAt: string;
  generator: { system: string; systemVersion: string };
  contentHash: string;
  scope: { full: boolean };
  counts: Record<ZbdRawCollectionName, number>;
  players: ZbdRawPlayer[];
  identityAliases: ZbdRawIdentityAlias[];
  tierChanges: ZbdRawTierChange[];
  evaluations: ZbdRawEvaluation[];
  membershipApplications: ZbdRawMembershipApplication[];
  membershipStatusEvents: ZbdRawMembershipStatusEvent[];
  competitionEvents: ZbdRawCompetitionEvent[];
  resultBatches: ZbdRawResultBatch[];
  eventResultEntries: ZbdRawEventResultEntry[];
  matchParticipations: ZbdRawMatchParticipation[];
  matchStatOverrides: ZbdRawMatchStatOverride[];
  manualEventResults: ZbdRawManualEventResult[];
  preassignedRosters: ZbdRawPreassignedRoster[];
  tierSnapshots: ZbdRawTierSnapshot[];
  eventPenalties: ZbdRawEventPenalty[];
  prizeEarnings: ZbdRawPrizeEarning[];
  inGameEarnings: ZbdRawInGameEarnings[];
  replayMatches: ZbdRawReplayMatch[];
  replayPlayerResults: ZbdRawReplayPlayerResult[];
  extensions: Record<string, never>;
};

export type ZbdRawCollectionStatus = "complete" | "partial" | "blocked";

export type ZbdRawValidationCollection = {
  collection: ZbdRawCollectionName;
  status: ZbdRawCollectionStatus;
  sourceTable: string;
  recordCount: number;
  notes: string;
};

export type ZbdRawValidationReport = {
  contract: typeof ZBD_RAW_CONTRACT;
  schemaVersion: typeof ZBD_RAW_SCHEMA_VERSION;
  generatedAt: string;
  collections: ZbdRawValidationCollection[];
  assumptions: string[];
  dataQualityIssues: string[];
  summary: {
    complete: number;
    partial: number;
    blocked: number;
  };
};
