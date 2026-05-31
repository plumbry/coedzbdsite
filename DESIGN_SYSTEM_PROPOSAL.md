# Design System Proposal — Compact Layout Rules

**Purpose:** Standardize spacing and density across Co-Ed ZBD Hub while preserving the existing visual identity (primary blue `#1e98e5`, accent yellow, Open Sans, card-based UI).  
**Companion document:** `UI_DENSITY_AUDIT.md`  
**Status:** Proposal only — no code changes yet  

---

## Design Principles

1. **Desktop-first information density** — Optimize for staff workflows on 1280px+ screens; data tables and toolbars should dominate.
2. **Compact, not cramped** — Reduce decorative whitespace; preserve readable line height and touch targets.
3. **Consistency over local preference** — One page shell, one spacing scale, one title scale.
4. **Tables over card grids** — When content is row-oriented (members, events, earnings, leaderboards), default to tables on `md+`.
5. **Progressive spaciousness** — Marketing moments (Wrapped) may use larger type; admin and reference pages stay dense.
6. **Accessibility non-negotiable** — WCAG 2.1 AA contrast, visible focus, semantic headings, 44px touch targets on mobile.

---

## Layout Tokens

Proposed Tailwind-aligned tokens (implement via CSS variables or shared layout components):

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--page-max-width` | 1280px | `max-w-7xl` | Default page content |
| `--page-max-width-narrow` | 512px | `max-w-lg` | Forms (support, dialogs) |
| `--page-max-width-wide` | 1600px | `max-w-[1600px]` | Holistic stats only |
| `--page-padding-x` | 16px → 24px | `px-4 md:px-6` | Page horizontal inset |
| `--page-padding-y` | 16px | `py-4` | Page vertical inset |
| `--section-gap` | 16px | `space-y-4` / `gap-4` | Between major sections |
| `--section-gap-tight` | 12px | `space-y-3` / `gap-3` | Within tool panels |
| `--card-padding` | 16px | `p-4` | Card interior |
| `--card-gap` | 12px | `gap-3` | Between card header/body |
| `--table-cell-padding` | 8px | `p-2` | Keep current table cells |
| `--header-height-site` | ~56px | — | Promo + nav combined target |
| `--header-height-admin-mobile` | 48px | `h-12` | Fixed admin hamburger bar |

---

## Page Shell

### Standard public page

```tsx
<div className="min-h-screen bg-background flex flex-col">
  <SiteHeader />
  <main className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-6 py-4 space-y-4">
    {/* PageHeader */}
    {/* Content sections */}
  </main>
</div>
```

### Standard admin page (with sidebar)

```tsx
<div className="min-h-screen bg-background flex">
  <AdminSidebar />
  <div className="flex-1 flex flex-col min-w-0 pt-12 lg:pt-0">
    <SiteHeader /> {/* optional — hide on admin if sidebar has nav */}
    <main className="flex-1 p-4 md:p-5 overflow-x-auto">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        {/* content */}
      </div>
    </main>
  </div>
</div>
```

### Rules

| Rule | Specification |
|------|---------------|
| **Page max width** | **`max-w-7xl` (1280px)** default for all list/table/dashboard pages. Exceptions: forms `max-w-lg` centered; holistic-score-stats `max-w-[1600px]`. Remove ad-hoc `max-w-5xl` on Spin/Scrim unless content truly narrower. |
| **Page padding** | **`px-4 md:px-6`** horizontal; **`py-4`** vertical. Never `py-8`/`py-12` on standard pages. Forms may use **`py-6`** for vertical centering only. |
| **Section spacing** | **`space-y-4`** between page header, filters, and primary content. **`space-y-3`** inside cards. Avoid `space-y-6` and `space-y-8` except Wrapped storytelling. |
| **No double min-h-screen** | One `min-h-screen` on root; inner content uses `flex-1` or `py-16` for centering. |
| **Auth gates** | Max width `max-w-sm`, padding `py-16 px-4`, title `text-2xl` — not full viewport `text-4xl`. |

---

## Page Header Component (Proposed)

Replace per-page ad-hoc headers with a shared `PageHeader`:

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
}

// Classes:
// wrapper: flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-0
// title: text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2
// description: text-sm text-muted-foreground
// icon: h-5 w-5 text-primary shrink-0
```

| Rule | Value |
|------|-------|
| Page title (h1) | `text-xl md:text-2xl font-bold` |
| Section title (h2) | `text-lg font-semibold` |
| Card title | `text-sm font-medium` (keep) |
| Hero/marketing h1 | `text-3xl` max (Spin landing only) |
| Wrapped slides | Existing large scale preserved |

**Do not** stack icon + title + subtitle + helper text + filters as separate blocks with `mb-8` each — combine into one header row + optional toolbar row.

---

## Site Header

