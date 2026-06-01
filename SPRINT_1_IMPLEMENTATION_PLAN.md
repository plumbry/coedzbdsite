# Sprint 1 Implementation Plan

**Date:** 2026-06-01  
**Scope:** Planning only. No implementation in this document.  
**Goal:** Improve day-to-day admin operations without removing features, routes, workflows, or changing business logic.

## Guardrails

This sprint must not:

- Remove features, routes, or existing workflows.
- Change scoring logic, tier logic, event type behavior, or event type selection.
- Change Discord Events as the scheduling source of truth.
- Make images mandatory.
- Add recurring event generation.
- Auto-select event types.
- Create large new workflow hubs.

Any proposed change that could alter existing behavior is marked **Risky change** and must be approved before implementation.

## Classification Key

- **Safe refactor: behavior unchanged**
- **UI-only improvement: behavior unchanged**
- **Performance improvement: behavior unchanged**
- **Risky change: may affect behavior**
- **Feature removal: requires explicit approval**

No Sprint 1 item should be a feature removal.

---

## 1. Admin Operations Cards on Existing Admin Hub

**Classification:** UI-only improvement: behavior unchanged  
**Primary goal:** Make existing operational state visible on `/admin` without creating a new workflow hub.

### Exact Pages Affected

- `src/pages/admin/hub.tsx`
- Optional shared component location if desired:
  - `src/pages/admin/_components/operations-summary-cards.tsx`
  - or `src/components/admin/operations-summary-cards.tsx`

No routes are added or removed. The existing `/admin` index remains the landing surface.

### Exact Convex Functions Affected

Existing functions to read from:

- `api.sync.getAllSyncStatuses` from `convex/sync.ts`
- `api.events.management.getAllEvents` from `convex/events/management.ts`
- `api.thirdPartyQueries.getImportHistory` from `convex/thirdPartyQueries.ts`
- `api.players.getDiscordMembersAdmin` or `api.memberManagement.getDiscordMembers` depending on exact card scope
- `api.eventBans.queries.getSyncStatus` from `convex/eventBans/queries.ts`

Potential small read-only query additions:

- `convex/events/management.ts`
  - `getEventsNeedingSetupSummary`
- `convex/thirdPartyQueries.ts`
  - `getImportOperationsSummary`
- `convex/eventBans/queries.ts`
  - `getRoleSyncVisibilitySummary`

These would be read-only queries only.

### UI Description

Add a compact "Needs Attention" section above the existing hub card grid. It should be a summary, not a new control center.

Suggested cards:

- **Sync Status:** Discord and Yunite last sync state from `syncStatus`.
- **Events Needing Setup:** count of events with `needsSetup`.
- **Imports Needing Review:** count of recent imports with unmatched players or unsynced match data.
- **Event Ban Role Sync:** count of role adds/removals pending bot acknowledgement.
- **Player Review:** count of players with `needsReview`, if cheap to query.

Each card links to the existing page:

- Events -> `/admin/events-manager`
- Imports -> `/admin/uploads`
- Event bans -> `/admin/event-bans`
- Discord/player review -> existing member or Discord pages
- Data cache/sync -> `/admin/data-cache-status`

### Expected Admin Time Saved

Estimated 10-30 minutes per active admin session by reducing routine page checking and making failed/pending states obvious.

### Expected Convex/Discord Usage Impact

- Convex: Slight increase if implemented by stacking existing heavy queries directly on `/admin`.
- Convex: Neutral to positive if implemented with small summary queries that use indexes and bounded reads.
- Discord: No direct Discord API impact.

Implementation note: prefer summary queries over loading large lists into the hub.

### Risk Level

Low if read-only and summary-only.

### Behavior Change

Behavior stays the same. No workflow or source-of-truth changes.

### Rollback Considerations

Remove the summary section/component from `hub.tsx`. Existing hub links and routes remain untouched.

---

## 2. Events Manager Readiness/Status Badges

**Classification:** UI-only improvement: behavior unchanged  
**Primary goal:** Help admins enrich Discord-sourced events without changing scheduling ownership or event type behavior.

### Exact Pages Affected

- `src/pages/admin/events-manager.tsx`
- `src/pages/admin/_components/event-manager.tsx`

Optional link targets, existing only:

- `/admin/uploads`
- `/admin/event-results`
- `/events/:eventId`

### Exact Convex Functions Affected

Existing function:

- `api.events.management.getAllEvents` from `convex/events/management.ts`

