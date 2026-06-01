# Process and Operations Audit

**Audit date:** 2026-06-01  
**Scope:** Event operations, Yunite/import pipelines, Discord/bot workflows, admin processes, source-of-truth boundaries, automation, visibility, and efficiency.  
**Status:** Read-only audit. No code, data, or feature behavior changed.

---

## Executive Summary

The platform has strong domain coverage, but many operational workflows are assembled from separate tools rather than one guided process. The biggest process costs are:

| Area | Main issue | Operational impact |
|---|---|---|
| Events | Event schedule, imported results, Spin/scrim events, Scrim Series, and Discord scheduled events are separate data models/workflows | Staff repeat event metadata, manually link imports, and must remember which event tool applies |
| Yunite/imports | Multiple import paths write related data with different idempotency and status handling | Duplicate prevention is partial; match data sync status is per import but errors are mostly transient console/toast output |
| Discord/bot | Mix of daily polling, bot webhooks, and HTTP polling queues | Discord, Convex, and website actions can each update member/tier/ban state |
| Admin workflows | Frequent tasks require multiple pages, modals, and manual cross-checks | More room for missed imports, invalid signups, stale tiers, and duplicate player records |
| Source of truth | Same concepts exist as canonical fields, denormalized fields, external sheets, bot state, and derived caches | Hard to know what to edit and what should be regenerated |

The recommended direction is to move from "many admin tools" to "one operational queue":

1. Create or sync an event shell.
2. Attach one or more source artifacts: Discord scheduled event, Yunite leaderboard IDs, CSV, replay, Spin link, Scrim Series session.
3. Run validation/import/sync jobs with idempotency keys.
4. Show status, failures, unmatched players, duplicate risks, and next actions in one admin operations dashboard.
5. Derive public displays, rankings, earnings, tiers, and Discord role tasks from that source state.

---

## Event Creation and Management

### Current flow map

| Flow | Current path | Manual steps | Notes |
|---|---|---:|---|
| Create calendar event | `/admin/events-manager` -> create dialog -> fill name/type/mode/dates/leaderboards/earnings/image | 10-20 | Implemented by `src/pages/admin/_components/event-manager.tsx` and `convex/events/management.ts` |
| Edit calendar event | Events Manager -> edit icon -> same large dialog | 5-20 | Editing a Discord-imported event clears `needsSetup` |
| Import Discord scheduled events | Daily cron or manual button -> `convex/discord/eventSync.ts` -> `processDiscordEventSync` | 1 manual if button; 0 cron | Creates default `scrim`/`ZB Main Map` events with `needsSetup`; skips same-day existing events |
| Import ICS | Events Manager -> ICS import -> default type/mode -> create events | 4-6 | `convex/events/icsImport.ts` parses simple ICS with regex and calls createEvent per item |
| Display public events | `/events`, `/events/:id` | 0 | Public reads use event dates to compute status |
| Import event results | `/admin/uploads`, `/admin/yunite-tournament`, `/admin/event-results` | 4-10 | Results live in `thirdPartyImports` and `thirdPartyResults`; older/manual event results live in `eventResults` |
| Manage duo/random event groups | `/admin/events-manager` lower sections | 4-8 | Separate `eventDuoPairs` tools for random/solos-meets-duos |
| Spin events | Discord bot HTTP endpoint or web shell event | 3-8 | Separate `scrimEvents` table and `/spin` UI, despite legacy "scrim" naming |
| Scrim Series sessions | `/admin/scrim-series` -> import Yunite scores per session | 4-8 per session | Separate `scrimSeries*` tables and Yunite import action |
| Archive/delete event | Events Manager delete | 2 | Calendar events are deleted, not archived; historical imports/results may remain linked or unlinked |

### Findings

1. **Event data is split across several concepts.**  
   Files/functions: `convex/schema.ts` (`events`, `eventResults`, `thirdPartyImports`, `thirdPartyResults`, `scrimEvents`, `scrimSeries`), `convex/events/management.ts`, `convex/scrims/mutations.ts`, `convex/scrimSeries/importFromYunite.ts`.  
   The platform has calendar events, imported event results, Spin events, and Scrim Series sessions. These are valid product concepts, but they do not share an operational parent record.

