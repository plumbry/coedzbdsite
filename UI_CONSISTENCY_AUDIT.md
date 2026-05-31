# UI Consistency & Design System Audit

**Application:** Co-Ed ZBD Hub  
**Audit date:** 2026-05-31  
**Scope:** Layout, headers, forms, modals, tables/cards, typography — all routes in `src/App.tsx`  
**Companion docs:** `UI_DENSITY_AUDIT.md`, `DESIGN_SYSTEM_PROPOSAL.md`, `DESIGN_SYSTEM_V2.md`  
**Status:** Audit and proposals only — no code modified  

---

## Executive Summary

The application shares a **common component library** (shadcn/ui: Card, Dialog, Table, Input, Select) and **brand tokens** (`index.css`: primary blue, accent yellow, Open Sans). Despite that foundation, **each page implements its own layout shell, header pattern, and spacing rhythm**. The result feels like multiple products stitched together rather than one cohesive design system.

| Area | Consistency score | Primary issue |
|------|-------------------|---------------|
| Layout shells | **Low** | 5+ container patterns, 4 max-width families |
| Page headers | **Low** | No shared component; 6 title scales; 4 back-link patterns |
| Forms | **Medium-Low** | Label + raw HTML dominates; react-hook-form almost unused |
| Modals | **Medium** | Shared Dialog primitive, but 7 width tiers and inconsistent footers |
| Tables & cards | **Low** | CardTitle used as stat number, page title, and section title interchangeably |
| Typography | **Low** | h1 ranges from `text-xl` to `text-6xl` with no documented scale |

**Root cause:** No shared layout primitives (`PageShell`, `PageHeader`, `ModalForm`, `DataTableCard`). Pages copy-paste Tailwind with local preferences.

**Recommended fix:** Implement standards in `DESIGN_SYSTEM_V2.md` via 6 shared components and migrate pages in priority order (see § PageHeader adoption matrix).

---

## 1. Layout Consistency

### 1.1 Page widths — current state

| Max width | Tailwind | Pages using it |
|-----------|----------|----------------|
| 512px | `max-w-2xl` | Support |
| 896px | `max-w-4xl` | Tier Restrictions; Wrapped slide content |
| 1024px | `max-w-5xl` | Spin landing, Spin event detail |
| 1152px | `max-w-6xl` | User management, unmatched players; auth skeletons |
| 1280px | `max-w-7xl` | Index, Events, Player Profile, most admin |
| 1600px | `max-w-[1600px]` | Holistic score stats only |
| Full | `container` (no max) | Yunite tournament (no explicit max) |

**Inconsistency:** Spin/Scrim routes intentionally narrower (`max-w-5xl`) while Events/Index use `max-w-7xl` for similar list content. Support uses `max-w-2xl` on the **page** while equivalent forms in dialogs use `max-w-lg`–`max-w-2xl`.

### 1.2 Page padding — current state

| Pattern | Example pages | px | py |
|---------|---------------|----|----|
| Compact | Index loading, data-cache-status | `px-2`–`px-4` | `py-4` |
| Standard | Events, Player Profile | `px-4` | `py-8` |
| Loose | Support, Spin hero | `px-4`–`px-6` | `py-12` |
| Admin sidebar main | Most admin | — | `p-6` |
| Admin responsive | Member management, event-bans | `px-2`–`px-4` | `p-2 sm:p-6` |
| Admin outlier | Tier mismatches, tier-simulation, yunite-debug | — | `p-8` |
| No horizontal px | Leaderboard stats | — | `py-8` only |

**Count:** At least **9 distinct page padding combinations** across 46 routes.

### 1.3 Section spacing — current state

| Gap token | Usage |
|-----------|-------|
| `space-y-3` | tier-re-evaluation, holistic-score-stats (compact admin) |
| `space-y-4` | player-comparison, event-bans, scrim-series admin |
| `space-y-6` | Index, upset-kills, data-backup, player profile, most forms |
| `space-y-8` | tier-impact, yunite-debug, spin event-page content |

No page uses a shared section wrapper; gaps are inline on each root div.

### 1.4 Container layout patterns

Five layout families coexist:

