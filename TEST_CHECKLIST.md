# TEST_CHECKLIST.md

> Post-migration verification checklist. Derived from the actual routes in
> `src/App.tsx`, Convex functions in `convex/**`, and the auth flow. Use it after any
> auth/hosting migration. Test signed-out, signed-in (viewer), `event_mod`, and
> `admin` perspectives where relevant.

## Note on "Registration"

This app has **no separate registration form**. Identity comes from the OIDC provider;
a Convex `users` record is **auto-created on first authenticated sync** via
`api.users.updateCurrentUser` (called from `/auth/callback`). "Registration" testing
therefore means: a brand-new identity logging in for the first time correctly creates
a `users` row and then prompts for a username.

---

## 1. Login

- [ ] "Sign In" / "Staff Sign In" button (`src/components/ui/signin.tsx`,
      `site-header.tsx`) redirects to the auth provider.
- [ ] After login, redirect lands on `/auth/callback` and then navigates home.
- [ ] `useConvexAuth().isAuthenticated` becomes `true` (Convex receives the token).
- [ ] Token **silent refresh** works across a long session (token near expiry is
      refreshed without forcing re-login).
- [ ] Sign out (header, admin sidebar) clears the session; protected admin UI
      disappears.
- [ ] Login error surfaces a toast (the `error` branch in `signin.tsx`).
- [ ] Deep-link refresh on a protected route (e.g. `/admin/member-management`) while
      signed in still works (SPA fallback + auth rehydrate).

## 2. Registration (first-time user provisioning)

- [ ] A never-seen identity logging in creates exactly one `users` row keyed by the
      new `tokenIdentifier`.
- [ ] `name` and `email` are populated from the identity on first sync.
- [ ] The username setup dialog (`src/components/username-setup-dialog.tsx`) appears
      for a user with no `username`.
- [ ] **Migration-specific:** an existing pre-migration user is correctly re-linked
      to their existing row (keeps `role` + `username`) and does **not** get a
      duplicate row. (This is the highest-risk item — see `AUTH_MIGRATION.md`.)

## 3. User profiles

- [ ] Username setup dialog: validation (3–20 chars, `[a-zA-Z0-9_]`, uniqueness,
      case-insensitive) — `convex/users.ts` `setUsername` / `checkUsernameAvailable`.
- [ ] Edit username dialog (`src/components/edit-username-dialog.tsx`) updates and
      enforces uniqueness.
- [ ] Player profile page `/player/:username` loads for public visitors.
- [ ] Profile tabs render (in-game stats, ZBD performance, third parties) — admin-only
      controls hidden for viewers.
- [ ] `useUserRole()` returns correct flags for each role (`isAdmin`, `isEventMod`,
      `isModeratorOrAdmin`, `hasEventBanAccess`, `isViewer`).

## 4. Scrims

- [ ] Scrims landing `/spin` (`src/pages/scrims/page.tsx`) loads.
- [ ] Scrim event page `/spin/:eventId` (`event-page.tsx`) loads; admin-token query
      param path works (`?token=...`).
- [ ] Spin wheel / team pairing UI works (`_components/spin-wheel.tsx`,
      `_lib/pairing-algorithm.ts`).
- [ ] Scrim series `/scrim-series` and `/scrim-series/:slug` leaderboard load.
- [ ] Creating/linking scrim events via the Discord webhook
      (`POST /api/scrim-events`, `/api/scrim-events/link`) succeeds with a valid
      `DISCORD_SYNC_API_KEY` and returns a working `adminUrl`.
- [ ] Spin moderation admin page `/admin/spin-moderation` gated to `hasEventBanAccess`.
- [ ] CSV export (`_lib/csv-export.ts`) produces correct output.

## 5. Events

- [ ] Events list `/events` (`src/pages/events/page.tsx`) loads.
- [ ] Event detail `/events/:eventId` (`_components/event-detail.tsx`) loads; admin
      controls only for `isAdmin`.
- [ ] Admin events manager `/admin/events-manager` and event results
      `/admin/event-results` work (create/edit/results).
- [ ] ICS import (`convex/events/icsImport.ts`) and Discord event sync still function.
- [ ] Daily cron "sync discord events" runs (`convex/crons.ts` → `discord/eventSync`).

## 6. Chat

- [ ] Admin chat widget (`src/components/admin-chat-widget.tsx`) appears only for
      `isAdmin` and not while role is loading.
