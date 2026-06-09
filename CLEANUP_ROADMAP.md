# Cleanup Roadmap

**Prioritized remediation from `PRODUCT_CLEANUP_AUDIT.md`**  
**Goal:** Polished commercial product — consistent design system, clear flows, minimal duplication  
**Status:** Sprints A–C largely complete (2026-05-31). P3 mega-file splits and advanced UX remain optional.

Priority key:

- **P1** — High impact, low effort (days, not weeks)  
- **P2** — High impact, medium effort (1–3 weeks each)  
- **P3** — Nice to have / longer-term polish  

---

## P1 — High impact, low effort

### Navigation & terminology

| # | Item | Why P1 | Effort |
|---|------|--------|--------|
| 1.1 | **Fix public dead-end:** remove or gate `/player/` links on public event leaderboards | Users hit staff-only wall from public pages | Small — conditional link in `event-detail.tsx` |
| 1.2 | **Align “Players” vs “Members”** — pick one public term, update nav + Index + back links | Instant consistency win | Small — copy pass (~10 files) |
| 1.3 | **Switch site header to React Router `Link`** | Stops full reloads; feels modern | Small — `site-header.tsx` |
| 1.4 | **Cross-link Stats hub ↔ Tier re-evaluation** | Two hubs, zero connection | Small — add links on both pages |
| 1.5 | **Fix “Back to Admin” / post-import navigation** — point to `/admin/uploads` not `/admin` | Wrong landing after Yunite detail | Small — `yunite-tournament.tsx`, unmatched-players |

### Dead code & duplication

| # | Item | Why P1 | Effort |
|---|------|--------|--------|
| 1.6 | **Delete orphan dialogs** (add-player, legacy edit-player, archive, reject, role-mismatch, fuzzy-matches dialog) | Confusing for maintainers; zero imports | Small — delete 6 files |
| 1.7 | **Rename Spin UI copy** — replace user-facing “Scrim” strings with “Spin” (`Create Scrim Event`, empty states, etc.); `/scrim` route stays dead | Legacy naming confuses staff; Scrim Series is a separate product | Small — copy pass on `src/pages/scrims/*` |

### Access & polish

| # | Item | Why P1 | Effort |
|---|------|--------|--------|
| 1.8 | **Standardize “Access Denied”** — one `RoleGate` component replacing h1/h2/card/p variants | 6+ inconsistent patterns | Small-medium — component + swap 6 pages |
| 1.9 | **Add breadcrumbs to deep admin routes** (unmatched, yunite detail, upset-kills sub-pages, top-five-details) | Import/analytics workflows lose context | Small — PageHeader `breadcrumbs` prop |
| 1.10 | **Finish dialog migration** — remaining dialogs without `DialogBody` / `size` | Scroll/width inconsistencies | Small — ~5–10 files |

### Mobile quick wins

| # | Item | Why P1 | Effort |
|---|------|--------|--------|
| 1.11 | **Resolve double mobile hamburger** — site header OR sidebar bar, not both | Clutter on admin mobile | Small — hide site menu when sidebar bar active |
| 1.12 | **Ensure icon buttons meet min touch target** on primary admin tables | Usability | Small — `min-h-9 min-w-9` pass |

---

## P2 — High impact, medium effort

### Information architecture

| # | Item | Why P2 | Effort |
|---|------|--------|--------|
| 2.1 | **Build `/admin` hub page** (replace redirect) — card grid: People, Events, Analytics, Mods, Data | Reserved URL; staff need orientation | Medium — new page + route |
| 2.2 | **Consolidate Discord people workflows** — clarify Member Management Discord tab vs Discord Members page (merge, rename, or redirect) | #1 confusion cluster | Medium — IA decision + UI |
| 2.3 | **Unify Imports / Yunite** — single hub; demote debug; consistent `YuniteDashboard` props | 4 routes, split component | Medium — uploads refactor |
| 2.4 | **Expand Stats hub** — add tier-re-evaluation, holistic stats, average stats, data-cache links | Hidden analytics | Medium — stats.tsx + sidebar tweak |
| 2.5 | **Upset kills sub-nav** — tabs or secondary nav on hub for search/h2h/top/eliminations | 4 orphan sub-routes | Medium — upset-kills layout |
| 2.6 | **Scrim Series discoverability** — public nav link to `/scrim-series`; optional link from calendar only if event type maps to a series slug | Separate product from Spin; not a Spin sub-feature | Medium — nav + conditional links after data review |

### Component library

| # | Item | Why P2 | Effort |
|---|------|--------|--------|
| 2.7 | **`RoleGate` on `AdminPageLayout`** — optional `requireAdmin` / `requireModerator` props | Auth without authorization today | Medium — layout + route audit |
| 2.8 | **Shared `TierBadge` + `LegendCard`** | Duplicated across 4+ pages | Medium |
| 2.9 | **Shared `ConfirmDialog`** replacing `window.confirm` / `prompt` on Features & imports | Unprofessional destructive UX | Medium |
| 2.10 | **Unify edit-player dialogs** — admin + profile share core form; delete legacy | 3 implementations | Medium — extract shared fields |

### Page slimming (first wave)

