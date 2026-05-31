# Workflow & Task-Completion Audit

**Application:** Co-Ed ZBD Hub  
**Audit date:** 2026-05-31  
**Scope:** All major admin, user, and data-entry workflows  
**Status:** Read-only audit — no code modified  
**Companion docs:** `WORKFLOW_STANDARDS.md`, `PRODUCT_CLEANUP_AUDIT.md`, `UI_CONSISTENCY_AUDIT.md`

---

## Executive Summary

This audit measures how many clicks, page loads, and context switches are required to complete common tasks. The app is **strong on staff/admin tooling** but **weak on member self-service**. Most admin workflows follow a consistent pattern (sidebar → list page → modal), but several high-frequency tasks are split across multiple pages, rely on icon-only actions, or lack bulk operations.

| Area | Overall friction | Top issue |
|------|------------------|-----------|
| Admin — Players | **High** | Discord workflows split across 3+ pages; icon-only row actions |
| Admin — Events | **High** | Create → import → review spans 3 pages |
| Admin — Applications | **Medium** | No bulk accept/reject; card layout doesn't scale |
| Admin — Support | **High** | No in-app response; no link to player profile |
| Admin — Bans | **Medium** | Punishment matrix is read-only; no inline edit |
| Admin — Roles | **Medium** | One-click admin grant with no confirmation |
| Admin — Scores | **High** | Three score systems on different pages; no unified view |
| Admin — Tiers | **High** | Tier tools scattered; re-evaluation can't apply changes |
| User workflows | **High** | No member login; support is write-only |
| Data entry | **Medium-High** | Repeated identity/score fields across 10+ forms |
| Bulk operations | **Low coverage** | Most list pages lack multi-select |
| Dashboards | **Medium** | Admin hub exists; no operational "today" dashboard |

**Click-count legend:** Counts assume starting from the relevant home surface (`/` for public, `/admin` for staff). Each modal open = +1 interaction. Each tab switch within a page = +1 click.

---

## Methodology

For each workflow we measured:

1. **Clicks** — explicit user interactions (nav links, buttons, tab switches, modal opens)
2. **Page transitions** — full route changes (not in-page tab/modal)
3. **Modals** — dialog opens that block the underlying page
4. **Context switches** — times the user must leave the current task to gather information elsewhere

Estimates are for the **happy path** on desktop unless noted.

---

## Admin Workflows

### 1. Managing Players

**Routes:** `/admin/member-management/:tab?`, `/admin/discord-members`, `/admin/fuzzy-matches`, `/admin/tier-mismatches`, `/admin/features`  
**Key files:** `src/pages/admin/member-management.tsx`, `discord-members.tsx`, `edit-player-dialog.tsx`, `score-player-dialog.tsx`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| Edit accepted member profile | 3 | 1 (sidebar → Member Mgmt → Accepted tab) | 1 (edit dialog) |
| Score/evaluate member | 3 | 1 | 1 (score dialog, 14 fields) |
| Change member status | 3 | 1 | 1 (status dialog) |
| Delete player | 4 | 1 | 1 confirm dialog |
| Match inactive Discord member | 3 | 1 (Discord Directory) | 1 (match dialog) |
| Review fuzzy import match | 3 | 1 (hub only — not in sidebar) | 0 (inline Match) |
| Merge duplicate players | 4 | 2 (Features page) | 1 (merge dialog) |

#### Unnecessary steps

- **Discord split:** Member Management has a Discord tab *and* a separate Discord Directory page, with cross-link alerts between them. Staff must learn two surfaces for one concern.
- **Fuzzy Matches** is reachable from Admin Hub but **not the sidebar** — easy to forget after first use.
- **Tier is not editable** in the edit-player dialog; staff must open a separate score dialog to change tier.
- Edit player exists in **two places** with overlapping fields: Member Management (`edit-player-dialog.tsx`) and Player Profile (`player-profile/_components/edit-player-dialog.tsx`).

#### Duplicated actions

- Player search appears on Index, Member Management, Discord Directory, Create Ban, Match-to-Player, Tier Mismatches, and more — no shared "player command palette."
- Scoring UI duplicated in `score-player-dialog.tsx` and `new-application-dialog.tsx` with **slightly different tier presets** (e.g. `ability`/`region` defaults differ).

#### Action placement issues

- Accepted tab row actions are **icon-only** (Edit, Award, Status, Delete) with no labels — poor discoverability, especially for Status vs Score.
- **Mobile Accepted list drops the Status button** — only Edit, Award, Delete remain.
- No row overflow menu; all actions compete for horizontal space.

