#!/usr/bin/env node
/**
 * Phase 3B validation: snapshot → rebuild → snapshot → report.
 *
 * Usage:
 *   node scripts/validate-phase-3b.mjs          # dev deployment
 *   node scripts/validate-phase-3b.mjs --prod   # production deployment
 *   node scripts/validate-phase-3b.mjs --prod --snapshot-only   # population + caches only
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "scripts", ".phase3b-validation");
mkdirSync(outDir, { recursive: true });

const useProd = process.argv.includes("--prod");
const skipDeploy = process.argv.includes("--skip-deploy");
const snapshotOnly = process.argv.includes("--snapshot-only");
const deploymentLabel = useProd ? "production" : "dev";

function convexRun(functionPath, args = null, { push = false } = {}) {
  const cmd = [
    "convex",
    "run",
    ...(useProd ? ["--prod"] : []),
    ...(push ? ["--push"] : []),
    functionPath,
  ];
  if (args != null) {
    cmd.push(JSON.stringify(args));
  }

  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npx", ...cmd], {
          cwd: root,
          encoding: "utf8",
          windowsHide: true,
        })
      : spawnSync("npx", cmd, { cwd: root, encoding: "utf8" });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`convex run failed: ${functionPath}`);
  }

  const text = (result.stdout || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function emptyPopulationBreakdown() {
  return {
    byStatus: {},
    byMembership: {},
    withTier: 0,
    withMatchData: 0,
  };
}

function mergePopulationBreakdown(target, page) {
  const breakdown = page.populationBreakdown;
  if (!breakdown) return;

  for (const [key, count] of Object.entries(breakdown.byStatus ?? {})) {
    target.byStatus[key] = (target.byStatus[key] ?? 0) + count;
  }
  for (const [key, count] of Object.entries(breakdown.byMembership ?? {})) {
    target.byMembership[key] = (target.byMembership[key] ?? 0) + count;
  }
  target.withTier += breakdown.withTier ?? 0;
  target.withMatchData += breakdown.withMatchData ?? 0;
}

function formatCountMap(map) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}

function formatPopulationSummary(snapshot) {
  const b = snapshot.population ?? emptyPopulationBreakdown();
  const accepted = b.byMembership.accepted ?? 0;
  const aggregatePool = snapshot.aggregateStats?.playerCount ?? "n/a";
  const lines = [
    `- Accepted members: ${accepted}`,
    `- With tier assigned: ${b.withTier}`,
    `- With Yunite match data: ${b.withMatchData}`,
    `- Aggregate stats pool (cached): ${aggregatePool}`,
    `- Total players table rows scanned: ${snapshot.totalTableRows}`,
    `- By status: ${formatCountMap(b.byStatus)}`,
    `- By membership: ${formatCountMap(b.byMembership)}`,
  ];
  return lines.join("\n");
}

async function deployIfProd() {
  if (!useProd || skipDeploy) return;
  console.log("Deploying Phase 3B + validation module to production…");
  const result = spawnSync("npx convex deploy --yes", {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("convex deploy failed");
  }
}

async function captureFullSnapshot({ includeTierEval = false } = {}) {
  const eventsPlayedMismatches = [];
  const topFiveMismatches = [];
  const population = emptyPopulationBreakdown();
  let cursor = null;
  let totalTableRows = 0;

  while (true) {
    const page = convexRun("validation/phase3b:capturePhase3bSnapshotPage", {
      cursor,
      includeTierEval,
    });
    totalTableRows += page.processed;
    mergePopulationBreakdown(population, page);
    eventsPlayedMismatches.push(...page.eventsPlayedRows);
    topFiveMismatches.push(...page.topFiveMismatches);

    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  const aggregateStats = convexRun(
    "validation/phase3b:getAggregateStatsSnapshot",
  );
  const tierEval = includeTierEval
    ? convexRun("validation/phase3b:getTierEvalStatusSnapshot")
    : {
        tierEvalCount: 0,
        tierEvalStatuses: [],
        missingRecentStatusCount: 0,
        missingStatusRawCount: 0,
        missingRecentStatusExamples: [],
      };

  return {
    capturedAt: Date.now(),
    totalTableRows,
    /** @deprecated Use totalTableRows + population breakdown instead. */
    playerCount: totalTableRows,
    population,
    aggregateStats,
    eventsPlayed: {
      mismatchCount: eventsPlayedMismatches.length,
      increases: eventsPlayedMismatches
        .filter((r) => r.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 15),
      decreases: eventsPlayedMismatches
        .filter((r) => r.delta < 0)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 15),
      allMismatches: eventsPlayedMismatches,
    },
    tierEvalCount: tierEval.tierEvalCount,
    tierEvalStatuses: tierEval.tierEvalStatuses,
    topFiveMismatchCount: topFiveMismatches.length,
    topFiveMismatches: topFiveMismatches.slice(0, 25),
    missingRecentStatusCount: tierEval.missingRecentStatusCount,
    missingStatusRawCount: tierEval.missingStatusRawCount,
    missingRecentStatusExamples: tierEval.missingRecentStatusExamples,
  };
}

