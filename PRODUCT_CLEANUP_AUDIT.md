# Product Cleanup Audit

**Co-Ed ZBD Hub — UX, Flow, Duplication & Consistency**  
**Date:** May 2026  
**Scope:** Entire application (public + admin)  
**Status:** Read-only audit — no code changes  
**Companion:** `CLEANUP_ROADMAP.md`, `DESIGN_SYSTEM_V2.md`, `UI_CONSISTENCY_AUDIT.md`

---

## Executive summary

The platform is feature-rich and functional, but it reads as **several products stitched together** rather than one cohesive commercial product. The main themes:

1. **Parallel hubs** — Stats, tier analytics, Yunite imports, and player rosters each have multiple entry points with overlapping tools.
2. **Navigation discoverability gaps** — Many admin routes exist only as deep links; public routes (Spin, Scrim Series, Wrapped) are absent from the main header.
3. **Terminology drift** — Players vs Members, legacy “Scrim” copy in Spin code, Staff vs Admin used interchangeably.
4. **Partial design-system adoption** — Layout primitives exist (`PageShell`, `PageHeader`, `AdminPageLayout`) but many pages still use custom headers, inline access gates, and inconsistent dialog patterns.
5. **Dead / orphaned code** — Several dialogs and legacy components remain in the repo with zero imports (recently removed: `player-list.tsx`, `admin-dashboard.tsx`).

---

## Product terminology (confirmed)

These are **three separate products**. Do not consolidate or cross-link them as if they were the same feature.

| Product | URLs | Purpose |
|---------|------|---------|
| **Spin** | `/spin`, `/spin/:eventId` | Live spin events — pairings, teams, code unlock, wheel. Staff manage via `/admin/spin-moderation`; landing at `/spin` is staff-gated; individual event pages are shareable. |
| **Scrim Series** | `/scrim-series`, `/scrim-series/:slug` | Multi-session **leaderboard series** (best-N games, participation rules, series standings). Admin config at `/admin/scrim-series`. Uses `api.scrimSeries` — not Spin. |
| **Scrim (deprecated)** | *(no route)* | `/scrim` is **not used**. Any remaining “Scrim” in UI or code (e.g. `src/pages/scrims/` folder, “Create Scrim Event” dialog, `api.scrims.*`) is legacy naming for **Spin**, not a separate product. |

**Events calendar** (`/events`) may list event types including `scrim` and `scrim-series` as calendar metadata. That is scheduling taxonomy, not the same as the Spin or Scrim Series products above — do not assume calendar tabs should deep-link to `/spin` or `/scrim-series` without an explicit data relationship.

---

## Route inventory (reference)

### Public routes

| URL | Purpose | In site header? |
|-----|---------|-----------------|
| `/` | Member directory (accepted members) | Yes — labeled **"Players"** |
| `/player/:username` | Player profile | No (staff-only gate) |
| `/events`, `/events/:id` | Event calendar & detail | Yes |
| `/tier-restrictions` | Public tier rules reference | Yes |
| `/support` | Submit support ticket | Yes |
| `/spin`, `/spin/:eventId` | **Spin** — pairing/event pages (staff landing; event pages public) | **No** |
| `/scrim-series`, `/scrim-series/:slug` | **Scrim Series** — multi-session leaderboard series (separate from Spin) | **No** |
| `/scrim` | *(none — deprecated, not routed)* | N/A |
| `/2025-wrapped` | Seasonal wrapped experience | **No** |

### Admin routes (40+)

Grouped by sidebar section in `admin-sidebar.tsx`. **Notable:** `/admin` currently redirects to `/admin/member-management` (reserved for a future admin home).

**In sidebar:** member-management, discord-members, tier-mismatches, tier-re-evaluation, stats hub, events-manager, event-results, uploads, scrim-series admin, event-bans, punishment-matrix, spin page link, spin-moderation, features, support, audit, user-management, data-cache, data-backup, wrapped editor.

