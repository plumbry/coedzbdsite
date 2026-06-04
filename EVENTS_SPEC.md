# Events & Imports — Product Specification

**Status:** Canonical product/operations spec (aligned with codebase as of 2026-06).  
**Purpose:** Describe how events and leaderboards work today, what is policy vs enforced in code, and what is planned for rebuild.

**Related code:** `convex/schema.ts`, `convex/events/`, `convex/lib/eventLeaderboardLinks.ts`, `convex/thirdPartyMutations.ts`, `convex/yunite/sync.ts`, `src/pages/admin/_components/event-manager.tsx`, `src/pages/admin/_components/import-third-party.tsx`, `src/pages/events/_components/event-detail.tsx`.

**Out of scope here:** Spin (`scrimEvents`, `/spin`) — pairing tool, not calendar events. See operations audit for that system.

---

## Events

Events are **calendar occurrences** for ZBD competitive play (operational “scrim server” events). They are stored in the `events` table and shown on `/events`.

| Concept | Detail |
|--------|--------|
| **What they are** | Scheduled competitive occurrences with a type, mode, dates, optional Yunite URL slots, and optional linked import snapshots. |
| **Minimum Yunite data** | **Policy, not schema:** In production, an event should have **at least one Yunite leaderboard URL and/or at least one linked `thirdPartyImports` row**. The database allows empty shells (e.g. Discord cron with `needsSetup: true`). |
| **Types** | Ten `events.type` values (see [Event types](#event-types)). |
| **Creation** | **Manual:** Events Manager, ICS import. **Automatic (partial):** Daily Discord cron creates **event shells only** — default `scrim`, `needsSetup: true` — **no Yunite import**. |
| **Game mode** | Every event has `mode`: `ZB Main Map` or `Reload`. Not limited to a single type (e.g. mini-seasons are often Reload by convention). |

### Public display (two mechanisms)

1. **Embedded Event Results** (`/events/:id`) — Computed from `thirdPartyImports` where `eventId` matches. Does not require the URL to be pasted on the event record.
2. **Outbound Yunite link cards** — From event URL fields (standard, lobby 2, qualifier/finals) **and** linked import URLs on the public event page. URLs are added when admins paste them, when imports auto-link (`appendLeaderboardUrlToEvent` in `convex/lib/eventLeaderboardLinks.ts`), via `linkImportToEvent`, or `backfillLeaderboardLinks`.

---

## Event types

Leaderboard behavior is driven by `events.type` and flags (`twoLobbies`, `excludeLowestScore`, `skipFirstNWeeksPoints`, `bestNGames`, etc.). Computation lives in `convex/events/results.ts` (`getEventLeaderboards`).

### Scrim

| | |
|--|--|
| **Intent** | One-off scrim in the community server. |
| **Typical setup** | One Yunite import / one week; often one URL. |
| **Code** | Team weekly boards + **cumulative** with cross-week team consolidation (2+ overlapping players merge teams). Same engine as minicup/season. |
| **Reload** | Set `mode: "Reload"` when applicable (optional). |
| **Limit** | **Not** limited to one leaderboard in code — multiple URL slots and multiple linked imports are supported. |

### Mini-Cup

| | |
|--|--|
| **Intent** | One-off cup-style event. |
| **Product direction** | Can be merged into **Scrim** operationally; `minicup` remains in schema with **identical** leaderboard logic to scrim. |
| **Code** | Same as scrim. |

### Seasons

| | |
|--|--|
| **Intent** | Multi-week season (often 3–4 weeks, one import per week). |
| **Two lobbies** | `twoLobbies: true` → two imports per week (Lobby A / B). UI labels: `Wk N LA`, `Wk N LB`. |
| **Cumulative** | Team consolidation + **fill-player rule:** on cumulative teams, players who only appear in **one** week while the team played **2+** weeks are dropped from that team row. |
| **Week 1 exclusion** | Teams that **only** played week 1 are excluded from cumulative (week 1 = first import, or first **two** imports if two-lobby). |
| **Optional** | `skipFirstNWeeksPoints` — early weeks still count for stats but not cumulative points. |
| **Week count** | **Not fixed** — determined by number of linked imports (sorted by `eventDate`). |

### Mini-Seasons

| | |
|--|--|
| **Intent** | Reload-focused, ~2-week structure: open qualifiers (usually two full lobbies) in week one, then finals; optionally a consolation lobby in the final week. |
| **Convention** | Typically `mode: "Reload"` (not enforced by type). |
| **Admin URLs** | Separate fields: `qualifierLobby1Leaderboards`, `qualifierLobby2Leaderboards`, `finalsLeaderboards` (not only `standardLeaderboards`). |
| **Public labels** | Import **order** (by date): index 0 → **Qualifier Lobby 1**, 1 → **Qualifier Lobby 2**, 2+ → **Finals**. |
| **Consolation** | **Not a first-class type.** Model as a 4th+ linked import; public UI labels import index 3+ as **Consolation** (index 2 = Finals). |
| **Cumulative** | Same **team cumulative** path as season/scrim (not a separate mini-season engine). Shown when multiple imports exist (or two-lobby mode). There is **no** separate “enable cumulative” toggle. |
| **Rankings** | Mini-season results use **0.7×** weight in `rankings.ts`. |
| **Duration** | “Typically 2 weeks” is operational — not enforced in code. |

### Random Squads

| | |
|--|--|
| **Intent** | Duos paired with other duos into squads; ~4 games; new squad composition each game. |
| **Leaderboards** | **Duo cumulative** only (solo game points can roll into the player’s duo pair). |
| **Best 3 of 4** | Optional: `excludeLowestScore` on the event. |
| **Admin** | `duoAssignment` (`duo1` / `duo2`) on import rows — Duo Selector or auto-detect. |
| **Code** | No cross-week team consolidation. |

### Random Trios

| | |
|--|--|
| **Intent** | Duo + solo per game; ~4 games; new trio composition each game. |
| **Leaderboards** | **Duo cumulative** + **solo cumulative** — **not** a separate “trio” cumulative table. |
| **Best 3 of 4** | Optional: `excludeLowestScore`. |
| **Admin** | Same duo assignment workflow as random squads. |

### Solos Meets Duos / Trios

| | |
|--|--|
| **Intent** | Teams sign up together as a duo or trio but queue into games as solos. |
| **Code** | Fixed groups via **`eventDuoPairs`** (admin-assigned in Events Manager). Cumulative sums member points into those groups. |
| **`smdTeamSize`** | `duo` (2 players) or `trio` (3 players). |
| **Signups** | No signup table — groups are configured in admin. |

### Scrim Series (`events.type === "scrim-series"`)

| | |
|--|--|
| **Intent** | Multi-week series on the **events** calendar. |
| **Leaderboards** | Per-player **best `bestNGames`** individual games across all linked Yunite imports; week tabs + overall on `/events/:id`. |
| **Config** | `bestNGames`, optional `seriesDurationWeeks` (3 or 6). |
| **Linked standalone series** | Set **`linkedScrimSeriesId`** in Events Manager (scrim-series type). Public `/events/:id` shows the **`/scrim-series` leaderboard** (scores, penalties, best N from `scrimSeries` config) and Yunite links from `scrimSeriesImportLog`. Manage data in **Admin → Scrim Series**; `/scrim-series` remains unchanged. |
| **Yunite fallback** | If no link, `bestNGames` + linked `thirdPartyImports` still drive the legacy per-player Yunite table on the event page. |

### Showdown

| | |
|--|--|
| **Intent** | Tier-based multi-week competition (S/A/B/C). |
| **Scoring** | **Best 2 weekly totals** out of up to 4 weeks (each import ≈ one week). **`bestWeeks = 2` is hardcoded** in `getEventLeaderboards` (not driven by `bestNGames`). |
| **Tiers** | Snapshotted at event **create** for all players with a tier (`showdownTierSnapshots`). Tier-split leaderboards use **locked** tiers, not live tier. |
| **Admin** | Showdown tier tools; tier re-lock via `events.showdown`. |
| **Penalties** | **Target (rebuild):** Configurable penalties — **not built** on `events`. Penalties today exist only on **standalone** `scrimSeries` (`scrimSeriesPenalties`). |

### Legacy: `random`

Deprecated type with `dynamicPairDetection`. Prefer **random-squads** or **random-trios**.

---

## Uploads & imports

All Yunite and CSV paths write to **`thirdPartyImports`** + **`thirdPartyResults`**. Public embedded leaderboards read linked imports; legacy manual rows may still exist in **`eventResults`**.

### Yunite API (ZBD / scrim server)

| | |
|--|--|
| **What** | Primary pipeline for in-server tournaments. |
| **Trigger** | **Admin-initiated** — `syncYuniteTournaments` from `/admin/uploads` (Yunite tab) or per-tournament import on the Imports tab. **There is no scheduled Yunite cron.** After trigger, HTTP fetch from Yunite API is automated. |
| **Dedup** | `leaderboardId` = `yunite-{tournamentId}` — existing ID is skipped (bulk) or rejected (manual save). |
| **Manual backup** | Paste Yunite URLs on the event in Events Manager; tournament UUID must match for auto-link. |
| **Auto-link** | On import create **or** event save: match tournament ID ↔ set `thirdPartyImports.eventId` **and** append Yunite URL to the event (`appendLeaderboardUrlToEvent`; mini-season uses qualifier/finals slots by import order). |
| **Visibility on event** | Linked import → **embedded results** yes. **Outbound link cards** show event URL fields plus linked import URLs on `/events/:id`. |
| **Match data** | **Manual second step:** `syncTournamentMatchData` per import (kills, `matchPlayerStats`, kill events). Optional one-shot via `saveTournamentImport({ fetchMatchData: true })`. |
| **Player matching** | Discord ID → alternate Discord ID → Epic ID → Epic username → Discord username (`matchPlayerForImport`). Unmatched rows stay until admin links or `rematchImport` / `refreshAllImports`. |

### Third Party CSV (external tournaments)

| | |
|--|--|
| **Business meaning** | Events played **outside** the ZBD scrim server / external tournaments. |
| **UI** | Admin copy: “Yunite API for ZBD event records; Third Party CSV for external tournaments.” Player profile tab: unlinked CSV results (“outside Yunite”). |
| **Code** | Same tables as Yunite; `leaderboardId` = `csv_{timestamp}_{random}` — **can duplicate** if imported twice. Default `source` in admin UI is **`External`**. |
| **Usage** | Supported; **lightly used** in practice. |

### Scrim Series Yunite (`/admin/scrim-series`)

| | |
|--|--|
| **Today** | `scrimSeries.importFromYunite.importYuniteScores` → `scrimSeriesScores` / penalties. Public: `/scrim-series/:slug`. |
| **Event link** | Calendar `events` (type `scrim-series`) can set **`linkedScrimSeriesId`** in Events Manager; one series links to at most one event. |

---

## Data model (summary)

| Table | Role |
|-------|------|
| `events` | Calendar event shell (type, mode, dates, URL slots, flags, optional `linkedScrimSeriesId`). |
| `thirdPartyImports` | One snapshot per Yunite tournament or CSV upload. |
| `thirdPartyResults` | Per-player rows per import (source of truth for embedded leaderboards). |
| `eventDuoPairs` | Pre-assigned groups (solos-meets-duos). |
| `showdownTierSnapshots` | Tiers locked at showdown create. |
| `eventResults` | Legacy/manual per-player results (still used in some paths). |
| `scrimSeries*` | Standalone scrim series product (separate from `events.type === "scrim-series"`). |
| `playerEarnings` | Derived payout rows (separate job; mirrors much of LB grouping logic). |

---

## Operator checklist (happy path)

1. Create or sync **event** (Events Manager, ICS, or Discord cron shell).
2. Set **type**, **mode**, dates, earnings flags, type-specific options.
3. Attach **Yunite URLs** (and mini-season qualifier/finals URLs if applicable).
4. **Import** tournaments (admin Yunite sync or selective import) — auto-link by tournament ID when possible.
5. Resolve **unmatched** players; set **duo assignments** (random types) or **duo pairs** (solos-meets-duos).
6. **Sync match data** per import if detailed kills/stats matter.
7. Verify **embedded results** on `/events/:id` and **outbound links** on the event if needed.

---

## Rebuild targets (not shipped)

| Requirement | Current state |
|-------------|----------------|
| Single admin surface for `events` + standalone Scrim Series | Scores/penalties still edited in Scrim Series admin; Events Manager only links |
| Showdown configurable penalties | Not on `events` |
| Enforce minimum one Yunite URL or import (hard block) | Soft warning in Events Manager on save only |
| Unify scrim-series Yunite import into Events Manager | Import stays in Scrim Series admin; event page reads linked series |

### Shipped alignment (2026-06-04)

| Item | Implementation |
|------|----------------|
| Auto-link adds URL to event | `convex/lib/eventLeaderboardLinks.ts` |
| Public page shows all Yunite links | `event-detail.tsx` merges event fields + linked imports |
| Mini-season consolation label | Import tab index ≥ 3 → “Consolation” |
| Accurate Yunite sync copy | Admin Uploads / Yunite dashboard (admin-triggered, not cron) |
| CSV default source | `External` in import UI |
| Edit event deep link | `/admin/events-manager` from public event page |

---

## Type → primary leaderboard view (quick reference)

| Type | Primary standings |
|------|-------------------|
| scrim, minicup, season, mini-season | Teams (weekly + cumulative) |
| random-squads | Duos (cumulative) |
| random-trios | Duos + solos (cumulative) |
| solos-meets-duos | Pre-assigned groups (cumulative) |
| scrim-series (on `events`) | Players (best N games) |
| showdown | Players by tier + overall (best 2 weeks) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-04 | Initial spec from events/leaderboard audit; corrections applied (Yunite sync trigger, random trios duo/solo, mini-season, visibility, target vs shipped). |
| 2026-06-04 | Code aligned: auto-link URL append, public leaderboard links, mini-season consolation label, admin copy, CSV default source, Events Manager save warning. |
| 2026-06-04 | `events.linkedScrimSeriesId` links calendar events to standalone Scrim Series; event page shows series LB + import-log Yunite URLs. |
