# IMPLEMENTATION_PHASE_1.md

> **Implementation plan — Phase 1 only.**  
> Discord-only authentication via Clerk. Manual user linking. Discord User ID is the
> canonical identity key. Existing `users._id`, roles, and linked records must never change.

**Phase 1 scope**

| In scope | Out of scope (later phases) |
| --- | --- |
| Schema design + dev deployment schema push | Production Convex deploy |
| Clerk **Development** instance (Discord-only) | Production Clerk instance |
| Local dev environment | Production cutover / dual-provider window |
| Staging verification on **dev** Convex deployment | Batch re-key on production data |
| Manual linking process (dev data only) | Removing Hercules from production |
| Code changes on `migration/hercules-removal` branch | Cloudflare Pages production deploy |

**Assumptions (fixed for this phase)**

- All six existing staff accounts will be **manually linked** — no automatic discovery.
- **`discordUserId`** (Discord snowflake) is the canonical re-link key.
- **`users._id`** never changes; only `tokenIdentifier` (and profile fields) are patched.
- **`role`** and **`username`** are never modified by migration code.
- Linked records (15 FK fields across 13 tables) stay attached because `_id` is preserved.

---

## Phase 1 deliverables

At the end of Phase 1 you should have:

1. `users.discordUserId` live on the **dev** Convex deployment.
2. `updateCurrentUser` matching by Discord ID (fail-closed when unlinked).
3. Clerk dev instance configured for **Discord-only** sign-in.
4. Local app running against dev Convex + Clerk dev.
5. All six staff rows pre-seeded with Discord snowflakes on **dev** (copied or recreated).
6. Each staff member verified on dev: correct `_id`, `role`, admin gates, sample FK queries.
7. Signed-off mapping table ready for a future production phase.

---

## 1. Schema changes

### 1.1 `users` table additions

Add two optional fields and one index to `convex/schema.ts`:

```ts
users: defineTable({
  tokenIdentifier: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  username: v.optional(v.string()),
  role: v.optional(v.union(
    v.literal("admin"),
    v.literal("event_mod"),
    v.literal("viewer"),
  )),
  // Phase 1 — Discord canonical identity (pre-seeded before first login)
  discordUserId: v.optional(v.string()),   // snowflake, e.g. "684933831874183168"
  discordUsername: v.optional(v.string()), // display only; not used for matching
})
  .index("by_token", ["tokenIdentifier"])
  .index("by_username", ["username"])
  .index("by_discord_user_id", ["discordUserId"]),
```

| Field | Required? | Purpose |
| --- | --- | --- |
| `discordUserId` | Optional in schema; **required on every staff row before linking test** | Deterministic lookup when Clerk JWT arrives |
| `discordUsername` | Optional | Audit/display; may drift if Discord handle changes |

**Why optional in schema:** Existing rows and any accidental unlinked login must not fail schema validation. Application logic enforces “must be pre-seeded for staff” during Phase 1 testing.

**Uniqueness:** Convex has no native unique constraint. Enforce in code:

- Pre-seed script / admin mutation rejects duplicate `discordUserId`.
- `updateCurrentUser` treats more than one row with the same `discordUserId` as an error.

### 1.2 No changes to linked tables

Do **not** add Discord fields to the 13 tables that FK to `users._id`. They continue to reference `users._id` only. Migration safety comes from preserving `_id`, not from propagating Discord IDs.

### 1.3 `updateCurrentUser` behavior (to implement in Phase 1)

Replace the current email-only fallback with Discord-first matching:

```
1. identity present?  → else UNAUTHENTICATED
2. row where tokenIdentifier = identity.tokenIdentifier?
     → yes: patch name/email (and discordUsername if available); return _id
3. discordId = extract from JWT (see §2.6)
     → missing: FAIL CLOSED (do not insert) during Phase 1
4. rows where discordUserId = discordId
     → 0 rows: FAIL CLOSED — "Account not linked. Contact an admin."
     → >1 rows: FAIL CLOSED — duplicate discordUserId data bug
     → 1 row: patch tokenIdentifier + name/email/discordUsername; return _id
5. (Phase 2+ only) optional verified-email fallback — disabled or logged-only in Phase 1
6. Do NOT insert a new users row while migration window is active
```