function compareStatuses(before, after) {
  const beforeMap = new Map(
    before.tierEvalStatuses.map((r) => [r.playerId, r]),
  );
  const movements = {};
  const changes = [];

  for (const row of after.tierEvalStatuses) {
    const prev = beforeMap.get(row.playerId);
    if (!prev) continue;
    const from = prev.evaluationStatus;
    const to = row.evaluationStatus;
    if (from !== to) {
      const key = `${from} → ${to}`;
      movements[key] = (movements[key] ?? 0) + 1;
      changes.push({
        discordUsername: row.discordUsername,
        from,
        to,
        recentFrom: prev.recentEvaluationStatus,
        recentTo: row.recentEvaluationStatus,
      });
    }
  }

  changes.sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));

  return {
    changedCount: changes.length,
    movements,
    examples: changes.slice(0, 25),
  };
}

function compareAggregate(before, after) {
  const b = before.aggregateStats;
  const a = after.aggregateStats;
  if (!b || !a) {
    return { error: "Missing aggregate cache before or after rebuild" };
  }

  const fields = [
    "avgTotalEvents",
    "avgWinRate",
    "avgAveragePlacement",
    "avgAverageKD",
    "avgTotalEliminations",
    "avgAverageScore",
    "avgTop3Finishes",
    "playerCount",
  ];

  const deltas = {};
  for (const field of fields) {
    const oldVal = b[field];
    const newVal = a[field];
    deltas[field] = {
      before: oldVal,
      after: newVal,
      delta: newVal - oldVal,
      pct:
        oldVal !== 0
          ? Math.round(((newVal - oldVal) / oldVal) * 1000) / 10
          : null,
    };
  }

  return deltas;
}

