# ENVIRONMENT_SETUP.md

> Audit only. No code was modified. Every variable below was found by searching the
> repository for `import.meta.env.*`, `process.env.*`, and `%VITE_*%` tokens.

There are **three distinct environment scopes** in this project. They are configured
in different places and must not be confused:

1. **Frontend / Vite (`VITE_*`)** — inlined into the static bundle at build time
   (`import.meta.env.*` and `%VITE_*%` tokens in `index.html`). Set these on the
   static host (Cloudflare/Vercel/Netlify) or in a local `.env`.
2. **Convex backend (`process.env.*` in `convex/**`)** — set in the **Convex
   dashboard** (`npx convex env set ...`). Never shipped to the browser.
3. **Discord bot script (`discord-auto-sync.js` / `.cjs`)** — a standalone Node
   process run outside the web app; set in that process's own environment.

`.env*` is git-ignored (`.gitignore` line 30), so no secrets are committed.

---

## 1. Frontend variables (Vite — build time)

| Variable | Used in | What it does | Required? |
| --- | --- | --- | --- |
| `VITE_CONVEX_URL` | `src/lib/convex.ts`, `src/components/providers/convex.tsx` | URL of the Convex deployment the client connects to. Falls back to `http://localhost:3000` if unset. | **Required** in production (fallback is dev-only). |
| `VITE_HERCULES_OIDC_AUTHORITY` | `src/components/providers/auth.tsx` | OIDC issuer/authority URL the login flow redirects to. | **Required** (for current Hercules auth). |
| `VITE_HERCULES_OIDC_CLIENT_ID` | `src/components/providers/auth.tsx` | OIDC client ID for this app. | **Required** (for current Hercules auth). |
| `VITE_HERCULES_OIDC_PROMPT` | `src/components/providers/auth.tsx` | OIDC `prompt` param. Defaults to `select_account`. | Optional. |
| `VITE_HERCULES_OIDC_RESPONSE_TYPE` | `src/components/providers/auth.tsx` | OIDC `response_type`. Defaults to `code`. | Optional. |
| `VITE_HERCULES_OIDC_SCOPE` | `src/components/providers/auth.tsx` | OIDC scopes. Defaults to `openid profile email offline_access`. | Optional. |
| `VITE_HERCULES_OIDC_REDIRECT_URI` | `src/components/providers/auth.tsx` | OAuth redirect URI. Defaults to `${window.location.origin}/auth/callback`. | Optional (recommended to set explicitly in prod). |
| `VITE_HERCULES_WEBSITE_ID` | `index.html` (lines 19, 26 — `%VITE_HERCULES_WEBSITE_ID%`) | Token substituted into the OpenGraph/Twitter share-image URL on `hercules.app`. | Optional (cosmetic; social preview only). |

---

## 2. Convex backend variables (set in Convex dashboard)

| Variable | Used in | What it does | Required? |
| --- | --- | --- | --- |
| `HERCULES_OIDC_AUTHORITY` | `convex/auth.config.js` | OIDC issuer Convex validates JWTs against (`domain`). | **Required** for auth. |
| `HERCULES_OIDC_CLIENT_ID` | `convex/auth.config.js` | OIDC application ID (`applicationID`). | **Required** for auth. |
| `DISCORD_SYNC_API_KEY` | `convex/http.ts` (all webhook routes) | Bearer key the Discord bot must present to call the sync/scrim/role webhook endpoints. Checked as `DISCORD_SYNC_API_KEY || API_KEY`. | **Required** if Discord webhooks are used. |
| `API_KEY` | `convex/http.ts` (fallback for the above) | Alternate name for the webhook bearer key. | Optional (fallback). |
| `SITE_URL` | `convex/http.ts` (`/api/scrim-events`) | Base URL used to build the scrim admin link returned to Discord. Falls back to deriving from the request URL. | Optional. |
| `YUNITE_API_KEY` | `convex/yunite/*` (sync, debug, platforms, matchData, fixPlacements, populateTeamMembers, backfillKillEvents, checkSurvivalTimeData, lookupPlatform), `convex/scrimSeries/importFromYunite.ts` | API key for Yunite (Discord tournament/stats integration). | **Required** for Yunite sync features. |
| `YUNITE_GUILD_ID` | same Yunite files as above | Yunite/Discord guild ID. `scrimSeries/importFromYunite.ts` has a hardcoded fallback `1371615693392576580`. | **Required** for Yunite sync (except where defaulted). |
| `DISCORD_BOT_TOKEN` | `convex/discord/roles.ts`, `convex/discord/eventSync.ts`, `convex/discord/sync.ts`, `convex/discord/archiveNoTierRole.ts` | Discord bot token for Convex actions that call the Discord API (role sync, member sync, event sync). | **Required** for those Discord features. |
| `DISCORD_GUILD_ID` | same Discord files as above | Discord guild (server) ID. | **Required** for those Discord features. |
| `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` | `convex/googleSheets.ts`, `convex/eventBans/sync.ts` | Google service-account JSON credentials for Sheets access (event bans sync, sheet reads). | **Required** for Google Sheets features. |
| `CITO_API_KEY` | `convex/inGameEarnings/actions.ts` | API key for the in-game earnings ("Cito") integration. | **Required** for in-game earnings. |
| `FN_API` | `convex/fortnitetracker.ts` | API key for Fortnite Tracker. | **Required** for Fortnite Tracker lookups. |
| `TIER_CLEAR_API_SECRET` | `convex/discord/removeAllTierRoles.ts` | Secret guarding the bulk "remove all tier roles" action. | **Required** for that admin action. |

