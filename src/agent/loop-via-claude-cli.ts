import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  createWriteStream,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { buildAnalysisPrompt } from "./prompts.js";
import type { ScanTarget, AgentConfig, AgentResult } from "./loop.js";
import { SandboxManager } from "../sandbox/manager.js";
import type { ExploitReport } from "../reporter/format.js";
import type { DataCollector } from "../storage/collector.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RED_PROMPT_PATH = resolve(__dirname, "./red-prompt.md");

// ---------------------------------------------------------------------
// Public entry — mirrors runAgent's signature so loop.ts can delegate.
// ---------------------------------------------------------------------
//
// Gated by RED_VIA_CLAUDE_CLI=1. Runs Red through one `claude -p` invocation
// on the Max subscription (Opus 4.7). Same Option A architecture as Blue:
// Claude edits host staging files; a forge wrapper + cast wrapper shell into
// the existing solhunt-sandbox container for actual forge/cast work. After
// Claude exits (or times out) the harness runs one authoritative
// `forge test --match-path test/Exploit.t.sol` via exploit-harness-cli.ts and
// returns the verdict as an AgentResult.
//
// Fallback path: if Claude exits without emitting the report markers but
// test/Exploit.t.sol exists on disk, reuse the authoritative forge verdict as
// the report. This makes Red MORE resilient than the OpenRouter path, which
// drops the scan when no markers are emitted.

