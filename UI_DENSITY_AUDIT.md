# UI Density & Layout Audit

**Application:** Co-Ed ZBD Hub  
**Audit date:** 2026-05-31  
**Method:** Static code review of all routed pages + live browser capture (dev server `localhost:5173`)  
**Scope:** All routes in `src/App.tsx` — no code changes made  

---

## Executive Summary

The app uses **shadcn/ui defaults tuned for marketing-style spaciousness** rather than data-dense admin tooling. Density issues are systemic:

| Pattern | Occurrences | Impact |
|---------|-------------|--------|
| Page vertical padding `py-8` / `py-12` | 30+ pages | 32–64px wasted above fold |
| Card base `py-6 gap-6 px-6` | All Card usage | ~24px extra per card |
| Page title `text-3xl` / `text-4xl` | Most pages | Oversized headers |
| `min-h-screen` + vertical centering | Auth gates, 404, Wrapped | Full viewport consumed for minimal content |
| Card grids where tables fit | Events, Spin landing, admin stats | 2–3× vertical scroll vs table |
| Inconsistent max-width (`5xl`–`7xl`, `1600px`, `2xl`) | All sections | Uneven reading width |
| Empty state `p-6 md:p-12` | Empty component | 48–96px padding in no-data views |

**Estimated global savings if design system applied:** 25–40% reduction in vertical scroll on data-heavy pages; 15–25% on form/reference pages.

**Screenshots:** Captured during audit as `audit-screenshots/01-home-members.png`, `03-support.png`, `04-tier-restrictions.png`, `06-not-found.png` (plus events page in session). Re-capture after implementation for before/after comparison.

---

## Global / Design-System Issues (All Pages)

### G1 — Card component default padding is oversized

| Field | Detail |
|-------|--------|
| **Current implementation** | `src/components/ui/card.tsx`: Card uses `py-6`, `gap-6`; CardHeader/CardContent use `px-6`; CardFooter `[.border-t]:pt-6`. |
| **Screenshot** | Visible on every page with cards (e.g. `audit-screenshots/04-tier-restrictions.png`). |
| **Recommended change** | Reduce to `py-4 gap-4`, header/content `px-4`; keep `rounded-xl` and colors unchanged. |
| **Expected space savings** | ~16px vertical per card; ~12px horizontal. Multi-card pages save 80–200px. |

### G2 — Empty state component is overly padded

| Field | Detail |
|-------|--------|
| **Current implementation** | `src/components/ui/empty.tsx`: `p-6 md:p-12`, `gap-6`. Used on Events, Spin, Scrim Series, member list, admin tables. |
| **Screenshot** | `audit-screenshots/01-home-members.png` (empty members card). |
| **Recommended change** | `p-4 md:p-6`, `gap-4`; optional compact variant `p-3` for inline table empty states. |
| **Expected space savings** | 24–48px per empty state instance. |

### G3 — Site header consumes excessive vertical space

| Field | Detail |
|-------|--------|
| **Current implementation** | `src/components/site-header.tsx`: Promo banner `py-2` + nav row `py-3 sm:py-4`; two stacked full-width bars. Total ~88–104px before content. |
| **Screenshot** | All captured screenshots. |
| **Recommended change** | Merge promo into nav row on desktop; use `py-2` nav consistently; consider dismissing/collapsing promo. Keep touch targets ≥44px. |
| **Expected space savings** | 16–24px vertical on every page. |

### G4 — Inconsistent page container widths

| Field | Detail |
|-------|--------|
| **Current implementation** | `max-w-7xl` (1280px), `max-w-6xl`, `max-w-5xl` (Spin), `max-w-4xl` (Tier Restrictions, Support), `max-w-2xl` (Support), `max-w-[1600px]` (holistic stats). Horizontal padding varies: `px-2`, `px-4`, `px-6`. |
| **Screenshot** | N/A (structural). |
| **Recommended change** | Standardize on `max-w-7xl mx-auto px-4 md:px-6`; narrow forms only (`max-w-lg` inner wrapper). |
| **Expected space savings** | Indirect — improves scanability; Spin/Events gain ~128px content width on large screens. |

### G5 — Large border radius adds visual bulk

| Field | Detail |
|-------|--------|
| **Current implementation** | `src/index.css`: `--radius: 1.3rem` (~21px). Cards, inputs, badges all feel “pillowy.” |
| **Screenshot** | `audit-screenshots/04-tier-restrictions.png`. |
| **Recommended change** | Reduce to `0.75rem` (12px) for cards/containers; keep brand colors. Do not change primary/accent hues. |
| **Expected space savings** | Visual density improvement; minimal pixel savings but reduces perceived whitespace. |

