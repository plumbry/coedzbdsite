# Workflow Standards

**Application:** Co-Ed ZBD Hub  
**Date:** 2026-05-31  
**Status:** Standards proposal — no code modified  
**Based on:** `WORKFLOW_AUDIT.md`  
**Companion docs:** `UI_CONSISTENCY_AUDIT.md`, `DESIGN_SYSTEM_V2.md`, `PRODUCT_CLEANUP_AUDIT.md`

---

## Purpose

These standards define how workflows should be designed so common tasks require **fewer clicks, fewer page loads, fewer modals, and less context switching**. Every new feature and every page migration should be evaluated against these rules.

---

## Core Principles

### 1. Minimize clicks

| Rule | Standard |
|------|----------|
| **Two-click rule** | Any daily task a role performs should complete in ≤2 clicks from that role's home surface, excluding typing |
| **No dead-end navigation** | Every link must lead to content the current user can access; gate before rendering, not after navigation |
| **One action, one click** | High-frequency actions (accept, archive, save) should not require confirmation unless irreversible |
| **Confirm destructive actions** | Delete, grant admin, bulk remove, and accept-with-side-effects require styled confirmation — never silent |

**Home surfaces:**

| Role | Home surface |
|------|--------------|
| Public member | `/` (Members directory) |
| Staff (mod+) | `/admin` (Admin Hub with operational widgets) |
| Admin | `/admin` |

### 2. Minimize page loads

| Rule | Standard |
|------|----------|
| **Single-page lifecycle** | Related steps in a workflow (create → configure → review) stay on one route using tabs, drawers, or steppers |
| **Drawer over route** | Detail views (player profile, event detail, ticket detail) open in a side drawer when accessed from a list — reserve full routes for deep-linkable share URLs |
| **Tab persistence** | Tab state syncs to URL (`/page/:tab`) so refresh and share restore context |
| **No ping-pong** | If page A links to page B for an action that affects page A's data, embed that action on page A instead |

**Anti-patterns to eliminate:**

- Events Manager → Uploads → Event Results for one event workflow
- Event Bans → Punishment Matrix → back for ban creation
- Tier Re-Evaluation → Tier Simulation for what-if analysis
- Member Management → Discord Directory for the same player

### 3. Minimize modals

| Rule | Standard |
|------|----------|
| **≤5 fields → modal or popover** | Quick edits stay in modals |
| **6–12 fields → stepped modal or drawer** | Break into 2–3 logical steps with progress indicator |
| **>12 fields → full page or drawer** | Event create/edit, application scoring, wrapped editor |
| **No modal stacking** | Maximum one modal open at a time; use drawer for secondary detail |
| **No modal for read-only** | Display reference data inline (punishment matrix, offense history) — not in a separate page or modal |

**Modal footer standard:**

```
[Cancel]  [Primary Action]
```

One primary save button. No "Save Info Only" / "Save All" splits — use steps instead.

### 4. Minimize context switching

| Rule | Standard |
|------|----------|
| **Context panel** | List pages include a collapsible side panel for related data (player info while reviewing applications, offense history while creating bans) |
| **Inline reference** | Read-only lookup tables (punishment matrix, tier rules) render as collapsible sections within the action form |
| **Breadcrumb actions** | Page headers show contextual quick actions for the entity being viewed, not just global actions |
| **Cross-link with preview** | Links to related pages open preview drawers when possible; full navigation only when deep work is needed |

### 5. Maximize inline actions

| Rule | Standard |
|------|----------|
| **Actions on the row** | Primary actions appear on the data row/card, not in a separate menu or page |
| **Labeled buttons** | Row actions use text labels (or label + icon), not icon-only — especially for actions with similar icons (Edit vs Status vs Score) |
| **Inline edit for single fields** | Status badges, tier badges, and toggle fields editable inline with click-to-edit |
| **Consistent action order** | Across all tables: View/Edit → Primary action → Destructive (rightmost, red) |
| **Hover affordance** | Row actions visible on hover for dense tables; always visible on mobile |

**Standard row action labels:**

