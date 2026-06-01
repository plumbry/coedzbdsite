# Cost and Usage Estimate (Post-Migration)

**Date:** 2026-06-01  
**Target stack:** Cloudflare Pages (frontend) · Convex (backend + database) · Clerk (auth)  
**Basis:** Codebase query/cron/sync patterns, internal audits (`PERFORMANCE_AND_USAGE_AUDIT.md`, `PROCESS_OPERATIONS_AUDIT.md`, `CLERK_MIGRATION_IMPLEMENTATION.md`), and published vendor pricing (links below).  
**Note:** A live `npx convex run cacheStatus:*` against the connected deployment returned **zero rows** (empty dev project). Replace ranges below with **Admin → Data cache status** or `cacheStatus:getCacheStatus` on **production** when available.

---

## Executive summary

| Service | Expected monthly cost (steady state) | Free tier fit |
|---------|-----------------------------------|---------------|
| **Cloudflare Pages** | **$0** | Excellent — static Vite SPA, low build count |
| **Clerk** | **$0** | Excellent — ~6 staff MRU today; public visitors do not use Clerk |
| **Convex** | **$0** (low/medium traffic) to **$25–80+** (heavy admin + bot polling + growth) | **Tight** — function calls are the first limit you are likely to hit |

**Bottom line:** Migration does not materially change Convex usage (backend stays on Convex). Cloudflare Pages should be cheaper than typical metered static hosts. Clerk is effectively free at current staff scale. **Convex function calls** and, over time, **database storage** (match/kill data) are the constraints worth optimizing before anything else.

---

## 1. Current baseline (estimated)

### 1.1 Users and auth

| Metric | Estimate | Source |
|--------|----------|--------|
| Staff `users` rows (Clerk/Hercules) | **6** (3 admin, 1 event_mod, remainder viewer/other) | `CLERK_MIGRATION_IMPLEMENTATION.md` §7 |
| Monthly retained users (Clerk) | **≤10** (staff logins only) | Same; no public sign-in on member directory |
| Public site visitors | **~100–400 / month** (community directory, events, wrapped) | Typical small Discord community; not instrumented in repo |
| Records referencing `users._id` | **~6,300+** FK references | Migration doc (audit logs, etc.) — not total DB size |

Clerk bills **monthly retained users (MRU)** per app, not page views. Your community browses the site **without** Clerk accounts; only staff authenticate.

### 1.2 Players and membership

| Metric | Estimate | Source |
|--------|----------|--------|
| Accepted members (public directory) | **~250–350** (planning figure **~300**) | `PERFORMANCE_AND_USAGE_AUDIT.md` scalability section |
| Total `players` documents | **~500–1,500** | Audit ranges (~500–2k); includes `discord_member`, archived, rejected |
| Discord guild size (sync target) | **~400–700** humans | Audit uses **500** for sync math; batched 25/cron |
| Pending applications | **~10–50** | Audit |

Home page now uses `getPublicMemberDirectory` (slim fields + `isRecentlyActive` cache) instead of the older heavy `getAcceptedMembers` path — **lower read cost than the May 2026 audit’s worst case**, but still **O(n) manualScores lookups** per accepted member (~300/query execution).

### 1.3 Events and imports

| Metric | Estimate | Source |
|--------|----------|--------|
| Calendar `events` | **~50–150** | Audit |
| `thirdPartyImports` (CSV + Yunite) | **~80–200** cumulative | Audit (“~100–500 events/imports” band); manual Yunite only |
| `thirdPartyResults` | **~8,000–25,000** | ~100–150 imports × ~80–120 rows/import |
| Imports with match data synced | **subset** — admin-triggered | `matchDataSynced` on import; backfill batches of 3–5 |
| Scrim / scrim-series events | **~10–50** | Audit |

**Import activity pattern (typical month):**

- **Yunite:** Manual `syncYuniteTournaments` + per-import `syncTournamentMatchData` (no import cron). Spikes during tournament weeks.
- **CSV:** Ad hoc; `leaderboardId` includes timestamp (not idempotent without `replaceCSVData`).
- **Backfills:** `backfillKillEventsBatch`, `backfillAllMatchStats`, `fixPlacementsBatch` — scheduled/admin bursts, not daily.
- **Google Sheets:** Daily **event bans** cron; applications/exports manual.

### 1.4 Match analytics (largest storage driver)

| Table | Estimate | Notes |
|-------|----------|--------|
| `matchPlayerStats` | **~20,000–80,000** rows | Per player × match × import |
| `matchKillEvents` | **~50,000–300,000+** rows | **Largest table** per audit; ~300–500 B/row with indexes |
| `eventResults` (legacy/manual) | **~1,000–5,000** | Smaller than third-party path |
| Cache tables | **~500–2,000** tier re-eval rows | Up to **500** large docs per admin subscription |