### G6 — Page title scale inconsistent and often oversized

| Field | Detail |
|-------|--------|
| **Current implementation** | Public pages: `text-3xl md:text-4xl` (Index). Admin: `text-3xl` default, `text-4xl` auth gates, `text-6xl` Wrapped. |
| **Screenshot** | `audit-screenshots/01-home-members.png`. |
| **Recommended change** | Page h1: `text-xl md:text-2xl font-bold`; section h2: `text-lg font-semibold`. Preserve icon + title pairing. |
| **Expected space savings** | 8–16px per page header row. |

### G7 — Widespread `space-y-6` / `gap-6` section rhythm

| Field | Detail |
|-------|--------|
| **Current implementation** | Index, Events, admin stats, upset-kills, data-backup, player profile all use 24px section gaps. |
| **Screenshot** | N/A. |
| **Recommended change** | Default section gap `space-y-4` (16px); tight tool panels `space-y-3`. |
| **Expected space savings** | 8px per section boundary; 40–80px on multi-section pages. |

### G8 — Auth / loading gates use full viewport centering

| Field | Detail |
|-------|--------|
| **Current implementation** | ~15 admin pages: `flex min-h-screen items-center justify-center` + `text-4xl` heading + `space-y-6`. |
| **Screenshot** | N/A (requires unauthenticated state). |
| **Recommended change** | Compact centered card: `py-16 max-w-md`, `text-2xl` heading. Avoid double `min-h-screen` (see 404). |
| **Expected space savings** | Better UX; no scroll on gate screens. |

### G9 — Mobile admin offset inconsistent

| Field | Detail |
|-------|--------|
| **Current implementation** | Most admin: `pt-14 lg:pt-0`. Stats hub: `pt-16 lg:pt-8`. Upset-kills main: no offset. Fixed mobile header in `admin-sidebar.tsx` `py-3`. |
| **Screenshot** | N/A. |
| **Recommended change** | Single `--admin-mobile-header-height: 3rem`; all admin main areas `pt-12 lg:pt-0`. |
| **Expected space savings** | Eliminates double-padding bugs; 8px on stats pages. |

---

## Public Pages

### `/` — Members (Index)

**File:** `src/pages/Index.tsx`

#### Issue 1 — Oversized page header
| Field | Detail |
|-------|--------|
| **Current implementation** | `h1 text-3xl md:text-4xl` with `h-8 w-8` icon; `space-y-6` page wrapper; `md:p-6` padding. |
| **Screenshot** | `audit-screenshots/01-home-members.png` |
| **Recommended change** | `text-xl md:text-2xl`, icon `h-5 w-5`, page `space-y-4 py-4 px-4`. |
| **Expected space savings** | ~40px above table. |

#### Issue 2 — Admin stat cards add scroll before primary table
| Field | Detail |
|-------|--------|
| **Current implementation** | `grid gap-4 md:grid-cols-3` of full Cards above member table (admin only). |
| **Screenshot** | N/A (requires admin session) |
| **Recommended change** | Inline stat strip (3 compact metrics in one row) or collapsible summary; table first on desktop. |
| **Expected space savings** | ~120px for admins. |

#### Issue 3 — Double padding on member table card
| Field | Detail |
|-------|--------|
| **Current implementation** | Outer Card `p-0 sm:p-6` but CardHeader also `px-3 py-4 sm:px-6 sm:py-6` — redundant on sm+. |
| **Screenshot** | `audit-screenshots/01-home-members.png` |
| **Recommended change** | Card `p-0` always; header `px-4 py-3`; filters in single toolbar row on md+. |
| **Expected space savings** | ~24px card chrome. |

#### Issue 4 — Filter controls stack vertically on mobile with large gaps
| Field | Detail |
|-------|--------|
| **Current implementation** | `flex-col sm:flex-row gap-2`; four controls each full width on mobile. |
| **Screenshot** | N/A |
| **Recommended change** | 2×2 grid on mobile; `gap-1.5`; combine filters into one row on sm. |
| **Expected space savings** | ~60px on mobile before table. |

#### Issue 5 — Empty state inside oversized card
| Field | Detail |
|-------|--------|
| **Current implementation** | Empty component with default padding inside full-width Card. |
| **Screenshot** | `audit-screenshots/01-home-members.png` |
| **Recommended change** | Compact empty: `py-6` max; reduce card min-height. |
| **Expected space savings** | ~48px. |

---

### `/player/:username` — Player Profile

**Files:** `src/pages/player-profile/page.tsx`, `_components/player-profile-content.tsx`

