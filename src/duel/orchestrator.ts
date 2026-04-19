// Duel orchestrator — Phase 2 of solhunt-duel.
//
// Runs a multi-round Red↔Blue loop on a single target contract. Each round:
//   1. Red scans the CURRENT source (round 0: original; round N≥1: patched).
//   2. If Red found something, Blue generates a benign suite (once per round
//      family) and patches the source until all four gates are green.
//   3. We persist round artifacts and hand off to the audit-trail generator.
//
// Convergence verdicts:
//   - hardened:               Red found nothing (or gave up) and round>0 had
//                             a green-gate patch. Or round 0 Red finds
//                             nothing (contract already clean).
//   - blue_failed:            Red found a vuln but Blue could not produce a
//                             green-gate patch inside the round budget.
//   - budget_exhausted:       All maxRounds consumed, last Red run still
//                             found something, Blue kept patching.
//   - same_class_escaped:     Red found the SAME vuln class in round N as in
//                             round M < N. The prior patch was incomplete.
//
// Wire up to Supabase persistence if a SupabaseClient is passed. Otherwise
// runs in pure-file-mode and emits round artifacts to the local staging dir.

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { SandboxManager } from "../sandbox/manager.js";
import { ForkManager } from "../sandbox/fork.js";
import { runAgent, type ScanTarget } from "../agent/loop.js";
import { runBlueTeam, type BluePatchResult } from "../agent/blue-loop.js";
import { generateBenign, type GenerateBenignResult } from "../benign/generator.js";
import {
  resolveProvider,
  type ProviderConfig,
} from "../agent/provider.js";
import { DataCollector } from "../storage/collector.js";
import type { ExploitReport } from "../reporter/format.js";
import {
  buildAndExtract,
  type PatchVerification,
} from "../sandbox/patch-harness.js";
import { cloneBytecodeInContainer } from "../sandbox/clone-bytecode.js";
import sha3 from "js-sha3";
import {
  generateAuditEntry,
  type AuditEntry,
  type AuditEntryResult,
} from "./audit-trail.js";

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface DatasetEntry {
  id: string;
  name: string;
  chain: string;
  blockNumber: number;
  contractAddress: string;
  vulnerabilityClass: string;
  description?: string;
  date?: string;
  valueImpacted?: string;
  referenceExploit?: string;
}

export interface DuelArgs {
  contractEntry: DatasetEntry;
  datasetSplit: "train" | "holdout" | "adversarial";
  /** Absolute path to the pristine source tree (file-per-contract). Used to
   *  seed round 0 red/blue project roots. */
  sourceFiles: { filename: string; content: string }[];
  /** Main .sol filename (relative to src/, e.g. "Dexible.sol" or
   *  "contracts/dexible/DexibleProxy.sol"). The orchestrator treats this as
   *  the file Red hunts and Blue patches. */
  targetSourceFilename: string;
  /** Override for the Solidity contract name forge should compile/extract
   *  (e.g. "DexibleProxy"). Defaults to the target file's basename minus
   *  ".sol". Required when the file basename diverges from the contract name
   *  (real Etherscan source vs. dataset entry name). */
  targetContractName?: string;
  /** Optional foundry remappings written into every scan/blue project's
   *  foundry.toml. Use when the source tree contains vendored libs at
   *  arbitrary paths (e.g. `@openzeppelin/=src/@openzeppelin/`). */
  remappings?: string[];
  /** Optional recon blob to feed Red. */
  reconData?: string;
  /** Defaults to 3. */
  maxRounds?: number;
  /** Model/provider for Red's scan. Default = Dexible-compatible preset. */
  redProvider?: ProviderConfig;
  /** Default 30. */
  redMaxIterations?: number;
  /** Set to true to route Blue through `claude -p` (Max subscription). */
  blueViaClaudeCli?: boolean;
  /** Set to true to route Red through `claude -p` (Max subscription). When
   *  enabled, RED_VIA_CLAUDE_CLI=1 is set in the env scope of each Red scan. */
  redViaClaudeCli?: boolean;
  /** When set, the orchestrator clones the runtime bytecode + low-index
   *  storage slots of <redeployFromAddress> onto a deterministic FRESH address
   *  inside the container's anvil before round 0 (so Claude never sees the
   *  real verified mainnet address). On round N≥2, the orchestrator extracts
   *  Blue's patched runtime bytecode and OVERWRITES the fresh address with
   *  it (anvil_setCode), so Red scans the patched bytecode without re-cloning
   *  the original. */
  redeployFromAddress?: string;
  /** Provider for Blue's OpenRouter fallback path. */
  blueProvider?: ProviderConfig;
  /** Per-component wall-clock budget. */
  redScanTimeoutMs?: number;
  blueScanTimeoutMs?: number;
  /** Etherscan-sourced contract. Defaults to ethereum mainnet URL. */
  rpcUrl: string;
  /** Staging dir for per-round artifacts. */
  stagingRoot?: string;
  /** Optional Supabase client. If omitted, runs file-only. */
  supabase?: SupabaseClient | null;
  /** Progress hook. */
  onRoundComplete?: (round: DuelRoundResult) => void;
}