export async function runRedTeamViaClaudeCli(
  target: ScanTarget,
  containerId: string,
  sandbox: SandboxManager,
  config: AgentConfig,
  _onIteration?: (iteration: number, toolName: string) => void,
  _collector?: DataCollector,
): Promise<AgentResult> {
  const t0 = Date.now();
  const hostStagingRoot =
    process.env.SOLHUNT_HOST_STAGING_RED ??
    process.env.SOLHUNT_HOST_STAGING ??
    "/workspace/harness-red";
  const hostScanRoot = join(hostStagingRoot, "scan");
  const hostBinDir = join(hostStagingRoot, "bin");
  const hostPromptPath = join(hostStagingRoot, "red-prompt.txt");
  const hostExploitArgsPath = join(hostStagingRoot, "exploit-args.json");
  const hostStreamPath = join(hostStagingRoot, "claude-stream.ndjson");

  // 1. Seed host staging dir with scan/src + empty test + foundry.toml.
  mkdirSync(join(hostScanRoot, "src"), { recursive: true });
  mkdirSync(join(hostScanRoot, "test"), { recursive: true });
  mkdirSync(hostBinDir, { recursive: true });
  for (const src of target.sources) {
    const srcPath = join(hostScanRoot, "src", src.filename);
    mkdirSync(dirname(srcPath), { recursive: true });
    writeFileSync(srcPath, src.content, "utf-8");
  }
  writeFileSync(
    join(hostScanRoot, "foundry.toml"),
    buildFoundryToml(),
    "utf-8",
  );

  // 2. Pick primary source filename (for exploit-args).
  const primaryFilename = target.sources[0]?.filename ?? `${target.name}.sol`;

  // 3. Stash the args file exploit-harness-cli.ts will read for the final
  //    authoritative verdict.
  const exploitArgs = {
    containerId,
    targetAddress: target.address,
    forkBlockNumber: target.blockNumber ?? 0,
    contractName: target.name,
    sourceFilename: primaryFilename,
    rpcUrl: process.env.ETH_RPC_URL ?? "",
    hostScanRoot,
    containerScanRoot: "/workspace/scan",
  };
  writeFileSync(
    hostExploitArgsPath,
    JSON.stringify(exploitArgs, null, 2),
    "utf-8",
  );

  // 4. Install forge + cast + run_exploit wrappers on PATH. They shell into
  //    the solhunt-sandbox container via `docker exec`.
  installForgeCastWrappers(hostBinDir, containerId, hostScanRoot);

  // 5. Build the prompt file (red-prompt.md + the usual analysis prompt +
  //    CLI-specific addendum).
  const systemPrompt = readFileSync(RED_PROMPT_PATH, "utf-8");
  const analysisPrompt = buildAnalysisPrompt({
    contractAddress: target.address,
    contractName: target.name,
    chain: target.chain,
    blockNumber: target.blockNumber,
    sourceFiles: target.sources,
    reconData: target.reconData,
  });
  const cliAddendum = `

## How this session runs

You are a single \`claude -p\` invocation. Your tools are Read, Edit, Write,
and Bash. There is NO outer tool-calling loop.

**Working directory:** \`${hostScanRoot}\`
**Target test file:** \`${hostScanRoot}/test/Exploit.t.sol\`
**Source tree:** \`${hostScanRoot}/src/${primaryFilename}\`

\`forge\` and \`cast\` on PATH are shell wrappers that sync your workspace
into the sandbox and run the real tools there against the live anvil fork at
\`http://localhost:8545\`. Just call them like plain \`forge build\` /
\`forge test --match-path test/Exploit.t.sol -vv\` / \`cast call <addr>
<sig>\` via Bash.

When the test is green, emit the \`===SOLHUNT_REPORT_START===\`/
\`===SOLHUNT_REPORT_END===\` block as the last thing in your response.
`;
  const fullPrompt = `${systemPrompt}\n\n${analysisPrompt}${cliAddendum}`;
  writeFileSync(hostPromptPath, fullPrompt, "utf-8");

  // 6. Spawn claude -p. Mirrors Blue's config exactly.
  const deadlineMs = config.scanTimeout ?? 20 * 60_000;
  const spawnResult = await spawnRedClaudeCli({
    promptPath: hostPromptPath,
    streamPath: hostStreamPath,
    cwd: hostScanRoot,
    timeoutMs: deadlineMs,
  });

  // 7. AUTHORITATIVE verdict: re-run forge test via exploit-harness-cli
  //    regardless of what Claude said. This is the "more resilient than
  //    OpenRouter path" guarantee from the dispatch.
  const exploitTestPath = join(hostScanRoot, "test", "Exploit.t.sol");
  const testExistsOnDisk = existsSync(exploitTestPath);

  let authoritativeVerdict: { passed: boolean; output: string; valueAtRisk: string | null } = {
    passed: false,
    output: "Exploit.t.sol not found on disk; Claude did not write it.",
    valueAtRisk: null,
  };
  if (testExistsOnDisk) {
    try {
      authoritativeVerdict = await runAuthoritativeForgeVerdict(sandbox, {
        ...exploitArgs,
      });
    } catch (err: any) {
      process.stderr.write(`[red-cli] authoritative verdict THREW: ${err?.stack ?? err?.message ?? String(err)}\n`);
      authoritativeVerdict = {
        passed: false,
        output: `exploit-harness-cli failed: ${err?.message ?? String(err)}`,
        valueAtRisk: null,
      };
    }
  }

  // 8. Extract Claude's ExploitReport JSON from markers if present, else fall
  //    back to a synthesized report from the forge verdict + on-disk test.
  const streamLastAssistant = extractLastAssistantText(hostStreamPath);
  const parsedReport = parseReportFromText(streamLastAssistant);

  const report: ExploitReport | null = synthesizeReport({
    parsed: parsedReport,
    target,
    authoritativeVerdict,
    testExistsOnDisk,
  });

  const streamSummary = summarizeClaudeStream(hostStreamPath);

  const dtMs = Date.now() - t0;
  console.error(
    `[red-cli] done in ${(dtMs / 1000).toFixed(1)}s; claude exit=${spawnResult.exitCode}, ` +
      `turns=${streamSummary.numTurns ?? "?"}, notional_usd=${streamSummary.notionalCostUsd ?? "?"}, ` +
      `timedOut=${spawnResult.timedOut}, forge_passed=${authoritativeVerdict.passed}, ` +
      `wroteTest=${testExistsOnDisk}`,
  );

  return {
    report,
    rawOutput: streamLastAssistant ?? "",
    iterations: streamSummary.numTurns ?? 1,
    cost: { inputTokens: 0, outputTokens: 0 },
    durationMs: dtMs,
    error: buildRedError({
      spawnResult,
      testExistsOnDisk,
      authoritativeVerdict,
      deadlineMs,
      reportParsed: !!parsedReport,
    }),
    // Telemetry parity with Blue.
    ...(typeof streamSummary.notionalCostUsd === "number"
      ? { claudeNotionalCostUsd: streamSummary.notionalCostUsd }
      : {}),
  } as AgentResult & { claudeNotionalCostUsd?: number };
}

