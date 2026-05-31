# Performance and Usage Audit

**Date:** 2026-05-31  
**Scope:** Full application (Convex backend, React frontend, Discord integration, background jobs)  
**Goal:** Reduce Convex usage, reduce unnecessary reads/writes, improve responsiveness, and maximize free-tier longevity.  
**Status:** Audit only — no code changes in this pass.

---

## Executive Summary

This application is a Convex-backed competitive Fortnite community platform with heavy match-level analytics (`matchKillEvents`, `matchPlayerStats`, `thirdPartyResults`), admin tooling, Discord bot integration, and public member/event pages.

### Top usage hotspots (ordered by impact)

| Rank | Hotspot | Type | Why it matters |
|------|---------|------|----------------|
| 1 | `memberManagement.getAcceptedMembers` | Reactive query on **public home page** | Full `events` + `thirdPartyImports` scan + N×(`manualScores` + `matchPlayerStats.take(200)`) per accepted member |
| 2 | `discord.upsertPlayer` during member sync | Daily cron + bot webhooks | Up to **4× full `players` table scans per guild member** |
| 3 | `wrappedStats.calculateAllStats` | Reactive query on **public `/2025-wrapped`** | Multiple full-table collects on `eventResults`, `thirdPartyResults`, `players`, `playerEarnings` per page view |
| 4 | `matchKillEvents` table growth | Storage + query cost | Largest table; several admin paths still `.collect()` entire table |
| 5 | `AdminChatWidget` → `chat.getMessages` | Global admin subscription | Live subscription on every admin page even when chat panel is closed |
| 6 | `players.getAllPlayersAdmin` | Admin unmatched-players flow | Full players + 3N result queries per player |
| 7 | `leaderboardStats.getLeaderboardStats` / `getTierImpactStats` | Admin analytics | Full players + all imports + per-import results |
| 8 | `tierReEvaluation.getCachedTierReEvaluationData` | Admin analytics (3 pages) | Up to 500 large cache documents per subscription |
| 9 | Discord bot polling (`pending-role-syncs`, `pending-role-removals`) | HTTP polling | Full `eventBans.collect()` on each poll |
| 10 | `rankings.getPlayerRankings` | Google Sheets export (not UI-subscribed) | Still recomputes from raw data despite cached fields on player docs |

### Existing good patterns

- **Cache tables:** `aggregateStatsCache`, `tierReEvaluationCache`, `tierMediansCache`, `upsetKillsStatsCache`, `tournamentScanCache`
- **Embedded player caches:** `rankingStats`, `powerScore`, `contributionScore`, `topFiveCache`, `dcaCache`
- **Pagination:** `upsetKills.getUpsetKills`, `getAllEliminations`, `thirdPartyQueries.getImportHistory`; `cacheStatus` uses paginated counting for large tables
- **Convex query deduplication:** Identical `useQuery` calls share one WebSocket subscription
- **Batch scheduling:** `rankings.updateAllPowerScores` staggers per-player mutations; earnings/kill backfill use job tables

---

## Pagination Audit

### Players / Members

| Query | Location | Current implementation | Est. records | Pagination | Recommended approach | Expected reduction |
|-------|----------|------------------------|--------------|------------|-------------------|-------------------|
| `memberManagement.getAcceptedMembers` | Public home (`Index.tsx`) | Indexed `by_membership_status` + full events/imports + N enrichment | ~200–800 players + all events/imports | None | Precompute `isActive` on player doc (cron on import sync); return slim public digest (no full player doc); optional client-side search on cached list | **70–90%** reads on highest-traffic page |
| `players.getPlayers` | Many admin pages | Full table scan + filter + N× `manualScores` | All players (~500–2k) | None | Use `by_membership_status` index; paginate with `usePaginatedQuery`; return digest without nested score fetch where possible | **60–80%** on admin list pages |
| `players.getAllPlayersAdmin` | Unmatched players | Full players + per-player eventResults + thirdPartyResults | All players × results | None | Paginate; denormalize `eventsPlayedCount` on player; load results only on profile drill-down | **80–95%** |
| `players.getDiscordMembersAdmin` | Discord members admin | Full `players.collect()` filtered to discord_member | All players scanned | None | Index query on `status=discord_member` or dedicated status field | **50–70%** |
| `memberManagement.getPendingApplications` | Member management | `by_status` index + N× scores | ~10–100 | None | Acceptable at current scale; paginate if pending queue grows | **10–30%** if paginated |
| `memberManagement.getRejectedMembers` | Member management | Full scan with JS filter on `currentMembershipStatus` | Rejected subset | None | Use existing `by_membership_status` index | **40–60%** |
| `memberManagement.getFormerMembers` | Member management | Indexed | Former subset | None | OK | — |
| `memberManagement.getDiscordMembers` | Member management | Indexed `status=discord_member` | Discord-only members | None | OK | — |

