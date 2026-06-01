# Refined Roadmap

**Date:** 2026-06-01  
**Purpose:** Practical day-to-day improvements for running CoEd ZBD with less admin effort, less duplicate work, lower Convex/Discord usage, and better reliability.  
**Product direction:** Keep Discord Events as the scheduling source of truth. The website should enrich Discord Events, not replace them. Prefer improving existing pages over creating new pages. Avoid recurring event generation, event type auto-selection, lifecycle state machines, and large workflow hubs.

---

## Ranking Method

Recommendations are ranked by actual operational value for CoEd ZBD:

1. Admin time saved.
2. Reduction in repeated data entry.
3. Convex read/write reduction.
4. Discord API reduction.
5. Reliability and visibility gain.
6. Workflow efficiency and click reduction.
7. UI consistency.
8. Duplicate code/functionality removed.
9. Maintainability.
10. Product simplicity.

Complexity:

- **S:** Small, focused change.
- **M:** Moderate change across a few files.
- **L:** Larger change, still bounded.

Product complexity:

- **Removes:** Makes the product simpler.
- **Neutral:** Internal change or small UI addition.
- **Adds lightly:** Adds a small control/status concept but avoids a large new workflow.

---

## Top Priorities

| Rank | Recommendation | Why it matters for CoEd ZBD | Admin time saved | Complexity | Product complexity | Migration timing |
|---:|---|---|---:|---|---|---|
| 1 | Add a lightweight Admin Operations Dashboard on the existing admin landing surface | Staff need one place to see events needing setup, failed syncs, unmatched imports, stale Discord role tasks, and recent import status without visiting several pages | 10-30 min/admin session | M | Adds lightly | Before migration if using existing data; expand after migration |
| 2 | Add event readiness/status indicators inside Events Manager | Discord Events remain the schedule source, but website enrichment needs clear "needs setup" signals: missing leaderboard, no linked import, unsynced results, unresolved unmatched players. Event type remains manual | 5-15 min/event | S-M | Removes | Before migration |
| 3 | Prevent duplicate imports before write | Accidental duplicate CSV/Yunite imports create cleanup work and can distort player stats, rankings, earnings, and event history | 15-60 min/mistake avoided | M | Removes | Before migration |
| 4 | Paginate and slim highest-usage Convex queries | Public/admin lists currently pull broad datasets; reducing full collects protects Convex usage as match/import data grows | Ongoing performance savings | M-L | Neutral | Before migration for obvious hotspots; continue after |
| 5 | Cache/denormalize event and import summary fields | Admin pages need counts/status, not raw result scans. Cached summaries reduce reads and make status indicators cheap | 5-10 min/session plus usage savings | M | Neutral | Before migration if schema-light; after if adding new tables |
| 6 | Improve Discord sync with event-driven updates plus daily reconciliation | Discord membership and scheduled events are Discord-owned. Bot/webhook updates reduce full Discord API polling and stale website data | 10-20 min/week and fewer stale states | M-L | Neutral | During Cloudflare/bot migration |
| 7 | Centralize identity matching helpers | Matching by Discord ID, alternate ID, Epic username, fuzzy username repeats across Discord sync, Yunite imports, CSV, and applications | 10-30 min/import with unmatched data | M-L | Removes | Before Clerk migration if identity work is active; otherwise after |
| 8 | Add event templates that prefill fields but never choose event type automatically | Staff intentionally select event type, but templates can prefill mode, lobby slots, earnings defaults, best-N, and checklist hints after type/template selection | 3-8 min/event | M | Adds lightly | After migration unless event setup pain is urgent |
| 9 | Extract shared reusable admin components | Score forms, player edit fields, confirm dialogs, import status cards, and table actions repeat across pages | 5-15 min/dev change; fewer UI inconsistencies | M | Removes | Before migration for low-risk components |
| 10 | Consolidate duplicate import/linking helpers | Leaderboard URL parsing, tournament ID extraction, event import linking, and match counts are duplicated | Saves dev time and reduces subtle mismatches | S-M | Removes | Before migration |

---

## Detailed Recommendations

### 1. Lightweight Admin Operations Dashboard

**Rank:** 1  
**Implement on:** Existing `/admin` landing surface or current admin hub/redirect target, not a separate new workflow hub.

