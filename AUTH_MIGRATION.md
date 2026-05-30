# AUTH_MIGRATION.md

> Audit/plan only. No code was modified.

## 1. How authentication currently works

The app uses **OIDC (OpenID Connect) with the authorization-code + PKCE flow**,
brokered through the `@usehercules/auth` package, which is a thin wrapper around
the standard `oidc-client-ts` + `react-oidc-context` libraries plus a Convex
integration. (Verified by reading the compiled package sources in
`node_modules/@usehercules/auth/dist`.)

### Frontend flow

1. `src/main.tsx` renders `<App/>`, which wraps everything in `DefaultProviders`
   (`src/components/providers/default.tsx`).
2. `DefaultProviders` nests:
   ```
   <AuthProvider>            // HerculesAuthProvider (OIDC client)
     <ConvexProvider>        // ConvexProviderWithHerculesAuth (feeds id_token to Convex)
       <QueryClientProvider> ...
   ```
3. `AuthProvider` (`src/components/providers/auth.tsx`) configures the OIDC client:
   - `authority` ← `VITE_HERCULES_OIDC_AUTHORITY`
   - `client_id` ← `VITE_HERCULES_OIDC_CLIENT_ID`
   - `prompt`, `response_type`, `scope`, `redirect_uri` (all have sane defaults;
     default redirect is `${window.location.origin}/auth/callback`).
4. The **Sign In** button (`src/components/ui/signin.tsx`) calls
   `useAuth().signinRedirect()`, which redirects the browser to the Hercules OIDC
   server. After login, the IdP redirects back to `/auth/callback`.
5. `src/pages/auth/Callback.tsx` uses `useAuthCallback(...)`. It waits for the
   OIDC library to finish processing the redirect, waits for Convex to report
   `isAuthenticated`, then calls the `api.users.updateCurrentUser` mutation
   (`onSync`) and navigates home.

### How the token reaches Convex

`src/components/providers/convex.tsx` uses `ConvexProviderWithHerculesAuth`, which
is Convex's own `ConvexProviderWithAuth` with an adapter (`useUseAuthFromHercules`)
that:
- reads `user.id_token` from `react-oidc-context`,
- returns it to Convex via `fetchAccessToken`,
- transparently refreshes it via `signinSilent()` when it is within ~1 hour of
  expiry (using a `navigator.locks` mutex to dedupe refreshes).

So every Convex query/mutation/action call carries the OIDC **id_token** as a
bearer token.

### Backend validation

`convex/auth.config.js` registers one OIDC provider with Convex:

```js
export default {
  providers: [
    { domain: process.env.HERCULES_OIDC_AUTHORITY,
      applicationID: process.env.HERCULES_OIDC_CLIENT_ID },
  ],
};
```

Convex validates the incoming JWT against that issuer's JWKS. On the server,
`ctx.auth.getUserIdentity()` then returns the decoded identity
(`tokenIdentifier`, `name`, `email`, `subject`, `issuer`, …).

### User records, roles, sessions

- `convex/schema.ts` → `users` table:
  ```
  tokenIdentifier: string   // index "by_token"  ← identity key
  name?:  string
  email?: string
  username?: string         // index "by_username"
  role?: "admin" | "event_mod" | "viewer"
  ```
- `convex/auth_helpers.ts` provides `getCurrentUser`, `requireAdmin`,
  `requireModeratorOrAdmin`, `requireEventBanAccess`. All resolve the user by
  `identity.tokenIdentifier`.
- `convex/users.ts` upserts the user on `updateCurrentUser` (keyed on
  `tokenIdentifier`), manages `username`, and manages `role` (`becomeAdmin`,
  `updateUserRole`).
- The frontend authorization hook is `src/hooks/use-user-role.ts` (`useUserRole`),
  which calls `useConvexAuth()` + `api.users.getCurrentUser` and derives
  `isAdmin` / `isModeratorOrAdmin` / `hasEventBanAccess` / etc. **25+ components**
  use `useUserRole`, but it depends only on Convex — **not** on Hercules.

