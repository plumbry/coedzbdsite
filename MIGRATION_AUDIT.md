# MIGRATION_AUDIT.md

> Audit only. No code was modified. This document inventories every Hercules
> touch‑point in the repository so the migration plan can be reviewed before any
> change is made.

## How to read the "difficulty" rating

| Rating | Meaning |
| --- | --- |
| Trivial | One-line change, no behavioral impact. |
| Easy | A few lines in one file, well-understood replacement exists. |
| Moderate | Requires a real replacement library/config and testing. |
| Hard | Touches identity/data continuity or many files. |

---

## 1. Package dependencies (`package.json`)

| Package | Where declared | What it does | Required? | Difficulty to replace |
| --- | --- | --- | --- | --- |
| `@usehercules/auth` `^1.0.45` | `dependencies` (line 46) | Thin wrapper around `oidc-client-ts` + `react-oidc-context` + Convex `ConvexProviderWithAuth`. Provides `HerculesAuthProvider`, `useAuth`, `useUser`, `useAuthCallback`, and `ConvexProviderWithHerculesAuth`. | **Yes** — this is the only auth client in the app. | Moderate. The package is generic OIDC; it can be replaced with `react-oidc-context`/`oidc-client-ts` directly, or with Convex Auth / Clerk. The real dependency is the **hosted Identity Provider** (see `AUTH_MIGRATION.md`), not the npm package. |
| `@usehercules/vite` `^1.0.24` | `devDependencies` (line 86) | Dev-time Vite plugin: component tagger, visual editor, Vite error forwarding, dynamic component creator. (Confirmed by reading `node_modules/@usehercules/vite/dist/index.mjs`.) | **No** — purely development/editor tooling. The visual editor and dynamic component creator are gated to dev / `HERCULES_DEV_MACHINE`. Component tagging adds `data-*` attributes but is not required for the app to run. | Easy. Remove the `hercules()` plugin from `vite.config.ts` and drop the dependency. No runtime behavior changes. |
| `@usehercules/eslint-plugin` `^1.0.24` | `devDependencies` (line 85) | ESLint config preset used in `eslint.config.js`. | **No** — lint-only. | Trivial. Remove the import and the `herculesPlugin.configs.recommended` entry from `eslint.config.js`. |

> Note: `package-lock.json` resolves `@usehercules/eslint-plugin` to `1.0.41` and
> `@usehercules/vite` to `1.0.42`, while `package.json` pins `^1.0.24`. Lockfile
> drift only; not a blocker.

---

## 2. Source-code usages

### 2.1 `@usehercules/auth/react`

| File | Symbol | What it does | Required? | Difficulty |
| --- | --- | --- | --- | --- |
| `src/components/providers/auth.tsx` | `HerculesAuthProvider` | Wraps the whole app (via `DefaultProviders`). Configures the OIDC client with `authority`, `client_id`, `prompt`, `response_type`, `scope`, `redirect_uri` from `VITE_HERCULES_OIDC_*` env vars. | **Yes** — root auth context. | Moderate. Replace with the chosen provider's `<Provider>` (Convex Auth `ConvexAuthProvider`, Clerk `ClerkProvider`, or raw `react-oidc-context` `AuthProvider`). |
| `src/hooks/use-auth.ts` | `useUser`, `useAuth` (re-export) | Re-exports the two hooks. `useUser` is **not actually consumed anywhere** (grep shows only this re-export line; all role logic uses the separate `useUserRole`). `useAuth` is consumed by 3 components. | `useAuth`: **Yes**. `useUser`: **No** (dead re-export). | Easy. Point the re-export at the new provider's equivalent, or inline. |
| `src/components/ui/signin.tsx` | `useAuth()` → `isAuthenticated`, `signinRedirect`, `signout`, `isLoading`, `error` | Sign-in / sign-out button. | **Yes** | Easy. Map to new provider's sign-in/out + loading/error state. |
| `src/components/site-header.tsx` | `useAuth()` → `signout` | Sign-out button in the header. | **Yes** | Easy. |
| `src/pages/admin/_components/admin-sidebar.tsx` | `useAuth()` → `signout` (line 11/20/120) | Sign-out button in the admin sidebar. | **Yes** | Easy. |
| `src/pages/auth/Callback.tsx` | `useAuthCallback({ isBackendAuthenticated, onSync, onSuccess, onNoAuthParams })` | OAuth redirect callback handler at route `/auth/callback`. Calls `api.users.updateCurrentUser` on sync, then navigates home. | **Yes** (for the OIDC redirect flow). With Convex Auth / Clerk this page is replaced or removed because callback handling differs. | Moderate. |

### 2.2 `@usehercules/auth/convex-react`

| File | Symbol | What it does | Required? | Difficulty |
| --- | --- | --- | --- | --- |
| `src/components/providers/convex.tsx` | `ConvexProviderWithHerculesAuth` | Wraps `ConvexReactClient` so Convex requests carry the OIDC `id_token`. Internally it is just Convex's `ConvexProviderWithAuth` with a `useAuth` adapter that pulls `user.id_token` from `react-oidc-context` and refreshes via `signinSilent`. (Confirmed by reading `node_modules/@usehercules/auth/dist/convex-react/index.mjs`.) | **Yes** — this is what authenticates Convex. | Moderate. Replace with `ConvexProviderWithAuth` (Convex Auth: `ConvexAuthProvider`; Clerk: `ConvexProviderWithClerk`). |