#### Issue 1 — Excessive page padding
| Field | Detail |
|-------|--------|
| **Current implementation** | Container `px-4 py-8 max-w-7xl`; back button `mb-6`. |
| **Screenshot** | N/A (staff-only content) |
| **Recommended change** | `py-4`, back link `mb-3` inline with title. |
| **Expected space savings** | ~36px. |

#### Issue 2 — Oversized profile header card
| Field | Detail |
|-------|--------|
| **Current implementation** | CardTitle `text-3xl`; tier Badge `text-xl px-4 py-1`; nickname `text-lg`; `space-y-6` between sections. |
| **Screenshot** | N/A |
| **Recommended change** | Title `text-xl`; tier badge default size; metadata in dense 4-col grid on lg. |
| **Expected space savings** | ~48px header card. |

#### Issue 3 — Staff gate uses large empty vertical block
| Field | Detail |
|-------|--------|
| **Current implementation** | `text-center py-12` with `h-12 w-12` icon. |
| **Screenshot** | N/A |
| **Recommended change** | `py-8`, icon `h-8 w-8`. |
| **Expected space savings** | ~32px. |

#### Issue 4 — Tab content spacing
| Field | Detail |
|-------|--------|
| **Current implementation** | Profile wrapper `space-y-6`; performance tabs in nested Cards. |
| **Screenshot** | N/A |
| **Recommended change** | `space-y-4`; flatten nested card padding where tab already provides boundary. |
| **Expected space savings** | ~24px per tab. |

#### Issue 5 — Mobile action buttons wrap awkwardly
| Field | Detail |
|-------|--------|
| **Current implementation** | Sync/Edit buttons in header `flex gap-2` without mobile stack optimization. |
| **Screenshot** | N/A |
| **Recommended change** | Icon-only buttons on mobile; dropdown for secondary actions. |
| **Expected space savings** | ~40px on narrow viewports. |

---

### `/events` — Events List

**File:** `src/pages/events/page.tsx`

#### Issue 1 — Large header block with triple text lines
| Field | Detail |
|-------|--------|
| **Current implementation** | `mb-8` header; `h-8 w-8` icon; `text-3xl` title; subtitle + italic note; separate filter row with `mb-2` labels. |
| **Screenshot** | Events page (session capture) |
| **Recommended change** | Compact header row: icon + title + subtitle inline; filters in horizontal toolbar; drop italic note to tooltip. |
| **Expected space savings** | ~56px. |

#### Issue 2 — Card grid instead of scannable table/list
| Field | Detail |
|-------|--------|
| **Current implementation** | `grid gap-6 md:grid-cols-2 lg:grid-cols-3` EventCard components; each card ~200–280px tall with image, badges, description, CTA. |
| **Screenshot** | Events page (session capture) |
| **Recommended change** | Desktop: sortable table (name, type, mode, dates, status, link). Optional card toggle for mobile. Keep hover/primary border. |
| **Expected space savings** | ~50% vertical scroll with 10+ events (5–6 rows vs 3–4 card rows). |

#### Issue 3 — Oversized event card content
| Field | Detail |
|-------|--------|
| **Current implementation** | EventCard: full Card padding, `h-32 w-32` image, `space-y-3`, `line-clamp-2` description, redundant “View Details” row. |
| **Screenshot** | N/A |
| **Recommended change** | Table row: thumbnail `h-8 w-8`; drop inline description from list (show on detail only). |
| **Expected space savings** | ~120px per 3-card row → ~36px per table row. |

#### Issue 4 — Duplicate nested Tabs consume vertical space
| Field | Detail |
|-------|--------|
| **Current implementation** | Status tabs + type tabs both `TabsList` full width; `space-y-4` between levels. |
| **Screenshot** | Events page (session capture) |
| **Recommended change** | Combine into filter bar: status segmented control + type dropdown/chips on one row. |
| **Expected space savings** | ~48px. |

#### Issue 5 — Page padding
| Field | Detail |
|-------|--------|
| **Current implementation** | `container mx-auto px-4 py-8 max-w-7xl`. |
| **Screenshot** | Events page |
| **Recommended change** | `py-4 px-4 md:px-6`. |
| **Expected space savings** | ~32px top/bottom. |

#### Issue 6 — Mobile tab overflow
| Field | Detail |
|-------|--------|
| **Current implementation** | Two rows of TabsTrigger; many tabs wrap to multiple lines on mobile. |
| **Screenshot** | N/A |
| **Recommended change** | Horizontal scroll single row with `overflow-x-auto`; or type filter as Select on mobile. |
| **Expected space savings** | 32–64px on mobile. |

---

### `/events/:eventId` — Event Detail