### Events

| Query | Location | Current implementation | Est. records | Pagination | Recommended approach | Expected reduction |
|-------|----------|------------------------|--------------|------------|-------------------|-------------------|
| `events.management.getAllEvents` | Events page, admin event manager, imports, duo manager | Full `events.collect()` + storage URLs | ~100–500 | None | Public page: `getPublicEvents` with slim fields + `by_date` index; admin: paginate or cache digest | **30–50%** public; **20–40%** admin |
| `events.management.getEventsByStatus` | Backend only | Full collect + date filter | All events | None | Query `by_date` with range filter | **30–50%** |
| `events.results.getEventLeaderboards` | Event detail | Per-event scoped | One event's results | None | OK if bounded per event; watch large tournaments | Monitor |
| `scrims.queries.listEvents` / `listEventsAdmin` | Scrims pages | Full `scrimEvents` collect | ~10–100 | None | OK at current scale; add `.take(50)` + cursor if grows | Low now |

### Chat messages

| Query | Location | Current implementation | Est. records | Pagination | Recommended approach | Expected reduction |
|-------|----------|------------------------|--------------|------------|-------------------|-------------------|
| `chat.getMessages` | `AdminChatWidget` (global) | `.order("desc").take(50)` | 50 | Partial (fixed window) | Skip subscription until widget open; add cursor pagination for history; TTL/archive old messages | **100%** when closed; **50%** invalidation churn when open |
| `chatMessages` table | — | No index on time; grows unbounded | Unbounded | None | Add retention job (e.g. keep 500 messages); index by `_creationTime` | Storage + scan savings over time |

### Support tickets

| Query | Location | Current implementation | Est. records | Pagination | Recommended approach | Expected reduction |
|-------|----------|------------------------|--------------|------------|-------------------|-------------------|
| `support.getActiveTickets` | Admin support panel | `by_status` index, full collect | ~10–50 active | None | OK now; paginate if volume grows | Low |
| `support.getArchivedTickets` | Admin support panel | Same for archived | Growing archive | None | Paginate archived (newest first, 25/page) | **40–60%** when archive >100 |

### Audit logs

| Query | Location | Current implementation | Est. records | Pagination | Recommended approach | Expected reduction |
|-------|----------|------------------------|--------------|------------|-------------------|-------------------|
| `audit.getAuditLogs` | Admin audit page | `.order("desc").take(limit)` default 100 | 100 | Fixed limit | Add `usePaginatedQuery` + cursor; add `by_creationTime` index | **50–80%** for deep history browsing |
| `audit.getEntityAuditLogs` | Entity drill-down | `by_entity` index, full collect | Entity-scoped | None | `.take(50)` + paginate for hot entities | **30–50%** |

### Match history / analytics

| Query | Location | Current implementation | Est. records | Pagination | Recommended approach | Expected reduction |
|-------|----------|------------------------|--------------|------------|-------------------|-------------------|
| `playerStats.getPlayerMatchStats` | Player profile ZBD tab | `by_player` index, full collect | 50–500+ per player | None | Paginate by import/session; summary + drill-down | **40–70%** per profile view |
| `playerStats.getPlayerAllEvents` | Player profile | Results by player + batch import cache | 10–200 per player | None | OK for single player; combine with comprehensive stats query | **20–30%** via query merge |
| `playerStats.getPlayerDuoPerformance` | Player profile | All matches + **N× per-match duo lookup** | Matches × 2 queries | None | Single query grouped by `(importId, sessionId, teamId)` | **50–80%** |
| `thirdPartyQueries.getPlayerThirdPartyResults` | Player profile | `by_player` collect | Per player | None | Paginate if >50 results | **30–50%** for veterans |
| `thirdPartyQueries.getImportDetails` | Import admin | All results for one import | 50–200 per import | None | Paginate large imports | **40–60%** |
| `thirdPartyQueries.getUnmatchedPlayers` | Import admin | Filtered by import | Subset | None | OK per import | — |
| `yuniteQueries.getAllMatchPlayerStats` | Debug only | **Full table collect** | Entire `matchPlayerStats` | None | **Remove from any UI**; admin count via `cacheStatus` | **100%** if referenced |
| `upsetKills.getUpsetKills` | Admin upset kills | `by_upset` + `.paginate()` | Page (~25) | **Yes** | Good pattern; reduce per-row `db.get` enrichment | **10–20%** |
| `upsetKills.getAllEliminations` | Admin eliminations | Paginated | Page | **Yes** | Good | — |
| `upsetKills.getPlayerUpsetKills` | Player kills dialog | Two indexed collects, ignores pagination arg | Unbounded per player | Arg exists, unused | Wire up pagination | **50–70%** |

