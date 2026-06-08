#!/usr/bin/env node
/**
 * Capture Phase 3B production baseline for future comparison.
 *
 * Usage:
 *   node scripts/capture-phase-3b-baseline.mjs --prod
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "scripts", ".phase3b-validation");
mkdirSync(outDir, { recursive: true });

const useProd = process.argv.includes("--prod");
const deploymentLabel = useProd ? "production" : "dev";

function convexRun(functionPath, args = null) {
  const cmd = [
    "convex",
    "run",
    ...(useProd ? ["--prod"] : []),
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
  return text ? JSON.parse(text) : null;
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

async function capturePopulationAndTopFive() {
  const population = emptyPopulationBreakdown();
  const topFiveMismatches = [];
  let cursor = null;
  let totalTableRows = 0;

  while (true) {
    const page = convexRun("validation/phase3b:capturePhase3bSnapshotPage", {
      cursor,
      includeTierEval: true,
    });
    totalTableRows += page.processed;
    mergePopulationBreakdown(population, page);
    topFiveMismatches.push(...page.topFiveMismatches);

    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  return {
    totalPlayerRows: totalTableRows,
    acceptedMembers: population.byMembership.accepted ?? 0,
    playersWithYuniteMatchData: population.withMatchData,
    populationBreakdown: population,
    topFiveMismatchCount: topFiveMismatches.length,
    topFiveMismatches: topFiveMismatches.slice(0, 25),
  };
}

async function main() {
  console.log(`Capturing Phase 3B baseline on ${deploymentLabel}…`);

  const population = await capturePopulationAndTopFive();
  const aggregateStats = convexRun("validation/phase3b:getAggregateStatsSnapshot");
  const evaluationStatuses = convexRun(
    "validation/phase3b:getEvaluationStatusDistribution",
  );
  const pipelineVersions = convexRun(
    "validation/phase3b:getPipelineVersionSnapshot",
  );

  const baseline = {
    title: "Phase 3B Production Baseline",
    capturedAt: new Date().toISOString(),
    capturedAtMs: Date.now(),
    deployment: deploymentLabel,
    sourcesOfTruth: {
      eventsPlayed: "syncInternalEventParticipation → players.eventsPlayedCount",
      holistic: "convex/lib/stats/holisticScore.ts",
      evaluationStatuses: "tierReEvaluationCache (rebuild)",
      topFive: "players.topFiveCache",
      tc: "calculateAndStoreCSInternal",
      populationAverages: "aggregateStatsCache via computeInternalPlayerStats",
      eventResults: "thirdPartyResults + computeEventLeaderboards()",
    },
    population: {
      acceptedMembers: population.acceptedMembers,
      totalPlayerRows: population.totalPlayerRows,
      playersWithYuniteMatchData: population.playersWithYuniteMatchData,
      aggregatePoolSize: aggregateStats?.playerCount ?? null,
      tierEvalPoolSize: evaluationStatuses.tierEvalPoolSize,
      breakdown: population.populationBreakdown,
    },
    aggregateStatistics: aggregateStats
      ? {
          avgTotalEvents: aggregateStats.avgTotalEvents,
          avgTotalEliminations: aggregateStats.avgTotalEliminations,
          avgAveragePlacement: aggregateStats.avgAveragePlacement,
          avgAverageKD: aggregateStats.avgAverageKD,
          avgAverageScore: aggregateStats.avgAverageScore,
          avgWinRate: aggregateStats.avgWinRate,
          avgTop3Finishes: aggregateStats.avgTop3Finishes,
          lastUpdated: aggregateStats.lastUpdated,
        }
      : null,
    evaluationStatusDistribution: evaluationStatuses.distribution,
    topFiveValidation: {
      mismatchCount: population.topFiveMismatchCount,
      expected: 0,
      mismatches: population.topFiveMismatches,
    },
    versions: {
      aggregateStatsCacheFormulaVersion: aggregateStats?.formulaVersion ?? null,
      tierEvaluationFormulaVersion: evaluationStatuses.formulaVersion,
      tierEvaluationFormulaVersionCounts:
        evaluationStatuses.formulaVersionCounts,
      pipelineVersion: pipelineVersions.pipelineVersion,
      latestCompletedRebuildJobId: pipelineVersions.latestCompletedRebuildJobId,
      latestCompletedRebuildAt: pipelineVersions.latestCompletedRebuildAt,
      /** Code constants in convex/lib/stats/versions.ts (authoritative for new rebuilds). */
      codeFormulaVersion: 1,
      codePipelineVersion: 1,
    },
  };

  const jsonPath = resolve(outDir, "phase-3b-production-baseline.json");
  writeFileSync(jsonPath, JSON.stringify(baseline, null, 2));

  const mdPath = resolve(outDir, "phase-3b-production-baseline.md");
  writeFileSync(
    mdPath,
    `# Phase 3B Production Baseline

Captured: ${baseline.capturedAt} (${deploymentLabel})

## Population

| Metric | Value |
|--------|------:|
| Accepted members | ${baseline.population.acceptedMembers} |
| Total player rows | ${baseline.population.totalPlayerRows} |
| Players with Yunite match data | ${baseline.population.playersWithYuniteMatchData} |
| Aggregate pool size | ${baseline.population.aggregatePoolSize} |
| Tier-eval pool size | ${baseline.population.tierEvalPoolSize} |

## Aggregate statistics

| Metric | Value |
|--------|------:|
| avgTotalEvents | ${baseline.aggregateStatistics?.avgTotalEvents ?? "n/a"} |
| avgTotalEliminations | ${baseline.aggregateStatistics?.avgTotalEliminations ?? "n/a"} |
| avgAveragePlacement | ${baseline.aggregateStatistics?.avgAveragePlacement ?? "n/a"} |
| avgAverageKD | ${baseline.aggregateStatistics?.avgAverageKD ?? "n/a"} |
| avgAverageScore | ${baseline.aggregateStatistics?.avgAverageScore ?? "n/a"} |
| avgWinRate | ${baseline.aggregateStatistics?.avgWinRate ?? "n/a"} |
| avgTop3Finishes | ${baseline.aggregateStatistics?.avgTop3Finishes ?? "n/a"} |

## Evaluation status distribution

${Object.entries(baseline.evaluationStatusDistribution)
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join("\n")}

## Top 5 validation

- Mismatch count: **${baseline.topFiveValidation.mismatchCount}** (expected: 0)

## Versions

- aggregateStatsCache.formulaVersion: **${baseline.versions.aggregateStatsCacheFormulaVersion}**
- tier-evaluation formulaVersion: **${baseline.versions.tierEvaluationFormulaVersion}**
- pipelineVersion: **${baseline.versions.pipelineVersion}**
`,
  );

  console.log(`Baseline saved:\n  ${jsonPath}\n  ${mdPath}`);
  console.log(JSON.stringify(baseline, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