**Fail-closed is mandatory for Phase 1.** An unlinked Discord login must not create a row with no `role`, which would orphan thousands of FK references if someone later linked the wrong account.

### 1.4 Helper to extract Discord ID from Clerk identity

Clerk exposes Discord via external accounts. Implementation options (verify one on first dev login):

| Source | Access | Notes |
| --- | --- | --- |
| JWT custom claim | Add `discord_id` to `convex` template (§2.6) | Preferred — available in `identity` on server |
| Clerk Backend API | Server action with secret key | Not needed for Phase 1 SPA |
| `identity.tokenIdentifier` | — | Subject is `user_…`, **not** Discord snowflake |

Add a small helper in `convex/users.ts` or `convex/auth_helpers.ts`:

```ts
function getDiscordUserIdFromIdentity(identity: UserIdentity): string | null
```

Unit-test the helper against a saved JWT payload from a dev Discord login.

### 1.5 Admin-only pre-seed mutation (to implement)

For dev/staging seeding without the Convex dashboard:

```ts
// convex/users.ts — admin only
setDiscordLink({
  userId: v.id("users"),
  discordUserId: v.string(),
  discordUsername: v.optional(v.string()),
})
```

- Requires `requireAdmin(ctx)`.
- Validates snowflake format (numeric string, 17–20 digits).
- Rejects if `discordUserId` already assigned to another row.
- Does **not** change `tokenIdentifier`, `role`, or `username`.
- Writes an audit log entry (`logAudit`) with actor + target.

### 1.6 Schema deploy (dev only)

```bash
# From app/ — pushes schema to the dev deployment configured in .env.local / convex.json
npx convex dev
```

**Do not run `npx convex deploy`** (production) in Phase 1.

After schema push, confirm in Convex Dashboard → **Data** → `users` that new columns appear. Existing dev rows show `discordUserId: undefined` until pre-seeded.

---

## 2. Clerk Discord-only setup

Phase 1 uses the **Clerk Development instance only**. Production Clerk and Discord OAuth app setup are documented here for reference but **must not be executed** until a later phase.

### 2.1 Create Clerk application (dev)