// ---------------------------------------------------------------------
// Wrapper install — forge + cast + run_exploit
// ---------------------------------------------------------------------

function installForgeCastWrappers(
  hostBinDir: string,
  containerId: string,
  hostScanRoot: string,
): void {
  // forge wrapper: sync host src/ + test/ into container, then `docker exec`
  // forge inside the container. `docker exec` supports argv directly so we
  // avoid `bash -c "$*"` — that eats quoting around e.g. `"logic()"`.
  const forgeWrapper = `#!/bin/sh
set -e
CONTAINER='${containerId}'
HOST_ROOT='${hostScanRoot}'
CONTAINER_ROOT=/workspace/scan
docker exec "$CONTAINER" sh -c "mkdir -p $CONTAINER_ROOT/src $CONTAINER_ROOT/test && rm -f $CONTAINER_ROOT/test/Exploit.t.sol"
if [ -d "$HOST_ROOT/src" ]; then
  docker cp "$HOST_ROOT/src/." "$CONTAINER:$CONTAINER_ROOT/src/"
fi
if [ -d "$HOST_ROOT/test" ]; then
  docker cp "$HOST_ROOT/test/." "$CONTAINER:$CONTAINER_ROOT/test/"
fi
exec docker exec -w "$CONTAINER_ROOT" "$CONTAINER" forge "$@"
`;
  const castWrapper = `#!/bin/sh
set -e
CONTAINER='${containerId}'
exec docker exec "$CONTAINER" cast "$@"
`;
  writeAndChmod(join(hostBinDir, "forge"), forgeWrapper);
  writeAndChmod(join(hostBinDir, "cast"), castWrapper);
}

function writeAndChmod(path: string, content: string): void {
  writeFileSync(path, content, "utf-8");
  try {
    chmodSync(path, 0o755);
  } catch {
    // ignore on non-POSIX; shell still works via `sh <path>` fallback.
  }
}

// ---------------------------------------------------------------------
// Foundry scaffold
// ---------------------------------------------------------------------

function buildFoundryToml(): string {
  return `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
evm_version = "shanghai"
auto_detect_solc = true

remappings = [
  "@openzeppelin/=lib/openzeppelin-contracts/",
  "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
]

[fuzz]
runs = 256
`;
}

// ---------------------------------------------------------------------
// Claude CLI spawn — mirror of Blue's spawnClaudeCli
// ---------------------------------------------------------------------

interface ClaudeCliSpawnResult {
  exitCode: number | null;
  timedOut: boolean;
}

