# Convex usage monitoring

Quick reference for what to watch in the Convex dashboard after the 2026 usage-reduction pass.

## Where to look

1. **Dashboard → Usage** — 30-day function calls, database bandwidth, storage, action compute.
2. **Dashboard → Insights** — hot functions with high bytes/documents read.
3. **Admin → Data cache status** — table counts, cache freshness, stats rebuild state.

Compare **last 7 days** vs the prior 7 days after deploying changes. Monthly windows mix pre-fix and post-fix traffic.

## Query classifications

| Class | Examples | Optimize? |
|-------|----------|-----------|
| **Public / reactive** | `getPublicMemberDirectory` (cache doc), home page | Yes — highest ROI |
| **Admin / tab-gated** | `getAcceptedMembers`, tier mismatches (load on demand) | Yes — slim payloads, skip until visible |
| **Admin / manual** | Data maintenance, Sheets export, tier mismatch refresh | One-shot OK |
| **Cron** | Daily Discord sync, `refreshRecentlyActiveFlags`, girl-role sync | Acceptable; batch cost expected |
| **Import / rebuild burst** | Yunite sync, `playerStatsRebuild`, audience insights rebuild | Acceptable during operations |
| **Webhook** | `upsertDiscordMember`, `/api/discord/sync-member` | Per-member cost expected; indexed reads only |

## Expected top functions after fixes

**Normal steady state**

- `/api/discord/sync-member` + `discord.upsertDiscordMember` — guild activity webhooks
- `memberManagement.getPublicMemberDirectory` — **one cache doc read** per home visitor (not N player docs)
- `discord.syncDiscordMembersBatch` — **one** player load per daily sync run (via sync run cache)
- Admin pages only when staff have them open

**Acceptable spikes**

- Yunite import days: `yunite.findResultByDiscordId`, `calculateAndStoreCS`, match stat writes
- Full stats rebuild: `tierReEvaluationBatched.processBatch`, `playerStatsRebuild` phases
- Manual Discord sync or member reconciliation

**Should stay low**

- `memberManagement.getAcceptedMembers` — only when Accepted tab open; slim rows
- `eventBans/queries.getPendingRoleSyncs` / `getPendingRoleRemovals` — near zero if bot role-sync polling is disabled
- `audienceInsights.getRebuildJobStatus` — only while a rebuild is running
- `discord/tierMismatches.*` — only after “Load diagnostics” on tier mismatches page

## Public directory cache

- Table: `publicMemberDirectoryCache` (single snapshot document).
- Rebuilt: daily activity cron, membership/status mutations, girl-role sync, Discord sync end, manual admin rebuild.
- **First deploy:** run **Admin → Data cache status** or `memberManagement.rebuildPublicMemberDirectoryCache` once if home page falls back to live build.

## Discord sync

- Webhooks: indexed lookups only (`upsertDiscordMember`).
- Daily/manual full sync: `beginDiscordMemberSyncRun` → batched `syncDiscordMembersBatch` → `completeDiscordMemberSyncRun`.
- Role-sync bot polling should remain **disabled** unless pending ban queue is non-empty.

## When not to optimize further

- Import-only write paths during Yunite backfill
- Cron reconciliation that runs once per day
- Functions visible in a 30-day window but fixed mid-period (monitor 7-day trend first)

## Production deploy checklist

### 1. Deploy

```bash
npx convex deploy --prod
# then deploy frontend (Cloudflare Pages / your CI)
```

### 2. One-time after deploy

**Public directory cache** (home page reads one snapshot doc):

```bash
npx convex run memberManagement:rebuildPublicMemberDirectoryCache --prod
```

Or: Convex Dashboard → Functions → `memberManagement/rebuildPublicMemberDirectoryCache` → Run.

**Event-ban sync flags** (only if role-sync bot polling is enabled and legacy bans exist):

```bash
npx convex run eventBans/mutations:backfillEventBanDiscordSyncFlags --prod
```

Patches `syncedToDiscord` / `roleRemovedFromDiscord` from `undefined` → `false` so indexed pending queries include them.

### 3. Optional storage cleanup (Upset Kills removal)

Schema no longer defines `matchKillEvents`, `matchKillEventsMetadata`, or `upsetKillsStatsCache`. **Old documents may still exist in production.**

- Convex Dashboard → Data → delete rows from removed tables when you are ready to reclaim storage.
- No app code reads these tables after deploy; deletion is safe once you confirm no rollback need.

### 4. Monitor 24–48 hours

1. Dashboard → **Usage** → compare **last 7 days** to prior week.
2. Confirm drops (or flat low usage) for:
   - `getPublicMemberDirectory` — should be tiny per call (cache doc)
   - `getUpsetKills` / `storeKillEventsBatch` — should be **zero**
   - `getAcceptedMembers` — only when Accepted tab open
   - `syncDiscordMembersBatch` — one player load per daily sync run
3. **Acceptable spikes:** Yunite import days, manual stats rebuild, daily cron window (~05:00 UTC Discord sync).

## Related docs

- `COST_AND_USAGE_ESTIMATE.md` — free-tier limits and order of constraints
- `PERFORMANCE_ROADMAP.md` — archived planning (validate against current code; Upset Kills sections are historical)