```
A. SiteHeader + container mx-auto     → Index, Events, Support, Player Profile
B. SiteHeader + mx-auto (no container) → Spin, Scrim Series
C. AdminSidebar + main p-6 + max-w-7xl → member-management, events-manager, etc.
D. AdminSidebar + container mx-auto    → holistic-score-stats, player-comparison
E. Container only (no sidebar/header) → upset-kills, fuzzy-matches, average-stats, yunite-debug
```

**Issue:** Family E admin pages feel like a different app (no sidebar, inconsistent nav).

### 1.5 Grid layouts — current state

| Grid pattern | Used for | Pages |
|--------------|----------|-------|
| `md:grid-cols-2 lg:grid-cols-3 gap-6` | Event cards, spin cards | Events, Spin, Scrim Series |
| `md:grid-cols-3 gap-4` | Stat cards | Index (admin), data-backup |
| `md:grid-cols-4 gap-4` | Stat cards | upset-kills, in-game-earnings, data-cache |
| `lg:grid-cols-2 gap-6` | Side-by-side panels | tier-simulation |
| `sm:grid-cols-2 gap-3` | Form field pairs | create-ban-dialog, edit-player-dialog |
| `grid-cols-2 gap-4` | Form fields | edit-player-dialog (fixed 2-col) |

**Inconsistency:** Stat summaries use 3-col, 4-col, or inline cards depending on page author. Form dialogs use `gap-3`, `gap-4`, or `gap-6` for the same 2-column field layout.

### 1.6 Recommended single standard

| Property | Standard |
|----------|----------|
| **Page width** | `max-w-7xl mx-auto w-full` for all list/table/dashboard pages |
| **Narrow pages** | `max-w-lg mx-auto` inner wrapper inside standard shell (Support) |
| **Wide pages** | `max-w-[1600px]` only for holistic-score-stats |
| **Page padding** | `px-4 md:px-6 py-4` on `<main>` |
| **Admin main padding** | `p-4 md:p-5` inside sidebar layout |
| **Section spacing** | `space-y-4` between PageHeader, toolbar, and content |
| **Grid — stats** | Single `MetricStrip` component (horizontal, not card grid) |
| **Grid — forms** | `grid grid-cols-1 sm:grid-cols-2 gap-4` for paired fields |
| **Grid — cards** | Mobile/list fallback only; table on `md+` for row data |

---

## 2. Header Consistency

### 2.1 Page header patterns found

| Pattern ID | Structure | Example routes |
|------------|-----------|----------------|
| **H1** | Icon + h1 + subtitle block, no actions | Index, Events, average-stats |
| **H2** | h1 only, no subtitle | tier-mismatches, fuzzy-matches |
| **H3** | CardTitle as page title (no h1) | events-manager, event-results, user-management, discord-members, audit |
| **H4** | Border-b hero band + h1 inside | Spin, Scrim Series landing/leaderboard |
| **H5** | Back link separate row, then h1 | Tier Restrictions, Player Profile, event-detail |
| **H6** | Back Button (not link) + content | Player Profile (`Button variant="secondary"`) vs event-detail (`Button variant="ghost"`) |
| **H7** | h1 + inline actions row | event-bans-manager (**reference**), Spin landing |
| **H8** | No page header at all | upset-kills (title only), stats hub (minimal h1) |
| **H9** | Auth gate h1 centered | ~15 admin pages: `text-4xl` centered |

### 2.2 Title size at page level

| Class | Routes (sample) |
|-------|-----------------|
| `text-xl` | scrim-series admin, event-bans |
| `text-2xl` | Tier Restrictions, stats hub, upset-kills top, data-backup denied |
| `text-2xl md:text-3xl` | member-management |
| `text-3xl` | Events, most admin stats, tier-mismatches, player profile CardTitle |
| `text-3xl md:text-4xl` | Index |
| `text-4xl` | Auth gates, yunite-debug, wrapped-editor |
| `text-6xl` | Wrapped, 404, wrapped-preview |

**7 distinct page title scales** on otherwise similar admin list pages.

### 2.3 Subtitle placement

| Style | Routes |
|-------|--------|
| `p.text-muted-foreground` below h1 | Index, Events, event-bans, Tier Restrictions |
| `CardDescription` below CardTitle (inside card, not page) | Support, many admin cards |
| `text-xs sm:text-sm text-muted-foreground` | event-bans (responsive) |
| Italic helper line | Events `(ignore leaderboards, Plum is lazy!)` |
| No subtitle | tier-mismatches, fuzzy-matches, upset-kills |
| Subtitle in hero band | Spin, Scrim Series (`text-sm ml-10`) |

