# CLERK_MIGRATION_IMPLEMENTATION.md

> **Plan only — no code has been modified.**  
> Assumes migration from **Hercules Auth** (`@usehercules/auth` + Hercules OIDC) to **Clerk**
> with **Discord** as the primary staff login method.  
> Grounded in this repo's auth code, the Convex snapshot at `../convex-export/`, and
> [Convex + Clerk docs](https://docs.convex.dev/auth/clerk).

---

## Overview

| Item | Current (Hercules) | Target (Clerk) |
| --- | --- | --- |
| Frontend auth | `HerculesAuthProvider` + OIDC redirect | `ClerkProvider` + `@clerk/react` |
| Convex bridge | `ConvexProviderWithHerculesAuth` | `ConvexProviderWithClerk` (`convex/react-clerk`) |
| Backend validation | `convex/auth.config.js` → Hercules issuer | Same file → Clerk Frontend API URL |
| OAuth callback | `/auth/callback` + `useAuthCallback` | Clerk-hosted or embedded `<SignIn />` (no custom callback page) |
| User row key | `tokenIdentifier` = `https://hercules.app\|<subject>` | `tokenIdentifier` = `https://<clerk-issuer>\|user_…` |
| Roles / linked data | On `users._id` | **Unchanged** — preserve `_id`, patch `tokenIdentifier` only |

**Total estimated effort:** 2–3.5 days (one engineer), dominated by user re-link verification and production cutover.

---

## 1. Exact Clerk configuration required

### 1.1 Clerk Dashboard — application setup

Do this for **both** a **Development** instance and a **Production** instance (Clerk keeps them separate).

| Setting | Where | Value / action |
| --- | --- | --- |
| Create application | [dashboard.clerk.com](https://dashboard.clerk.com) | New application for "Co-Ed ZBD Hub" |
| Production instance | Dashboard → instance switcher → **Create production instance** | Clone dev settings or start fresh; reconfigure SSO + Convex integration manually (Clerk does **not** copy SSO/Integrations to prod) |
| **Activate Convex integration** | Dashboard → **Integrations** → **Convex** → Activate | Auto-creates the **`convex` JWT template** and exposes the **Frontend API URL** (issuer) |
| Frontend API URL (issuer) | Integrations → Convex, or **API keys** page | Dev: `https://<app>-<id>.clerk.accounts.dev` · Prod: `https://clerk.<your-domain>.com` — this becomes `CLERK_JWT_ISSUER_DOMAIN` on Convex |
| Publishable key | **API keys** → Quick copy | Dev: `pk_test_…` · Prod: `pk_live_…` → `VITE_CLERK_PUBLISHABLE_KEY` |
| Secret key | **API keys** | `sk_test_…` / `sk_live_…` — **not used by this Vite SPA**; only needed if you add a server later |
| Allowed origins | **Domains** (prod) / dev auto | Add production domain, e.g. `https://coedzbd.example.com` and `https://*.pages.dev` for preview |
| Sign-in / sign-up URLs | **Paths** (recommended) or env vars | For Account Portal flow: defaults are fine. For embedded UI: set `signInUrl` / `signUpUrl` to routes you add (e.g. `/sign-in`) |
| Post-auth redirect | **Paths** or `ClerkProvider` props | `signInFallbackRedirectUrl="/"` · `signUpFallbackRedirectUrl="/"` · `afterSignOutUrl="/"` |
| Email verification | **User & authentication** → **Email** | **Require verified email** before treating email as a migration match key |
| Disable unused strategies | **User & authentication** | If staff only use Discord, disable password / magic link to reduce attack surface (optional but recommended) |

### 1.2 JWT template (Convex)

Clerk's **Convex integration** creates a template named **`convex`**. Convex's `ConvexProviderWithClerk` requests tokens with this template automatically.

Required claims (pre-configured by the integration):

| Claim | Expected | Purpose |
| --- | --- | --- |
| `aud` | `"convex"` | Must match `applicationID` in `auth.config.js` |
| `iss` | Clerk Frontend API URL | Must match `domain` in `auth.config.js` |
| `sub` | Clerk user id (`user_…`) | Becomes the subject portion of `tokenIdentifier` |

Optional but useful claims to map in the template (Clerk pre-maps some):

| Clerk shortcode | Maps to | Used by |
| --- | --- | --- |
| `{{user.primary_email_address}}` | `email` | `updateCurrentUser`, re-link matching |
| `{{user.full_name}}` | `name` | Profile display |
| `{{user.image_url}}` | (not stored today) | Future avatar use |

**Do not rename** the template from `convex`.

### 1.3 Convex backend — `auth.config.js`

Replace Hercules provider with Clerk (keep `.js` extension — this repo already uses it):

```js
// convex/auth.config.js  (target state)
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

Set `CLERK_JWT_ISSUER_DOMAIN` in the **Convex Dashboard** (Settings → Environment Variables) for **each** deployment (dev + prod). Values differ per Clerk instance.

**Optional dual-provider window** (recommended during cutover): list **both** Hercules and Clerk providers so existing sessions and new Clerk sessions work simultaneously:

```js
export default {
  providers: [
    {
      domain: process.env.HERCULES_OIDC_AUTHORITY,
      applicationID: process.env.HERCULES_OIDC_CLIENT_ID,
    },
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

Remove the Hercules entry only after all users are re-keyed and verified.

Deploy config after every change: `npx convex dev` (dev) or `npx convex deploy` (prod).

### 1.4 Frontend provider stack (target)

Provider order matters — **Clerk must wrap Convex**:

```
ClerkProvider (publishableKey)
  └─ ConvexProviderWithClerk (client, useAuth from @clerk/react)
       └─ QueryClientProvider → ThemeProvider → App
```

Reference: [Convex Clerk React guide](https://docs.convex.dev/auth/clerk).

### 1.5 Auth state rules for this codebase

| Need | Use | Do **not** use |
| --- | --- | --- |
| Is Convex authenticated (queries/mutations)? | `useConvexAuth()` from `convex/react` | Clerk `useAuth().isSignedIn` alone |
| Sign in / sign out UI | Clerk `useClerk()` / `SignInButton` / `<SignIn />` | Hercules `signinRedirect` |
| Role / admin checks | `useUserRole()` (unchanged) | Clerk org roles (not used in this app) |
| Sync Convex user row after login | `api.users.updateCurrentUser` | Automatic — must be triggered explicitly post-Clerk |

---

## 2. Discord login setup steps

Staff currently sign in via a single OIDC redirect ("Staff Sign In"). With Clerk, Discord becomes a **social connection**.

### 2.1 Development instance (fast path)

1. Clerk Dashboard → **Configure** → **SSO connections** → **Add connection** → **For all users** → **Discord**.
2. Enable **Enable for sign-up and sign-in**.
3. For dev, leave **Use custom credentials** **off** — Clerk provides shared Discord OAuth credentials.
4. Save and enable the connection.
5. Test at the Clerk Account Portal sign-in URL (`https://<your-app>.accounts.dev/sign-in`) — Discord button should appear.

**Time:** ~15 minutes · **Risk:** Low

### 2.2 Production instance (required custom credentials)

Clerk production **does not** use shared OAuth credentials. Follow [Clerk's Discord guide](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/discord):

1. **Clerk Dashboard (production instance)** → SSO connections → Add **Discord**.
2. Toggle **Enable for sign-up and sign-in** and **Use custom credentials** on.
3. Copy Clerk's **Redirect URI** (keep the tab open).

4. **Discord Developer Portal** ([discord.com/developers/applications](https://discord.com/developers/applications)):
   - Create application (or reuse an existing bot app — separate OAuth app is cleaner).
   - **OAuth2** → **Redirects** → Add Clerk's Redirect URI exactly.
   - Copy **Client ID** and **Client Secret**.

5. Paste Client ID + Secret into Clerk → Save → **Enable connection**.

6. **Clerk Dashboard → Domains**: add your production domain; complete DNS if using Clerk subdomain.

7. **Test**: sign in with Discord on production Clerk sign-in page before pointing the live site at Clerk.

**Time:** 45–90 minutes · **Risk:** Medium (redirect URI mismatch is the common failure)

### 2.3 Mapping Discord users to existing staff rows

Discord login gives Clerk a user with an email (if Discord shares it) and a Discord account link. It does **not** automatically match Hercules `tokenIdentifier` values.

| Scenario | Re-link key |
| --- | --- |
| Staff signs in with Discord; email matches existing `users.email` | Patch `tokenIdentifier` on that row (see §7) |
| Staff used Google/other via Hercules `select_account` before | They must sign in with the **same email** on Clerk (add Google connection too, or use email magic link once to link) |
| Same person, multiple emails (known in this dataset: `billy` admin vs `Billy` no-role) | **Manual mapping** — do not auto-merge (see `USER_MIGRATION_PLAN.md` E3/E4) |

**Recommendation:** enable **Discord + Google** on Clerk if staff previously picked Google through Hercules's account chooser.

---

## 3. Every file that must change

### 3.1 Required — auth core

| File | Change |
| --- | --- |
| `package.json` | Add `@clerk/react`; remove `@usehercules/auth` |
| `convex/auth.config.js` | Replace Hercules `domain`/`applicationID` with Clerk issuer + `"convex"` |
| `src/components/providers/auth.tsx` | Replace `HerculesAuthProvider` with `ClerkProvider` (+ redirect URL props) |
| `src/components/providers/convex.tsx` | Replace `ConvexProviderWithHerculesAuth` with `ConvexProviderWithClerk` + `useAuth` from `@clerk/react` |
| `src/components/providers/default.tsx` | Ensure order: `ClerkProvider` → `ConvexProvider` → rest (may collapse `auth.tsx` into `default.tsx`) |
| `src/hooks/use-auth.ts` | Re-export Clerk hooks or provide adapter (`signOut` → `clerk.signOut()`, etc.) |
| `src/components/ui/signin.tsx` | Replace Hercules `signinRedirect`/`signout` with Clerk equivalents |
| `src/components/site-header.tsx` | Update sign-out to Clerk (`useClerk().signOut()` or adapted `useAuth`) |
| `src/pages/admin/_components/admin-sidebar.tsx` | Same sign-out update |
| `src/App.tsx` | Remove `/auth/callback` route; optionally add `/sign-in` route with Clerk `<SignIn />` |
| `src/pages/auth/Callback.tsx` | **Delete** or replace with Clerk sync-only component (see §3.3) |

### 3.2 Required — user sync & migration safety

| File | Change |
| --- | --- |
| `convex/users.ts` → `updateCurrentUser` | **Harden for migration:** when `by_token` misses, fall back to **verified-email** match and patch `tokenIdentifier` instead of inserting a duplicate row. Remove fallback after migration complete. |
| **New:** `src/components/auth-sync.tsx` (or similar) | On `useConvexAuth().isAuthenticated`, call `api.users.updateCurrentUser` once per session (replaces Callback.tsx `onSync`) |
| **New:** `convex/users/migration.ts` (internal) | One-off `internalMutation` to batch re-key `tokenIdentifier` by verified email (run from dashboard during cutover) |

### 3.3 Recommended — cleanup & hosting

| File | Change |
| --- | --- |
| `vite.config.ts` | Remove `hercules()` plugin |
| `eslint.config.js` | Remove `@usehercules/eslint-plugin` |
| `package.json` devDeps | Remove `@usehercules/vite`, `@usehercules/eslint-plugin` |
| `index.html` | Replace Hercules CDN favicon/OG URLs with self-hosted assets |
| `public/_redirects` | **New** — Cloudflare SPA fallback: `/*  /index.html  200` |
| `.env.example` | Swap Hercules OIDC vars for Clerk vars (see §5) |
| `ENVIRONMENT_SETUP.md` | Document new vars (docs-only) |

### 3.4 Files that do **not** need changes

These already use `useConvexAuth()` + Convex `users` table — **no edits** unless UX requires:

- `src/hooks/use-user-role.ts`
- `convex/auth_helpers.ts`
- `convex/schema.ts` (users table shape unchanged)
- All ~25 components importing `useUserRole`
- `src/components/username-setup-dialog.tsx`
- `src/components/admin-chat-widget.tsx`
- Entire Discord bot / Convex HTTP layer (`convex/http.ts`, `discord-auto-sync.*`)

---

## 4. Exact package changes

### Add

```bash
npm install @clerk/react
```

`ConvexProviderWithClerk` is exported from the existing **`convex`** package (`convex/react-clerk`) — no extra Convex package.

### Remove (after Clerk works end-to-end)

```bash
npm uninstall @usehercules/auth
npm uninstall @usehercules/vite @usehercules/eslint-plugin   # dev-only cleanup
```

### Version notes

| Package | Current | Notes |
| --- | --- | --- |
| `convex` | `^1.39.1` | Already satisfies Clerk integration peer requirements |
| `react` | `^19.2.0` | Compatible with `@clerk/react` |
| `@clerk/react` | (new) | Use latest 5.x; pin after first successful install |

### `package.json` scripts

No script changes required. Build remains `tsc -b && vite build`.

---

## 5. Exact environment variables required

### 5.1 Frontend — Vite (build time, set in `.env` + Cloudflare Pages)

| Variable | Required? | Example | Replaces |
| --- | --- | --- | --- |
| `VITE_CONVEX_URL` | **Yes** | `https://happy-animal-123.convex.cloud` | (unchanged) |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Yes** | `pk_test_…` / `pk_live_…` | All `VITE_HERCULES_OIDC_*` |

### 5.2 Frontend — optional Clerk routing (Vite or Cloudflare env)

| Variable | Required? | Purpose |
| --- | --- | --- |
| `VITE_CLERK_SIGN_IN_URL` | Optional | e.g. `/sign-in` if using embedded `<SignIn />` |
| `VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Optional | Default `/` after sign-in |
| `VITE_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Optional | Default `/` after sign-up |

Clerk also accepts dashboard **Paths** configuration instead of env vars (recommended for prod).

### 5.3 Convex Dashboard (runtime, never in the browser)

| Variable | Required? | Dev example | Prod example |
| --- | --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | **Yes** | `https://verb-noun-00.clerk.accounts.dev` | `https://clerk.yourdomain.com` |
| `HERCULES_OIDC_AUTHORITY` | Only during dual-provider window | `https://hercules.app` | same |
| `HERCULES_OIDC_CLIENT_ID` | Only during dual-provider window | (existing client id) | same |

Set via:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://....clerk.accounts.dev"   # dev deployment
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://clerk.yourdomain.com"    # prod deployment
```

### 5.4 Variables to **remove** after cutover

**Frontend (Cloudflare + `.env`):**

- `VITE_HERCULES_OIDC_AUTHORITY`
- `VITE_HERCULES_OIDC_CLIENT_ID`
- `VITE_HERCULES_OIDC_PROMPT`
- `VITE_HERCULES_OIDC_RESPONSE_TYPE`
- `VITE_HERCULES_OIDC_SCOPE`
- `VITE_HERCULES_OIDC_REDIRECT_URI`
- `VITE_HERCULES_WEBSITE_ID`

**Convex:**

- `HERCULES_OIDC_AUTHORITY`
- `HERCULES_OIDC_CLIENT_ID`

### 5.5 Target `.env.example` snippet (Clerk era)

```dotenv
VITE_CONVEX_URL="https://your-deployment.convex.cloud"
VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."

# Convex Dashboard only (documented, not VITE_):
# CLERK_JWT_ISSUER_DOMAIN="https://your-app.clerk.accounts.dev"
```

---

## 6. Migration order

Execute in this sequence. Each step includes **time** and **risk** estimates.

| Step | Action | Time | Risk |
| --- | --- | --- | --- |
| **0** | **Backup:** `npx convex export` → store snapshot; record current 6 `users` rows (`role`, `username`, `_id`, `email`, `tokenIdentifier`) | 15 min | Low |
| **1** | Create Clerk **dev** instance; activate **Convex** integration; enable **Discord** (shared creds) | 30 min | Low |
| **2** | Set Convex **dev** env `CLERK_JWT_ISSUER_DOMAIN`; update `auth.config.js` (Clerk only or dual-provider) | 15 min | Low |
| **3** | `npm install @clerk/react`; wire providers (`ClerkProvider`, `ConvexProviderWithClerk`); add `auth-sync` component | 2–3 hrs | Medium |
| **4** | Replace `signin.tsx`, header/sidebar sign-out; remove `/auth/callback` route | 1–2 hrs | Medium |
| **5** | Harden `updateCurrentUser` with verified-email fallback (migration-only safety net) | 1 hr | **High** if skipped |
| **6** | Deploy Convex dev + test locally: Discord sign-in → `useConvexAuth` true → `getCurrentUser` returns row | 1 hr | Medium |
| **7** | **Re-link dev users:** sign in each staff account on Clerk dev; verify email fallback patches `tokenIdentifier` **in place** (row count stays 6) | 1–2 hrs | **High** |
| **8** | Verify roles: each admin/event_mod retains `role`; spot-check linked records (auditLogs `userId` unchanged) | 30 min | Medium |
| **9** | Create Clerk **production** instance; custom Discord OAuth; production domain/DNS | 1–2 hrs | Medium |
| **10** | Set Convex **prod** `CLERK_JWT_ISSUER_DOMAIN`; run batch re-key `internalMutation` on prod **before** opening login | 1 hr | **High** |
| **11** | Cloudflare Pages: set env vars, add `_redirects`, deploy preview; smoke test | 1 hr | Low |
| **12** | **Cutover window:** pause Discord bot + Convex crons briefly; run re-key; deploy frontend + `npx convex deploy`; staff verify login | 1–2 hrs | **High** |
| **13** | Remove Hercules provider from `auth.config.js`; remove Hercules npm packages + vite/eslint plugins; remove unused env vars | 30 min | Low |
| **14** | Post-cutover monitoring 48h; then remove email fallback from `updateCurrentUser` | 30 min | Low |

**Critical path:** Steps **5 → 7 → 10 → 12** — user re-link before general access.

---

## 7. User re-link strategy

Based on live data: **6 users**, **3 admins**, **1 event_mod**, **~6,300+ linked records** owned by one admin `_id` (`plumbry`). All links use `users._id`, not `tokenIdentifier`.

### 7.1 Target `tokenIdentifier` format after Clerk

```
https://<CLERK_JWT_ISSUER_DOMAIN>|user_<clerkUserId>
```

Example (redacted):

```
https://verb-noun-00.clerk.accounts.dev|user_2abc…xyz
```

This replaces the current Hercules format:

```
https://hercules.app|<legacy-subject-or-usr_01K…>
```

### 7.2 Strategy: in-place re-key (mandatory)

**Never** delete and re-insert `users` rows. **Only** patch `tokenIdentifier` on the existing `_id`.

| Field | Action during migration |
| --- | --- |
| `_id` | **Preserve** — all 15 FK fields across 13 tables stay valid |
| `role` | **Preserve** — do not re-derive from Clerk |
| `username` | **Preserve** |
| `tokenIdentifier` | **Replace** with Clerk value |
| `name`, `email` | Update from Clerk identity on next `updateCurrentUser` (optional) |

### 7.3 Re-link methods (use both)

**Method A — Batch pre-key (production cutover)**

1. Each staff member creates/logs into Clerk once (controlled window).
2. Record `{ email (verified), clerkUserId }`.
3. Compute `newTokenIdentifier = `${CLERK_JWT_ISSUER_DOMAIN}|${clerkUserId}``.
4. Run internal mutation (from `USER_MIGRATION_PLAN.md` §4 Phase 2):

   ```
   For each mapping:
     find users row where normalize(email) matches
     assert exactly 1 match
     patch tokenIdentifier only
   ```

**Method B — Login-time safety net (code change in step 5)**

Extend `updateCurrentUser`:

```
1. identity = ctx.auth.getUserIdentity()
2. user = by_token(identity.tokenIdentifier)
3. if user → patch name/email; return
4. if identity.email_verified (or Clerk equivalent):
     user = single match by normalized email
     if user → patch tokenIdentifier + name/email; return   // NO INSERT
5. insert new row (first-time user only)
```

### 7.4 Per-user checklist (from export)

| Username | Role | Email domain (redacted) | Notes |
| --- | --- | --- | --- |
| `plumbry` | admin | `…@gmail.com` | ~6,300 linked records — verify first |
| `billy` | admin | `…@outlook.com` | Do not merge with no-role Billy gmail row |
| `plumalt` | admin | `…@gmail.com` | Separate intentional account (same human as plumbry) |
| `plumbrytv` | event_mod | `…@gmail.com` | Separate intentional account |
| `cherko` | (none) | `…@gmail.com` | Has username, no role |
| (no username) | (none) | `…@gmail.com` | Minimal row — likely Billy alternate |

### 7.5 Verification queries (post re-key)

Run mentally / via dashboard after migration:

- [ ] `users` count === 6 (no new rows)
- [ ] 3 rows with `role: "admin"`, 1 with `role: "event_mod"`
- [ ] All 6 `tokenIdentifier` values start with Clerk issuer, not `hercules.app`
- [ ] Admin signs in → `requireAdmin` succeeds → `/admin/member-management` loads
- [ ] Sample `auditLogs` row still has `userId: j57dp3…` (unchanged `_id`)

---

## 8. Rollback procedure

### 8.1 Triggers for rollback

- Any admin loses `role` after login
- `users` row count increases without intentional new staff
- `useConvexAuth().isAuthenticated` false after successful Clerk sign-in (config mismatch)
- Linked-record attribution broken in audit trail spot-check

### 8.2 Rollback steps

| Order | Action |
| --- | --- |
| 1 | **Stop** — revert Cloudflare deployment to last Hercules frontend build (keep previous env vars snapshot) |
| 2 | Restore Convex `auth.config.js` to Hercules-only provider |
| 3 | Restore Convex env: `HERCULES_OIDC_AUTHORITY`, `HERCULES_OIDC_CLIENT_ID`; remove or ignore `CLERK_JWT_ISSUER_DOMAIN` |
| 4 | `npx convex deploy` to push auth config |
| 5 | If `users` rows were corrupted: `npx convex import` the Phase-0 export **users table only** (or full snapshot if needed) |
| 6 | Verify Hercules login + admin access on preview URL |
| 7 | Post-mortem: fix mapping before retry |

**Rollback time:** 30–60 minutes if export is ready.  
**Rollback risk:** Low if Phase-0 export exists and Hercules OIDC remains active.

### 8.3 What rollback cannot undo

- Clerk accounts already created (harmless orphan Clerk users)
- Staff confusion from dual login methods — communicate clearly

---

## 9. Deployment plan for Cloudflare Pages

### 9.1 Repository prerequisites

| Item | Action |
| --- | --- |
| SPA routing | Add `public/_redirects` with `/*  /index.html  200` |
| Lockfile | Standardize on `package-lock.json` **or** `pnpm-lock.yaml` (repo has both today — pick one) |
| Build | `npm run build` → output `dist/` |

### 9.2 Cloudflare Pages project settings

| Setting | Value |
| --- | --- |
| Framework preset | None / Vite |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root is `app/`) |
| Node version | 20 or 22 (Environment variable `NODE_VERSION=20`) |

### 9.3 Environment variables (Cloudflare → Settings → Environment variables)

**Production:**

| Name | Value |
| --- | --- |
| `VITE_CONVEX_URL` | Production Convex deployment URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` from Clerk **production** instance |

**Preview (optional):**

| Name | Value |
| --- | --- |
| `VITE_CONVEX_URL` | Dev Convex deployment URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_…` from Clerk **development** instance |

> Vite inlines `VITE_*` at build time. Changing Clerk keys requires a **rebuild**, not just a runtime config change.

### 9.4 Convex production deploy (separate from Pages)

```bash
# From app/ directory, with prod deployment selected
npx convex deploy
```

Ensure Convex **production** has `CLERK_JWT_ISSUER_DOMAIN` set **before** the frontend goes live.

### 9.5 DNS & Clerk production domain

1. Cloudflare Pages custom domain → e.g. `hub.coedzbd.com`
2. Clerk production → **Domains** → add same domain; complete DNS verification
3. Clerk **Paths** → allow redirect back to `https://hub.coedzbd.com/`

### 9.6 Deploy sequence (production)

```
1. npx convex export                    # backup
2. Run user re-key on prod Convex
3. npx convex deploy                    # auth.config.js + hardened updateCurrentUser
4. git push → Cloudflare build          # new VITE_* keys
5. Smoke test production URL
6. Re-enable Discord bot + crons
```

### 9.7 What Cloudflare does **not** host

| Component | Host |
| --- | --- |
| Convex backend | Convex Cloud |
| Discord bot (`discord-auto-sync.*`) | Separate Node process / VPS / worker |
| Clerk auth UI (Account Portal) | Clerk-hosted (`*.accounts.dev` or your Clerk subdomain) |

---

## 10. Final checklist — zero permission / data loss

Use this as the **go/no-go gate** before and after cutover. Every item must pass.

### 10.1 Pre-cutover (before staff can log in via Clerk on prod)

- [ ] Phase-0 Convex export stored securely
- [ ] Clerk **production** Discord OAuth tested on Clerk sign-in page
- [ ] `CLERK_JWT_ISSUER_DOMAIN` set on Convex **production**
- [ ] `auth.config.js` deployed with Clerk provider (dual-provider OK during window)
- [ ] `updateCurrentUser` email fallback deployed
- [ ] Batch re-key mapping table prepared: 6 emails → 6 Clerk user IDs → 6 new tokenIdentifiers
- [ ] Manual mapping documented for multi-email edge cases (`billy` / Billy, three Bryony accounts)
- [ ] Discord bot + crons paused for cutover window

### 10.2 User identity (no duplicates, no lost roles)

- [ ] **`users` row count unchanged** (6 → 6, not 7+)
- [ ] **Every pre-migration admin `_id` unchanged** (`j57dp3…`, `j57dd…`, `j572q…`)
- [ ] **`plumbry` → `role: "admin"`** after Clerk login
- [ ] **`billy` → `role: "admin"`** after Clerk login
- [ ] **`plumalt` → `role: "admin"`** after Clerk login
- [ ] **`plumbrytv` → `role: "event_mod"`** after Clerk login
- [ ] **No admin row lost `role`** (compare to Phase-0 export)
- [ ] **No duplicate rows** for the same email (exactly one row per email)
- [ ] **`tokenIdentifier` no longer contains `hercules.app`** for any active staff row
- [ ] **`username` preserved** on all rows that had one (`plumbry`, `billy`, `plumalt`, `plumbrytv`, `cherko`)

### 10.3 Permissions behavior (runtime)

- [ ] Admin login → `useUserRole().isAdmin === true`
- [ ] Event mod login → `isModeratorOrAdmin === true`, `isAdmin === false`
- [ ] Viewer/no-role login → admin UI hidden; public pages work
- [ ] `requireAdmin(ctx)` accepts admin token on Convex mutations (e.g. user role update)
- [ ] `requireModeratorOrAdmin(ctx)` accepts event_mod token
- [ ] Sign-out clears Convex auth (`useConvexAuth().isAuthenticated === false`)

### 10.4 Linked records (no orphans)

Linked records reference `users._id`. Confirm `_id` unchanged, then spot-check:

- [ ] `auditLogs` — sample row still points at `j57dp3…` for plumbry's actions
- [ ] `events.createdBy` — events created by admin still reference original `_id`
- [ ] `thirdPartyImports.importedBy` — unchanged
- [ ] `players.createdBy` — unchanged (spot-check)
- [ ] `chatMessages.userId` — unchanged
- [ ] `supportTickets.archivedBy` — unchanged
- [ ] `tierHistory.changedBy` — unchanged (spot-check)
- [ ] **Total linked-record count** for `j57dp3…` still ~6,300+ (order-of-magnitude check via dashboard export or query)

### 10.5 Auth flow (Clerk + Convex integration)

- [ ] Discord sign-in completes without error
- [ ] `useConvexAuth().isAuthenticated` becomes `true` within a few seconds
- [ ] `api.users.getCurrentUser` returns the **existing** row (same `_id`, not a new one)
- [ ] `auth-sync` calls `updateCurrentUser` once after login (name/email refreshed)
- [ ] Username setup dialog **does not** appear for users who already have `username`
- [ ] Deep link `/admin/member-management` works when authenticated (SPA `_redirects`)

### 10.6 Production infrastructure

- [ ] Cloudflare build succeeds with `VITE_CLERK_PUBLISHABLE_KEY` + `VITE_CONVEX_URL`
- [ ] Clerk production domain verified
- [ ] No Hercules env vars remain in Cloudflare production environment
- [ ] Rollback snapshot + previous deploy ID documented

### 10.7 Post-cutover cleanup (after 48h stable)

- [ ] Remove Hercules provider from `auth.config.js`
- [ ] Remove `@usehercules/*` packages
- [ ] Remove email fallback from `updateCurrentUser` (or keep permanently as safety — team decision)
- [ ] Delete `src/pages/auth/Callback.tsx` and Hercules-only docs references
- [ ] Update `ENVIRONMENT_SETUP.md` / `.env.example`

---

## Appendix A — Provider wiring reference (target code sketch)

Not implemented — reference for the migration PR:

```tsx
// src/components/providers/default.tsx (target)
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL!);

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY!}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {/* QueryClient, Theme, auth-sync, children */}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

```tsx
// src/components/auth-sync.tsx (new — target)
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useEffect, useRef } from "react";

export function AuthSync() {
  const { isAuthenticated } = useConvexAuth();
  const updateCurrentUser = useMutation(api.users.updateCurrentUser);
  const synced = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !synced.current) {
      synced.current = true;
      updateCurrentUser().catch(console.error);
    }
    if (!isAuthenticated) synced.current = false;
  }, [isAuthenticated, updateCurrentUser]);

  return null;
}
```

---

## Appendix B — Risk summary by area

| Area | Risk level | Mitigation |
| --- | --- | --- |
| User re-link / duplicate rows | **Critical** | In-place re-key + email fallback + row-count gate |
| Admin role loss | **Critical** | Never insert on login; verify 3 admins post-cutover |
| Linked record orphans | **High** | Preserve `_id`; spot-check 6,300+ plumbry links |
| Clerk ↔ Convex JWT mismatch | **Medium** | Convex integration + `CLERK_JWT_ISSUER_DOMAIN` + redeploy |
| Discord OAuth prod config | **Medium** | Test on Clerk portal before site cutover |
| Cloudflare SPA 404 on refresh | **Low** | `public/_redirects` |
| Hercules removal / cleanup | **Low** | Do last, after 48h stable |

---

## Related documents

- `MIGRATION_AUDIT.md` — Hercules touch-point inventory
- `AUTH_MIGRATION.md` — option comparison (Clerk recommended)
- `USER_MIGRATION_PLAN.md` — detailed re-link theory + edge cases
- `ENVIRONMENT_SETUP.md` — full env var catalog
- `HOSTING_OPTIONS.md` — Cloudflare Pages rationale
- `TEST_CHECKLIST.md` — full feature regression list