### Applications

| Query | Location | Current implementation | Est. records | Pagination | Recommended approach | Expected reduction |
|-------|----------|------------------------|--------------|------------|-------------------|-------------------|
| `memberManagement.getPendingApplications` | Member mgmt | Indexed pending + scores | Small | None | OK | — |
| `memberManagement.getApplicationHistory` | Backend | Indexed by discord ID | Per user | None | OK | — |

### Other large lists

| Query | Location | Est. records | Pagination | Notes |
|-------|----------|--------------|------------|-------|
| `inGameEarnings.getAllInGameEarnings` | Admin earnings | All earnings rows + N player gets | None | Paginate; use slim digest |
| `inGameEarnings.getRecentlyActivePlayers` | Admin earnings | All imports + all results + player gets | None | Precompute "recently active" set |
| `eventBans.getActiveBans` / `getEndedBans` | Event bans admin | All bans by status + player lookup | None | Paginate ended bans |
| `users.getAllUsers` | User management | All users | None | OK while <100 admins |
| `scrims.queries.listEventsAdmin` | Spin moderation | All scrim events | None | OK |
| `scrimSeries.queries.getScores` | Scrim series admin | All scores for series | None | OK per series |
| `discord.findMatches.findPotentialMatches` | Fuzzy matches | Full players scan | None | Run on-demand (action), not subscription |

---

## Query Efficiency

### Full table scans (high priority)

| Function | File | Table(s) | Issue |
|----------|------|----------|-------|
| `getPlayers`, `getArchivedPlayers`, `getRejectedPlayers` | `players.ts` | `players` | `.collect()` without membership index |
| `getAcceptedMembers` | `memberManagement.ts` | `events`, `thirdPartyImports` | Full collect to compute 6-week activity |
| `getLeaderboardStats`, `getTierImpactStats` | `leaderboardStats.ts` | `players`, `imports`, `events` | Full collect + per-import results loop |
| `calculateAllStats` + stat helpers | `wrappedStats.ts` | `eventResults`, `thirdPartyResults`, `players`, `playerEarnings` | Multiple full collects per stat type |
| `upsertPlayer` | `discord.ts` | `players` | Up to 4× `.collect()` per sync |
| `getPlayerStatsByEpic` | `playerStats.ts` | `thirdPartyResults` | Filter on `epicUsername` without index |
| `getPendingRoleSyncs`, `getPendingRoleRemovals`, `getOffenseCounts` | `eventBans/queries.ts` | `eventBans` | Full collect on every bot poll |
| `rebuildStatsCache`, `removeDuplicateKillEvents` | `upsetKills.ts` | `matchKillEvents` | Full collect (millions potential) |
| `getAllMatchPlayerStats` | `yuniteQueries.ts` | `matchPlayerStats` | Full collect |
| `getRecentlyActivePlayers` | `inGameEarnings/queries.ts` | `thirdPartyImports`, `thirdPartyResults` | Nested full scans |

### Missing indexes (recommended)

| Table | Index | Used by |
|-------|-------|---------|
| `players` | Use existing `by_membership_status` consistently | `getPlayers`, `getArchivedPlayers`, home page variants |
| `players` | `["status", "hasMatchData"]` composite | `rankings.getPlayerRankings` filter-after-index |
| `thirdPartyResults` | `["epicUsername"]` | Epic lookup, teammate search |
| `thirdPartyImports` | `["importMethod", "eventDate"]` or `["eventId"]` (exists) + date sort | Recent activity, earnings |
| `applications` | `["playerId"]` | `deletePlayer` cascade |
| `auditLogs` | Time-ordered access | `getAuditLogs` pagination |
| `eventResults` | `["eventId"]` | Wrapped year filtering |
| `matchKillEvents` | `["killerPlayerId", "victimPlayerId"]` | Head-to-head queries |
| `chatMessages` | Implicit `_creationTime` ordering | History pagination |
| `players.alternateDiscordUserIds` | Denormalized lookup table or reverse index | Alternate ID matching in sync |

### Expensive filters (post-index JS filtering)

