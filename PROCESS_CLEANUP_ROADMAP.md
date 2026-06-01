# Process Cleanup Roadmap

**Audit date:** 2026-06-01  
**Companion:** `PROCESS_OPERATIONS_AUDIT.md`  
**Status:** Recommendations only. No code or data changed.

Priority key:

- **P1:** High-impact, low-risk cleanup
- **P2:** Important process improvements
- **P3:** Larger workflow redesigns
- **P4:** Future automation ideas

Migration timing:

- **Before migration:** Do first if it reduces ambiguity, migration risk, or operational mistakes.
- **During migration:** Good to fold into Hercules/Clerk/Cloudflare work if touching the same boundary anyway.
- **After migration:** Better once auth/hosting/integration foundations are stable.

---

## P1 - High-Impact, Low-Risk Cleanup

| Recommendation | Problem it solves | Files/functions involved | Improved process | Risk | Effort | Migration timing |
|---|---|---|---|---|---|---|
| Document event concepts and ownership | Staff/devs must infer difference between calendar events, Spin events, Scrim Series, imports, and results | `convex/schema.ts`, `convex/events/management.ts`, `convex/scrims/*`, `convex/scrimSeries/*` | Add an internal process doc/table naming each event-like model and when to use it | Low | S | Before migration |
| Add event setup checklist fields to admin display before changing behavior | Discord/ICS-created events can remain half-configured | `events.needsSetup`, `src/pages/admin/_components/event-manager.tsx`, `convex/discord/eventSyncMutations.ts` | Show missing leaderboard/image/earnings/type/setup warnings in Events Manager | Low | S-M | Before migration |
| Extract shared leaderboard URL helpers | Same tournament-ID/leaderboard URL matching logic is duplicated | `convex/events/management.ts`, `convex/thirdPartyMutations.ts` | One helper for extracting tournament IDs and collecting event URLs | Low | S | Before migration |
| Add duplicate warnings for CSV imports | CSV imports use random IDs and can accidentally duplicate an event | `thirdPartyMutations.importFromCSV`, imports UI in `src/pages/admin/_components/import-third-party.tsx` | Warn when same event name/date/source already exists; offer replace existing | Low | M | Before migration |
| Create a visible "failed syncs/imports" admin card from existing status data | Admins cannot quickly see sync failures | `convex/sync.ts`, `syncStatus`, `src/pages/admin/data-cache-status.tsx`, admin hub | Surface `syncStatus` plus recent failed import/job flags in one card | Low | S-M | Before migration |
| Standardize tier source-of-truth copy | Tier may be changed by scoring or Discord role sync | `convex/scores.ts`, `convex/discord.ts`, `tier-mismatches` pages | State in UI/docs: Convex score/player tier is canonical; Discord role is synced output | Low | S | Before migration |
| Add audit coverage checklist for destructive/manual ops | Some deletes/updates log, others rely on toasts/console | `auditLogs`, `statusEvents`, `thirdPartyMutations`, `events/management`, `eventBans` | Ensure delete/link/import/rematch/ban role actions have durable audit records | Low-Medium | M | Before migration |
| Rename or label legacy Spin/scrim workflow clearly in process docs | `scrimEvents` is Spin-like and separate from calendar event type `scrim` | `convex/scrims/*`, `src/pages/scrims/*`, `/spin` routes | Staff-facing labels distinguish "Spin" from "Scrim Series" and calendar event types | Low | S-M | Before migration |
| Add "needs review" queues to existing admin pages | Fuzzy matches, unmatched players, needsSetup events are scattered | `players.needsReview`, `events.needsSetup`, `thirdPartyResults.matched`, admin pages | Admin dashboard links directly to review queues | Low | S-M | Before migration |
| Add a source-of-truth table to docs | Same concepts appear in Convex, Discord, Google Sheets, Yunite | Docs only | Maintainers know what to edit vs regenerate | Low | S | Before migration |

---

## P2 - Important Process Improvements