**Why it matters for CoEd ZBD:**  
Admins currently have to check Events Manager, Uploads/Yunite, Event Results, Discord/member pages, Event Bans, and cache/status pages to know what needs attention. CoEd ZBD runs frequent events and imports, so the highest-value improvement is a single "what needs action today" panel.

**Suggested cards using existing data first:**

- Discord Event sync status from `syncStatus`.
- Yunite sync status from `syncStatus`.
- Events with `needsSetup`.
- Upcoming Discord-synced events missing website enrichment fields.
- Imports with `playersUnmatched > 0`.
- Imports with `matchDataSynced !== true`.
- Event bans pending Discord role sync/removal.
- Players with `needsReview`.

**Files/functions involved:**

- `convex/sync.ts`
- `convex/events/management.ts`
- `convex/thirdPartyQueries.ts`
- `convex/eventBans/queries.ts`
- `convex/players.ts`
- `src/pages/admin/hub.tsx` or admin landing route
- `src/components/admin-page-layout.tsx`

**Admin time saved:** 10-30 minutes per admin session by reducing page checking and missed follow-ups.  
**Complexity:** M.  
**Product complexity:** Adds lightly, because it summarizes existing workflows rather than creating new ones.  
**Migration timing:** Start before Clerk/Cloudflare with read-only cards. Expand during/after migration if Discord/job status changes.

---

### 2. Event Readiness and Status Indicators in Events Manager

**Rank:** 2  
**Important constraint:** Do not auto-select event type. Event type remains explicitly selected by admins. Images should not block readiness unless a specific event type/template requires one.

**Why it matters for CoEd ZBD:**  
Discord Events should remain the schedule source of truth, but the website enriches them with type, mode, leaderboards, earnings, import links, and display metadata. Staff need to see which synced events still need enrichment.

**Recommended indicators:**

- `Needs Setup`: existing `needsSetup`.
- `No Leaderboards`: warning for event types where Yunite results are expected.
- `No Linked Import`: warning when leaderboards exist but no matching `thirdPartyImports.eventId`.
- `Unmatched Players`: show count from linked imports.
- `Match Data Not Synced`: show if linked Yunite imports are missing match data.
- `Earnings Config Missing`: only if event type/template expects earnings.
- `Image Missing`: only informational, and only if a chosen template/event type explicitly marks image as expected.

**Files/functions involved:**

- `src/pages/admin/_components/event-manager.tsx`
- `convex/events/management.ts`
- `convex/schema.ts` (`events`, `thirdPartyImports`, `thirdPartyResults`)
- `convex/thirdPartyQueries.ts`

**Admin time saved:** 5-15 minutes per event, more when multiple events are imported from Discord.  
**Complexity:** S-M.  
**Product complexity:** Removes complexity by making existing state visible.  
**Migration timing:** Before migration.

---

### 3. Duplicate Import Prevention

**Rank:** 3

**Why it matters for CoEd ZBD:**  
Duplicate event imports can inflate player histories, rankings, earnings, participation counts, and admin cleanup time. This is especially important because Yunite, CSV, manual replacement, and event linking are all available.

**Recommended behavior:**

- Before CSV import, check for same event name/date/source and show "Replace existing import" as the safer path.
- For Yunite URL/Tournament ID imports, normalize the tournament ID and block duplicate `yunite-{tournamentId}` imports unless admin chooses "resync/replace".
- Show duplicate warnings in the import UI before any write.
- Make `replaceCSVData` easier to discover from existing import detail.

**Files/functions involved:**

- `src/pages/admin/_components/import-third-party.tsx`
- `convex/thirdParty.ts`
- `convex/thirdPartyMutations.ts`
- `convex/yunite/sync.ts`
- `convex/events/management.ts`

**Admin time saved:** 15-60 minutes per avoided duplicate cleanup.  
**Complexity:** M.  
**Product complexity:** Removes complexity by preventing bad states.  
**Migration timing:** Before migration.

---

### 4. Pagination and Slim Queries for High-Usage Lists

**Rank:** 4

**Why it matters for CoEd ZBD:**  
The platform stores players, imports, match stats, kill events, tiers, earnings, bans, support tickets, and admin history. Full-table reads are tolerable early but become expensive as every event adds more data.

**Highest-value targets:**

- Public member directory.
- Admin member lists.
- Event lists.
- Import history and import detail rows.
- Event bans ended/history lists.
- Player match history and third-party results.
- Admin analytics/debug pages that collect entire tables.

**Files/functions involved:**