| Rule | Current | Proposed |
|------|---------|----------|
| Promo + nav | Two rows, ~104px total | Single row on `md+`: nav left, promo right `text-xs`; stack on mobile |
| Nav padding | `py-3 sm:py-4` | `py-2` |
| Nav link size | `text-sm sm:text-base` | `text-sm font-semibold` |
| Container | `max-w-7xl px-2 sm:px-4` | `max-w-7xl px-4 md:px-6` |

Accessibility: promo text remains readable; hamburger stays 44px tap target.

---

## Cards

### Base card (proposed change to `card.tsx`)

| Property | Current | Proposed |
|----------|---------|----------|
| Outer padding | `py-6 gap-6` | `py-4 gap-3` |
| Header padding | `px-6 gap-2` | `px-4 gap-1.5` |
| Content padding | `px-6` | `px-4` |
| Footer padding | `px-6 pt-6` | `px-4 pt-4` |
| Border radius | `rounded-xl` + 1.3rem token | `rounded-lg` + **0.75rem** token |

### Card usage rules

| Use card | Do not use card |
|----------|-----------------|
| Grouped form sections | Single-line metadata (use badge row) |
| Chart containers | Entire data tables (use `border rounded-lg p-0`) |
| Mobile-only list items | Stat that fits inline (use metric strip) |
| Dialog panels | Filter controls (use toolbar) |

### Metric strip (alternative to stat card grid)

For 3–4 scalar stats (member count, earnings total, cache status):

```tsx
<div className="flex flex-wrap gap-4 rounded-lg border bg-card px-4 py-3 text-sm">
  <div><span className="text-muted-foreground">Total</span> <strong>142</strong></div>
  ...
</div>
```

Saves ~100px vs 3-card grid.

---

## Tables

### Priority rule

> **On viewports `md` and up, prefer a table when rows share the same columns.** Card grids are for mobile fallbacks or rich media tiles (event marketing with images).

### Table container

```tsx
<div className="rounded-lg border overflow-hidden">
  <Table />
</div>
```

| Rule | Specification |
|------|---------------|
| Wrapper | No Card padding around table — **`p-0`** |
| Header row | `h-9` (slightly below current `h-10` acceptable if needed) |
| Cell padding | Keep `p-2` |
| Sticky header | `sticky top-0 bg-card z-10` on long admin tables |
| Empty state | `py-6` inside tbody, not full Empty component |
| Mobile | `event-bans-manager` pattern: cards `sm:hidden`, table `hidden sm:block` |

### Dense table variant (admin)

Optional class: `[&_td]:py-1.5 [&_th]:h-8` for member-management-scale lists.

---

## Forms

| Rule | Specification |
|------|---------------|
| Field spacing | `space-y-3` within form; `space-y-1.5` label to input |
| Input height | Keep `h-9` (36px) — adequate for desktop density |
| Textarea | Default **4 rows**; grow with content |
| Label | `text-sm font-medium` (unchanged) |
| Helper text | `text-xs` single line below field |
| Form max width | `max-w-lg` for single-column; admin wide forms `max-w-2xl` |
| Dialog forms | `gap-4` not `gap-6`; `py-4` content area |
| Submit row | Right-aligned button group, not full-width unless mobile |

---

## Filters & Toolbars

Combine filters that currently occupy multiple rows (Events page is the worst offender):

```tsx
<div className="flex flex-wrap items-end gap-2 md:gap-3">
  {/* Selects, search input, chip filters */}
</div>
```

| Rule | Specification |
|------|---------------|
| Layout | Single toolbar row on `md+`; wrap on mobile |
| Label | `sr-only` or placeholder-only on compact admin tools |
| Tabs as filters | Max one tab row; secondary filter → Select on mobile |
| Spacing below toolbar | `mb-3` not `mb-8` |

---

## Empty States

| Property | Current | Proposed |
|----------|---------|----------|
| Padding | `p-6 md:p-12` | `p-4 md:p-6` |
| Gap | `gap-6` | `gap-3` |
| Icon container | `size-10` | `size-8` |
| Inline (in table) | Full Empty | Text row `py-6 text-muted-foreground text-sm` |

---

## Hero Sections

| Page type | Rule |
|-----------|------|
| Admin | **No hero bands** — use PageHeader only |
| Spin / Scrim Series landing | Replace `py-12` hero band with PageHeader `py-4` + border-b |
| Wrapped | Full-screen slides **unchanged** (brand moment) |
| 404 / auth | Compact centered block, not hero |

---

## Admin Sidebar

| Rule | Proposed |
|------|----------|
| Mobile fixed header | `h-12` (`pt-12` on main) — unify all admin pages |
| Desktop width | Keep `w-56` |
| Section spacing | `space-y-4` not `space-y-6` |
| Nav item padding | `py-1.5 px-2` compact |

Remove outliers: `stats.tsx` `pt-16 lg:pt-8` → standard `pt-12 lg:pt-0`.

---

## Responsive Breakpoints

Follow existing Tailwind defaults:

| Breakpoint | Density behavior |
|------------|------------------|
| `< sm` (mobile) | Card lists, stacked filters, icon-only actions, `px-4` |
| `sm–md` | 2-col grids where appropriate |
| `md+` (desktop) | **Tables, horizontal toolbars, metric strips, side-by-side forms** |
| `lg+` | Full `max-w-7xl` content width; sidebar visible |

