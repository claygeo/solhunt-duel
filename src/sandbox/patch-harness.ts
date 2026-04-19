import { SandboxManager } from "./manager.js";

/**
 * Result of verifying a Blue-team patch against a Red-team exploit.
 *
 * This is the primitive the Blue agent will call after it produces a patched
 * source tree. It does not care *how* the patch was written — source diff,
 * full rewrite, whatever. All it knows is "build this, etch it on the fork
 * address, make sure the exploit dies and nothing else breaks."
 */
export interface PatchVerification {
  /** Red's exploit test reverted/failed on the patched bytecode. */
  exploitNeutralized: boolean;
  /** Every benign/happy-path test passed. */
  benignPassed: boolean;
  /** Names of benign tests that regressed. Empty iff benignPassed is true. */
  regressions: string[];
  /** True if any existing storage slot/offset/type changed between original
   *  and patched source. Patches may append new storage; they may not reorder
   *  or resize existing storage. */
  storageLayoutChanged: boolean;
  /** True if the exploit also fails when run from a freshly-derived attacker
   *  EOA. Defeats "just ban the known attacker address" pseudo-patches. */
  freshAttackerNeutralized: boolean;
  /** Populated iff a structural problem (build failure, vm.etch incompat,
   *  missing contract name, ...) prevented a clean verdict. */
  error?: string;
}

export interface VerifyPatchArgs {
  /** Existing sandbox/manager.ts container id. */
  sandboxId: string;
  /** Target contract address (e.g. "0xDE62..."). Etched with patched runtime. */
  targetAddress: string;
  /** Mainnet fork block number. */
  forkBlockNumber: number;
  /** Contract name to extract runtime bytecode for. */
  contractName: string;
  /** Root of the original (unpatched) Foundry project inside the container. */
  originalSourcePath: string;
  /** Root of Blue's patched Foundry project inside the container. */
  patchedSourcePath: string;
  /** Path to Red's Exploit.t.sol relative to each project root. */
  exploitTestPath: string;
  /** Path to the benign test suite relative to each project root. */
  benignTestPath: string;
  /** Ethereum JSON-RPC URL passed through to Foundry. */
  rpcUrl: string;
  /**
   * Optional fresh-address mode plumbing. When set, verifyPatch treats the
   * address as a fork-local target: before each forge test run it calls
   * `anvil_setCode(freshAddress, <correct bytecode>)` against the container's
   * anvil so the exploit picks up the right variant. Exploit tests written by
   * Red in fresh-address mode target localhost:8545 directly (not the
   * mainnet URL) and rely on whatever bytecode currently lives at the fresh
   * address. Without this injection the patched runtime is never observed by
   * the test and Blue's correct patches look like failures.
   *
   * The URL defaults to http://localhost:8545 (the container anvil Red's
   * tests are pointed at).
   */
  freshAddress?: string;
  anvilRpcUrl?: string;
}

export interface BuildArtifact {
  runtimeBytecode: string; // "0x..."
  storageLayout: unknown;
}

interface ForgeTestSummary {
  passed: boolean;
  failedTests: string[];
  raw: string;
}

interface StorageEntry {
  label: string;
  slot: string;
  offset: number;
  type: string;
}

/**
 * Primary entry point. Builds original + patched Solidity trees, extracts
 * runtime bytecode, etches each into a forked mainnet via the existing
 * Solidity tests, runs them, and returns a structured verdict.
 */
