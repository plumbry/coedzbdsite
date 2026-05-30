# PHASE_1_IMPLEMENTATION_REPORT.md

> Phase 1 implementation complete on branch `migration/hercules-removal`.  
> **Production Convex and production data were not touched.**  
> **No user migration was performed.**  
> **Waiting for approval before Phase 2.**

---

## Summary

Phase 1 adds Discord-canonical identity support to the Convex `users` table, implements
fail-closed Clerk Discord login linking, provides dev-only staging tooling, and completes
the Clerk frontend provider stack (started in an earlier step on this branch).

Staff must pre-seed `discordUserId` on dev before first login. Unlinked Discord sign-ins
are rejected and do not create new `users` rows.

---

## 1. Every file changed

### Modified

| File | Change |
| --- | --- |
| `convex/schema.ts` | Added `discordUserId`, `discordUsername`, `by_discord_user_id` index on `users` |
| `convex/users.ts` | Discord-first `updateCurrentUser` (fail-closed); `setDiscordLink` admin mutation; removed email fallback and auto-insert |
| `convex/auth.config.js` | Clerk JWT issuer only (from earlier branch work) |
| `src/components/providers/auth.tsx` | `ClerkProvider` + Phase 1 dashboard setup comments |
| `src/components/providers/convex.tsx` | `ConvexProviderWithClerk` (earlier branch work) |
| `src/components/providers/default.tsx` | Added `<AuthSync />` (earlier branch work) |
| `src/hooks/use-auth.ts` | Clerk `useAuth` adapter (earlier branch work) |
| `src/components/auth-sync.tsx` | User sync + toast on link failure |
| `src/App.tsx` | Removed `/auth/callback` route (earlier branch work) |
| `src/vite-env.d.ts` | `VITE_CLERK_PUBLISHABLE_KEY` type (earlier branch work) |
| `package.json` | `@clerk/react`; `phase1:verify-env` and `phase1:seed` scripts |
| `package-lock.json` | Lockfile update for `@clerk/react` |

### Deleted

| File | Change |
| --- | --- |
| `src/pages/auth/Callback.tsx` | Hercules OIDC callback removed (Clerk handles redirects) |

### Added (Phase 1)

| File | Purpose |
| --- | --- |
| `convex/auth_discord.ts` | Discord snowflake validation + JWT `discord_id` extraction |
| `convex/migrationDevTools.ts` | Dev-only seed, pre-seed, link status, rollback mutations |
| `scripts/verify-phase1-env.mjs` | Validates local `.env` before dev |
| `scripts/phase1-dev-seed.mjs` | Runs dev seed + link status via `convex run` |
| `IMPLEMENTATION_PHASE_1.md` | Phase 1 plan (prior step) |
| `PHASE_1_IMPLEMENTATION_REPORT.md` | This report |

### Added (migration documentation — prior audit steps, included in commit)

| File |
| --- |
| `AUTH_MIGRATION.md` |
| `CLERK_MIGRATION_IMPLEMENTATION.md` |
| `DISCORD_MIGRATION_FEASIBILITY.md` |
| `DISCORD_ONLY_MIGRATION.md` |
| `ENVIRONMENT_SETUP.md` |
| `HOSTING_OPTIONS.md` |
| `MIGRATION_AUDIT.md` |
| `TEST_CHECKLIST.md` |
| `USER_MIGRATION_PLAN.md` |

### Not committed (gitignored)

| File | Notes |
| --- | --- |
| `.env.example` | Ignored by `.gitignore` (` .env*`). Content updated locally — copy manually from repo or recreate from §3 below. |
| `.env` | Local secrets — never commit |

---

## 2. Packages added or removed

| Package | Change | Version |
| --- | --- | --- |
| `@clerk/react` | **Added** | `^6.7.2` |
| `@usehercules/auth` | **Removed** (earlier branch step) | was `^1.0.45` |

**Unchanged (still present — production/Hercules tooling not removed per Phase 1 scope):**

| Package | Role |
| --- | --- |
| `@usehercules/vite` | Dev dependency — Hercules Vite plugin |
| `@usehercules/eslint-plugin` | Dev dependency — ESLint |

---

## 3. Exact local testing instructions

### Prerequisites

- Node.js LTS
- Access to a **Convex dev deployment** (not production)
- Clerk **Development** instance configured (§5 below)

### Step 1 — Environment

Create `.env` in `app/` (file is gitignored):

```env
VITE_CONVEX_URL="https://<your-dev-deployment>.convex.cloud"
VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

Verify:

```bash
npm run phase1:verify-env
```

### Step 2 — Convex dev env vars

On your **dev** deployment only:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<app>-<id>.clerk.accounts.dev"
npx convex env set MIGRATION_DEV_TOOLS_ENABLED true
```

**Do not** run these against production.

### Step 3 — Clerk JWT template

In Clerk Dashboard → JWT templates → **`convex`** → add claim:

```json
"discord_id": "{{user.external_accounts.discord.provider_user_id}}"
```

Save the template.

### Step 4 — Start dev servers

```bash
npm install
npx convex dev          # terminal 1 — pushes schema + functions to dev
npm run dev             # terminal 2 — http://localhost:5173
```

### Step 5 — Seed dev staff rows

With `npx convex dev` connected to dev:

```bash
npm run phase1:seed
```

This idempotently inserts the six staff user rows (Hercules `tokenIdentifier` values from export).