#### Bulk operation gaps

- No multi-select for status changes, scoring, or deletion.
- Merge Players handles one pair at a time.
- Discord Directory "Backfill Epic usernames" is a single global action — no per-row batch.

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | Consolidate Discord workflows into one page with tabs (Directory / Evaluation Queue / Fuzzy Matches) |
| **P1** | Add labeled action buttons or tooltips on Accepted tab rows; restore Status on mobile |
| **P1** | Add Fuzzy Matches to sidebar under Players |
| **P2** | Inline tier badge edit or quick "Score" shortcut that pre-fills from existing evaluation |
| **P2** | Bulk status change (select rows → set status) |
| **P3** | Global player command palette (⌘K search → edit/score/ban/view profile) |

---

### 2. Managing Events

**Routes:** `/admin/events-manager`, `/admin/event-results`, `/admin/uploads`, `/admin/scrim-series`  
**Key files:** `event-manager.tsx`, `event-results-manager.tsx`, `import-third-party.tsx`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| Create event | 3 | 1 | 1 (large create dialog, 15+ fields) |
| Edit event | 3 | 1 | 1 (same dialog) |
| Delete event | 4 | 1 | 1 native `confirm()` |
| Import results (CSV) | 4 | 2 (Uploads → Imports tab) | 0–1 |
| Review imported results | 3 | 1 (Event Results → expand group) | 0 |
| Delete all results for event | 4 | 1 | 1 confirm |
| Configure duo pairs | 3 | 1 (scroll to bottom of Events Manager) | 0 (inline) |
| Sync from Discord | 2 | 1 | 0 |

#### Unnecessary steps

- **Three-page pipeline:** Events Manager (metadata) → Uploads (import) → Event Results (review/delete). Staff must context-switch for a single "add event with results" workflow.
- Event create/edit dialog is **very large** with conditional fields by type — high cognitive load in one modal.
- Duo/SMD pair configuration lives at the **bottom** of Events Manager and only appears when matching event types exist — easy to miss.
- Native `window.confirm()` for deletes vs styled `AlertDialog` elsewhere — inconsistent and harder to cancel accidentally.

#### Duplicated actions

- Event name + date + leaderboard URL entered in: event-manager, import-third-party (CSV/edit/create), event-results rename, add-event-dialog on player profile.
- ICS import and manual create both require type/mode defaults separately.

#### Action placement issues

- Per-row Edit/Delete are ghost icons in the events table — consistent with other admin pages but unlabeled.
- "Clean Duplicates" is a global header action with no per-event scope indicator.

#### Bulk operation gaps

- Delete All per event group exists.
- Yunite sync supports multi-select tournament import.
- No bulk event create, bulk date shift, or bulk status update.

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | Unified "Event lifecycle" page: create → import → review in tabs or stepper on one route |
| **P1** | Replace native `confirm()` with styled dialogs on Events Manager and Event Results |
| **P2** | Collapse event form into stepped wizard (Basics → Schedule → Leaderboards → Advanced) |
| **P2** | Surface duo/SMD config as a tab within event detail, not buried at page bottom |
| **P3** | Bulk import ICS + auto-link to created events |

---

### 3. Managing Applications

**Routes:** `/admin/member-management/applications`  
**Key files:** `member-management.tsx`, `new-application-dialog.tsx`, `edit-application-dialog.tsx`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| Review pending applications | 2 | 1 | 0 |
| Accept application | 3 | 1 | 0 (one click, no confirm) |
| Reject application | 4 | 1 | 1 (reason select + confirm) |
| Create manual application | 3 | 1 | 1 (2-step wizard: info → 14 score fields) |
| Edit pending application | 3 | 1 | 1 (2-step wizard) |
| Delete application | 4 | 1 | 1 confirm |

#### Unnecessary steps

- **Accept has no confirmation** — high-impact action is one click with no undo prompt.
- New Application step 2 requires full 14-category scoring, but accepting an unevaluated application is still allowed — tier may remain unset.
- Hub deep-links to `/applications` tab; sidebar links to `/member-management` (defaults to Applications for admins) — minor URL inconsistency.

#### Duplicated actions

- Full scoring wizard duplicated from `score-player-dialog.tsx` with preset inconsistencies.
- Edit application has **dual save paths:** "Save Info Only" vs "Save All Changes" — confusing which to use.

#### Action placement issues