**Not in sidebar (deep-link only):** tier-simulation, average-stats, holistic-score-stats, top-five-details, all stats-hub child pages individually, upset-kills sub-routes, fuzzy-matches, unmatched/yunite import detail, yunite-debug, wrapped-preview.

---

## 1. Duplicate functionality

### 1.1 Pages serving similar purposes

| Cluster | Pages | Issue | Consolidation idea |
|---------|-------|-------|-------------------|
| **Player rosters** | `/admin/member-management` (Discord tab), `/admin/discord-members` | Both show Discord-synced people with different datasets and actions | Single **People** hub with tabs: Applications, Members, Discord roster, Tier issues |
| **Yunite / imports** | `/admin/uploads`, `/admin/features`, `/admin/yunite-debug`, `/admin/yunite/:importId` | Same `YuniteDashboard` split across pages with different props; debug tool orphaned | **Imports & Yunite** hub: CSV → third-party → tournament list → detail → debug (advanced) |
| **Stats / tier analytics** | `/admin/stats`, `/admin/tier-re-evaluation`, `/admin/holistic-score-stats`, `/admin/average-stats`, `/admin/tier-simulation` | Two parallel mega-hubs; tier pages not cross-linked | Unified **Analytics** hub with Tier / Performance / Earnings / Upsets sections |
| **Cache / refresh** | `/admin/data-cache-status`, `/admin/data-maintenance`, tier-eval / holistic / average-stats pages | **Shipped (2026-06):** unified `playerStatsRebuild` + `PlayerStatsRebuildButton`; migration checklist on Data Maintenance | Optional: fold tier analytics into one **Analytics** hub (navigation only) |
| **Scrim Series vs Spin** | `/scrim-series` vs `/spin` | Different products — audit previously conflated them | Keep separate nav, copy, and admin sections; no merge |
| **Events calendar types** | `/events` filters (`scrim`, `scrim-series` types) vs live products | Calendar taxonomy may overlap naming | Audit whether calendar `scrim` type is legacy; link to Scrim Series slug only if same backend entity |
| **Tier mismatch** | `/admin/tier-mismatches`, incomplete eval section on same page | Overlaps with discord-members role tooling | Keep one page; link out to score/eval flows |
| **Support** | `/support` (public), `/admin/support` | **Appropriate split** — not duplicate | Optional: ticket status for submitters later |
| **Wrapped** | `/2025-wrapped`, `/admin/2025-wrapped-editor`, `/admin/2025-wrapped-preview` | Editor in sidebar; public/preview not linked from nav | Add seasonal nav item when published |

### 1.2 Duplicate forms

| Form pattern | Locations | Notes |
|--------------|-----------|-------|
| **Edit player** | `admin/_components/edit-player-dialog.tsx`, `player-profile/_components/edit-player-dialog.tsx`, orphaned `_components/edit-player-dialog.tsx` | Three implementations; legacy copy unused |
| **Reject / archive player** | Inline dialog in `member-management.tsx`; orphaned `reject-player-dialog.tsx`, `archive-player-dialog.tsx` | Should be one shared confirm dialog |
| **New / edit application** | `new-application-dialog.tsx`, `edit-application-dialog.tsx` | Large (~500 lines each); could share field sections |
| **Import players CSV** | `import-players-dialog.tsx` on uploads; duplicate card + button pattern possible elsewhere | Single entry on Uploads is fine if Uploads is the hub |
| **Create ban** | `create-ban-dialog.tsx` | OK — single domain |
| **Score / evaluate player** | `score-player-dialog.tsx` (shared) | Good pattern — extend to other pages |

### 1.3 Duplicate settings & admin tools