| Action | Label | Icon | Variant |
|--------|-------|------|---------|
| Edit | "Edit" | Pencil | ghost |
| Score/Evaluate | "Score" | Award | ghost |
| Change status | "Status" | UserCheck | ghost |
| View profile | "View" | ExternalLink | ghost |
| Delete | "Delete" | Trash | ghost destructive |
| Archive | "Archive" | Archive | ghost |

### 6. Maximize bulk operations

| Rule | Standard |
|------|----------|
| **Checkbox column** | Every admin table with ≥5 rows supports multi-select |
| **Bulk action bar** | Selecting ≥1 row reveals a sticky toolbar: "N selected → [Action 1] [Action 2] [Cancel]" |
| **Bulk confirm once** | One confirmation dialog for bulk destructive actions, showing count and summary |
| **Select all filtered** | "Select all N matching filter" option when filters are active |
| **Sensible bulk actions per page** | See table below |

**Required bulk actions by page:**

| Page | Bulk actions |
|------|--------------|
| Applications | Accept, Reject (with reason), Delete |
| Accepted members | Change status, Export |
| Event bans | Delete, Decrement events |
| Event results | Delete |
| Tier Re-Evaluation | Apply tier, Compare, Export |
| Tier Mismatches | Re-evaluate |
| Support tickets | Archive, Delete |
| Discord Directory | Match, Convert |
| Fuzzy Matches | Accept match |

### 7. Faster common task completion

| Rule | Standard |
|------|----------|
| **Quick actions on hub** | Admin Hub shows top 3 daily actions as prominent buttons (New Application, Create Event, Create Ban) |
| **Operational widgets** | Admin Hub shows counts with links: pending applications, open tickets, tier mismatches, active bans |
| **Smart defaults** | Forms pre-fill from context (selected row, last-used values, offense history) |
| **Auto-apply suggestions** | When the system calculates a suggestion (ban penalty, tier), apply it by default with one-click override |
| **Keyboard shortcuts** | Admin tables: `j/k` navigate rows, `Enter` open detail, `a` select all, `Escape` deselect |
| **Recent items** | Track last 5 viewed players/pages in localStorage; show on Admin Hub |

---

## Data Entry Standards

### Form design

| Rule | Standard |
|------|----------|
| **Shared schemas** | One Zod schema per entity (Player, Application, Event, Ban) shared across all forms that edit it |
| **Required field marking** | Required fields marked with `*`; optional fields unmarked (no "optional" label unless ambiguous) |
| **Progressive disclosure** | Advanced fields collapsed by default; expand on demand |
| **No repeated entry** | If data exists on the selected entity, pre-fill it — never ask for Discord username twice in the same workflow |
| **Validation on blur** | Field-level validation fires on blur, not only on submit |
| **Single submit** | One primary submit button per form step |

### Field defaults

| Entity | Field | Default source |
|--------|-------|----------------|
| Ban | Type, events, track | Offense history → auto-apply suggested penalty |
| Ban | Reason | Empty (user must confirm) |
| Event | Type, mode | Last used (localStorage) or `scrim` / `ZB Main Map` |
| Member status | Archive reason | `"left server"` |
| Member status | Rejection reason | `"Incomplete Application"` |
| Application scores | All categories | Empty; tier presets fill on button click |
| Export filters | Tiers, statuses | All selected |

### Confirmation standards

| Action type | Confirmation |
|-------------|--------------|
| Save / update | Toast only |
| Accept application | Confirm dialog or 5s undo toast |
| Reject application | Reason select + confirm |
| Delete single item | Styled AlertDialog with item name |
| Delete bulk | AlertDialog with count: "Delete N items?" |
| Grant admin role | Confirm dialog: "Grant admin access to {name}?" |
| Irreversible global (Event Passed) | Confirm dialog with countdown (max 10s, skippable for experienced users) |
| Create / submit (user-facing) | Inline success screen with reference ID |

**Never use `window.confirm()`** — always use styled `AlertDialog` or `ConfirmDialog`.

---

## Action Placement Standards

### Page header

```
[Back link]  Title                    [Secondary] [Primary Action]
             Description/subtitle
```