**File:** `src/pages/events/_components/event-detail.tsx`

#### Issue 1 — Hero-style event header
| Field | Detail |
|-------|--------|
| **Current implementation** | `py-8` container; `h-32 w-32` image; `text-3xl` title; `text-lg` season; `mb-6`/`mb-8` margins. |
| **Screenshot** | N/A |
| **Recommended change** | Horizontal compact header: small image `h-12 w-12`, title `text-xl`, metadata inline badges. |
| **Expected space savings** | ~80px. |

#### Issue 2 — Three info cards for scalar metadata
| Field | Detail |
|-------|--------|
| **Current implementation** | `grid gap-6 md:grid-cols-3 mb-8` — type, dates, mode each in full Card. |
| **Screenshot** | N/A |
| **Recommended change** | Single definition list or inline badge row; no cards for 1-line facts. |
| **Expected space savings** | ~100px. |

#### Issue 3 — Leaderboard sections in cards with generous spacing
| Field | Detail |
|-------|--------|
| **Current implementation** | Multiple Card-wrapped tables with default padding; tabs for leaderboards. |
| **Screenshot** | N/A |
| **Recommended change** | Table-first layout: Card `p-0`, table edge-to-edge; sticky table header. |
| **Expected space savings** | ~32px per leaderboard section. |

#### Issue 4 — Back button spacing
| Field | Detail |
|-------|--------|
| **Current implementation** | Ghost button with `mb-4` separate from title block. |
| **Screenshot** | N/A |
| **Recommended change** | Text link in breadcrumb row with title. |
| **Expected space savings** | ~16px. |

---

### `/support` — Support Form

**File:** `src/pages/support/page.tsx`

#### Issue 1 — Excessive page vertical padding
| Field | Detail |
|-------|--------|
| **Current implementation** | `py-12 max-w-2xl` — 48px top padding on a single-form page. |
| **Screenshot** | `audit-screenshots/03-support.png` |
| **Recommended change** | `py-6 md:py-8`; form remains narrow. |
| **Expected space savings** | ~32px. |

#### Issue 2 — Card wraps simple form with double padding
| Field | Detail |
|-------|--------|
| **Current implementation** | Card + CardHeader `text-2xl` + CardContent; form `space-y-6`. |
| **Screenshot** | `audit-screenshots/03-support.png` |
| **Recommended change** | Page title outside card; card `p-4`; form `space-y-4`; title `text-lg`. |
| **Expected space savings** | ~40px. |

#### Issue 3 — Success state oversized
| Field | Detail |
|-------|--------|
| **Current implementation** | Success view `py-12 space-y-4`, icon `h-12 w-12`. |
| **Screenshot** | N/A |
| **Recommended change** | `py-6`, icon `h-8 w-8`. |
| **Expected space savings** | ~48px. |

#### Issue 4 — Textarea default 8 rows
| Field | Detail |
|-------|--------|
| **Current implementation** | `rows={8}` on message field. |
| **Screenshot** | `audit-screenshots/03-support.png` |
| **Recommended change** | `rows={4}` with auto-grow (`field-sizing-content` already on Textarea). |
| **Expected space savings** | ~80px form height. |

---

### `/tier-restrictions` — Tier Restrictions Reference

**File:** `src/pages/tier-restrictions/page.tsx`

#### Issue 1 — Page header margins
| Field | Detail |
|-------|--------|
| **Current implementation** | `mb-8` after back link (`mb-6`); header `mb-3`; legend `mb-8`. |
| **Screenshot** | `audit-screenshots/04-tier-restrictions.png` |
| **Recommended change** | Consolidate to `mb-4` section gaps; back link inline with title. |
| **Expected space savings** | ~48px. |

#### Issue 2 — Three stacked full Cards for reference data
| Field | Detail |
|-------|--------|
| **Current implementation** | Duos/Trios/Squads each in Card with header + `grid gap-3 sm:grid-cols-2` combo rows; `grid gap-6` between cards. |
| **Screenshot** | `audit-screenshots/04-tier-restrictions.png` |
| **Recommended change** | Single Card with Tabs by mode, or compact table (Mode | Combination columns); reduce TierBadge to `w-7 h-7`. |
| **Expected space savings** | ~120px (one card vs three). |

#### Issue 3 — Narrow max-width on wide content
| Field | Detail |
|-------|--------|
| **Current implementation** | `max-w-4xl` — squads section needs horizontal space but page is capped. |
| **Screenshot** | `audit-screenshots/04-tier-restrictions.png` |
| **Recommended change** | `max-w-5xl` or full `max-w-7xl` with multi-column combo grid `sm:grid-cols-3 lg:grid-cols-4`. |
| **Expected space savings** | Reduces vertical scroll ~15% for Squads. |

