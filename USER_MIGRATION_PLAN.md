# USER_MIGRATION_PLAN.md

> Audit/plan only. **No code was modified.** This plan is grounded in the live data
> found in the Convex snapshot at `../convex-export/` (sibling of this `app/` repo)
> and in the auth code in `convex/` and `src/`.

---

## 1. Exactly how users are identified today

The identity pipeline has four stages:

1. **Token issuance (Hercules OIDC).** The browser obtains an OIDC `id_token` from the
   Hercules authority and sends it to Convex on every request
   (`src/components/providers/convex.tsx` → `ConvexProviderWithHerculesAuth`).
2. **Token validation (Convex).** `convex/auth.config.js` registers the provider
   (`domain` + `applicationID`). Convex validates the JWT and exposes the identity via
   `ctx.auth.getUserIdentity()`.
3. **Row lookup by token.** Every server helper resolves the user with the
   **`tokenIdentifier`** field and the **`by_token`** index — never by `_id`, email, or
   username. From `convex/auth_helpers.ts`:
   ```ts
   const identity = await ctx.auth.getUserIdentity();          // null if unauthenticated
   const user = await ctx.db.query("users")
     .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
     .unique();
   ```
   The same pattern appears in `convex/users.ts` (`getCurrentUser`, `updateCurrentUser`,
   `setUsername`, `becomeAdmin`, …).
4. **First-login provisioning (upsert).** `api.users.updateCurrentUser` is called from
   the OAuth callback (`src/pages/auth/Callback.tsx`). If **no row matches the
   `tokenIdentifier`, it inserts a brand-new row**:
   ```ts
   // convex/users.ts (updateCurrentUser)
   if (existingUser) { await ctx.db.patch(existingUser._id, { name, email }); ... }
   else { await ctx.db.insert("users", { tokenIdentifier, name, email }); }  // <-- new row, NO role
   ```

**Identity key = `tokenIdentifier`.** Authorization (`role`) and profile (`username`)
live on that same row. The frontend reads them through `useUserRole`
(`src/hooks/use-user-role.ts`), which only depends on Convex.

### How other data links to a user

All foreign keys to users use the **Convex document `_id`** (`v.id("users")`), *not*
`tokenIdentifier`. There are **15 such fields across 13 tables**:

| Table | Field(s) |
| --- | --- |
| `players` | `createdBy` |
| `evaluations` (player evaluations) | `evaluatedBy` |
| `applications` | `processedBy` |
| `statusEvents` | `performedBy` |
| `eventResults` | `createdBy` |
| `auditLogs` | `userId` |
| `tierHistory` | `changedBy` |
| `thirdPartyImports` | `importedBy` |
| `events` | `createdBy` |
| `replays` | `uploadedBy` |
| `supportTickets` | `archivedBy` |
| `matchEliminationOverrides` | `editedBy` |
| `wrappedContent` | `publishedBy`, `lastEditedBy` |
| `chatMessages` | `userId` |

> **Critical implication:** linked records survive a migration **only if the user row
> keeps its existing `_id`.** Changing `tokenIdentifier` *in place* preserves every
> link automatically. Deleting + re-inserting (or letting first-login create a new row)
> orphans all of them.

---

## 2. Format of `tokenIdentifier` values currently stored

From `convex-export/users/documents.jsonl` (6 rows total), the format is:

```
<issuer>|<subject>
```

- **Issuer** is constant for all rows: `https://hercules.app`.
- **Subject** appears in **two distinct formats** (Hercules changed its ID scheme over
  time — confirmed by `_creationTime`):

  | Subject style | Example (redacted) | Seen on rows created |
  | --- | --- | --- |
  | Legacy 32-char base62 random | `Mkag…Riif` | ~Nov 2025 (`_creationTime` ≈ 1.7624e12) |
  | Newer ULID with `usr_` prefix | `usr_01KS…PK3` | ~2026 (`_creationTime` ≈ 1.779e12) |

> **Edge-case warning:** do **not** parse or pattern-match the subject. Any migration
> matching logic must treat `tokenIdentifier` as opaque, because both the issuer *and*
> the subject change after migration, and the subject already has two formats.

---

## 3. Are verified email addresses available?

**Partly — and this is the single most important risk to get right.**

- Every one of the 6 current rows **has a non-empty `email`** (one row, an admin, has
  an empty `name` but still has an email).