async function spawnRedClaudeCli(opts: {
  promptPath: string;
  streamPath: string;
  cwd: string;
  timeoutMs: number;
}): Promise<ClaudeCliSpawnResult> {
  // Same flag set Blue uses. --permission-mode bypassPermissions is refused
  // when claude runs as root; --allowedTools is sufficient.
  const args = [
    "-p",
    "--model",
    "claude-opus-4-7",
    "--allowedTools",
    "Bash",
    "Edit",
    "Read",
    "Write",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
  ];
  const prompt = readFileSync(opts.promptPath, "utf-8");

  // Prepend our wrapper bin dir to PATH so forge/cast resolve.
  const childEnv = { ...process.env };
  const hostBinDir = join(dirname(opts.cwd), "bin");
  childEnv.PATH = `${hostBinDir}:${childEnv.PATH ?? ""}`;

  return await new Promise<ClaudeCliSpawnResult>((resolvePromise) => {
    const proc = spawn("claude", args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
      shell: process.platform === "win32",
    });

    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, opts.timeoutMs);

    const streamOut = createWriteStream(opts.streamPath, { flags: "w" });
    proc.stdout.on("data", (chunk: Buffer) => streamOut.write(chunk));
    proc.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));

    proc.on("error", (err) => {
      clearTimeout(killTimer);
      streamOut.end();
      process.stderr.write(`\n[red-cli] spawn error: ${err.message}\n`);
      resolvePromise({ exitCode: null, timedOut });
    });

    proc.on("close", (code) => {
      clearTimeout(killTimer);
      streamOut.end();
      resolvePromise({ exitCode: code, timedOut });
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// ---------------------------------------------------------------------
// Authoritative forge verdict
// ---------------------------------------------------------------------

interface ExploitArgs {
  containerId: string;
  targetAddress: string;
  forkBlockNumber: number;
  contractName: string;
  sourceFilename: string;
  rpcUrl: string;
  hostScanRoot: string;
  containerScanRoot: string;
}

async function runAuthoritativeForgeVerdict(
  sandbox: SandboxManager,
  args: ExploitArgs,
): Promise<{ passed: boolean; output: string; valueAtRisk: string | null }> {
  // Sync host src/ + test/ into container, then run forge test. Mirrors the
  // forge-wrapper's sync step; we do it here directly so the final verdict is
  // independent of whatever Claude did during the session.
  await syncHostIntoContainer(sandbox, args.containerId, args.hostScanRoot, args.containerScanRoot);

  const forgeCmd =
    `cd '${args.containerScanRoot}' && forge test --match-path test/Exploit.t.sol -vv ` +
    `--fork-url http://localhost:8545 2>&1`;
  const res = await sandbox.exec(args.containerId, forgeCmd, 600_000);
  const output = res.stdout + res.stderr;

  // Simple pass detection: forge exits 0 iff all matched tests pass.
  const passed = res.exitCode === 0 && /\[PASS\]/i.test(output);
  if (!passed) {
    // Surface the failing output so duel runs can diagnose fresh-address /
    // fork-state mismatches without re-plumbing the harness. Trim to keep the
    // console readable.
    const tail = output.slice(-3_000);
    process.stderr.write(
      `\n[red-cli] authoritative forge test FAILED (exit=${res.exitCode})\n--- forge output (tail) ---\n${tail}\n--- end forge output ---\n`,
    );
  }
  return { passed, output, valueAtRisk: null };
}

async function syncHostIntoContainer(
  sandbox: SandboxManager,
  containerId: string,
  hostRoot: string,
  containerRoot: string,
): Promise<void> {
  // Minimal sync: src/* and test/* files only. Reuse SandboxManager.writeFile
  // so we don't depend on `docker cp` from the host-node side.
  const walk = (root: string, rel: string): string[] => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return [];
    const out: string[] = [];
    // IMPORTANT: this module is ESM — a stray `require("node:fs")` here used
    // to throw `ReferenceError: require is not defined` at runtime, silently
    // aborting the authoritative forge verdict and producing forge_passed=false
    // even when Claude's in-session test passed. Use ESM-imported fs helpers.
    for (const entry of readdirSync(abs)) {
      const subRel = rel ? `${rel}/${entry}` : entry;
      const stat = statSync(join(root, subRel));
      if (stat.isDirectory()) out.push(...walk(root, subRel));
      else if (stat.isFile()) out.push(subRel);
    }
    return out;
  };
  const relPaths = [...walk(hostRoot, "src"), ...walk(hostRoot, "test")];
  for (const rel of relPaths) {
    const content = readFileSync(join(hostRoot, rel), "utf-8");
    const containerPath = `${containerRoot}/${rel.split("\\").join("/")}`;
    await sandbox.writeFile(containerId, containerPath, content);
  }
}

// ---------------------------------------------------------------------
// Stream parsing (telemetry + report recovery)
// ---------------------------------------------------------------------

interface ClaudeStreamSummary {
  numTurns?: number;
  notionalCostUsd?: number;
}

function summarizeClaudeStream(streamPath: string): ClaudeStreamSummary {
  if (!existsSync(streamPath)) return {};
  const summary: ClaudeStreamSummary = {};
  try {
    const raw = readFileSync(streamPath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: any;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (msg && msg.type === "result") {
        if (typeof msg.num_turns === "number") summary.numTurns = msg.num_turns;
        if (typeof msg.total_cost_usd === "number") {
          summary.notionalCostUsd = msg.total_cost_usd;
        }
      }
    }
  } catch {
    // telemetry only
  }
  return summary;
}

function extractLastAssistantText(streamPath: string): string | undefined {
  if (!existsSync(streamPath)) return undefined;
  let last: string | undefined;
  // Fallback: final `result` message carries the last assistant text in the
  // stream-json contract.
  let resultText: string | undefined;
  try {
    const raw = readFileSync(streamPath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: any;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (msg && msg.type === "assistant") {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          const bits: string[] = [];
          for (const b of content) {
            if (b && b.type === "text" && typeof b.text === "string") {
              bits.push(b.text);
            }
          }
          const combined = bits.join("\n").trim();
          if (combined) last = combined;
        } else if (typeof msg.message?.content === "string") {
          last = msg.message.content;
        }
      }
      if (msg && msg.type === "result" && typeof msg.result === "string") {
        resultText = msg.result;
      }
    }
  } catch {
    return undefined;
  }
  return last ?? resultText;
}

