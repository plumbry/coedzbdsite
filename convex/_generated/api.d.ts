/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aggregateStats from "../aggregateStats.js";
import type * as audienceInsights from "../audienceInsights.js";
import type * as audit from "../audit.js";
import type * as auth_discord from "../auth_discord.js";
import type * as auth_helpers from "../auth_helpers.js";
import type * as backfillMatchStats from "../backfillMatchStats.js";
import type * as cacheStatus from "../cacheStatus.js";
import type * as calculateContributionScore from "../calculateContributionScore.js";
import type * as chat from "../chat.js";
import type * as cleanup from "../cleanup.js";
import type * as cleanupDuplicates from "../cleanupDuplicates.js";
import type * as crons from "../crons.js";
import type * as dataBackup from "../dataBackup.js";
import type * as dcaCache from "../dcaCache.js";
import type * as debugCS from "../debugCS.js";
import type * as deleteWeek3 from "../deleteWeek3.js";
import type * as discord from "../discord.js";
import type * as discord_archiveNoTierRole from "../discord/archiveNoTierRole.js";
import type * as discord_eventSync from "../discord/eventSync.js";
import type * as discord_eventSyncMutations from "../discord/eventSyncMutations.js";
import type * as discord_findMatches from "../discord/findMatches.js";
import type * as discord_removeAllTierRoles from "../discord/removeAllTierRoles.js";
import type * as discord_roles from "../discord/roles.js";
import type * as discord_sync from "../discord/sync.js";
import type * as discord_tierMismatches from "../discord/tierMismatches.js";
import type * as eventBans_mutations from "../eventBans/mutations.js";
import type * as eventBans_queries from "../eventBans/queries.js";
import type * as eventBans_sync from "../eventBans/sync.js";
import type * as eventBans_viewerAuth from "../eventBans/viewerAuth.js";
import type * as events from "../events.js";
import type * as events_debugTeamConsolidation from "../events/debugTeamConsolidation.js";
import type * as events_duoPairs from "../events/duoPairs.js";
import type * as events_duoSelection from "../events/duoSelection.js";
import type * as events_icsImport from "../events/icsImport.js";
import type * as events_management from "../events/management.js";
import type * as events_results from "../events/results.js";
import type * as events_showdown from "../events/showdown.js";
import type * as fixImportedDiscordIds from "../fixImportedDiscordIds.js";
import type * as fixImportedWithRoles from "../fixImportedWithRoles.js";
import type * as fixMatchDataSync from "../fixMatchDataSync.js";
import type * as fixMatchPlayerIds from "../fixMatchPlayerIds.js";
import type * as fortnitetracker from "../fortnitetracker.js";
import type * as girlRole_mutations from "../girlRole/mutations.js";
import type * as girlRole_queries from "../girlRole/queries.js";
import type * as girlRole_sync from "../girlRole/sync.js";
import type * as googleSheets from "../googleSheets.js";
import type * as helpers_audit from "../helpers/audit.js";
import type * as helpers_femaleVerification from "../helpers/femaleVerification.js";
import type * as helpers_playerAlt from "../helpers/playerAlt.js";
import type * as helpers_playerEventStats from "../helpers/playerEventStats.js";
import type * as http from "../http.js";
import type * as inGameEarnings_actions from "../inGameEarnings/actions.js";
import type * as inGameEarnings_mutations from "../inGameEarnings/mutations.js";
import type * as inGameEarnings_osirionApi from "../inGameEarnings/osirionApi.js";
import type * as inGameEarnings_queries from "../inGameEarnings/queries.js";
import type * as leaderboardStats from "../leaderboardStats.js";
import type * as lib_playerIdentity from "../lib/playerIdentity.js";
import type * as lib_yunite from "../lib/yunite.js";
import type * as memberManagement from "../memberManagement.js";
import type * as migrateHasMatchData from "../migrateHasMatchData.js";
import type * as migrateMembershipStatus from "../migrateMembershipStatus.js";
import type * as migration from "../migration.js";
import type * as migrationDevTools from "../migrationDevTools.js";
import type * as playerAlts from "../playerAlts.js";
import type * as playerComparison from "../playerComparison.js";
import type * as playerEarnings from "../playerEarnings.js";
import type * as playerStats from "../playerStats.js";
import type * as players from "../players.js";
import type * as players_fixPlaceholderIds from "../players/fixPlaceholderIds.js";
import type * as players_importMatching from "../players/importMatching.js";
import type * as players_status from "../players/status.js";
import type * as rankings from "../rankings.js";
import type * as replays_mutations from "../replays/mutations.js";
import type * as replays_parser from "../replays/parser.js";
import type * as replays_queries from "../replays/queries.js";
import type * as scores from "../scores.js";
import type * as scrimSeries_importFromYunite from "../scrimSeries/importFromYunite.js";
import type * as scrimSeries_mutations from "../scrimSeries/mutations.js";
import type * as scrimSeries_queries from "../scrimSeries/queries.js";
import type * as scrims_mutations from "../scrims/mutations.js";
import type * as scrims_queries from "../scrims/queries.js";
import type * as support from "../support.js";
import type * as sync from "../sync.js";
import type * as thirdParty from "../thirdParty.js";
import type * as thirdPartyMutations from "../thirdPartyMutations.js";
import type * as thirdPartyQueries from "../thirdPartyQueries.js";
import type * as thirdParty_relinkResults from "../thirdParty/relinkResults.js";
import type * as tierHistory from "../tierHistory.js";
import type * as tierReEvaluation from "../tierReEvaluation.js";
import type * as tierReEvaluationBatched from "../tierReEvaluationBatched.js";
import type * as tierSnapshot from "../tierSnapshot.js";
import type * as topFiveCache from "../topFiveCache.js";
import type * as upsetKills from "../upsetKills.js";
import type * as userProvisioning from "../userProvisioning.js";
import type * as users from "../users.js";
import type * as wrapped from "../wrapped.js";
import type * as wrappedStats from "../wrappedStats.js";
import type * as wrappedStatsConfig from "../wrappedStatsConfig.js";
import type * as yunite from "../yunite.js";
import type * as yuniteQueries from "../yuniteQueries.js";
import type * as yunite_backfillJobManager from "../yunite/backfillJobManager.js";
import type * as yunite_backfillKillEvents from "../yunite/backfillKillEvents.js";
import type * as yunite_checkSurvivalTimeData from "../yunite/checkSurvivalTimeData.js";
import type * as yunite_clear from "../yunite/clear.js";
import type * as yunite_clearHelpers from "../yunite/clearHelpers.js";
import type * as yunite_debug from "../yunite/debug.js";
import type * as yunite_eliminationOverrides from "../yunite/eliminationOverrides.js";
import type * as yunite_fixPlacements from "../yunite/fixPlacements.js";
import type * as yunite_fixPlacementsHelpers from "../yunite/fixPlacementsHelpers.js";
import type * as yunite_killCreditHelpers from "../yunite/killCreditHelpers.js";
import type * as yunite_lookupPlatform from "../yunite/lookupPlatform.js";
import type * as yunite_matchData from "../yunite/matchData.js";
import type * as yunite_platformMutations from "../yunite/platformMutations.js";
import type * as yunite_platforms from "../yunite/platforms.js";
import type * as yunite_populateTeamMembers from "../yunite/populateTeamMembers.js";
import type * as yunite_recalculateStats from "../yunite/recalculateStats.js";
import type * as yunite_sync from "../yunite/sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aggregateStats: typeof aggregateStats;
  audienceInsights: typeof audienceInsights;
  audit: typeof audit;
  auth_discord: typeof auth_discord;
  auth_helpers: typeof auth_helpers;
  backfillMatchStats: typeof backfillMatchStats;
  cacheStatus: typeof cacheStatus;
  calculateContributionScore: typeof calculateContributionScore;
  chat: typeof chat;
  cleanup: typeof cleanup;
  cleanupDuplicates: typeof cleanupDuplicates;
  crons: typeof crons;
  dataBackup: typeof dataBackup;
  dcaCache: typeof dcaCache;
  debugCS: typeof debugCS;
  deleteWeek3: typeof deleteWeek3;
  discord: typeof discord;
  "discord/archiveNoTierRole": typeof discord_archiveNoTierRole;
  "discord/eventSync": typeof discord_eventSync;
  "discord/eventSyncMutations": typeof discord_eventSyncMutations;
  "discord/findMatches": typeof discord_findMatches;
  "discord/removeAllTierRoles": typeof discord_removeAllTierRoles;
  "discord/roles": typeof discord_roles;
  "discord/sync": typeof discord_sync;
  "discord/tierMismatches": typeof discord_tierMismatches;
  "eventBans/mutations": typeof eventBans_mutations;
  "eventBans/queries": typeof eventBans_queries;
  "eventBans/sync": typeof eventBans_sync;
  "eventBans/viewerAuth": typeof eventBans_viewerAuth;
  events: typeof events;
  "events/debugTeamConsolidation": typeof events_debugTeamConsolidation;
  "events/duoPairs": typeof events_duoPairs;
  "events/duoSelection": typeof events_duoSelection;
  "events/icsImport": typeof events_icsImport;
  "events/management": typeof events_management;
  "events/results": typeof events_results;
  "events/showdown": typeof events_showdown;
  fixImportedDiscordIds: typeof fixImportedDiscordIds;
  fixImportedWithRoles: typeof fixImportedWithRoles;
  fixMatchDataSync: typeof fixMatchDataSync;
  fixMatchPlayerIds: typeof fixMatchPlayerIds;
  fortnitetracker: typeof fortnitetracker;
  "girlRole/mutations": typeof girlRole_mutations;
  "girlRole/queries": typeof girlRole_queries;
  "girlRole/sync": typeof girlRole_sync;
  googleSheets: typeof googleSheets;
  "helpers/audit": typeof helpers_audit;
  "helpers/femaleVerification": typeof helpers_femaleVerification;
  "helpers/playerAlt": typeof helpers_playerAlt;
  "helpers/playerEventStats": typeof helpers_playerEventStats;
  http: typeof http;
  "inGameEarnings/actions": typeof inGameEarnings_actions;
  "inGameEarnings/mutations": typeof inGameEarnings_mutations;
  "inGameEarnings/osirionApi": typeof inGameEarnings_osirionApi;
  "inGameEarnings/queries": typeof inGameEarnings_queries;
  leaderboardStats: typeof leaderboardStats;
  "lib/playerIdentity": typeof lib_playerIdentity;
  "lib/yunite": typeof lib_yunite;
  memberManagement: typeof memberManagement;
  migrateHasMatchData: typeof migrateHasMatchData;
  migrateMembershipStatus: typeof migrateMembershipStatus;
  migration: typeof migration;
  migrationDevTools: typeof migrationDevTools;
  playerAlts: typeof playerAlts;
  playerComparison: typeof playerComparison;
  playerEarnings: typeof playerEarnings;
  playerStats: typeof playerStats;
  players: typeof players;
  "players/fixPlaceholderIds": typeof players_fixPlaceholderIds;
  "players/importMatching": typeof players_importMatching;
  "players/status": typeof players_status;
  rankings: typeof rankings;
  "replays/mutations": typeof replays_mutations;
  "replays/parser": typeof replays_parser;
  "replays/queries": typeof replays_queries;
  scores: typeof scores;
  "scrimSeries/importFromYunite": typeof scrimSeries_importFromYunite;
  "scrimSeries/mutations": typeof scrimSeries_mutations;
  "scrimSeries/queries": typeof scrimSeries_queries;
  "scrims/mutations": typeof scrims_mutations;
  "scrims/queries": typeof scrims_queries;
  support: typeof support;
  sync: typeof sync;
  thirdParty: typeof thirdParty;
  thirdPartyMutations: typeof thirdPartyMutations;
  thirdPartyQueries: typeof thirdPartyQueries;
  "thirdParty/relinkResults": typeof thirdParty_relinkResults;
  tierHistory: typeof tierHistory;
  tierReEvaluation: typeof tierReEvaluation;
  tierReEvaluationBatched: typeof tierReEvaluationBatched;
  tierSnapshot: typeof tierSnapshot;
  topFiveCache: typeof topFiveCache;
  upsetKills: typeof upsetKills;
  userProvisioning: typeof userProvisioning;
  users: typeof users;
  wrapped: typeof wrapped;
  wrappedStats: typeof wrappedStats;
  wrappedStatsConfig: typeof wrappedStatsConfig;
  yunite: typeof yunite;
  yuniteQueries: typeof yuniteQueries;
  "yunite/backfillJobManager": typeof yunite_backfillJobManager;
  "yunite/backfillKillEvents": typeof yunite_backfillKillEvents;
  "yunite/checkSurvivalTimeData": typeof yunite_checkSurvivalTimeData;
  "yunite/clear": typeof yunite_clear;
  "yunite/clearHelpers": typeof yunite_clearHelpers;
  "yunite/debug": typeof yunite_debug;
  "yunite/eliminationOverrides": typeof yunite_eliminationOverrides;
  "yunite/fixPlacements": typeof yunite_fixPlacements;
  "yunite/fixPlacementsHelpers": typeof yunite_fixPlacementsHelpers;
  "yunite/killCreditHelpers": typeof yunite_killCreditHelpers;
  "yunite/lookupPlatform": typeof yunite_lookupPlatform;
  "yunite/matchData": typeof yunite_matchData;
  "yunite/platformMutations": typeof yunite_platformMutations;
  "yunite/platforms": typeof yunite_platforms;
  "yunite/populateTeamMembers": typeof yunite_populateTeamMembers;
  "yunite/recalculateStats": typeof yunite_recalculateStats;
  "yunite/sync": typeof yunite_sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