### 2.4 Action buttons in headers

| Placement | Routes |
|-----------|--------|
| Right of title row (`flex justify-between`) | event-bans, Spin landing, player profile (edit buttons) |
| Below title | Rare |
| In SiteHeader only | Add Player (admin), auth buttons |
| In card header, not page header | Index filters, Events filters |
| No actions | Most admin stats pages |

**Issue:** Primary actions (Create, Export, Sync) appear in page headers, card headers, or floating toolbars with no rule.

### 2.5 Breadcrumbs / back navigation

| Pattern | Routes |
|---------|--------|
| `Breadcrumb` component | **Unused** anywhere (component exists at `ui/breadcrumb.tsx`) |
| Text link + ArrowLeft | Tier Restrictions (`Back to Players`) |
| Button secondary + ArrowLeft | Player Profile |
| Button ghost + ArrowLeft | event-detail, average-stats, tier-simulation |
| Icon-only ArrowLeft link | Scrim Series leaderboard, yunite-tournament |
| No back affordance | Most admin sidebar pages (rely on sidebar) |

**4 back-navigation variants** for the same “return to list” behavior.

### 2.6 Header height & spacing beneath

| Spacing below header | Routes |
|---------------------|--------|
| `mb-8` | Events, Tier Restrictions |
| `mb-6` | event-detail, player profile back button |
| `mb-4` | features page denied state |
| `mb-2` | player-comparison, spin-moderation |
| `mb-0` (gap via space-y) | event-bans |
| Hero band + separate content `py-8` | Spin (~120px total header zone) |

### 2.7 Proposed `PageHeader` component

```tsx
// src/components/page-header.tsx (proposed)

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  back?: { label: string; href: string };
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  size?: "default" | "compact";  // compact for admin
}

// Layout:
// [breadcrumbs?]
// [back link?]  (text link, not button — consistent with Tier Restrictions)
// row: [icon?] [title + description stack] [actions]
// spacing: mb-0 (parent space-y-4 handles gap)
```

**Typography inside PageHeader:**
- Title: `text-xl md:text-2xl font-bold tracking-tight` (admin: `text-lg md:text-xl`)
- Description: `text-sm text-muted-foreground`
- Icon: `h-5 w-5 text-primary`

### 2.8 PageHeader adoption matrix

Every route should use `PageHeader` except Wrapped/404 auth gates (use `AuthGate` instead).