- `convex/memberManagement.ts`
- `convex/players.ts`
- `convex/events/management.ts`
- `convex/thirdPartyQueries.ts`
- `convex/yuniteQueries.ts`
- `convex/eventBans/queries.ts`
- `convex/playerStats.ts`
- Related pages in `src/pages/admin/*`, `src/pages/Index.tsx`, `src/pages/events/*`

**Admin time saved:** Mainly responsiveness; 5-10 minutes per heavy admin session from less waiting and fewer reloads.  
**Usage saved:** High Convex read reduction.  
**Complexity:** M-L depending on page.  
**Product complexity:** Neutral.  
**Migration timing:** Start before migration on obvious hotspots; continue after migration.

---

### 5. Cached Event and Import Summaries

**Rank:** 5

**Why it matters for CoEd ZBD:**  
Most admin screens need summary signals: matched/unmatched count, linked imports, match data synced, total players, total teams, last import time, and failure state. They do not need to scan all result rows every time.

**Recommended caches:**

- Per-event import summary: linked import count, unmatched count, unsynced match data count, latest import date.
- Per-import health summary: result count, matched/unmatched, match sync status, last error.
- Player participation fields are already partly denormalized; continue that pattern for event operations.

**Files/functions involved:**

- `convex/schema.ts`
- `convex/thirdPartyMutations.ts`
- `convex/yunite/sync.ts`
- `convex/events/management.ts`
- `convex/helpers/playerEventStats.ts`

**Admin time saved:** 5-10 minutes per session plus fewer confusing stale states.  
**Usage saved:** Medium-high Convex read reduction on admin/event pages.  
**Complexity:** M.  
**Product complexity:** Neutral.  
**Migration timing:** Before migration if using existing fields; after migration if adding larger cache tables.

---

### 6. Discord Sync Improvements

**Rank:** 6  
**Important constraint:** Discord Events remain the scheduling source of truth.

**Why it matters for CoEd ZBD:**  
Discord is where the community schedule and membership live. The website should enrich and cache Discord data, not compete with it. Current daily full syncs and polling endpoints can be reduced with event-driven bot updates while retaining daily reconciliation.

**Recommended improvements:**

- Scheduled events: keep daily reconciliation, but let the bot push event create/update/delete to Convex when possible.
- Members: let bot push member join/update/leave events to `/api/discord/sync-member` or successor endpoint.
- Roles: make pending role sync/removal queues indexed and visible; reduce polling frequency when queue is empty.
- Add "last bot ack" and queue age to admin visibility.

**Files/functions involved:**

- `convex/discord/sync.ts`
- `convex/discord/eventSync.ts`
- `convex/discord/eventSyncMutations.ts`
- `convex/http.ts`
- `convex/eventBans/queries.ts`
- `convex/eventBans/mutations.ts`
- Bot code outside this repo

**Admin time saved:** 10-20 minutes per week by reducing stale membership/event/role states.  
**Discord API saved:** Medium-high, especially if member and event changes become push-based.  
**Complexity:** M-L because bot changes are involved.  
**Product complexity:** Neutral.  
**Migration timing:** During Cloudflare/bot migration.

---

### 7. Identity Matching Improvements

**Rank:** 7

**Why it matters for CoEd ZBD:**  
Player identity is the backbone of rankings, tiers, imports, event history, Discord role sync, and applications. Repeated matching logic creates inconsistent outcomes and admin cleanup.

**Recommended approach:**

- Extract one server-side matcher used by Discord sync, Yunite import, CSV import, manual linking, and applications.
- Match priority should be explicit: Discord ID -> alternate Discord ID -> Epic ID -> Epic username -> Discord username -> fuzzy candidate requiring review.
- Return match confidence and reason.
- Use fuzzy matches only as `needsReview`, not silent final truth.

**Files/functions involved:**

- `convex/discord.ts`
- `convex/yunite.ts`
- `convex/yunite/sync.ts`
- `convex/thirdPartyMutations.ts`
- `convex/memberManagement.ts`
- `convex/players.ts`

**Admin time saved:** 10-30 minutes per import when unmatched/fuzzy data is common.  
**Complexity:** M-L.  
**Product complexity:** Removes complexity.  
**Migration timing:** Before Clerk migration if identity mapping is already in scope; otherwise after.

---

### 8. Event Templates Without Type Automation

**Rank:** 8

**Why it matters for CoEd ZBD:**  
Admins intentionally choose event type, and that should not change. The repetitive part is not choosing type; it is filling the same operational fields after choosing the event shape.