- Application actions (Edit, Accept, Reject, Delete) are **well-placed** — labeled inline buttons on each card. This is a good pattern other pages should follow.
- Card-per-application layout doesn't scale; no pagination or compact table view for high volume.

#### Bulk operation gaps

- No multi-select accept/reject.
- No "accept all evaluated" or batch reject with shared reason.

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | Add confirmation (or undo toast) for Accept |
| **P1** | Bulk accept/reject with checkbox selection |
| **P2** | Table view toggle for high application volume |
| **P2** | Single save button in edit-application dialog; remove "Save Info Only" split |
| **P3** | Require evaluation before accept, or show tier warning on accept-without-score |

---

### 4. Managing Support Tickets

**Routes:** `/admin/support` (staff), `/support` (public)  
**Key files:** `support-panel.tsx`, `support/page.tsx`, `convex/support.ts`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| View active tickets (staff) | 2 | 1 | 0 |
| Archive ticket | 3 | 1 | 0 |
| Delete ticket | 4 | 1 | 1 AlertDialog |
| View archived tickets | 3 | 1 (toggle + paginate) | 0 |
| Submit ticket (public) | 2 | 1 | 0 |
| Respond to ticket | **N/A** | — | — |

#### Unnecessary steps

- Staff must contact players **outside the app** — no reply/respond UI exists.
- No link from ticket card to player profile or member management record.
- Admin triage path: user submits → staff navigates Admin Home → sidebar Support (~3–4 staff clicks from cold start).

#### Duplicated actions

- Support form collects Discord username manually — same field entered across edit-player, applications, and ban creation.

#### Action placement issues

- Archive and Delete are icon-only top-right on ticket cards.
- No status beyond Active/Archived (no "In Progress", assignee, priority, or notes).

#### Bulk operation gaps

- None.

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | Add ticket categories (profile update, ban appeal, general) on public form |
| **P1** | Link ticket Discord username → player profile / member management |
| **P2** | In-app staff notes or status field (even without player-facing reply) |
| **P2** | Return ticket reference ID to submitter; optional status lookup page |
| **P3** | Bulk archive for resolved tickets |

---

### 5. Managing Bans

**Routes:** `/admin/event-bans`, `/admin/punishment-matrix`  
**Key files:** `event-bans-manager.tsx`, `create-ban-dialog.tsx`, `punishment-matrix.tsx`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| Create ban | 3 | 1 | 1 (search player + offense fields) |
| Search/filter bans | 2 | 1 | 0 |
| Delete ban | 4 | 1 | 1 ConfirmDialog |
| Post-event decrement (all active) | 3 | 1 | 0 (+ 30s countdown) |
| View offense history | 3 | 1 (Offenses tab) | 0 |
| Look up suggested penalty | 3 | 2 (separate Punishment Matrix page) | 0 |

#### Unnecessary steps

- **Punishment Matrix is read-only** — staff must open a second page to cross-reference while creating a ban.
- Suggested penalty shown in create dialog but **not auto-applied** — manual copy from suggestion.
- **30-second countdown** on "Event Passed" before mutation runs — intentional safety but adds friction; easy to miss cancel window.
- No inline edit of existing ban — must delete and recreate.

#### Duplicated actions

- Player search in create-ban dialog duplicates search on Member Management and Discord Directory.

#### Action placement issues

- PageHeader actions (Create Ban, Event Passed, Qty, Undo) are well-placed top-right — good pattern.
- Per-row delete is icon-only trash.

#### Bulk operation gaps

- "Event Passed" is a global bulk decrement — no per-player selection.
- No multi-select ban creation or deletion.

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | Embed punishment matrix reference inside create-ban dialog (collapsible panel) |
| **P1** | Auto-apply suggested penalty with one-click override |
| **P2** | Inline edit ban (type, events remaining, reason) without delete/recreate |
| **P2** | Reduce Event Passed countdown or add "Confirm now" skip for experienced mods |
| **P3** | Bulk create bans from CSV or multi-player select |

---

### 6. Managing Roles

**Routes:** `/admin/user-management`  
**Key files:** `user-management-content.tsx`, `convex/users.ts`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| Change user role | 3 | 1 | 0 (instant, no confirm) |
| View all staff users | 2 | 1 | 0 |

#### Unnecessary steps

- **No confirmation** before granting admin role — high-risk one-click action.
- Users appear only after first sign-in — no invite or pre-provision flow.
- Only three roles (admin, event_mod, viewer) with inconsistent page-level gates (`requireAdmin` vs `requireModerator` vs `hasEventBanAccess`).