| Route | Current pattern | PageHeader config |
|-------|-----------------|-------------------|
| `/` | H1 icon + subtitle | title="Members", icon=Users, description=… |
| `/player/:username` | Back Button + content | back={Players}, title=username (in content — split header) |
| `/events` | H1 + filters below | title, icon=Calendar, description; filters in `PageToolbar` sibling |
| `/events/:id` | Ghost back + h1 | back={Events}, title=event.name |
| `/support` | CardTitle inside card | title="Support" **outside** card |
| `/tier-restrictions` | Link back + h1 | back={Players}, title, icon=Shield |
| `/spin` | Hero band | **Replace hero** with PageHeader + actions=Create |
| `/spin/:eventId` | Custom header band | PageHeader compact + event actions |
| `/scrim-series` | Hero band | PageHeader |
| `/scrim-series/:slug` | Hero + back icon | back + title=series.name |
| `/2025-wrapped` | Full-screen | **Exempt** — storytelling layout |
| `*` 404 | Centered | **Exempt** — use `EmptyState` |
| `/admin/member-management` | h1 in content | title, size=compact |
| `/admin/stats` | h1 text-2xl | title="Stats" |
| `/admin/tier-re-evaluation` | h1 compact | title, size=compact |
| `/admin/tier-simulation` | h1 + back button | back + title |
| `/admin/average-stats` | h1 + back | back + title |
| `/admin/holistic-score-stats` | h1 | title |
| `/admin/player-comparison` | h1 text-3xl | title, size=compact |
| `/admin/top-five-details` | h1 | title |
| `/admin/leaderboard-stats` | h1 | title |
| `/admin/data-cache-status` | h1 | title |
| `/admin/data-backup` | h1 | title |
| `/admin/user-management` | **No h1** — CardTitle only | **Add** PageHeader |
| `/admin/discord-members` | **No h1** | **Add** PageHeader |
| `/admin/fuzzy-matches` | h1 text-3xl | title |
| `/admin/unmatched/:id` | CardTitle only | **Add** PageHeader |
| `/admin/yunite/:id` | h1 text-3xl | title=tournament name |
| `/admin/yunite-debug` | h1 text-4xl | title, normalize to default scale |
| `/admin/events-manager` | CardTitle text-sm only | **Add** PageHeader |
| `/admin/event-results` | CardTitle only | **Add** PageHeader |
| `/admin/uploads` | CardTitle only | **Add** PageHeader |
| `/admin/support` | CardTitle in panel | **Add** PageHeader |
| `/admin/audit` | CardTitle only | **Add** PageHeader |
| `/admin/features` | h1 text-3xl | title |
| `/admin/player-earnings` | CardTitle only | **Add** PageHeader |
| `/admin/member-management` | ✓ has h1 | Migrate to PageHeader |
| `/admin/2025-wrapped-editor` | h1 text-4xl | title, size=default |
| `/admin/2025-wrapped-preview` | **Exempt** | storytelling |
| `/admin/upset-kills` (+ subs) | h1 text-2xl/3xl mixed | unify title + add sidebar |
| `/admin/tier-impact` | h1 | title |
| `/admin/stats` | h1 | title |
| `/admin/tier-mismatches` | h1 text-3xl | title |
| `/admin/in-game-earnings` | h1 | title |
| `/admin/event-bans` | **Reference** event-bans-manager | Migrate to PageHeader |
| `/admin/punishment-matrix` | h1 text-2xl | title |
| `/admin/scrim-series` | h1 text-xl | title |
| `/admin/spin-moderation` | h1 text-3xl | title — normalize scale |
| All auth gates | text-4xl centered | **AuthGate** component |

**Pages missing semantic h1 today (a11y gap):** user-management, discord-members, events-manager, event-results, uploads, support admin, audit, player-earnings, unmatched players — **9 routes**.

---

## 3. Forms & Inputs

### 3.1 Form implementation approaches

| Approach | Files | Count |
|----------|-------|-------|
| Raw `<form>` + `Label` + `Input` | support, add-player-dialog, edit-player-dialog, create-ban-dialog, scrims, etc. | ~35+ |
| react-hook-form + `Form`/`FormField` | **Only defined in `form.tsx`** — **zero page usage** | 0 |
| `Field`/`FieldGroup` (`field.tsx`) | **Unused in pages** | 0 |

**Critical gap:** Two advanced form primitives exist but pages use inconsistent manual markup.

### 3.2 Text inputs

| Property | Standard (`input.tsx`) | Deviation examples |
|----------|------------------------|-------------------|
| Height | `h-9` (36px) | event-bans qty input `h-7 sm:h-8`; admin-dashboard select `h-8 text-xs` |
| Width | `w-full` default | Many fixed: `w-12`, `w-64`, `w-[200px]` without responsive fallback |
| Search pattern | — | Index: `pl-8` + Search icon; create-ban: `pl-9`; upset-kills: `min-w-[250px] max-w-[400px]` |

**Search field inconsistency:** 3 different left-padding values (`pl-8`, `pl-9`, `pl-2`) for search icons.

### 3.3 Select menus

| Property | Standard (`select.tsx`) | Deviation |
|----------|-------------------------|-----------|
| Default width | `w-fit` on trigger | Index: `w-full sm:w-32`; scrim-series admin: `w-64`, `w-36`, `w-48`; third-parties: `w-[180px]` |
| Height | `h-9` default, `h-8` sm size | Mixed `h-8 text-xs` in dashboards |
| Label | Sometimes absent | Filter selects on Events have external `p.text-sm font-medium mb-2` labels |

**Rule violation:** Select triggers use arbitrary fixed widths (`w-32`, `w-36`, `w-48`, `w-64`) with no shared size tokens.

### 3.4 Textareas

| Property | Standard | Deviation |
|----------|----------|-----------|
| Min height | `min-h-16` | Support: `rows={8}` (~192px fixed) |
| Resize | — | Support: `resize-none` |