## 2. Which providers are used

Exactly **one**: a single OIDC provider (the Hercules-hosted OIDC server). There is
no email/password, no social-login matrix, no multi-tenant setup in code. The OIDC
server itself may offer "select_account" (the default `prompt`), implying it can
broker upstream identities, but from this repo's perspective there is **one issuer**.

## 3. How Convex interacts with auth

- Convex trusts JWTs from the configured OIDC `domain` (issuer).
- Identity is surfaced via `ctx.auth.getUserIdentity()`.
- Users are stored in the `users` table and keyed by `tokenIdentifier`.
- Authorization (roles) is **fully owned by the app's own `users.role` field** in
  Convex — it is not provided by Hercules. This is important: **roles/permissions do
  not depend on Hercules at all** and survive any auth migration unchanged, as long
  as users can be re-linked to their records.

## 4. Do users, sessions, and permissions depend on Hercules?

| Concern | Depends on Hercules? | Detail |
| --- | --- | --- |
| **Identity provider / login** | **Yes** | Login redirects to the Hercules OIDC server; Convex validates its tokens. This is the real lock-in. |
| **Sessions** | **Yes (issued by Hercules)** | Tokens/sessions are minted by the Hercules OIDC server (`oidc-client-ts` stores them client-side). No server session store in this repo. |
| **User records** | **Partially** | Stored in Convex (`users` table), but the row is keyed by `tokenIdentifier = issuer|subject`. The *issuer portion is Hercules-specific*, so swapping IdP changes the key. |
| **Permissions / roles** | **No** | `role` lives entirely in Convex and is app-managed. |
| **Profile data (username)** | **No** | App-managed in Convex. |

**Bottom line:** Permissions and profile data are independent. The dependency is the
login provider and the `tokenIdentifier` keying. Any migration must plan for
**re-linking existing users** to their Convex records (preserving roles/usernames).

---

## 5. Option 1 — Keep Hercules Auth

**Pros**
- Zero engineering work; everything works today.
- OIDC + Convex integration, silent refresh, and callback handling are already
  solved and tested.
- Roles/usernames untouched.

**Cons**
- Continued dependency on a third-party hosted IdP for a core function (login).
- Vendor lock-in to Hercules availability/pricing/terms.
- Auth config is opaque (the OIDC server is not in this repo); you cannot self-host
  or fully audit it.
- Couples the project's identity to the Hercules platform you may be leaving.

**Estimated work:** None.

**Files affected:** None.

---

## 6. Option 2 — Replace with Convex Auth (`@convex-dev/auth`)

Convex's first-party auth library. Auth lives **inside** your Convex deployment
(no external IdP required); supports OAuth providers, magic links, and
password auth.

**Pros**
- No third-party auth host — identity lives in your own Convex deployment.
- First-party fit: designed for exactly this `ConvexReactClient` setup.
- Removes `@usehercules/auth` entirely; `auth.config.js` is replaced by Convex Auth's
  generated config.
- Full control and self-contained; nothing else to pay for.
- Frontend surface is tiny (see audit), so the swap is localized.