function printReport({
  before,
  after,
  rebuild,
  eventsBefore,
  eventsAfter,
  statusCompare,
  aggregateCompare,
}) {
  console.log("\n" + "=".repeat(72));
  console.log(`PHASE 3B VALIDATION REPORT (${deploymentLabel})`);
  console.log("=".repeat(72));

  console.log("\n## 1. Rebuild summary");
  console.log(`- Deployment: ${deploymentLabel}`);
  console.log(`- Started job: ${rebuild.jobId ?? "n/a"}`);
  console.log(`- Final status: ${rebuild.finalStatus}`);
  console.log(`- Final phase: ${rebuild.finalPhase ?? "n/a"}`);
  console.log(`- Total processed: ${rebuild.totalProcessed ?? "n/a"}`);
  if (rebuild.errorMessage) {
    console.log(`- Error: ${rebuild.errorMessage}`);
  }
  console.log(
    "- Phases: event_participation → contribution_score → dca → dca_mutual → top_five → tier_eval → aggregate_stats",
  );
  console.log(
    "- Extra phases rationale: top_five feeds tier-eval cache; TC/DCA caches feed holistic in tier_eval.",
  );

  console.log("\n## 2. Player population (before snapshot)");
  console.log(formatPopulationSummary(before));

  console.log("\n## 3. Events Played");
  console.log(
    `- Rows scanned (full players table): ${before.totalTableRows ?? before.playerCount}`,
  );
  console.log(`- Before rebuild mismatches (stored vs Yunite imports): ${eventsBefore.mismatchCount}`);
  console.log(`- After rebuild mismatches: ${eventsAfter.mismatchCount}`);
  if (eventsBefore.increases.length) {
    console.log("- Largest increases before rebuild:");
    for (const r of eventsBefore.increases.slice(0, 8)) {
      console.log(`  • ${r.discordUsername}: ${r.stored} → ${r.expected} (+${r.delta})`);
    }
  }
  if (eventsBefore.decreases.length) {
    console.log("- Largest decreases before rebuild:");
    for (const r of eventsBefore.decreases.slice(0, 8)) {
      console.log(`  • ${r.discordUsername}: ${r.stored} → ${r.expected} (${r.delta})`);
    }
  }
  console.log(
    `- Canonical definition verified after rebuild: ${eventsAfter.mismatchCount === 0 ? "YES" : "NO"}`,
  );

  console.log("\n## 4. Evaluation statuses");
  console.log(`- Tier eval rows before: ${before.tierEvalCount}`);
  console.log(`- Tier eval rows after: ${after.tierEvalCount}`);
  console.log(`- Players with changed all-time status: ${statusCompare.changedCount}`);
  const movementEntries = Object.entries(statusCompare.movements).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [movement, count] of movementEntries.slice(0, 12)) {
    console.log(`  • ${movement}: ${count}`);
  }
  if (statusCompare.examples.length) {
    console.log("- Examples:");
    for (const ex of statusCompare.examples.slice(0, 10)) {
      console.log(`  • ${ex.discordUsername}: ${ex.from} → ${ex.to}`);
    }
  }
  console.log(`- Missing recentEvaluationStatus after rebuild: ${after.missingRecentStatusCount}`);
  console.log(`- Missing evaluationStatusRaw after rebuild: ${after.missingStatusRawCount}`);

  console.log("\n## 5. Population averages");
  if (aggregateCompare.error) {
    console.log(`- ${aggregateCompare.error}`);
  } else {
    for (const [field, d] of Object.entries(aggregateCompare)) {
      const pct = d.pct != null ? ` (${d.pct}%)` : "";
      console.log(`- ${field}: ${d.before} → ${d.after} (Δ ${d.delta}${pct})`);
    }
  }

  console.log("\n## 6. Top 5 consistency");
  console.log(`- player.topFiveCache vs tierReEvaluationCache mismatches: ${after.topFiveMismatchCount}`);

  console.log("\n## 7. Holistic / client derivation (code audit)");
  console.log("- Holistic math: convex/lib/stats/holisticScore.ts");
  console.log("- Status derivation: convex/lib/stats/evaluationStatus.ts at rebuild time");
  console.log("- UI reads cached statuses (tier-re-evaluation.tsx, tcdc-holistic-view.ts)");

  console.log("\n## 8. Regression checks");
  const regressions = [];
  if (eventsAfter.mismatchCount > 0) regressions.push("Events played mismatches remain");
  if (after.missingRecentStatusCount > 0) regressions.push("Missing recent evaluation statuses");
  if (after.topFiveMismatchCount > 0) regressions.push("Top 5 cache mismatch between stores");
  if (rebuild.finalStatus === "failed") regressions.push("Rebuild failed");
  if (!after.aggregateStats) regressions.push("Aggregate cache empty after rebuild");
  const acceptedBefore = before.population?.byMembership?.accepted ?? 0;
  if (after.tierEvalCount === 0 && acceptedBefore > 0) {
    regressions.push("Tier eval cache empty after rebuild");
  }

  if (regressions.length === 0) {
    console.log("- No regressions detected.");
  } else {
    for (const r of regressions) console.log(`- ⚠ ${r}`);
  }

  console.log("\n## 9. Player population (after snapshot)");
  console.log(formatPopulationSummary(after));

  console.log("\n" + "=".repeat(72));
}

async function printSnapshotOnly(snapshot, label) {
  console.log("\n" + "=".repeat(72));
  console.log(`PHASE 3B SNAPSHOT (${deploymentLabel}) — ${label}`);
  console.log("=".repeat(72));
  console.log("\n## Player population");
  console.log(formatPopulationSummary(snapshot));
  console.log(`\n- Events-played mismatches: ${snapshot.eventsPlayed.mismatchCount}`);
  console.log(`- Tier eval cache rows: ${snapshot.tierEvalCount}`);
  console.log(`- Top 5 cache mismatches: ${snapshot.topFiveMismatchCount}`);
  console.log(`- Missing recent statuses: ${snapshot.missingRecentStatusCount}`);
  console.log("=".repeat(72));
}

