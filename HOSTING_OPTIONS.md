# HOSTING_OPTIONS.md

> Audit/plan only. No code was modified.

## What kind of app is this?

A **pure client-side Single Page Application**:
- Vite 7 + React 19 + TypeScript, built with `tsc -b && vite build`.
- Client-side routing via `react-router-dom` `BrowserRouter` (`src/App.tsx`) — this
  means the host **must** rewrite unknown paths to `/index.html` (SPA fallback) or
  deep links / refreshes on routes like `/admin/...` will 404.
- No SSR, no server runtime, no serverless functions in the web project. All
  dynamic behavior is in **Convex** (a separately hosted backend) and in the
  **Discord bot script** (`discord-auto-sync.*`, a standalone Node process, not part
  of the web deploy).

Because of this, the web app can be hosted as static files on essentially any static
host. The three platforms below all work. The only real requirements are:

1. SPA fallback rewrite to `index.html`.
2. Build-time `VITE_*` environment variables (Vite inlines them at build time).
3. Convex deployed/served separately (`npx convex deploy`), with the resulting
   deployment URL fed back in as `VITE_CONVEX_URL`.

### Build settings common to all platforms

| Setting | Value |
| --- | --- |
| Install command | `npm install` (or `pnpm install` — both `package-lock.json` and `pnpm-lock.yaml` exist; pick one and remove drift) |
| Build command | `npm run build` (`tsc -b && vite build`) |
| Output directory | `dist` |
| Node version | 20 or 22 LTS (repo uses `@types/node` 24; any modern LTS is fine) |
| Required build-time env | `VITE_CONVEX_URL`, `VITE_HERCULES_OIDC_AUTHORITY`, `VITE_HERCULES_OIDC_CLIENT_ID` (+ optional `VITE_HERCULES_*`, `VITE_HERCULES_WEBSITE_ID`) |
| SPA routing | Rewrite all paths → `/index.html` |

> Note on the Hercules Vite plugin: building on CI works fine. The plugin's
> visual-editor and dynamic-component-creator are dev-only / gated behind
> `HERCULES_DEV_MACHINE`; the component tagger just injects `data-*` attributes. The
> `@usehercules/vite` and `@usehercules/eslint-plugin` packages are published on npm,
> so `npm install` resolves them on any platform. No private registry is required.

> Note on Convex: Set `VITE_CONVEX_URL` to your production Convex deployment URL.
> Convex env vars (`HERCULES_OIDC_*`, `DISCORD_*`, `YUNITE_*`, etc. — see
> `ENVIRONMENT_SETUP.md`) are configured in the **Convex dashboard**, not on the
> static host. Typically you run `npx convex deploy` as part of (or before) the
> static build so `auth.config.js` and functions are live.

---

## Cloudflare Pages

| Item | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Env vars required | `VITE_CONVEX_URL`, `VITE_HERCULES_OIDC_AUTHORITY`, `VITE_HERCULES_OIDC_CLIENT_ID` (+ optional `VITE_HERCULES_*`) set in the Pages project; build-time scope. |
| SPA fallback | Add a `public/_redirects` file containing `/*  /index.html  200`, **or** rely on Pages' built-in SPA handling. |

**Blockers / compatibility:** None significant. Fully static — Cloudflare Pages is a
natural fit. Just ensure the SPA rewrite is configured (otherwise deep-link refreshes
404). The OIDC redirect URI (`/auth/callback`) is a normal client route covered by
the SPA fallback. Make sure the final domain is added to the OIDC provider's allowed
redirect URIs.

---

## Vercel

| Item | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Env vars required | Same `VITE_*` set in Project → Settings → Environment Variables (build-time). |
| SPA fallback | Vercel's Vite preset serves SPA fallback automatically; if needed, add `vercel.json` with a rewrite `{ "source": "/(.*)", "destination": "/index.html" }`. |

**Blockers / compatibility:** None. Vercel auto-detects Vite. No serverless functions
are needed (none exist in the repo). Watch only for the lockfile choice (Vercel will
use whichever lockfile is present; having both npm and pnpm lockfiles can cause it to
pick pnpm — standardize on one).

---

## Netlify

| Item | Value |
| --- | --- |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Env vars required | Same `VITE_*` set in Site configuration → Environment variables (build-time). |
| SPA fallback | Add `public/_redirects` with `/*  /index.html  200` **or** a `netlify.toml` `[[redirects]]` block. Required — Netlify does not infer SPA fallback. |

**Blockers / compatibility:** None. Standard static Vite deploy. The only must-do is
the `_redirects` / `netlify.toml` SPA rewrite.

---

## Comparison & recommendation

| Platform | Static SPA fit | SPA fallback effort | Notes |
| --- | --- | --- | --- |
| Cloudflare Pages | Excellent | `_redirects` one-liner / built-in | Fast global edge, generous free tier. |
| Vercel | Excellent | Automatic (Vite preset) | Easiest zero-config; great DX. |
| Netlify | Excellent | `_redirects` / `netlify.toml` | Mature, simple. |

**Recommendation: Cloudflare Pages** for the primary deploy, with **Vercel** as the
zero-config fallback.

- All three are technically equivalent for this static SPA, so the decision is about
  cost/operations, not capability.
- **Cloudflare Pages** gives the best price/performance (fast edge CDN, no egress
  surprises, generous free tier) and pairs cleanly with the rest of the stack; the
  only setup step is the one-line `_redirects` SPA rule.
- **Vercel** is the best choice if you want the absolute least configuration — its
  Vite preset handles the build and SPA routing automatically.
- **Netlify** is equally fine; choose it if you already use Netlify elsewhere.

For every platform, remember the two cross-cutting steps that are independent of the
host:
1. Deploy Convex separately and point `VITE_CONVEX_URL` at it; set Convex's own env
   vars in the Convex dashboard.
2. Register the production domain's `/auth/callback` (and origin) as an allowed
   redirect URI in whichever auth provider you end up using.
