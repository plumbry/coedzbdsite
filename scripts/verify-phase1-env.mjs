#!/usr/bin/env node
/**
 * Verifies local Phase 1 environment variables before running convex dev / vite.
 * Usage: node scripts/verify-phase1-env.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env");

const required = [
  {
    key: "VITE_CONVEX_URL",
    hint: "Convex dev deployment URL (from npx convex dev)",
  },
  {
    key: "VITE_CLERK_PUBLISHABLE_KEY",
    hint: "Clerk dev publishable key (pk_test_…)",
  },
];

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...process.env, ...loadEnvFile(envPath) };
const missing = [];
const warnings = [];

for (const { key, hint } of required) {
  const value = env[key];
  if (!value || value.includes("your-") || value.includes("...")) {
    missing.push({ key, hint });
  }
}

if (env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
  warnings.push("VITE_CLERK_PUBLISHABLE_KEY is pk_live_ — use pk_test_ for Phase 1 dev");
}

if (missing.length > 0) {
  console.error("Phase 1 env check failed.\n");
  if (!existsSync(envPath)) {
    console.error(`Missing .env file. Copy from .env.example:\n  cp .env.example .env\n`);
  }
  for (const { key, hint } of missing) {
    console.error(`  ✗ ${key} — ${hint}`);
  }
  console.error("\nAlso set on your Convex *dev* deployment (Dashboard → Settings → Environment Variables):");
  console.error("  CLERK_JWT_ISSUER_DOMAIN=https://<app>.clerk.accounts.dev");
  console.error("  MIGRATION_DEV_TOOLS_ENABLED=true   (dev only — never on production)");
  process.exit(1);
}

console.log("Phase 1 env check passed.");
for (const { key } of required) {
  const value = env[key];
  const masked =
    key.includes("KEY") && value.length > 12
      ? `${value.slice(0, 8)}…${value.slice(-4)}`
      : value;
  console.log(`  ✓ ${key}=${masked}`);
}

for (const warning of warnings) {
  console.warn(`  ⚠ ${warning}`);
}

console.log("\nNext steps:");
console.log("  1. npx convex dev          # terminal 1 — dev deployment only");
console.log("  2. npm run dev             # terminal 2");
console.log("  3. npm run phase1:seed     # seed staff rows on dev (requires dev tools env)");