#### Action placement issues

- Inline ghost buttons per row show only roles the user doesn't have — clear but no visual hierarchy for dangerous actions.

#### Bulk operation gaps

- None.

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | Confirmation dialog before granting admin role |
| **P2** | Visual distinction for admin-promote vs mod-promote buttons (color/label) |
| **P3** | Role capability matrix page showing which pages each role can access |

---

### 7. Managing Scores

**Surfaces:** Score dialog, Event Results, Uploads, Tier Re-Evaluation, Stats hub, Player Profile  
**Key files:** `score-player-dialog.tsx`, `event-results-manager.tsx`, `import-third-party.tsx`, `tier-re-evaluation.tsx`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| Manual evaluate player | 3 | 1 | 1 (14 score fields + tier presets) |
| Review event result scores | 3 | 1 (Event Results → expand) | 0 |
| Import scores (CSV/Yunite) | 4 | 2 (Uploads) | 0–1 |
| Rebuild holistic cache | 3 | 1 (Tier Re-Evaluation) | 0 |
| Compare players holistically | 5 | 1 | 1 (compare dialog) |
| Add manual event result to profile | 4 | 2 (profile → add event dialog) | 1 |

#### Unnecessary steps

- **Three score systems** (manual evaluation, imported event results, holistic cache) live on different pages with no unified "player scores" view.
- Tier Re-Evaluation suggests promotions/demotions but **cannot apply tier changes** — admin must navigate elsewhere to act.
- Event Results has no gap-fill UI for missing rows — import-only.
- Rebuild cache workflow requires optional TC/DCA recalc first — multi-step admin operation.

#### Duplicated actions

- 14 evaluation categories entered in: score-player, new-application, edit-application, CSV import.
- Event metadata (name, date, URL) re-entered across import and results flows.

#### Action placement issues

- Manual score trigger is icon-only Award button on member rows.
- Tier Mismatches uses labeled Evaluate + View — better pattern.

#### Bulk operation gaps

- Tier Re-Evaluation: multi-select → Compare (up to 4).
- Event Results: Clean Duplicates (global), Delete All per event.
- Uploads/Yunite: bulk sync tournaments.
- **No bulk manual scoring.**

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | Unified player score panel on profile: manual + event + holistic in one view |
| **P1** | "Apply suggestion" action on Tier Re-Evaluation rows |
| **P2** | Extract shared scoring form component; fix preset inconsistencies |
| **P2** | Inline add/edit event result row on Event Results (not import-only) |
| **P3** | Bulk re-evaluate selected players |

---

### 8. Managing Tiers

**Routes:** `/admin/tier-mismatches`, `/admin/tier-re-evaluation`, `/admin/tier-simulation`, `/admin/tier-impact`  
**Key files:** `tier-mismatches.tsx`, `tier-re-evaluation.tsx`, `tier-simulation.tsx`, `score-player-dialog.tsx`

#### Common tasks

| Task | Clicks | Page transitions | Modals |
|------|--------|------------------|--------|
| Fix Discord/DB tier mismatch | 3 | 1 | 1 (re-score via Evaluate) |
| Review promotion candidates | 3 | 1 (filter by status) | 0 |
| Simulate tier move impact | 5 | 2 (Re-Evaluation → Simulation) | 0 |
| Assign tier to player | 3 | 1 | 1 (score dialog — no direct tier dropdown) |
| Export tier evaluations | 4 | 2 (Features → Export) | 1 (filter dialog) |
| Lock tiers for Showdown event | 4 | 1 | 1 (buried in event edit modal) |

#### Unnecessary steps

- **No direct "set tier" control** anywhere — tier always derived from score total.
- Discord tier role fixes require **external Discord action** — app detects mismatch but can't sync roles.
- Tier Simulation is a separate page for what-if analysis — context switch from Re-Evaluation.
- Showdown "Lock Tiers" buried in event edit modal — easy to miss.

#### Duplicated actions

- Mismatch badges appear on Accepted tab *and* Tier Mismatches page — duplicated concern, no single fix action.
- Tier preset buttons in score dialog vs application dialog use different defaults.

#### Bulk operation gaps

- Export filtered evaluations CSV.
- Compare selected players.
- No bulk tier assignment or bulk Discord role sync.

#### Recommendations

| Priority | Recommendation |
|----------|----------------|
| **P1** | "Apply tier" quick action on Re-Evaluation and Mismatch rows (with confirm) |
| **P1** | Tier Simulation as inline panel on Re-Evaluation page, not separate route |
| **P2** | Showdown Lock Tiers as visible toggle on Events Manager row, not buried in edit modal |
| **P3** | Bulk apply tier changes from filtered Re-Evaluation list |