### 3.5 Date pickers

Calendar component exists (`ui/calendar.tsx`). Usage:

| Context | Pattern |
|---------|---------|
| event-manager | Calendar in popover — standard |
| event-bans-manager | Date inputs — standard |
| ics-import-dialog | Date field |
| import-third-party | Multiple date fields |
| tier-snapshot-tool | Date range |

**Inconsistency:** Some dates use native `<Input type="date">`, others use Calendar popover — not audited as unified DateField component.

### 3.6 Label placement

| Pattern | Usage |
|---------|-------|
| `Label` above field, `space-y-2` wrapper | support, create-ban, most dialogs |
| `Label` with no `htmlFor` | create-ban-dialog search field |
| `p.text-sm font-medium mb-2` as fake label | Events filter section |
| `FormLabel` | unused |
| `FieldLabel` | unused |
| Inline label in grid | edit-player-dialog 2-col grids |

### 3.7 Validation messages

| Pattern | Usage |
|---------|-------|
| `toast.error()` on submit | support, scrims |
| `FormMessage` | unused |
| `FieldError` | unused |
| Inline red text | rare |
| HTML5 `required` only | support |

**No consistent inline validation UI** — all feedback via toast.

### 3.8 Form spacing

| `space-y` in forms | Dialogs using it |
|--------------------|------------------|
| `space-y-4` | username-setup, edit-username, add-event |
| `space-y-6` | add-player, edit-player, edit-member, score-player, support |

### 3.9 Recommended form rules

| Rule | Specification |
|------|---------------|
| **Field wrapper** | `div.space-y-1.5` with Label + control + helper |
| **Label** | Always `Label htmlFor={id}`; required fields suffix `*` |
| **Input width** | `w-full` in forms; fixed width only in toolbars with `w-[var(--filter-width)]` token (160px sm, 200px md) |
| **Input height** | Always `h-9`; compact toolbar variant `h-8` via `size="sm"` prop |
| **Select width** | `w-full` in forms; `w-[160px]` or `w-[200px]` in filter toolbars only |
| **Search** | Shared `SearchInput` component: `pl-9`, icon `left-3` |
| **Validation** | Inline `text-destructive text-xs mt-1` below field; toast for submit failures only |
| **Form spacing** | `space-y-4` between fields; `space-y-6` only for multi-step wizards |
| **2-column fields** | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| **Date** | Single `DatePicker` wrapper (Calendar + Popover) everywhere |

---

## 4. Modal & Popup Consistency

### 4.1 Base Dialog primitive

`dialog.tsx` defaults:
- Width: `sm:max-w-lg` (512px)
- Padding: `p-6`
- Gap: `gap-4`
- Close: X button top-right, always visible unless overridden
- Footer: `flex-col-reverse sm:flex-row sm:justify-end`

### 4.2 Modal width inventory

| Width class | px | Dialogs |
|-------------|-----|---------|
| `sm:max-w-sm` | 384 | scrims unlock, scrims event-page edit |
| `sm:max-w-md` / `max-w-md` | 448 | username-setup, edit-username, ics-import, scrims create, reject-player, new-application (step 1) |
| `sm:max-w-lg` / default | 512 | create-ban, alert-dialog default |
| `max-w-xl` | 576 | manage-discord-ids |
| `max-w-2xl` | 672 | add-player, edit-player (×2), add-event, match-to-player, event-manager, import-third-party (×2), edit-member, archive, duo dialogs |
| `max-w-3xl` | 768 | team-combo-calculator, score-player, new-application (eval step), edit-application (eval), import-third-party |
| `max-w-4xl` | 896 | import-players, merge-players (×2), role-mismatch, upset-kills (×2), upset-kills-search, eliminations detail |
| `max-w-5xl` | 1024 | expanded-performance |
| `max-w-6xl` | 1152 | fuzzy-matches, tier-re-evaluation |

**7 width tiers** for functionally similar forms (most could be `md` or `lg`).

### 4.3 Proposed modal size scale

| Size token | Class | Use case |
|------------|-------|----------|
| `sm` | `sm:max-w-md` | Confirmations, 1–3 fields, username |
| `md` | `sm:max-w-lg` | Standard CRUD forms (default) |
| `lg` | `sm:max-w-2xl` | Complex forms, 8+ fields, player edit |
| `xl` | `sm:max-w-4xl` | Data tables inside modal, import preview |
| `full` | `sm:max-w-6xl` | Rare: fuzzy match review, tier eval modal |