2. **Event creation is form-heavy and template-poor.**  
   Files/functions: `src/pages/admin/_components/event-manager.tsx`, `convex/events/management.createEvent`.  
   Staff repeatedly enter type, mode, dates, earnings settings, leaderboard slots, two-lobby settings, mini-season leaderboard groups, best-N fields, and images. Defaults are hardcoded in UI and mutations, not stored as reusable event templates.

3. **Discord event import creates useful shells but leaves setup manual.**  
   Files/functions: `convex/discord/eventSync.ts`, `convex/discord/eventSyncMutations.ts`.  
   Imported scheduled events default to `type: "scrim"` and `mode: "ZB Main Map"` with `needsSetup: true`. This is good, but there is no setup checklist tied to missing leaderboards, earnings, image, or expected product link.

4. **Idempotency exists in some places but not consistently by workflow.**  
   Files/functions: `events.discordEventId`, `thirdPartyImports.leaderboardId`, `scrimSeriesPenalties.dedupKey`, `scrimEvents.slug/linkCode`.  
   Discord scheduled events use `discordEventId`; Yunite imports check `leaderboardId`; Scrim Series penalties dedupe corrections. CSV imports generate random IDs and can intentionally duplicate event data unless replaced manually.

5. **Archiving is incomplete for events.**  
   Files/functions: `convex/events/management.deleteEvent`.  
   Events have computed status but no explicit `archived` or hidden state. Admins can delete an event, while results/imports may remain in separate tables.

6. **There is no signup/registration model visible in code.**  
   Search did not reveal event signup tables or signup mutations. If signups are handled in Discord/Yunite outside this repo, the website cannot validate eligibility, duplicate signups, bans, or tiers before event start.

### Cleaner Event Management Workflow

Recommended future flow:

1. **Event Shell:** Create/sync a single `events` record first, from template, Discord scheduled event, ICS, or manual form.
2. **Event Template:** Template pre-fills type, mode, expected team size, lobby count, leaderboard structure, earnings rules, best-N, image, and required setup checklist.
3. **Source Attachments:** Attach Discord scheduled event ID, Yunite leaderboard IDs, Spin event ID, Scrim Series session mapping, CSV import, or replay files to the event.
4. **Validation:** Run checks: missing leaderboard links, duplicate tournament IDs, banned players, invalid tiers, unmatched Discord/Epic IDs, no money flag, missing earnings config.
5. **Import/Sync Jobs:** Run imports through a job table with status, retries, and errors.
6. **Archive:** Mark event `archived`/`hidden` instead of deleting; keep imports/results linked.

---

## Yunite Data and External Data Imports

### Current data sources

| Source | Entry point | Destination | Manual or automated | Frequency/status |
|---|---|---|---|---|
| Yunite tournament list and leaderboards | `convex/yunite/sync.ts:syncYuniteTournaments` | `thirdPartyImports`, `thirdPartyResults`, player `epicId` | Manual admin action | No cron found for Yunite tournament sync |
| Yunite match data | `convex/yunite/sync.ts:syncTournamentMatchData` | `thirdPartyResults`, `matchPlayerStats`, `matchKillEvents`, import sync fields | Manual per import/player/backfill | Status stored on import as `matchDataSynced`, partial errors returned |
| Yunite recent list preview | `listRecentTournaments` | No writes | Manual | Checks existing imports one tournament at a time |
| CSV import | `thirdPartyMutations.importFromCSV`, `replaceCSVData` | `thirdPartyImports`, `thirdPartyResults` | Manual | Random `leaderboardId`; replacement is explicit |
| Scrim Series Yunite scores | `scrimSeries/importFromYunite.ts` | `scrimSeriesPlayers`, `scrimSeriesScores`, `scrimSeriesPenalties`, `scrimSeriesImportLog` | Manual per session | Penalty dedup exists; import log is informational |
| Google Sheets applications/exports | `convex/googleSheets.ts` | Players/applications/sheets | Manual | Multiple export/import actions |
| Google Sheets event bans | `convex/eventBans/sync.ts` | `eventBans`, sheet status updates | Daily cron plus manual | External sheet remains major source |
| Osirion earnings | `convex/inGameEarnings/*` | `inGameEarnings`, job/cache tables | Manual/job plus daily cache | Has better job state than Yunite |