| # | Item | Why P2 | Effort |
|---|------|--------|--------|
| 2.11 | **Split Features page** — move tools to Data, Imports, People sections; keep only true feature flags | Grab-bag page | Medium — relocate UI blocks |
| 2.12 | **Extract member-management tabs** to sub-routes (`/admin/members/applications`, etc.) | 1,250-line file | Medium — routing + shared layout |
| 2.13 | **Complete design-system migration** — remaining pages without `AdminPageLayout` / duplicate headers | Partial adoption | Medium — ~15 pages |

### Public product

| # | Item | Why P2 | Effort |
|---|------|--------|--------|
| 2.14 | **Add public nav items** — **Scrim Series** (`/scrim-series`, always); **Spin** (`/spin`, staff-only badge); **Wrapped** (seasonal) | Three distinct products; Spin ≠ Scrim Series | Medium — header + active states |
| 2.15 | **Wrapped shell decision** — keep immersive fullscreen OR add minimal nav exit | Trapped users | Medium — design choice |

---

## P3 — Nice to have

### Deep refactors

| # | Item | Notes |
|---|------|-------|
| 3.1 | Split `tier-re-evaluation.tsx` (~2,270 lines) | Extract table, filters, cache panel |
| 3.2 | Split `import-third-party.tsx` (~2,110 lines) | Per-source modules |
| 3.3 | Split `event-manager.tsx` (~1,360 lines) | CRUD vs ICS vs duo |
| 3.4 | Split `holistic-score-stats.tsx` | Table vs admin controls |
| 3.5 | Generic `DataTable` with sort/filter/pagination | Replace 20+ table implementations |

### UX enhancements

| # | Item | Notes |
|---|------|-------|
| 3.6 | Support ticket reference ID + optional status lookup for submitters | Closes public/admin loop |
| 3.7 | Punishment matrix as in-app help drawer (not standalone page) | Reference content |
| 3.8 | Admin search / command palette (jump to any route) | 40+ admin URLs |
| 3.9 | Notification center for cache rebuild / import completion | Long-running ops |
| 3.10 | Member self-service profile (if product direction changes) | Would change staff-only model |

### Visual & mobile polish

| # | Item | Notes |
|---|------|-------|
| 3.11 | Sticky table first column pattern everywhere | Mobile tables |
| 3.12 | Admin chat widget colission avoidance on mobile | Offset when FABs present |
| 3.13 | Reduce nested `border-2` cards (support tickets) | Visual weight |
| 3.14 | Icon semantic audit (unique icons per sidebar item) | Wayfinding |

### Infrastructure & docs

| # | Item | Notes |
|---|------|-------|
| 3.15 | Product glossary in repo (`PRODUCT_GLOSSARY.md`) | Onboarding |
| 3.16 | Route map diagram in docs | Staff training |
| 3.17 | E2E smoke tests for critical flows (import, member apply, support) | Regression safety |

---

## Product naming reference

| Name | Route | Notes |
|------|-------|-------|
| **Spin** | `/spin`, `/spin/:eventId` | Active product. Code under `scrims/` is legacy folder name. |
| **Scrim Series** | `/scrim-series`, `/scrim-series/:slug` | Active product. Leaderboard series — not Spin. |
| **Scrim** | *(none)* | Deprecated. No `/scrim` route. Remove from user-facing copy where it means Spin. |

---

### Sprint A (P1 bundle — ~1 week)

1. Terminology pass (Players/Members)  
2. Fix event-detail profile links  
3. Delete orphan dialogs  
4. Site header `Link` migration  
5. RoleGate + access denied standardization  
6. Breadcrumbs on deep routes  
7. Mobile hamburger dedupe  

### Sprint B (P2 foundation — ~2 weeks)

1. `/admin` hub page  
2. Stats hub expansion + cross-links  
3. Discord people IA decision + implementation  
4. Imports/Yunite hub consolidation (phase 1)  
5. Features page split (phase 1 — move dangerous ops to Data)  

### Sprint C (P2 components — ~2 weeks)

1. TierBadge, LegendCard, ConfirmDialog  
2. Edit-player dialog unification  
3. AdminPageLayout role props  
4. Upset-kills sub-nav  
5. Scrim Series public nav (not cross-linked to Spin)  

### Ongoing (P3)

- Mega-file splits as touch opportunities  
- DataTable abstraction when building new tables  
- Public nav campaigns per season  

---

## Success metrics

| Metric | Current (qualitative) | Target |
|--------|----------------------|--------|
| Admin routes reachable in ≤2 clicks from `/admin` hub | Many require sidebar memory | 100% hub or sidebar |
| Duplicate page titles (header + card) | Common on tabbed pages | Zero on migrated pages |
| Orphan components | 6+ dialogs | Zero |
| Access denied UI patterns | 4+ | 1 (`RoleGate`) |
| Public nav coverage of live products | 4/7 areas | 7/7 (with role badges) |
| Terminology glossary adherence | Ad hoc | Documented + linted in copy review |

---

## Dependencies

- **Design system** (`DESIGN_SYSTEM_V2.md`) — P1/P2 layout work should follow existing tokens  
- **Future `/admin` product** — user reserved URL; hub (2.1) unblocks marketing/admin onboarding  
- **Backend** — role gates (2.7) are UI-only unless Convex functions also enforce (verify separately)  

---

## Out of scope (explicit)

- Backend schema changes  
- New product features (e.g. member self-service) unless listed as P3 future  
- Wrapped creative redesign (immersive UX may stay exempt from standard shell)  

---

*Priorities reflect impact on staff daily workflows and public first impressions. Revisit after `/admin` hub ships and P1 terminology pass completes.*
