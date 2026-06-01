# Sprint 2 Final Scope

**Date:** 2026-06-01  
**Status:** Implemented — performance and read reduction only.  
**Implementation rule:** No approved item changes business logic.

## Confirmed Guardrails

This implementation will preserve:

- Existing features, routes, workflows, scoring, tiers, and import/sync behaviour.
- Full event documents for Events Manager edit flows.

This implementation will not:

- Add pagination UX that removes visible data without load-more.
- Change mutation or import write paths.
- Introduce digest tables or schema migrations beyond optional indexes.

## Approved Sprint 2 Items

1. **Skip eager storage URL resolution** on `getAllEvents` unless `resolveImageUrls: true` (Events Manager only).
2. **Slim Yunite dashboard query** using import metadata; avoid per-import `thirdPartyResults` scans when `totalMatchKills` is present.
3. **Optimize `getOperationsSummary`** by batching recent imports instead of per-event import queries.
4. **Dedupe admin event subscriptions** on Events Manager page (single query, pass props).
5. **Index `thirdPartyImports` by `source`** for future filtered reads.

## Explicitly Out of Scope

- Blocking duplicate imports (Sprint 1 warning-only).
- Public events page changes (`getPublicEvents` already slim).
- Full `getAllYuniteTournaments` removal (still used by internal populate action).
- Player directory pagination.
- Phase 2 production migration.