Potential read-only query addition:

- `convex/events/management.ts`
  - `getEventReadinessSummaries`

Potential supporting reads:

- `thirdPartyImports` by `eventId` via existing index `by_event`
- `thirdPartyResults` by `importId` or import-level matched/unmatched counts already stored on `thirdPartyImports`

No mutation behavior should change.

### UI Description

In the existing Events Manager table, add small badges/indicators per row:

- **Needs Setup:** existing `event.needsSetup`.
- **No Leaderboards:** informational warning only for event types where leaderboards are expected. This should not block save.
- **No Linked Import:** informational if leaderboards exist but no import is linked.
- **Unmatched Players:** count from linked imports where `playersUnmatched > 0`.
- **Match Data Unsynced:** if linked Yunite import has `matchDataSynced !== true`.
- **Earnings Enabled:** existing visual can remain as-is.
- **Image:** do not show as required by default. Only show image guidance if future template/type metadata explicitly marks image as expected.

Badges should link or guide admins to existing routes:

- Linked imports/details -> `/admin/uploads` or `/admin/yunite/:importId`
- Results -> `/admin/event-results`
- Public event -> `/events/:eventId`

Event type selection remains entirely manual.

### Expected Admin Time Saved

Estimated 5-15 minutes per event by reducing manual checking of setup state, imports, and result sync.

### Expected Convex/Discord Usage Impact

- Convex: Neutral to positive if summaries are precomputed or queried efficiently.
- Convex: Negative if every event row performs unbounded per-event result scans.
- Discord: No impact.

Implementation note: avoid per-row N+1 queries from React. Prefer a single summary query or enrich `getAllEvents` carefully with bounded/indexed reads.

### Risk Level

Low if read-only badges only.

### Behavior Change

Behavior stays the same. No event type behavior, scheduling source, image requirement, or validation logic changes.

### Rollback Considerations

Remove badge rendering and any read-only summary query. Existing event CRUD remains untouched.

---

## 3. Duplicate Import Prevention for CSV and Yunite

**Classification:** Mixed

- **UI-only improvement: behavior unchanged** for warning-only duplicate detection.
- **Risky change: may affect behavior** for blocking imports, changing default action to replace, or preventing writes.

**Primary goal:** Prevent accidental duplicate data while preserving existing import workflows.

### Exact Pages Affected

- `src/pages/admin/uploads.tsx`
- `src/pages/admin/_components/import-third-party.tsx`
- `src/pages/admin/yunite-tournament.tsx` if duplicate status is shown on import details

### Exact Convex Functions Affected

Existing functions:

- `api.thirdPartyQueries.getImportHistory` from `convex/thirdPartyQueries.ts`
- `api.thirdParty.checkExistingImport` from `convex/thirdParty.ts`
- `api.thirdPartyMutations.importFromCSV` from `convex/thirdPartyMutations.ts`
- `api.thirdPartyMutations.replaceCSVData` from `convex/thirdPartyMutations.ts`
- `api.yunite.sync.listRecentTournaments` from `convex/yunite/sync.ts`
- `api.yunite.sync.syncYuniteTournaments` from `convex/yunite/sync.ts`

Potential read-only additions:

- `convex/thirdPartyQueries.ts`
  - `findPotentialDuplicateImports`
  - Checks normalized event name/date/source/leaderboard URL/tournament ID.

Potential safe helper refactor:

- Shared tournament ID extraction helper used by:
  - `convex/events/management.ts`
  - `convex/thirdPartyMutations.ts`
  - `convex/yunite/sync.ts`

### UI Description

CSV import:

- Before import, show a warning panel if existing imports match:
  - Same event name.
  - Same event date.
  - Same source.
  - Same leaderboard URL if provided.
- Warning should include links to existing import detail if available.
- Keep existing "Import CSV" action available unless explicit approval is given to block duplicates.
- Offer "Use Replace Existing" guidance if an existing import is selected.

Yunite import:

- For recent tournaments, continue showing `alreadyImported`.
- For manual tournament ID entry, normalize IDs and show duplicate warnings before running import.
- Do not silently replace data.
- Do not block import without explicit approval.

### Expected Admin Time Saved

Estimated 15-60 minutes per avoided duplicate cleanup.

### Expected Convex/Discord Usage Impact

- Convex: Small extra read before import; large downstream savings by avoiding duplicate result writes and cleanup.
- Discord: No impact.

