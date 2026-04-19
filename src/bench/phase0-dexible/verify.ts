#!/usr/bin/env node
/**
 * Phase 0 driver — end-to-end sanity check of the patch-verification
 * primitive against ONE hand-written patch for ONE contract (Dexible).
 *
 * Flow:
 *   1. Spin up a solhunt-sandbox container.
 *   2. Copy phase0-dexible/{src,test,foundry.toml} into two project roots
 *      inside the container: `original/` and `patched/`. Both projects share
 *      the same test/ (Exploit.t.sol + Benign.t.sol). They differ only in
 *      which of Dexible.sol / DexiblePatched.sol is placed at `src/Dexible.sol`.
 *   3. Run verifyPatch().
 *   4. Exit 0 if everything is green; 1 otherwise.
 *
 * Run: `npx tsx src/bench/phase0-dexible/verify.ts`
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { config as loadDotenv } from "dotenv";

import { SandboxManager } from "../../sandbox/manager.js";
import { verifyPatch, type PatchVerification } from "../../sandbox/patch-harness.js";

loadDotenv();

const TARGET_ADDRESS = "0xDE62E1b0edAa55aAc5ffBE21984D321706418024";
const FORK_BLOCK = 16_646_021;
const CONTRACT_NAME = "Dexible";
const CHAIN = "ethereum";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = __dirname;

interface FileSpec {
  containerPath: string;
  content: string;
}

async function main(): Promise<number> {
  const rpcUrl = process.env.ETH_RPC_URL;
  if (!rpcUrl) {
    console.error("ERROR: ETH_RPC_URL not set in env");
    return 1;
  }

  console.log("=".repeat(60));
  console.log("solhunt-duel Phase 0 — patch-harness primitive check");
  console.log("=".repeat(60));
  console.log(`Target:     ${TARGET_ADDRESS}`);
  console.log(`Chain:      ${CHAIN}`);
  console.log(`Fork block: ${FORK_BLOCK}`);
  console.log(`Contract:   ${CONTRACT_NAME}`);
  console.log();

  const sandbox = new SandboxManager();
  const scanId = `phase0-dexible-${Date.now()}`;

  console.log("[1/4] Creating sandbox container...");
  const containerId = await sandbox.createContainer(scanId, {
    rpcUrl,
    cpuLimit: 2,
    memoryLimit: 4,
  });

  try {
    console.log(`      container: ${containerId.slice(0, 12)}`);

    console.log("[2/4] Seeding original + patched Foundry projects...");
    await seedProjects(sandbox, containerId);

    console.log("[3/4] Running verifyPatch()...");
    const t0 = Date.now();
    const verification: PatchVerification = await verifyPatch(sandbox, {
      sandboxId: containerId,
      targetAddress: TARGET_ADDRESS,
      forkBlockNumber: FORK_BLOCK,
      contractName: CONTRACT_NAME,
      originalSourcePath: "/workspace/harness/original",
      patchedSourcePath: "/workspace/harness/patched",
      exploitTestPath: "test/Exploit.t.sol",
      benignTestPath: "test/Benign.t.sol",
      rpcUrl,
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(`[4/4] Verification complete in ${dt}s\n`);
    printVerdict(verification);

    const ok =
      verification.exploitNeutralized &&
      verification.benignPassed &&
      verification.freshAttackerNeutralized &&
      !verification.storageLayoutChanged &&
      !verification.error;

    if (ok) {
      console.log("\nPHASE 0 GREEN, ready for Phase 1 (Blue team agent)");
      return 0;
    }
    console.log("\nPHASE 0 RED — see gate details above");
    return 1;
  } finally {
    console.log("\n[cleanup] destroying sandbox container...");
    await sandbox.destroyContainer(containerId);
  }
}

/**
 * Lay out two Foundry projects inside the container using the shared
 * foundry.toml and test suite, differing only in which Dexible.sol variant
 * they compile.
 */
async function seedProjects(
  sandbox: SandboxManager,
  containerId: string
): Promise<void> {
  const dexibleOrig = readFileSync(resolve(HARNESS_DIR, "src/Dexible.sol"), "utf8");
  const dexiblePatched = readFileSync(
    resolve(HARNESS_DIR, "src/DexiblePatched.sol"),
    "utf8"
  );
  const exploitTest = readFileSync(resolve(HARNESS_DIR, "test/Exploit.t.sol"), "utf8");
  const benignTest = readFileSync(resolve(HARNESS_DIR, "test/Benign.t.sol"), "utf8");
  const foundryToml = readFileSync(resolve(HARNESS_DIR, "foundry.toml"), "utf8");

  // Both Solidity variants declare `contract Dexible` so they produce
  // matching artifact paths. We rename the PATCHED file to Dexible.sol
  // inside the patched project.
  const projects: Array<{ root: string; files: FileSpec[] }> = [
    {
      root: "/workspace/harness/original",
      files: [
        { containerPath: "src/Dexible.sol", content: dexibleOrig },
        { containerPath: "test/Exploit.t.sol", content: exploitTest },
        { containerPath: "test/Benign.t.sol", content: benignTest },
        { containerPath: "foundry.toml", content: foundryToml },
      ],
    },
    {
      root: "/workspace/harness/patched",
      files: [
        { containerPath: "src/Dexible.sol", content: dexiblePatched },
        { containerPath: "test/Exploit.t.sol", content: exploitTest },
        { containerPath: "test/Benign.t.sol", content: benignTest },
        { containerPath: "foundry.toml", content: foundryToml },
      ],
    },
  ];

  // The sandbox image ships a pre-built Foundry template at /workspace/template
  // with forge-std + DeFi remappings already wired. Copy it as the base so
  // our tiny Dexible.sol has forge-std/Test.sol to import.
  for (const project of projects) {
    await sandbox.exec(
      containerId,
      `rm -rf '${project.root}' && mkdir -p '${project.root}' && cp -r /workspace/template/. '${project.root}/'`,
      60_000
    );
    // Scrub any template starter sources that would collide.
    await sandbox.exec(
      containerId,
      `rm -f '${project.root}'/src/Counter.sol '${project.root}'/test/Counter.t.sol '${project.root}'/script/Counter.s.sol || true`
    );
    for (const f of project.files) {
      const full = join(project.root, f.containerPath).replace(/\\/g, "/");
      await sandbox.writeFile(containerId, full, f.content);
    }
  }
}

function printVerdict(v: PatchVerification): void {
  const row = (label: string, pass: boolean | null, extra?: string) => {
    const mark = pass === null ? " -" : pass ? "OK" : "FAIL";
    const padded = label.padEnd(36);
    console.log(`  [${mark}] ${padded}${extra ? "  " + extra : ""}`);
  };

  console.log("Gate results:");
  row("exploit neutralized on patch", v.exploitNeutralized);
  row("benign suite passed", v.benignPassed,
    v.regressions.length ? `regressions: ${v.regressions.join(", ")}` : "");
  row(
    "fresh-attacker exploit neutralized",
    v.freshAttackerNeutralized
  );
  row("storage layout unchanged", !v.storageLayoutChanged);

  if (v.error) {
    console.log("\nERROR:");
    console.log(v.error);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