- **However, the schema does not store an `email_verified` flag.** `convex/users.ts`
  copies `identity.email` straight from the OIDC `id_token` without checking
  `email_verified`:
  ```ts
  await ctx.db.insert("users", { tokenIdentifier, name: identity.name, email: identity.email });
  ```
  So the stored email is "whatever the IdP put in the token," not a guaranteed-verified
  address.
- The frontend requests the `email` scope (`VITE_HERCULES_OIDC_SCOPE` default
  `openid profile email offline_access`), so an email claim is normally present, but
  verification status is unknown from this data alone.

**Consequence for migration:** email is the only stable human-identifiable key shared
across identity providers, so it is the natural matching key — **but matching on an
unverified email is a privilege-escalation hole** (see Edge Case E1). The plan below
requires emails to be **verified on the new provider** before they are trusted for
re-linking.

---

## 4. Step-by-step migration plan (no data loss)

Goal: every existing row keeps its **`_id`, `role`, `username`, and all linked
records**, while its `tokenIdentifier` is re-pointed from the Hercules identity to the
new provider's identity.

**Chosen strategy: in-place re-key.** Never delete/insert user rows; only `patch`
`tokenIdentifier` on the existing row. This preserves `_id` and therefore all 15
foreign-key fields above.

### Phase 0 — Freeze & back up
1. Announce a short maintenance window; ideally pause the daily crons
   (`convex/crons.ts`) and the Discord bot so no writes create new users mid-migration.
2. Take a fresh snapshot: `npx convex export`. (The existing `convex-export/` is your
   reference baseline; keep it.) Verify the `users` table row count and that every
   admin/event_mod row is present.

### Phase 1 — Build the old→new identity map
3. Stand up the new provider (Clerk or Convex Auth — see `AUTH_MIGRATION.md`).
4. Produce a **mapping table** `{ email → newTokenIdentifier }`:
   - **Preferred (provider-driven):** export/seed the user list into the new provider
     (most providers let you pre-create users by email), then read back each user's new
     subject/issuer to compute the new `tokenIdentifier`.
   - **Fallback (login-driven):** have each existing staff member log in once under the
     new provider in a controlled window; capture their new identity.
5. **Require verified email** on the new-provider side for every entry used in the map.
   Drop/ūflag any unverified ones for manual handling.

### Phase 2 — Re-key the existing rows (idempotent, in place)
6. Write a one-off **internal** Convex mutation (run from the dashboard; not exposed to
   clients) that, for each `{ email, newTokenIdentifier }`:
   - looks up the existing row by the **old** email (normalized: `trim().toLowerCase()`),
   - asserts exactly **one** match (abort on 0 or >1 — see Edge Cases),
   - `patch`es **only** `tokenIdentifier` (leaves `_id`, `role`, `username`, `name`
     untouched),
   - is **idempotent**: if a row already has the new `tokenIdentifier`, skip it.

   Pseudocode (illustrative — do not add to the app):
   ```ts
   // internalMutation, args: { mappings: {email, newToken}[] }
   for (const m of mappings) {
     const email = m.email.trim().toLowerCase();
     const matches = (await ctx.db.query("users").collect())
       .filter(u => (u.email ?? "").trim().toLowerCase() === email);
     if (matches.length !== 1) { log("SKIP ambiguous/none", email, matches.length); continue; }
     const u = matches[0];
     if (u.tokenIdentifier === m.newToken) continue;       // idempotent
     await ctx.db.patch(u._id, { tokenIdentifier: m.newToken }); // _id, role, username preserved
   }
   ```
7. Keep a printed log of `(email, oldToken→newToken, _id, role, username)` for audit.

### Phase 3 — Prevent duplicate creation at first login
8. **Before** any real user logs in under the new provider, ensure the re-key in Phase 2
   is complete, so `updateCurrentUser`'s `by_token` lookup *finds the existing row* and
   takes the `patch` branch instead of the `insert` branch.
9. If logins cannot be fully sequenced after the re-key, temporarily harden
   `updateCurrentUser` so that, when no `by_token` match exists, it **falls back to
   matching a verified email and patches that row's `tokenIdentifier`** rather than
   inserting. (This is a planned code change for the migration window — documented here,
   **not** implemented in this audit.)

### Phase 4 — Switch the provider config
10. Update `convex/auth.config.js` (`domain`/`applicationID`) and the frontend provider
    wrappers to the new issuer (per `AUTH_MIGRATION.md`). Deploy Convex (`npx convex deploy`).