- `rankings.getPlayerRankings`: `hasMatchData` filter after `by_status` — needs composite index
- `memberManagement.getRejectedMembers`: filters `currentMembershipStatus` without index
- `events.management.getEventsByStatus`: status derived from dates but loads all events first

### N+1 query patterns

| Function | Pattern | Severity |
|----------|---------|----------|
| `getAllPlayersAdmin` | Per player: scores + eventResults + thirdPartyResults | Critical |
| `getAcceptedMembers` | Per player: manualScores + matchPlayerStats (200 rows) | Critical (public) |
| `getPlayerDuoPerformance` | Per match: duo lookup query | High |
| `getTierReEvaluationData` | Per player: results, matches, same-tier score lookups | Critical (live path) |
| `getPlayerRankings` | Per player: `getPlayerEvents`, thirdPartyResults for S-tier | High |
| `getAllInGameEarnings` | Per row: `db.get(player)` | Medium |
| `getAllYuniteTournaments` | Per import: all results | Medium |
| `getTournamentDetails` | Per matched result: `db.get(playerId)` | Low–medium |
| `getActiveBans` | Per ban: player lookup by discord ID | Low |

### Repeated / duplicate queries

| Overlap | Consumers | Impact |
|---------|-----------|--------|
| `getAcceptedMembers` | Public home + admin member management | Same heavy query on two routes |
| `events.management.getAllEvents` | 6+ pages/components | Deduped by Convex but wide invalidation surface |
| `players.getPlayers` | 10+ admin surfaces | Any player write invalidates all |
| `tierReEvaluation.getCachedTierReEvaluationData` | Tier re-eval, holistic stats, features page | Large payload × 3 admin routes |
| `users.getCurrentUser` | `useUserRole`, username dialogs | Deduped; username dialog lacks auth skip |
| `wrappedStats.calculateAllStats` | Public wrapped + admin preview | Expensive live compute × traffic |

### Over-fetching

| Query | What's over-fetched |
|-------|---------------------|
| `getAcceptedMembers` | Full player documents (admin fields, caches, comments) on public page |
| `getPlayerProfile` + ZBD tab | 5 separate queries where 1–2 combined digest queries suffice |
| `getCachedTierReEvaluationData` | 500 full cache rows when UI may only need filtered tier |
| `getAllEvents` | Storage URLs resolved for every event even when not displayed |
| `chat.getMessages` | Subscribed globally for admins regardless of panel state |

---

## Caching Opportunities

### Browser caching

| Asset / data | Current | Recommendation | Est. savings |
|--------------|---------|----------------|--------------|
| Service worker (`public/sw.js`) | Network-first for same-origin GET; caches `/`, icons | Extend immutable cache for static JS/CSS chunks (Vite hashed filenames); **do not cache Convex WebSocket/API** | **10–20%** repeat-visit bandwidth |
| Discord avatars (`players.avatarUrl`) | Loaded from Discord CDN per render | `<img loading="lazy">`; stable URLs cache well in browser | **30–50%** avatar bandwidth on member list |
| Convex `_storage` event images | Fetched via signed URLs in `getAllEvents` | Long-cache headers on storage; lazy-load images below fold | **20–40%** on events page |
| Public home member list | Live Convex subscription | Consider static digest regenerated on member change (edge/CDN) for anonymous users | **50–80%** anonymous traffic |

### Session / client caching

| Data | Recommendation | Est. savings |
|------|----------------|--------------|
| `getAllEvents` | Lift to React context on admin section; invalidate on mutation only | Fewer hook instances; clearer lifecycle |
| `getPlayers` in dialogs | Fetch on dialog open (`open ? {} : "skip"`) | **100%** while dialogs closed |
| Tier re-eval cache | `sessionStorage` snapshot with `lastUpdated` TTL for admin analytics cluster | **30–50%** re-navigation within session |
| Player profile tabs | Load ZBD tab queries only when tab selected | **60–80%** profile views that don't open ZBD tab |

### Memoization / derived data

| Location | Recommendation |
|----------|----------------|
| Home page filters/sorts | Already client-side on query result — OK |
| Scrim series leaderboard | Server-side compute OK for series size; memoize in query handler if called frequently |
| Admin event manager status badges | Derive from dates client-side instead of re-querying |

### React Query (TanStack)

- **Current:** Provider exists (`query-client.tsx`) but **unused** for data fetching — all data via Convex reactive queries.
- **Recommendation:** Either remove unused provider or use TanStack for **non-reactive** one-shot reads (`useConvex().query()` patterns on upset-kills H2H/search) with `staleTime: 5 * 60 * 1000`.
- **Do not** duplicate Convex subscriptions in React Query without careful invalidation design.