---

## User Workflows

**Important context:** Community members have **no login**. Self-service is limited to browsing and support ticket submission. Staff use Clerk auth.

### 1. Joining an Event

| Path | Clicks | Notes |
|------|--------|-------|
| Browse event details | 2–4 | Nav → Events → (optional tab correction) → event card |
| Participate in Spin scrim | 0 (web) | Discord bot `/scrim` with link code; web is view-only |
| Join community (become member) | **N/A** | No public apply page; Google Sheets → staff import |

**Friction:** No web registration. Events page has nested status × type tabs — easy to land on empty wrong tab. Spin and Scrim Series not in main nav.

### 2. Viewing Profile

| Audience | Clicks | Notes |
|----------|--------|-------|
| Public member | **N/A** | `/player/:username` is staff-only; public sees plain text on `/` directory |
| Staff | 2–3 | Members → click name → optional tab switch |

**Friction:** No "my profile" for members. Profile links on Index and event leaderboards render only for staff (`PlayerProfileLink` gates on `isModeratorOrAdmin`).

### 3. Checking Eligibility

| Path | Clicks | Notes |
|------|--------|-------|
| Manual tier combo lookup | 1 + scan | Nav → Tier Restrictions → find mode section |
| Interactive 3-player checker | **N/A** | `team-combo-calculator.tsx` exists but has **zero imports** |

**Friction:** Static reference only. Built calculator never wired to UI.

### 4. Creating a Ticket

| Path | Clicks | Notes |
|------|--------|-------|
| Submit support ticket | 2 + typing | Nav → Support → 2 fields → submit |
| Track ticket status | **N/A** | No ticket ID returned; no history view |

**Friction:** Write-only support. No categorization. All profile updates funnel through one generic form.

### 5. Updating Account

| Audience | Clicks | Notes |
|----------|--------|-------|
| Member (Discord/Epic/social) | 2 + typing | Support ticket only |
| Staff username | 3–5 | Header → Edit Username dialog (or blocking setup on first login) |

**Friction:** No member authentication or self-edit. Username editing is staff-only in header.

### 6. Viewing History

| History type | Public | Staff |
|--------------|--------|-------|
| Event/tournament results | Via event leaderboards (aggregate) | Player profile → ZBD Performance tab |
| Tier changes | Badge on `/` directory | Profile header tier history |
| Support tickets | **None** | `/admin/support` |
| Spin pairings | `/spin/:eventId` if URL shared | Same + admin controls |

**Friction:** No personal history page for members. Performance data requires staff profile access.

---

## Data Entry Workflows

### Form inventory summary

The app has **35+ forms** (dialogs and inline). All use manual `useState` — shared `FormProvider` (react-hook-form) exists but is **unused**.

### Repeated data entry clusters

| Data cluster | Forms affected | Occurrences |
|--------------|----------------|-------------|
| Discord + Epic + nickname + socials | edit-player, edit-member-status, new/edit application, admin edit player, support ticket | 5+ |
| Discord User ID | edit-player, edit-member, edit application, create-ban, manage alternates, CSV import | 6+ |
| 14 evaluation score categories | score-player, new/edit application, CSV import | 4 |
| Event name + date + leaderboard URL | event-manager, add-event, import-third-party, event-results rename | 4+ |
| Player search | Index, member mgmt, create-ban, match-to-player, discord-members, tier tools | 8+ |

### Form-specific issues

| Form | Issue | Priority |
|------|-------|----------|
| `new-application-dialog.tsx` | 2-step wizard; step 2 has 14 score fields | P2 |
| `edit-application-dialog.tsx` | Multiple save buttons: "Save Info Only" vs "Save All Changes" | P1 |
| `score-player-dialog.tsx` | Duplicate save (form submit + footer onClick); 14 fields every time | P2 |
| `event-manager.tsx` | 15+ fields in one modal; conditional fields by type | P1 |
| `create-ban-dialog.tsx` | Suggested penalty not auto-applied | P1 |
| `support/page.tsx` | No auto-fill from auth; no ticket category | P1 |
| `import-third-party.tsx` | Separate Import / Update / Create flows with overlapping fields | P2 |
| `edit-player-form-fields.tsx` | Duplicated in admin and profile contexts with different field visibility | P2 |

### Multiple save buttons