export async function verifyPatch(
  sandbox: SandboxManager,
  args: VerifyPatchArgs
): Promise<PatchVerification> {
  const result: PatchVerification = {
    exploitNeutralized: false,
    benignPassed: false,
    regressions: [],
    storageLayoutChanged: false,
    freshAttackerNeutralized: false,
  };

  try {
    // 1. Build original and patched sources, extract runtime bytecode +
    //    storage layout for the target contract in each.
    const [original, patched] = await Promise.all([
      buildAndExtract(sandbox, args.sandboxId, args.originalSourcePath, args.contractName),
      buildAndExtract(sandbox, args.sandboxId, args.patchedSourcePath, args.contractName),
    ]);

    // vm.etch only touches code, not storage. If the patched contract
    // reordered or resized existing fields, the live contract's storage
    // would be reinterpreted under the new layout and reads would corrupt.
    result.storageLayoutChanged = compareStorageLayouts(
      original.storageLayout,
      patched.storageLayout
    );

    // Fresh-address mode: Red's exploit test in duel-mode targets the
    // container's local anvil fork (http://localhost:8545) where we cloned
    // the original runtime bytecode onto a deterministic fresh address at
    // scan-setup time. The env-var + `vm.etch` swap the env-supplied
    // DEXIBLE_RUNTIME_BYTECODE pattern assumes is only useful when the test
    // source itself reads that env. Red's real-source exploits typically
    // don't — they just call the contract at the fresh address on the fork.
    // So we have to change the code at the fresh address itself, between
    // runs, via anvil_setCode. anvilRpcUrl defaults to the container's
    // in-process anvil.
    const anvilRpc = args.anvilRpcUrl ?? "http://localhost:8545";
    const useFreshAddress = typeof args.freshAddress === "string" && /^0x[0-9a-fA-F]{40}$/.test(args.freshAddress);
    // When using fresh-address mode we also instruct forge to use the local
    // anvil as the fork source, matching what Red's exploit writer saw.
    const forgeForkUrl = useFreshAddress ? anvilRpc : undefined;

    // 2. Sanity check: on the ORIGINAL bytecode the exploit should pass.
    //    If it doesn't, either Red's test is wrong or vm.etch is dropping
    //    constructor-initialized state (immutables, initializer storage).
    if (useFreshAddress) {
      await anvilSetCode(sandbox, args.sandboxId, args.freshAddress!, original.runtimeBytecode, anvilRpc);
    }
    const sanity = await runForgeTest(sandbox, args.sandboxId, {
      projectRoot: args.patchedSourcePath, // reuse the patched project for deps
      testPath: args.exploitTestPath,
      forkUrl: forgeForkUrl,
      env: {
        ETH_RPC_URL: args.rpcUrl,
        DEXIBLE_FORK_BLOCK: String(args.forkBlockNumber),
        DEXIBLE_RUNTIME_BYTECODE: original.runtimeBytecode,
        DEXIBLE_ATTACKER_LABEL: "attacker",
      },
    });
    if (!sanity.passed) {
      result.error = [
        "Baseline sanity failed: exploit did NOT pass on the ORIGINAL bytecode.",
        "Either vm.etch is dropping constructor-initialized state (immutables,",
        "initializer-only storage writes, proxy delegatecall patterns) or the",
        "exploit harness does not faithfully reproduce the vulnerability.",
        "First 2KB of forge output:",
        sanity.raw.slice(0, 2_000),
      ].join("\n");
      return result;
    }

    // 3. Run exploit against the PATCHED bytecode. Expect failure.
    if (useFreshAddress) {
      await anvilSetCode(sandbox, args.sandboxId, args.freshAddress!, patched.runtimeBytecode, anvilRpc);
    }
    const exploitPatched = await runForgeTest(sandbox, args.sandboxId, {
      projectRoot: args.patchedSourcePath,
      testPath: args.exploitTestPath,
      forkUrl: forgeForkUrl,
      env: {
        ETH_RPC_URL: args.rpcUrl,
        DEXIBLE_FORK_BLOCK: String(args.forkBlockNumber),
        DEXIBLE_RUNTIME_BYTECODE: patched.runtimeBytecode,
        DEXIBLE_ATTACKER_LABEL: "attacker",
      },
    });
    result.exploitNeutralized = !exploitPatched.passed;

    // 4. Fresh-attacker re-run. Same exploit, different attacker label ->
    //    different EOA. If the patch is a narrow address blocklist it will
    //    pass here and we'll know.
    if (useFreshAddress) {
      // Bytecode already set to patched above; re-assert defensively in case
      // the previous exploit run mutated state via state-changing calls.
      await anvilSetCode(sandbox, args.sandboxId, args.freshAddress!, patched.runtimeBytecode, anvilRpc);
    }
    const exploitFresh = await runForgeTest(sandbox, args.sandboxId, {
      projectRoot: args.patchedSourcePath,
      testPath: args.exploitTestPath,
      forkUrl: forgeForkUrl,
      env: {
        ETH_RPC_URL: args.rpcUrl,
        DEXIBLE_FORK_BLOCK: String(args.forkBlockNumber),
        DEXIBLE_RUNTIME_BYTECODE: patched.runtimeBytecode,
        DEXIBLE_ATTACKER_LABEL: "fresh_attacker_0xf00d",
      },
    });
    result.freshAttackerNeutralized = !exploitFresh.passed;

    // 5. Run benign suite on the patched bytecode. Expect full pass.
    if (useFreshAddress) {
      await anvilSetCode(sandbox, args.sandboxId, args.freshAddress!, patched.runtimeBytecode, anvilRpc);
    }
    const benignRun = await runForgeTest(sandbox, args.sandboxId, {
      projectRoot: args.patchedSourcePath,
      testPath: args.benignTestPath,
      forkUrl: forgeForkUrl,
      env: {
        ETH_RPC_URL: args.rpcUrl,
        DEXIBLE_FORK_BLOCK: String(args.forkBlockNumber),
        DEXIBLE_RUNTIME_BYTECODE: patched.runtimeBytecode,
        DEXIBLE_PATCHED: "1",
      },
    });
    result.benignPassed = benignRun.passed;
    result.regressions = benignRun.failedTests;

    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}

/**
 * Inject bytecode onto an address inside the container's running anvil via
 * `cast rpc anvil_setCode`. Used in fresh-address mode to swap the ORIGINAL
 * vs. PATCHED runtime between verify stages so Red's exploit is re-run
 * against the CORRECT bytecode at each step.
 *
 * Kept separate from (but functionally mirroring) duel/orchestrator.ts's
 * `castSetCode`; deduping would drag a cycle between sandbox/ and duel/ and
 * break the patch-harness-cli's standalone entry point.
 */
async function anvilSetCode(
  sandbox: SandboxManager,
  sandboxId: string,
  address: string,
  runtimeBytecodeHex: string,
  anvilRpcUrl: string
): Promise<void> {
  const code = runtimeBytecodeHex.startsWith("0x")
    ? runtimeBytecodeHex
    : `0x${runtimeBytecodeHex}`;
  if (code.length < 4) {
    throw new Error(
      `anvilSetCode: refusing to setCode to empty bytecode at ${address}`
    );
  }
  const cmd = `cast rpc anvil_setCode '${address}' '${code}' --rpc-url '${anvilRpcUrl}'`;
  const res = await sandbox.exec(sandboxId, cmd, 60_000);
  if (res.exitCode !== 0) {
    throw new Error(
      `anvil_setCode failed for ${address} (exit ${res.exitCode}): ` +
        (res.stderr || res.stdout).slice(0, 500)
    );
  }
}

// ---------------------------------------------------------------------
// build + extract
// ---------------------------------------------------------------------

/**
 * Exported so the duel orchestrator can extract patched runtime bytecode and
 * inject it into the fresh address via `anvil_setCode` before round-N≥2's
 * Red scan. Mirrors the same forge-build + artifact-read flow used internally
 * by verifyPatch.
 */
export async function buildAndExtract(
  sandbox: SandboxManager,
  sandboxId: string,
  projectRoot: string,
  contractName: string
): Promise<BuildArtifact> {
  const build = await sandbox.exec(
    sandboxId,
    `cd '${projectRoot}' && forge build --extra-output storageLayout 2>&1`,
    180_000
  );
  if (build.exitCode !== 0) {
    throw new Error(
      `forge build failed in ${projectRoot} (exit ${build.exitCode}):\n${(
        build.stdout +
        "\n" +
        build.stderr
      ).slice(-3_000)}`
    );
  }

  const artifactPath = `${projectRoot}/out/${contractName}.sol/${contractName}.json`;
  const raw = await sandbox.tryReadFile(sandboxId, artifactPath);
  if (!raw) {
    throw new Error(`Artifact not found at ${artifactPath} after build`);
  }

  let parsed: {
    deployedBytecode?: { object?: string };
    storageLayout?: unknown;
  };
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse ${artifactPath}: ${e}`);
  }

  const code = parsed.deployedBytecode?.object;
  if (typeof code !== "string" || code.length < 4) {
    throw new Error(
      `deployedBytecode.object missing or empty in ${artifactPath}`
    );
  }
  const runtimeBytecode = code.startsWith("0x") ? code : `0x${code}`;

  let storageLayout: unknown = parsed.storageLayout;
  if (!storageLayout) {
    // Fall back to an explicit `forge inspect` if the build artifact didn't
    // include storageLayout (older forge, different extra_output wiring).
    const inspect = await sandbox.exec(
      sandboxId,
      `cd '${projectRoot}' && forge inspect ${contractName} storageLayout --json 2>&1`,
      60_000
    );
    if (inspect.exitCode === 0 && inspect.stdout.trim().length > 0) {
      try {
        storageLayout = JSON.parse(inspect.stdout);
      } catch {
        storageLayout = null;
      }
    }
  }

  return { runtimeBytecode, storageLayout };
}

// ---------------------------------------------------------------------
// storage layout comparison
// ---------------------------------------------------------------------

/**
 * Returns true if an EXISTING slot/offset/type has changed (bad).
 * Returns false if the patched layout is a superset (appended new fields
 * only; safe for vm.etch on a live contract).
 *
 * Storage layout JSON shape (solc):
 *   { storage: [ { label, slot, offset, type }, ... ], types: { ... } }
 */
function compareStorageLayouts(original: unknown, patched: unknown): boolean {
  const orig = coerceLayout(original);
  const pat = coerceLayout(patched);
  if (!orig || !pat) return false; // can't prove a change — treat as unchanged

  const patByLabel = new Map<string, StorageEntry>();
  for (const entry of pat) patByLabel.set(entry.label, entry);

  for (const o of orig) {
    const p = patByLabel.get(o.label);
    if (!p) return true; // existing field disappeared
    if (p.slot !== o.slot || p.offset !== o.offset || p.type !== o.type) {
      return true;
    }
  }
  return false; // patched may add entries; fine.
}

function coerceLayout(raw: unknown): StorageEntry[] | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { storage?: unknown };
  if (!Array.isArray(obj.storage)) return null;
  const out: StorageEntry[] = [];
  for (const item of obj.storage) {
    if (!item || typeof item !== "object") continue;
    const r = item as {
      label?: unknown;
      slot?: unknown;
      offset?: unknown;
      type?: unknown;
    };
    if (
      typeof r.label !== "string" ||
      typeof r.type !== "string" ||
      (typeof r.slot !== "string" && typeof r.slot !== "number") ||
      typeof r.offset !== "number"
    ) {
      continue;
    }
    out.push({
      label: r.label,
      slot: String(r.slot),
      offset: r.offset,
      type: r.type,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// forge test execution
// ---------------------------------------------------------------------

async function runForgeTest(
  sandbox: SandboxManager,
  sandboxId: string,
  opts: {
    projectRoot: string;
    testPath: string;
    env: Record<string, string>;
    /** When set, forge is invoked with `--fork-url <forkUrl>` so tests that
     *  don't explicitly `vm.createSelectFork(...)` still pick up the right
     *  chain state. Required in fresh-address mode — Red's exploit tests
     *  target the container anvil, not the real mainnet URL in ETH_RPC_URL. */
    forkUrl?: string;
  }
): Promise<ForgeTestSummary> {
  const envPrefix = Object.entries(opts.env)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(" ");
  const forkUrlArg = opts.forkUrl
    ? ` --fork-url '${opts.forkUrl}'`
    : "";

  // `forge test --json` emits a single JSON object on success/failure both.
  // Route forge's own stderr into a file so it doesn't clobber the JSON.
  // `|| true` so we get the JSON even when tests fail (non-zero exit).
  const result = await sandbox.exec(
    sandboxId,
    `cd '${opts.projectRoot}' && ${envPrefix} forge test --match-path '${opts.testPath}'${forkUrlArg} -vv --json 2>/tmp/forge.err; echo "__exit:$?"`,
    600_000
  );

  const rawStdout = result.stdout;
  const failedTests: string[] = [];
  let anyPassed = false;
  let sawAnyTest = false;

  const parsed = tryParseForgeJson(rawStdout);
  if (parsed) {
    for (const contractKey of Object.keys(parsed)) {
      const contract = parsed[contractKey];
      if (!contract || typeof contract !== "object") continue;
      const tests = (contract as { test_results?: Record<string, { status?: string }> })
        .test_results;
      if (!tests) continue;
      for (const [name, tr] of Object.entries(tests)) {
        sawAnyTest = true;
        if (tr && tr.status === "Success") {
          anyPassed = true;
        } else {
          failedTests.push(name);
        }
      }
    }
  }

  if (!sawAnyTest) {
    const combo = rawStdout + "\n" + result.stderr;
    const passMatch = combo.match(/\bTest result: ok\.\s+(\d+)\s+passed/);
    const failMatch = combo.match(/\bTest result:[^\n]*\b(\d+)\s+failed/);
    anyPassed = !!passMatch && Number(passMatch[1] || 0) > 0;
    if (failMatch && Number(failMatch[1] || 0) > 0) {
      failedTests.push("(see raw output)");
    }
    sawAnyTest = !!passMatch || !!failMatch;
  }

  return {
    passed: sawAnyTest && failedTests.length === 0 && anyPassed,
    failedTests,
    raw: rawStdout + "\n----stderr----\n" + result.stderr,
  };
}

function tryParseForgeJson(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  const candidate = stdout.slice(start);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const end = stdout.lastIndexOf("}");
    if (end <= start) return null;
    try {
      return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function shellQuote(v: string): string {
  return `'${v.replace(/'/g, "'\\''")}'`;
}