#### Issue 4 — Tier legend row spacing
| Field | Detail |
|-------|--------|
| **Current implementation** | `flex flex-wrap gap-3 mb-8` — separate row before content. |
| **Screenshot** | `audit-screenshots/04-tier-restrictions.png` |
| **Recommended change** | Inline legend in card header or sticky subheader. |
| **Expected space savings** | ~32px. |

---

### `/spin` — Spin Events Landing

**File:** `src/pages/scrims/page.tsx`

#### Issue 1 — Oversized hero section
| Field | Detail |
|-------|--------|
| **Current implementation** | Hero band `px-6 py-12` (48px vertical); icon box `p-3` + `h-8 w-8`; `text-3xl` title. |
| **Screenshot** | N/A (capture in follow-up) |
| **Recommended change** | Inline page header `py-4` matching Scrim Series pattern; no separate hero band. |
| **Expected space savings** | ~64px. |

#### Issue 2 — Content area padding
| Field | Detail |
|-------|--------|
| **Current implementation** | `max-w-5xl px-6 py-8`. |
| **Screenshot** | N/A |
| **Recommended change** | Align to `max-w-7xl px-4 py-4`. |
| **Expected space savings** | ~32px + wider grid. |

#### Issue 3 — Event cards in grid vs list
| Field | Detail |
|-------|--------|
| **Current implementation** | `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`; skeleton `h-40`. |
| **Screenshot** | N/A |
| **Recommended change** | Compact list/table on desktop (name, type, games, code, status). |
| **Expected space savings** | ~40% with multiple events. |

---

### `/spin/:eventId` — Spin Event Detail

**File:** `src/pages/scrims/event-page.tsx`

#### Issue 1 — Duplicate header bands
| Field | Detail |
|-------|--------|
| **Current implementation** | Header section `px-6 py-8` + main content `px-6 py-8 space-y-8`. |
| **Screenshot** | N/A |
| **Recommended change** | Single sticky toolbar header `py-3`; content `space-y-4`. |
| **Expected space savings** | ~56px. |

#### Issue 2 — Link code promo block oversized
| Field | Detail |
|-------|--------|
| **Current implementation** | `p-8 text-center space-y-4`; code display `px-6 py-3 text-2xl`. |
| **Screenshot** | N/A |
| **Recommended change** | Inline code bar `p-4`; mono `text-lg`. |
| **Expected space savings** | ~48px. |

#### Issue 3 — Spin wheel container padding
| Field | Detail |
|-------|--------|
| **Current implementation** | `rounded-xl border bg-card p-8` around wheel. |
| **Screenshot** | N/A |
| **Recommended change** | `p-4`; wheel remains same size (functional). |
| **Expected space savings** | ~32px. |

#### Issue 4 — Empty teams state
| Field | Detail |
|-------|--------|
| **Current implementation** | `border-2 border-dashed p-12 text-center`. |
| **Screenshot** | N/A |
| **Recommended change** | `p-6`. |
| **Expected space savings** | ~48px. |

#### Issue 5 — Bot setup prose block
| Field | Detail |
|-------|--------|
| **Current implementation** | Card `p-6 space-y-4` with prose + code samples. |
| **Screenshot** | N/A |
| **Recommended change** | Collapsible `<details>` default closed; operators expand when needed. |
| **Expected space savings** | ~150px when collapsed. |

---

### `/scrim-series` — Scrim Series Landing

**File:** `src/pages/scrim-series/page.tsx`

#### Issue 1 — Header band padding
| Field | Detail |
|-------|--------|
| **Current implementation** | Border-b header `py-8`; content `py-8`. |
| **Screenshot** | N/A |
| **Recommended change** | Header `py-4`; content `py-4`. |
| **Expected space savings** | ~64px. |

#### Issue 2 — Card grid for series list
| Field | Detail |
|-------|--------|
| **Current implementation** | Same pattern as Spin — 3-col cards `h-40` skeleton. |
| **Screenshot** | N/A |
| **Recommended change** | Compact table on md+. |
| **Expected space savings** | ~35% vertical. |

---

### `/scrim-series/:slug` — Scrim Series Leaderboard

**File:** `src/pages/scrim-series/leaderboard.tsx`

#### Issue 1 — Loading/error states use py-16
| Field | Detail |
|-------|--------|
| **Current implementation** | Empty/error wrappers `px-6 py-16`; loading header `py-10`. |
| **Screenshot** | N/A |
| **Recommended change** | `py-8` max. |
| **Expected space savings** | ~64px on error paths. |