### Findings

1. **Yunite tournament imports are partially idempotent.**  
   `syncYuniteTournaments` checks `thirdParty.checkExistingImport` by `leaderboardId = yunite-{tournamentId}` and skips existing imports. This prevents duplicate API imports for the same tournament ID.

2. **CSV imports are not naturally idempotent.**  
   `importFromCSV` creates `leaderboardId = csv_{Date.now()}_{random}`. This is useful for repeated manual imports, but it cannot detect accidental duplicate CSV imports unless staff use `replaceCSVData` on an existing import.

3. **Yunite match data resync can duplicate or overwrite some derived data.**  
   `syncTournamentMatchData` marks `matchDataSynced` and deletes/reinserts kill events for the import, but match player stats storage needs a unique per-import/session/player behavior to be considered fully idempotent. The audit infers this risk from repeated `storeMatchPlayerStats` calls and recommends verifying those mutations before enabling automated retries.

4. **Errors are visible only at the action boundary.**  
   `syncStatus` tracks overall `"yunite"` and `"discord"` sync states, but Yunite per-tournament and per-match failures are mostly console logs or returned arrays. There is no durable `importJobs`/`importErrors` table for admins to inspect later.

5. **Import linking is helpful but scattered.**  
   Events auto-link matching leaderboard URLs on create/update; imports auto-link by scanning event leaderboard URLs; manual link can append a leaderboard URL to an event. This is useful, but duplicated helper logic appears in `events/management.ts` and `thirdPartyMutations.ts`.

6. **Yunite API rate limiting is handled inconsistently.**  
   Tournament sync waits 600ms between leaderboard requests and stops on 429. Match breakdown has retry/backoff. Match sync uses delays in some loops. A central rate-limit helper would make behavior safer.

### Cleaner Yunite Pipeline

Recommended pipeline:

1. `eventSource` records: `{ eventId, source: "yunite", tournamentId, url, lobby, session, status }`.
2. Durable import job: one row per source with `queued/running/succeeded/failed/needs_review`, retry count, last error, fetched counts, matched/unmatched counts, and timestamps.
3. Idempotency keys:
   - Tournament import: `yunite:{guildId}:{tournamentId}:leaderboard`.
   - Match stats: `yunite:{tournamentId}:{sessionId}:{playerDiscordId}`.
   - Kill event: `yunite:{tournamentId}:{sessionId}:{killer}:{victim}:{time}:{eventType}` or stored through a replace-by-import batch.
   - CSV import: explicit checksum/file hash plus event/source label, with "replace existing" as the default safe path.
4. Unified import UI:
   - Shows source status, duplicate warnings, unmatched players, match sync status, kill event status, and last error.
   - Offers "Retry failed", "Replace data", "Rematch players", and "Link to event" from one place.
5. Post-import automation:
   - Refresh player event participation cache.
   - Recalculate earnings if event has earnings rules.
   - Queue contribution score/top-five/DCA recalculations only for affected players.
   - Queue Discord/admin notifications for failures or review needs.

---

## Discord and Bot Processes

### Current bot-to-site workflows

