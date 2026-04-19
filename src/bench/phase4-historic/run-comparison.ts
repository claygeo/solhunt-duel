#!/usr/bin/env node
/**
 * Phase 4 driver — fetch the actual patch the protocol shipped after the
 * historic exploit, diff Blue's patch against it, emit a PatchComparison JSON
 * to stdout + data/historic-comparisons/{contractName}.json.
 *
 * Usage:
 *   BLUE_VIA_CLAUDE_CLI=1 \
 *     npx tsx src/bench/phase4-historic/run-comparison.ts \
 *       --contract Dexible \
 *       --blue-patch-path /tmp/harness/patched/src/Dexible.sol
 *
 * Flags:
 *   --contract <Name>        Dataset entry name (required)
 *   --blue-patch-path <path> Path to Blue's patched .sol (default: Phase 0's
 *                            hand-written DexiblePatched.sol for Dexible as
 *                            a smoke-test fallback)
 *   --original-path <path>   Path to the vulnerable original (default: Phase 0's
 *                            Dexible.sol)
 *
 * No external API keys required unless you want Tier-3 Etherscan fallback
 * (set ETHERSCAN_API_KEY). Subscription Claude provides the summary ($0).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

import type { DatasetEntry } from "../../duel/orchestrator.js";
import { fetchHistoricPatch } from "../../historic/fetcher.js";
import { compareToHistoric } from "../../historic/differ.js";

loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const DATASET_PATH = resolve(REPO_ROOT, "benchmark/dataset.json");
const PHASE0_DIR = resolve(REPO_ROOT, "src/bench/phase0-dexible");
const OUTPUT_DIR = resolve(REPO_ROOT, "data/historic-comparisons");

interface CliArgs {
  contract: string;
  bluePatchPath?: string;
  originalPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { contract: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--contract") out.contract = argv[++i];
    else if (arg === "--blue-patch-path") out.bluePatchPath = argv[++i];
    else if (arg === "--original-path") out.originalPath = argv[++i];
  }
  return out;
}

function loadDatasetEntry(name: string): DatasetEntry {
  const raw = readFileSync(DATASET_PATH, "utf-8");
  const arr = JSON.parse(raw) as DatasetEntry[];
  const match = arr.find(
    (e) => e.name?.toLowerCase() === name.toLowerCase() || e.id === name
  );
  if (!match) {
    throw new Error(
      `Contract '${name}' not found in dataset. First few: ${arr
        .map((e) => e.name)
        .slice(0, 10)
        .join(", ")}`
    );
  }
  return match;
}

function resolveSourcePaths(
  args: CliArgs,
  entry: DatasetEntry
): { originalSource: string; bluePatch: string; bluePath: string; origPath: string } {
  // Original (vulnerable) source
  let origPath = args.originalPath;
  if (!origPath) {
    if (entry.name === "Dexible") {
      origPath = resolve(PHASE0_DIR, "src/Dexible.sol");
    } else {
      const alt = resolve(REPO_ROOT, `src/bench/phase2-duel/sources/${entry.name}.sol`);
      if (existsSync(alt)) origPath = alt;
    }
  }
  if (!origPath || !existsSync(origPath)) {
    throw new Error(
      `No original source found. Pass --original-path or seed it under src/bench/phase2-duel/sources/${entry.name}.sol`
    );
  }

  // Blue's patch
  let bluePath = args.bluePatchPath;
  if (!bluePath) {
    // Smoke-test fallback: use Phase 0's hand-written DexiblePatched.sol for Dexible.
    if (entry.name === "Dexible") {
      bluePath = resolve(PHASE0_DIR, "src/DexiblePatched.sol");
    }
  }
  if (!bluePath || !existsSync(bluePath)) {
    throw new Error(
      `No Blue patch source found. Pass --blue-patch-path pointing at the .sol file Blue produced.`
    );
  }

  return {
    originalSource: readFileSync(origPath, "utf-8"),
    bluePatch: readFileSync(bluePath, "utf-8"),
    bluePath,
    origPath,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.contract) {
    console.error("ERROR: --contract <Name> is required");
    return 1;
  }

  const entry = loadDatasetEntry(args.contract);
  console.log("=".repeat(66));
  console.log(`solhunt-duel Phase 4 — historic-patch comparison: ${entry.name}`);
  console.log("=".repeat(66));
  console.log(`Contract:      ${entry.name} @ ${entry.contractAddress}`);
  console.log(`Vuln class:    ${entry.vulnerabilityClass}`);
  console.log(`Ref exploit:   ${entry.referenceExploit ?? "(none)"}`);
  console.log();

  const { originalSource, bluePatch, bluePath, origPath } = resolveSourcePaths(args, entry);
  console.log(`Original src:  ${origPath}`);
  console.log(`Blue patch:    ${bluePath}`);
  console.log();

  console.log("[1/2] Fetching historic patch (tier waterfall)...");
  const t0 = Date.now();
  const historic = await fetchHistoricPatch(entry);
  console.log(
    `      source=${historic.source} url=${historic.sourceUrl || "(none)"} ` +
      `hasFullSource=${!!historic.patchedSource} hasFunctionOnly=${!!historic.patchedFunction}`
  );
  if (historic.patchCommitHash) console.log(`      commit=${historic.patchCommitHash}`);
  if (historic.notes) console.log(`      notes=${historic.notes.slice(0, 200)}`);

  console.log("\n[2/2] Comparing Blue's patch to historic (diff + LLM summary)...");
  const comparison = await compareToHistoric({
    contractName: entry.name,
    originalSource,
    bluePatch,
    historicPatch: historic,
  });
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

  // Output dir is under repo root (gitignored via data/ convention used elsewhere).
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = resolve(OUTPUT_DIR, `${entry.name}.json`);
  writeFileSync(outPath, JSON.stringify(comparison, null, 2));

  console.log("\n" + "=".repeat(66));
  console.log(`Wrote: ${outPath}`);
  console.log(`Wall time: ${totalSec}s`);
  console.log("=".repeat(66));
  console.log(JSON.stringify(comparison, null, 2));
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
