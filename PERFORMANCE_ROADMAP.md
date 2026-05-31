# Performance Roadmap

**Date:** 2026-05-31  
**Companion doc:** [PERFORMANCE_AND_USAGE_AUDIT.md](./PERFORMANCE_AND_USAGE_AUDIT.md)  
**Goal:** Minimize Convex usage, minimize Discord API usage, reduce page load times, reduce unnecessary subscriptions, extend free-tier viability.

Priorities:

- **P1** — Immediate usage reduction; high ROI, low–medium effort; do first.
- **P2** — Important scalability improvements; medium effort; prevents breakage at 500–1k members.
- **P3** — Future optimization; larger refactors or diminishing returns.

---

## P1 — Immediate usage reduction

### P1.1 Fix public home page query (`getAcceptedMembers`)

**Problem:** Highest-traffic page runs full `events` + `thirdPartyImports` scan and N×(`manualScores` + `matchPlayerStats`) per member.

**Actions:**
1. Add `players.isRecentlyActive` boolean updated by cron or post-import mutation.
2. Create `getPublicMemberDirectory` returning slim fields only (no admin caches/comments).
3. Optionally split gender into denormalized public field if needed for filters.

**Est. impact:** **70–90%** read reduction on home page; largest single win for free-tier longevity.

**Effort:** Medium (1–2 days)

---

### P1.2 Precompute wrapped stats; remove live `calculateAllStats` on public page

**Problem:** `/2025-wrapped` subscribes to `wrappedStats.calculateAllStats`, which full-scans `eventResults`, `thirdPartyResults`, `players`, `playerEarnings` per visitor.

**Actions:**
1. Add `computedSections` (or similar) to `wrappedContent` schema.
2. Compute on publish / admin "Recompute stats" mutation.
3. Public page reads published snapshot only; preview page can trigger one-shot action.

**Est. impact:** **95%+** wrapped page query cost eliminated for public traffic.

**Effort:** Medium (1–2 days)

---

### P1.3 Lazy-subscribe admin chat

**Problem:** `AdminChatWidget` subscribes to `chat.getMessages` on every admin page even when closed.

**Actions:**
1. Change to `useQuery(..., isAdmin && isOpen ? {} : "skip")`.
2. Optional: load history via `usePaginatedQuery` when opened.

**Est. impact:** **~100%** chat subscription cost during typical admin browsing.

**Effort:** Small (< 1 hour)

---

### P1.4 Fix Discord `upsertPlayer` full-table scans

**Problem:** Up to 4× `players.collect()` per guild member during daily sync and bot webhooks.

**Actions:**
1. Load placeholder-ID players once per sync batch into a Map passed to mutation.
2. Use indexed lookups for primary/alternate Discord IDs.
3. Consider denormalized `alternateDiscordIdIndex` table for reverse lookups.

**Est. impact:** **90%+** Convex reads during daily Discord sync.

**Effort:** Medium (1–2 days)

---

### P1.5 Gate dialog and global queries with `"skip"`

**Problem:** Dialogs fetch full player lists when mounted but closed; `UsernameSetupDialog` calls `getCurrentUser` without auth skip.

