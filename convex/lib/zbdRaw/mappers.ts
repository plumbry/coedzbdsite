import type { Doc, Id } from "../../_generated/dataModel";
import type {
  ZbdRawCompetitionEvent,
  ZbdRawEvaluation,
  ZbdRawEventPenalty,
  ZbdRawEventResultEntry,
  ZbdRawIdentityAlias,
  ZbdRawInGameEarnings,
  ZbdRawManualEventResult,
  ZbdRawMatchParticipation,
  ZbdRawMatchStatOverride,
  ZbdRawMembershipApplication,
  ZbdRawMembershipStatusEvent,
  ZbdRawPlayer,
  ZbdRawPreassignedRoster,
  ZbdRawPrizeEarning,
  ZbdRawReplayMatch,
  ZbdRawReplayPlayerResult,
  ZbdRawResultBatch,
  ZbdRawTierChange,
  ZbdRawTierSnapshot,
} from "./types";
import { normalizeJoinedAt } from "../playerJoinedAt";

export function isoFromMillis(ms: number | undefined | null): string | null {
  if (ms == null || !Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

export function dateOnlyFromIso(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  return iso.slice(0, 10);
}

export function collectDiscordIds(player: Doc<"players">): string[] {
  const ids: string[] = [];
  if (player.discordUserId) {
    ids.push(player.discordUserId);
  }
  for (const alternateId of player.alternateDiscordUserIds ?? []) {
    if (alternateId && !ids.includes(alternateId)) {
      ids.push(alternateId);
    }
  }
  return ids;
}

function inferTeamFormatFromEvent(
  event: Doc<"events">,
): ZbdRawCompetitionEvent["teamFormat"] {
  if (event.smdTeamSize === "duo") {
    return "duos";
  }
  if (event.smdTeamSize === "trio") {
    return "trios";
  }
  switch (event.type) {
    case "random-squads":
      return "squads";
    case "random-trios":
      return "trios";
    case "solos-meets-duos":
      // smdTeamSize already handled above; default stored product meaning is duo groups.
      return "duos";
    default:
      // Do not invent format for event types that do not encode it.
      return null;
  }
}

function mapSourceSystem(
  source: string,
  isManual: boolean | undefined,
): ZbdRawResultBatch["sourceSystem"] {
  if (isManual) {
    return "manual";
  }
  const normalized = source.trim().toLowerCase();
  if (normalized.includes("yunite")) {
    return "yunite";
  }
  if (normalized === "csv") {
    return "csv";
  }
  return "other";
}

function mapSourceMethod(
  importMethod: string | undefined,
): ZbdRawResultBatch["sourceMethod"] {
  if (importMethod === "api" || importMethod === "csv") {
    return importMethod;
  }
  return null;
}

export function mapPlayer(player: Doc<"players">): ZbdRawPlayer {
  return {
    id: player._id,
    discordIds: collectDiscordIds(player),
    discordUsername: player.discordUsername,
    displayName: player.name ?? null,
    nickname: player.nickname ?? null,
    epicUsername: player.epicUsername,
    epicId: player.epicId ?? null,
    previousEpicIds: (player.previousEpicIds ?? []).map((entry) => ({
      epicId: entry.epicId,
      changedAt: entry.changedAt,
    })),
    platform: player.platform ?? null,
    recordStatus: player.status ?? null,
    membershipStatus: player.currentMembershipStatus ?? null,
    officialTier: player.tier ?? null,
    evaluationTotalScore: player.totalScore ?? null,
    joinedAt: normalizeJoinedAt(player.joinedAt),
    serverJoinDate: player.serverJoinDate || null,
    isAlt: player.isAlt === true,
    hasLeftServer: player.hasLeftServer ?? null,
    social: {
      twitterUsername: player.twitterUsername ?? null,
      twitchUsername: player.twitchUsername ?? null,
      youtubeUsername: player.youtubeUsername ?? null,
    },
    archiveReason: player.archiveReason ?? null,
    rejectionReason: player.rejectionReason ?? null,
    recordedAt: isoFromMillis(player._creationTime),
    lastDiscordSyncAt: isoFromMillis(player.lastDiscordSync ?? null),
  };
}

export function mapIdentityAlias(
  alias: Doc<"playerDiscordAliases">,
): ZbdRawIdentityAlias {
  return {
    id: alias._id,
    discordId: alias.discordUserId,
    playerId: alias.playerId,
  };
}

export function mapTierChange(row: Doc<"tierHistory">): ZbdRawTierChange {
  return {
    id: row._id,
    playerId: row.playerId,
    previousTier: row.previousTier ?? null,
    newTier: row.tier,
    totalScore: row.totalScore ?? null,
    // Assumption: no dedicated changedAt column — use document creation time.
    changedAt: isoFromMillis(row._creationTime) ?? new Date(0).toISOString(),
    changedByUserId: row.changedBy ?? null,
  };
}

export function mapEvaluation(score: Doc<"manualScores">): ZbdRawEvaluation {
  return {
    id: score._id,
    playerId: score.playerId,
    applicationId: score.applicationId ?? null,
    categories: {
      thirdPartyExperience: score.thirdPartyExperience ?? null,
      thirdPartyPerformance: score.thirdPartyPerformance ?? null,
      inGameTourneyPerformance: score.inGameTourneyPerformance ?? null,
      officialEarnings: score.officialEarnings ?? null,
      rankedPerformance: score.rankedPerformance ?? null,
      hoursPlayed: score.hoursPlayed ?? null,
      notorietyTeammates: score.notorietyTeammates ?? null,
      age: score.age ?? null,
      gender: score.gender ?? null,
      ability: score.ability ?? null,
      region: score.region ?? null,
      gameSense: score.gameSense ?? null,
      seasonPerformance: score.seasonPerformance ?? null,
      modifiers: score.modifiers ?? null,
      communication: score.communication ?? null,
      teamFit: score.teamFit ?? null,
      maturity: score.maturity ?? null,
      rankExperience: score.rankExperience ?? null,
      fpsHardware: score.fpsHardware ?? null,
    },
    femaleVerified: score.femaleVerified ?? null,
    verificationMethod: score.verificationMethod ?? null,
    totalScore: score.totalScore,
    tier: score.tier,
    evaluatedAt: isoFromMillis(score._creationTime),
    evaluatedByUserId: score.evaluatedBy ?? null,
  };
}

export function mapMembershipApplication(
  app: Doc<"applications">,
): ZbdRawMembershipApplication {
  return {
    id: app._id,
    discordId: app.discordId,
    discordUsername: app.discordUsername,
    fortniteProfileLink: app.fortniteProfileLink,
    status: app.status,
    source: app.source ?? null,
    notes: app.notes ?? null,
    isPreviouslyApplied: app.isPreviouslyApplied,
    isPreviouslyAccepted: app.isPreviouslyAccepted,
    isFormerMember: app.isFormerMember,
    rejectionReason: app.rejectionReason ?? null,
    acceptedAt: isoFromMillis(app.acceptedAt ?? null),
    rejectedAt: isoFromMillis(app.rejectedAt ?? null),
    autoAcceptedByDiscordSync: app.autoAcceptedByDiscordSync ?? null,
    playerId: app.playerId ?? null,
    processedByUserId: app.processedBy ?? null,
    recordedAt: isoFromMillis(app._creationTime),
  };
}

export function mapMembershipStatusEvent(
  event: Doc<"statusEvents">,
): ZbdRawMembershipStatusEvent {
  return {
    id: event._id,
    entityType: event.entityType,
    entityId: event.entityId,
    discordId: event.discordId,
    discordUsername: event.discordUsername,
    previousStatus: event.previousStatus ?? null,
    newStatus: event.newStatus,
    action: event.action,
    reason: event.reason ?? null,
    performedByUserId: event.performedBy ?? null,
    isSystemAction: event.isSystemAction,
    recordedAt: isoFromMillis(event._creationTime),
  };
}

export function mapCompetitionEvent(
  event: Doc<"events">,
): ZbdRawCompetitionEvent {
  return {
    id: event._id,
    name: event.name,
    slug: event.slug ?? null,
    type: event.type,
    mode: event.mode,
    startDate: event.startDate,
    endDate: event.endDate,
    status: event.status,
    season: event.season ?? null,
    seasonId: event.seasonId ?? null,
    description: event.description ?? null,
    teamFormat: inferTeamFormatFromEvent(event),
    isNoMoneyEvent: event.isNoMoneyEvent === true,
    excludeLowestScore: event.excludeLowestScore ?? null,
    bestNGames: event.bestNGames ?? null,
    showdownBestWeeks: event.showdownBestWeeks ?? null,
    penaltyAmount: event.penaltyAmount ?? null,
    smdTeamSize: event.smdTeamSize ?? null,
    twoLobbies: event.twoLobbies ?? null,
    linkedScrimSeriesId: event.linkedScrimSeriesId ?? null,
    discordEventId: event.discordEventId ?? null,
    recordedAt: isoFromMillis(event._creationTime),
  };
}

export function mapResultBatch(
  row: Doc<"thirdPartyImports">,
  linkedEventIsNoMoney: boolean | null,
): ZbdRawResultBatch {
  const occurredAt =
    row.tournamentStartedAt ??
    (row.eventDate ? `${row.eventDate}T00:00:00.000Z` : null);

  return {
    id: row._id,
    competitionEventId: row.eventId ?? null,
    name: row.eventName,
    occurredAt,
    occurredOn: row.eventDate ?? dateOnlyFromIso(occurredAt),
    sourceSystem: mapSourceSystem(row.source, row.isManualImport),
    sourceMethod: mapSourceMethod(row.importMethod),
    externalLeaderboardId: row.leaderboardId,
    externalLeaderboardUrl: row.leaderboardUrl || null,
    organizer: row.organizer ?? null,
    teamFormat: row.seasonalTeamFormat ?? null,
    matchDataPresent: row.matchDataSynced === true,
    finalizedAt: isoFromMillis(row.finalizedAt ?? null),
    isManual: row.isManualImport === true,
    excludeFromCompetitiveAnalytics: linkedEventIsNoMoney,
    recordedAt: isoFromMillis(row._creationTime),
  };
}

export function mapEventResultEntry(
  row: Doc<"thirdPartyResults">,
  competitionEventId: string | null,
): ZbdRawEventResultEntry {
  return {
    id: row._id,
    resultBatchId: row.importId,
    competitionEventId,
    playerId: row.playerId ?? null,
    matched: row.matched,
    manuallyLinked: row.manuallyLinked ?? null,
    identity: {
      epicUsername: row.epicUsername,
      epicId: row.epicId ?? null,
      discordUsername: row.discordUsername ?? null,
      discordId: row.discordId ?? null,
    },
    team: {
      sourceTeamKey: row.teamId ?? null,
      name: row.teamName ?? null,
      memberLabels: row.teamMembers ?? null,
    },
    placement: row.placement,
    points: row.points,
    playerEliminations: row.eliminations ?? null,
    teamKills: row.teamKills ?? null,
    damage: row.damage ?? null,
    deaths: row.deaths ?? null,
    knocks: row.knocks ?? null,
    wins: row.wins ?? null,
    matchesPlayed: row.matchesPlayed ?? null,
    averagePlacement: row.averagePlacement ?? null,
    averageSecondsSurvived: row.averageSecondsSurvived ?? null,
    duoAssignment: row.duoAssignment ?? null,
    grain: "event",
  };
}

export function mapMatchParticipation(
  row: Doc<"matchPlayerStats">,
  competitionEventId: string | null,
): ZbdRawMatchParticipation {
  return {
    id: row._id,
    resultBatchId: row.importId,
    competitionEventId,
    sessionId: row.sessionId,
    playerId: row.playerId,
    discordId: row.discordId,
    team: {
      sourceTeamKey: row.teamId ?? null,
      duoDiscordId: row.duoDiscordId ?? null,
    },
    placement: row.placement,
    playerEliminations: row.eliminations,
    knocks: row.knocks,
    deaths: row.deaths,
    teamKills: row.teamTotalKills,
    score: row.score ?? null,
    teamKillDiscrepancy: row.teamKillDiscrepancy ?? null,
    deathTimeSeconds: row.deathTime ?? null,
    duoDeathTimeSeconds: row.duoDeathTime ?? null,
    killsAfterDuoDeath: row.killsAfterDuoDeath ?? null,
    timeAliveAfterDuoDeathSeconds: row.timeAliveAfterDuoDeath ?? null,
    grain: "match",
  };
}

export function mapMatchStatOverride(
  row: Doc<"matchEliminationOverrides">,
): ZbdRawMatchStatOverride {
  return {
    id: row._id,
    resultBatchId: row.importId,
    sessionId: row.sessionId,
    discordId: row.discordId,
    eliminations: row.eliminations,
    editedByUserId: row.editedBy,
    recordedAt: isoFromMillis(row._creationTime),
  };
}

export function mapManualEventResult(
  row: Doc<"eventResults">,
): ZbdRawManualEventResult {
  return {
    id: row._id,
    playerId: row.playerId,
    competitionEventId: row.eventId ?? null,
    resultBatchId: row.importId ?? null,
    eventName: row.eventName,
    eventDate: row.eventDate,
    placement: row.placement,
    eliminations: row.eliminations,
    kdRatio: row.kdRatio,
    eventScore: row.eventScore,
    yuniteLeaderboardUrl: row.yuniteLeaderboardUrl ?? null,
    recordedAt: isoFromMillis(row._creationTime),
  };
}

export function mapPreassignedRoster(
  row: Doc<"eventDuoPairs">,
): ZbdRawPreassignedRoster {
  const playerIds: string[] = [row.player1Id, row.player2Id];
  if (row.player3Id) {
    playerIds.push(row.player3Id);
  }
  return {
    id: row._id,
    competitionEventId: row.eventId,
    playerIds,
  };
}

export function mapTierSnapshot(
  row: Doc<"showdownTierSnapshots">,
): ZbdRawTierSnapshot {
  return {
    id: row._id,
    competitionEventId: row.eventId,
    playerId: row.playerId,
    tier: row.tier,
    recordedAt: isoFromMillis(row._creationTime),
  };
}

export function mapEventPenalty(
  row: Doc<"eventPenalties">,
): ZbdRawEventPenalty {
  return {
    id: row._id,
    competitionEventId: row.eventId,
    playerId: row.playerId,
    reason: row.reason,
    amount: row.amount,
    excluded: row.excluded,
    dedupKey: row.dedupKey ?? null,
    recordedAt: isoFromMillis(row._creationTime),
  };
}

export function mapPrizeEarning(
  row: Doc<"playerEarnings">,
): ZbdRawPrizeEarning {
  return {
    id: row._id,
    playerId: row.playerId,
    competitionEventId: row.eventId,
    resultBatchId: row.importId ?? null,
    sessionId: row.sessionId ?? null,
    eventName: row.eventName,
    eventDate: row.eventDate,
    earningType: row.earningType,
    placement: row.placement ?? null,
    topN: row.topN ?? null,
    teammateLabels: row.teammates ?? null,
    recordedAt: isoFromMillis(row._creationTime),
  };
}

export function mapInGameEarnings(
  row: Doc<"inGameEarnings">,
): ZbdRawInGameEarnings {
  return {
    id: row._id,
    playerId: row.playerId,
    epicUsername: row.epicUsername,
    totalEarnings: row.totalEarnings,
    tournaments: row.tournaments.map((t) => ({
      name: t.name,
      placement: t.placement,
      earnings: t.earnings,
      date: t.date,
    })),
    lastFetchedAt: isoFromMillis(row.lastFetchedAt),
    previousTotalEarnings: row.previousTotalEarnings ?? null,
  };
}

export function mapReplayMatch(row: Doc<"replays">): ZbdRawReplayMatch {
  return {
    id: row._id,
    competitionEventId: row.eventId ?? null,
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    parseError: row.parseError ?? null,
    matchId: row.matchId ?? null,
    gameMode: row.gameMode ?? null,
    mapName: row.mapName ?? null,
    matchDurationSeconds: row.matchDuration ?? null,
    recordingStartTime: row.recordingStartTime ?? null,
    recordingEndTime: row.recordingEndTime ?? null,
    parsedAt: isoFromMillis(row.parsedAt ?? null),
    recordedAt: isoFromMillis(row._creationTime),
  };
}

export function mapReplayPlayerResult(
  row: Doc<"replayPlayerStats">,
): ZbdRawReplayPlayerResult {
  return {
    id: row._id,
    replayMatchId: row.replayId,
    playerId: row.playerId ?? null,
    epicUsername: row.epicUsername,
    epicId: row.epicId ?? null,
    sourceTeamKey: row.teamId ?? null,
    eliminations: row.eliminations,
    deaths: row.deaths,
    damage: row.damage ?? null,
    assists: row.assists ?? null,
    revives: row.revives ?? null,
    accuracy: row.accuracy ?? null,
    materials: row.materials ?? null,
    matched: row.matched,
  };
}

/** Resolve competitionEventId for an import id using a preloaded map. */
export function competitionEventIdForImport(
  importId: Id<"thirdPartyImports">,
  importToEvent: Map<string, string | null>,
): string | null {
  return importToEvent.get(importId as string) ?? null;
}
