# IMPLEMENTATION_NOTES.md

> Living notes from Phase 1 dev implementation. Updated after successful **plumbry** login on dev (May 2026).

---

## Dev environment (confirmed working)

| Setting | Value |
| --- | --- |
| Clerk instance | Development — `literate-bullfrog-32.clerk.accounts.dev` |
| Convex deployment | **dev/bryony-lee** — `https://incredible-kookabura-839.eu-west-1.convex.cloud` |
| Linked staff (dev) | **plumbry** only (`discordUserId: 684933831874183168`) |
| Production | **Untouched** |

---

## Critical: Discord ID in Clerk JWT (verified workaround)

The shortcode `{{user.external_accounts.discord.provider_user_id}}` **did not populate** in the `convex` JWT during dev testing. Convex returned:

> Account not linked. Your Discord id was not found in the sign-in token.

### Working pattern (dev and prod)

**1. Clerk user → Public metadata**

```json
{
  "discord_id": "<discord-snowflake>"
}
```

Set on each staff Clerk user **before** or **after** first Discord OAuth (Dashboard → Users → user → Metadata → Public metadata).

**2. Clerk JWT template `convex` → Claims**

```json
"discord_id": "{{user.public_metadata.discord_id}}"
```

Not `external_accounts.discord…`.

**3. Frontend — always use `convex` JWT template**

`src/components/providers/convex.tsx` calls `getToken({ template: "convex" })` explicitly. Default `ConvexProviderWithClerk` can skip the template when session `aud === "convex"`, which omitted custom claims.

**4. Convex — read claim in `convex/auth_discord.ts`**

`getDiscordUserIdFromIdentity()` reads `discord_id`, `public_metadata.discord_id`, and snowflake-shaped fallbacks.

### Future automation (Phase 2+)

Consider a Clerk **webhook** (`user.created` / `user.updated`) to copy Discord `provider_user_id` into `public_metadata.discord_id` automatically so manual metadata edits are not required per user.

---

## Convex dev environment variables

Set on **dev/bryony-lee** only:

| Variable | Value |
| --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | `https://literate-bullfrog-32.clerk.accounts.dev` |
| `MIGRATION_DEV_TOOLS_ENABLED` | `true` |

**Never** set `MIGRATION_DEV_TOOLS_ENABLED` on production.

---

## Local `.env` (gitignored)

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_…
VITE_CONVEX_URL=https://incredible-kookabura-839.eu-west-1.convex.cloud
```

---

## Staff linking deferred

Five dev staff rows exist (seeded via `npm run phase1:seed`) but are **not** linked to Clerk yet. Link at production cutover or when needed using the same flow as plumbry:

1. Pre-seed `discordUserId` on Convex `users` row  
2. Set Clerk public metadata `discord_id`  
3. Create/invite Clerk user (Restricted mode)  
4. First Discord login  

---

## Housekeeping checklist

- [x] Commit post-Phase-1 auth fixes (JWT template provider, metadata parsing, debug query)
- [x] Document Clerk `public_metadata` workaround (this file)
- [ ] Re-enable Clerk **Restricted mode** (manual — Clerk Dashboard)
- [ ] Phase 2 planning (production Clerk, Convex deploy, hosting)
