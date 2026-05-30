#!/usr/bin/env node
/**
 * Runs Phase 1 dev seed mutations against the configured Convex dev deployment.
 * Requires MIGRATION_DEV_TOOLS_ENABLED=true on that deployment.
 *
 * Usage: npm run phase1:seed
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function runConvex(functionPath, label) {
  console.log(`\n→ ${label}`);
  const result = spawnSync(
    "npx",
    ["convex", "run", functionPath],
    { cwd: root, stdio: "inherit", shell: true },
  );
  if (result.status !== 0) {
    console.error(`\nFailed: ${label}`);
    console.error(
      "Ensure npx convex dev is configured for a DEV deployment and MIGRATION_DEV_TOOLS_ENABLED=true is set:",
    );
    console.error("  npx convex env set MIGRATION_DEV_TOOLS_ENABLED true");
    process.exit(result.status ?? 1);
  }
}

console.log("Phase 1 dev seed — dev deployment only. Production must not be targeted.");

runConvex("migrationDevTools:seedDevStaffUsers", "Seed six staff user rows (idempotent)");
runConvex("migrationDevTools:getMigrationLinkStatus", "Print migration link status");

console.log("\nDone. Pre-seed Discord ids with:");
console.log("  npx convex run migrationDevTools:devSetDiscordLink '{\"userId\":\"...\",\"discordUserId\":\"...\"}'");
console.log("Or use api.users.setDiscordLink after bootstrap admin is linked.");