### Phase 5 — Verify (use `TEST_CHECKLIST.md`)
11. Confirm `users` row **count is unchanged** (no new rows created).
12. Confirm each admin/event_mod still has the correct `role` and `username`.
13. Spot-check linked records: e.g., the heavy-owner admin still shows as author on their
    players/auditLogs/events (see §6 counts) — i.e., `_id`s never changed.
14. Re-enable crons and the Discord bot.

### Rollback
15. If verification fails, restore from the Phase-0 export (`npx convex import`) and
    revert `auth.config.js`. Because Phase 2 only patches `tokenIdentifier`, rollback is
    a clean restore of the `users` table.

---

## 5. Example records (sensitive values redacted)

### `users` rows (structure verbatim; emails + subjects redacted)

```jsonc
// ADMIN — heavy owner of linked records (see §6)
{ "_id": "j57dp3…txa9v",
  "tokenIdentifier": "https://hercules.app|J9Zy…4gQs",   // legacy subject format
  "name": "Bryony Lee", "email": "b************m@gmail.com",
  "role": "admin", "username": "plumbry",
  "_creationTime": 1762394346446.058 }

// ADMIN — empty name, still has email
{ "_id": "j57dd…txv5f",
  "tokenIdentifier": "https://hercules.app|wwjM…MgtEA",
  "name": "", "email": "b**********1@outlook.com",
  "role": "admin", "username": "billy" }

// EVENT_MOD
{ "_id": "j57ck…v0rvy",
  "tokenIdentifier": "https://hercules.app|Dfcy…suhj",
  "name": "Bryony", "email": "p********v@gmail.com",
  "role": "event_mod", "username": "plumbrytv" }

// NO ROLE, has username
{ "_id": "j5790…evn8",
  "tokenIdentifier": "https://hercules.app|usr_01KS…PK3", // newer ULID subject format
  "name": "Cherko", "email": "c******t@gmail.com",
  "username": "cherko" }                                  // (no `role` field)

// NO ROLE, NO username — minimal row from a first login
{ "_id": "j57d2…6yfab",
  "tokenIdentifier": "https://hercules.app|usr_01KR…0DVH",
  "name": "Billy", "email": "b**************s@gmail.com" } // (no `role`, no `username`)
```

### A linked record pointing at a user by `_id` (from `auditLogs`)

```jsonc
{ "_id": "js700…wc5vs", "action": "third_party_update",
  "entityType": "thirdPartyImport", "entityId": "k1754…drsk",
  "userId": "j57dp3…txa9v",        // <-- references the admin's _id, NOT tokenIdentifier
  "userName": "Bryony Lee" }
```

### A `supportTickets` record referencing a user by `_id`

```jsonc
{ "_id": "ks71m…4hza", "discordUsername": "plumbry", "message": "Test",
  "status": "archived",
  "archivedBy": "j57dp3…txa9v",    // <-- admin _id again
  "archivedAt": 1764149343221.0 }
```

> These confirm the rule in §1: re-keying `tokenIdentifier` in place (keeping `_id`)
> leaves every `userId`/`createdBy`/`archivedBy`/… pointer valid.

---

## 6. Linked-record ownership (why in-place re-key matters)

