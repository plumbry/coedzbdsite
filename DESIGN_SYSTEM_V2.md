# Design System V2

**Co-Ed ZBD Hub — Unified UI Standards**  
**Version:** 2.0 (proposal)  
**Status:** Audit complete — implementation not started  
**Companion docs:** `UI_CONSISTENCY_AUDIT.md`, `UI_DENSITY_AUDIT.md`, `DESIGN_SYSTEM_PROPOSAL.md`  

---

## Purpose

This document defines **one design system** for the entire application. Every page, dialog, form, and table should follow these standards so the product feels designed by a single team.

**Preserved (do not change):**
- Primary blue `oklch(0.67 0.16 245.00)` / `#1e98e5`
- Accent yellow `oklch(0.94 0.02 250.85)`
- Font family: Open Sans
- shadcn/ui component architecture
- Wrapped fullscreen experience (exempt from standard page shell)

**Changed (consistency + density):**
- Spacing rhythm
- Typography scale
- Layout shells
- Component sizing tokens

---

## 1. Spacing Scale

Use **only** these values for layout. Do not introduce ad-hoc `py-8`, `gap-6`, or `space-y-6` on standard pages.

| Token | px | Tailwind | Usage |
|-------|-----|----------|-------|
| `space-0` | 0 | `0` | — |
| `space-1` | 4 | `1` | Icon gaps, tight inline |
| `space-2` | 8 | `2` | Field helper margin, compact toolbar gap |
| `space-3` | 12 | `3` | Inside cards, tight sections |
| `space-4` | 16 | `4` | **Default** section gap, page padding, card padding |
| `space-5` | 20 | `5` | Rare — large section break |
| `space-6` | 24 | `6` | **Deprecated** on standard pages; Wrapped slides only |
| `space-8` | 32 | `8` | **Deprecated** on standard pages; auth vertical centering only |

### Layout spacing rules

| Context | Token |
|---------|-------|
| Page horizontal padding | `px-4 md:px-6` (16→24px) |
| Page vertical padding | `py-4` (16px) |
| Between page sections | `space-y-4` |
| Inside cards | `gap-3` / `p-4` |
| Form field groups | `space-y-4` |
| Label to input | `space-y-1.5` |
| Toolbar item gap | `gap-2` |
| Table cell padding | `p-2` (8px) |
| Dialog body sections | `space-y-4` |

### CSS custom properties (optional implementation)

```css
:root {
  --space-page-x: 1rem;
  --space-page-y: 1rem;
  --space-section: 1rem;
  --space-card: 1rem;
  --space-field: 0.375rem;
}
@media (min-width: 768px) {
  :root { --space-page-x: 1.5rem; }
}
```

---

## 2. Typography Scale

One scale. Do not use arbitrary `text-3xl` on admin pages or `text-4xl` on auth gates.

| Token | Classes | Element | Example |
|-------|---------|---------|---------|
| **Page title** | `text-xl md:text-2xl font-bold tracking-tight` | `<h1>` | "Member Management" |
| **Page title compact** | `text-lg md:text-xl font-bold tracking-tight` | `<h1>` admin | "Event Bans" |
| **Section title** | `text-lg font-semibold` | `<h2>` | "Active Bans" |
| **Card title** | `text-sm font-medium` | `<h3>` / CardHeader | "Backup Summary" |
| **Dialog title** | `text-lg font-semibold leading-none` | DialogTitle | "Create Event Ban" |
| **Body** | `text-sm` | `<p>`, `<td>`, default text | Descriptions, table cells |
| **Label** | `text-sm font-medium leading-none` | `<label>` | "Discord Username" |
| **Caption** | `text-xs text-muted-foreground` | Helpers, meta | "Enter your Discord username…" |
| **Stat value** | `text-lg font-bold tabular-nums` | Metric numbers | "142" |
| **Stat value emphasis** | `text-2xl font-bold tabular-nums` | Hero/dashboard highlight | Max one per view |
| **Button** | `text-sm font-medium` | Buttons | (existing) |
| **Nav link** | `text-sm font-semibold` | SiteHeader links | "Events" |
| **Monospace** | `text-xs font-mono` | IDs, codes | Discord ID, link code |