### 4.4 Padding inconsistencies

| Pattern | Dialogs |
|---------|---------|
| Default `p-6` (from primitive) | Most |
| Extra `py-4` on body div | create-ban, scrims edit |
| `pr-2` on scrollable form | score-player-dialog |
| Custom `p-8` | None in dialogs (good) |
| No padding override | Standard |

**Issue:** Scrollable forms add ad-hoc `overflow-y-auto flex-1 pr-2` instead of shared `DialogScrollArea`.

### 4.5 Footer button layouts

| Pattern | Dialogs |
|---------|---------|
| Default `DialogFooter` (Cancel left, Primary right on sm+) | Most |
| Custom `justify-between` | edit-application-dialog (back + next) |
| Buttons outside DialogFooter | scrims event-page (inline `flex justify-end gap-2`) |
| Single button footer | archive-player |
| No footer — submit in form | some import dialogs |

**Button order inconsistency:** Most use Cancel → Submit (right). Multi-step uses Back ← → Next with `justify-between`.

**Destructive actions:** Not consistently placed (should be left-aligned or secondary variant on left).

### 4.6 Close controls

| Control | Usage |
|---------|-------|
| X icon (default) | All DialogContent unless `showCloseButton={false}` |
| Cancel button only | Some footers |
| Click outside | Blocked on username-setup (`onInteractOutside preventDefault`) |

AlertDialog: no X button — Cancel + Action only (correct pattern).

### 4.7 Horizontal overflow risks

| Dialog | Risk |
|--------|------|
| fuzzy-matches `max-w-6xl` | Wide table — uses `overflow-hidden flex flex-col` ✓ |
| tier-re-evaluation `max-w-6xl` | `overflow-y-auto` ✓ |
| import-players `max-w-4xl` | CSV preview tables — needs `min-w-0` on flex children |
| edit-application eval grids | `md:grid-cols-3` — OK at lg width |

### 4.8 Proposed modal standard

```tsx
// Size variants on DialogContent
<DialogContent size="md">  // sm:max-w-lg
  <DialogHeader>...</DialogHeader>
  <DialogBody>  // max-h-[min(70vh,640px)] overflow-y-auto px-0
    {/* form fields w-full */}
  </DialogBody>
  <DialogFooter>
    <Button variant="outline">Cancel</Button>
    <Button type="submit">Save</Button>
  </DialogFooter>
</DialogContent>
```

| Rule | Specification |
|------|---------------|
| Default size | `md` (512px) |
| Form fields | `w-full` always inside modal |
| Body scroll | `max-h-[70vh] overflow-y-auto`; header/footer fixed |
| Footer | Always `DialogFooter`; Primary right, Cancel outline left |
| Destructive | Left side or `variant="destructive"` with confirm AlertDialog |
| Multi-step | Footer `justify-between`; Back (ghost) left, Next (default) right |
| No horizontal overflow | `min-w-0` on flex children; tables `overflow-x-auto` |

### 4.9 Modal migration list

| Dialog file | Current width | → Proposed |
|-------------|---------------|------------|
| username-setup, edit-username, ics-import, reject-player | md/sm | `sm` |
| create-ban, match-to-player, add-event | lg/md | `md` |
| add-player, edit-player (all), edit-member, event-manager | 2xl | `lg` |
| score-player, team-combo, new-application eval | 3xl | `lg` |
| import-players, merge-players, role-mismatch | 4xl | `xl` |
| upset-kills modals | 4xl | `xl` |
| fuzzy-matches, tier-re-evaluation | 6xl | `full` |
| expanded-performance | 5xl | `xl` |

---

## 5. Tables & Cards

### 5.1 Table implementations

| Type | Usage |
|------|-------|
| shadcn `Table` component | Index, member-management, most admin |
| Raw `<table>` HTML | event-bans-manager (desktop), scrim-series admin panels |
| Custom div grid as table | scrim-series leaderboard |
| PairingsTable custom | scrims event-page |

**3 table implementations** with different row heights and header styles.

### 5.2 Table styling inconsistencies