| Workflow | Current mechanism | Source of truth today | Risks |
|---|---|---|---|
| Discord scheduled events -> calendar | Daily cron/manual action fetches Discord API | Discord for scheduled event, Convex for calendar after import | Same-day duplicate skip may hide legitimate multiple events; imported defaults require setup |
| Discord members -> players | Daily cron fetches all guild members in batches; bot webhook can sync one member | Discord for membership; Convex `players` for website | Daily polling can lag; matching creates/updates players and can reactivate members |
| Bot member lookup | HTTP GET `/api/member?discordId=` | Convex player/manual score | Alternate Discord IDs require table scan |
| Bot creates Spin event | HTTP POST `/api/scrim-events` | Convex `scrimEvents` | Separate from calendar `events`; token access is separate from user auth |
| Web creates Spin shell then bot links teams | Web mutation creates shell link code; bot POST links teams | Convex `scrimEvents` | Good bridge, but no calendar event relationship |
| Event ban role sync | Bot polls pending role sync/removal HTTP endpoints and acknowledges | Convex `eventBans` and `pendingRoleRemovals`, external Google Sheet also involved | Polling and ack failures can leave stale roles |
| Tier roles | Bot can query players for role sync; webhook sync can update website tier from Discord role | Ambiguous: manual scores vs Discord role | Website and Discord can both change tier |

### Polling that could become event-driven

- Discord scheduled events daily sync could be replaced or supplemented by bot webhooks when scheduled events are created/updated/canceled.
- Discord member daily full sync could be supplemented by guild member add/update/remove events, keeping daily sync as reconciliation.
- Event ban role sync polling could become a push queue/webhook to the bot, with polling retained as fallback.

### Duplicated website/bot actions

- Creating Spin events can happen from bot or website shell.
- Member status can be changed by daily Discord sync, individual bot webhook, and admin member management.
- Tier can be changed by manual scoring and by Discord tier role sync.
- Event bans can be updated in Google Sheets, Convex admin UI, and Discord role state via bot.

### Recommended source of truth

| Workflow | Recommended source of truth | Derived/synced systems |
|---|---|---|
| Discord membership presence | Discord | Convex caches membership, roles, nicknames, left-server state |
| Website player profile, tier, score | Convex | Discord roles receive tier updates; Google Sheets exports are derived |
| Event bans/offenses | Convex eventually; Google Sheet during migration | Discord roles and sheet rows sync from Convex |
| Scheduled event shell | Convex `events` once imported/synced | Discord scheduled events may seed/update schedule fields only |
| Spin pairings | Convex `scrimEvents` until unified with `events` | Bot posts teams/results/status |
| Scrim Series leaderboard | Convex `scrimSeries*` | Public pages derive standings; Yunite source data remains external |

---

## Admin Workflow Audit

Manual step counts are approximate happy-path counts from the current UI/code.

| Process | Current flow | Manual steps | Duplicated effort | Failure points | Cleaner future flow |
|---|---|---:|---|---|---|
| Creating events | Events Manager -> create dialog -> fill fields -> optional import later | 10-20 | Type/mode/leaderboards/earnings repeated across events | Missing leaderboard, wrong type, no setup checklist, accidental delete | Template-first event shell with required checklist and source attachments |
| Managing signups | No signup model found in repo; likely Discord/Yunite/manual | Unknown | Staff likely verify tiers/bans externally | Invalid tiers/banned users may be caught late | Add eventSignup table or external signup import with validation queue |
| Pulling results | Uploads/Yunite import -> Event Results -> detail/unmatched -> optional match sync | 5-12 | Event name/date/link repeated between event/import/results | Duplicate CSV imports, unmatched players, no durable import error log | Event source job runs import, match sync, rematch, and result validation from event page |
| Updating scores | Player/member/app dialog -> many score fields -> score mutation | 5-18 | Scoring UI duplicated in member/app flows; tier stored on score and player | Manual category entry, tier formula drift risk | Shared evaluation component, presets, validation, score history, Discord role update queue |
| Managing tiers | Manual score updates, tier re-evaluation tools, Discord role mismatch pages | 5-15 | Tier exists in player, score, history, Discord role | Ambiguous source of truth, stale Discord roles | Convex score/tier is source; Discord roles are generated sync tasks |
| Handling bans/removals | Event Bans UI/Google Sheet sync/Event Passed/bot role polling | 4-10 | Ban data exists in sheet and Convex; role state in Discord | Sheet row matching, failed bot ack, stale role removals | Convex offense ledger with sheet import/export compatibility and role sync job status |
| Managing support tickets | Public form -> admin support panel -> archive/delete | 2-4 | No player/profile link or response workflow | No public status or response record | Ticket has status, assignee, linked player, response/outcome, notification |
| Processing applications | New Application -> create pending app -> create player -> score -> accept/reject | 8-20 | Application info and player info repeated; temporary player starts rejected | Empty Discord ID, duplicate username, score before acceptance creates player | Application intake creates candidate; acceptance promotes/links player after identity validation |
| Updating player records | Member Management/Profile/Discord pages edit overlapping fields | 3-8 | Multiple edit dialogs and Discord matching tools | Duplicate Discord IDs, stale Epic names, alternate ID scans | Single player identity panel with Discord/Epic account links and review queue |