### Exempt typography

| Context | Allowed |
|---------|---------|
| Wrapped slides | `text-4xl`–`text-6xl` storytelling type |
| 404 page | `text-4xl` numeral (not `text-6xl`) |
| Marketing hero (if retained) | `text-2xl md:text-3xl` max |

### Heading hierarchy

Every route must have exactly **one `<h1>`** via PageHeader. Section headings use `<h2>`. Card headers use `<h3>` or CardTitle — never skip levels.

---

## 3. Card Standard

### Base card (`card.tsx` target)

```tsx
// Proposed default classes
"rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col gap-3 py-4"

// CardHeader
"px-4 gap-1.5 grid ..."

// CardContent
"px-4"

// CardFooter
"px-4 pt-4 flex items-center ..."
```

| Property | Value |
|----------|-------|
| Border radius | `rounded-lg` (12px — reduce from 1.3rem token to 0.75rem) |
| Padding | `p-4` |
| Internal gap | `gap-3` |
| Shadow | `shadow-sm` (unchanged) |
| Border | `border` (unchanged) |

### Card variants

| Variant | Classes | Use |
|---------|---------|-----|
| **Default** | Base above | Grouped content, forms |
| **Flush** | `p-0 gap-0 py-0` + table inside | Data tables |
| **Stat** | `p-3 sm:p-4` | Metric with icon + label + value |
| **Interactive** | `hover:border-primary transition-colors cursor-pointer` | Clickable list tiles (mobile) |
| **Nested** | Avoid — use `border-t pt-4` sections instead | — |

### Card rules

1. **Never** put stat **values** in `CardTitle` — use `StatCard` value slot.
2. **Never** nest Cards more than one level deep.
3. Tables inside cards use **Flush** variant.
4. Card title is always `text-sm font-medium`, not page-level sizing.

### StatCard (proposed component)

```tsx
<StatCard
  label="Active Bans"
  value={12}
  icon={Ban}
  variant="destructive"  // optional accent
/>
```

Layout: horizontal on `sm+` — `[icon 32px] [label caption / value bold]`.

---

## 4. Modal Standard

### Size scale

Implement as `size` prop on `DialogContent`:

| Size | Max width | Tailwind | Use case |
|------|-----------|----------|----------|
| `sm` | 448px | `sm:max-w-md` | Confirmations, ≤3 fields |
| `md` | 512px | `sm:max-w-lg` | **Default** — standard forms |
| `lg` | 672px | `sm:max-w-2xl` | Complex forms, player edit |
| `xl` | 896px | `sm:max-w-4xl` | Import preview, wide tables |
| `full` | 1152px | `sm:max-w-6xl` | Fuzzy match review, tier eval |

### Structure

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      {description && <DialogDescription>{description}</DialogDescription>}
    </DialogHeader>

    <DialogBody>
      {/* scrollable: max-h-[min(70vh,640px)] overflow-y-auto */}
      <form id="dialog-form" className="space-y-4">
        {/* fields w-full */}
      </form>
    </DialogBody>

    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button type="submit" form="dialog-form">Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Modal rules

| Rule | Specification |
|------|---------------|
| Default size | `md` |
| Padding | `p-6` on content shell; body uses full inner width |
| Close control | X top-right (default); do not disable unless mandatory flow |
| Footer | Always present for forms; `flex-col-reverse sm:flex-row sm:justify-end gap-2` |
| Primary action | Rightmost button, `type="submit"` |
| Cancel | `variant="outline"`, left of primary on desktop |
| Destructive | `variant="destructive"` + `AlertDialog` confirmation for irreversible |
| Multi-step | Footer `justify-between`: Back (ghost) ← → Next/Submit (default) |
| Field width | `w-full` on all inputs/selects/textareas inside modal |
| Overflow | Body scrolls vertically; `overflow-x-auto` on embedded tables only |
| Max height | `max-h-[70vh]` on scroll region — no `max-h-[90vh]` on content |