### Step 6 — Fail-closed smoke test

1. Open `http://localhost:5173`.
2. Click **Staff Sign In** → Discord login with an **unlinked** account.
3. Expected: Clerk auth succeeds; toast **"Account not linked"**; no new row in Convex `users`.

### Step 7 — Pre-seed Discord id (dev)

Bootstrap via Convex dashboard or dev mutation:

```bash
npx convex run migrationDevTools:devSetDiscordLink "{\"userId\":\"<users._id>\",\"discordUserId\":\"<snowflake>\",\"discordUsername\":\"optional\"}"
```

Repeat for each staff row before that person's first login.

### Step 8 — First login link test

1. Sign out.
2. Sign in with Discord matching the pre-seeded snowflake.
3. In Convex Dashboard → `users`, verify:
   - `_id` unchanged
   - `tokenIdentifier` now uses Clerk issuer (`…clerk.accounts.dev|user_…`)
   - `role` and `username` unchanged
4. Confirm admin/moderator UI for that role.

### Step 9 — Check link status

```bash
npx convex run migrationDevTools:getMigrationLinkStatus
```

### Step 10 — Rollback a botched dev link (optional)

```bash
npx convex run migrationDevTools:devResetUserLink "{\"userId\":\"...\",\"herculesTokenIdentifier\":\"https://hercules.app|...\",\"clearDiscordLink\":true}"
```

---

## 4. Exact steps to create a Clerk development instance

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) and sign in.
2. Click **Create application** → name it (e.g. `Co-Ed ZBD Hub — Dev`).
3. Stay on the **Development** instance (do **not** create Production in Phase 1).
4. **Integrations → Convex → Activate**
   - Creates JWT template named **`convex`**
   - Copy the **Frontend API URL** → set as `CLERK_JWT_ISSUER_DOMAIN` on Convex dev
5. **API keys** → copy **Publishable key** (`pk_test_…`) → `VITE_CLERK_PUBLISHABLE_KEY` in `.env`
6. **Configure → SSO connections → Add connection → For all users → Discord**
   - Enable **Enable for sign-up and sign-in**
   - Dev: leave **Use custom credentials** off
7. **Configure → User & authentication** — disable:
   - Email sign-in, Password, Email verification code, Phone, Username, Passkeys
   - All SSO except Discord
8. **Configure → Restrictions → Sign-up mode → Restricted**
9. **JWT templates → `convex`** → add claim:
   ```json
   "discord_id": "{{user.external_accounts.discord.provider_user_id}}"
   ```
10. Test at `https://<your-app>.accounts.dev/sign-in` — only Discord should appear.
11. After a test login: **Users → [user] → External accounts** — confirm Discord + snowflake.

---

## 5. Implementation details

### Schema

```ts
users: {
  // existing fields…
  discordUserId?: string;
  discordUsername?: string;
}
.index("by_discord_user_id", ["discordUserId"])
```

### `updateCurrentUser` flow

1. Match by `tokenIdentifier` → patch profile, return.
2. Extract `discord_id` from JWT → if missing, **FORBIDDEN**.
3. Match by `discordUserId` index → 0 matches **FORBIDDEN**; >1 **INTERNAL** error.
4. Patch `tokenIdentifier` in place on matched row.
5. **Never insert** a new row (Phase 1 fail-closed).

### Dev tools guard

All `migrationDevTools` mutations/queries require:

```
MIGRATION_DEV_TOOLS_ENABLED=true
```

on the Convex deployment. Never enable on production.

### Production safety

| Action | Phase 1 status |
| --- | --- |
| `npx convex deploy` (prod) | **Not run** |
| Production data pre-seed | **Not done** |
| User migration / re-key on prod | **Not done** |
| Hercules removed from prod hosting | **Not done** — prod still on Hercules until Phase 2 |
| `@usehercules/vite` removed | **Not done** — retained intentionally |

---

## 6. Known limitations / follow-ups for Phase 2

- `.env.example` is gitignored; consider adding `env.example` (without leading dot) in Phase 2.
- `setDiscordLink` requires an authenticated admin — bootstrap first admin via `devSetDiscordLink` or Convex Dashboard on dev.
- Email-based fallback removed from `updateCurrentUser`; Discord snowflake is required.
- Pre-existing TypeScript errors in `holistic-score-stats.tsx` and `yunite-debug.tsx` may still fail `npm run build`; `npm run dev` is sufficient for auth testing.
- Clerk Discord-only UI is enforced in Dashboard, not in application code.
- **Discord ID in JWT:** use `public_metadata.discord_id` + template claim `{{user.public_metadata.discord_id}}` — see `IMPLEMENTATION_NOTES.md`. The `external_accounts.discord` shortcode did not work in dev.

### Post-Phase-1 dev verification (May 2026)

- **plumbry** linked successfully on dev (`dev/bryony-lee`).
- Other five staff accounts deferred until production setup.
- Troubleshooting fixes committed after initial Phase 1 commit.

---

## 7. Approval gate

**Phase 1 dev path proven. Phase 2 (production infra) can proceed when ready:**

- [x] Clerk dev instance created and configured
- [x] Local fail-closed test passes
- [x] **plumbry** linked on dev (other staff deferred)
- [ ] Clerk Restricted mode re-enabled after dev testing
- [ ] Explicit approval to begin production Clerk + Convex deploy