#### Issue 2 — Leaderboard table density
| Field | Detail |
|-------|--------|
| **Current implementation** | Custom table with session columns; reasonable cell padding but header band `py-8`. |
| **Screenshot** | N/A |
| **Recommended change** | Sticky header row; reduce header band; `text-xs` for session sub-columns on mobile. |
| **Expected space savings** | ~40px header + better above-fold rows. |

#### Issue 3 — Column visibility controls spacing
| Field | Detail |
|-------|--------|
| **Current implementation** | Toolbar above table with gap spacing. |
| **Screenshot** | N/A |
| **Recommended change** | Inline with title row. |
| **Expected space savings** | ~24px. |

---

### `/2025-wrapped` — Wrapped Experience

**File:** `src/pages/wrapped/page.tsx`

> **Note:** Full-screen storytelling layout — lower priority for density; preserve visual impact. Target only excess margins that don't affect narrative.

#### Issue 1 — Full viewport centering for all slides
| Field | Detail |
|-------|--------|
| **Current implementation** | `min-h-screen items-center justify-center` per slide; `text-6xl` hero, `text-3xl` stats. |
| **Screenshot** | N/A |
| **Recommended change** | Keep large type for Wrapped brand moment; reduce `mb-8` between elements to `mb-4` on stat slides only. |
| **Expected space savings** | ~32px per slide (non-hero). |

#### Issue 2 — Thank-you slide spacing
| Field | Detail |
|-------|--------|
| **Current implementation** | `text-5xl` heading, `mb-8 text-xl` body. |
| **Screenshot** | N/A |
| **Recommended change** | Minor margin tightening only. |
| **Expected space savings** | ~16px. |

---

### `*` — 404 Not Found

**File:** `src/pages/NotFound.tsx`

#### Issue 1 — Double min-h-screen stacking
| Field | Detail |
|-------|--------|
| **Current implementation** | Outer + inner both `min-h-screen`; centers content in ~2× viewport feel with header. |
| **Screenshot** | `audit-screenshots/06-not-found.png` |
| **Recommended change** | Inner: `flex-1 flex items-center py-16` inside flex column layout; single viewport. |
| **Expected space savings** | Eliminates excess scroll (~200px). |

#### Issue 2 — Oversized 404 numeral
| Field | Detail |
|-------|--------|
| **Current implementation** | `text-6xl` + `text-2xl` + `text-lg` + `space-y-6`. |
| **Screenshot** | `audit-screenshots/06-not-found.png` |
| **Recommended change** | `text-4xl` 404, `text-xl` subtitle, `space-y-4`. |
| **Expected space savings** | ~24px. |

---

## Admin Pages

Admin pages share layout families documented in the Global section. Below: route-specific issues beyond shared patterns.

### Layout Family A — Sidebar + `main p-6` (majority)

Routes: member-management, events-manager, event-results, uploads, support, audit, features, tier-mismatches, tier-impact, event-bans, punishment-matrix, scrim-series admin, spin-moderation, data-cache-status, holistic-score-stats, player-comparison, discord-members, user-management, in-game-earnings (partial).

#### Shared Issue A1 — Main padding `p-6` (24px) on all sides
| Field | Detail |
|-------|--------|
| **Current implementation** | `main flex-1 p-6` repeated across ~20 pages. |
| **Screenshot** | N/A |
| **Recommended change** | `p-4 md:p-5`; match `event-bans` pattern `p-2 sm:p-4`. |
| **Expected space savings** | 16px per edge; 32px vertical. |

#### Shared Issue A2 — Page titles often duplicated in Card headers only
| Field | Detail |
|-------|--------|
| **Current implementation** | Many pages use CardTitle `text-sm` without page h1 — hurts accessibility/landmarks. |
| **Screenshot** | N/A |
| **Recommended change** | Visible compact h1 `text-lg` + card without redundant title row. |
| **Expected space savings** | Net neutral; improves a11y. |

---

### `/admin/member-management`