### AlertDialog

Keep separate — confirmations only. Default `sm:max-w-lg`. No X button. Cancel + Action footer.

---

## 5. Form Standard

### Field structure

```tsx
<div className="space-y-1.5">
  <Label htmlFor={id}>
    Field name{required && " *"}
  </Label>
  <Input id={id} className="w-full" ... />
  {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
  {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
</div>
```

### Form rules

| Rule | Specification |
|------|---------------|
| **Width** | Inputs, selects, textareas: `w-full` in forms and modals |
| **Height** | Inputs/selects: `h-9` (36px); toolbar compact: `h-8` via `size="sm"` |
| **Label** | Always above control; `htmlFor` required; `text-sm font-medium` |
| **Required** | Asterisk in label; `aria-required` on control |
| **Helper text** | `text-xs text-muted-foreground`, one line preferred |
| **Validation** | Inline `text-xs text-destructive` below field; `aria-invalid` on control |
| **Submit errors** | Toast for network/server; inline for field validation |
| **Form spacing** | `space-y-4` between fields |
| **Field pairs** | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| **Textarea** | Default 4 rows; `field-sizing-content` for growth |
| **Select in forms** | `w-full` trigger |
| **Select in toolbar** | `w-[160px]` or `w-[200px]` fixed tokens only |
| **Search** | Use `SearchInput` — icon `left-3`, input `pl-9`, `w-full` or `w-full sm:w-64` |

### SearchInput (proposed)

```tsx
<div className="relative w-full sm:w-64">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input className="pl-9" placeholder="Search…" />
</div>
```

### DatePicker (proposed wrapper)

Single component wrapping Calendar + Popover. Replace raw `<Input type="date">` over time.

### Form library

Prefer react-hook-form + `Form`/`FormField` for new forms and migrated dialogs. Existing raw forms migrate opportunistically.

---

## 6. Table Standard

### DataTable wrapper (proposed)

```tsx
<div className="rounded-lg border overflow-hidden">
  <div className="overflow-x-auto">
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card">
        ...
      </TableHeader>
      <TableBody>...</TableBody>
    </Table>
  </div>
</div>
```

### Table rules

| Rule | Specification |
|------|---------------|
| Component | Always shadcn `Table` — no raw `<table>` in new code |
| Container | `rounded-lg border`; no Card padding around table |
| Header row | `h-9`; cells `font-medium text-sm` |
| Body row | Cells `p-2 text-sm`; hover `hover:bg-muted/50` |
| Dense variant | `[&_td]:py-1.5 [&_th]:h-8` — opt-in for long lists |
| Sticky header | Required on admin tables >10 rows |
| Empty row | Single `<TableRow><TableCell colSpan={n} className="py-6 text-center text-sm text-muted-foreground">` |
| Mobile | Card list fallback (`sm:hidden`) + table (`hidden sm:table`) when columns >3 |
| Sortable columns | Icon `h-3 w-3` consistently; click entire header cell |
| Numeric columns | `text-right tabular-nums` |

### Migrate raw HTML tables

- `event-bans-manager.tsx` desktop table → DataTable
- `scrim-series.tsx` panels → DataTable

---

## 7. PageHeader Standard

### Component API

```tsx
// src/components/page-header.tsx

export interface PageHeaderProps {
  /** Required — page h1 */
  title: string;
  /** Optional subtitle */
  description?: string;
  /** Lucide icon component */
  icon?: LucideIcon;
  /** Back navigation — text link, not button */
  back?: { label: string; href: string };
  /** Breadcrumb trail — prefer over back when depth >1 */
  breadcrumbs?: Array<{ label: string; href?: string }>;
  /** Right-aligned actions (buttons, links) */
  actions?: React.ReactNode;
  /** Admin pages use compact title scale */
  variant?: "default" | "compact";
  className?: string;
}
```