- **Primary action** = most common create/add action for the page (Create Event, New Application, Create Ban)
- **Secondary actions** = sync, import, export, global utilities
- Maximum 3 header actions visible; overflow into "More" dropdown if needed

### Row/card actions

- **Cards** (applications, tickets): labeled buttons at card footer — current application pattern is the standard
- **Tables** (members, events, bans): labeled buttons or label+icon in trailing column
- **Destructive actions**: rightmost, use destructive variant or red text

### Hidden action anti-patterns

Do **not**:

- Hide tools only in Admin Hub (must also be in sidebar)
- Bury configuration at page bottom below unrelated content
- Require scrolling past unrelated sections to reach paired config (duo/SMD)
- Place read-only reference on a separate route when it's needed during data entry

---

## Dashboard Standards

### Admin Hub layout

```
┌─────────────────────────────────────────────────┐
│  Quick Actions: [New App] [Create Event] [Ban]  │
├──────────┬──────────┬──────────┬─────────────────┤
│ Pending  │ Open     │ Tier     │ Active          │
│ Apps (N) │ Tickets  │ Mismatch │ Bans (N)        │
│          │ (N)      │ (N)      │                 │
├──────────┴──────────┴──────────┴─────────────────┤
│  Navigation sections (existing hub cards)        │
├──────────────────────────────────────────────────┤
│  Recently viewed: [Player1] [Player2] [Event1]   │
└──────────────────────────────────────────────────┘
```

### Widget rules

| Rule | Standard |
|------|----------|
| **Count + link** | Every widget shows a number and links to the filtered list |
| **Stale indicator** | Widgets show age of data if not real-time ("Updated 5m ago") |
| **Empty state** | Zero-count widgets show green check or "All clear" — not hidden |
| **Role filtering** | Widgets respect role gates; don't show admin-only counts to viewers |

### Public home (`/`)

- Keep searchable roster as primary content
- Admin stat cards (total members, tier counts) remain for staff
- Do not add operational widgets to public home

---

## Context Switching Standards

### When to use tabs vs routes vs drawers

| Pattern | Use when |
|---------|----------|
| **Tabs on same route** | Closely related views of same entity (Applications / Accepted / Rejected) |
| **Separate routes** | Distinct tools with own bookmark value (Stats hub, Uploads) |
| **Drawer overlay** | Detail view from list without losing list context (player detail, ticket detail) |
| **Stepper modal** | Create flows with 2–4 sequential steps (New Application, Create Event) |

### Maximum context switches per task

| Task complexity | Max page transitions |
|-----------------|---------------------|
| Simple (view, archive, single edit) | 1 |
| Medium (create with config) | 1 (stepped modal/drawer) |
| Complex (investigate player) | 2 (list → detail drawer with tabs) |
| Pipeline (import + review) | 1 (tabbed single page) |

---

## Navigation Standards

### Sidebar completeness

Every admin tool reachable from **both** Admin Hub cards **and** sidebar navigation. No hub-only links.

### Sidebar section rules

| Section | Contents |
|---------|----------|
| Players | Member Management, Discord Directory, Fuzzy Matches, Tier Mismatches |
| Events | Events Manager (with integrated results/import tabs), Scrim Series |
| Mods | Event Bans, Punishment Matrix, Spin Moderation |
| Statistics | Re-Evaluation (with inline Simulation), Stats hub |
| Admin | Features, Support, Audit Log, User Management |
| Data | Cache, Backup, Maintenance, Wrapped Editor |

### Public header

Minimum nav: Members, Events, Tier Restrictions, Support.

Consider adding: Scrim Series (if public-facing standings matter).

Do not add: Spin landing (staff-gated), admin routes, player profiles (staff-only).

---

## Priority Implementation Order

Standards should be adopted incrementally. Implement in this order:

### Phase 1 — P1 standards (highest impact)