**Cons**
- Convex Auth manages its own `users` (and `authAccounts`/`authSessions`) tables.
  You must reconcile that with the existing `users` table and its `role`/`username`
  fields (either adopt Convex Auth's users table and add your fields, or bridge).
- `tokenIdentifier` semantics change → **existing users must be re-linked/migrated**
  (e.g. match on verified email, or run a one-time backfill).
- You must implement actual login UX (provider buttons / password / magic link) —
  more than the current single "redirect to IdP" button.
- Still maturing relative to Clerk; some flows (enterprise SSO, org management) are
  less batteries-included.
- The `/auth/callback` page and `useAuthCallback` flow are replaced.

**Estimated work:** ~2–4 days.
- Install/configure `@convex-dev/auth`, pick provider(s), set env vars.
- Replace `auth.tsx` (`ConvexAuthProvider`), `convex.tsx`, `use-auth.ts`,
  `signin.tsx` sign-in/out, remove/replace `Callback.tsx`.
- Replace `convex/auth.config.js`; merge schema (`users` + auth tables).
- Update `getCurrentUser`/`updateCurrentUser` to Convex Auth's `getAuthUserId`.
- **User data migration / re-link** (the risky part).
- Test the full matrix in `TEST_CHECKLIST.md`.

**Files affected:**
- `src/components/providers/auth.tsx`
- `src/components/providers/convex.tsx`
- `src/hooks/use-auth.ts`
- `src/components/ui/signin.tsx`
- `src/components/site-header.tsx`
- `src/pages/admin/_components/admin-sidebar.tsx`
- `src/pages/auth/Callback.tsx` (removed/replaced)
- `convex/auth.config.js` (replaced)
- `convex/schema.ts` (auth tables + keep `role`/`username`)
- `convex/users.ts`, `convex/auth_helpers.ts` (identity resolution)
- `package.json` (swap deps)

---

## 7. Option 3 — Replace with Clerk

Clerk is a hosted auth/identity platform with an official Convex integration
(`ConvexProviderWithClerk`) and a Convex OIDC config recipe.

**Pros**
- Closest conceptual match to the current setup: still a hosted IdP that issues
  JWTs Convex validates — so the backend pattern (`ctx.auth.getUserIdentity()`,
  `tokenIdentifier`) barely changes.
- Batteries-included UI (`<SignIn/>`, `<UserButton/>`), MFA, social logins, org
  management, user dashboard.
- Official, well-documented Convex support; minimal backend change (swap
  `auth.config.js` issuer + applicationID to Clerk's JWT template).
- Mature, production-grade; least custom code to maintain.

**Cons**
- Still a third-party hosted dependency (you trade Hercules for Clerk) — does not
  achieve "fully self-hosted."
- Paid tiers for higher MAUs / advanced features.
- `tokenIdentifier` issuer changes → **existing users must be re-linked/migrated**
  (same data-continuity problem as Option 2).
- Adds Clerk SDK and a Clerk-specific provider wrapper.
- `/auth/callback` flow changes (Clerk handles redirects differently).

**Estimated work:** ~1.5–3 days.
- Create Clerk app + JWT template for Convex; set publishable key + issuer env vars.
- Replace `auth.tsx` with `<ClerkProvider>`, `convex.tsx` with
  `ConvexProviderWithClerk`, update `use-auth.ts`/`signin.tsx`/header/sidebar to
  Clerk hooks (`useAuth`, `useClerk`, `SignInButton`).
- Replace `convex/auth.config.js` issuer/applicationID with Clerk's.
- **User re-link/migration.**
- Test the matrix in `TEST_CHECKLIST.md`.

**Files affected:** Same frontend list as Option 2, plus `convex/auth.config.js`.
Schema impact is **smaller** than Convex Auth (you can keep the existing `users`
table as-is and just re-key `tokenIdentifier`).

---

## 8. Recommendation

**Recommended: Option 3 — Clerk**, with **Option 2 (Convex Auth) as the
self-hosting alternative**.

Reasoning:
- The current architecture is "external OIDC IdP → Convex validates JWT → app
  manages roles." Clerk preserves that exact shape, so the change is the most
  mechanical and lowest-risk: swap the provider wrappers and point
  `auth.config.js` at Clerk's issuer. The provider-agnostic backend
  (`ctx.auth.getUserIdentity()` + `tokenIdentifier` + app-owned `role`) stays
  essentially intact, and you get a maintained UI/SDK for free.
- Choose **Option 2 (Convex Auth)** instead if the explicit goal is to **eliminate
  every third-party auth host** and keep identity entirely inside Convex. It is the
  most "owned" outcome but costs more engineering (schema reconciliation + login UX).
- **Option 1 (keep Hercules)** is only appropriate as a short-term hold; it does not
  advance the goal of leaving the Hercules platform.

Regardless of option, the single biggest task is the **one-time user re-link/migration**
so existing accounts keep their `role` and `username`. Plan it explicitly (match on
verified email; back up the `users` table first — see `convex/dataBackup.ts`).
