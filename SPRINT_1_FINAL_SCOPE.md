# Sprint 1 Final Scope

**Date:** 2026-06-01  
**Status:** Approved safe Sprint 1 implementation scope.  
**Implementation rule:** No approved item changes business logic.

## Confirmed Guardrails

This implementation will preserve:

- Existing features.
- Existing routes.
- Existing workflows.
- Existing scoring logic.
- Existing tier logic.
- Existing event type behavior.
- Discord Events as the scheduling source of truth.
- Optional event images.
- Current import write behavior.
- Current Discord sync behavior.

This implementation will not:

- Block duplicate imports.
- Change import defaults.
- Auto-select event types.
- Add recurring event generation.
- Add new routes or large workflow hubs.
- Make images mandatory.

## Files Planned for Modification

### Documentation

- `SPRINT_1_FINAL_SCOPE.md`
  - Adds this final implementation scope and business-logic confirmation.

### Shared Helpers

- `convex/lib/yunite.ts`
  - New shared helper for Yunite leaderboard/tournament ID extraction and URL collection.
  - Safe refactor only; behavior should match existing extraction behavior.

### Convex Read-Only Queries

- `convex/_generated/api.d.ts`
  - Generated Convex API type metadata updated by the build/codegen flow so the new read-only helper module is known to TypeScript.
  - No runtime/business logic.

- `convex/events/management.ts`
  - Add read-only event operations/readiness summary query.
  - Refactor existing local Yunite URL helper usage to shared helper without changing create/update behavior.

- `convex/thirdPartyQueries.ts`
  - Add read-only import operations summary and duplicate warning lookup.
  - Existing import mutations remain unchanged.

- `convex/eventBans/queries.ts`
  - Add read-only admin role sync visibility query.
  - Existing internal bot polling queries and acknowledgement flows remain unchanged.

- `convex/thirdPartyMutations.ts`
  - Refactor existing local Yunite URL helper usage to shared helper only.
  - No mutation behavior changes.

### Existing Admin UI Pages

- `src/pages/admin/hub.tsx`
  - Add read-only Admin Operations cards to the existing admin hub.
  - No new route or workflow hub.

- `src/pages/admin/_components/event-manager.tsx`
  - Add readiness/status badges and contextual links.
  - Does not change event create/update/delete behavior.

- `src/pages/admin/_components/import-third-party.tsx`
  - Add warning-only duplicate import detection.
  - Add contextual links where existing IDs/counts are available.
  - Does not block imports or change defaults.

- `src/pages/admin/_components/event-bans-manager.tsx`
  - Add read-only Event Ban role sync visibility.
  - Does not change ban, sheet, bot polling, or acknowledgement behavior.

## Possible Files Only If Needed

- `src/pages/admin/yunite-tournament.tsx`
  - Optional contextual link/breadcrumb refinement only.

- `src/pages/admin/_components/unmatched-players.tsx`
  - Optional contextual link/breadcrumb refinement only.

- `src/pages/admin/_components/event-results-manager.tsx`
  - Optional contextual link only.

These optional files will not be touched unless the link improvement can be made without changing behavior.

## Business Logic Confirmation

All approved Sprint 1 work is limited to:

- Read-only status visibility.
- Warning-only duplicate detection.
- Existing-page navigation improvements.
- Bounded summary queries.
- Shared helper extraction that preserves existing parsing behavior.

No approved item changes business logic.

## Explicitly Out of Scope

- Blocking duplicate imports.
- Replacing duplicate import data automatically.
- Changing import confirmation or defaults.
- Changing Discord scheduled event sync behavior.
- Changing Discord member sync behavior.
- Changing role sync polling/acknowledgement behavior.
- Changing event type defaults or selection.
- Changing scoring/tier calculations.
- Adding image requirements.
- Adding new routes.
- Removing existing UI or routes.