---

## Data Model and Source of Truth

| Concept | Current places | Recommended source of truth | Store | Derive/sync | Deprecate/delete later |
|---|---|---|---|---|---|
| Events | `events`, `scrimEvents`, `scrimSeries`, imports by name/date | `events` as operational shell for calendarable events | Event metadata, template ID, source attachments, archived flag | Public calendar, import jobs, earnings jobs, Discord schedule sync | Deprecated event fields after migration: `apiLeaderboards`, `dynamicPairDetection`, old earnings literals |
| Results | `eventResults`, `thirdPartyResults`, `matchPlayerStats`, `matchKillEvents` | `thirdPartyImports` + normalized result tables for imported competitive results | Raw import rows and normalized player/match stats | Event summaries, rankings, profile stats | Legacy `eventResults` if all manual results migrate or become `manualResultImport` |
| Players | `players`, `applications`, `users`, Discord member sync | Convex `players` for member record | Stable player profile, membership status, linked account IDs | Public directory, Discord role tasks, exports | Placeholder Discord IDs after identity migration |
| Discord users | `players.discordUserId`, alternates, `users.discordUserId`, Discord roles cache | Discord for live account/role membership; Convex for linked identity | Primary and alternate Discord IDs, last sync, match confidence | Display username/avatar/roles from sync | Username-only matching as an automatic final match |
| Epic accounts | `players.epicUsername`, `epicId`, `previousEpicIds`, import rows | Epic ID where available; Epic username as display/search | Current Epic ID/name and history | Matching suggestions, profile links | Treat username as canonical once Epic ID coverage improves |
| Tiers | `players.tier`, `manualScores.tier`, `tierHistory`, Discord roles, re-eval caches | Convex score/tier decision | Current tier on player, score snapshot, tier history | Discord role sync, mismatch views | Discord role as source for website tier |
| Scores | `manualScores`, cached `players.totalScore`, `players.powerScore`, ranking/TC/DCA caches | `manualScores` for evaluation score; cache tables for derived analytics | Score inputs, total, tier, evaluator | Player display fields, re-evaluation, exports | Duplicate score formulas in UI components |
| Bans | Google Sheet, `eventBans`, `pendingRoleRemovals`, Discord roles | Convex offense/ban ledger after migration | Offense records, remaining events, role sync state | Google Sheet export, Discord role tasks | Google Sheet as primary store |
| Applications | `applications`, `players` temporary rejected records, `statusEvents` | `applications` until accepted; `players` after promotion | Candidate identity, decisions, audit | Player creation/linking, score prefill | Temporary rejected player as evaluation candidate if replaced by candidate score record |
| Signups | Not found in repo | Future `eventSignups` or external signup source imported into Convex | Signup identity, event ID, validation status | Yunite registration checks, Discord notifications | Manual signup validation spreadsheets |

---

## Automation Opportunities