| Location | Buttons |
|----------|---------|
| `edit-application-dialog.tsx` | Save Info Only, Edit Evaluation → Save All Changes |
| `score-player-dialog.tsx` | Cancel + Save (form submit + footer duplicate) |
| `wrapped-editor.tsx` | Save, Publish, Unpublish |
| `google-sheets-manager.tsx` | Many parallel export/import actions |

### Confirmation screens

| Pattern | Where | Assessment |
|---------|-------|------------|
| Full success UI | Support submit, Spin create | Good for user-facing |
| Toast only | Most admin forms | Adequate for low-risk saves |
| No confirmation | Accept application, role change to admin | **Too risky** |
| Native `confirm()` | Event delete, event results delete | **Inconsistent** — should use styled dialogs |
| 30s countdown | Event Passed ban decrement | Unusual — consider shorter or skippable |

### Default value opportunities

| Form | Current | Recommended default |
|------|---------|---------------------|
| Create ban | Empty reason, Minor Warning type | Auto-fill from offense history + suggested penalty |
| New application | All scores empty | Copy from last evaluation if re-applicant |
| Event manager (create) | scrim / ZB Main Map | Last-used type/mode from localStorage |
| ICS import | scrim / ZB Main Map | Same as event manager defaults |
| Support ticket | Empty Discord username | Pre-fill if auth/session available |
| Edit member status (former) | "left server" | Keep current default ✓ |
| Export evaluations | All tiers/statuses selected | Keep current default ✓ |

### Auto-fill opportunities

| Opportunity | Impact |
|-------------|--------|
| Support form → Discord username from session | P2 — no member auth today |
| Create ban → auto-apply suggested penalty | P1 |
| New application from Discord Directory row → prefill identity | P2 |
| Event import → reuse last event metadata | P2 |
| Shared Zod schema for EditPlayerFormValues | P2 — reduces validation drift |

---

## Action Placement

### Hidden or hard to discover

| Action | Current location | Issue |
|--------|------------------|-------|
| Fuzzy Matches | Admin Hub only | Not in sidebar |
| Scrim Series | `/scrim-series` | Not in site header |
| Spin events | `/spin` | Not in site header; landing staff-gated |
| 2025 Wrapped | `/2025-wrapped` | Not in site header |
| Duo/SMD pair config | Bottom of Events Manager | Scroll required |
| Showdown Lock Tiers | Inside event edit modal | Buried in advanced fields |
| Team combo calculator | Orphan component | Built but never imported |
| Apply tier from Re-Evaluation | Does not exist | Read-only analytics |
| Member Management (staff shortcut) | Bottom of Index page | Only visible to staff |

### Inconsistent with other pages

| Pattern | Inconsistent pages |
|---------|-------------------|
| Icon-only row actions | Member Management Accepted, Events, Support, Bans |
| Labeled row actions | Applications cards, Tier Mismatches (Evaluate/View) |
| Native `confirm()` vs AlertDialog | Events Manager, Event Results vs everywhere else |
| Full-page vs modal edit | Most admin = modal; Wrapped editor = full page |
| Dual save buttons | edit-application vs single save elsewhere |

### Far from affected data

| Action | Data | Distance |
|--------|------|----------|
| Punishment Matrix lookup | Ban being created | Separate page |
| Tier Simulation | Re-Evaluation row | Separate page |
| Import results | Event being created | Uploads page (different route) |
| Score player | Member row | Modal OK, but tier not inline editable |
| Discord Directory | Member Management Discord tab | Separate page with cross-links |

### Relocation recommendations

| Priority | Action | Move to |
|----------|--------|---------|
| **P1** | Punishment reference | Inline panel in create-ban dialog |
| **P1** | Apply tier | Row action on Re-Evaluation / Mismatches |
| **P1** | Import results | Tab on event detail / Events Manager |
| **P2** | Fuzzy Matches | Sidebar under Players |
| **P2** | Tier Simulation | Inline panel on Re-Evaluation |
| **P2** | Team combo calculator | Tier Restrictions page |
| **P3** | Scrim Series, Spin | Site header or Events sub-nav |

---

## Bulk Operations

### Current bulk support

| Page | Bulk action | Scope |
|------|-------------|-------|
| Event Results | Delete All, Clean Duplicates | Per event / global |
| Event Bans | Event Passed decrement | All active bans |
| Uploads/Yunite | Multi-select tournament sync | Selected tournaments |
| Import third-party | Select-all tournament import | Selected |
| Tier Re-Evaluation | Multi-select → Compare | Selected players |
| Export evaluations | Filtered CSV export | Filter-based |
| Discord Directory | Backfill Epic usernames | All eligible |