### Derived data caching (server — highest ROI)

| Computed surface | Store on | Refresh trigger |
|------------------|----------|-----------------|
| Public member directory digest | New `publicMemberDirectoryCache` table or field on aggregate doc | Member accept/archive; import sync |
| `isActive` (6-week) | `players.isRecentlyActive` | Nightly cron or post-import mutation |
| Wrapped stats | `wrappedContent.computedSections` JSON | On publish / admin "recompute" |
| Leaderboard stats per import | `thirdPartyImports.analyticsDigest` | On import sync |
| Rankings page export | Read `players.powerScore` + caches only | On PR recalc (already scheduled) |

### Discord API caching

| Call | Current | Recommendation |
|------|---------|----------------|
| Guild members list | Daily cron; paginated 1000/page | OK frequency; fix DB-side matching (below) |
| Scheduled events | Daily cron; 1 request | OK |
| Member roles (admin tools) | Per-action fetch | Cache roles list in Convex doc with 1h TTL |
| Member profile for tier tools | Per player | Batch during sync; store in `players.discordRoles` (partially done) |

**Est. Discord API savings:** Member/role caching reduces admin-tool calls by **60–80%**; DB-side sync fix doesn't reduce Discord calls but reduces Convex cost dramatically.

---

## Convex Subscriptions Audit

### Global subscriptions (every route)

| Component | Query | Always active? | Issue |
|-----------|-------|----------------|-------|
| `UsernameSetupDialog` | `users.getCurrentUser` | Yes (even anonymous) | Should skip when `!isAuthenticated` |
| `useUserRole` / `SiteHeader` | `users.getCurrentUser` | When authenticated | OK |
| `AdminChatWidget` | `chat.getMessages` | All admin pages | Should skip until `isOpen` |
| `EditUsernameDialog` | `getCurrentUser`, `checkUsernameAvailable` | When mod/admin header mounts | OK (deduped) |

### Unnecessary / overly broad subscriptions

| Subscription | Problem | Fix |
|--------------|---------|-----|
| `chat.getMessages` | All admins, all pages, panel often closed | `isAdmin && isOpen ? {} : "skip"` |
| `wrappedStats.calculateAllStats` | Public traffic triggers full recompute subscription | Serve precomputed snapshot only |
| `getAcceptedMembers` | Returns admin-weight payload to anonymous users | Slim public query |
| `data-cache-status` (9 queries) | All active on one admin page | OK for admin-only; consider single combined query to reduce subscription count |
| `member-management` (5 lists) | All tabs load all lists simultaneously | Tab-gated skip per active tab |

### Pages with excessive subscription count (>5)

| Page | Count | Notes |
|------|-------|-------|
| `admin/data-cache-status` | 9 | Intentional split reads |
| `admin/member-management` | 5 | At threshold |
| `admin/event-bans` | 5 | Via event-bans-manager |
| `admin/in-game-earnings` | 4–5 | Near threshold |
| `admin/uploads` (composed) | 4–5 | Yunite + import history |
| Player profile ZBD tab | 5 | When tab active |

### Components subscribing multiple times (same query)

| Pattern | Effective subs | Notes |
|---------|----------------|-------|
| `events-manager.tsx` ×3 `getAllEvents` | 1 (deduped) | Code smell; lift to page prop |
| `in-game-earnings` ×2 `getLatestFetchJob` | 1 (deduped) | Consolidate components |
| `getCurrentUser` ×3 components | 1 (deduped) | OK |

### Invalidation amplification

Writes to these tables invalidate many subscribers:

- **`players`** — home, member mgmt, all admin player lists, profiles, rankings caches
- **`events`** — events page, all event managers, accepted members activity check
- **`chatMessages`** — all open admin chat subscriptions on every message
- **`thirdPartyResults` / `matchPlayerStats`** — profile tabs, analytics (if subscribed)

**Recommendation:** Isolate frequently-updated fields (e.g. chat, job progress) from wide-read documents; use separate tables (already done for caches — extend pattern).

---

## Chat System Audit

### Current architecture

```
AdminChatWidget (global)
  └─ useQuery(chat.getMessages)     ← reactive, always on for admins
       └─ convex/chat.ts
            └─ chatMessages table
                 └─ .order("desc").take(50)
```

### Message loading strategy

- **Initial load:** 50 most recent messages, reversed to chronological order.
- **Realtime:** New messages via Convex subscription invalidation on insert.
- **History:** No "load older" — 50-message cap only.