| Recommendation | Problem it solves | Files/functions involved | Improved process | Risk | Effort | Migration timing |
|---|---|---|---|---|---|---|
| Introduce durable import/job status for Yunite | Per-tournament/match errors are not persisted for later review | `convex/yunite/sync.ts`, `convex/yunite/matchData.ts`, `thirdPartyImports`, new job table | Each import source has `queued/running/succeeded/failed/needs_review`, counts, retry, last error | Medium | M-L | Before migration if possible; otherwise during Cloudflare worker/job work |
| Normalize source attachments for events | Leaderboard links, Discord event IDs, and imports are spread across event/import fields | `events`, `thirdPartyImports.eventId`, `scrimEvents`, `scrimSeriesImportLog` | Event page shows attached Discord/Yunite/CSV/Spin/Series sources with status | Medium | L | After migration unless schema migration is already planned |
| Event templates | Event creation is long and repetitive | `src/pages/admin/_components/event-manager.tsx`, `convex/events/management.createEvent`, new `eventTemplates` table | Admin chooses template; form pre-fills type/mode/lobby/earnings/checklist | Low-Medium | M | After Clerk migration; before heavy event season |
| Event archive instead of delete | Deleting event records can orphan context | `convex/events/management.deleteEvent`, `events` schema, event queries | Add `archivedAt/archivedBy`; public hides archived; admin can restore | Medium | M | Before or during schema cleanup |
| Unified event operations page | Creating, importing, reviewing, and fixing results spans multiple routes | `/admin/events-manager`, `/admin/uploads`, `/admin/event-results`, `/admin/yunite-tournament` | One event detail ops page: setup, sources, imports, unmatched, earnings, results | Medium | L | After migration |
| Signup validation model or import | Signups are not represented in repo | New `eventSignups`, event bans, players, tiers | Import/signups validated for Discord ID, Epic ID, tier, bans, duplicate team/player | Medium | L | After migration |
| Central identity matching service | Player matching logic repeats across Discord sync, Yunite imports, CSV, applications | `convex/discord.ts`, `thirdPartyMutations`, `yunite/sync.ts`, `memberManagement.ts` | One internal matcher returns exact/alternate/Epic/fuzzy candidates with confidence | Medium | L | Before data migration if identity mapping is part of Clerk work |
| Role sync queue for Discord | Website tier/ban changes and bot roles can drift | `convex/http.ts`, `eventBans`, `discord.ts`, tier updates | Convex queues desired role changes; bot acknowledges; admin sees failures | Medium | L | During Cloudflare/Discord bot migration |
| Ban ledger as source of truth | Event bans are split between Google Sheet, Convex, and Discord role state | `convex/eventBans/*`, `convex/googleSheets.ts`, HTTP role endpoints | Convex owns offense/ban records; Sheets become import/export or read-only mirror | Medium-High | L | After migration, unless ban ops are currently painful |
| Application candidate model | Evaluation creates temporary rejected players and empty Discord IDs | `memberManagement.submitApplication`, `createPlayerForApplication`, `applications`, `manualScores` | Applications/candidates can hold evaluation before promotion to player | Medium | L | After Clerk migration |
| Shared score/evaluation form logic | Score forms and tier presets appear in multiple components | `score-player-dialog.tsx`, `new-application-dialog.tsx`, `edit-application-dialog.tsx`, `convex/scores.ts` | One shared form model and server-side score formula/presets | Low-Medium | M | Before migration if touching auth/profile flows |
| Import replace-by-default | Reimports should update existing import rows safely | `replaceCSVData`, `syncYuniteTournaments`, `thirdPartyImports` | UI defaults to replace existing source when same id/checksum/event source matches | Medium | M | Before migration |
| Admin operation notifications | Failed imports/syncs are easy to miss | `syncStatus`, job tables, admin chat/notifications future | Admin receives persistent alert for failures and review queues | Low-Medium | M | After migration |

---

## P3 - Larger Workflow Redesigns

| Recommendation | Problem it solves | Files/functions involved | Improved process | Risk | Effort | Migration timing |
|---|---|---|---|---|---|---|
| Event lifecycle state machine | Status is date-computed and setup/archive/import states are separate | `events.status`, `needsSetup`, imports, results, earnings | States: draft, scheduled, ready, live, importing_results, results_review, completed, archived | High | L-XL | After migration |
| Unified competitive result model | `eventResults`, `thirdPartyResults`, match stats, kill events overlap | `convex/events.ts`, `thirdPartyResults`, `matchPlayerStats`, `matchKillEvents` | Normalize raw imports, participant results, match results, and derived aggregates | High | XL | After migration |
| Operations dashboard | Admin work is route-based rather than queue-based | Many admin pages, `syncStatus`, jobs, imports, `statusEvents` | One queue for today's events, failed jobs, unmatched players, role syncs, missing data | Medium | L | After migration |
| Event source/job framework | Yunite, CSV, Discord, Sheets, Osirion use different status/error patterns | `yunite/*`, `googleSheets.ts`, `discord/*`, `inGameEarnings/*` | Shared job runner/status conventions for all external integrations | Medium-High | XL | During/after Cloudflare migration |
| Discord event-driven integration | Daily full polling creates lag and repeated API calls | `discord/sync.ts`, `discord/eventSync.ts`, `http.ts`, bot code outside repo | Bot/webhook sends member/event/role updates immediately; daily cron reconciles | Medium | L | During Cloudflare/bot migration |
| Convex-owned event bans | Reduces Google Sheets dependency and role drift | `eventBans/*`, Google Sheets ban sync, Discord role endpoints | Admin creates/updates bans in app; sheet export optional; bot syncs from Convex queue | High | L-XL | After migration |
| Event signup and eligibility engine | Staff likely validates signups manually | New signup tables, event bans, tiers, players, Discord bot commands | One source validates signups and exposes invalid/review queues before event | High | XL | After migration |
| Source-linked Spin events | Spin events are separate from calendar/ops | `scrimEvents`, `events`, `/spin`, `/admin/events-manager` | Calendar event can attach/create a Spin event and show pairings/source status | Medium-High | L | After migration |
| Scrim Series attachment to calendar events | Series sessions import Yunite data separately | `scrimSeries*`, `events`, `scrimSeriesImportLog` | Series sessions can reference event/source records and share status/error handling | Medium | L | After migration |
| Full identity account model | Players, users, Discord IDs, Epic IDs are mixed on player docs | `players`, `users`, applications, Discord sync, Yunite matching | Separate `accounts`/`playerIdentities` for Discord/Epic/Clerk links and history | High | XL | During Clerk migration if feasible; otherwise after |