### Missing bulk operations (high value)

| Workflow | Recommended bulk action | Priority |
|----------|------------------------|----------|
| Applications | Accept selected / Reject selected with reason | **P1** |
| Member Management Accepted | Change status for selected | **P1** |
| Member Management Accepted | Delete selected (with confirm) | **P2** |
| Event Bans | Create bans for multiple players | **P2** |
| Event Bans | Delete selected | **P2** |
| Tier Re-Evaluation | Apply tier to selected | **P1** |
| Tier Mismatches | Batch re-evaluate selected | **P2** |
| Support tickets | Archive selected | **P3** |
| Events Manager | Bulk date shift / archive | **P3** |
| Discord Directory | Batch match inactive members | **P2** |
| Fuzzy Matches | Accept all high-confidence matches | **P2** |

---

## Context Switching

### High context-switch workflows

| Workflow | Pages/tabs required | Severity |
|----------|---------------------|----------|
| Add event with results | Events Manager → Uploads → Event Results | **High** (3 routes) |
| Fix tier mismatch | Mismatches → Score dialog → (external Discord) | **High** |
| Review application + check Discord | Member Mgmt Applications → Discord Directory | **Medium** |
| Create ban with correct penalty | Event Bans → Punishment Matrix → back | **Medium** |
| Tier promotion workflow | Re-Evaluation → Score dialog or Simulation page | **Medium** |
| Player investigation | Index → Profile → Member Mgmt → Discord Directory | **High** |
| Import pipeline | Uploads → Yunite detail → Unmatched → back | **High** (staff) |
| Events browse (public) | Status tab × Type tab × mode/sort filters | **Medium** |

### Single-page completion recommendations

| Priority | Workflow | Proposed single-page design |
|----------|----------|----------------------------|
| **P1** | Event lifecycle | Tabbed event detail: Info / Import / Results / Duos |
| **P1** | Player admin | Unified player detail drawer: profile, scores, bans, Discord, history |
| **P2** | Tier management | Re-Evaluation page with inline Simulation panel + Apply action |
| **P2** | Ban creation | Create dialog with embedded punishment matrix |
| **P2** | Application review | Side panel showing Discord member info while reviewing |
| **P3** | Support triage | Split view: ticket list + player context panel |

---

## Dashboard Opportunities

### Current dashboards

| Dashboard | Route | Content |
|-----------|-------|---------|
| Members (public home) | `/` | Searchable roster; admin stat cards (total, S-tier, A-tier) |
| Admin Hub | `/admin` | Card grid quick links by area |
| Stats Hub | `/admin/stats` | Links to analytics sub-pages |
| Uploads overview | `/admin/uploads` | Yunite stats cards, sync controls |

### Information staff repeatedly search for

| Need | Current access | Clicks from /admin |
|------|----------------|-------------------|
| Pending applications count | Navigate to Member Mgmt → Applications | 2 |
| Active support tickets | Navigate to Support | 2 |
| Tier mismatches count | Navigate to Tier Mismatches | 2 |
| Active event bans | Navigate to Event Bans | 2 |
| Recent imports status | Navigate to Uploads | 2 |
| Players needing evaluation | Tier Mismatches → Incomplete section | 2 |
| Today's/upcoming events | Navigate to Events Manager | 2 |

### Recommended dashboard widgets

| Widget | Data | Priority |
|--------|------|----------|
| Pending applications (count + quick link) | `getPendingApplications` | **P1** |
| Open support tickets (count + latest) | Active tickets query | **P1** |
| Tier mismatches (count + quick link) | Mismatch summary | **P1** |
| Active bans (count) | Active bans query | **P2** |
| Incomplete evaluations (count) | Tier mismatches incomplete | **P2** |
| Recent imports (status/errors) | Uploads recent activity | **P2** |
| Upcoming events (next 7 days) | Events query filtered | **P2** |
| Recently viewed players | localStorage recent list | **P3** |
| Quick actions bar | New Application, Create Event, Create Ban | **P1** |

### Quick links gaps

- Admin Hub covers most tools but lacks **operational status** — it's navigation-only, not actionable.
- No "recently used" tracking for pages or players.
- Stats Hub is a second navigation layer — consider merging actionable widgets into Admin Hub and keeping Stats Hub for deep analytics only.

---

## Prioritized Findings Summary

### P1 — High impact workflow improvements