| Tool | Where it appears |
|------|------------------|
| Export evaluations | Features page only (no sidebar link elsewhere) |
| Merge duplicate players | Features page only |
| Relink third-party results | Features page only |
| Google Sheets sync | Features page only |
| Tier snapshot | Features page only |
| Delete all / clear Discord sync | Features page (dangerous ops) |
| Fix Yunite placements | Features + import flow |
| Refresh holistic / TC / DCA caches | Features, data-cache-status, tier-re-evaluation, holistic-score-stats |

**Recommendation:** Move power tools from opaque **Features** page into grouped admin sections (Data, Imports, People) or a dedicated **Tools** drawer — keep destructive ops behind one “Danger zone.”

### 1.4 Duplicate navigation items

| Item | Conflict |
|------|----------|
| Sidebar **"Players"** section vs header **"Players"** | Header = public roster; sidebar = admin member tools — same word, different meaning |
| **Stats** (sidebar) vs **Re-Evaluation** (sidebar) | Both lead to analytics; stats hub doesn’t list re-evaluation |
| **Spin Page** (sidebar → `/spin`) vs **Spin Moderation** (admin) | Same product, different surfaces — OK if labeled “Spin (events)” / “Spin moderation” |
| **Scrim Series** admin vs public `/scrim-series` | Same product, admin vs public — OK pattern (like Events manager / `/events`) |
| Hamburger in **SiteHeader** + fixed bar in **AdminSidebar** (mobile) | Two menu affordances on admin pages |

### 1.5 Duplicate components & modals

**Orphan modals (zero imports in `src/`):**

- `src/pages/_components/add-player-dialog.tsx`
- `src/pages/_components/edit-player-dialog.tsx` (legacy)
- `src/pages/admin/_components/archive-player-dialog.tsx`
- `src/pages/admin/_components/reject-player-dialog.tsx`
- `src/pages/admin/_components/role-mismatch-dialog.tsx`
- `src/pages/admin/_components/fuzzy-matches-dialog.tsx` (superseded by `/admin/fuzzy-matches` page)

**Shared modals (good):**

- `player-kills-dialog.tsx` — upset-kills cluster
- `score-player-dialog.tsx` — member-management, tier-mismatches

### 1.6 Duplicate actions to unify

| Action | Current spread |
|--------|----------------|
| Link unmatched import player | `unmatched-players.tsx`, import-third-party inline flows |
| Match Discord → player | `discord-members`, `fuzzy-matches`, `match-to-player-dialog` |
| Rebuild caches | features, data-cache-status, tier-re-evaluation, holistic-score-stats |
| Sync Discord events | event-manager, events-manager page |
| Open player profile | Index (staff only), event-detail (everyone — **bug**), leaderboards |

---

## 2. Navigation and flow

### 2.1 Main navigation (public)

**Current:** Players · Events · Tier Restrictions · Support (+ staff hamburger → `/admin`)

**Gaps:**

- No path to Spin, Scrim Series, or Wrapped without admin sidebar or direct URL
- Nav uses full-page `<a href>` reloads instead of client-side routing
- “Players” label mismatches “Members” page title

**User journeys affected:**

- New visitor cannot discover scrim series leaderboards
- Staff must know `/admin` or sidebar to reach most tools
- Seasonal Wrapped campaign invisible in nav

### 2.2 Admin workflows

**Member lifecycle:** Sidebar → Member Management → tabs (Applications → Accepted → …). Reasonable, but Discord roster duplicated under Discord Members.

**Import workflow:** Uploads → Import Third Party → unmatched deep link → yunite detail — **no breadcrumbs**, easy to lose context.

**Tier review:** Sidebar → Re-Evaluation OR Stats → individual tools — **two entry philosophies**.

**Moderation:** Event bans + punishment matrix + spin moderation scattered under “Mods” — coherent enough, but punishment matrix is reference-only (could be help doc).

### 2.3 Tournament / event workflows

```
Uploads → Yunite import → /admin/yunite/:id → back link "Back to Admin" (/admin → member-management)
Events Manager → create/sync → Event Results → clean duplicates
Public: /events → /events/:id → [broken] /player/:username
```