| Opportunity | Safe automation | Why it helps |
|---|---|---|
| Event creation templates | Store templates per event type; prefill form/checklist | Reduces repeated data entry and missing fields |
| Recurring event generation | Generate event shells from recurrence rules; detect existing Discord event IDs/date overlaps | Faster weekly/monthly setup |
| Score import | Import leaderboard/match stats from attached Yunite source with replace/retry semantics | Avoids repeated manual result imports |
| Yunite import | Queue import when event gets a leaderboard URL; run match sync after leaderboard import | Reduces forgotten match syncs |
| Signup validation | Validate Discord ID, Epic ID, tier, active ban, already signed up | Prevents event-day corrections |
| Tier eligibility checks | Validate team composition and event restrictions from player tiers | Reduces manual admin review |
| Discord role updates | Queue role tasks when player tier/status/ban changes; bot acknowledges each task | One source of truth with retry visibility |
| Ban/removal handling | Convex offense ledger decrements remaining events after event completion | Reduces sheet edits and stale roles |
| Admin notifications | Notify on failed imports, high unmatched count, duplicate event, failed role sync | Makes silent failures visible |
| Error reporting | Durable `operationLogs`/`jobErrors` records with source and retry action | Replaces console-only troubleshooting |

---

## Error Handling and Visibility

Current visibility:

- `syncStatus` stores high-level status for `"discord"` and `"yunite"`.
- `thirdPartyImports` stores matched/unmatched counts and match data flags.
- `backfillJobStatus` and earnings jobs provide better progress patterns for some background work.
- `auditLogs` and `statusEvents` capture many admin/member decisions.
- Admin pages use toasts for action success/failure.

Gaps:

| Missing visibility | Recommended admin surface |
|---|---|
| Failed per-tournament Yunite import | Import job table with per-source errors and retry |
| Failed match data sync | Import detail status: matches fetched, sessions failed, last error |
| Missing data | Event readiness checklist: no leaderboards, no results, unmatched players, unsynced matches |
| Duplicate records | Data Health queue: duplicate players, duplicate imports, duplicate event dates/source IDs |
| Invalid signups | Event signup validation queue |
| Discord sync failures | Discord Ops page: member sync, role queue, last bot ack, failed role tasks |
| Yunite parsing failures | Yunite Ops page: raw API fetch status, parse errors, unknown response shape |
| Ban role sync failures | Event Bans page: pending role add/remove, ack age, last bot error |

Recommended pages:

1. **Operations Dashboard:** Today/upcoming events, failed jobs, imports needing review, role sync queue, duplicate warnings.
2. **Event Readiness Page:** Per event checklist and source statuses.
3. **Data Health Page:** Duplicate identity records, missing Epic IDs, unmatched import rows, stale caches.
4. **Integration Logs:** Filterable logs by Discord/Yunite/Google Sheets/Osirion with retry links.

---

## Efficiency and Usage

High-friction/usage patterns found:

| Pattern | Files/functions | Improvement |
|---|---|---|
| Full event collects and computed filtering | `events.management.getAllEvents`, `getEventsByStatus` | Use indexed date/status views and slim admin/public summaries |
| Repeated player full-table scans | Discord sync/matching, imports, admin matching | Central identity lookup tables or indexed linked-account table |
| Per-import/per-player loops through actions/mutations | Yunite imports and match sync | Batch internal mutations and job state; avoid many action-query-mutation round trips |
| Discord daily full member polling | `discord/sync.ts` | Event-driven bot updates plus daily reconciliation |
| Bot polling role queues | `http.ts` pending role endpoints | Push/long-poll with durable ack state; index queue fields |
| Repeated calculations | Player activity, top-five, rankings, TC/DCA | Queue recalculation for affected players/imports only |
| Manual refreshes | Yunite dashboard, cache/status pages | Background jobs with visible status and automatic invalidation |

---

## Key Uncertainties

- Event signups/registrations appear to be outside this repo or not implemented yet.
- The Discord bot code is not in this repository; HTTP endpoints reveal the contract but not bot retry behavior.
- Some idempotency risks depend on helper mutations not fully audited line by line, especially `storeMatchPlayerStats` and backfill helpers.
- Intended migration scope for Hercules/Clerk/Cloudflare is inferred from existing migration docs, not from a single canonical plan in this audit.