1. **Operational Admin Hub widgets** — pending apps, tickets, mismatches counts
2. **Quick action buttons on hub** — New Application, Create Event, Create Ban
3. **Labeled row actions** on Member Management Accepted, Events, Support, Bans
4. **Styled confirmations** — replace all `window.confirm()`; add confirm for admin role grant and application accept
5. **Bulk accept/reject** on Applications
6. **Apply tier action** on Re-Evaluation and Mismatches
7. **Embedded punishment matrix** in create-ban dialog
8. **Wire team-combo-calculator** to Tier Restrictions
9. **Fuzzy Matches in sidebar**
10. **Unified event lifecycle page** — tabs for Info / Import / Results

### Phase 2 — P2 standards

1. Stepped event create/edit wizard
2. Single save button in edit-application dialog
3. Shared scoring form component
4. Inline tier simulation on Re-Evaluation
5. Bulk status change on Accepted members
6. Ticket reference ID and categories on public support form
7. Auto-apply suggested ban penalty
8. Inline ban edit
9. Player detail drawer from list pages
10. Shared Zod schemas for repeated form fields

### Phase 3 — P3 standards

1. Global command palette (⌘K)
2. Recently viewed players on Admin Hub
3. Bulk tier apply from filtered list
4. Keyboard shortcuts on admin tables
5. localStorage defaults for event type/mode
6. Role capability matrix page

---

## Workflow Review Checklist

Use this checklist when building or modifying any workflow:

### Navigation
- [ ] Task completes in ≤2 clicks from role home surface
- [ ] Tool is in both sidebar and hub (if admin)
- [ ] Tab state persists in URL
- [ ] No link renders for unauthorized users

### Actions
- [ ] Primary action visible in page header
- [ ] Row actions use text labels (not icon-only)
- [ ] Destructive actions require styled confirmation
- [ ] Action order consistent: Edit → Primary → Delete

### Forms
- [ ] Uses shared schema for entity fields
- [ ] Pre-fills from selected entity / context
- [ ] Single primary submit button per step
- [ ] ≤5 fields in simple modal; stepped for larger forms
- [ ] Smart defaults applied (see defaults table)

### Bulk
- [ ] Table has checkbox column if ≥5 rows
- [ ] Bulk action toolbar appears on selection
- [ ] Bulk destructive actions confirm with count

### Context
- [ ] Related data accessible without leaving page (panel, tab, or inline section)
- [ ] Read-only reference embedded, not on separate route
- [ ] Detail views use drawer when opened from list

### Dashboard
- [ ] Operational counts surfaced on Admin Hub if this workflow generates actionable queue items
- [ ] Widget links to filtered list page

---

## Metrics Targets

Track these metrics before and after workflow improvements:

| Metric | Current (estimated) | Target |
|--------|---------------------|--------|
| Clicks to accept application | 3 | 2 (with bulk: 2 for N apps) |
| Clicks to create event + import results | 7+ (3 pages) | 4 (1 page, tabbed) |
| Clicks to create ban with correct penalty | 5+ (2 pages) | 3 (1 dialog with inline reference) |
| Clicks to apply tier from re-evaluation | N/A (not possible) | 3 (inline action) |
| Clicks to edit accepted member | 3 | 2 (inline quick edit or drawer) |
| Page transitions for player investigation | 3–4 | 1 (drawer with tabs) |
| Forms with duplicate save buttons | 4 | 0 |
| Admin pages using native confirm() | 2+ | 0 |
| Admin tables with bulk operations | ~4 of 15 | 12 of 15 |
| Hub-only sidebar links | 1+ (Fuzzy Matches) | 0 |

---

## Relationship to Other Standards

| Document | Relationship |
|----------|--------------|
| `WORKFLOW_AUDIT.md` | Source findings and prioritized recommendations |
| `UI_CONSISTENCY_AUDIT.md` | Visual/layout consistency — adopt shared PageHeader, dialog widths |
| `DESIGN_SYSTEM_V2.md` | Component implementations for drawers, steppers, bulk toolbars |
| `PRODUCT_CLEANUP_AUDIT.md` | Product boundaries (Spin ≠ Scrim Series ≠ Events calendar) — workflows must respect these |
| `UI_DENSITY_AUDIT.md` | Information density on list pages — balance with inline action labels |

When visual standards and workflow standards conflict, **workflow efficiency takes precedence for admin pages** and **simplicity takes precedence for public pages**.