**Issues:**

- Post-import back navigation lands on wrong admin home
- Public event leaderboards link to staff-only profiles
- Calendar events with type `scrim-series` may or may not correspond to `/scrim-series/:slug` — relationship unclear; do not auto-link without data model review

### 2.4 Support workflow

Public submit → admin triage. Clean split. Missing: confirmation/reference ID prominence, staff reply loop (if planned).

### 2.5 Profile workflow

Staff-only `/player/:username` with edit/score dialogs. Public Index hides links for non-staff — good. Event pages break this rule.

### 2.6 Flow problems summary

| Type | Example |
|------|---------|
| **Dead ends** | `/admin` → member-management (not a dashboard); Features page is a toolbox with no “what next” |
| **Excessive clicks** | Stats hub → upset-kills → sub-tools (4 sub-routes, none in nav) |
| **Circular navigation** | Discord Members → Fuzzy Matches → Back to Discord Members (OK); Uploads ↔ Yunite detail ↔ Admin redirect (confusing) |
| **Hidden functionality** | Yunite debug, tier simulation, average stats, export/merge on Features |
| **Unexpected placement** | Public `/spin` linked from admin Mods section; destructive DB ops on Features not Data |

---

## 3. Information architecture

### 3.1 Should be grouped together

| Current separation | Recommendation |
|--------------------|----------------|
| Stats hub + Tier re-evaluation + Data cache | **Analytics & Data** super-section |
| Uploads + Features Yunite tools + Yunite debug | **Imports & Integrations** |
| Member management Discord tab + Discord members + Fuzzy matches | **People & Discord sync** |
| Event manager + Event results + Uploads imports | **Events pipeline** (create → import → results) |
| Event bans + Punishment matrix + Spin moderation | **Moderation** (keep) |

### 3.2 Should be split apart

| Page | Reason |
|------|--------|
| `member-management.tsx` (~1,250 lines) | 5 tabs × tables × dialogs — split by tab into routes or lazy panels |
| `tier-re-evaluation.tsx` (~2,270 lines) | Table + cache + links + math — extract table, filters, actions |
| `import-third-party.tsx` (~2,110 lines) | Multiple import sources in one file |
| `event-manager.tsx` (~1,360 lines) | CRUD + ICS + duo logic |
| `features/page.tsx` (~690 lines) | Unrelated power tools — split by domain |

### 3.3 Overloaded pages

See §3.2 plus: `holistic-score-stats`, `upset-kills` hub, `scrim-series` admin, `event-detail` (public + admin actions).

### 3.4 Empty or thin pages

| Page | Notes |
|------|-------|
| `/admin/stats` | Hub only — 6 cards, fine if linked from everywhere |
| `/admin/punishment-matrix` | Static reference — better as docs/help modal |
| `/admin/audit` | Thin wrapper around audit-log-view — OK |

### 3.5 Settings grouping

No unified **Settings**. Scattered: user-management (roles), features (dangerous), data-backup, wrapped editor, spin-moderation codes. Consider **Admin → Settings** with Security, Data, Integrations, Seasonal.

---

## 4. Component duplication

### 4.1 Should become shared

| Primitive | Current state | Target |
|-----------|---------------|--------|
| **Page header** | `PageHeader` exists; many pages use `skipHeader` + duplicate | Always one header per page via layout or content |
| **Tables** | Repeated sort/filter/pagination patterns | `DataTable` with column sort, skeleton, empty |
| **Filters** | Popover + checkbox tier filters copied across pages | `FilterPopover` + `TierFilter` |
| **Search** | `SearchInput` exists — good | Enforce everywhere |
| **Modals** | Dialog + DialogBody partially adopted | All scrollable dialogs use `size` + `DialogBody` |
| **Stat cards** | `StatCard` on Index; raw Card elsewhere | Standardize metric cards |
| **Action bars** | Ad-hoc flex rows in card headers | `PageToolbar` / `CardActions` slot |
| **Status badges** | Tier badges reimplemented in many files | `TierBadge`, `MemberStatusBadge`, `SyncBadge` |
| **Access gates** | AuthGate, inline h1/h2/p, none | `RoleGate` wrapper for admin routes |
| **Legend cards** | Tier mismatch legend on tier-mismatches, discord-members, old dashboard | Single `LegendCard` component |