### 2.3 `@usehercules/vite`

| File | Symbol | What it does | Required? | Difficulty |
| --- | --- | --- | --- | --- |
| `vite.config.ts` (line 3, 17) | `hercules()` plugin | Adds dev tooling to the Vite pipeline. | **No** | Easy. |

### 2.4 `@usehercules/eslint-plugin`

| File | Symbol | What it does | Required? | Difficulty |
| --- | --- | --- | --- | --- |
| `eslint.config.js` (line 3, 20) | `herculesPlugin.configs.recommended` | Lint rules preset. | **No** | Trivial. |

---

## 3. Convex backend usages

| File | Reference | What it does | Required? | Difficulty |
| --- | --- | --- | --- | --- |
| `convex/auth.config.js` | `process.env.HERCULES_OIDC_AUTHORITY`, `process.env.HERCULES_OIDC_CLIENT_ID` | Registers a single OIDC provider with Convex (`domain` + `applicationID`). This is what makes Convex trust JWTs issued by the Hercules OIDC server. | **Yes** — without it, `ctx.auth.getUserIdentity()` returns null. | Moderate. Replace the `domain`/`applicationID` with the new IdP's issuer/clientID, or switch to Convex Auth's `convexAuth` config. |

> Important: The rest of the Convex backend is **provider-agnostic**. Every server
> function authenticates with `ctx.auth.getUserIdentity()` and looks the user up by
> `tokenIdentifier` (see `convex/auth_helpers.ts`, `convex/users.ts`). It does not
> import any Hercules package. Only `auth.config.js` is Hercules-specific.

---

## 4. `onhercules.app` references

| File | Line | Context | Required? | Difficulty |
| --- | --- | --- | --- | --- |
| `src/pages/scrims/_lib/pairing-algorithm.ts` | 27 | Code comment: `// Sourced from https://coedzbd.onhercules.app/tier-restrictions`. Documentation only — the current deployed URL of the app. | **No** — comment only. | Trivial (cosmetic). |

---

## 5. `hercules.app` / `hercules-cdn.com` references (`index.html`)

| File | Line | Context | Required? | Difficulty |
| --- | --- | --- | --- | --- |
| `index.html` | 10, 36 | `favicon` / `apple-touch-icon` pointing at `https://hercules-cdn.com/file_…`. | **No** — cosmetic asset hosted on Hercules CDN. Works as long as the CDN serves it; should be self-hosted before fully leaving Hercules. | Easy. |
| `index.html` | 19, 26 | OpenGraph / Twitter image: `https://hercules.app/og/app/%VITE_HERCULES_WEBSITE_ID%.png`. Uses the build-time replacement token `%VITE_HERCULES_WEBSITE_ID%`. | **No** — social-share preview image only. | Easy (replace with a self-hosted OG image). |
| `index.html` | 28 | `<meta name="twitter:site" content="@UseHercules" />`. | **No** — cosmetic. | Trivial. |

---

## 6. Hercules environment variables

See `ENVIRONMENT_SETUP.md` for the full table. Hercules-specific variables:

| Variable | Used in | Required? |
| --- | --- | --- |
| `VITE_HERCULES_OIDC_AUTHORITY` | `src/components/providers/auth.tsx` | Yes (frontend auth) |
| `VITE_HERCULES_OIDC_CLIENT_ID` | `src/components/providers/auth.tsx` | Yes (frontend auth) |
| `VITE_HERCULES_OIDC_PROMPT` | `src/components/providers/auth.tsx` | No (default `select_account`) |
| `VITE_HERCULES_OIDC_RESPONSE_TYPE` | `src/components/providers/auth.tsx` | No (default `code`) |
| `VITE_HERCULES_OIDC_SCOPE` | `src/components/providers/auth.tsx` | No (default `openid profile email offline_access`) |
| `VITE_HERCULES_OIDC_REDIRECT_URI` | `src/components/providers/auth.tsx` | No (default `${origin}/auth/callback`) |
| `VITE_HERCULES_WEBSITE_ID` | `index.html` (OG image token) | No (cosmetic) |
| `HERCULES_OIDC_AUTHORITY` | `convex/auth.config.js` (Convex env) | Yes (backend token validation) |
| `HERCULES_OIDC_CLIENT_ID` | `convex/auth.config.js` (Convex env) | Yes (backend token validation) |

---

## 7. Summary of the Hercules surface area

The Hercules footprint is **small and well-isolated**:

- **3 npm packages**, of which only 1 (`@usehercules/auth`) is runtime; the other 2 are dev/lint tooling.
- **6 frontend files** import Hercules (`auth.tsx`, `convex.tsx`, `use-auth.ts`, `signin.tsx`, `site-header.tsx`, `admin-sidebar.tsx`, `Callback.tsx` — 7 if you count `use-auth.ts` separately).
- **1 Convex config file** (`auth.config.js`).
- **A handful of cosmetic references** in `index.html` and one comment.

The genuine lock-in is **not** the code — it is the **hosted OIDC Identity Provider**
(the `*_OIDC_AUTHORITY`) where user accounts and sessions actually live, and the fact
that Convex keys every user by `tokenIdentifier` (`issuer|subject`), which changes if
the issuer changes. That is the only Hard part of a migration. See `AUTH_MIGRATION.md`.
