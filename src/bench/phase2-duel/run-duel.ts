#!/usr/bin/env node
/**
 * Phase 2 driver — runs one multi-round Red↔Blue duel against a chosen
 * benchmark contract. Defaults to Dexible, which has proven Red/Blue
 * artifacts in Phase 0/1.
 *
 * Usage:
 *   BLUE_VIA_CLAUDE_CLI=1 BENIGN_VIA_CLAUDE_CLI=1 \
 *     npx tsx src/bench/phase2-duel/run-duel.ts --contract Dexible --rounds 3
 *
 * Required env:
 *   ETH_RPC_URL             — forked mainnet endpoint
 *   OPENROUTER_API_KEY  | ANTHROPIC_API_KEY | SOLHUNT_PROVIDER + key
 *
 * Optional env:
 *   SUPABASE_URL + SUPABASE_SERVICE_KEY  — turn on persistence
 *   RED_MODEL                            — override Red's scan model
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

import { runDuel, type DatasetEntry } from "../../duel/orchestrator.js";
import { getClient, isEnabled as isStorageEnabled } from "../../storage/supabase.js";

loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const DATASET_PATH = resolve(REPO_ROOT, "benchmark/dataset.json");
const PHASE0_DIR = resolve(REPO_ROOT, "src/bench/phase0-dexible");

interface CliArgs {
  contract: string;
  rounds: number;
  split: "train" | "holdout" | "adversarial";
  redViaClaudeCli: boolean;
  redeployFrom?: string;
  /** Optional override: directory containing real Etherscan-extracted source.
   *  When set, the orchestrator loads ALL .sol files under this dir
   *  (relative paths preserved) instead of falling back to the Phase 0 mock. */
  sourceDir?: string;
  /** Optional override: name of the contract Red attacks / Blue patches
   *  (e.g. "DexibleProxy"). Defaults to --contract value (e.g. "Dexible").
   *  Required when the target file basename differs from the dataset name
   *  (e.g. real Dexible source's main contract is in DexibleProxy.sol). */
  contractName?: string;
  /** Optional: relative path (within --source-dir) of the file containing
   *  the target contract. Auto-detected by scanning for `contract <name>` if
   *  not provided. */
  targetFile?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    contract: "Dexible",
    rounds: 3,
    split: "train",
    redViaClaudeCli: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--contract") out.contract = argv[++i];
    else if (arg === "--rounds") out.rounds = parseInt(argv[++i], 10);
    else if (arg === "--split") out.split = argv[++i] as CliArgs["split"];
    else if (arg === "--red-via-claude-cli") out.redViaClaudeCli = true;
    else if (arg === "--redeploy-from") out.redeployFrom = argv[++i];
    else if (arg === "--source-dir") out.sourceDir = argv[++i];
    else if (arg === "--contract-name") out.contractName = argv[++i];
    else if (arg === "--target-file") out.targetFile = argv[++i];
  }
  // Env var fallback for source dir — keeps the documented incantation usable
  // without flag plumbing.
  if (!out.sourceDir && process.env.SOLHUNT_SOURCE_DIR) {
    out.sourceDir = process.env.SOLHUNT_SOURCE_DIR;
  }
  if (!out.contractName && process.env.SOLHUNT_CONTRACT_NAME) {
    out.contractName = process.env.SOLHUNT_CONTRACT_NAME;
  }
  if (!Number.isInteger(out.rounds) || out.rounds < 1) out.rounds = 3;
  // Env var fallback to mirror Blue's behaviour: RED_VIA_CLAUDE_CLI=1 also
  // flips the flag, so the dispatch's example incantation works without the
  // flag too.
  if (
    process.env.RED_VIA_CLAUDE_CLI === "1" ||
    process.env.RED_VIA_CLAUDE_CLI === "true"
  ) {
    out.redViaClaudeCli = true;
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
      `Contract '${name}' not found in dataset. Available names: ${arr
        .map((e) => e.name)
        .slice(0, 10)
        .join(", ")}...`
    );
  }
  return match;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const rpcUrl = process.env.ETH_RPC_URL;
  if (!rpcUrl) {
    console.error("ERROR: ETH_RPC_URL must be set in env");
    return 1;
  }

  const entry = loadDatasetEntry(args.contract);
  console.log("=".repeat(66));
  console.log(`solhunt-duel Phase 2 — Red↔Blue duel on ${entry.name}`);
  console.log("=".repeat(66));
  console.log(`Contract:      ${entry.name} @ ${entry.contractAddress}`);
  console.log(`Chain / Block: ${entry.chain} / ${entry.blockNumber}`);
  console.log(`Vuln class:    ${entry.vulnerabilityClass}`);
  console.log(`Max rounds:    ${args.rounds}`);
  console.log(`Split:         ${args.split}`);
  console.log(
    `Blue via CLI:  ${process.env.BLUE_VIA_CLAUDE_CLI === "1" ? "YES (Max subscription)" : "NO (OpenRouter)"}`
  );
  console.log(
    `Red via CLI:   ${args.redViaClaudeCli ? "YES (Max subscription)" : "NO (OpenRouter)"}`
  );
  if (args.redeployFrom) {
    console.log(`Redeploy from: ${args.redeployFrom} (orchestrator clones to a deterministic fresh address before round 0; rounds N≥2 anvil_setCode the patched bytecode there)`);
  }
  console.log(
    `Supabase:      ${isStorageEnabled() ? "ENABLED" : "disabled (no SUPABASE_URL)"}`
  );
  console.log();

  // Source resolution priority:
  //   1. --source-dir (real Etherscan-extracted multi-file tree). Preserves
  //      relative paths so solc imports resolve. Auto-derives remappings.
  //   2. Dexible-only Phase 0 mock (regression backstop).
  //   3. Per-contract single-file fallback under src/bench/phase2-duel/sources/.
  let sourceFiles: { filename: string; content: string }[];
  let targetFilename: string;
  let targetContractName: string | undefined = args.contractName;
  let remappings: string[] | undefined;

  if (args.sourceDir) {
    const sourceDir = resolve(args.sourceDir);
    if (!existsSync(sourceDir)) {
      console.error(`ERROR: --source-dir ${sourceDir} does not exist.`);
      return 1;
    }
    const collected = collectSolFiles(sourceDir);
    if (collected.length === 0) {
      console.error(`ERROR: --source-dir ${sourceDir} contains no .sol files.`);
      return 1;
    }
    sourceFiles = collected;
    const contractName = targetContractName ?? entry.name;
    if (args.targetFile) {
      const match = sourceFiles.find((f) => f.filename === args.targetFile);
      if (!match) {
        console.error(
          `ERROR: --target-file ${args.targetFile} not found among collected sources. Available: ${sourceFiles
            .map((f) => f.filename)
            .slice(0, 5)
            .join(", ")}...`
        );
        return 1;
      }
      targetFilename = match.filename;
    } else {
      const auto = sourceFiles.find((f) =>
        new RegExp(`(^|\\s)contract\\s+${contractName}\\b`).test(f.content)
      );
      if (!auto) {
        console.error(
          `ERROR: could not locate file containing 'contract ${contractName}' in ${sourceDir}. ` +
            `Pass --target-file <relative/path.sol> explicitly.`
        );
        return 1;
      }
      targetFilename = auto.filename;
    }
    targetContractName = contractName;
    remappings = deriveRemappings(sourceFiles);
    console.log(
      `Source dir:    ${sourceDir} (${sourceFiles.length} .sol files)`
    );
    console.log(`Target file:   ${targetFilename}`);
    console.log(`Contract:      ${targetContractName}`);
    if (remappings && remappings.length) {
      console.log(`Remappings:    ${remappings.join(", ")}`);
    }
  } else if (entry.name === "Dexible") {
    const dexibleSrc = readFileSync(resolve(PHASE0_DIR, "src/Dexible.sol"), "utf-8");
    sourceFiles = [{ filename: "Dexible.sol", content: dexibleSrc }];
    targetFilename = "Dexible.sol";
  } else {
    const altPath = resolve(REPO_ROOT, `src/bench/phase2-duel/sources/${entry.name}.sol`);
    if (!existsSync(altPath)) {
      console.error(
        `ERROR: no bundled source for ${entry.name}. Either run on Dexible, ` +
          `pass --source-dir, or add ${altPath}.`
      );
      return 1;
    }
    sourceFiles = [{ filename: `${entry.name}.sol`, content: readFileSync(altPath, "utf-8") }];
    targetFilename = `${entry.name}.sol`;
  }

  // Sanity: reference exploit URL present — this is the "ground truth" flag.
  if (!entry.referenceExploit) {
    console.warn("WARN: dataset entry has no referenceExploit URL — this run is unscored.");
  }

  const sb = isStorageEnabled() ? getClient() : null;

  const t0 = Date.now();
  const result = await runDuel({
    contractEntry: entry,
    datasetSplit: args.split,
    sourceFiles,
    targetSourceFilename: targetFilename,
    targetContractName,
    remappings,
    maxRounds: args.rounds,
    blueViaClaudeCli: process.env.BLUE_VIA_CLAUDE_CLI === "1",
    redViaClaudeCli: args.redViaClaudeCli,
    redeployFromAddress: args.redeployFrom,
    rpcUrl,
    supabase: sb,
    onRoundComplete: (r) => {
      console.log(
        `\n[round ${r.roundIndex + 1}] red_found=${!!r.redReport?.found} blue_success=${r.blueSuccess} red_iters=${r.redIterations} blue_iters=${r.blueIterations}`
      );
      if (r.verification) {
        const v = r.verification;
        console.log(
          `  verify: exploit=${v.exploitNeutralized ? "neutralized" : "ALIVE"} benign=${v.benignPassed ? "ok" : "fail[" + v.regressions.join(",") + "]"} fresh=${v.freshAttackerNeutralized ? "ok" : "fail"} layout=${v.storageLayoutChanged ? "CHANGED" : "ok"}${v.error ? " error=" + v.error.slice(0, 60) : ""}`
        );
      }
      if (r.auditEntry) {
        console.log(`  audit: class=${r.auditEntry.vulnClass}`);
        console.log(`    exploitSummary:      ${r.auditEntry.exploitSummary}`);
        console.log(`    patchSummary:        ${r.auditEntry.patchSummary}`);
        console.log(`    verificationSummary: ${r.auditEntry.verificationSummary}`);
        console.log(`    convergenceSignal:   ${r.auditEntry.convergenceSignal}`);
        console.log(`    redEvidence [${r.auditEntry.redEvidence.length}]:`);
        for (const e of r.auditEntry.redEvidence.slice(0, 3)) console.log(`      - ${e}`);
        console.log(`    blueEvidence [${r.auditEntry.blueEvidence.length}]:`);
        for (const e of r.auditEntry.blueEvidence.slice(0, 3)) console.log(`      - ${e}`);
        if (r.auditRejection) console.log(`    auditRejection: ${r.auditRejection}`);
      }
    },
  });
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(66));
  console.log(`CONVERGENCE: ${result.convergence}`);
  console.log(`Rounds executed: ${result.roundsExecuted}`);
  console.log(`Wall time:       ${totalSec}s`);
  console.log(`Notional cost:   $${result.totalNotionalCostUsd.toFixed(4)} (Blue via subscription)`);
  console.log(`Duel run id:     ${result.duelRunId}`);
  console.log("=".repeat(66));

  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  // Exit codes:
  //   0 = hardened
  //   1 = anything else (blue_failed / budget_exhausted / same_class_escaped)
  return result.convergence === "hardened" ? 0 : 1;
}