| # | Finding | Workflows affected |
|---|---------|-----------------|
| 1 | Consolidate event lifecycle (create → import → review) onto one page | Events, Scores |
| 2 | Consolidate Discord/player admin into unified player detail | Players, Applications, Tiers |
| 3 | Add bulk accept/reject for applications | Applications |
| 4 | Add "Apply tier" action on Re-Evaluation and Mismatches rows | Tiers, Scores |
| 5 | Embed punishment matrix in create-ban dialog | Bans |
| 6 | Add confirmation before granting admin role | Roles |
| 7 | Add confirmation (or undo) for application accept | Applications |
| 8 | Wire team-combo-calculator to Tier Restrictions page | User eligibility |
| 9 | Add operational widgets to Admin Hub (pending apps, tickets, mismatches) | Dashboard |
| 10 | Replace icon-only row actions with labeled buttons on high-traffic tables | Players, Events, Support, Bans |
| 11 | Add ticket categories and player profile link in support triage | Support |
| 12 | Unified player score view on profile (manual + event + holistic) | Scores |

### P2 — Important usability improvements

| # | Finding | Workflows affected |
|---|---------|-----------------|
| 1 | Stepped wizard for event create/edit dialog | Events |
| 2 | Single save button in edit-application dialog | Applications, Data entry |
| 3 | Shared scoring form component with consistent presets | Scores, Applications |
| 4 | Inline tier simulation on Re-Evaluation page | Tiers |
| 5 | Bulk status change on Accepted members | Players |
| 6 | Fuzzy Matches in sidebar | Players |
| 7 | Replace native confirm() with styled dialogs | Events |
| 8 | Ticket reference ID for public submitters | Support |
| 9 | Auto-apply suggested ban penalty with override | Bans |
| 10 | Inline edit for existing bans | Bans |
| 11 | Table view toggle for high-volume applications | Applications |
| 12 | Showdown Lock Tiers as visible event row toggle | Tiers, Events |

### P3 — Nice-to-have enhancements

| # | Finding | Workflows affected |
|---|---------|-----------------|
| 1 | Global player command palette (⌘K) | All admin |
| 2 | Recently viewed players on Admin Hub | Dashboard |
| 3 | Bulk tier apply from filtered list | Tiers |
| 4 | Scrim Series / Spin in site header | User discovery |
| 5 | Bulk archive support tickets | Support |
| 6 | Role capability matrix page | Roles |
| 7 | localStorage defaults for event type/mode | Events, Data entry |

---

## Appendix: Route & Navigation Reference

### Admin sidebar map

```
Admin Home (/admin)
├── Players
│   ├── Member Management (/admin/member-management)
│   ├── Discord Directory (/admin/discord-members)
│   └── Tier Mismatches (/admin/tier-mismatches)
├── Statistics
│   ├── Re-Evaluation (/admin/tier-re-evaluation)
│   └── Stats (/admin/stats)
├── Events
│   ├── Events Manager
│   ├── Event Results
│   ├── Uploads & Imports
│   └── Scrim Series
├── Mods
│   ├── Event Bans
│   ├── Punishment Matrix
│   ├── Spin Page (/spin)
│   └── Spin Moderation
├── Admin
│   ├── Features
│   ├── Support
│   ├── Audit Log
│   └── User Management
└── Data
    ├── Data Cache, Backup, Maintenance
    └── 2025 Wrapped Editor
```

**Not in sidebar:** Fuzzy Matches (hub only), several analytics pages (Stats hub only).

### Public site header

```
Members | Events | Tier Restrictions | Support | [Admin Home — staff] | [Staff Sign In]
```

**Not in header:** Spin, Scrim Series, Wrapped, player profiles.

### Key file index

| Concern | Primary files |
|---------|---------------|
| Routes | `src/App.tsx` |
| Public nav | `src/components/site-header.tsx` |
| Admin nav | `src/pages/admin/_components/admin-sidebar.tsx` |
| Admin hub | `src/pages/admin/hub.tsx` |
| Member management | `src/pages/admin/member-management.tsx` |
| Event management | `src/pages/admin/_components/event-manager.tsx` |
| Scoring | `src/pages/_components/score-player-dialog.tsx` |
| Support (public) | `src/pages/support/page.tsx` |
| Support (admin) | `src/pages/admin/_components/support-panel.tsx` |
| Shared form fields | `src/components/edit-player-form-fields.tsx` |
| Eligibility calculator (unused) | `src/pages/_components/team-combo-calculator.tsx` |
