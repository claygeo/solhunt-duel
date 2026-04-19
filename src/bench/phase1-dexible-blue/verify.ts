#!/usr/bin/env node
/**
 * Phase 1 driver — end-to-end Blue-team patcher check against Dexible.
 *
 * Difference vs Phase 0:
 *   - No hand-written patch. Blue must produce the patch.
 *   - No hand-written benign suite. `generateBenign()` auto-produces one.
 *
 * Flow:
 *   1. Spin up a solhunt-sandbox container.
 *   2. Seed two Foundry project roots:
 *        /workspace/harness/original  — pristine Dexible.sol
 *        /workspace/harness/patched   — identical copy; Blue edits this one.
 *      Red's Exploit.t.sol is copied into both projects' test/.
 *   3. Call generateBenign() against the original project to get a pruned
 *      test/Benign.t.sol. Copy it into BOTH projects.
 *   4. Invoke runBlueTeam() with the auto-generated benign suite.
 *   5. Print BluePatchResult + final PatchVerification.
 *   6. Exit 0 on green, 1 otherwise.
 *
 * Run: `npx tsx src/bench/phase1-dexible-blue/verify.ts`
 */

import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

import { SandboxManager } from "../../sandbox/manager.js";
import { runBlueTeam, type BluePatchResult } from "../../agent/blue-loop.js";
import { generateBenign } from "../../benign/generator.js";
import type { ExploitReport } from "../../reporter/format.js";
import type { PatchVerification } from "../../sandbox/patch-harness.js";
import {
  resolveProvider,
  type ProviderConfig,
} from "../../agent/provider.js";

loadDotenv();

const TARGET_ADDRESS = "0xDE62E1b0edAa55aAc5ffBE21984D321706418024";
const FORK_BLOCK = 16_646_021;
const CONTRACT_NAME = "Dexible";
const CHAIN = "ethereum";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Reuse Phase 0's hand-written Dexible.sol + Exploit.t.sol. Phase 1 only
// removes the hand-written patch + benign suite.
const PHASE0_DIR = resolve(__dirname, "../phase0-dexible");

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

  console.log("=".repeat(66));
  console.log("solhunt-duel Phase 1 — Blue team patches Dexible autonomously");
  console.log("=".repeat(66));
  console.log(`Target:     ${TARGET_ADDRESS}`);
  console.log(`Chain:      ${CHAIN}`);
  console.log(`Fork block: ${FORK_BLOCK}`);
  console.log(`Contract:   ${CONTRACT_NAME}`);
  console.log();

  const sandbox = new SandboxManager();
  const scanId = `phase1-dexible-blue-${Date.now()}`;

  console.log("[1/5] Creating sandbox container...");
  const containerId = await sandbox.createContainer(scanId, {
    rpcUrl,
    cpuLimit: 2,
    memoryLimit: 4,
  });

  const overallStart = Date.now();
  try {
    console.log(`      container: ${containerId.slice(0, 12)}`);

    console.log("[2/5] Seeding original + patched Foundry projects...");
    const dexibleOrig = readFileSync(
      resolve(PHASE0_DIR, "src/Dexible.sol"),
      "utf8"
    );
    const exploitTest = readFileSync(
      resolve(PHASE0_DIR, "test/Exploit.t.sol"),
      "utf8"
    );
    const foundryToml = readFileSync(
      resolve(PHASE0_DIR, "foundry.toml"),
      "utf8"
    );

    const originalProjectRoot = "/workspace/harness/original";
    const patchedProjectRoot = "/workspace/harness/patched";

    await seedProjects(sandbox, containerId, [
      {
        root: originalProjectRoot,
        files: [
          { containerPath: "src/Dexible.sol", content: dexibleOrig },
          { containerPath: "test/Exploit.t.sol", content: exploitTest },
          { containerPath: "foundry.toml", content: foundryToml },
        ],
      },
      {
        root: patchedProjectRoot,
        files: [
          // Blue starts with the pristine source and edits it.
          { containerPath: "src/Dexible.sol", content: dexibleOrig },
          { containerPath: "test/Exploit.t.sol", content: exploitTest },
          { containerPath: "foundry.toml", content: foundryToml },
        ],
      },
    ]);

    // A minimal ExploitReport as if Red had just finished. Phase 2 will
    // wire Red's actual output here; for Phase 1 we hand-author it so the
    // driver isn't blocked on a Red run.
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
          "Dexible.selfSwap performs an arbitrary low-level call with attacker-controlled target (`rr.router`) and calldata (`rr.routerData`). Because any victim who had previously approved Dexible to spend an ERC-20 effectively grants Dexible the ability to move those tokens, an attacker can call selfSwap with router set to that ERC-20 and routerData set to transferFrom(victim, attacker, amount), and Dexible will execute the steal on the attacker's behalf. The patch must prevent arbitrary unapproved routers from being called.",
      },
      exploit: {
        script: "test/Exploit.t.sol",
        executed: true,
        output: "",
        valueAtRisk:
          "~$2M on the original 2023-02 exploit; arbitrary ERC-20 balance at risk in the general case",
      },
    };

    console.log("[3/5] Generating benign test suite via LLM...");
    const t0 = Date.now();
    const benign = await generateBenign({
      sandbox,
      sandboxId: containerId,
      originalSource: dexibleOrig,
      sourceFilename: "Dexible.sol",
      exploitReport,
      originalProjectRoot,
      benignTestPath: "test/Benign.t.sol",
      forkBlockNumber: FORK_BLOCK,
      rpcUrl,
      targetAddress: TARGET_ADDRESS,
      contractName: CONTRACT_NAME,
    });
    const dtBenign = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `      benign generated in ${dtBenign}s — ${benign.survivingTests.length} surviving, ${benign.prunedTests.length} pruned`
    );
    if (benign.survivingTests.length) {
      console.log(`      surviving: ${benign.survivingTests.join(", ")}`);
    }
    if (benign.prunedTests.length) {
      console.log(`      pruned:    ${benign.prunedTests.join(", ")}`);
    }

    // Copy the pruned benign suite into the patched project too.
    await sandbox.writeFile(
      containerId,
      joinUnix(patchedProjectRoot, "test/Benign.t.sol"),
      benign.benignSource
    );

    console.log("[4/5] Invoking Blue team agent (max 15 iterations)...");
    const provider = selectProvider();
    const viaClaudeCli =
      process.env.BLUE_VIA_CLAUDE_CLI === "1" ||
      process.env.BLUE_VIA_CLAUDE_CLI === "true";
    if (viaClaudeCli) {
      console.log(
        "      path: via Claude Code CLI (Max subscription, Opus 4.7)"
      );
    } else {
      console.log(
        `      path: via OpenRouter — provider=${provider.provider} model=${provider.model} subscription=${process.env.BLUE_VIA_SUBSCRIPTION === "1"}`
      );
    }

    const t1 = Date.now();
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
        provider,
        maxIterations: 15,
        toolTimeout: 180_000,
        scanTimeout: 30 * 60_000,
      },
      onIteration: (i, toolName) => {
        console.log(`      iter ${String(i).padStart(2, "0")} → ${toolName}`);
      },
    });
    const dtBlue = ((Date.now() - t1) / 1000).toFixed(1);

    console.log(`\n[5/5] Blue team finished in ${dtBlue}s`);
    printBlueSummary(blueResult);

    const totalDt = ((Date.now() - overallStart) / 1000).toFixed(1);
    console.log(`\nTotal Phase 1 wall time: ${totalDt}s`);

    if (blueResult.success) {
      console.log(
        "\n✅ Phase 1 GREEN: Blue team autonomously patched Dexible"
      );
      return 0;
    }
    console.log("\n❌ Phase 1 RED — Blue team failed to produce a passing patch");
    return 1;
  } finally {
    console.log("\n[cleanup] destroying sandbox container...");
    await sandbox.destroyContainer(containerId);
  }
}