---

## 3. Discord bot script variables (`discord-auto-sync.js` / `.cjs`)

> These run in a **separate Node process** (the Discord bot), not in the web app or
> Convex. Listed for completeness.

| Variable | Used in | What it does | Required? |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | `discord-auto-sync.js`, `.cjs` (`DISCORD_TOKEN` / fallback `BOT_TOKEN`) | Bot login token. | Required to run the bot. |
| `BOT_TOKEN` | `discord-auto-sync.cjs` (fallback) | Alternate bot token name. | Optional (fallback). |
| `DISCORD_SERVER_ID` | both scripts (`DISCORD_SERVER_ID` / fallback `SERVER_ID`) | Guild ID the bot reads members from. | Required to run the bot. |
| `SERVER_ID` | `.cjs` (fallback) | Alternate guild ID name. | Optional (fallback). |
| `API_URL` | both scripts | The Convex HTTP endpoint the bot posts member data to (`.../sync-member`; archive URL derived from it). | Required to run the bot. |
| `API_KEY` | both scripts | Bearer key sent to the Convex webhooks (must match `DISCORD_SYNC_API_KEY`/`API_KEY` on Convex). | Required to run the bot. |

---

## 4. Generated `.env.example`

A complete example file is provided at the repo root as **`.env.example`**. Because
`.gitignore` ignores `.env*`, that file may not be tracked by git — copy it to `.env`
locally (`cp .env.example .env`) and fill in real values. The same contents are
reproduced here for reference:

```dotenv
# ──────────────────────────────────────────────────────────────────────────
# FRONTEND (Vite) — inlined into the static bundle at BUILD time.
# Set these locally in .env and on your static host (Cloudflare/Vercel/Netlify).
# ──────────────────────────────────────────────────────────────────────────

# URL of your Convex deployment (REQUIRED in production).
VITE_CONVEX_URL="https://your-deployment.convex.cloud"

# OIDC / Hercules auth (REQUIRED for the current auth setup).
VITE_HERCULES_OIDC_AUTHORITY="https://your-oidc-issuer.example.com"
VITE_HERCULES_OIDC_CLIENT_ID="your-oidc-client-id"

# OIDC optional overrides (defaults shown).
VITE_HERCULES_OIDC_PROMPT="select_account"
VITE_HERCULES_OIDC_RESPONSE_TYPE="code"
VITE_HERCULES_OIDC_SCOPE="openid profile email offline_access"
VITE_HERCULES_OIDC_REDIRECT_URI="https://your-domain.example.com/auth/callback"

# Cosmetic: OpenGraph/Twitter share-image id used in index.html (optional).
VITE_HERCULES_WEBSITE_ID="your-website-id"


# ──────────────────────────────────────────────────────────────────────────
# CONVEX BACKEND — set in the Convex dashboard (npx convex env set NAME value).
# These are NOT exposed to the browser. Listed here for documentation only.
# ──────────────────────────────────────────────────────────────────────────

# Auth (REQUIRED): issuer + application id Convex validates JWTs against.
# HERCULES_OIDC_AUTHORITY="https://your-oidc-issuer.example.com"
# HERCULES_OIDC_CLIENT_ID="your-oidc-client-id"

# Discord webhook auth (REQUIRED if using Discord sync/scrim endpoints).
# DISCORD_SYNC_API_KEY="long-random-secret"
# API_KEY="long-random-secret"            # fallback name for the above
# SITE_URL="https://your-domain.example.com"  # optional, for scrim admin links

# Yunite integration (REQUIRED for Yunite sync features).
# YUNITE_API_KEY="your-yunite-api-key"
# YUNITE_GUILD_ID="your-discord-guild-id"

# Discord API (REQUIRED for role/member/event sync actions).
# DISCORD_BOT_TOKEN="your-discord-bot-token"
# DISCORD_GUILD_ID="your-discord-guild-id"

# Google Sheets (REQUIRED for event-bans sync / sheet reads).
# GOOGLE_SERVICE_ACCOUNT_CREDENTIALS='{"type":"service_account", ...}'

# In-game earnings integration.
# CITO_API_KEY="your-cito-api-key"

# Fortnite Tracker lookups.
# FN_API="your-fortnite-tracker-api-key"

# Guard for the bulk "remove all tier roles" admin action.
# TIER_CLEAR_API_SECRET="long-random-secret"


# ──────────────────────────────────────────────────────────────────────────
# DISCORD BOT SCRIPT (discord-auto-sync.js / .cjs) — separate Node process.
# Set in that process's own environment, not in the web app or Convex.
# ──────────────────────────────────────────────────────────────────────────

# DISCORD_TOKEN="your-discord-bot-token"   # or BOT_TOKEN
# DISCORD_SERVER_ID="your-discord-guild-id"  # or SERVER_ID
# API_URL="https://your-deployment.convex.site/api/discord/sync-member"
# API_KEY="long-random-secret"             # must match Convex DISCORD_SYNC_API_KEY
```