export interface DuelRoundResult {
  roundIndex: number;
  /** Red's verdict this round. null means Red crashed or produced no report. */
  redReport: ExploitReport | null;
  redIterations: number;
  redCost: { inputTokens: number; outputTokens: number };
  redDurationMs: number;
  /** Blue was only invoked if Red found. Undefined otherwise. */
  blueSuccess: boolean;
  blueIterations: number;
  blueCost: { inputTokens: number; outputTokens: number };
  blueDurationMs: number;
  blueRationale?: string;
  verification?: PatchVerification;
  /** Full patched source after Blue, if success. */
  patchedSource?: string;
  /** "hardened_early" | "gates_green" | "blue_failed" | "same_class_repeat"
   *  | "no_red_finding". */
  convergenceSignal?: string;
  auditEntry?: AuditEntry;
  auditRejection?: string;
  /** Filesystem paths written this round. */
  artifacts: {
    redConversationPath?: string;
    blueStreamPath?: string;
    patchPath?: string;
    verificationPath?: string;
  };
  /** Supabase IDs when persistence is on. */
  storage?: {
    duelRoundId?: string;
    redScanRunId?: string;
    blueScanRunId?: string;
  };
}

export interface DuelResult {
  duelRunId: string;
  convergence:
    | "hardened"
    | "blue_failed"
    | "budget_exhausted"
    | "same_class_escaped";
  roundsExecuted: number;
  rounds: DuelRoundResult[];
  finalHardenedSource?: string;
  totalWallTimeMs: number;
  /** Only Blue's Claude-CLI notional cost is known today (Red is on
   *  OpenRouter so we report its dollar cost via calculateCost when
   *  available). */
  totalNotionalCostUsd: number;
  datasetSplit: DuelArgs["datasetSplit"];
  contract: { address: string; name: string; chain: string };
  error?: string;
}