function selectProvider(): ProviderConfig {
  // Explicit provider preset wins.
  const presetName = process.env.SOLHUNT_PROVIDER;
  if (presetName) {
    const preset = resolveProvider(presetName);
    // Pull API key from env based on the preset's provider family.
    if (preset.provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
      preset.apiKey = process.env.OPENROUTER_API_KEY;
    } else if (preset.provider === "openai" && process.env.OPENAI_API_KEY) {
      preset.apiKey = process.env.OPENAI_API_KEY;
    } else if (preset.provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      preset.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    return preset;
  }
  // Default: OpenRouter + Sonnet 4.6 if a key is present.
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      model: process.env.BLUE_MODEL ?? "anthropic/claude-sonnet-4-6",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: process.env.BLUE_MODEL ?? "claude-sonnet-4-6",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  throw new Error(
    "No model provider configured. Set SOLHUNT_PROVIDER plus the matching API key, " +
      "or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY directly."
  );
}

async function seedProjects(
  sandbox: SandboxManager,
  containerId: string,
  projects: Array<{ root: string; files: FileSpec[] }>
): Promise<void> {
  for (const project of projects) {
    await sandbox.exec(
      containerId,
      `rm -rf '${project.root}' && mkdir -p '${project.root}' && cp -r /workspace/template/. '${project.root}/'`,
      60_000
    );
    await sandbox.exec(
      containerId,
      `rm -f '${project.root}'/src/Counter.sol '${project.root}'/test/Counter.t.sol '${project.root}'/script/Counter.s.sol || true`
    );
    for (const f of project.files) {
      const full = joinUnix(project.root, f.containerPath);
      await sandbox.writeFile(containerId, full, f.content);
    }
  }
}

function printBlueSummary(r: BluePatchResult): void {
  console.log("─".repeat(66));
  console.log(`Blue iterations: ${r.iterations}`);
  console.log(
    `Token cost:      input=${r.cost.inputTokens}  output=${r.cost.outputTokens}`
  );
  if (typeof r.claudeNotionalCostUsd === "number") {
    console.log(
      `Notional USD:    $${r.claudeNotionalCostUsd.toFixed(4)} (Max subscription = $0 actual)`
    );
  }
  console.log(`Verify calls:    ${r.verificationHistory.length}`);
  if (r.verificationHistory.length) {
    console.log("Gate progression:");
    r.verificationHistory.forEach((v, i) => {
      console.log(`  #${i + 1}: ${formatVerdict(v)}`);
    });
  }
  if (r.rationale) {
    console.log("\nBlue rationale:");
    console.log(indent(r.rationale, "  "));
  }
  if (r.error) {
    console.log(`\nError: ${r.error}`);
  }
  console.log("─".repeat(66));
}

function formatVerdict(v: PatchVerification): string {
  if (v.error) return `error: ${v.error.slice(0, 80)}`;
  const parts = [
    `exploit=${v.exploitNeutralized ? "neutralized" : "PASSED"}`,
    `benign=${v.benignPassed ? "ok" : `FAIL[${v.regressions.join(",")}]`}`,
    `fresh=${v.freshAttackerNeutralized ? "ok" : "FAIL"}`,
    `layout=${v.storageLayoutChanged ? "CHANGED" : "ok"}`,
  ];
  return parts.join(" ");
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

function joinUnix(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/\\/g, "/").replace(/\/+$/, ""))
    .join("/")
    .replace(/\/+/g, "/");
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
