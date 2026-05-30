# DISCORD_ONLY_MIGRATION.md

> **Plan only — no code modified in this step.**  
> Defines migration from **Hercules Auth** to **Clerk with Discord as the sole login method**.  
> All other Clerk sign-in strategies are disabled. Existing Convex data (`users._id`, roles,
> usernames, and 15 foreign-key fields across 13 tables) must be preserved.

---

## Executive summary

| Principle | Detail |
| --- | --- |
| Auth provider | Clerk (`@clerk/react` + `ConvexProviderWithClerk`) |
| Only login path | Discord OAuth via Clerk SSO connection |
| Identity key in Convex | `users.tokenIdentifier` = `<clerk-issuer>\|user_…` (patched in place) |
| What must never change | `users._id`, `role`, `username`, and all linked records |
| Best re-link key | **Discord user ID** (stable snowflake) — requires a planned schema addition |
| Fallback re-link key | **Verified email** (when Discord shares it with Clerk) |
| Staff-only access | Clerk **Restricted** sign-up mode + allowlist recommended |

This app is staff-facing ("Staff Sign In"). Discord-only auth is appropriate, but Hercules
users have **no Discord ID stored on the `users` table today** — only `email`, `name`,
and `username`. Mapping Hercules → Discord therefore needs a deliberate cutover plan, not
just "sign in with Discord and hope."

---

## 1. Clerk Discord-only configuration

### 1.1 Create and wire Clerk + Convex (both dev and prod instances)

Do this once per Clerk instance (Development and Production are separate).

