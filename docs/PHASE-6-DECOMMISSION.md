# Phase 6 — Website Modelling Hub Decommission

The **Tier Tool** is the canonical analytics platform. The Website is the system of record and operational platform.

## Removed (Phase 6)

### Admin UI
- Tier Re-Evaluation
- Holistic Score Stats
- Tier Impact
- Average Stats (population modelling)
- Leaderboard Stats (modelling hub)
- Top Five Details (tier-eval drill-down)
- Tier evaluation CSV export on Features page
- Holistic Google Sheets exports
- Default player-stats rebuild paths through tier-eval and aggregate-stats
- Tier-eval / average-stats rebuild buttons in Data Maintenance

### Routes
Legacy modelling routes redirect to Analytics Hub or Tier Recommendation where noted in `App.tsx`.

## Retained — Website responsibilities

| Area | Purpose |
|------|---------|
| Official tier management | Member Management, tier history, Discord sync |
| Evaluation management | Manual evaluation scores, commit workflow |
| Raw storage | Players, events, imports, match results |
| Yunite ingestion | Uploads, import processing, placement fixes |
| `zbd.raw.v1` export | Tier Tool data producer |
| Tier Recommendation | Consumes `zbd.tt.reviewMetrics` import |
| Audience Insights | Product-facing population charts |
| Big Summer / ZBD Performance / earnings | Campaign and product analytics |
| Operational caches | `playerStatsCache`, contribution/top-five for Yunite eligibility and raw export |

## Cannot remove yet — and why

### `tierReEvaluationCache` + `tierReEvaluationBatched.ts`
**Reason:** Big Summer re-eval (`convex/bigSummerReEval/mutations.ts`) still reads `evaluationStatus` from the tier-eval cache when staff trigger per-player re-evaluation.

**Path forward:** Point Big Summer at Tier Tool export or a dedicated TT API; then delete cache tables and batched rebuild.

### `tierMediansCache`
**Reason:** Required by tier-eval batched pipeline (Big Summer dependency above).

### `playerStatsRebuild` tier-eval / aggregate phases
**Reason:** Code retained for Big Summer and emergency ops; **removed from default UI** and default full rebuild (stops at `top_five`).

### `holisticScore.ts`, `evaluationStatus.ts`, `teamAdjustedPerformance.ts`, `performanceTrend.ts`
**Reason:** Still referenced by `tierReEvaluationBatched` (Big Summer path). Safe to delete when Big Summer migrates off Website holistic modelling.

### `aggregateStats.ts` + cache tables
**Reason:** Convex module kept for backup/validation references; **no admin UI**. Tables may contain stale data — safe to truncate after deploy if desired.

### `leaderboardStats.ts`
**Reason:** May still be referenced internally; admin page removed. Delete module in a follow-up once grep confirms no callers.

### Legacy trigger logic — removed (Phase 6 follow-up)

| Trigger | Status |
|---------|--------|
| `importProcessing` tier-eval batch after import | **Removed** |
| `scores.ts` → `syncTierEvalAfterEvaluation` on eval save | **Removed** (no-op shim kept) |
| `playerStatsCache` batch/import/cache rebuild tier-eval | **Removed** |
| `rebuildTierReevaluationForEligible` mutation | **Throws** — directs to Tier Tool |
| `googleSheets.exportAllToSheets` holistic/re-eval | **Removed** |

Big Summer still calls `updateTierEvalForPlayerIfEligible` explicitly when staff trigger re-eval.

## Tier Recommendation (post Phase 6)

- Requires **Tier Tool export import** (`ttReviewMetricsImport` / `ttReviewMetricsByPlayer`).
- Uses `computeRecommendationFromTtAssessment()` only — no holistic/TAP weighting on Website.
- Evaluation **best-fit** labels still computed from Website evaluation scores (operational data).

## Operational workflow

1. Website: maintain tiers, evaluations, Yunite imports.
2. Website: export `zbd.raw.v1` → Tier Tool import + rebuild.
3. Tier Tool: Player Review / ECP consensus / export `zbd.tt.reviewMetrics`.
4. Website: Tier Recommendation → import JSON → staff actions in Member Management.