**File:** `src/pages/admin/member-management.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Page padding escalates on md | `px-2 py-4 sm:p-4 md:p-8` | Cap at `p-4 md:p-5` | ~24px |
| 2 | Empty tab states | `py-12` × 5 tabs | `py-6` | ~48px each |
| 3 | Card header padding | `px-3 py-4 sm:px-6 sm:py-6` | `px-4 py-3` | ~24px/card |
| 4 | Mobile list items | `divide-y` with default padding | `[&>div]:py-2` | ~8px/row |
| 5 | Title size | `text-2xl md:text-3xl` | `text-xl md:text-2xl` | ~8px |

---

### `/admin/tier-re-evaluation`

**File:** `src/pages/admin/tier-re-evaluation.tsx`  
**Note:** Already relatively compact (`py-2 space-y-3`). Minor issues only.

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Filter row gap | `gap-6` | `gap-3` | ~12px |
| 2 | Auth denied state | `py-8` | `py-4` | ~32px |

---

### `/admin/tier-simulation`

**File:** `src/pages/admin/tier-simulation.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Inner padding | `p-8 max-w-7xl` | `p-4` | ~32px |
| 2 | Two-column card grid | `gap-6 space-y-6` | `gap-4` | ~16px |
| 3 | Title | `text-3xl` | `text-xl` | ~8px |
| 4 | Full viewport shell | `h-screen` | `min-h-0 flex-1 overflow-auto` | Better scroll behavior |

---

### `/admin/average-stats`, `/admin/data-backup`, `/admin/leaderboard-stats`

**Files:** respective page files

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Page padding | `py-8` | `py-4` | ~32px |
| 2 | Stat cards | `text-3xl` numbers in grid cards | Inline metrics bar or `text-xl` | ~80px |
| 3 | Section spacing | `space-y-6` | `space-y-4` | ~16px/section |
| 4 | Leaderboard unauth | `py-16` | `py-8` | ~64px |
| 5 | Leaderboard missing px | `container py-8` no horizontal padding | Add `px-4` | Prevents edge bleed |

---

### `/admin/holistic-score-stats`

**File:** `src/pages/admin/holistic-score-stats.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Wide table in padded card | Card defaults + `max-w-[1600px]` | Card `p-0`, sticky header | ~24px + more rows visible |
| 2 | Filter cards | Multiple Cards for filters | Single toolbar row | ~60px |

---

### `/admin/player-comparison`

**File:** `src/pages/admin/player-comparison.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Title margin | `text-3xl mb-2` | `text-xl mb-1` | ~12px |
| 2 | Loading/auth wrappers | `py-8` | `py-4` | ~32px |
| 3 | Comparison matrix | Card grid for players | Dense table with sticky first column | ~30% scroll reduction |

---

### `/admin/stats` (hub)

**File:** `src/pages/admin/stats.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Unique mobile padding | `pt-16 lg:pt-8` vs `pt-14 lg:pt-0` elsewhere | Standardize admin offset | ~8px |
| 2 | Link card grid | `gap-4` 3-col cards | Dense list with icons on desktop | ~25% |
| 3 | Main padding | `p-4 md:p-8` | `p-4 md:p-5` | ~24px |

---

### `/admin/tier-mismatches`

**File:** `src/pages/admin/tier-mismatches.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Main padding | `p-8` | `p-4` | ~32px |
| 2 | Summary stat cards | `CardTitle text-3xl` for counts | `text-xl` in compact strip | ~40px |
| 3 | Title margin | `mb-6` | `mb-3` | ~12px |
| 4 | Empty state | `py-12` | `py-6` | ~48px |

---

### `/admin/tier-impact`

**File:** `src/pages/admin/tier-impact.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Section rhythm | `space-y-8` | `space-y-4` | ~32px/section |
| 2 | Unauth state | `py-16` | `py-8` | ~64px |
| 3 | Chart cards | Full Card wrapper per chart | 2-col grid with `p-4` cards | ~24px/chart |

---

### `/admin/upset-kills` (+ search, h2h, top, eliminations)

**Files:** `upset-kills*.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Container padding | `p-6 space-y-6` all subpages | `p-4 space-y-4` | ~32px |
| 2 | Stat summary cards | `text-3xl` in `md:grid-cols-2 gap-6` | Metric strip | ~100px |
| 3 | Missing SiteHeader/sidebar on main | No nav chrome on `/admin/upset-kills` | Add AdminSidebar for consistency | UX fix |
| 4 | Inconsistent mobile pt | Only top/eliminations have `pt-14` | Standardize | ~16px bug fix |
| 5 | Empty tables | `py-8` | `py-4` | ~32px |

---

### `/admin/yunite-debug`

**File:** `src/pages/admin/yunite-debug.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Loosest admin page | `space-y-8 p-8`, `text-4xl` title | `space-y-4 p-4`, `text-xl` | ~64px |
| 2 | API form cards | Full Card per endpoint | Accordion sections | ~40% scroll |

---

### `/admin/features`

**File:** `src/pages/admin/features/page.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Page padding | `py-8` | `py-4` | ~32px |
| 2 | Feature grid | Already compact `gap-3 py-3` | **Good reference** — replicate elsewhere | — |

---