| Property | ui/table.tsx default | Deviations |
|----------|---------------------|------------|
| Head height | `h-10` | member-management `[&_td]:py-1.5`; scrim-series `py-1.5` raw cells |
| Cell padding | `p-2` | event-bans raw table `p-3` |
| Header font | `font-medium` | Some pages add `text-xs uppercase` (leaderboard) |
| Container | overflow-x-auto wrapper | Some tables inside Card with double padding |
| Sticky header | None | Should be standard for long admin tables |

### 5.3 Stat cards

| Pattern | Example | Issue |
|---------|---------|-------|
| Card + CardHeader + `text-2xl` number | Index admin stats | CardTitle used for label, div for value |
| Card + CardTitle as **the number** `text-3xl` | tier-mismatches counts | CardTitle semantic misuse |
| CardContent only with icon + number | event-bans stats | **Better** — compact |
| Inline `text-3xl font-bold` in CardContent | upset-kills, data-backup | Color-coded numbers, no shared StatCard |
| Metric in filter bar | upset-kills-top | Different again |

**CardTitle class confusion:**

| CardTitle content | Routes |
|-------------------|--------|
| Section label (`text-sm`) | admin-dashboard, event-manager |
| Stat label (`text-sm font-medium`) | Index |
| **Stat value (`text-3xl`)** | tier-mismatches |
| Page-level title | Support card |
| Player name (`text-3xl`) | player-profile |

### 5.4 Information cards

| Property | Card default | event-bans | Events EventCard |
|----------|--------------|------------|------------------|
| Border radius | `rounded-xl` | same | same |
| Padding | `py-6 px-6` | `p-2 sm:p-6` responsive | full default |
| Header pb | default | `pb-3` override | `pb-3` |
| Gap | `gap-6` | — | — |

### 5.5 Dashboard widgets

admin-dashboard (legacy monolith) vs features/page vs stats hub — three different dashboard layouts:
- Tab panels with `text-sm` CardTitles
- Link grid with `text-base` CardTitles
- Sidebar sections with nested cards

### 5.6 Recommended shared components

| Component | Purpose |
|-----------|---------|
| `DataTable` | Table + `rounded-lg border` wrapper, optional sticky header, `p-0` |
| `StatCard` | icon + label + value; value uses `text-lg font-bold`, never CardTitle |
| `MetricStrip` | Horizontal stats row for 3–5 scalars |
| `PanelCard` | Card with `text-sm font-medium` header — section grouping |
| `InfoCard` | Read-only key-value; compact `p-4` |

| Rule | Specification |
|------|---------------|
| Border radius | `rounded-lg` on cards, tables, modals (align with V2) |
| Card padding | `p-4`; stat cards `p-3 sm:p-4` |
| Card header | `text-sm font-medium text-foreground`; never use CardTitle for numeric values |
| Stat value typography | `text-lg font-bold tabular-nums` (admin); `text-2xl` max for hero stats only |
| Table row height | `h-9` cells default; dense variant `py-1.5` opt-in |
| Table in card | Card `className="p-0"` — table flush to edges |

---

## 6. Typography

### 6.1 Current usage audit

| Role | Expected single scale | Actual range found |
|------|----------------------|-------------------|
| Page title (h1) | 1 size | `text-xl` – `text-6xl` (7 sizes) |
| Section title (h2) | 1 size | `text-lg` – `text-2xl` |
| Card title | 1 size | `text-sm` – `text-3xl` (CardTitle misused) |
| Body | 1 size | `text-sm` (good — mostly consistent) |
| Label | 1 size | `text-sm font-medium` (good) |
| Button | 1 size | `text-sm` via button.tsx (good) |
| Caption/helper | 1 size | `text-xs` – `text-sm` mixed |
| Stat numbers | 1 size | `text-lg` – `text-3xl` |

### 6.2 Font weights

| Weight | Usage |
|--------|-------|
| `font-bold` | Page titles, stat numbers, nav links |
| `font-semibold` | Dialog titles, some h2 |
| `font-medium` | Labels, table headers, card titles |

Generally consistent — issue is **size**, not weight.

### 6.3 Font families

- `--font-sans`: Open Sans (consistent via theme)
- `font-mono`: Discord IDs, link codes, API debug — appropriate semantic use
- No rogue serif on pages (Georgia in theme unused)