### 4.2 Suggested component library structure

```
src/components/
  layout/          PageShell, AdminMain, PageHeader, PageToolbar, AdminPageLayout
  data/            DataTable, StatCard, EmptyState, Pagination
  filters/         SearchInput, FilterPopover, TierFilter, DateRangeFilter
  people/          TierBadge, MemberStatusBadge, PlayerLink, ScoreButton
  dialogs/         ConfirmDialog, FormDialog shell
  auth/            AuthGate, RoleGate
  domain/          ImportStatus, CacheStatus, YuniteTournamentCard (optional)
```

---

## 5. UI inconsistencies

### 5.1 Buttons

| Issue | Examples |
|-------|----------|
| Primary vs outline for same action | “Evaluate” vs “Update” vs “Score” on different pages |
| Icon-only delete on some tables, labeled on others | member-management vs discord-members |
| `size="sm"` not universal on admin toolbars | Mixed h-7/h-8/h-9 buttons |

### 5.2 Terminology

| Concept | Variants used |
|---------|---------------|
| Roster person | Player, Member, Discord Member, Discord Username |
| Public home nav | “Players” |
| Public home title | “Members” |
| Staff auth | Staff Sign In, staff account, staff panel |
| Spin (legacy code copy) | “Scrim Event”, `scrims/` folder, `api.scrims.*`, “Create Scrim Event” dialog — should say **Spin** in user-facing UI |
| Scrim Series | Scrim Series, series leaderboard, `/scrim-series` — distinct product name, keep as-is |
| Tier review | Re-Evaluation, Tier Re-Evaluation, holistic score, tier simulation |
| Import | Uploads, Import Third Party, Yunite import |

**Recommendation:** Publish a **Product Glossary** (Member = accepted roster person; Player = DB record; Staff = moderator/admin).

### 5.3 Status labels

- Discord sync: Bot Synced, USERNAME, FUZZY, MISMATCH, MISSING, WRONG, MULTIPLE — inconsistent casing/color
- Member status: active, archived, rejected, former — lowercase in data, Title Case in UI
- Ticket status: Active / Archived — OK

### 5.4 Icons

- Trophy used for Stats hub and Scrim Series admin
- ScrollText for Audit and Punishment Matrix
- Shield vs ShieldAlert for Discord vs mismatches — OK but dense for new staff

### 5.5 Loading & error states

| Pattern | Where |
|---------|-------|
| Full-page Skeleton | Most admin pages |
| Card skeleton | Some |
| Inline “Loading…” h1 | Wrapped |
| `<h1>Access Denied</h1>` | 6+ admin pages |
| `<CardTitle>Access Denied</CardTitle>` | tier-simulation |
| `<h2>` / `<p>` variants | spin-moderation, scrims |
| No gate (API fails silently or shows empty) | Many admin routes for non-admin signed-in users |

### 5.6 Error messages

- Mix of `toast.error`, inline text, `window.confirm`, `window.prompt` for destructive actions
- No unified “something went wrong” empty error component

---

## 6. Visual clutter

### 6.1 Unnecessary / redundant UI

- Duplicate page titles (CardTitle repeating PageHeader) — partially fixed in design-system migration; remaining on member-management tabs, some stat pages
- **Legend cards** repeating the same tier-mismatch key on multiple pages
- Features page: many single-action cards that could be a compact tools list
- Uploads: separate card for “Import Player CSV” above full ImportThirdParty (could be one section)
- Index stat cards visible only to admins but on public page — acceptable if intentional

### 6.2 Badges & cards