### Issues

1. **Subscription scope:** Every admin on every page subscribes even when chat is closed.
2. **No pagination:** Cannot scroll beyond 50 messages.
3. **Unbounded table:** No retention/TTL; all messages stored forever.
4. **No read receipts:** `unreadCount` hardcoded to 0.
5. **Invalidation cost:** Each message insert re-runs query for all subscribed admins.

### Scalable approach (recommended)

1. **Lazy subscription:** Subscribe only when panel opens; unsubscribe on close.
2. **Cursor pagination:** `usePaginatedQuery` with `_creationTime` cursor for history.
3. **Retention:** Cron to archive/delete messages older than 90 days (or keep last 500).
4. **Optional:** Separate `chatPresence` from messages to reduce write contention.
5. **Optional:** For low-traffic admin chat, consider non-reactive `useConvex().query()` with 10s poll when open (trade freshness for subscription count) — only if admin count grows.

**Est. savings:** **~100%** chat-related subscription cost when panel closed (majority of admin session time).

---

## Dashboard Pages Audit

### Home dashboard (`/` — `Index.tsx`)

| Query | Purpose | Issue | Recommendation |
|-------|---------|-------|----------------|
| `memberManagement.getAcceptedMembers` | Public member directory | Heavy backend; full player docs | Slim cache + denormalized `isActive` |
| `useUserRole` | Staff UI affordances | OK | — |

**Defer:** None on public page except splitting staff-only fields server-side.

**Combine:** Single public digest query replacing accepted members enrichment.

### Admin dashboard

- `/admin` redirects to `member-management` (no dedicated dashboard).
- `admin/stats.tsx` is static links — **0 Convex queries** (good).

### Analytics pages

| Page | Queries | Combine? | Defer? | Cache? |
|------|---------|----------|--------|--------|
| `tier-re-evaluation` | Cached tier data + optional `getPlayers` | Merge TC/DCA toggle into cache fields | Skip `getPlayers` unless toggle on | Already cached — enforce only cached path |
| `holistic-score-stats` | Same cache + optional players | Share hook/context with tier-re-eval page | Tab-gated | sessionStorage for cache |
| `leaderboard-stats` | `getLeaderboardStats` | Precompute per-import digest | Admin-only OK | New cache table |
| `tier-impact` | `getTierImpactStats` | Share player/import maps with leaderboard stats | OK | Cache with import sync |
| `average-stats` | `aggregateStatsCache` | — | — | **Already optimal** |
| `player-comparison` | 2 queries, second conditional | OK | Second query already skipped | — |
| `player-earnings` | Single query | OK | — | — |
| `data-cache-status` | 9 queries | Could combine to 1–2 admin diagnostics query | Page-load only | Point-in-time read OK |
| `upset-kills` cluster | Stats cache + paginated lists | Good pattern | H2H uses imperative query (good) | Stats cache exists |
| `in-game-earnings` | 4–5 queries | Merge job status queries | — | Osirion tournament cache exists |
| `wrapped` (public) | Content + **live calculateAllStats** | Precompute on publish | **Remove live stats on public** | Store on `wrappedContent` |

---

## Discord Integration Audit

### API usage map

| Operation | Source | Frequency | Convex cost |
|-----------|--------|-----------|---------------|
| List guild members | `discord/sync.ts` | Daily cron + manual | 1 Discord req/1000 members + **N mutations** |
| List scheduled events | `discord/eventSync.ts` | Daily cron | 1 Discord req |
| Sync single member | HTTP `/api/discord/sync-member` | Bot webhook per join/update | 1 mutation (`upsertDiscordMember`) |
| Archive missing | HTTP `/api/discord/archive-missing` | After full member sync | 1 mutation (full players scan) |
| Member lookup for API | HTTP `/api/member` | Bot per verification | 1 query (indexed + fallback full scan) |
| Role sync polling | HTTP `/api/discord/pending-role-syncs` | Bot poll loop | Full `eventBans` scan per poll |
| Role removal polling | HTTP `/api/discord/pending-role-removals` | Bot poll loop | Full `eventBans` scan per poll |
| Admin role tools | `discord/roles.ts` | Manual | Per-member Discord API |

### Member sync flow (critical path)

```
Daily cron (05:00 UTC)
  → fetchAndSyncDiscordMembers (action)
       → Discord API: paginated members
       → For each member: upsertPlayer mutation
            → Up to 4× players.collect() for matching
  → archiveMissingPlayers (full players collect)
```