- [ ] Sending/receiving messages works against `convex/chat.ts` (reads + writes).
- [ ] Real-time updates: a new message appears live (Convex subscription) without
      refresh.

## 7. Support tickets

- [ ] Public support page `/support` (`src/pages/support/page.tsx`) lets a user
      create a ticket (`convex/support.ts` write).
- [ ] Admin support page `/admin/support` lists tickets and allows responses/status
      changes (gated to staff).
- [ ] Ticket reads/writes reflect in real time.

## 8. Admin functionality

- [ ] All `/admin/*` routes load for an `admin` and are blocked/empty for viewers.
- [ ] `requireAdmin` / `requireModeratorOrAdmin` / `requireEventBanAccess`
      (`convex/auth_helpers.ts`) correctly reject unauthorized callers (ConvexError
      `FORBIDDEN`).
- [ ] User management `/admin/user-management` + `/admin/member-management`: list
      users, change roles (`updateUserRole`); admin cannot demote self.
- [ ] Role change writes an audit log entry (`convex/helpers/audit.ts`, viewable at
      `/admin/audit`).
- [ ] `becomeAdmin` path behaves as intended (bootstrap admin).
- [ ] Representative admin tools load and run: tier re-evaluation/simulation, stats,
      leaderboard, player comparison, data cache status, data backup,
      uploads, in-game earnings, event bans, punishment matrix, wrapped editor/preview,
      fuzzy matches, unmatched players, Yunite debug/tournament.
- [ ] Data backup `/admin/data-backup` (`convex/dataBackup.ts`) export works
      (useful to snapshot `users` **before** the migration cutover).

## 9. Convex reads and writes

- [ ] Authenticated queries return data (`getCurrentUser` returns the row when signed
      in, `null` when signed out — no error).
- [ ] Mutations succeed when authenticated and fail with `UNAUTHENTICATED` when not.
- [ ] `ctx.auth.getUserIdentity()` returns a valid identity with the new provider
      (correct `tokenIdentifier`, `name`, `email`).
- [ ] Real-time subscriptions update across tabs.
- [ ] Public (unauthenticated) reads still work where intended (player profiles,
      events, tier restrictions, leaderboards).
- [ ] HTTP actions in `convex/http.ts` respond correctly (200 / 400 / 401 / 404).

## 10. Discord integrations

- [ ] `GET /api/member?discordId=...` returns tier/evaluation or 404.
- [ ] `POST /api/discord/sync-member` upserts a Discord member (valid key) / 401 (bad
      key).
- [ ] `POST /api/discord/archive-missing` archives members not in the server.
- [ ] Pending role syncs/removals endpoints (`/api/discord/pending-role-syncs`,
      `/pending-role-removals`) and their acknowledge counterparts work.
- [ ] CORS preflight (`OPTIONS`) on `/api/scrim-events` and `/api/scrim-events/link`
      returns 204 with correct headers.
- [ ] Daily crons run: "sync discord events", "sync event bans", "sync discord
      members" (`convex/crons.ts`).
- [ ] Discord role sync actions work (`convex/discord/roles.ts`, `sync.ts`,
      `eventSync.ts`, `archiveNoTierRole.ts`) with `DISCORD_BOT_TOKEN` /
      `DISCORD_GUILD_ID`.
- [ ] Standalone bot script `discord-auto-sync.*` authenticates to Discord and posts
      to `API_URL` with `API_KEY` matching Convex.
- [ ] Yunite sync features work (`convex/yunite/*`) with `YUNITE_API_KEY` /
      `YUNITE_GUILD_ID`.
- [ ] Google Sheets event-bans sync works (`convex/eventBans/sync.ts`,
      `googleSheets.ts`) with `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS`.

## 11. Build / hosting smoke tests (post-deploy)

- [ ] Production build succeeds (`npm run build`) and serves from `dist`.
- [ ] Direct navigation to a deep route (e.g. `/admin/stats`) returns the SPA, not a
      404 (SPA fallback configured).
- [ ] `VITE_CONVEX_URL` points at the production Convex deployment (not localhost).
- [ ] Auth redirect URI matches the deployed domain in the provider's allowed list.
- [ ] Service worker (`public/sw.js`, `src/hooks/use-service-worker.ts`) registers and
      does not serve stale auth state.
- [ ] Favicon / OG images load (or are replaced if leaving the Hercules CDN).