async function main() {
  await deployIfProd();

  if (snapshotOnly) {
    console.log(`Phase 3B snapshot (${deploymentLabel})…`);
    const snapshot = await captureFullSnapshot({ includeTierEval: true });
    writeFileSync(
      resolve(outDir, `snapshot-${deploymentLabel}.json`),
      JSON.stringify(snapshot, null, 2),
    );
    const accepted = snapshot.population?.byMembership?.accepted ?? 0;
    console.log(
      `Snapshot: ${accepted} accepted members (${snapshot.totalTableRows} table rows), ${snapshot.tierEvalCount} tier-eval rows`,
    );
    await printSnapshotOnly(snapshot, "current");
    console.log(`\nArtifacts: ${outDir}`);
    return;
  }

  console.log(
    `Phase 3B validation (${deploymentLabel}) — capturing BEFORE snapshot…`,
  );

  const before = await captureFullSnapshot({ includeTierEval: true });
  writeFileSync(resolve(outDir, `before-${deploymentLabel}.json`), JSON.stringify(before, null, 2));
  const accepted = before.population?.byMembership?.accepted ?? 0;
  console.log(
    `Before: ${accepted} accepted members (${before.totalTableRows ?? before.playerCount} table rows), ${before.tierEvalCount} tier-eval rows, ${before.eventsPlayed.mismatchCount} events-played mismatches`,
  );

  const existing = convexRun("validation/phase3b:getRebuildJobStatusInternal");
  if (existing?.status === "running") {
    throw new Error("A rebuild is already running. Cancel it before validation.");
  }

  console.log("\nStarting rebuild through aggregate_stats…");
  const start = convexRun("playerStatsRebuild:scheduleFullRebuild", {
    stopAfterPhase: "aggregate_stats",
  });
  console.log(`Job started: ${start.jobId} — ${start.message}`);

  let finalStatus = null;
  const deadline = Date.now() + 3 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(15000);
    const status = convexRun("validation/phase3b:getRebuildJobStatusInternal");
    const ts = new Date().toISOString().slice(11, 19);
    if (status.status === "running") {
      console.log(
        `[${ts}] phase=${status.phase} totalProcessed=${status.totalProcessed} inPhase=${status.processedInPhase}`,
      );
      continue;
    }
    finalStatus = status;
    console.log(`[${ts}] Rebuild finished: ${status.status}`);
    break;
  }

  if (!finalStatus || finalStatus.status === "running") {
    throw new Error("Rebuild did not complete within 3 hours");
  }

  console.log("\nCapturing AFTER snapshot…");
  const after = await captureFullSnapshot({ includeTierEval: true });
  writeFileSync(resolve(outDir, `after-${deploymentLabel}.json`), JSON.stringify(after, null, 2));

  const statusCompare = compareStatuses(before, after);
  const aggregateCompare = compareAggregate(before, after);

  const report = {
    deployment: deploymentLabel,
    beforeCapturedAt: before.capturedAt,
    afterCapturedAt: after.capturedAt,
    totalTableRowsBefore: before.totalTableRows ?? before.playerCount,
    totalTableRowsAfter: after.totalTableRows ?? after.playerCount,
    population: after.population,
    populationBefore: before.population,
    populationAfter: after.population,
    rebuild: {
      jobId: start.jobId,
      finalStatus: finalStatus.status,
      finalPhase: finalStatus.phase,
      totalProcessed: finalStatus.totalProcessed,
      errorMessage: finalStatus.errorMessage,
    },
    eventsPlayed: {
      beforeMismatchCount: before.eventsPlayed.mismatchCount,
      afterMismatchCount: after.eventsPlayed.mismatchCount,
    },
    statusCompare,
    aggregateCompare,
    topFiveMismatchCount: after.topFiveMismatchCount,
    missingRecentStatusCount: after.missingRecentStatusCount,
    missingStatusRawCount: after.missingStatusRawCount,
  };
  writeFileSync(
    resolve(outDir, `report-${deploymentLabel}.json`),
    JSON.stringify(report, null, 2),
  );

  printReport({
    before,
    after,
    rebuild: report.rebuild,
    eventsBefore: before.eventsPlayed,
    eventsAfter: after.eventsPlayed,
    statusCompare,
    aggregateCompare,
  });

  console.log(`\nArtifacts: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