// ---------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runDuel(args: DuelArgs): Promise<DuelResult> {
  const t0 = Date.now();
  const duelRunId = randomUUID();
  const maxRounds = args.maxRounds ?? 3;
  const stagingRoot =
    args.stagingRoot ??
    process.env.SOLHUNT_HOST_STAGING ??
    "/workspace/harness";

  // Per-duel staging + per-round subdirs.
  const duelStaging = join(stagingRoot, `duel-${duelRunId.slice(0, 8)}`);
  mkdirSync(duelStaging, { recursive: true });

  // Artifacts we accumulate across rounds.
  const rounds: DuelRoundResult[] = [];
  const initialSource = findTargetSource(args.sourceFiles, args.targetSourceFilename);
  if (!initialSource) {
    return {
      duelRunId,
      convergence: "blue_failed",
      roundsExecuted: 0,
      rounds: [],
      totalWallTimeMs: Date.now() - t0,
      totalNotionalCostUsd: 0,
      datasetSplit: args.datasetSplit,
      contract: {
        address: args.contractEntry.contractAddress,
        name: args.contractEntry.name,
        chain: args.contractEntry.chain,
      },
      error: `Target file ${args.targetSourceFilename} not present in sourceFiles`,
    };
  }
  let currentSource: string = initialSource;
  const originalSource: string = initialSource;

  // Create a single sandbox container for the whole duel. Each round re-seeds
  // it with the CURRENT source (round 0 = original, round N = last round's
  // patched source).
  const sandbox = new SandboxManager();
  const containerId = await sandbox.createContainer(
    `duel-${duelRunId.slice(0, 8)}`,
    {
      rpcUrl: args.rpcUrl,
      cpuLimit: 2,
      memoryLimit: 4,
    }
  );

  let finalVerdict: DuelResult["convergence"] = "budget_exhausted";
  let totalNotionalCostUsd = 0;

  try {
    // ---- Seed a reusable template + copy forge-std once (speed) ----
    await sandbox.exec(
      containerId,
      `mkdir -p '${duelStagingInContainer(stagingRoot, duelRunId)}'`
    );

    // ---- Start Anvil fork (Red's forge_test + verifyPatch both need it) ----
    console.log(
      `[duel] starting anvil fork at block ${args.contractEntry.blockNumber}...`
    );
    const fork = new ForkManager(sandbox);
    await fork.startAnvilFork(containerId, {
      chain: args.contractEntry.chain,
      rpcUrl: args.rpcUrl,
      blockNumber: args.contractEntry.blockNumber,
    });
    console.log(`[duel] anvil fork ready.`);

    // ---- Fresh-address mode: clone bytecode from real address onto a
    //      deterministic fresh address. The fresh address is what Red sees as
    //      its scan target. On round N≥2 the orchestrator overwrites this
    //      same address with Blue's patched runtime via anvil_setCode. ----
    let scanTargetAddress = args.contractEntry.contractAddress;
    if (args.redeployFromAddress) {
      scanTargetAddress = deriveDuelFreshAddress(args.contractEntry.name);
      console.log(
        `[duel] fresh-address mode: cloning ${args.redeployFromAddress} -> ${scanTargetAddress}`
      );
      const cloneResult = await cloneBytecodeInContainer({
        sandbox,
        containerId,
        originalAddress: args.redeployFromAddress,
        freshAddress: scanTargetAddress,
        sourceBlockTag: `0x${args.contractEntry.blockNumber.toString(16)}`,
        freshImplSeed: args.contractEntry.name,
      });
      console.log(
        `[duel] cloned ${cloneResult.codeBytes}B + ${cloneResult.slotsCopied} slots` +
          (cloneResult.proxyDetected
            ? ` (proxy ${cloneResult.originalImplAddress} -> ${cloneResult.freshImplAddress})`
            : "")
      );
    }

    // Seen vuln classes — for same_class_escaped detection.
    const seenClasses = new Set<string>();

    for (let round = 0; round < maxRounds; round++) {
      console.log(
        `\n${"=".repeat(66)}\n[duel] round ${round + 1}/${maxRounds} — Red scanning ${round === 0 ? "original" : "patched-round-" + round} source\n${"=".repeat(66)}`
      );

      // ---- Round N≥1 patched-bytecode injection (fresh-address mode) ----
      // Before Red's scan starts, overwrite the fresh address with Blue's
      // last patched runtime bytecode. This is the SAME address Red got for
      // round 0; only the on-chain code changes between rounds.
      if (round > 0 && args.redeployFromAddress) {
        const lastPatchedRound = findLastPatchedRound(rounds);
        if (lastPatchedRound) {
          const patchedRoot = `/workspace/duel/r${lastPatchedRound.roundIndex}/patched`;
          const contractName =
            args.targetContractName ??
            inferContractName(
              args.targetSourceFilename,
              args.contractEntry.name
            );
          try {
            console.log(
              `[duel] round ${round + 1}: extracting patched bytecode from ${patchedRoot} (${contractName})`
            );
            const artifact = await buildAndExtract(
              sandbox,
              containerId,
              patchedRoot,
              contractName
            );
            const codeBytes = Math.max(0, (artifact.runtimeBytecode.length - 2) / 2);
            console.log(
              `[duel] round ${round + 1}: anvil_setCode(${scanTargetAddress}, <${codeBytes}B patched>)`
            );
            await castSetCode(
              sandbox,
              containerId,
              scanTargetAddress,
              artifact.runtimeBytecode
            );
          } catch (err: any) {
            console.error(
              `[duel] round ${round + 1}: patched bytecode injection FAILED: ${err?.message ?? err}. ` +
                `Round will scan whatever code is currently at ${scanTargetAddress} — likely the previous round's bytecode.`
            );
          }
        } else {
          console.warn(
            `[duel] round ${round + 1}: no prior patched round found; fresh address still has round 0 bytecode.`
          );
        }
      }

      const roundRes = await runOneRound({
        roundIndex: round,
        duelRunId,
        duelStaging,
        sandbox,
        containerId,
        sourceFiles: cloneSourceFilesWithOverride(
          args.sourceFiles,
          args.targetSourceFilename,
          currentSource
        ),
        targetSourceFilename: args.targetSourceFilename,
        targetContractName: args.targetContractName,
        remappings: args.remappings,
        originalSource,
        currentSource,
        contractEntry: args.contractEntry,
        scanTargetAddress,
        freshAddressMode: !!args.redeployFromAddress,
        reconData: args.reconData,
        redProvider: args.redProvider ?? defaultRedProvider(),
        redMaxIterations: args.redMaxIterations ?? 30,
        redScanTimeoutMs: args.redScanTimeoutMs ?? 30 * 60_000,
        blueScanTimeoutMs: args.blueScanTimeoutMs ?? 30 * 60_000,
        blueProvider: args.blueProvider ?? defaultBlueProvider(),
        blueViaClaudeCli: args.blueViaClaudeCli ?? true,
        redViaClaudeCli: args.redViaClaudeCli ?? false,
        rpcUrl: args.rpcUrl,
      });

      rounds.push(roundRes);

      // Audit trail — generate one per round, best-effort.
      try {
        const auditCtx = {
          redConversationPath: roundRes.artifacts.redConversationPath,
          blueStreamPath: roundRes.artifacts.blueStreamPath,
          redIterationCount: roundRes.redIterations,
          blueTurnCount: roundRes.blueIterations,
        };
        const audit: AuditEntryResult = await generateAuditEntry(
          roundRes,
          auditCtx
        );
        roundRes.auditEntry = audit.entry;
        if (audit.rejectionReason) {
          roundRes.auditRejection = audit.rejectionReason;
          console.warn(
            `[duel] audit note (round ${round}): ${audit.rejectionReason}`
          );
        }
      } catch (err: any) {
        console.warn(
          `[duel] audit generation failed for round ${round}: ${err?.message ?? err}`
        );
      }

      // Hook + persistence.
      args.onRoundComplete?.(roundRes);
      if (args.supabase) {
        await persistRound(args.supabase, duelRunId, args, roundRes).catch((err) =>
          console.error(`[duel] persistRound error: ${err?.message ?? err}`)
        );
      }

      // --- convergence decisions ---
      const redFound = !!roundRes.redReport?.found;
      const thisClass =
        roundRes.redReport?.vulnerability?.class?.toLowerCase() ?? "";

      if (!redFound) {
        // Red gave up or found nothing. If this is round 0, the target was
        // already clean. Otherwise Blue's prior patch hardened it.
        finalVerdict = "hardened";
        roundRes.convergenceSignal =
          round === 0 ? "no_red_finding_round0" : "hardened_after_patches";
        console.log(
          `[duel] round ${round + 1}: Red did not find a usable vuln → converge=hardened`
        );
        break;
      }

      // Red found something.
      if (thisClass && seenClasses.has(thisClass)) {
        finalVerdict = "same_class_escaped";
        roundRes.convergenceSignal = "same_class_repeat";
        console.log(
          `[duel] round ${round + 1}: Red re-found vuln class '${thisClass}' → converge=same_class_escaped (prior patch was incomplete)`
        );
        break;
      }
      if (thisClass) seenClasses.add(thisClass);

      // Red found — did Blue land a green patch?
      if (!roundRes.blueSuccess) {
        finalVerdict = "blue_failed";
        roundRes.convergenceSignal = "blue_failed";
        console.log(
          `[duel] round ${round + 1}: Blue failed to produce a green-gate patch → converge=blue_failed`
        );
        break;
      }

      // Blue succeeded. Promote patched source for the next round's scan.
      if (roundRes.patchedSource) {
        currentSource = roundRes.patchedSource;
        roundRes.convergenceSignal = "gates_green_advancing";
      } else {
        // Shouldn't happen; Blue reported success with no source. Treat as
        // partial failure, but keep going with the last-known source.
        roundRes.convergenceSignal = "gates_green_no_source";
      }

      // If this was the last round and Blue still patched, we exhausted budget.
      if (round === maxRounds - 1) {
        finalVerdict = "budget_exhausted";
        console.log(
          `[duel] round ${round + 1}: out of round budget with active exploit → converge=budget_exhausted`
        );
      }

      if (typeof (roundRes as any).claudeNotionalCostUsd === "number") {
        totalNotionalCostUsd += (roundRes as any).claudeNotionalCostUsd;
      }
    }

    const result: DuelResult = {
      duelRunId,
      convergence: finalVerdict,
      roundsExecuted: rounds.length,
      rounds,
      finalHardenedSource: currentSource,
      totalWallTimeMs: Date.now() - t0,
      totalNotionalCostUsd,
      datasetSplit: args.datasetSplit,
      contract: {
        address: args.contractEntry.contractAddress,
        name: args.contractEntry.name,
        chain: args.contractEntry.chain,
      },
    };

    // Write a final summary JSON in the staging dir.
    try {
      writeFileSync(
        join(duelStaging, "duel-summary.json"),
        JSON.stringify(result, null, 2),
        "utf-8"
      );
    } catch {}

    return result;
  } finally {
    await sandbox.destroyContainer(containerId).catch(() => {});
  }
}