| Step | Location | Action |
| --- | --- | --- |
| 1 | [dashboard.clerk.com](https://dashboard.clerk.com) | Create application (e.g. "Co-Ed ZBD Hub — Dev") |
| 2 | Stay on **Development** instance | Do not create Production instance in Phase 1 |
| 3 | **Integrations → Convex → Activate** | Creates JWT template **`convex`**; copy **Frontend API URL** |
| 4 | **API keys** | Copy **Publishable key** (`pk_test_…`) |

Record these values:

| Variable | Where set | Example |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | `.env` (local) | `pk_test_…` |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex Dashboard → dev deployment env | `https://<app>-<id>.clerk.accounts.dev` |

### 2.2 Enable Discord as the only SSO connection

| Step | Location | Setting |
| --- | --- | --- |
| 1 | **Configure → SSO connections → Add connection** | **For all users → Discord** |
| 2 | Same | **Enable for sign-up and sign-in** = On |
| 3 | Dev | **Use custom credentials** = Off (Clerk shared OAuth) |
| 4 | Confirm | Discord is the **only** enabled SSO connection |

### 2.3 Disable all non-Discord login methods

Under **Configure → User & authentication**, disable every strategy except Discord SSO:

| Strategy | Phase 1 target |
| --- | --- |
| Email address (sign-in) | **Off** |
| Password | **Off** |
| Email verification code / magic link | **Off** |
| Phone number | **Off** |
| Username as Clerk identifier | **Off** |
| Passkeys | **Off** |
| Google, GitHub, Apple, etc. | **None enabled** |
| Enterprise SSO (SAML) | **Off** |

Sign-in UI should show **only** “Continue with Discord”.

### 2.4 Restrict sign-up to staff (dev)

| Setting | Location | Phase 1 value |
| --- | --- | --- |
| Sign-up mode | **Configure → Restrictions** | **Restricted** |
| Allowlist | Same | Add staff once Discord emails are known, **or** pre-create users (§2.5) |

Restricted mode prevents random Discord users from creating Clerk accounts during testing.

### 2.5 Pre-create Clerk users (recommended for dev)

For each staff member, before linking tests:

1. **Users → Create user** (or **Invitations**).
2. Have them complete **one** Discord connection on the Clerk Account Portal.
3. In Clerk **Users → [user] → External accounts**, confirm **Discord** is linked.
4. Record Clerk `user_…` id and Discord snowflake in the mapping table (§5.1).

This separates “Clerk account exists” from “Convex row is linked” and makes debugging easier.

### 2.6 JWT template — Discord ID claim

Clerk Dashboard → **JWT templates** → **`convex`** → add custom claim:

```json
"discord_id": "{{user.external_accounts.discord.provider_user_id}}"
```

After a test Discord login, decode the JWT at [jwt.io](https://jwt.io) and confirm:

| Claim | Expected |
| --- | --- |
| `aud` | `convex` |
| `iss` | Matches `CLERK_JWT_ISSUER_DOMAIN` |
| `sub` | `user_…` (Clerk id — becomes `tokenIdentifier` subject) |
| `discord_id` | Numeric snowflake matching pre-seeded value |

If the template shortcode path differs, use Clerk’s JWT template editor “Insert claim” picker after Discord is connected on a test user.

### 2.7 Convex auth config (already on branch)

`convex/auth.config.js` should contain only Clerk for Phase 1 dev:

```js
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

Set `CLERK_JWT_ISSUER_DOMAIN` on the **dev** Convex deployment only.

**Do not** add Hercules back unless testing rollback locally against prod snapshot exports.

### 2.8 Discord Developer Portal (dev — optional)

Clerk dev can use **shared Discord credentials** — no Discord Developer Portal app is required for Phase 1 local testing.

Skip §2.9 until Phase 2 (production).

<details>
<summary>§2.9 Production Discord OAuth (Phase 2 — do not execute in Phase 1)</summary>

1. Create a **separate** Discord application from the existing member-sync bot.
2. OAuth2 redirect URI = Clerk production SSO redirect (from Clerk Dashboard).
3. Scopes: `identify`, `email`.
4. Paste Client ID + Secret into Clerk **Production** Discord connection with **Use custom credentials** on.

</details>

### 2.9 Clerk setup verification checklist

- [ ] Development instance only — no production instance configured yet
- [ ] Convex integration active; `convex` JWT template exists
- [ ] Discord is the only SSO connection
- [ ] Email, password, and magic link disabled
- [ ] Restricted sign-up enabled
- [ ] Test sign-in at `https://<app>.accounts.dev/sign-in` shows Discord only
- [ ] After test login, Clerk user shows Discord external account + snowflake
- [ ] JWT contains `discord_id` claim matching snowflake

---

## 3. Local development setup

### 3.1 Prerequisites

| Tool | Version / notes |
| --- | --- |
| Node.js | LTS (matches CI) |
| npm | From repo (`package-lock.json`) |
| Convex CLI | `npm install` includes `convex` |
| Clerk account | Dev instance from §2 |
| Git branch | `migration/hercules-removal` |

### 3.2 Environment files

Copy and fill `.env` from `.env.example`:

```bash
cp .env.example .env
```

**Required for Phase 1 local dev:**

```env
# Convex dev deployment URL (from `npx convex dev` or Convex Dashboard)
VITE_CONVEX_URL="https://<your-dev-deployment>.convex.cloud"

# Clerk dev publishable key
VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

**Required on Convex dev deployment** (Dashboard → Settings → Environment Variables):

```env
CLERK_JWT_ISSUER_DOMAIN="https://<app>-<id>.clerk.accounts.dev"
```

Do not set production Convex URL or `pk_live_…` in local `.env` during Phase 1.

### 3.3 Install and run

```bash
npm install
npx convex dev          # terminal 1 — syncs schema + functions to dev deployment
npm run dev             # terminal 2 — Vite on http://localhost:5173
```

Expected provider stack (already on branch):

```
ClerkProvider
  └─ ConvexProviderWithClerk
       └─ AuthSync → api.users.updateCurrentUser
            └─ App
```

### 3.4 First local login smoke test (before user linking)

1. Open `http://localhost:5173`.
2. Click **Staff Sign In** → redirects to Clerk Account Portal.
3. Sign in with Discord (use a **non-staff** or **dedicated test** Discord account first).
4. Expected with fail-closed logic: login succeeds at Clerk/Convex JWT level but
   `updateCurrentUser` **errors** — no new `users` row created.
5. Confirm in Convex Dashboard → Data → `users` that row count did not increase.

This validates fail-closed before pre-seeding staff rows.

### 3.5 Dev user data strategy

Phase 1 must **not read or write production Convex data**. Choose one:

| Option | Description | Recommended |
| --- | --- | --- |
| **A — Empty dev deployment** | Fresh dev `users` table; manually insert 6 rows mirroring export | Simplest |
| **B — Dev snapshot import** | Import `../convex-export/` into dev via Convex import tooling | Better FK testing |

For Option A, create six `users` documents on dev with the same `_id`, `role`, `username`, and `email` as `../convex-export/users/documents.jsonl`. IDs can match export values **on dev only** — this is not production.

**Critical:** If using Option B or copying IDs, work only on the **dev** deployment whose URL is in local `.env`. Double-check the deployment name in the Convex Dashboard before any patch.

### 3.6 Local troubleshooting

| Symptom | Check |
| --- | --- |
| Convex `Not authenticated` | `CLERK_JWT_ISSUER_DOMAIN` matches Clerk Frontend API URL exactly |
| Clerk sign-in loop | Allowed redirect URLs in Clerk → **Paths**; `signInFallbackRedirectUrl="/"` on `ClerkProvider` |
| `updateCurrentUser` fails after login | Expected if `discordUserId` not pre-seeded — proceed to §5 |
| JWT missing `discord_id` | Discord not connected on Clerk user, or template claim not saved |
| Build errors in unrelated files | Pre-existing TS issues in `holistic-score-stats.tsx`, `yunite-debug.tsx` — ignore for auth testing unless they block `npm run dev` |

---

## 4. Staging test plan

“Staging” in Phase 1 means the **Clerk dev instance + Convex dev deployment** — not production. All tests use manually linked dev data.

### 4.1 Test environments

| Layer | Phase 1 staging target |
| --- | --- |
| Frontend | `http://localhost:5173` (local Vite) |
| Auth | Clerk Development + Discord SSO |
| Backend | Convex **dev** deployment |
| Data | Dev copy of 6 user rows + pre-seeded `discordUserId` |
| Production | **Not touched** |

Optional: deploy a preview build to Cloudflare Pages with **dev** env vars for remote testing. Still not production Convex.

### 4.2 Pre-test gates

Complete before per-user login tests:

- [ ] Schema §1 deployed to dev (`discordUserId`, index, `updateCurrentUser` logic)
- [ ] Clerk §2 checklist complete
- [ ] Six dev `users` rows exist with correct `_id`, `role`, `username`
- [ ] All six rows pre-seeded with verified Discord snowflakes (§5)
- [ ] Mapping table signed off by account owner
- [ ] Fail-closed test passed (§3.4)

### 4.3 Per-user login test script

Run **in order of blast radius** (highest FK count first):

| Order | App username | Dev `_id` (from export) | Role | Must verify |
| --- | --- | --- | --- | --- |
| 1 | `plumbry` | `j57dp3wpjnj4934nhmwp9vbgd17txa9v` | admin | Largest FK surface |
| 2 | `billy` | `j57ddmmhgn2986a65w302g6kt97txv5f` | admin | Admin gates |
| 3 | `plumalt` | `j572qmb56fnmssrayk6kr7pw2s7tx9ab` | admin | Distinct from `plumbry` snowflake |
| 4 | `plumbrytv` | `j57cktrgyxqs9z84p7mncs255n7v0rvy` | event_mod | `hasEventBanAccess`, not full admin |
| 5 | *(Billy alt)* | `j57d2mcjv27g8xxa9jpe205dv586yfab` | none | No duplicate admin row |
| 6 | `cherko` | `j57906kgec6nzymjy3a81ek0wn87evn8` | none | Username setup if needed |

**For each user:**

1. Sign out completely (Clerk + clear site data if needed).
2. Sign in with the **correct** Discord account for that row.
3. In Convex Dashboard → `users`, find row by `_id`:
   - [ ] `_id` unchanged
   - [ ] `tokenIdentifier` now starts with Clerk issuer (`https://…clerk.accounts.dev|user_…`)
   - [ ] `role` unchanged
   - [ ] `username` unchanged
   - [ ] `discordUserId` unchanged (still the pre-seeded snowflake)
4. In the app:
   - [ ] `useUserRole()` flags match expected role
   - [ ] Admin sidebar visible/hidden correctly
   - [ ] `/admin/member-management` accessible only for admin rows
5. FK spot-check (dev data):
   - [ ] Query `auditLogs` filtered by `userId` = this `_id` returns expected history
   - [ ] For `plumbry`: query `players` where `createdBy` = this `_id` — count > 0

### 4.4 Negative tests

| Test | Steps | Expected |
| --- | --- | --- |
| Unlinked Discord account | Sign in with Discord not in mapping table | Error from `updateCurrentUser`; **no** new `users` row |
| Wrong Discord for pre-seeded row | Sign in with Discord A when row seeded for Discord B | Fail-closed or no match; no `tokenIdentifier` patch |
| Duplicate snowflake seed | Attempt to seed same `discordUserId` on two rows | Admin mutation rejects |
| Second login same user | Sign in again after successful link | Idempotent patch; `_id` and `role` stable |

### 4.5 Regression smoke tests (auth-adjacent)

After all six users pass §4.3:

- [ ] Sign out / sign in again (session persistence)
- [ ] Hard refresh on `/admin/events-manager` while signed in as admin
- [ ] Viewer-only route behavior for no-role account
- [ ] Username setup dialog does **not** appear for users with existing `username`
- [ ] `AuthSync` calls `updateCurrentUser` once per session (no duplicate patches)

See `TEST_CHECKLIST.md` for full app regression — run admin-critical sections only in Phase 1.

### 4.6 Staging exit criteria (Phase 1 complete)

- [ ] All six staff accounts linked on **dev** with verified `_id` + `role`
- [ ] Fail-closed and negative tests pass
- [ ] Mapping table complete and signed off
- [ ] No accidental new `users` rows during testing
- [ ] Clerk dev configured Discord-only with Restricted sign-up
- [ ] Documentation updated: mapping table stored securely (not in git if it contains PII)
- [ ] **Production Convex and production Clerk untouched**

---

## 5. Manual user linking process

Automatic matching is not used. Every link is explicit: **Discord snowflake → existing `users._id`**.

### 5.1 Mapping table (maintain outside git)

Create a spreadsheet or secure doc with one row per staff account:

| Person | App username | Convex `users._id` | Role | Email (legacy) | Discord username | Discord snowflake | Clerk `user_…` (after first login) | Pre-seeded? | Link verified? | Verified by | Date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bryony (main) | plumbry | `j57dp3…` | admin | bryonyleenewnham@gmail.com | | | | | | | |
| … | | | | | | | | | | | |

**Research hints only** (from `DISCORD_MIGRATION_FEASIBILITY.md` — must be confirmed by account owner):

| Username | Suggested snowflake to verify | Confidence |
| --- | --- | --- |
| `plumbry` | `684933831874183168` | High — confirm with Bryony |
| `cherko` | `1101530624998781039` (`cherkoyt`) | High — confirm with Cherko |
| `plumalt`, `plumbrytv`, both Billy rows | *No suggestion — collect from owner* | — |

### 5.2 Collect Discord snowflakes from staff

Each staff member:

1. Opens Discord → **User Settings → Advanced → Developer Mode** → On.
2. Right-clicks their own avatar → **Copy User ID**.
3. Sends snowflake to migration admin via agreed secure channel.
4. Confirms which **app username** (`plumbry`, `plumalt`, etc.) they are linking — not just which person.

Admin verifies snowflake is numeric (17–20 digits) and records Discord username at time of collection.

### 5.3 Pre-seed on dev (before first login)

**Option A — Convex Dashboard (manual patch)**

1. Convex Dashboard → dev deployment → **Data** → `users`.
2. Select row by `_id`.
3. Set `discordUserId` and optionally `discordUsername`.
4. Save. **Do not** edit `tokenIdentifier`, `role`, or `username`.

**Option B — Admin mutation (preferred)**

1. Sign in locally as an already-linked admin (link one admin first using Option A for bootstrap, or patch one admin row via Dashboard).
2. Call `setDiscordLink` for each remaining user with `{ userId, discordUserId, discordUsername }`.
3. Confirm audit log entry created.

**Pre-seed order:** Start with one admin (`plumbry` recommended) for bootstrap, then remaining five.

### 5.4 First login (link execution)

After pre-seed:

1. Staff member signs in with Discord on local or preview app.
2. Clerk session established → Convex receives JWT with `sub` = `user_…` and `discord_id` = snowflake.
3. `AuthSync` → `updateCurrentUser`:
   - Finds row by `discordUserId`
   - Patches `tokenIdentifier` to `<clerk-issuer>|user_…`
   - Updates `name` / `email` from JWT if present
4. Staff confirms in app: correct username in header, correct admin/moderator access.

Record Clerk `user_…` in mapping table **after** first successful login.

### 5.5 Verification checklist (per user)

- [ ] Convex `_id` equals pre-migration value
- [ ] `role` matches mapping table
- [ ] `username` matches mapping table
- [ ] `tokenIdentifier` issuer is Clerk (not `https://hercules.app`)
- [ ] `discordUserId` matches snowflake from staff
- [ ] No second `users` row created for same person
- [ ] Account owner confirms access feels correct (admin pages, etc.)

### 5.6 Multi-account staff (Bryony)

Three separate Convex rows — three separate Discord snowflakes required:

| Row | Purpose | Common mistake |
| --- | --- | --- |
| `plumbry` | Primary admin | Using same Discord for all three |
| `plumalt` | Alt admin | Merging into `plumbry` |
| `plumbrytv` | Event mod | Linking to wrong Discord |

Each row gets its own pre-seed and its own first-login test.

### 5.7 Rollback (dev only)

If a user is linked incorrectly on **dev**:

1. Restore `tokenIdentifier` to the Hercules value from export (or clear it for re-test).
2. Clear or correct `discordUserId` if wrong.
3. Delete any accidentally created duplicate `users` row (dev only).
4. Re-run pre-seed + first login.

Keep a JSON backup of dev `users` table before each link test.

### 5.8 What not to do

| Action | Risk |
| --- | --- |
| Seed `discordUserId` on production | Violates Phase 1 scope |
| Let staff log in before pre-seed | Duplicate row or orphan FKs |
| Use `players.discordUsername` as proof without owner confirmation | Wrong admin inherits 6,300+ records |
| Change `role` during linking | Permission corruption |
| Merge duplicate staff rows | Irreversible FK confusion |

---

## Phase 1 → Phase 2 handoff

When §4.6 exit criteria are met, Phase 2 can plan:

- Production Clerk instance + custom Discord OAuth app
- Production Convex deploy with same schema
- Pre-seed production `users` rows (maintenance window)
- Optional dual-provider `auth.config.js` during cutover
- Cloudflare Pages production env vars
- Production per-user login in controlled order

Phase 1 produces the **proven mapping table**, **tested code path**, and **signed-off dev verification** required before any production touch.

---

## Related documents

| Document | Relationship |
| --- | --- |
| `DISCORD_MIGRATION_FEASIBILITY.md` | Why manual linking is mandatory |
| `DISCORD_ONLY_MIGRATION.md` | Full Discord-only migration (includes prod) |
| `USER_MIGRATION_PLAN.md` | FK inventory and `tokenIdentifier` rules |
| `CLERK_MIGRATION_IMPLEMENTATION.md` | Full Clerk migration steps 1–14 |
| `TEST_CHECKLIST.md` | Broader post-migration app tests |
| `.env.example` | Environment variable reference |