### Layout spec

```
┌─────────────────────────────────────────────────────────┐
│ [Breadcrumb > Trail > Here]                    (optional)│
│ ← Back to X                                    (optional)│
│ [icon] Title                           [Action] [Action]  │
│        Description text (optional)                       │
└─────────────────────────────────────────────────────────┘
         ↓ space-y-4 (from parent, not mb-8)
┌─────────────────────────────────────────────────────────┐
│ PageToolbar / filters                          (optional)│
└─────────────────────────────────────────────────────────┘
```

### PageHeader rules

| Rule | Specification |
|------|---------------|
| Title element | Always render `<h1>` |
| Title classes | default: `text-xl md:text-2xl font-bold`; compact: `text-lg md:text-xl font-bold` |
| Description | `text-sm text-muted-foreground`; max 2 lines |
| Icon | `h-5 w-5 text-primary shrink-0` |
| Back link | `text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5` + ArrowLeft `h-4 w-4` |
| Actions | `flex flex-wrap items-center gap-2 shrink-0` |
| Bottom margin | **None** on PageHeader — parent `space-y-4` handles gap |
| Breadcrumbs | Use `ui/breadcrumb.tsx`; separator `/` |

### PageToolbar (proposed sibling)

For filters/search below header:

```tsx
<PageToolbar>
  <SearchInput ... />
  <Select>...</Select>
  <Select>...</Select>
</PageToolbar>

// Classes: flex flex-wrap items-end gap-2 md:gap-3
```

---

## 8. Page Layout Standard

### PageShell (proposed)

```tsx
// src/components/page-shell.tsx

interface PageShellProps {
  variant?: "public" | "admin";
  children: React.ReactNode;
  /** Admin only — show sidebar */
  sidebar?: boolean;
  /** Override max width */
  maxWidth?: "default" | "narrow" | "wide";
}
```

### Public page layout

```tsx
<PageShell variant="public">
  <PageHeader title="Members" icon={Users} description="..." />
  <PageToolbar>...</PageToolbar>
  <section>...</section>
</PageShell>
```

Rendered structure:

```html
<div class="min-h-screen bg-background flex flex-col">
  <SiteHeader />
  <main class="flex-1 w-full mx-auto max-w-7xl px-4 md:px-6 py-4 space-y-4">
    {children}
  </main>
</div>
```

### Admin page layout

```tsx
<PageShell variant="admin" sidebar>
  <PageHeader title="Event Bans" variant="compact" actions={...} />
  ...
</PageShell>
```

Rendered structure:

```html
<div class="min-h-screen bg-background flex">
  <AdminSidebar />
  <div class="flex-1 flex flex-col min-w-0 pt-12 lg:pt-0">
    <main class="flex-1 p-4 md:p-5 overflow-x-auto">
      <div class="mx-auto w-full max-w-7xl space-y-4">
        {children}
      </div>
    </main>
  </div>
</div>
```

### Layout rules

| Rule | Value |
|------|-------|
| Default max width | `max-w-7xl` (1280px) |
| Narrow (Support) | `max-w-lg` inner wrapper inside standard main |
| Wide (holistic stats) | `max-w-[1600px]` |
| Remove | `max-w-5xl` on Spin — use default |
| Admin mobile offset | `pt-12` (48px) unified |
| Section wrapper | `<section className="space-y-4">` optional semantic grouping |
| Auth gate | Separate `AuthGate` — not PageShell |

### Layout exceptions

| Route | Exception |
|-------|-----------|
| `/2025-wrapped`, admin wrapped preview | Full-screen, no PageShell |
| `*` 404 | Centered content, no PageHeader band |
| Auth unauthenticated admin | `AuthGate` centered card |