// ---------------------------------------------------------------------
// Single-round implementation
// ---------------------------------------------------------------------

interface RoundDeps {
  roundIndex: number;
  duelRunId: string;
  duelStaging: string;
  sandbox: SandboxManager;
  containerId: string;
  /** Source files where the target filename has been REPLACED with the
   *  current (possibly patched) source. */
  sourceFiles: { filename: string; content: string }[];
  targetSourceFilename: string;
  /** When set, used in lieu of inferContractName(targetSourceFilename, ...). */
  targetContractName?: string;
  /** Optional foundry remappings written into every project's foundry.toml. */
  remappings?: string[];
  originalSource: string;
  currentSource: string;
  contractEntry: DatasetEntry;
  /** Address Red is told to attack. In fresh-address mode this is the
   *  derived fresh address; otherwise it's contractEntry.contractAddress. */
  scanTargetAddress: string;
  /** True when scanTargetAddress was derived by cloning from
   *  redeployFromAddress — i.e. Red's exploit runs against the local container
   *  anvil and verifyPatch must anvil_setCode the patched runtime there. */
  freshAddressMode: boolean;
  reconData?: string;
  redProvider: ProviderConfig;
  redMaxIterations: number;
  redScanTimeoutMs: number;
  blueScanTimeoutMs: number;
  blueProvider: ProviderConfig;
  blueViaClaudeCli: boolean;
  redViaClaudeCli: boolean;
  rpcUrl: string;
}