| Step | Location | Action |
| --- | --- | --- |
| 1 | [Clerk Dashboard](https://dashboard.clerk.com) | Create application (e.g. "Co-Ed ZBD Hub") |
| 2 | **Integrations → Convex → Activate** | Creates JWT template named **`convex`**; copy **Frontend API URL** (issuer) |
| 3 | Convex Dashboard → Environment Variables | Set `CLERK_JWT_ISSUER_DOMAIN` = Frontend API URL |
| 4 | `convex/auth.config.js` | `{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }` |
| 5 | Deploy Convex **dev only** during testing | `npx convex dev` — **do not** `npx convex deploy` (prod) until cutover |
| 6 | Frontend `.env` | `VITE_CLERK_PUBLISHABLE_KEY=pk_test_…` (dev) / `pk_live_…` (prod) |

Reference: [Convex + Clerk docs](https://docs.convex.dev/auth/clerk).

### 1.2 Enable Discord as the only SSO connection

| Step | Location | Action |
| --- | --- | --- |
| 1 | **Configure → SSO connections** | Add connection → **For all users** → **Discord** |
| 2 | Toggle **Enable for sign-up and sign-in** | On |
| 3 | Dev | **Use custom credentials** can stay off (Clerk shared creds) |
| 4 | Prod | **Use custom credentials** must be on (see §2) |
| 5 | Confirm Discord is the **only enabled** SSO connection | Disable/remove Google, GitHub, Apple, etc. if any were added |

### 1.3 Disable all non-Discord login methods

Under **Configure → User & authentication**, disable every strategy except Discord SSO.

| Strategy | Setting | Target |
| --- | --- | --- |
| **Email address** | Disable as sign-in identifier | Off (or "Email address" sign-in disabled) |
| **Password** | Disable | Off — no email/password login |
| **Email verification code** | Disable | Off — no magic-link login |
| **Phone number** | Disable | Off |
| **Username** | Disable as Clerk identifier | Off (app `username` stays in Convex, not Clerk) |
| **Passkeys** | Disable | Off |
| **Google / GitHub / etc.** | SSO connections | None enabled except Discord |
| **Enterprise SSO (SAML)** | Disable | Off |

> **Note:** Disabling Password in Clerk only blocks **new** password sign-ups. For a
> greenfield Discord-only app, ensure no password users exist in Clerk before cutover.

### 1.4 Restrict who can create Clerk accounts (staff-only)

Because Discord-only still allows **any Discord user** to sign up unless restricted:

| Setting | Location | Recommended value |
| --- | --- | --- |
| **Sign-up mode** | **Configure → Restrictions** | **Restricted** — only invited / allowlisted users can sign up |
| **Allowlist** | Same page | Add staff Discord emails (when known) or pre-create Clerk users via Dashboard |
| **Invitations** | **Users → Invitations** | Optional: invite each staff member before cutover |

Alternative for small teams: create each staff Clerk user manually in the Dashboard,
connect their Discord account, then enable Restricted mode so no one else can register.

### 1.5 Sign-in UX (Discord-only)

| Option | When to use |
| --- | --- |
| **Account Portal** (default) | `SignInButton` / `redirectToSignIn()` opens Clerk-hosted page with Discord button only |
| **Embedded `<SignIn />`** | Add route `/sign-in` with `appearance` hiding non-Discord elements; set `ClerkProvider` `signInUrl` |

Recommended props on `ClerkProvider`:

```
signInFallbackRedirectUrl="/"
signUpFallbackRedirectUrl="/"
afterSignOutUrl="/"
```

With Restricted sign-up, first-time staff appear as "sign in" (invited) not public sign-up.

### 1.6 JWT template for Convex (Discord-only considerations)

Keep the **`convex`** template from the Convex integration. Verify these claims exist:

| Claim | Source | Used for |
| --- | --- | --- |
| `sub` | Clerk user id (`user_…`) | `tokenIdentifier` subject |
| `email` | Primary email (if Discord provides one) | Migration fallback matching |
| `email_verified` | Clerk | Gate email-based re-link |
| `name` | Discord display name | Profile display |

**Recommended addition** (Clerk Dashboard → JWT templates → `convex` → Claims):

```json
"discord_id": "{{user.external_accounts.discord.provider_user_id}}"
```

This requires Discord to be connected and may need a custom claim path — verify in Clerk's
JWT template editor after a test Discord login. Storing Discord ID on the Convex `users`
row (see §3) makes re-link deterministic and removes dependence on email.

### 1.7 What Discord-only changes in the auth flow

```
Before (Hercules):
  Staff Sign In → Hercules OIDC → /auth/callback → updateCurrentUser → Convex

After (Discord-only Clerk):
  Staff Sign In → Clerk Account Portal → Discord OAuth → Clerk session
    → ConvexProviderWithClerk fetches "convex" JWT
    → AuthSync calls updateCurrentUser → Convex
```

No `/auth/callback` route. No Hercules env vars. No other OAuth providers.

---

## 2. Required Discord Developer Portal setup

### 2.1 Development (Clerk shared credentials)

Clerk dev instances can use Clerk's shared Discord OAuth app. **No Discord Developer Portal
setup required** for initial local testing.

Still verify Discord login at: `https://<your-app>.accounts.dev/sign-in`

### 2.2 Production (custom credentials — mandatory)

Clerk production **requires** your own Discord OAuth application.

| Step | Discord Developer Portal | Clerk Dashboard |
| --- | --- | --- |
| 1 | [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application** | — |
| 2 | Name it (e.g. "Co-Ed ZBD Hub Staff Login") | — |
| 3 | **OAuth2** → **Redirects** → Add redirect URI | Copy URI from Clerk SSO → Discord connection page |
| 4 | Copy **Client ID** and **Client Secret** | Paste into Clerk Discord connection → **Use custom credentials** |
| 5 | **OAuth2 → General** | Confirm scopes include at least `identify` and `email` |
| 6 | — | Enable connection; test on production Clerk sign-in URL |

Clerk's Discord redirect URI format (copy from Clerk, do not guess):

```
https://<clerk-frontend-api>/v1/oauth_callback
```

### 2.3 OAuth scopes

| Scope | Purpose |
| --- | --- |
| `identify` | Discord user id + username (required) |
| `email` | Email address **if** the Discord user has a verified email and grants access |

Without `email` scope (or if the user withholds email), **email-based migration matching
will not work** for that user. Discord ID matching becomes mandatory.

### 2.4 Discord application settings checklist

- [ ] Redirect URI matches Clerk exactly (prod and dev use different Clerk URIs)
- [ ] Client Secret stored only in Clerk Dashboard (never in frontend env)
- [ ] Application is not in "public bot" confusion — this is an OAuth app for login, separate from the existing Discord **bot** used for member sync (`discord-auto-sync.*`)
- [ ] Document which Discord application is for **login** vs **bot sync** — they should be separate apps

### 2.5 Testing Discord login before site cutover

1. Open Clerk Account Portal sign-in URL (dev or prod).
2. Confirm **only Discord** appears as a sign-in option.
3. Sign in with a staff Discord account.
4. In Clerk Dashboard → **Users**, verify:
   - External account shows **Discord**
   - Note the **Discord user ID** (snowflake)
   - Note whether **email** was imported and marked verified

---

## 3. User migration strategy

### 3.1 Non-negotiable rules

1. **Never delete or re-insert `users` rows** during migration.
2. **Only patch `tokenIdentifier`** (and optionally refresh `name`/`email`) on the existing `_id`.
3. **Never change `role` or `username`** programmatically during migration.
4. **`users._id` is the foreign key** for ~6,500 linked records — it must stay stable.
5. **Do not run batch re-key on production** until staff mapping is verified on dev.

### 3.2 Current state (from `../convex-export/users/documents.jsonl`)

6 staff rows. All have `email`. None have `discordUserId`. Roles:

| `_id` (short) | Username | Role | Email present |
| --- | --- | --- | --- |
| `j57dp3…` | `plumbry` | admin | yes (~6,300 linked records) |
| `j57dd…` | `billy` | admin | yes |
| `j572q…` | `plumalt` | admin | yes |
| `j57ck…` | `plumbrytv` | event_mod | yes |
| `j5790…` | `cherko` | (none) | yes |
| `j57d2…` | (none) | (none) | yes |

Hercules `tokenIdentifier` format: `https://hercules.app|<subject>`  
Target Clerk format: `https://<CLERK_JWT_ISSUER_DOMAIN>|user_<clerkUserId>`

### 3.3 Recommended migration approach (three layers)

**Layer A — Pre-cutover mapping (manual, most reliable for Discord-only)**

Before opening Discord login to prod:

1. Export `users` table (`npx convex export`).
2. For each staff member, collect:

   | Convex `_id` | Username | Role | Expected Discord username | Discord user ID |
   | --- | --- | --- | --- | --- |
   | `j57dp3…` | plumbry | admin | (ask staff) | (from Clerk after test login) |

3. Each staff member signs in on **dev** with Discord once.
4. Record `{ convexUserId, clerkUserId, discordUserId, newTokenIdentifier }`.
5. Run **batch internal mutation** on dev to patch `tokenIdentifier` only.
6. Verify roles + linked records.
7. Repeat mapping for prod at cutover.

**Layer B — Login-time link (code already partially implemented on branch)**

`updateCurrentUser` on the `migration/hercules-removal` branch includes verified-email
fallback: if `by_token` misses but `identity.emailVerified === true` and exactly one email
match, patch `tokenIdentifier` on the existing row instead of inserting.

**Layer C — Discord ID link (recommended code addition, not yet implemented)**

Add optional `discordUserId` field to `users` schema:

```ts
discordUserId: v.optional(v.string())  // index: by_discord_user_id
```

Pre-populate from the mapping table (§3.3 Layer A). Extend `updateCurrentUser`:

```
if by_token miss:
  if identity discord_id matches users.discordUserId → patch tokenIdentifier
  else if verified email single match → patch tokenIdentifier
  else insert new row (should not happen for staff during cutover)
```

Layer C is the **correct primary strategy for Discord-only** because it does not depend on
Discord sharing email.

### 3.4 What gets preserved automatically

When re-link patches `tokenIdentifier` in place on the existing `_id`:

| Field / data | Preserved? |
| --- | --- |
| `users._id` | Yes |
| `role` (`admin`, `event_mod`, `viewer`) | Yes |
| `username` | Yes |
| `auditLogs.userId` and 14 other FK fields | Yes (they reference `_id`) |
| ~6,300 records owned by `plumbry` | Yes |

### 3.5 What must NOT happen

| Failure mode | Consequence |
| --- | --- |
| Insert new row instead of patch | Duplicate user; admin loses `role`; linked records orphaned |
| Match wrong email (two rows same email) | Wrong role assigned — not present today but guard anyway |
| Merge three Bryony accounts into one | Loses intentional separate admin/event_mod accounts |
| Map `billy` (outlook, admin) to Billy (gmail, no role) | Admin role lost on wrong row |

---

## 4. How existing Hercules users map to Discord identities

Hercules and Discord share **no common identifier** in the database today.

```
Hercules identity          Discord identity           Convex users row
─────────────────          ──────────────────         ─────────────────
issuer: hercules.app       Discord snowflake ID       _id (stable)
subject: random / usr_01K  Discord username (changes)  tokenIdentifier (must update)
email (from OIDC)          email (optional, from OAuth) email (stored, may differ)
                           Clerk user_…               role, username (must preserve)
```

### 4.1 Mapping methods (priority order for Discord-only)

| Priority | Method | How | Reliable? |
| --- | --- | --- | --- |
| **1** | **Manual Discord ID map** | Admin collects Discord snowflake per staff; store on `users.discordUserId`; match at login | **Highest** |
| **2** | **Manual pre-key batch** | Staff signs in on dev; admin records Clerk `user_` id; batch patch `tokenIdentifier` | **High** |
| **3** | **Verified email match** | Discord OAuth shares email; Clerk marks verified; `updateCurrentUser` fallback | **Medium** — Discord often withholds email |
| **4** | **Discord username match** | Match `players.discordUsername` or known handle to staff | **Low** — usernames change; not unique |

### 4.2 Per-user migration notes (from export)

| Staff account | Migration note |
| --- | --- |
| `plumbry` (admin) | Highest priority; verify first; ~6,300 linked records |
| `billy` (admin, outlook email) | Must sign in with Discord account tied to **outlook** email, or use manual Discord ID map — do not merge with gmail `Billy` row |
| `plumalt` (admin) | Separate intentional account (same human as plumbry); needs its **own** Discord sign-in or explicit mapping |
| `plumbrytv` (event_mod) | Same human, third account; separate Discord login or mapping |
| `cherko` | Has username, no role; lower risk but still needs correct re-link |
| Billy (gmail, no role) | Do not accidentally grant admin via wrong email match |

### 4.3 Hercules `select_account` history

Hercules defaulted to `prompt: select_account`, so staff may have previously signed in via
**Google or other providers** through Hercules — not Discord. Those emails may differ from
the email on their Discord account. **Do not assume** Hercules email = Discord email.

---

## 5. Whether email matching is still required

**Short answer: not strictly required, but keep it as a secondary fallback.**

| Question | Answer |
| --- | --- |
| Is email the primary key today? | No — `tokenIdentifier` is |
| Does Discord always provide email? | **No** — only if scope includes `email` AND user has verified email AND user grants it |
| Is email stored on all 6 users? | Yes — but it came from Hercules OIDC, not Discord |
| Is `email_verified` stored in Convex? | No — only available on JWT at login time |
| Should email matching be removed? | No — keep as fallback behind Discord ID matching |
| Is email matching sufficient alone for Discord-only? | **No** — implement Discord ID matching for reliability |

### 5.1 Recommended matching precedence (target `updateCurrentUser` logic)

```
1. by_token(tokenIdentifier)           → patch name/email; return existing _id
2. by discordUserId (when field exists) → patch tokenIdentifier; return existing _id
3. by verified email (exactly one)     → patch tokenIdentifier; return existing _id
4. insert new row (no role)            → ONLY for genuinely new staff; block in prod via Clerk Restricted mode
```

### 5.2 When email matching fails (common Discord-only cases)

- User hides email in Discord OAuth consent
- Discord account has no verified email
- Discord email ≠ Hercules email (different provider was used before)
- Multiple Convex rows could match (guard: require exactly one)

In all these cases, fall back to **manual Discord ID mapping** (§4.1 priority 1).

---

## 6. Risks of users changing Discord accounts

### 6.1 Discord user ID vs username

| Identifier | Stable? | Use for migration? |
| --- | --- | --- |
| Discord snowflake (`discordUserId`) | **Yes** — never changes for an account | **Primary** |
| Discord username (`plumbry`, `plumbry_`) | **No** — user can change | Display only |
| Discord email | **Can change** or be hidden | Fallback only |

Always map and store **Discord snowflake**, never username alone.

### 6.2 Risk scenarios

| Scenario | What happens | Impact | Mitigation |
| --- | --- | --- | --- |
| Staff creates **new Discord account** and signs in | New Clerk user → new `tokenIdentifier` → new Convex row with **no role** | Admin/mod access lost; duplicate row | Clerk Restricted mode; Discord ID allowlist; manual mapping |
| Staff **loses access** to old Discord account | Cannot sign in as same Clerk user | Locked out | Clerk Dashboard admin recovery; map new Discord ID to same `_id` with manual patch |
| Discord **disables** account | Same as above | Locked out | Pre-register backup admin; Clerk support |
| User changes Discord **email** | Email fallback may fail on next login | Re-link miss → duplicate row | Discord ID matching (primary) |
| Same person, **two Discord accounts** (matches 3 Bryony rows) | Could link wrong Discord to wrong `_id` | Wrong role | Manual per-row mapping; never auto-merge by name |
| Clerk **account linking** merges wrong accounts | Clerk links by email if verified | Privilege escalation or wrong row | Disable public sign-up; Restricted mode; verify Discord ID |
| Attacker creates Discord account with **victim's email** | If email fallback runs without Discord ID check | **Critical** — could inherit admin `role` | Prefer Discord ID map; Restricted sign-up; require Discord ID allowlist for prod |
| Staff deletes Clerk session / clears cookies | Re-login with same Discord | Works if mapping persisted | No action needed |

### 6.3 Operational policy (recommended)

Document for staff before cutover:

1. Use the **same Discord account** you register during migration week.
2. If you change Discord accounts, contact an admin **before** signing in to the hub.
3. Admins will update your `discordUserId` mapping — not your `role` or `_id`.

---

## 7. Required environment variables

### 7.1 Frontend (Vite — `.env` locally, Cloudflare build env)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `VITE_CONVEX_URL` | **Yes** | `https://….convex.cloud` | Dev deployment URL for local testing; prod URL for production |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Yes** | `pk_test_…` / `pk_live_…` | From Clerk → API keys |

**Remove after cutover (no longer read by code):**

- All `VITE_HERCULES_OIDC_*`
- `VITE_HERCULES_WEBSITE_ID`

### 7.2 Convex Dashboard (never in browser)

| Variable | Required | Example |
| --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | **Yes** | `https://verb-noun-00.clerk.accounts.dev` (dev) |

**Remove after cutover:**

- `HERCULES_OIDC_AUTHORITY`
- `HERCULES_OIDC_CLIENT_ID`

All other Convex vars (`DISCORD_BOT_TOKEN`, `YUNITE_API_KEY`, etc.) are **unchanged** —
they power the Discord bot and integrations, not staff login.

### 7.3 Discord Developer Portal (not env vars)

Client ID and Client Secret live in **Clerk Dashboard → Discord SSO connection**, not in
this repo's `.env`.

### 7.4 Variables explicitly NOT needed for Discord-only Clerk SPA

| Variable | Why not needed |
| --- | --- |
| `CLERK_SECRET_KEY` | No server-side Clerk SDK in this Vite SPA |
| `VITE_CLERK_SIGN_IN_URL` | Optional; Account Portal works without it |
| Discord bot token in frontend | Bot token stays Convex-only (`DISCORD_BOT_TOKEN`) |

---

## 8. Cloudflare Pages deployment requirements

### 8.1 Build settings

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Output directory | `dist` |
| Node version | 20 or 22 |
| Root directory | Repository root (`app/`) |

### 8.2 SPA routing (required)

Add `public/_redirects`:

```
/*  /index.html  200
```

Without this, deep links like `/admin/member-management` return 404 on refresh.

### 8.3 Cloudflare environment variables

**Production:**

| Variable | Value |
| --- | --- |
| `VITE_CONVEX_URL` | Production Convex deployment |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` from Clerk **production** instance |

**Preview (optional):**

| Variable | Value |
| --- | --- |
| `VITE_CONVEX_URL` | Dev Convex deployment |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_…` from Clerk **development** instance |

### 8.4 Clerk + Cloudflare domain setup (production)

1. Cloudflare Pages → Custom domains → e.g. `hub.example.com`
2. Clerk production → **Domains** → add same domain; complete DNS verification
3. Clerk production → Discord SSO → custom Discord OAuth credentials with Clerk redirect URI
4. Clerk **Restrictions** → Restricted sign-up + staff allowlist before public launch

### 8.5 Deploy order (Cloudflare-specific)

```
1. Convex dev tested with Discord login
2. npx convex export (backup)
3. User re-key verified on dev
4. npx convex deploy (prod auth config only — during cutover window)
5. Cloudflare production build with pk_live_ + prod VITE_CONVEX_URL
6. Smoke test Discord sign-in on production URL
7. Re-enable Discord bot + crons
```

### 8.6 What Cloudflare does not host

| Component | Host |
| --- | --- |
| Convex backend | Convex Cloud |
| Clerk sign-in UI | Clerk (`*.accounts.dev` or your Clerk domain) |
| Discord OAuth | Discord → redirects to Clerk |
| Discord member sync bot | Separate process (`discord-auto-sync.*`) |

---

## 9. Rollback procedure

### 9.1 When to rollback

- Any admin loses `role` after Discord login
- `users` row count increases unexpectedly
- `useConvexAuth().isAuthenticated` stays false after Discord sign-in (JWT config mismatch)
- Linked records show wrong attribution in spot-check

### 9.2 Rollback steps

| Step | Action | Scope |
| --- | --- | --- |
| 1 | Revert Cloudflare Pages to last **Hercules** frontend deployment | Prod frontend |
| 2 | Restore `convex/auth.config.js` to Hercules provider | Prod Convex |
| 3 | Restore Convex env: `HERCULES_OIDC_AUTHORITY`, `HERCULES_OIDC_CLIENT_ID` | Prod Convex |
| 4 | `npx convex deploy` (prod) | Prod Convex |
| 5 | If `users` rows were corrupted: import Phase-0 export (`npx convex import`) | Prod data |
| 6 | Verify Hercules login + admin access | Prod |
| 7 | Document failure; fix Discord mapping before retry | — |

**Rollback time:** 30–60 minutes with export on hand.  
**Do not rollback** by deleting Clerk users — simply stop routing traffic to Clerk frontend.

### 9.3 Rollback of Discord-only specifically

If Discord OAuth breaks but Clerk is fine:

- Temporarily enable email magic link in Clerk (emergency only) — **violates Discord-only policy**; use only as break-glass
- Better: fix Discord OAuth credentials in Clerk + Discord Developer Portal

### 9.4 Branch rollback (development)

On `migration/hercules-removal`, revert to pre-Clerk commits and restore
`@usehercules/auth` if local dev must continue on Hercules while Discord is fixed.

---

## 10. Exact implementation order

Each step lists **estimated time** and **risk**. Do not skip user verification gates.

### Phase 0 — Preparation (no production changes)

| # | Task | Time | Risk |
| --- | --- | --- | --- |
| 0.1 | `npx convex export` — backup `users` and full DB | 15 min | Low |
| 0.2 | Document all 6 users: `_id`, `role`, `username`, `email` | 15 min | Low |
| 0.3 | Collect expected Discord username + snowflake per staff member | 30 min | Low |
| 0.4 | Create Clerk **dev** instance | 15 min | Low |

### Phase 1 — Clerk Discord-only (dev instance)

| # | Task | Time | Risk |
| --- | --- | --- | --- |
| 1.1 | Activate Clerk **Convex** integration; note issuer URL | 10 min | Low |
| 1.2 | Enable **Discord** SSO; confirm no other SSO connections | 10 min | Low |
| 1.3 | Disable email/password/phone/magic-link in User & authentication | 15 min | Low |
| 1.4 | Set Restricted sign-up + allowlist (staff emails or pre-created users) | 15 min | Medium |
| 1.5 | Set Convex **dev** `CLERK_JWT_ISSUER_DOMAIN` | 5 min | Low |
| 1.6 | Update `convex/auth.config.js` (Clerk only); `npx convex dev` | 10 min | Low |

### Phase 2 — Code (branch: `migration/hercules-removal`)

| # | Task | Time | Risk |
| --- | --- | --- | --- |
| 2.1 | `@clerk/react`; replace Hercules providers with Clerk + `ConvexProviderWithClerk` | 2 hr | Medium |
| 2.2 | Add `AuthSync` (replaces `/auth/callback` sync) | 30 min | Low |
| 2.3 | Update sign-in/sign-out components | 1 hr | Low |
| 2.4 | Remove `/auth/callback` route | 10 min | Low |
| 2.5 | Keep verified-email fallback in `updateCurrentUser` | Done on branch | Medium |
| 2.6 | **Add `discordUserId` to `users` schema + Discord ID matching** | 2 hr | Medium |
| 2.7 | Pre-populate `discordUserId` from mapping table (manual admin mutation) | 1 hr | **High** |
| 2.8 | Update `.env.example`; local `.env` with dev Clerk keys | 15 min | Low |

**Gate:** `npm run build` passes; app loads locally with Clerk key present.

### Phase 3 — Dev verification (no prod data changes)

| # | Task | Time | Risk |
| --- | --- | --- | --- |
| 3.1 | Each staff member signs in with Discord on **dev** | 30 min | Medium |
| 3.2 | Verify `users` count still **6** — no duplicate rows | 10 min | **Critical** |
| 3.3 | Verify all 3 admins retain `role: "admin"` | 10 min | **Critical** |
| 3.4 | Verify `plumbry` `_id` unchanged; spot-check auditLogs FK | 15 min | **Critical** |
| 3.5 | Verify `useConvexAuth().isAuthenticated === true` after Discord login | 10 min | Medium |
| 3.6 | Verify admin UI (`/admin/member-management`) loads for admin Discord login | 15 min | Medium |

**Gate:** All Phase 3 checks pass before any production step.

### Phase 4 — Production Clerk + Discord (still no user data migration)

| # | Task | Time | Risk |
| --- | --- | --- | --- |
| 4.1 | Create Clerk **production** instance | 20 min | Low |
| 4.2 | Reconfigure Convex integration, Discord SSO, disable other methods, Restricted mode | 45 min | Medium |
| 4.3 | Create Discord Developer Portal OAuth app; custom credentials in Clerk prod | 1 hr | Medium |
| 4.4 | Clerk prod domain + DNS | 30 min | Low |

### Phase 5 — Production cutover (maintenance window)

| # | Task | Time | Risk |
| --- | --- | --- | --- |
| 5.1 | Announce maintenance; pause Discord bot + Convex crons | 10 min | Low |
| 5.2 | `npx convex export` (prod backup) | 15 min | Low |
| 5.3 | Pre-populate prod `users.discordUserId` from mapping table | 30 min | **High** |
| 5.4 | Batch pre-key `tokenIdentifier` OR first Discord login with ID/email match | 1 hr | **Critical** |
| 5.5 | Set Convex **prod** `CLERK_JWT_ISSUER_DOMAIN`; `npx convex deploy` | 15 min | Medium |
| 5.6 | Cloudflare prod deploy (`pk_live_`, prod `VITE_CONVEX_URL`, `_redirects`) | 30 min | Low |
| 5.7 | Each admin signs in with Discord; verify roles | 30 min | **Critical** |
| 5.8 | Re-enable crons + bot | 10 min | Low |

**Gate:** §10 final checklist (below) all pass.

### Phase 6 — Cleanup (after 48h stable)

| # | Task | Time | Risk |
| --- | --- | --- | --- |
| 6.1 | Remove Hercules packages (`@usehercules/auth`, vite plugin, eslint plugin) | 30 min | Low |
| 6.2 | Remove Hercules env vars from Convex + Cloudflare | 15 min | Low |
| 6.3 | Self-host favicon/OG images (replace `hercules-cdn.com`) | 30 min | Low |
| 6.4 | Remove email-only fallback if Discord ID matching proven (optional) | 30 min | Low |

---

## Final go/no-go checklist (Discord-only)

Before opening production Discord login to staff:

- [ ] Clerk shows **Discord only** — no password, email code, or other SSO buttons
- [ ] Clerk **Restricted** sign-up enabled; allowlist populated
- [ ] Discord prod OAuth app credentials in Clerk
- [ ] `users` row count = **6** on dev after all staff test logins
- [ ] All 3 admin `_id`s unchanged; all retain `role: "admin"`
- [ ] `plumbry` linked records spot-check passes
- [ ] Discord snowflake recorded for each staff account
- [ ] Prod Convex backup taken
- [ ] Cloudflare `_redirects` in place
- [ ] Rollback commit hash + export path documented

---

## Related documents

| Document | Purpose |
| --- | --- |
| `MIGRATION_AUDIT.md` | Hercules touch-point inventory |
| `AUTH_MIGRATION.md` | Auth option comparison (Clerk recommended) |
| `USER_MIGRATION_PLAN.md` | Re-link theory, edge cases, linked-record counts |
| `CLERK_MIGRATION_IMPLEMENTATION.md` | General Clerk implementation (multi-provider notes) |
| `ENVIRONMENT_SETUP.md` | Full env var catalog |
| `HOSTING_OPTIONS.md` | Cloudflare vs Vercel vs Netlify |
| `TEST_CHECKLIST.md` | Full feature regression list |

---

## Summary answers

| Requirement | How Discord-only plan addresses it |
| --- | --- |
| Clerk as auth provider | Clerk + Convex integration; `ConvexProviderWithClerk` |
| Discord login only | Single SSO connection; all other Clerk strategies disabled; Restricted sign-up |
| Preserve Convex user IDs | In-place `tokenIdentifier` patch; never delete/insert rows |
| Preserve roles, permissions, usernames, linked records | `_id` unchanged; `role`/`username` never modified during migration |
| Hercules → Discord mapping | Manual Discord snowflake map (primary) + verified email (fallback) |
| Email matching required? | **Recommended as fallback, not sufficient alone** for Discord-only |
| Discord account change risk | New account = new Clerk user = duplicate row / lost admin; mitigate with Restricted mode + Discord ID map |