---

## P4 - Future Automation Ideas

| Recommendation | Problem it solves | Files/functions involved | Improved process | Risk | Effort | Migration timing |
|---|---|---|---|---|---|---|
| Recurring event generation | Weekly events require manual creation | New recurrence/template support, `events.management.createEvent` | Generate event drafts for next N weeks from template, with duplicate detection | Low-Medium | M | After migration |
| Auto-import when Yunite link is added | Staff may forget to import/sync results | `events.management.updateEvent`, Yunite job table | Adding a leaderboard URL queues import and match sync automatically | Medium | M | After durable job status exists |
| Auto-rematch after identity updates | New Discord/Epic IDs can leave old imports unmatched | `players.updatePlayer`, Discord sync, `thirdPartyMutations.rematchImport` | Identity changes enqueue rematch for affected unmatched rows | Medium | M | After central matcher |
| Tier eligibility pre-checks | Invalid teams/signups are discovered late | Event signups, player tiers, event bans, team constraints | Admin sees invalid teams/signups before event starts | Medium | L | After signup model |
| Discord role desired-state reconciler | Role drift requires manual mismatch pages | `discord.roles`, `tierMismatches`, event ban role queues | Periodic reconciler compares desired Convex roles to Discord actual roles | Medium | L | During/after bot migration |
| Ban decrement on event completion | Remaining ban counts can require manual sheet edits | `eventBans`, `events` completion, Google Sheet update actions | Completing an event decrements active bans and queues role removals | Medium | M | After Convex ban ledger |
| Admin digest | Staff need proactive visibility | Operations dashboard, notification/email/Discord webhook | Daily digest: upcoming events, setup gaps, failed imports, role sync failures | Low | M | After migration |
| Import anomaly detection | Bad API parse or weird stats can pass silently | Yunite import jobs, result stats | Flag zero kills, huge placements, team kill discrepancies, missing sessions | Medium | M | After durable import logs |
| Auto-score suggestions | Manual scoring is slow and subjective | `manualScores`, third-party/Yunite/earnings stats | Suggest score inputs from known performance/earnings with admin approval | High | L-XL | After source data quality improves |
| Self-service player identity updates | Admins manually fix Discord/Epic/social links | Clerk user auth, players, identity links | Players request/update identity links; admins approve risky changes | Medium-High | L | After Clerk migration |

---

## Recommended Sequencing

1. **Before Hercules/Clerk/Cloudflare migration:** Clarify source-of-truth docs, event concept docs, duplicate warnings, setup checklist visibility, shared helpers, and role/tier ownership. These reduce migration ambiguity.
2. **During migration:** If touching auth/bot/hosting boundaries, prioritize central identity matching, role sync queue, and event-driven Discord updates.
3. **After migration:** Build the larger operations dashboard, event source/job framework, templates, recurring events, signup model, and Convex-owned ban ledger.

---

## Practical First Sprint

1. Add an Events Manager readiness column/card using existing fields (`needsSetup`, leaderboard counts, import links).
2. Add CSV duplicate warnings using event name/date/source/import history.
3. Extract shared Yunite URL/tournament ID helpers.
4. Add a small Admin Operations card using `syncStatus`, events with `needsSetup`, imports with unmatched players, and pending role sync counts.
5. Write one internal source-of-truth doc for players, tiers, bans, events, imports, and Discord roles.