async function runOneRound(deps: RoundDeps): Promise<DuelRoundResult> {
  const roundStaging = join(deps.duelStaging, `round-${deps.roundIndex}`);
  mkdirSync(roundStaging, { recursive: true });
  const roundArtifacts: DuelRoundResult["artifacts"] = {};

  // ---- 1) Seed Red's scan project — /workspace/scan — with CURRENT source ----
  // Tear down any prior scan dir, copy template, drop Counter stubs, write
  // source files.
  await deps.sandbox.exec(
    deps.containerId,
    "rm -rf /workspace/scan && cp -r /workspace/template /workspace/scan",
    60_000
  );

  // Write foundry.toml with the fork config Red expects.
  const remappingsLine =
    deps.remappings && deps.remappings.length
      ? `remappings = [${deps.remappings.map((r) => `"${r}"`).join(", ")}]\n`
      : "";
  const foundryToml = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
evm_version = "shanghai"
auto_detect_solc = true
${remappingsLine}
[rpc_endpoints]
mainnet = "${deps.rpcUrl}"

[fuzz]
runs = 256
`;
  await deps.sandbox.writeFile(
    deps.containerId,
    "/workspace/scan/foundry.toml",
    foundryToml
  );
  await deps.sandbox.exec(
    deps.containerId,
    "rm -f /workspace/scan/src/Counter.sol /workspace/scan/test/Counter.t.sol /workspace/scan/script/Counter.s.sol || true"
  );
  for (const f of deps.sourceFiles) {
    const path = `/workspace/scan/src/${f.filename}`;
    const dir = path.substring(0, path.lastIndexOf("/"));
    await deps.sandbox.exec(deps.containerId, `mkdir -p "${dir}"`);
    await deps.sandbox.writeFile(deps.containerId, path, f.content);
  }

  // ---- 2) Red scan ----
  const collector = new DataCollector();
  collector.setContractSource(deps.sourceFiles);
  if (deps.reconData) collector.setReconData(deps.reconData);

  const redStart = Date.now();
  const redTarget: ScanTarget = {
    address: deps.scanTargetAddress,
    name: deps.contractEntry.name,
    chain: deps.contractEntry.chain,
    blockNumber: deps.contractEntry.blockNumber,
    sources: deps.sourceFiles,
    reconData: roundAwareRecon(deps.reconData, deps.roundIndex),
  };

  // Mirror Blue's pattern: set the env flag for the scope of the Red call,
  // restore on exit. Mutating process.env globally is fine because Red runs
  // sequentially per round; concurrent duels are not supported by this
  // orchestrator today.
  const priorRedEnv = process.env.RED_VIA_CLAUDE_CLI;
  if (deps.redViaClaudeCli) {
    process.env.RED_VIA_CLAUDE_CLI = "1";
  }

  let redResult;
  try {
    redResult = await runAgent(
      redTarget,
      deps.containerId,
      deps.sandbox,
      {
        provider: deps.redProvider,
        maxIterations: deps.redMaxIterations,
        toolTimeout: 120_000,
        scanTimeout: deps.redScanTimeoutMs,
      },
      (iter, tool) => {
        console.log(`[duel r${deps.roundIndex} red iter ${String(iter).padStart(2, "0")}] ${tool}`);
      },
      collector
    );
  } catch (err: any) {
    console.error(`[duel r${deps.roundIndex}] Red crashed: ${err?.message ?? err}`);
    redResult = {
      report: null,
      rawOutput: "",
      iterations: 0,
      cost: { inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - redStart,
      error: err?.message ?? String(err),
    };
  } finally {
    if (priorRedEnv === undefined) {
      delete process.env.RED_VIA_CLAUDE_CLI;
    } else {
      process.env.RED_VIA_CLAUDE_CLI = priorRedEnv;
    }
  }

  // Persist Red conversation transcript to the round staging dir so
  // audit-trail.ts has a citation source.
  try {
    const redConvoPath = join(roundStaging, "red-conversation.json");
    // Best-effort: pull via collector internals isn't exposed, so we read
    // back via the DataCollector's flush (but flush targets Supabase). For
    // audit grounding we also dump what's retrievable from the container's
    // Exploit.t.sol + forge output.
    const redConvoStub = {
      iterations: redResult.iterations,
      rawOutput: redResult.rawOutput,
      note: "Red conversation transcript (compact). Full messages uploaded to Supabase when persistence is on.",
    };
    writeFileSync(redConvoPath, JSON.stringify(redConvoStub, null, 2), "utf-8");
    roundArtifacts.redConversationPath = redConvoPath;
  } catch {}

  // Pull back exploit file before sandbox reuse.
  const exploitCode = await deps.sandbox.tryReadFile(
    deps.containerId,
    "/workspace/scan/test/Exploit.t.sol"
  );
  if (exploitCode) collector.setExploitCode(exploitCode);

  // ---- 3) If Red didn't find a usable vuln, short-circuit. ----
  if (!redResult.report?.found || !exploitCode) {
    return {
      roundIndex: deps.roundIndex,
      redReport: redResult.report ?? null,
      redIterations: redResult.iterations,
      redCost: redResult.cost,
      redDurationMs: redResult.durationMs,
      blueSuccess: false,
      blueIterations: 0,
      blueCost: { inputTokens: 0, outputTokens: 0 },
      blueDurationMs: 0,
      artifacts: roundArtifacts,
    };
  }

  // ---- 4) Prepare dual project roots for Blue's patch-harness. ----
  const roundTag = `r${deps.roundIndex}`;
  const originalProjectRoot = `/workspace/duel/${roundTag}/original`;
  const patchedProjectRoot = `/workspace/duel/${roundTag}/patched`;

  await seedBlueProjects(
    deps.sandbox,
    deps.containerId,
    originalProjectRoot,
    patchedProjectRoot,
    deps.sourceFiles,
    exploitCode,
    deps.rpcUrl,
    deps.remappings
  );

  // ---- 5) Generate benign suite. ----
  const blueOuterStart = Date.now();
  let benign: GenerateBenignResult | null = null;
  try {
    console.log(`[duel r${deps.roundIndex}] generating benign suite...`);
    benign = await generateBenign({
      sandbox: deps.sandbox,
      sandboxId: deps.containerId,
      originalSource: deps.currentSource,
      sourceFilename: deps.targetSourceFilename,
      exploitReport: redResult.report!,
      originalProjectRoot,
      benignTestPath: "test/Benign.t.sol",
      forkBlockNumber: deps.contractEntry.blockNumber,
      rpcUrl: deps.rpcUrl,
      targetAddress: deps.scanTargetAddress,
      contractName:
        deps.targetContractName ??
        inferContractName(deps.targetSourceFilename, deps.contractEntry.name),
    });
    console.log(
      `[duel r${deps.roundIndex}] benign: ${benign.survivingTests.length} surviving, ${benign.prunedTests.length} pruned`
    );
    // Copy surviving benign into the patched project too.
    await deps.sandbox.writeFile(
      deps.containerId,
      `${patchedProjectRoot}/test/Benign.t.sol`,
      benign.benignSource
    );
  } catch (err: any) {
    console.warn(
      `[duel r${deps.roundIndex}] benign generation failed: ${err?.message ?? err}`
    );
    benign = null;
  }

  // ---- 6) Run Blue ----
  if (deps.blueViaClaudeCli) {
    process.env.BLUE_VIA_CLAUDE_CLI = "1";
  }
  // IMPORTANT: Blue's Claude-CLI branch + verify_patch wrapper assume the
  // default /workspace/harness/ staging dir (verify-args.json is looked up
  // at the fixed default path). Overriding SOLHUNT_HOST_STAGING per-round
  // breaks verify_patch. Instead, let Blue use the default path and COPY
  // stream.ndjson into our per-round dir after it finishes.
  const defaultStaging = "/workspace/harness";
  const priorStaging = process.env.SOLHUNT_HOST_STAGING;
  delete process.env.SOLHUNT_HOST_STAGING;

  let blueResult: BluePatchResult | null = null;
  try {
    blueResult = await runBlueTeam({
      sandbox: deps.sandbox,
      containerId: deps.containerId,
      patchedProjectRoot,
      originalProjectRoot,
      exploitReport: redResult.report!,
      originalSource: deps.currentSource,
      sourceFilename: deps.targetSourceFilename,
      contractName:
        deps.targetContractName ??
        inferContractName(deps.targetSourceFilename, deps.contractEntry.name),
      forkBlockNumber: deps.contractEntry.blockNumber,
      rpcUrl: deps.rpcUrl,
      targetAddress: deps.scanTargetAddress,
      // Fresh-address mode: Red's exploit targets the container's local anvil
      // at scanTargetAddress (bytecode cloned from the real mainnet address).
      // Tell verifyPatch to `anvil_setCode(scanTargetAddress, <variant>)`
      // before each stage so the patched runtime actually ends up on-chain
      // for the exploit run. Without this, Blue's patches look like failures
      // because the test runs against the original cloned bytecode.
      freshAddress: deps.freshAddressMode ? deps.scanTargetAddress : undefined,
      anvilRpcUrl: deps.freshAddressMode ? "http://localhost:8545" : undefined,
      exploitTestPath: "test/Exploit.t.sol",
      benignTestPath: "test/Benign.t.sol",
      config: {
        provider: deps.blueProvider,
        maxIterations: 15,
        toolTimeout: 180_000,
        scanTimeout: deps.blueScanTimeoutMs,
      },
      onIteration: (i, tool) => {
        console.log(
          `[duel r${deps.roundIndex} blue iter ${String(i).padStart(2, "0")}] ${tool}`
        );
      },
    });
  } catch (err: any) {
    console.error(
      `[duel r${deps.roundIndex}] Blue crashed: ${err?.message ?? err}`
    );
    blueResult = null;
  } finally {
    // Restore env.
    if (priorStaging === undefined) {
      delete process.env.SOLHUNT_HOST_STAGING;
    } else {
      process.env.SOLHUNT_HOST_STAGING = priorStaging;
    }
  }

  // The Claude-CLI branch writes claude-stream.ndjson under the DEFAULT
  // staging dir. Snapshot it into the round staging dir so audit-trail can
  // cite it without fighting concurrent rounds.
  const srcStream = join(defaultStaging, "claude-stream.ndjson");
  if (existsSync(srcStream)) {
    const destStream = join(roundStaging, "claude-stream.ndjson");
    try {
      const content = readFileSync(srcStream);
      writeFileSync(destStream, content);
      roundArtifacts.blueStreamPath = destStream;
    } catch {
      roundArtifacts.blueStreamPath = srcStream;
    }
  }

  const patchedSource = blueResult?.finalSource;
  const latestVerify = pickLastVerification(blueResult?.verificationHistory ?? []);

  // Write patch diff + verification artifacts to round staging for audit.
  if (patchedSource) {
    const patchPath = join(roundStaging, "patched.sol");
    writeFileSync(patchPath, patchedSource, "utf-8");
    roundArtifacts.patchPath = patchPath;
  }
  if (latestVerify) {
    const vPath = join(roundStaging, "verification.json");
    writeFileSync(vPath, JSON.stringify(latestVerify, null, 2), "utf-8");
    roundArtifacts.verificationPath = vPath;
  }

  return {
    roundIndex: deps.roundIndex,
    redReport: redResult.report,
    redIterations: redResult.iterations,
    redCost: redResult.cost,
    redDurationMs: redResult.durationMs,
    blueSuccess: !!blueResult?.success,
    blueIterations: blueResult?.iterations ?? 0,
    blueCost: blueResult?.cost ?? { inputTokens: 0, outputTokens: 0 },
    blueDurationMs: Date.now() - blueOuterStart,
    blueRationale: blueResult?.rationale,
    verification: latestVerify,
    patchedSource,
    artifacts: roundArtifacts,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Deterministic fresh address derivation for duel runs. Uses the same scheme
 * as scripts/redeploy-defihacklabs.ts (`solhunt-fresh:v1:<index>:<name>`) but
 * pinned to `index=0` because each duel runs against a single contract and
 * does its own in-container clone — no dependency on the precomputed
 * benchmark/dataset-fresh.json mapping (where Dexible happens to live at
 * index=2 because of its position in the source dataset).
 *
 * The address only needs to:
 *   1. Be free of any real mainnet contract (a 20-byte keccak slice is
 *      effectively guaranteed not to collide).
 *   2. Stay constant across rounds of the same duel (so anvil_setCode in
 *      round N≥2 overwrites the same slot Red attacked in round 0).
 */
function deriveDuelFreshAddress(name: string): string {
  const seed = `solhunt-fresh:v1:0:${name}`;
  const h = sha3.keccak_256(new TextEncoder().encode(seed));
  return `0x${h.slice(0, 40)}`;
}

/**
 * Find the most recent prior round whose Blue patch produced both a green
 * verification AND a non-empty patched source on disk. Used for round N≥2's
 * patched-bytecode injection.
 */
function findLastPatchedRound(
  rounds: DuelRoundResult[]
): DuelRoundResult | undefined {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = rounds[i];
    if (r.blueSuccess && r.patchedSource) return r;
  }
  return undefined;
}

/**
 * Call anvil_setCode against the container's private anvil. Bytecode hex must
 * be 0x-prefixed. We single-quote the JSON-shaped argv so cast rpc forwards
 * it as a string literal.
 */
async function castSetCode(
  sandbox: SandboxManager,
  containerId: string,
  address: string,
  runtimeBytecodeHex: string
): Promise<void> {
  const code = runtimeBytecodeHex.startsWith("0x")
    ? runtimeBytecodeHex
    : `0x${runtimeBytecodeHex}`;
  if (code.length < 4) {
    throw new Error(
      `castSetCode: refusing to setCode to empty bytecode at ${address}`
    );
  }
  const cmd =
    `cast rpc anvil_setCode '${address}' '${code}' --rpc-url http://localhost:8545`;
  const res = await sandbox.exec(containerId, cmd, 60_000);
  if (res.exitCode !== 0) {
    throw new Error(
      `cast rpc anvil_setCode failed (exit ${res.exitCode}): ` +
        (res.stderr || res.stdout).slice(0, 500)
    );
  }
  // Verify the write landed.
  const verify = await sandbox.exec(
    containerId,
    `cast code '${address}' --rpc-url http://localhost:8545 | head -c 80`,
    30_000
  );
  if (verify.exitCode !== 0 || !verify.stdout.trim().startsWith("0x")) {
    throw new Error(
      `castSetCode: post-write verify failed for ${address}: ${(verify.stderr || verify.stdout).slice(0, 200)}`
    );
  }
}