/**
 * Recursively collect every .sol file under root. Returns entries with
 * `filename` set to the POSIX relative path (forward-slashes) so it survives
 * being written into the Linux container under `/workspace/scan/src/<filename>`.
 */
function collectSolFiles(
  root: string
): { filename: string; content: string }[] {
  const out: { filename: string; content: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile() && entry.endsWith(".sol")) {
        const rel = relative(root, full).split(sep).join("/");
        out.push({ filename: rel, content: readFileSync(full, "utf-8") });
      }
    }
  };
  walk(root);
  return out;
}

/**
 * Inspect the collected source layout and emit foundry remappings so imports
 * resolve. Etherscan extracts typically place vendored libs as siblings of the
 * project's own `contracts/` dir (e.g. `@openzeppelin/`, `@uniswap/`). We
 * remap each top-level dir whose name starts with `@` to its on-disk path
 * inside the scan project's src/. Project-relative imports (`./Foo.sol`)
 * resolve naturally because we preserve directory structure.
 */
function deriveRemappings(
  files: { filename: string; content: string }[]
): string[] {
  const topAtDirs = new Set<string>();
  for (const f of files) {
    const first = f.filename.split("/")[0];
    if (first.startsWith("@")) topAtDirs.add(first);
  }
  const out: string[] = [];
  for (const dir of topAtDirs) {
    out.push(`${dir}/=src/${dir}/`);
  }
  return out;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