**Actions:**
1. `UsernameSetupDialog`: skip `getCurrentUser` when `!isAuthenticated`.
2. `score-player-dialog`, `edit-member-status-dialog`, `edit-player-dialog`: skip until `open`.
3. Member management: tab-gated queries (only load active tab's list).

**Est. impact:** **20–40%** fewer active subscriptions on admin pages.

**Effort:** Small (half day)

---

### P1.6 Index-backed event ban bot polling

**Problem:** `getPendingRoleSyncs` / `getPendingRoleRemovals` full-scan `eventBans` on every bot poll.

**Actions:**
1. Add indexes: `by_synced_to_discord`, `by_role_removed_from_discord` (or boolean + index).
2. Query pending rows only.
3. Enqueue to `pendingRoleRemovals` on ban delete (partially exists).

**Est. impact:** **70–90%** per poll; scales with ban count.

**Effort:** Small–medium (1 day)

---

### P1.7 Use membership index in player list queries

**Problem:** `getPlayers`, `getArchivedPlayers`, `getRejectedMembers` full-scan `players`.

**Actions:**
1. Switch to `by_membership_status` / `by_status` indexes consistently.
2. Remove redundant filters in JS where index covers them.

**Est. impact:** **40–60%** on admin player list queries.

**Effort:** Small (half day)

---

## P2 — Important scalability improvements

### P2.1 Paginate admin heavy lists

**Targets:**
- `players.getAllPlayersAdmin` (unmatched players)
- `inGameEarnings.getAllInGameEarnings`
- `support.getArchivedTickets`
- `audit.getAuditLogs` (cursor pagination)
- `eventBans.getEndedBans`

**Pattern:** `paginationOptsValidator` + `usePaginatedQuery` (follow upset-kills model).

**Est. impact:** Prevents admin page timeouts at 500+ records per list.

**Effort:** Medium (2–3 days across surfaces)

---

### P2.2 Denormalize admin player list enrichments

**Problem:** `getAllPlayersAdmin` runs 3N result queries per player.

**Actions:**
1. Store `eventsPlayedCount`, `lastEventDate` on player doc (updated on result insert).
2. Return digest rows from list query; load details on drill-down.

**Est. impact:** **80–95%** unmatched-players admin query cost.

**Effort:** Medium (2 days)

---

### P2.3 Fix `getPlayerDuoPerformance` N+1

**Problem:** One `by_match` query per match for duo lookup.

**Actions:**
1. Single query for all player matches.
2. Group by `(importId, sessionId, teamId)` in handler.

**Est. impact:** **50–80%** player profile ZBD tab load time.

**Effort:** Medium (1 day)

---

### P2.4 Cache leaderboard / tier-impact analytics

**Problem:** `getLeaderboardStats` and `getTierImpactStats` full-scan players, imports, and per-import results on every admin visit.

**Actions:**
1. New `leaderboardStatsCache` table (single doc or per-import digest).
2. Rebuild on import sync completion + admin manual trigger.

**Est. impact:** **90%+** analytics page reads after cache warm.

**Effort:** Medium (2 days)

---

### P2.5 Enforce cached-only tier re-evaluation UI path

**Problem:** Live `getTierReEvaluationData` still exists and can be invoked; cache query returns up to 500 large docs.

**Actions:**
1. Remove/guard live query from any UI subscription.
2. Add tier filter args to cached query to reduce payload.
3. Consolidate tier-re-eval, holistic-stats, features into shared data hook.

**Est. impact:** **30–50%** admin analytics navigation cost.

**Effort:** Small–medium (1 day)

---

### P2.6 Player profile tab lazy loading

**Problem:** ZBD tab runs 5 parallel queries immediately when tab opens (acceptable) but profile shell loads before tab selection.

**Actions:**
1. Mount ZBD tab queries only when tab is active.
2. Merge `getPlayerComprehensiveStats` + `getPlayerAllEvents` where overlap exists.

**Est. impact:** **60–80%** profile queries for users who don't open ZBD tab.

**Effort:** Small (half day)

---

### P2.7 Paginate / bound `matchKillEvents` maintenance queries

**Problem:** `rebuildStatsCache`, `removeDuplicateKillEvents` use full `.collect()`.

**Actions:**
1. Use paginated aggregation (pattern from `cacheStatus.getMatchStatsCount`).
2. Store counts incrementally on insert.

**Est. impact:** Prevents admin maintenance failures as kill events exceed ~100k rows.

**Effort:** Medium (1–2 days)

---

### P2.8 Batch Discord member sync mutations

**Problem:** One mutation per member sequentially.

**Actions:**
1. `syncMembersBatch` internal mutation processing 25–50 members with shared player map.
2. Action loops batches with rate limiting.

**Est. impact:** **50–70%** function call overhead; faster sync completion.

**Effort:** Medium (1–2 days)

---

### P2.9 Slim public events query

**Problem:** Public events page uses `getAllEvents` with storage URL resolution for all events.

**Actions:**
1. `getPublicEvents` — date, name, type, status, slug; no admin fields.
2. Resolve image URLs only for visible/upcoming events or on detail page.

**Est. impact:** **30–50%** events page payload and read cost.

**Effort:** Small–medium (1 day)

---

### P2.10 Chat message retention

**Problem:** `chatMessages` grows unbounded.

**Actions:**
1. Cron: delete/archive beyond last 500 messages or 90 days.
2. Add pagination for history in widget.

**Est. impact:** Long-term storage and query stability.

**Effort:** Small (half day)

---

## P3 — Future optimization

### P3.1 Rankings export reads cached fields only

**Problem:** `rankings.getPlayerRankings` recomputes despite `powerScore`/`rankingStats`/`dcaCache`/`topFiveCache` on player docs.

**Actions:** Refactor to sort/filter cached fields; live `getPlayerEvents` only in single-player refresh mutation.

**Est. impact:** Google Sheets export and any future rankings UI — **80%+** read reduction.

**Effort:** Large (3–5 days)

---

### P3.2 Digest tables for match-level analytics

**Problem:** `matchKillEvents`, `matchPlayerStats`, `thirdPartyResults` will dominate storage and scan cost at 10k+ members.

**Actions:**
1. Per-player upset kill summaries (partially in cache).
2. Per-import analytics digest on `thirdPartyImports`.
3. Archive raw kill events to cold storage after N months.

**Est. impact:** Enables 10k+ scale; **critical** before match data hits millions of rows.

**Effort:** Large (1–2 weeks)

---

### P3.3 Replace bot polling with event-driven role queue

**Problem:** Bot polls HTTP endpoints on interval.

**Actions:**
1. Mutations enqueue role work to indexed queue tables.
2. Bot subscribes via long-poll with cursor or receives webhook from Convex HTTP action on enqueue.
3. Remove full-table scans entirely.

**Est. impact:** **80%+** bot-triggered query reduction.

**Effort:** Medium (requires bot code changes)

---

### P3.4 Consolidate admin cache status queries

**Problem:** 9 separate subscriptions on data-cache-status page.

**Actions:** Single `getCacheStatusSummary` returning all counts/metadata (deprecated monolith exists — refactor and optimize with pagination).

**Est. impact:** Lower subscription count; marginal read savings if counts use paginated scans.

**Effort:** Small–medium

---

### P3.5 Image pipeline and CDN caching

**Actions:**
1. Client resize before Convex upload.
2. SW cache-first for Vite assets.
3. Lazy-load avatars and event images site-wide.

**Est. impact:** **20–40%** bandwidth; better LCP on home/events.

**Effort:** Medium

---

### P3.6 Remove or repurpose TanStack Query provider

**Problem:** Unused dependency and provider overhead.

**Actions:** Use for imperative searches with `staleTime`, or remove provider.

**Est. impact:** Minor bundle size; clearer data layer.

**Effort:** Small

---

### P3.7 Composite indexes and schema additions

**Actions:**
- `thirdPartyResults.by_epicUsername`
- `applications.by_playerId`
- `players.by_status_and_hasMatchData`
- `eventResults.by_eventId`

**Est. impact:** Enables P1/P2 query fixes; **10–30%** on affected paths.

**Effort:** Small per index (migration-safe widen-only)

---

### P3.8 Point-in-time reads for low-freshness admin dashboards

**Problem:** Admin diagnostics don't need realtime invalidation on every player write.

**Actions:** Use `useConvex().query()` with manual refresh button for cache-status, backup summaries, earnings job progress.

**Est. impact:** **30–50%** subscription invalidation on admin tooling pages.

**Effort:** Medium

---

## Recommended execution order

```
Week 1 (P1 quick wins + highest ROI)
├── P1.3  Chat lazy subscribe
├── P1.5  Dialog/global skip gates
├── P1.7  Player list indexes
├── P1.6  Ban polling indexes
└── P1.2  Wrapped precompute (start)

Week 2 (P1 structural)
├── P1.1  Public home directory cache
├── P1.2  Wrapped precompute (finish)
└── P1.4  Discord upsertPlayer fix

Week 3–4 (P2 scalability)
├── P2.1  Admin pagination
├── P2.4  Leaderboard stats cache
├── P2.3  Duo performance N+1
├── P2.6  Profile tab lazy load
└── P2.9  Public events slim query

Ongoing / as data grows (P2–P3)
├── P2.7  Kill events paginated maintenance
├── P2.8  Batch Discord sync
├── P3.2  Match data digest tables (before 1M kill events)
└── P3.1  Rankings cached-only refactor
```

---

## Success metrics

Track before/after each phase (Convex dashboard → Insights):

| Metric | Target after P1 | Target after P2 |
|--------|-----------------|-----------------|
| Function calls / day | −30% | −50% |
| Documents read / query (p95) | −50% on home, wrapped, chat | −70% on admin lists |
| Active subscriptions (admin session) | −25% | −40% |
| Daily cron execution time | Discord sync −80% reads | All crons stable <30s |
| Home page TTFB (subjective) | Noticeably faster | Sub-second cached directory |

Run `npx convex insights --details` (or `npx -y convex@latest insights --details`) before starting and after each milestone.

---

## Out of scope (this roadmap)

- Code changes (audit-only pass produced these docs).
- Convex plan upgrade decision — roadmap aims to delay need for paid tier.
- Yunite/Osirion external API quota optimization (separate from Convex; tournament cache already exists).
- Database migration of historical match data to external warehouse.

---

## Quick reference: P1 checklist

- [ ] P1.1 Public member directory cache + `isRecentlyActive`
- [ ] P1.2 Wrapped stats precompute on publish
- [ ] P1.3 Chat subscribe only when open
- [ ] P1.4 Discord sync batch matching (no per-member full scan)
- [ ] P1.5 Dialog skip + username auth skip
- [ ] P1.6 Indexed ban role polling
- [ ] P1.7 Player queries use membership index