**Recommended behavior:**

- Admin manually selects a template or event type.
- Template pre-fills mode, leaderboard slot layout, two-lobby defaults, earnings settings, best-N, and optional readiness checks.
- Template never guesses event type from Discord title.
- Image expectation is optional and template-specific.

**Files/functions involved:**

- `src/pages/admin/_components/event-manager.tsx`
- `convex/events/management.ts`
- Possible lightweight `eventTemplates` config/table later

**Admin time saved:** 3-8 minutes per event.  
**Complexity:** M. Start with hardcoded local presets before adding a table.  
**Product complexity:** Adds lightly, but reduces form burden.  
**Migration timing:** After migration unless event setup is one of the biggest current pains.

---

### 9. Shared/Reused Components for Admin Workflows

**Rank:** 9

**Why it matters for CoEd ZBD:**  
There are repeated dialogs and forms for scoring, applications, player editing, confirmations, imports, and table actions. Reuse reduces inconsistent behavior and makes future changes faster.

**Highest-value shared pieces:**

- Shared `ConfirmDialog` for destructive actions instead of `window.confirm`.
- Shared event readiness/status badge.
- Shared import status card.
- Shared player identity fields.
- Shared score/evaluation field model and presets.
- Shared row action menu or labeled table action pattern.

**Files/functions involved:**

- `src/pages/_components/score-player-dialog.tsx`
- `src/pages/admin/_components/new-application-dialog.tsx`
- `src/pages/admin/_components/edit-application-dialog.tsx`
- `src/pages/admin/_components/event-manager.tsx`
- `src/pages/admin/_components/import-third-party.tsx`
- `src/components/confirm-dialog.tsx`
- `src/components/edit-player-form-fields.tsx`

**Admin time saved:** 2-5 minutes per task through clearer, consistent controls. Dev time saved is higher.  
**Complexity:** M.  
**Product complexity:** Removes complexity.  
**Migration timing:** Before migration for small shared components; avoid large refactors until after.

---

### 10. Reduce Page Switching in Existing Flows

**Rank:** 10

**Why it matters for CoEd ZBD:**  
Staff currently move between Events Manager, Uploads, Event Results, Yunite detail, Member Management, Discord Members, and Tier Mismatches. The goal is not a new mega-hub; it is contextual links and embedded summaries on existing pages.

**Practical changes:**

- From Events Manager row: link to linked imports, unmatched players, event results, and public event.
- From import detail: link back to owning event and results.
- From unmatched players: link to player profile/edit and import status.
- From Discord Members/Member Management: link to match/review/tier mismatch states.
- Add breadcrumbs to deep import/result pages.

**Files/functions involved:**

- `src/pages/admin/_components/event-manager.tsx`
- `src/pages/admin/_components/unmatched-players.tsx`
- `src/pages/admin/yunite-tournament.tsx`
- `src/pages/admin/event-results.tsx`
- `src/pages/admin/member-management.tsx`
- `src/pages/admin/discord-members.tsx`

**Admin time saved:** 5-15 minutes per event/import workflow.  
**Complexity:** S-M.  
**Product complexity:** Removes complexity.  
**Migration timing:** Before migration.

---

## Secondary Priorities

| Rank | Recommendation | Why it matters for CoEd ZBD | Admin time saved | Complexity | Product complexity | Migration timing |
|---:|---|---|---:|---|---|---|
| 11 | Durable Yunite match sync errors on import records | Admins need to know why match data did not sync without reading logs | 5-20 min/failure | M | Neutral | Before migration if small; otherwise after |
| 12 | Rate-limit helper for Yunite API actions | Avoids inconsistent retries and partial imports | Prevents failed import cleanup | M | Removes | Before migration |
| 13 | Make Event Bans role queue status visible | Reduces stale Discord roles and manual checking | 5-15 min/week | S-M | Removes | Before migration |
| 14 | Make Discord scheduled event sync update existing imported events | Website enrichment should follow Discord schedule changes without losing manual fields | 5-10 min/schedule change | M | Neutral | During bot/Cloudflare migration |
| 15 | Make delete/archive operations more recoverable | Accidental event/import/player deletion is expensive | Incident-dependent | M | Adds lightly | After migration |
| 16 | Move expensive debug queries out of reactive UI | Prevents accidental full-table reads | Usage savings | S-M | Removes | Before migration |
| 17 | Add indexes for common admin queue filters | Pending syncs, unmatched, status pages should not full scan | Usage savings | S-M | Neutral | Before migration if schema changes are acceptable |
| 18 | Standardize admin table actions | Reduces mistakes from icon-only buttons and inconsistent action placement | 2-5 min/session | S-M | Removes | Before migration |
| 19 | Shared source-of-truth documentation | Prevents future regressions in tier/player/event/import ownership | Dev/admin onboarding | S | Removes | Before migration |
| 20 | Application/player candidate simplification | Reduces temporary rejected-player confusion | 5-10 min/application | L | Removes | After Clerk migration |