function parseReportFromText(
  text: string | undefined,
): ExploitReport | null {
  if (!text) return null;
  const m = text.match(
    /===SOLHUNT_REPORT_START===\s*([\s\S]*?)\s*===SOLHUNT_REPORT_END===/,
  );
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]);
    return {
      contract: "",
      contractName: "",
      chain: "",
      blockNumber: 0,
      found: data.found ?? false,
      vulnerability: {
        class: data.vulnerability?.class ?? "unknown",
        severity: data.vulnerability?.severity ?? "low",
        functions: data.vulnerability?.functions ?? [],
        description: data.vulnerability?.description ?? "",
      },
      exploit: {
        script: data.exploit?.testFile ?? "",
        executed: data.exploit?.testPassed ?? false,
        output: "",
        valueAtRisk: data.exploit?.valueAtRisk ?? "unknown",
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Report synthesis (fallback path)
// ---------------------------------------------------------------------

function synthesizeReport(args: {
  parsed: ExploitReport | null;
  target: ScanTarget;
  authoritativeVerdict: { passed: boolean; output: string; valueAtRisk: string | null };
  testExistsOnDisk: boolean;
}): ExploitReport | null {
  const { parsed, target, authoritativeVerdict, testExistsOnDisk } = args;

  // If Claude emitted markers, honor them but OVERRIDE executed from the
  // authoritative forge verdict. Claude lying about a pass shouldn't slip
  // through the harness.
  if (parsed) {
    return {
      contract: target.address,
      contractName: target.name,
      chain: target.chain,
      blockNumber: target.blockNumber ?? 0,
      found: parsed.found,
      vulnerability: parsed.vulnerability,
      exploit: {
        script: parsed.exploit.script || (testExistsOnDisk ? "test/Exploit.t.sol" : ""),
        executed: authoritativeVerdict.passed,
        output: authoritativeVerdict.output.slice(0, 4_000),
        valueAtRisk: parsed.exploit.valueAtRisk || "unknown",
      },
    };
  }

  // No markers. If an exploit file landed AND forge passes, synthesize a
  // minimal report so the scan isn't wasted.
  if (testExistsOnDisk && authoritativeVerdict.passed) {
    return {
      contract: target.address,
      contractName: target.name,
      chain: target.chain,
      blockNumber: target.blockNumber ?? 0,
      found: true,
      vulnerability: {
        class: "unspecified",
        severity: "high",
        functions: [],
        description:
          "Red wrote test/Exploit.t.sol and it passes under the authoritative forge run, " +
          "but did not emit the structured SOLHUNT_REPORT marker. The on-disk test is the " +
          "ground truth; manual classification required.",
      },
      exploit: {
        script: "test/Exploit.t.sol",
        executed: true,
        output: authoritativeVerdict.output.slice(0, 4_000),
        valueAtRisk: "unknown",
      },
    };
  }

  // Nothing usable.
  return null;
}

function buildRedError(args: {
  spawnResult: ClaudeCliSpawnResult;
  testExistsOnDisk: boolean;
  authoritativeVerdict: { passed: boolean };
  deadlineMs: number;
  reportParsed: boolean;
}): string | undefined {
  if (args.authoritativeVerdict.passed) return undefined;
  if (args.spawnResult.timedOut) {
    return `Claude CLI timed out after ${args.deadlineMs}ms; forge test did not pass.`;
  }
  if (!args.testExistsOnDisk) {
    return `Claude CLI exited ${args.spawnResult.exitCode} without writing test/Exploit.t.sol.`;
  }
  if (!args.reportParsed) {
    return `Claude wrote test/Exploit.t.sol but final forge verdict was not PASS and no report markers emitted.`;
  }
  return `Claude emitted SOLHUNT_REPORT markers but final forge verdict was not PASS.`;
}