**Rough database size (order of magnitude):**

| Component | Low | Medium | High |
|-----------|-----|--------|------|
| Players + scores + events + imports | ~15 MB | ~40 MB | ~80 MB |
| `matchKillEvents` + `matchPlayerStats` | ~30 MB | ~120 MB | **~350 MB+** |
| **Total DB (Convex 0.5 GB free cap)** | **~50 MB** | **~160 MB** | **~430 MB** |

File storage (event images, backups): typically **&lt;200 MB** unless large backups retained in Convex storage.

### 1.5 Discord sync activity

| Job | Schedule (UTC) | Convex cost driver |
|-----|----------------|-------------------|
| `refreshRecentlyActiveFlags` | Daily 03:30 | Accepted members × up to 30 `matchPlayerStats` reads + patches |
| `syncDiscordMembersInternal` | Daily 05:00 | Guild fetch + **batches of 25** → `syncDiscordMembersBatch` (**1× `players.collect()` per batch**) |
| `syncDiscordEventsInternal` | Daily 06:00 | Discord API + event upserts |
| `syncEventBansInternal` | Daily 07:00 | Google Sheets + ban upserts |
| `refreshTournamentCache` | Daily 04:00 | External Osirion API (action compute) |
| Bot HTTP | **Deployment-dependent** | `pending-role-syncs` + `pending-role-removals` + `sync-member` webhooks |

**Daily member sync (improved vs audit):** ~500 members ÷ 25 = **20 batches/day × 1 full player scan** ≈ **20 player table reads/day** (not ~2,000). Still significant write/mutation volume.

**Legacy `discord-auto-sync.js`:** If still deployed, **full guild sync every 30 minutes** → redundant with Convex daily cron and can multiply HTTP/mutation load. Prefer webhook + daily cron only.

### 1.6 Reactive queries (frontend)

- **~150+** `useQuery` / `usePaginatedQuery` call sites across admin and public UI.
- Only **3** paginated lists (`upset-kills`, eliminations, import history); most admin lists use full `.collect()` on the backend.
- Global **`AdminChatWidget`** subscribes to `chat.getMessages` on every admin route unless gated.
- Public **`/2025-wrapped`** can still hit live `wrappedStats.calculateAllStats` (full-table scans) if published stats are not precomputed.

---

## 2. Monthly usage model (Convex function calls)