---

## Lower Priority or Explicitly Deprioritized

These should not drive near-term implementation:

| Item | Reason |
|---|---|
| Recurring event generation | Discord Events are the scheduling source of truth and the schedule changes frequently |
| Event type auto-selection | Admins intentionally choose event type |
| Large workflow hubs | Preference is to improve existing pages and reduce page switching |
| Event lifecycle state machine | Too heavy for current needs; readiness/status indicators are enough |
| Enterprise-style process management | Adds product complexity without enough day-to-day value |
| Image-required readiness checks | Events do not always need images; only warn if a template/type explicitly requires one |
| Full ban ledger replacement | Valuable eventually, but too large unless event ban operations are currently a top pain |
| Full normalized result-model redesign | Useful long term, but not necessary before simpler duplicate prevention and status visibility |

---

## Suggested Implementation Order

### Sprint 1: Visibility and Duplicate Prevention

1. Add read-only Admin Operations cards using existing data.
2. Add Events Manager readiness/status badges.
3. Add duplicate import warnings before CSV/Yunite writes.
4. Add contextual links between Events Manager, imports, unmatched players, and results.
5. Add Event Bans pending role sync/removal status.

**Expected impact:** Immediate reduction in missed admin follow-ups and duplicate cleanup, with minimal product complexity.

### Sprint 2: Usage Reduction and Shared Helpers

1. Paginate/slim the highest-usage list queries.
2. Cache event/import summary fields where pages currently scan raw data.
3. Extract shared Yunite URL/tournament ID helper.
4. Move expensive debug queries away from reactive page loads.
5. Add missing indexes for queue/status filters.

**Expected impact:** Lower Convex usage, faster admin pages, easier maintainability.

### Sprint 3: Identity and Discord Reliability

1. Centralize identity matching.
2. Make fuzzy/low-confidence matches review-only.
3. Improve Discord scheduled event update behavior.
4. Add event-driven bot updates where Cloudflare migration touches bot/API boundaries.
5. Add role queue ack/age visibility.

**Expected impact:** Fewer stale Discord states, fewer unmatched imports, safer member/player identity handling.

### Sprint 4: Form Simplification and Templates

1. Add manually selected event templates/presets.
2. Extract reusable score/application/player form sections.
3. Standardize table actions and destructive confirmations.
4. Simplify application/player candidate flow after Clerk identity is settled.

**Expected impact:** Less repeated admin data entry and more consistent UI without introducing new major workflows.

---

## Before vs After Clerk/Cloudflare Migration

### Best Before Migration

- Admin Operations read-only cards.
- Event readiness/status indicators.
- Duplicate import prevention.
- Contextual links and breadcrumbs.
- Pagination/slim queries for clear hotspots.
- Shared helpers for Yunite URL parsing and import linking.
- UI consistency fixes that do not touch auth.
- Source-of-truth docs.

### Best During Migration

- Discord event-driven sync improvements.
- Role sync queue improvements.
- Identity matching changes if Clerk identity mapping is being touched.
- API endpoint cleanup if moving bot/webhook traffic through Cloudflare.

### Best After Migration

- Event templates if schema-backed.
- Application candidate simplification.
- Larger identity/account model changes.
- More durable import job tables if not already introduced.
- Any deeper result-model cleanup.

---

## Recommended First Five

If only five things are implemented first, choose these:

1. **Admin Operations cards on the existing admin landing/admin hub.**
2. **Events Manager readiness/status badges that enrich Discord Events without taking over scheduling.**
3. **Duplicate import prevention for CSV and Yunite.**
4. **Pagination/slim queries for public member directory, admin member lists, event lists, and import history.**
5. **Central shared identity matching helper used by imports and Discord sync.**

These are the best balance of day-to-day admin value, usage reduction, reliability, and simplicity.