### Risk Level

- Low for warning-only duplicate visibility.
- Medium for blocking duplicate writes or changing default to replacement.

### Behavior Change

Warning-only duplicate detection keeps behavior the same.  
Blocking duplicate imports or changing replace defaults would alter behavior and requires approval before implementation.

### Rollback Considerations

Remove duplicate warning UI and read-only query. Existing import mutations remain unchanged.

### Approval Gate

Before implementation, decide whether Sprint 1 should:

- Only warn and allow import.
- Require confirmation for likely duplicates.
- Block exact duplicate Yunite tournament IDs.

The safest Sprint 1 version is **warn and allow**.

---

## 4. Contextual Links and Breadcrumbs

**Classification:** UI-only improvement: behavior unchanged  
**Primary goal:** Reduce page switching and make existing workflows easier to traverse without adding new workflows.

### Exact Pages Affected

- `src/pages/admin/hub.tsx`
- `src/pages/admin/events-manager.tsx`
- `src/pages/admin/_components/event-manager.tsx`
- `src/pages/admin/uploads.tsx`
- `src/pages/admin/_components/import-third-party.tsx`
- `src/pages/admin/yunite-tournament.tsx`
- `src/pages/admin/_components/unmatched-players.tsx`
- `src/pages/admin/event-results.tsx`
- `src/pages/admin/_components/event-results-manager.tsx`
- `src/pages/admin/event-bans.tsx`
- `src/pages/admin/_components/event-bans-manager.tsx`

Existing routes only:

- `/admin`
- `/admin/events-manager`
- `/admin/uploads`
- `/admin/yunite/:importId`
- `/admin/unmatched/:importId`
- `/admin/event-results`
- `/admin/event-bans`
- `/events/:eventId`

### Exact Convex Functions Affected

No mutation changes expected.

Existing reads likely sufficient:

- `api.events.management.getAllEvents`
- `api.thirdPartyQueries.getImportHistory`
- `api.thirdPartyQueries.getImportDetails`
- `api.thirdPartyQueries.getUnmatchedPlayers`
- `api.events.getEventResultSummaries`
- `api.events.getEventResultsForEvent`

Optional read-only summary query may improve link counts:

- `convex/thirdPartyQueries.ts`
  - `getImportNavigationSummary`

### UI Description

Add contextual links where admins currently have to manually navigate:

- Events Manager row:
  - "Imports" link if linked imports exist.
  - "Results" link to Event Results.
  - "Public" link to `/events/:eventId`.
  - "Unmatched" link if linked imports have unmatched players.
- Import history row:
  - Link to owning event if `eventId` exists.
  - Link to unmatched players if `playersUnmatched > 0`.
  - Link to import detail.
- Yunite import detail:
  - Breadcrumbs already exist; ensure event link appears if linked.
- Unmatched players:
  - Breadcrumbs already exist; ensure import detail and uploads links remain visible.
- Event Results:
  - Link back to event/import where possible.

### Expected Admin Time Saved

Estimated 5-15 minutes per import/event workflow by reducing route hunting.

### Expected Convex/Discord Usage Impact

- Convex: Neutral if links use already-loaded fields.
- Convex: Slight increase if link counts require extra unbounded queries.
- Discord: No impact.

Implementation note: prefer links from already-present IDs/counts. Avoid extra result scans solely for link decoration.

### Risk Level

Low.

### Behavior Change

Behavior stays the same. This only adds navigation affordances.

### Rollback Considerations

Remove added links/breadcrumb props. Existing pages and routes remain untouched.

---

## 5. Event Ban Role Sync Visibility

**Classification:** UI-only improvement: behavior unchanged  
**Primary goal:** Make Discord role add/remove queue state visible to admins without changing how bans, Google Sheets, or Discord role sync work.

### Exact Pages Affected

- `src/pages/admin/event-bans.tsx`
- `src/pages/admin/_components/event-bans-manager.tsx`
- Optional summary card on `src/pages/admin/hub.tsx`

No routes added or removed.

### Exact Convex Functions Affected

Existing internal queries:

- `internal.eventBans.queries.getPendingRoleSyncs`
- `internal.eventBans.queries.getPendingRoleRemovals`

Existing HTTP endpoints using those queries:

- `convex/http.ts` `/api/discord/pending-role-syncs`
- `convex/http.ts` `/api/discord/pending-role-removals`
- `convex/http.ts` `/api/discord/acknowledge-role-syncs`
- `convex/http.ts` `/api/discord/acknowledge-role-removals`