**At 500 members:** ~2000 full player table reads per daily sync (before writes).

### Role sync / verification

- Ban roles: Sheet sync (daily) + bot polling for pending syncs/removals.
- Tier roles: Stored on player during sync; tier mismatch tools compare Discord vs DB.
- Verification API (`/api/member`): Lightweight tier/gender lookup for bot.

### Polling vs event-driven

| Current poll | Replacement |
|--------------|-------------|
| Bot polls `pending-role-syncs` | Push: mutation enqueues to `pendingRoleRemovals` (exists) + webhook/cron ack; or Convex scheduled function after sheet sync |
| Bot polls `pending-role-removals` | Same; filter indexed queue instead of scanning all bans |
| Daily member sync | Keep daily; add incremental webhook for join/update (partially exists via `/api/discord/sync-member`) |
| Daily event sync | Keep daily; optional Discord gateway events if bot already connected |

### Missing caches

- Discord guild roles list (changes rarely).
- Member nickname/avatar between daily syncs (webhook partial coverage).
- Alternate Discord ID → player map (forces full scan today).

### Recommendations

1. **Fix `upsertPlayer` matching** — single indexed lookup pass; load players-with-placeholder-IDs once per sync batch, not per member.
2. **Index-backed pending role queues** — query `syncedToDiscord=false` via index instead of full collect.
3. **Reduce bot poll frequency** — event-driven enqueue on ban create/end mutations.
4. **Batch member sync** — one mutation processing 50 members with shared in-memory player map.

**Est. savings:** Discord DB reads during sync **90%+**; bot poll queries **70–90%**.

---

## Background Tasks Audit

### Registered crons (`convex/crons.ts`)

| Job | Schedule (UTC) | Function | Cost driver |
|-----|----------------|----------|-------------|
| Tournament scan cache | 04:00 daily | `inGameEarnings.actions.refreshTournamentCache` | External Osirion API |
| Discord member sync | 05:00 daily | `discord.sync.syncDiscordMembersInternal` | N mutations × player scans |
| Discord event sync | 06:00 daily | `discord.eventSync.syncDiscordEventsInternal` | Events table scan + Discord API |
| Event bans sheet sync | 07:00 daily | `eventBans.sync.syncEventBansInternal` | Google Sheets + ban upserts |

### Self-scheduling jobs

| Job | Trigger | Pattern |
|-----|---------|---------|
| Power score bulk update | Admin | `scheduler.runAfter(1000ms)` per player |
| In-game earnings bulk fetch | Admin | `processBatch` self-reschedules |
| Kill events backfill | Admin | `backfillKillEventsBatch` self-schedules |
| Tier re-eval batched rebuild | Admin | Batch mutations via `tierReEvaluationBatched` |
| Top-five cache rebuild | After PR update / admin | Scheduled from rankings |

### Polling loops (external)

| Poller | Target | Issue |
|--------|--------|-------|
| Discord bot | `/api/discord/pending-role-syncs` | Full table scan |
| Discord bot | `/api/discord/pending-role-removals` | Full table scan |

### Event-driven replacements

| Scheduled/polling task | Event-driven alternative |
|------------------------|-------------------------|
| Recompute `isActive` on home page query | Mutation after import sync completes |
| Daily full member sync for nicknames | Webhook on `sync-member` (exists) + weekly full reconcile |
| `calculateAllStats` on page view | Compute on wrapped publish |
| Aggregate stats on admin view | Already cached — ensure no live path |
| Bot role poll | Mutation enqueue on ban create/update/end |

---

## Images and Assets

### Current state

| Asset type | Location | Notes |
|------------|----------|-------|
| PWA icons | `/icon/icon-192.png`, `/icon/icon-512.png` | Cached by service worker |
| Event images | Convex `_storage` via `events.image` | Signed URLs generated in `getAllEvents` |
| Discord avatars | `players.avatarUrl` (Discord CDN) | Cached URL on player doc; re-fetched on sync |
| Wrapped sponsor logos | `wrappedContent.sponsors.logoUrl` | External URLs |
| App static assets | Vite bundle | Hashed filenames — good for long cache |

### Issues

- **No image optimization pipeline** — event images uploaded as-is to Convex storage.
- **All event URLs resolved eagerly** in `getAllEvents` even when image not shown.
- **Service worker** uses network-first for all same-origin assets — misses opportunity for immutable chunk caching.
- **Discord avatars** — member list may load hundreds of avatars simultaneously without lazy loading audit (verify in UI components).

### Recommendations