---

## 9. Empty State Standard

```tsx
<Empty className="p-4 md:p-6 gap-3">
  <EmptyHeader>
    <EmptyMedia variant="icon">...</EmptyMedia>
    <EmptyTitle>No members found</EmptyTitle>
    <EmptyDescription>Try adjusting your filters</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>...</EmptyContent>
</Empty>
```

| Property | Value |
|----------|-------|
| Padding | `p-4 md:p-6` (down from `p-6 md:p-12`) |
| Gap | `gap-3` |
| Inline/table empty | Text only `py-6 text-sm text-muted-foreground` — no dashed border |

---

## 10. Site Header Standard

| Property | Current | V2 |
|----------|---------|-----|
| Structure | Promo row + nav row | Single row on `md+`; promo right-aligned `text-xs` |
| Nav padding | `py-3 sm:py-4` | `py-2` |
| Container | `max-w-7xl px-2 sm:px-4` | `max-w-7xl px-4 md:px-6` |
| Link style | `text-sm sm:text-base font-bold` | `text-sm font-semibold` |
| Target height | ~104px | ~64–72px |

---

## 11. Component Checklist

Implement in this order:

| # | Component / change | File |
|---|-------------------|------|
| 1 | Spacing + radius tokens | `index.css` |
| 2 | Card defaults | `ui/card.tsx` |
| 3 | Empty defaults | `ui/empty.tsx` |
| 4 | Dialog `size` prop + DialogBody | `ui/dialog.tsx` |
| 5 | PageShell | `components/page-shell.tsx` |
| 6 | PageHeader | `components/page-header.tsx` |
| 7 | PageToolbar | `components/page-toolbar.tsx` |
| 8 | SearchInput | `components/search-input.tsx` |
| 9 | StatCard | `components/stat-card.tsx` |
| 10 | DataTable | `components/data-table.tsx` |
| 11 | AuthGate | `components/auth-gate.tsx` |
| 12 | SiteHeader compact | `components/site-header.tsx` |

---

## 12. Migration Map (summary)

### Pages → PageShell + PageHeader

All routes in `UI_CONSISTENCY_AUDIT.md` §2.8 except Wrapped and 404.

### Dialogs → size prop

All dialogs in `UI_CONSISTENCY_AUDIT.md` §4.9.

### Priority pages (highest inconsistency)

1. Spin / Scrim Series — remove hero bands, align width
2. Events — PageHeader + table view + PageToolbar
3. Admin pages missing h1 — user-management, events-manager, audit, etc.
4. upset-kills cluster — add admin sidebar, unify headers
5. yunite-debug — normalize padding and title scale

---

## 13. Quality Checklist (PR review)

Before merging UI changes:

- [ ] Page uses PageShell (or documented exception)
- [ ] Exactly one h1 via PageHeader
- [ ] Page padding is `py-4 px-4 md:px-6`
- [ ] Section gaps use `space-y-4` only
- [ ] No stat values in CardTitle
- [ ] Tables use DataTable wrapper, flush in cards
- [ ] Form fields are `w-full` with labels above
- [ ] Dialogs use size token, DialogFooter present
- [ ] No new arbitrary max-width values
- [ ] Mobile touch targets ≥44px
- [ ] Focus rings visible on interactive elements
- [ ] Brand colors unchanged

---

## 14. Relationship to V1 Proposal

`DESIGN_SYSTEM_PROPOSAL.md` (V1) focused on **density**. This V2 document **extends** V1 with:

- Formal typography tokens
- PageHeader / PageShell / PageToolbar specs
- Modal size scale
- Form field standards
- Table DataTable wrapper
- StatCard component
- Consistency migration map

Where V1 and V2 conflict, **V2 wins** (V2 adds consistency requirements on top of density).

---

*No application code has been modified. Ready for phased implementation.*