Approximate count of records in the export that reference each user's `_id`
(excluding the user's own row):

| User (username) | Role | Approx. linked records | Tables touched |
| --- | --- | --- | --- |
| `plumbry` | admin | **~6,300+** | players (~1271), manualScores (~1429), auditLogs (~1667), tierHistory (~1586), matchEliminationOverrides (~161), thirdPartyImports (~116), events (~98), statusEvents (~15), applications (~2), wrappedContent (1), chatMessages (1), supportTickets (1) |
| `billy` | admin | ~175 | auditLogs (~45), tierHistory (~37), manualScores (~35), statusEvents (~29), applications (~28), chatMessages (1) |
| `plumalt` | admin | ~3 | auditLogs (~3) |
| `plumbrytv` | event_mod | ~1 | auditLogs (~1) |
| `cherko` | (none) | 0 | — |
| `Billy` (billychurchbills) | (none) | 0 | — |

If migration created new rows instead of re-keying in place, **~6,500 records would be
orphaned**, attribution/history would break, and the two heaviest owners are **admins**.

---

## 7. Edge cases that could create duplicate users or remove admin permissions

**E1 — Duplicate creation via `updateCurrentUser` (HIGHEST RISK).**
After the provider switch, a returning user presents a **new** `tokenIdentifier`. The
`by_token` lookup misses → the `else` branch **inserts a new row with no `role` and no
`username`**. The admin is now "logged in" but on a fresh viewer-level row → **admin
permissions effectively lost**, and a **duplicate** row exists.
*Mitigation:* complete the in-place re-key (Phase 2) **before** users log in, or add the
verified-email fallback in Phase 3.9.

**E2 — Privilege escalation via unverified email.**
If re-link matches on email and the new provider does not verify emails, an attacker can
register a new account using an admin's email and inherit `role: "admin"`.
*Mitigation:* only trust **verified** emails for matching (see §3). Reject unverified.

**E3 — One human, multiple intentional accounts (present in this data).**
"Bryony Lee" owns **three separate rows** with three different emails
(`plumbry`/admin, `plumalt`/admin, `plumbrytv`/event_mod). These are deliberately
distinct accounts.
*Risks:* (a) if the new IdP forces a single identity per person, two of these rows can
never be re-keyed → orphaned (including linked records); (b) any "merge by name" logic
would wrongly collapse them.
*Mitigation:* match strictly by **email**, never by name; confirm each email can still
log in under the new provider; handle un-loginable rows manually.

**E4 — One human, multiple emails that get consolidated.**
`billy` (admin, `…@outlook.com`) and `Billy`/`billychurchbills` (no role, `…@gmail.com`)
appear to be the same person. If that person consolidates to the gmail identity under
the new provider, an email match links them to the **no-role** row → **admin lost**;
meanwhile the outlook admin row is orphaned.
*Mitigation:* build the mapping deliberately for known multi-email people; map the
*intended* identity to the admin `_id`; verify role after cutover.

**E5 — Rows with no email or empty fields.**
Email-based matching is impossible for any row lacking a (verified) email. (All 6 current
rows have an email, but `updateCurrentUser` does not require one, so future/edge rows may
not.)
*Mitigation:* produce a manual-mapping list for rows without a usable email before cutover.

**E6 — Email normalization mismatches.**
Case/whitespace/alias differences (`Admin@x.com` vs `admin@x.com`) cause false misses →
either a missed re-key (then E1 duplicate) or a wrong match.
*Mitigation:* normalize `trim().toLowerCase()` on both sides; decide policy on `+`
aliases and Gmail dots explicitly.

**E7 — Two existing rows share one email (ambiguous match).**
Not present in this dataset, but if it ever occurs the re-key mutation must **abort**
that entry rather than guess.
*Mitigation:* the Phase-2 mutation asserts exactly one match; logs and skips otherwise.

**E8 — `tokenIdentifier` collision / non-unique.**
`by_token` is a normal (non-unique) index. A mapping bug could set the same new
`tokenIdentifier` on two rows, making `.unique()` throw at login for both users.
*Mitigation:* verify the new `tokenIdentifier` set is unique before/after Phase 2.

**E9 — Re-running the migration.**
A non-idempotent re-key re-run could re-point or double-insert.
*Mitigation:* the Phase-2 mutation skips rows already holding the target token (idempotent).

**E10 — Convex Auth changes the identity model.**
If you choose **Convex Auth** (vs Clerk), identity is resolved via `getAuthUserId()` and
its own `authAccounts`/`users` tables rather than a Hercules-style `tokenIdentifier`.
Re-keying then means **bridging `authAccounts` to the existing `users._id`** (or adding
`role`/`username` onto Convex Auth's users table), which is more involved than a simple
`tokenIdentifier` patch. Clerk preserves the current `tokenIdentifier` model and is the
lower-risk path for this specific data. (See `AUTH_MIGRATION.md`.)

**E11 — Writes during the migration window.**
If crons / the Discord bot / a live user write during re-keying, a new user row or
attribution can appear mid-flight.
*Mitigation:* freeze crons + bot (Phase 0) and run in a short maintenance window.

---

## 8. Summary

- Users are identified solely by **`tokenIdentifier`** (`https://hercules.app|<subject>`),
  with the subject in two historical formats; treat it as opaque.
- Roles, usernames, and **all 15 linked-record foreign keys** hang off the row's **`_id`**,
  so the safe migration is an **in-place `tokenIdentifier` re-key** matched on
  **verified email** — never delete/insert, never match by name.
- The biggest dangers are **duplicate row creation at first login** (which silently
  strips admin) and **email-based mis-linking** for the several multi-account / multi-email
  humans present in this exact dataset. Both are mitigated by completing the re-key before
  logins and by trusting only verified emails.