function findTargetSource(
  files: { filename: string; content: string }[],
  target: string
): string | undefined {
  return files.find((f) => f.filename === target)?.content;
}

function cloneSourceFilesWithOverride(
  files: { filename: string; content: string }[],
  targetFilename: string,
  newContent: string
): { filename: string; content: string }[] {
  return files.map((f) =>
    f.filename === targetFilename ? { ...f, content: newContent } : { ...f }
  );
}

function roundAwareRecon(
  recon: string | undefined,
  roundIndex: number
): string | undefined {
  if (roundIndex === 0) return recon;
  const suffix = `\n\n## Round ${roundIndex + 1} note\nThe source you are scanning has been PATCHED by the Blue team in prior rounds. Treat prior vulnerabilities as potentially fixed and hunt for fresh bugs or incomplete patches.`;
  return (recon ?? "") + suffix;
}

function inferContractName(filename: string, fallback: string): string {
  // "Dexible.sol" -> "Dexible". Falls back to entry name.
  const base = filename.split("/").pop() ?? filename;
  const stripped = base.replace(/\.sol$/i, "");
  return stripped || fallback;
}

async function seedBlueProjects(
  sandbox: SandboxManager,
  containerId: string,
  originalRoot: string,
  patchedRoot: string,
  sources: { filename: string; content: string }[],
  exploitTestContent: string,
  rpcUrl: string,
  remappings?: string[]
): Promise<void> {
  const remappingsLine =
    remappings && remappings.length
      ? `remappings = [${remappings.map((r) => `"${r}"`).join(", ")}]\n`
      : "";
  const foundryToml = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
evm_version = "shanghai"
auto_detect_solc = true
${remappingsLine}
[rpc_endpoints]
mainnet = "${rpcUrl}"

[fuzz]
runs = 256
`;
  for (const root of [originalRoot, patchedRoot]) {
    await sandbox.exec(
      containerId,
      `rm -rf '${root}' && mkdir -p '${root}' && cp -r /workspace/template/. '${root}/' && rm -f '${root}'/src/Counter.sol '${root}'/test/Counter.t.sol '${root}'/script/Counter.s.sol || true`,
      60_000
    );
    await sandbox.writeFile(containerId, `${root}/foundry.toml`, foundryToml);
    for (const f of sources) {
      const path = `${root}/src/${f.filename}`;
      const dir = path.substring(0, path.lastIndexOf("/"));
      await sandbox.exec(containerId, `mkdir -p "${dir}"`);
      await sandbox.writeFile(containerId, path, f.content);
    }
    await sandbox.writeFile(
      containerId,
      `${root}/test/Exploit.t.sol`,
      exploitTestContent
    );
  }
}

function pickLastVerification(
  history: PatchVerification[]
): PatchVerification | undefined {
  return history.length > 0 ? history[history.length - 1] : undefined;
}

function duelStagingInContainer(root: string, duelRunId: string): string {
  return `${root.replace(/\\/g, "/")}/duel-${duelRunId.slice(0, 8)}`;
}

// ---------------------------------------------------------------------
// Provider defaults
// ---------------------------------------------------------------------

function defaultRedProvider(): ProviderConfig {
  if (process.env.SOLHUNT_PROVIDER) {
    const preset = resolveProvider(process.env.SOLHUNT_PROVIDER);
    hydrateApiKey(preset);
    if (process.env.RED_MODEL) preset.model = process.env.RED_MODEL;
    return preset;
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      model:
        process.env.RED_MODEL ?? "anthropic/claude-sonnet-4-6",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: process.env.RED_MODEL ?? "claude-sonnet-4-6",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  throw new Error(
    "No Red provider available. Set SOLHUNT_PROVIDER+key, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY."
  );
}

function defaultBlueProvider(): ProviderConfig {
  // Blue-via-claude-cli ignores most of this, but runBlueTeam still passes a
  // ProviderConfig into the args for OpenRouter fallback. Reuse the same
  // logic as Red's default but prefer BLUE_MODEL.
  if (process.env.SOLHUNT_PROVIDER) {
    const preset = resolveProvider(process.env.SOLHUNT_PROVIDER);
    hydrateApiKey(preset);
    if (process.env.BLUE_MODEL) preset.model = process.env.BLUE_MODEL;
    return preset;
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      model:
        process.env.BLUE_MODEL ?? "anthropic/claude-sonnet-4-6",
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
  // Blue-via-claude-cli doesn't *need* the provider object to have a real
  // key; runBlueTeamViaClaudeCli never calls chatCompletion. Return a stub.
  return {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4-6",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "unused-when-BLUE_VIA_CLAUDE_CLI=1",
  };
}

function hydrateApiKey(p: ProviderConfig): void {
  if (p.provider === "openrouter" && !p.apiKey && process.env.OPENROUTER_API_KEY) {
    p.apiKey = process.env.OPENROUTER_API_KEY;
  }
  if (p.provider === "openai" && !p.apiKey && process.env.OPENAI_API_KEY) {
    p.apiKey = process.env.OPENAI_API_KEY;
  }
  if (p.provider === "anthropic" && !p.apiKey && process.env.ANTHROPIC_API_KEY) {
    p.apiKey = process.env.ANTHROPIC_API_KEY;
  }
}

// ---------------------------------------------------------------------
// Supabase persistence
// ---------------------------------------------------------------------

async function persistRound(
  sb: SupabaseClient,
  duelRunId: string,
  args: DuelArgs,
  round: DuelRoundResult
): Promise<void> {
  // Ensure a duel_runs row exists (idempotent upsert on PK).
  const { error: duelUpsertErr } = await sb.from("duel_runs").upsert(
    {
      id: duelRunId,
      dataset_split: args.datasetSplit,
      max_rounds: args.maxRounds ?? 3,
      rounds_executed: round.roundIndex + 1,
      convergence: "running",
      hostname: hostname(),
    },
    { onConflict: "id" }
  );
  if (duelUpsertErr) {
    console.error(`[duel] duel_runs upsert error: ${duelUpsertErr.message}`);
  }

  // duel_rounds row.
  const v = round.verification;
  const payload: Record<string, unknown> = {
    duel_run_id: duelRunId,
    round_index: round.roundIndex,
    red_found: !!round.redReport?.found,
    red_vuln_class: round.redReport?.vulnerability?.class,
    blue_success: round.blueSuccess,
    exploit_neutralized: v?.exploitNeutralized ?? null,
    benign_passed: v?.benignPassed ?? null,
    fresh_attacker_neutralized: v?.freshAttackerNeutralized ?? null,
    storage_layout_changed: v?.storageLayoutChanged ?? null,
    patch_rationale: round.blueRationale?.slice(0, 4000),
    audit_entry: round.auditEntry ? (round.auditEntry as unknown) : null,
    round_duration_ms: round.redDurationMs + round.blueDurationMs,
  };
  const { error: roundErr } = await sb.from("duel_rounds").upsert(payload, {
    onConflict: "duel_run_id,round_index",
  });
  if (roundErr) {
    console.error(`[duel] duel_rounds upsert error: ${roundErr.message}`);
  }
}