- Excessive Badge usage in discord-members role lists
- Summary stat cards on tier-mismatches (good) vs inline counts elsewhere (inconsistent)
- `border-2` on nested ticket cards in support panel — heavy visual weight

### 6.3 Repeated information

- Page description + card description saying the same thing
- Sidebar section labels + page titles + card titles (triple hierarchy)

### 6.4 Simplification targets

- Collapse Features into categorized list rows (not 3-column card grid for every tool)
- One tier-mismatch legend component, shown once per workflow
- Breadcrumbs on deep admin routes (import detail, upset-kills sub-pages, top-five-details)

---

## 7. Mobile audit

| Issue | Location | Severity |
|-------|----------|----------|
| Double fixed header (sidebar hamburger + site header menu) | Admin pages, mobile | High |
| `pt-12` offset only on admin main — public fine | `page-shell.tsx` | Medium |
| Horizontal scroll on site nav | `site-header.tsx` overflow-x-auto | Medium |
| Wide data tables | Index, member-management, tier-re-evaluation, event-detail | Expected — ensure sticky first column pattern everywhere |
| Member-management tabs | 5 tabs, horizontal scroll on small screens | OK with scroll |
| Touch targets | Some icon-only buttons < 44px | Low–medium |
| Wrapped fixed controls | bottom/right fixed UI may overlap safe areas | Medium |
| Admin chat widget | fixed bottom-right on all non-spin pages | Can obscure actions on mobile |

---

## 8. Product polish

### 8.1 Feels amateur or incomplete

- `/admin` redirect to member-management (placeholder; no admin home yet)
- **Features** as a grab-bag page name
- Orphan dialog files still in repo
- Public nav missing major product areas (Spin, Series, Wrapped)
- `window.confirm` / `prompt` for destructive ops (Features, imports)
- Full page reload on public nav links

### 8.2 Feels temporary

- 2025 Wrapped hard-coded year in routes and copy
- Yunite debug page feels dev-only but production-accessible
- Spin landing staff-gated while spin event pages are public share links (intentional ops model)
- Legacy “Scrim” strings still in Spin UI (`Create Scrim Event`, empty state “No scrim events”)

### 8.3 Feels inconsistent

- Partial design-system migration (some pages compact, others legacy spacing)
- 4+ access-denied UI patterns
- Players/Members terminology; Spin UI still says “Scrim” in places
- Public Index vs staff profile capability mismatch on event pages

### 8.4 Production-ready improvements (non-code checklist)

1. Product glossary + consistent nav labels  
2. Single admin home at `/admin` (hub cards mirroring sidebar sections)  
3. Role-based route guards at layout level  
4. Breadcrumbs on all depth-2+ admin routes  
5. Delete orphan components  
6. Rename remaining Spin UI copy from “Scrim” → “Spin” (code folder rename optional P3)  
7. Fix public → staff-only profile links on event leaderboards  
8. Client-side nav (`Link`) on site header  
9. Unified destructive-action confirm modal  
10. Seasonal nav campaign slot for Wrapped  

---

## 9. Recent cleanup (context)

Already removed in prior passes (not issues going forward):

- `player-list.tsx` — old unused public player browser  
- `admin-dashboard.tsx` + `admin/page.tsx` — unrouted legacy all-players admin  
- `admin-mobile-header.tsx` — duplicate mobile menu  
- Dashboard dead tab panels and sidebar tab-mode navigation  

---

## 10. Audit methodology

- Route map from `src/App.tsx`  
- Navigation from `site-header.tsx`, `admin-sidebar.tsx`  
- Cross-reference stats hub vs sidebar vs tier-re-evaluation links  
- Import graph for dialogs and shared components  
- Line-count review for overloaded modules  
- Alignment with in-progress design system (`DESIGN_SYSTEM_V2.md`)  

---

*End of audit. See `CLEANUP_ROADMAP.md` for prioritized remediation.*