### 6.4 Recommended typography scale

See `DESIGN_SYSTEM_V2.md` for canonical tokens. Summary:

| Token | Size | Weight | Element |
|-------|------|--------|---------|
| `text-page-title` | xl / 2xl responsive | bold | h1 |
| `text-section-title` | lg | semibold | h2 |
| `text-card-title` | sm | medium | h3 / CardHeader |
| `text-body` | sm | normal | p, td |
| `text-label` | sm | medium | label |
| `text-caption` | xs | normal | helpers |
| `text-stat` | lg | bold | numeric highlights |
| `text-button` | sm | medium | buttons (existing) |

---

## 7. Cross-Cutting Inconsistencies

### 7.1 Buttons in toolbars

| Size | Context |
|------|---------|
| `size="sm"` | event-bans, member-management, spin-moderation |
| Default | Events, Index |
| Mixed in same row | event-bans (sm buttons + h-7 input) |

**Standard:** Toolbar actions `size="sm"`; page-level primary CTA `default`.

### 7.2 Badges

Mostly consistent via `badge.tsx`. Tier badges on Tier Restrictions use custom inline spans — intentional brand exception.

### 7.3 Tabs

| Pattern | Pages |
|---------|-------|
| Horizontal TabsList | Events (nested double tabs), member-management, player profile |
| TabsList as grid | member-management `md:grid-cols-5` |
| Underline-style | None — all use pill TabsList |

Events double-nested tabs are a **unique pattern** not reused elsewhere.

### 7.4 Loading states

| Pattern | Usage |
|---------|-------|
| Skeleton block | Most pages |
| Full viewport centered Skeleton | Auth loading (~15 pages) |
| Spinner icon animate | Sync buttons only |

### 7.5 Empty states

All use shared `Empty` component — good. Padding inconsistent (see density audit).

---

## 8. Cohesion Score by Section

| App section | Layout | Header | Forms | Modals | Tables | Type | Overall |
|-------------|--------|--------|-------|--------|--------|------|---------|
| Public — Members | ⚠️ | ⚠️ | — | ⚠️ | ✅ | ⚠️ | **C+** |
| Public — Events | ⚠️ | ⚠️ | ⚠️ | — | ⚠️ | ⚠️ | **C** |
| Public — Support | ⚠️ | ⚠️ | ⚠️ | — | — | ⚠️ | **C** |
| Public — Spin/Scrim | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | **D+** |
| Admin — Sidebar pages | ⚠️ | ❌ | ⚠️ | ⚠️ | ✅ | ⚠️ | **C** |
| Admin — Standalone | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | **C-** |
| Admin — event-bans | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **A-** (reference) |
| Wrapped | ✅* | ✅* | — | — | — | ✅* | **Exempt** |

*Cohesive within its own fullscreen idiom — exempt from standard shell.

---

## 9. Implementation Priority

| Phase | Work | Pages affected |
|-------|------|----------------|
| **1 — Primitives** | PageHeader, PageShell, Dialog size variants, SearchInput, StatCard | All |
| **2 — Global UI** | Card, Empty, dialog.tsx size prop | All |
| **3 — Public** | Index, Events, Support, Tier Restrictions, Spin | 5 routes |
| **4 — Admin shell** | Unify sidebar + main padding; add PageHeader to h1-less pages | 20+ routes |
| **5 — Modals** | Width migration per §4.9 | 30+ dialogs |
| **6 — Forms** | space-y-4, w-full, SearchInput, DatePicker | 35+ forms |

---

## 10. Reference Implementations (Keep)

| Pattern | File | Why |
|---------|------|-----|
| Page header with actions | `event-bans-manager.tsx` L148–196 | Closest to proposed PageHeader |
| Responsive admin padding | `event-bans.tsx` `p-2 sm:p-6` | Breakpoint-aware |
| Mobile/table dual layout | `event-bans-manager.tsx` | Consistent data display |
| Dialog form structure | `create-ban-dialog.tsx` | Label + space-y-2 + DialogFooter |
| Compact admin density | `tier-re-evaluation.tsx` | space-y-3 shell |

---

*See `DESIGN_SYSTEM_V2.md` for the consolidated standards to implement. See `UI_DENSITY_AUDIT.md` for spacing-specific recommendations.*