### `/admin/event-bans` + `event-bans-manager`

**File:** `src/pages/admin/_components/event-bans-manager.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | **Positive pattern** | `p-2 sm:p-6`, responsive title `text-xl sm:text-2xl`, mobile card / desktop table dual layout | **Use as admin template** | — |
| 2 | Empty state | `py-12` | `py-6` | ~48px |

---

### `/admin/punishment-matrix`

**File:** `src/pages/admin/punishment-matrix.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Section spacing | `space-y-8` between offense tracks | `space-y-4` | ~32px/track |
| 2 | Timeline cards | Large vertical timeline layout | Compact table (Offense | 1st | 2nd | 3rd) | ~50% |

---

### `/admin/scrim-series`, `/admin/spin-moderation`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Title scale mismatch | scrim-series `text-xl` vs spin-moderation `text-3xl` | Standardize `text-lg` | ~8px |
| 2 | Tab panels | Nested cards | Flatten padding `p-0` on table cards | ~24px |

---

### `/admin/wrapped-editor`, `/admin/2025-wrapped-preview`

**Files:** `wrapped-editor.tsx`, `wrapped-preview.tsx`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Editor padding | `space-y-6 p-6`, `text-4xl` | `space-y-4 p-4`, `text-2xl` | ~32px |
| 2 | Preview slides | Same as public Wrapped — `text-6xl`, `mb-8` | Minor margin trim only | ~16px/slide |

---

### `/admin/fuzzy-matches`, `/admin/unmatched/:importId`, `/admin/yunite/:importId`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Page padding | `py-8` / `p-6` | `py-4 p-4` | ~32px |
| 2 | Stats bar (fuzzy) | `gap-6 mb-6 p-4` | Inline compact badges | ~24px |
| 3 | Tables | Good use of tables | Card `p-0` wrapper | ~24px |

---

### `/admin/player-earnings`, `/admin/in-game-earnings`

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Standalone container | No sidebar, `p-6 space-y-6` | Add sidebar; `p-4 space-y-4` | ~32px |
| 2 | Summary cards + table | Duplicate header info | Merge summary into table caption row | ~80px |

---

### Admin auth gate template (~15 pages)

**Files:** user-management, events-manager, uploads, support, audit, discord-members, page.tsx, etc.

| # | Issue | Current | Recommendation | Savings |
|---|-------|---------|----------------|---------|
| 1 | Full screen center | `min-h-screen items-center justify-center` | `py-20` compact | Removes false scroll |
| 2 | Heading | `text-4xl` | `text-2xl` | ~16px |
| 3 | Spacing | `space-y-6` | `space-y-4` | ~8px |

---

## Priority Matrix

| Priority | Target | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Card + Empty component defaults (G1, G2) | Low | All pages |
| **P0** | Standardize page padding/section gap (G4, G7) | Medium | All pages |
| **P1** | Events list → table view | Medium | High traffic |
| **P1** | Site header compaction (G3) | Low | All pages |
| **P1** | Admin main `p-6` → `p-4` (A1) | Low | 20+ admin pages |
| **P2** | Spin/Scrim Series hero removal | Medium | Moderate traffic |
| **P2** | Tier Restrictions single-card layout | Medium | Reference page |
| **P2** | Title scale normalization (G6) | Medium | Visual consistency |
| **P3** | Wrapped slide margins | Low | Seasonal |
| **P3** | Border radius tweak (G5) | Low | Perceived density |

---

## Accessibility Notes (Must Preserve)

- Maintain minimum **44×44px** touch targets on mobile when reducing padding.
- Do not reduce focus ring (`ring-[3px]`) or contrast ratios.
- Keep visible `<h1>` per page when consolidating headers (several admin pages lack proper heading hierarchy).
- Table-to-card responsive switches (event-bans pattern) should preserve equivalent information and keyboard access.
- Promo banner changes should not hide `#ad` disclosure from screen readers.

---

## Appendix: Route Coverage Checklist

| Route | Audited |
|-------|---------|
| `/` | ✅ |
| `/player/:username` | ✅ |
| `/events` | ✅ |
| `/events/:eventId` | ✅ |
| `/support` | ✅ |
| `/tier-restrictions` | ✅ |
| `/spin` | ✅ |
| `/spin/:eventId` | ✅ |
| `/scrim-series` | ✅ |
| `/scrim-series/:slug` | ✅ |
| `/2025-wrapped` | ✅ |
| `*` (404) | ✅ |
| All `/admin/*` routes (35) | ✅ |

---

*End of audit. See `DESIGN_SYSTEM_PROPOSAL.md` for recommended layout rules to apply in implementation phase.*
