#!/usr/bin/env node
/**
 * Alternate Phase 1 driver that BYPASSES the LLM benign-suite generator and
 * uses the hand-written phase0 benign fixture instead. Purpose: exercise the
 * Blue Claude-Code-CLI branch end-to-end when the generator path is blocked
 * (OpenRouter credits exhausted OR subscription timeout too tight for a full
 * Solidity emit).
 *
 * This file exists SO the spec's E2E requirement ("Blue team should
 * autonomously patch Dexible via Max subscription + Opus in one claude -p
 * call, verify_patch confirms all 4 gates") is testable even when the
 * upstream generator is unavailable. It is NOT a replacement for verify.ts.
 *
 * Run: `BLUE_VIA_CLAUDE_CLI=1 npx tsx src/bench/phase1-dexible-blue/verify-fixture-benign.ts`
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

import { SandboxManager } from "../../sandbox/manager.js";
import { runBlueTeam, type BluePatchResult } from "../../agent/blue-loop.js";
import type { ExploitReport } from "../../reporter/format.js";
import type { PatchVerification } from "../../sandbox/patch-harness.js";

loadDotenv();

const TARGET_ADDRESS = "0xDE62E1b0edAa55aAc5ffBE21984D321706418024";
const FORK_BLOCK = 16_646_021;
const CONTRACT_NAME = "Dexible";
const CHAIN = "ethereum";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHASE0_DIR = resolve(__dirname, "../phase0-dexible");

async function main(): Promise<number> {
  const rpcUrl = process.env.ETH_RPC_URL;
  if (!rpcUrl) {
    console.error("ERROR: ETH_RPC_URL not set");
    return 1;
  }

  const dexibleOrig = readFileSync(resolve(PHASE0_DIR, "src/Dexible.sol"), "utf8");
  const exploitTest = readFileSync(resolve(PHASE0_DIR, "test/Exploit.t.sol"), "utf8");
  const benignTest = readFileSync(resolve(PHASE0_DIR, "test/Benign.t.sol"), "utf8");
  const foundryToml = readFileSync(resolve(PHASE0_DIR, "foundry.toml"), "utf8");

  const sandbox = new SandboxManager();
  const scanId = `phase1-fixture-${Date.now()}`;
  console.log("[1/3] Creating sandbox container...");
  const containerId = await sandbox.createContainer(scanId, {
    rpcUrl,
    cpuLimit: 2,
    memoryLimit: 4,
  });
  const overallStart = Date.now();

  try {
    console.log(`      container: ${containerId.slice(0, 12)}`);

    console.log("[2/3] Seeding original + patched projects (fixture benign)...");
    const originalProjectRoot = "/workspace/harness/original";
    const patchedProjectRoot = "/workspace/harness/patched";
    for (const root of [originalProjectRoot, patchedProjectRoot]) {
      await sandbox.exec(
        containerId,
        `rm -rf '${root}' && mkdir -p '${root}' && cp -r /workspace/template/. '${root}/'`,
        60_000
      );
      await sandbox.exec(
        containerId,
        `rm -f '${root}'/src/Counter.sol '${root}'/test/Counter.t.sol '${root}'/script/Counter.s.sol || true`
      );
      await sandbox.writeFile(containerId, `${root}/src/Dexible.sol`, dexibleOrig);
      await sandbox.writeFile(containerId, `${root}/test/Exploit.t.sol`, exploitTest);
      await sandbox.writeFile(containerId, `${root}/test/Benign.t.sol`, benignTest);
      await sandbox.writeFile(containerId, `${root}/foundry.toml`, foundryToml);
    }

    const exploitReport: ExploitReport = {
      contract: TARGET_ADDRESS,
      contractName: CONTRACT_NAME,
      chain: CHAIN,
      blockNumber: FORK_BLOCK,
      found: true,
      vulnerability: {
        class: "access-control",
        severity: "critical",
        functions: ["selfSwap"],
        description:
          "Dexible.selfSwap performs an arbitrary low-level call with attacker-controlled target (`rr.router`) and calldata (`rr.routerData`). An attacker can call selfSwap with router set to an ERC-20 and routerData set to transferFrom(victim, attacker, amount) to steal approvals. Patch must prevent arbitrary unapproved routers from being called.",
      },
      exploit: {
        script: "test/Exploit.t.sol",
        executed: true,
        output: "",
        valueAtRisk: "~$2M historical; arbitrary ERC-20 approvals at risk",
      },
    };

    console.log("[3/3] Invoking Blue team via Claude Code CLI...");
    const t0 = Date.now();
    const blueResult: BluePatchResult = await runBlueTeam({
      sandbox,
      containerId,
      patchedProjectRoot,
      originalProjectRoot,
      exploitReport,
      originalSource: dexibleOrig,
      sourceFilename: "Dexible.sol",
      contractName: CONTRACT_NAME,
      forkBlockNumber: FORK_BLOCK,
      rpcUrl,
      targetAddress: TARGET_ADDRESS,
      exploitTestPath: "test/Exploit.t.sol",
      benignTestPath: "test/Benign.t.sol",
      config: {
        // provider is unused by the CLI branch, but must typecheck
        provider: {
          provider: "openrouter",
          model: "unused-in-cli-branch",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "unused",
        },
        maxIterations: 15,
        toolTimeout: 180_000,
        scanTimeout: 20 * 60_000,
      },
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(`\n[done] Blue finished in ${dt}s`);
    printSummary(blueResult);

    const total = ((Date.now() - overallStart) / 1000).toFixed(1);
    console.log(`\nTotal wall time: ${total}s`);
    if (blueResult.success) {
      console.log("\n✅ Phase 1 GREEN: Blue team autonomously patched Dexible");
      return 0;
    }
    console.log("\n❌ Phase 1 RED — Blue team failed to produce a passing patch");
    return 1;
  } finally {
    console.log("\n[cleanup] destroying sandbox container...");
    await sandbox.destroyContainer(containerId);
  }
}

function printSummary(r: BluePatchResult): void {
  console.log("─".repeat(66));
  console.log(`success:            ${r.success}`);
  console.log(`iterations:         ${r.iterations}`);
  console.log(`finalSource bytes:  ${r.finalSource?.length ?? 0}`);
  console.log(`rationale chars:    ${r.rationale?.length ?? 0}`);
  console.log(
    `notional USD:       ${
      typeof r.claudeNotionalCostUsd === "number"
        ? "$" + r.claudeNotionalCostUsd.toFixed(4)
        : "n/a"
    }`
  );
  console.log(`verify calls:       ${r.verificationHistory.length}`);
  r.verificationHistory.forEach((v, i) => {
    console.log(`  #${i + 1}: ${formatVerdict(v)}`);
  });
  if (r.rationale) {
    console.log("\nRationale:");
    console.log(indent(r.rationale, "  "));
  }
  if (r.error) console.log(`\nError: ${r.error}`);
  console.log("─".repeat(66));
}

function formatVerdict(v: PatchVerification): string {
  if (v.error) return `error: ${v.error.slice(0, 80)}`;
  return [
    `exploit=${v.exploitNeutralized ? "neutralized" : "PASSED"}`,
    `benign=${v.benignPassed ? "ok" : `FAIL[${v.regressions.join(",")}]`}`,
    `fresh=${v.freshAttackerNeutralized ? "ok" : "FAIL"}`,
    `layout=${v.storageLayoutChanged ? "CHANGED" : "ok"}`,
  ].join(" ");
}

function indent(text: string, prefix: string): string {
  return text.split("\n").map((l) => prefix + l).join("\n");
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