### Mobile-specific spacing

| Issue | Rule |
|-------|------|
| Double header offset | Only one of SiteHeader or AdminMobileHeader fixed; compute `--header-offset` |
| Horizontal overflow | `-mx-4 px-4 overflow-x-auto` for tabs (member-management pattern) |
| Card padding on mobile | `p-3` acceptable; `sm:p-4` step-up |
| Touch targets | Min `h-10 w-10` for icon buttons even in compact mode |

---

## Typography Scale (Compact)

| Element | Size | Line height |
|---------|------|-------------|
| Page h1 | `text-xl md:text-2xl` | tight |
| Section h2 | `text-lg font-semibold` | tight |
| Body | `text-sm` | normal |
| Table text | `text-sm` | normal |
| Caption/helper | `text-xs text-muted-foreground` | relaxed |
| Stat number (inline) | `text-lg font-bold` | — |
| Stat number (hero) | `text-2xl font-bold` max | admin only |

---

## Spacing Scale (Use Only These)

| Name | Value | Tailwind |
|------|-------|----------|
| xs | 4px | `1` |
| sm | 8px | `2` |
| md | 12px | `3` |
| base | 16px | `4` |
| lg | 20px | `5` |
| xl | 24px | `6` |

**Deprecated for page layout:** `6`, `8`, `12`, `16` as default section gaps (use intentionally for Wrapped/404 only).

---

## Component Migration Checklist

When implementing, touch in this order:

1. [ ] `src/components/ui/card.tsx` — reduce base padding
2. [ ] `src/components/ui/empty.tsx` — compact empty
3. [ ] `src/index.css` — optional radius `0.75rem`
4. [ ] `src/components/site-header.tsx` — compact nav
5. [ ] Create `src/components/page-header.tsx` (or layout primitives)
6. [ ] Create `src/components/page-shell.tsx` for consistent wrappers
7. [ ] Migrate public pages: Index → Events → Support → Tier Restrictions → Spin
8. [ ] Migrate admin shell padding across all sidebar pages
9. [ ] Convert Events list to table-on-desktop
10. [ ] Audit dialogs for `space-y-6` → `space-y-4`

---

## Reference Implementations (Already in Codebase)

Use these as templates when rolling out:

| Pattern | File | Why |
|---------|------|-----|
| Mobile/table dual layout | `event-bans-manager.tsx` | Best responsive density |
| Compact admin padding | `event-bans.tsx` `p-2 sm:p-6` | Scales padding by breakpoint |
| Dense data page | `tier-re-evaluation.tsx` `py-2 space-y-3` | High information throughput |
| Feature grid | `features/page.tsx` `gap-3 py-3` | Tight card grid done right |
| Table cell compaction | `member-management.tsx` `[&_td]:py-1.5` | More rows per viewport |

---

## Anti-Patterns to Eliminate

| Anti-pattern | Replacement |
|--------------|-------------|
| `py-8` / `py-12` page padding | `py-4` |
| `mb-8` header margins | `gap-4` in flex column |
| 3-col stat card grid for 3 numbers | Metric strip |
| Card grid for tabular data | Table on md+ |
| Nested Cards (Card inside Card) | Sections with `border-t` |
| Full viewport auth centering | Compact auth card |
| `text-3xl` page titles | `text-xl md:text-2xl` |
| Separate hero band + content padding | Single PageHeader with border-b |
| Empty `py-12` in tabs | `py-6` |
| Inconsistent max-width per page | `max-w-7xl` default |

---

## Brand Preservation Checklist

Do **not** change:

- Primary color `oklch(0.67 0.16 245.00)` / `#1e98e5`
- Accent yellow `oklch(0.94 0.02 250.85)`
- Font family Open Sans
- Badge tier colors on Tier Restrictions
- Wrapped full-screen experience and motion
- Button variants and semantic colors
- Logo/wordmark treatment (nav links)

---

## Expected Outcomes

| Metric | Before (est.) | After (est.) |
|--------|---------------|--------------|
| Site header height | ~104px | ~72px |
| Page top padding | 32–48px | 16px |
| Card vertical chrome | ~48px | ~32px |
| Events list (20 items) | ~2400px scroll | ~1200px |
| Admin member table rows above fold (1080p) | ~8 | ~12–14 |
| Empty state block height | ~200px | ~120px |

---

## Implementation Notes

- Prefer **layout components** over find-replace of Tailwind classes — prevents drift.
- Add **Storybook or visual regression** optional but recommended for Card/Empty changes.
- Test at **375px**, **768px**, **1280px**, **1440px** viewports.
- Verify keyboard navigation after table/card layout switches.
- Phase rollout: **global components first**, then high-traffic public pages, then admin bulk.

---

*This proposal complements `UI_DENSITY_AUDIT.md`. No code has been modified per audit scope.*