Convex counts: client queries/mutations, **subscription re-runs**, scheduled jobs, HTTP actions, and file access. [Convex limits](https://docs.convex.dev/production/state/limits).

### 2.1 Scenario assumptions

| Scenario | Public sessions/mo | Staff admin hours/mo | Bot poll interval | Extra import/backfill days/mo |
|----------|------------------|----------------------|-------------------|-------------------------------|
| **Low** | 800 | 40 | 5 min | 2 |
| **Medium (baseline)** | 2,500 | 120 | 60 sec | 5 |
| **High** | 8,000 | 250 | 30 sec | 10 |

### 2.2 Estimated monthly function calls

| Category | Low | Medium | High | % of medium (approx.) |
|----------|-----|--------|------|------------------------|
| Public reactive queries | 80k | 220k | 650k | 38% |
| Admin reactive queries | 120k | 380k | 900k | 66% |
| Daily crons (5×30) | 25k | 45k | 70k | 8% |
| Discord bot HTTP polls | 35k | **175k** | **350k** | **30%** |
| Import/match sync actions | 20k | 80k | 200k | 14% |
| Clerk `updateCurrentUser` / auth | &lt;1k | &lt;2k | &lt;5k | &lt;1% |
| **Total** | **~280k** | **~900k** | **~2.2M** | |

**Medium scenario (~900k/month)** aligns with staying near but under the **1M free-tier cap** if bot polling is not aggressive. **High scenario** exceeds free tier primarily due to bot polling + admin traffic.

> **Verify:** Convex Dashboard → Usage → Function calls (30-day). Adjust bot poll interval in your Discord bot repo (not fully specified in this app repo).

### 2.3 Action compute (Yunite / Osirion)

| Workload | Frequency | Free tier |
|----------|-----------|-----------|
| `refreshTournamentCache` | Daily | Included in **20 GB-hours/mo** |
| `syncTournamentMatchData` / backfill batches | Bursty | Usually fine at medium import volume; spikes on full backfill |

Heavy match backfills (hundreds of imports × external API) can approach action limits before function-call limits — monitor during bulk operations.

### 2.4 Database bandwidth & egress

- Large query payloads: `getCachedTierReEvaluationData` (up to **500** docs), `getAcceptedMembers` on admin, leaderboard stats.
- Public directory slim query reduces egress vs full player docs.
- **Free tier:** **1 GB/month** data egress — unlikely to hit before function calls unless serving large files or huge subscriptions to many clients.

---

## 3. Service-by-service cost estimate

### 3.1 Cloudflare Pages

**Pricing:** [Cloudflare Pages](https://pages.cloudflare.com/) — Free: **500 builds/month**, **unlimited bandwidth**, unlimited static requests.

| Item | Estimate | Cost |
|------|----------|------|
| Production deploys | 10–40 / month | $0 |
| Preview deploys (PRs) | 20–80 / month | $0 (within 500 total) |
| Bandwidth | Community traffic | $0 |
| Build minutes | Vite build ~2–5 min | $0 |

**Risk:** Hitting **500 builds/month** only with very active CI (many PR previews). **Not a concern** for normal staff workflow.

**Migration note:** SPA + `public/_redirects` for client routing; no SSR. Convex WebSocket URL via env at build time.

### 3.2 Clerk

**Pricing:** [Clerk pricing](https://clerk.com/pricing) — Hobby **$0**, **50,000 MRU/app** (2026), 3 dashboard seats.

| Item | Estimate | Cost |
|------|----------|------|
| Staff MRU | 6–10 | $0 |
| Community MRU | 0 (no public Clerk sign-up) | $0 |
| Discord OAuth | Included on Hobby | $0 |
| MFA / org features | Not required at current scale | $0 |

**Risk:** None at current scale. If you later add **public** Clerk sign-in for members, MRU could grow — still far below 50k for a single community.

**Caveat:** Hobby has **7-day max session lifetime** — staff re-auth weekly (operational, not a direct dollar cost).

### 3.3 Convex

**Pricing:** [Convex limits](https://docs.convex.dev/production/state/limits) — Free: **1M function calls**, **0.5 GB DB**, **1 GB file storage**, **1 GB egress**, **20 GB-h action compute**.

| Resource | Medium estimate | Free limit | Over free? |
|----------|-----------------|------------|----------|
| Function calls | ~900k/mo | 1M | Borderline |
| Database storage | ~120–200 MB | 512 MB | No (medium) |
| Database storage | ~350+ MB (heavy kill data) | 512 MB | **Approaching** |
| File storage | ~100–300 MB | 1 GB | No |
| Egress | &lt;500 MB | 1 GB | No |
| Action compute | &lt;5 GB-h (typical) | 20 GB-h | No |

**Paid options if you exceed free:**

- **Starter (PAYG):** Same included buckets; overage ~**$2.20 / 1M** function calls, ~**$0.22/GB** DB ([limits doc](https://docs.convex.dev/production/state/limits)).
- **Professional:** **$25/seat/mo** + 25M calls included — only worth it if you need prod features (preview deployments, support) **and** high usage.

**Illustrative overage (medium + 20% calls):** ~1.08M calls → ~**$0.18–2.50**/mo on Starter metered calls only.

**Illustrative steady overage (high scenario 2.2M calls):** ~1.2M over × $2.20 ≈ **$2.60**/mo calls only (Starter); still watch storage.

---

## 4. Largest usage hotspots (ranked)

| Rank | Hotspot | Type | Why it matters |
|------|---------|------|----------------|
| 1 | **Discord bot HTTP polling** (`/api/discord/pending-role-syncs`, `pending-role-removals`) | HTTP → query | 2 endpoints × poll frequency × 30 days; indexed queries but **constant baseline** |
| 2 | **Admin reactive subscriptions** | `useQuery` | Many full-table queries; any player/import write invalidates broad subscriptions |
| 3 | **Daily `refreshRecentlyActiveFlags`** | Cron | ~300 members × 30 stats reads + import/event scan |
| 4 | **Daily Discord member sync** | Cron + mutations | ~20 full player scans + hundreds of patches |
| 5 | **`matchKillEvents` growth** | Storage + admin tools | Full `.collect()` in rebuild/dedup paths |
| 6 | **Public `/2025-wrapped`** | Query | `calculateAllStats` multi-table collect per view |
| 7 | **`AdminChatWidget` → `chat.getMessages`** | Subscription | Live on all admin pages |
| 8 | **Yunite match import / backfill** | Actions | External API + many mutations (bursty) |
| 9 | **`getLeaderboardStats` / tier re-eval cache** | Admin analytics | Full scans or 500-doc payload |
| 10 | **Legacy 30-min `discord-auto-sync.js`** | External bot | Duplicates Convex sync if both run |

---

## 5. Which free-tier limits are hit first?

### 5.1 Convex — expected order

1. **Function calls (1M/month)** — **First** under medium traffic with **≤60s** bot polling and active admins.
2. **Database storage (0.5 GB)** — **Second** if match/kill backfill continues for many seasons (not immediate at ~300 members).
3. **Action compute (20 GB-h)** — **Third**; spikes during full Yunite backfills.
4. **Data egress (1 GB)** — Unlikely before the above.
5. **File storage (1 GB)** — Unlikely unless storing full JSON backups in Convex.

### 5.2 Clerk — expected order

- **No limit concern** at 6 staff MRU.
- First future limit: **MRU** only if public Clerk auth is added for thousands of members.

### 5.3 Cloudflare Pages — expected order

- **Build count (500/mo)** before bandwidth — only with excessive preview CI.
- Otherwise **no practical free-tier risk** for this app.

---

## 6. Recommended optimizations (stay within free tiers)

Prioritized by impact vs effort (see also `PERFORMANCE_AND_USAGE_AUDIT.md`, `PERFORMANCE_ROADMAP.md`).

### P0 — High impact, low/medium effort

| Optimization | Est. savings | Notes |
|--------------|--------------|-------|
| **Increase bot poll interval** to 2–5 min when queue empty; event-driven enqueue on ban mutations | **50–85%** of bot-related calls | Biggest single lever |
| **Disable or retire `discord-auto-sync.js` 30-min loop** if Convex cron + webhooks cover sync | Avoid duplicate sync load | |
| **Gate `AdminChatWidget`** — subscribe only when panel open | **~100%** chat calls during closed state | |
| **Publish wrapped stats** — use `getPublishedWrappedStats` / stored sections, not live `calculateAllStats` on public | **~100%** wrapped scan per visitor | |

### P1 — Important for headroom

| Optimization | Est. savings | Notes |
|--------------|--------------|-------|
| Denormalize **`eventsPlayedCount`** / use existing **`isRecentlyActive`**; remove per-member `manualScores` fetch on public directory if gender can be cached on player | **30–50%** home query cost | Partially done |
| **`syncDiscordMembersBatch`** — already caches players once/batch; ensure webhook `upsertDiscordMember` uses same pattern | Prevents regression | Done in batch path |
| Index-only **`getPendingRoleSyncs`** / removals (already uses `by_synced_to_discord`; avoid second collect where possible) | **20–40%** per poll | Review `eventBans/queries.ts` |
| Paginate **`getPlayers`**, **`getAllPlayersAdmin`**, admin event lists | **60–80%** on large admin pages | |
| **`leaderboardStats` cache** — use `rebuildLeaderboardStatsCache` on import complete | Cuts repeat full scans | Infrastructure exists |

### P2 — Growth / storage

| Optimization | Est. savings | Notes |
|--------------|--------------|-------|
| Never run **`getAllMatchPlayerStats`** / full kill `.collect()` on UI paths | Prevents timeouts | |
| **TTL / archive** old `chatMessages` (cron exists: keep 500) | Storage + churn | Already weekly prune |
| **Compress or export** old kill events to cold storage before re-import | Storage under 0.5 GB | Long-term |
| Durable **import job table** instead of repeated admin backfill clicks | Predictable spikes | Roadmap item |

### P3 — Clerk / Cloudflare (operational)

| Item | Notes |
|------|-------|
| Keep **staff-only** Clerk; avoid billing surprise from public MRU | |
| Use **preview deployments** sparingly or one preview per PR | Saves Pages builds |
| Set **`VITE_CONVEX_URL`** per environment in Cloudflare | Prevents prod/dev cross-traffic |

---

## 7. Post-migration checklist (measure, don’t guess)

1. **Convex Dashboard** — 30-day function calls, DB size, action compute after cutover.
2. **Admin → Data cache status** — `getKillEventsCount`, `getMatchStatsCount`, player/import totals.
3. **Discord bot logs** — poll interval and requests/day to `/api/discord/*`.
4. **Clerk Dashboard** — MRU (expect ≤10).
5. **Cloudflare Pages** — builds/month (expect &lt;100).

Re-run estimates quarterly or after: full Yunite season import, new wrapped release, or guild size +50%.

---

## 8. Summary table (monthly $)

| Service | Low | Medium | High |
|---------|-----|--------|------|
| Cloudflare Pages | $0 | $0 | $0 |
| Clerk | $0 | $0 | $0 |
| Convex | $0 | $0 – $5 | $5 – $30+ |
| **Total** | **$0** | **$0 – $5** | **$5 – $30+** |

Medium assumes borderline free-tier Convex usage; High assumes 2M+ calls and/or Starter/PAYG overages and possible storage add-ons.

---

## References

- Internal: `PERFORMANCE_AND_USAGE_AUDIT.md`, `PROCESS_OPERATIONS_AUDIT.md`, `CLERK_MIGRATION_IMPLEMENTATION.md`
- [Convex production limits](https://docs.convex.dev/production/state/limits)
- [Clerk pricing](https://clerk.com/pricing)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- Crons: `convex/crons.ts`
- Public directory: `convex/memberManagement.ts` → `getPublicMemberDirectory`
- Discord batch sync: `convex/discord.ts` → `syncDiscordMembersBatch`