1. Lazy-load avatars and event images (`loading="lazy"`, intersection observer).
2. Resolve storage URLs only for events that display images (separate query or optional flag).
3. Client-side resize on upload (max 1200px) before Convex storage upload.
4. Extend SW cache config for `/assets/*` with cache-first strategy.
5. Consider WebP conversion for event banners.

**Est. savings:** **20–40%** page-load bandwidth on events/home pages; reduced Convex storage read bandwidth.

---

## Scalability Estimates

Assumptions: ~300 accepted members today, ~50 events, growing match data from Yunite imports. Convex free tier: ~1M function calls/month, bandwidth and storage limits vary.

### Current usage profile (estimated)

| Category | Share of usage | Drivers |
|----------|----------------|---------|
| Reactive query re-runs | **40–50%** | Home page, admin lists, chat, events page |
| Daily crons | **15–25%** | Discord sync (dominant), bans, Osirion cache |
| Admin analytics (on visit) | **10–20%** | Leaderboard stats, tier cache, cache status |
| Mutations / sync writes | **15–25%** | Yunite imports, member sync, chat, admin edits |
| HTTP / bot endpoints | **5–10%** | Role polling, member webhook, verification API |

### Biggest usage hotspots

1. Public home — `getAcceptedMembers`
2. Discord daily sync — `upsertPlayer` × members
3. `matchKillEvents` / `matchPlayerStats` table size
4. Public wrapped — `calculateAllStats`
5. Admin global chat subscription
6. Bot ban polling — full `eventBans` scans

### What breaks first at scale

#### ~100 concurrent users (community size, not simultaneous)

| Failure mode | Cause |
|--------------|-------|
| Slow home page load | `getAcceptedMembers` N+1 with 100+ members |
| Discord sync timeout | 100+ members × 4 player scans |
| Free tier function calls | Moderate admin team + public traffic |

#### ~1,000 members / large match history

| Failure mode | Cause |
|--------------|-------|
| **`getAcceptedMembers` query timeout** | 1000× matchPlayerStats checks + full import scan |
| **`matchKillEvents` admin queries fail** | Full `.collect()` in rebuild/dedup |
| **Storage limit approached** | Kill events + match stats growth |
| **Subscription bandwidth** | Many admins × chat + member list invalidations |
| **Discord sync** | Likely exceeds mutation time limits without batching |

#### ~10,000 members / millions of kill events

| Failure mode | Cause |
|--------------|-------|
| **Free tier exhausted** | Reactive queries + sync + analytics |
| **Function timeouts widespread** | Any unbounded `.collect()` on large tables |
| **`thirdPartyResults` scans** | Wrapped stats, leaderboard analytics |
| **Write contention** | Bulk sync + concurrent admin imports |
| **Database size** | Match-level data dominates |

---

## Existing Cache Infrastructure (reference)

| Cache | Location | Refresh |
|-------|----------|---------|
| `aggregateStatsCache` | Table | Admin rebuild |
| `tierReEvaluationCache` + `tierMediansCache` | Tables | Admin batched rebuild |
| `upsetKillsStatsCache` | Table | Admin rebuild |
| `tournamentScanCache` | Table | Daily cron |
| `players.rankingStats`, `powerScore` | Player doc | PR recalc scheduler |
| `players.contributionScore` | Player doc | Yunite recalc |
| `players.topFiveCache`, `dcaCache` | Player doc | Admin/cache rebuild |
| `thirdPartyImports.dataFullyCached` | Import flag | Yunite sync |

---

## Appendix: Paginated query usage (frontend)

Only **3** surfaces use `usePaginatedQuery`:

1. `admin/upset-kills.tsx` → `upsetKills.getUpsetKills`
2. `admin/upset-kills-eliminations.tsx` → `upsetKills.getAllEliminations`
3. `admin/_components/import-third-party.tsx` → `thirdPartyQueries.getImportHistory`

All other lists use unbounded `useQuery` + `.collect()` on the backend.

---

## Appendix: Convex `.collect()` prevalence

**~200+ `.collect()` calls** across 50+ Convex files. Highest concentration:

- `players.ts` (22)
- `thirdPartyMutations.ts` (17)
- `memberManagement.ts` (17)
- `dataBackup.ts` (16)
- `upsetKills.ts` (14)
- `discord.ts` (14)
- `playerEarnings.ts` (13)
- `wrappedStats.ts` / `wrapped.ts` (11 each)

Not all are hot-path — many are admin-only mutations, migrations, or one-time tools. Priority is **reactive queries** and **crons** first.