Potential public/admin query addition:

- `convex/eventBans/queries.ts`
  - `getRoleSyncVisibility`
  - Returns counts only:
    - pending role additions.
    - pending role removals.
    - queued deleted-ban removals.

Potential performance improvement:

- Add/adjust indexes only if needed after reviewing query patterns.

### UI Description

On Event Bans page:

- Add small role sync status panel:
  - "Pending role adds"
  - "Pending role removals"
  - "Queued removals from deleted bans"
- Include a short "Bot must acknowledge these" status line.
- Link to no new page.
- Do not change ban creation, event passed, undo, delete, Google Sheet sync, or bot polling behavior.

On admin hub:

- Optional card in Admin Operations summary:
  - "Event ban role sync: X pending"
  - Links to `/admin/event-bans`

### Expected Admin Time Saved

Estimated 5-15 minutes per week by reducing manual checks and making stale role sync visible.

### Expected Convex/Discord Usage Impact

- Convex: Small extra read for counts.
- Discord: No direct API reduction in Sprint 1.
- Future Discord API reduction becomes possible after visibility confirms queue behavior.

### Risk Level

Low for read-only visibility.

### Behavior Change

Behavior stays the same. Bot polling and acknowledgements remain unchanged.

### Rollback Considerations

Remove role sync status panel/query. Existing Event Bans functionality and HTTP endpoints remain unchanged.

---

## Cross-Cutting Implementation Notes

### Query Design

Sprint 1 should avoid adding heavy reactive queries to admin pages. Prefer:

- Small summary queries.
- Existing indexes.
- Bounded `.take(n)` or pagination.
- Counts derived from already-stored summary fields where available.

Avoid:

- Per-row `useQuery`.
- Full `thirdPartyResults.collect()` for dashboard badges.
- Full `players.collect()` for every card.
- Calling internal bot-only queries directly from client code.

### UI Design

Use existing components and patterns:

- `AdminPageLayout`
- `Card`
- `Badge`
- `Button`
- `Table`
- Existing icon set from `lucide-react`

Keep additions compact. Do not replace existing workflows.

### Business Logic

Sprint 1 should not change:

- Event type values or how they are selected.
- Scoring/tier calculations.
- Discord Events scheduling ownership.
- Import write behavior, unless separately approved.
- Event ban decrement/role sync behavior.

---

## Sprint 1 Proposed Change Register

| Change | Classification | Behavior unchanged? | Approval needed before implementation? |
|---|---|---:|---:|
| Admin Operations read-only cards on `/admin` | UI-only improvement | Yes | No |
| Read-only summary queries for operations cards | Performance improvement | Yes | No |
| Events Manager readiness badges | UI-only improvement | Yes | No |
| Event readiness summary query | Performance improvement | Yes | No |
| Duplicate import warning panel | UI-only improvement | Yes | No |
| Duplicate import blocking | Risky change | No | Yes |
| Require confirmation for duplicate import | Risky change | No | Yes |
| Default to replace existing import | Risky change | No | Yes |
| Shared tournament ID helper extraction | Safe refactor | Yes | No, if covered by tests/manual verification |
| Contextual links and breadcrumbs | UI-only improvement | Yes | No |
| Event Ban role sync visibility panel | UI-only improvement | Yes | No |
| Public/admin role sync visibility query | Performance improvement | Yes | No |
| Removing any route or workflow | Feature removal | No | Yes, explicit approval required |

---

## Rollback Plan

Because Sprint 1 should be mostly read-only/UI:

1. Remove added UI sections/cards/badges/links.
2. Stop calling added summary queries.
3. Leave underlying existing pages and mutations untouched.
4. If helper refactors are included, revert helper extraction only if behavior diverges from existing URL parsing.

No database migrations should be required for the safest Sprint 1 version.

---

## Recommended Sprint 1 Scope

Implement only these safe items first:

1. Admin Operations read-only cards on `/admin`.
2. Events Manager read-only readiness/status badges.
3. Duplicate import warning-only detection.
4. Contextual links/breadcrumbs on existing pages.
5. Event Ban role sync read-only visibility.

Do not implement these without explicit approval:

1. Blocking duplicate imports.
2. Changing import defaults to replace existing data.
3. Changing Discord sync behavior.
4. Changing event type defaults or selection.
5. Adding image requirements.
6. Adding new major routes or hubs.
