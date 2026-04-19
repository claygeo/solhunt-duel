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

import {
  chatCompletion,
  type ProviderConfig,
  type Message,
} from "./provider.js";
import {
  subscriptionCompletion,
  mapToClaudeCliModel,
} from "./provider-subscription.js";
import {
  getBlueToolDefinitions,
  BlueToolExecutor,
  type BlueExecutorArgs,
  type BlueToolResult,
} from "./blue-tools.js";
import { SandboxManager } from "../sandbox/manager.js";
import type { PatchVerification } from "../sandbox/patch-harness.js";
import type { ExploitReport } from "../reporter/format.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLUE_PROMPT_PATH = resolve(__dirname, "./blue-prompt.md");

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface BlueAgentConfig {
  provider: ProviderConfig;
  /** Hard cap on model iterations. Default 15 (patching is narrower than exploiting). */
  maxIterations?: number;
  /** Per-tool-call timeout (ms). */
  toolTimeout?: number;
  /** Whole-agent wall-clock budget (ms). */
  scanTimeout?: number;
}

export interface BlueRunArgs {
  sandbox: SandboxManager;
  containerId: string;
  /** Root of the patched Foundry project inside the container. */
  patchedProjectRoot: string;
  /** Root of the pristine original Foundry project inside the container. */
  originalProjectRoot: string;
  /** What Red found. Copied verbatim into Blue's analysis prompt. */
  exploitReport: ExploitReport;
  /** Full source of the target .sol file, echoed into the prompt so the model has it without a tool call. */
  originalSource: string;
  /** Name of the target Solidity file inside the sandbox (e.g. "Dexible.sol"). */
  sourceFilename: string;
  /** Contract name to extract runtime bytecode for in verifyPatch. */
  contractName: string;
  /** Mainnet fork block number for verifyPatch. */
  forkBlockNumber: number;
  /** JSON-RPC endpoint passed through to Foundry. */
  rpcUrl: string;
  /** Target contract address on the fork. */
  targetAddress: string;
  /** Optional fresh-address + anvil URL for duel/fresh-address mode. When
   *  set, the patch harness calls `anvil_setCode(freshAddress, <variant>)`
   *  before each forge test so Red's exploit (which targets the local anvil
   *  fork) observes the CORRECT bytecode at each verify stage. Without this,
   *  Blue's patched runtime is never etched onto the address Red attacks,
   *  and verify reports a false failure. */
  freshAddress?: string;
  anvilRpcUrl?: string;
  /** Path to the exploit test, relative to each project root. */
  exploitTestPath: string;
  /** Path to the auto-generated benign suite, relative to each project root. */
  benignTestPath: string;
  config: BlueAgentConfig;
  /** Observer hook for progress UI/logging. */
  onIteration?: (iteration: number, toolName: string) => void;
}

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
}

export interface BluePatchResult {
  success: boolean;
  /** Full patched .sol source Blue produced, if any. */
  finalSource?: string;
  /** Blue's free-text rationale, if any. */
  rationale?: string;
  iterations: number;
  cost: CostBreakdown;
  /** Every verify_patch run, in order. Callers can inspect gate progression. */
  verificationHistory: PatchVerification[];
  /** Populated only on failure. */
  error?: string;
  /** Notional USD cost reported by the Claude CLI stream-json (subscription
   *  = $0 actual, but the CLI reports the API-equivalent price). Telemetry
   *  only — OpenRouter path leaves this undefined. */
  claudeNotionalCostUsd?: number;
}

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------

export async function runBlueTeam(args: BlueRunArgs): Promise<BluePatchResult> {
  const cfg = args.config;
  if (
    process.env.BLUE_VIA_CLAUDE_CLI === "1" ||
    process.env.BLUE_VIA_CLAUDE_CLI === "true"
  ) {
    return runBlueTeamViaClaudeCli(args);
  }
  const maxIterations = cfg.maxIterations ?? 15;
  const scanTimeout = cfg.scanTimeout ?? 30 * 60_000;
  const toolTimeout = cfg.toolTimeout ?? 120_000;

  const tools = getBlueToolDefinitions();
  const systemPrompt = loadBluePrompt();

  const executorArgs: BlueExecutorArgs = {
    sandbox: args.sandbox,
    containerId: args.containerId,
    patchedProjectRoot: args.patchedProjectRoot,
    originalProjectRoot: args.originalProjectRoot,
    toolTimeout,
    verifyArgs: {
      targetAddress: args.targetAddress,
      forkBlockNumber: args.forkBlockNumber,
      contractName: args.contractName,
      exploitTestPath: args.exploitTestPath,
      benignTestPath: args.benignTestPath,
      rpcUrl: args.rpcUrl,
      freshAddress: args.freshAddress,
      anvilRpcUrl: args.anvilRpcUrl,
    },
  };
  const executor = new BlueToolExecutor(executorArgs);

  const analysisPrompt = buildBlueAnalysisPrompt({
    exploitReport: args.exploitReport,
    originalSource: args.originalSource,
    sourceFilename: args.sourceFilename,
    patchedProjectRoot: args.patchedProjectRoot,
    exploitTestPath: args.exploitTestPath,
    benignTestPath: args.benignTestPath,
  });

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: analysisPrompt },
  ];

  const verificationHistory: PatchVerification[] = [];
  let iterations = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastTextOutput = "";
  let consecutiveBuildErrors = 0;
  let sameGateStreak = 0;
  let lastFailingGate: string | null = null;

  const startTime = Date.now();
  const deadline = startTime + scanTimeout;

  while (iterations < maxIterations) {
    if (Date.now() > deadline) {
      return finishFailure({
        error: `Blue scan timed out after ${scanTimeout}ms`,
        iterations,
        totalInputTokens,
        totalOutputTokens,
        lastTextOutput,
        verificationHistory,
      });
    }

    iterations++;
    trimConversation(messages);

    let response;
    try {
      response = await callModel(cfg.provider, messages, tools);
    } catch (err: any) {
      console.error(`[blue iter ${iterations}] API error (retrying): ${err?.message ?? err}`);
      await new Promise((r) => setTimeout(r, 4_000));
      try {
        response = await callModel(cfg.provider, messages, tools);
      } catch (retryErr: any) {
        return finishFailure({
          error: `API error: ${retryErr?.message ?? String(retryErr)}`,
          iterations,
          totalInputTokens,
          totalOutputTokens,
          lastTextOutput,
          verificationHistory,
        });
      }
    }

    totalInputTokens += response.usage.prompt_tokens;
    totalOutputTokens += response.usage.completion_tokens;

    const assistantMessage = response.message;
    console.error(
      `[blue iter ${iterations}] finish_reason=${response.finish_reason} tool_calls=${assistantMessage.tool_calls?.length ?? 0} content_len=${assistantMessage.content?.length ?? 0}`
    );
    if (assistantMessage.content) {
      lastTextOutput = assistantMessage.content;
    }

    // ---- No tool calls: the model either wants to talk or produced the final patch ----
    if (
      response.finish_reason !== "tool_calls" ||
      !assistantMessage.tool_calls?.length
    ) {
      if (containsPatchMarkers(lastTextOutput)) {
        // Model emitted a patch without verifying. Only trust it if we have at
        // least one verification history entry showing all gates green; else
        // nudge it to run verify_patch first.
        const lastGreen = lastGreenVerification(verificationHistory);
        if (lastGreen) {
          break;
        }
        messages.push({ role: "assistant", content: assistantMessage.content ?? "" });
        messages.push({
          role: "user",
          content:
            "You wrote the patch markers but never ran `verify_patch` with all four gates green. Call `verify_patch` now before declaring success. Do NOT emit final markers until the oracle returns exploitNeutralized=true, benignPassed=true, freshAttackerNeutralized=true, storageLayoutChanged=false, and no error.",
        });
        continue;
      }

      // No markers, no tools — nudge based on context.
      messages.push({ role: "assistant", content: assistantMessage.content ?? "(no output)" });
      messages.push({
        role: "user",
        content: contextualNudge({
          iterations,
          maxIterations,
          verificationHistory,
          wroteSourceFile: hasWrittenPatch(messages),
        }),
      });
      continue;
    }

    // ---- Execute tool calls ----
    messages.push(assistantMessage);

    let sawVerifyInThisTurn = false;
    let latestVerification: PatchVerification | null = null;
    let sawBuildErrorThisTurn = false;

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      let toolInput: any;
      try {
        toolInput = JSON.parse(toolCall.function.arguments);
      } catch {
        toolInput = { command: toolCall.function.arguments };
      }
      args.onIteration?.(iterations, toolName);

      const result = await executor.execute(toolName, toolInput);
      let output = result.output;
      if (output.length > 50_000) {
        output =
          output.slice(0, 25_000) +
          "\n\n... [output truncated, showing first and last 25KB] ...\n\n" +
          output.slice(-25_000);
      }
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: output,
      });

      if (toolName === "verify_patch" && result.verification) {
        sawVerifyInThisTurn = true;
        latestVerification = result.verification;
        verificationHistory.push(result.verification);
      }

      if (
        toolName === "bash" &&
        result.isError &&
        /(Compiler run failed|Error \(\d+\):|forge build failed)/i.test(output)
      ) {
        sawBuildErrorThisTurn = true;
      }
    }

    // ---- Circuit breakers & success check ----

    // Track consecutive compile-error runs from bash (model rewrote a bad file).
    if (sawBuildErrorThisTurn) {
      consecutiveBuildErrors++;
    } else {
      consecutiveBuildErrors = 0;
    }

    if (consecutiveBuildErrors >= 3) {
      messages.push({
        role: "user",
        content:
          "STOP — three consecutive `forge build` failures. Your patched file is malformed. Use `str_replace_editor` with `command=\"create\"` to REWRITE the entire patched source file from scratch, matching the pragma and structure of the original. Do not try to `str_replace` another broken build.",
      });
      consecutiveBuildErrors = 0;
      continue;
    }

    if (sawVerifyInThisTurn && latestVerification) {
      if (isAllGatesGreen(latestVerification)) {
        // All gates green — pull the patched source DIRECTLY from the sandbox.
        // The prior approach nudged the LLM to re-emit markers on the next turn,
        // which would silently fail on the final iteration (no "next turn" left).
        // The source is already on disk in the container; read it verbatim.
        const patchedSourceInContainer = `${args.patchedProjectRoot}/src/${args.sourceFilename}`;
        const finalSource = await args.sandbox.tryReadFile(
          args.containerId,
          patchedSourceInContainer,
        );
        // Rationale: prefer the latest assistant text if present, else synthesize
        // a minimal one from the gate report. Not a blocker for success.
        const rationale = extractLastAssistantText(messages)
          || `Patch neutralizes the ${args.exploitReport.vulnerability?.class ?? "documented"} vulnerability while preserving the benign suite and storage layout. Verified by all four harness gates.`;
        return {
          success: true,
          finalSource: finalSource ?? undefined,
          rationale,
          iterations,
          cost: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          verificationHistory,
        };
      }

      // Gate-specific nudges — name the one that's failing.
      const failingGate = firstFailingGate(latestVerification);
      if (failingGate === lastFailingGate) {
        sameGateStreak++;
      } else {
        sameGateStreak = 1;
        lastFailingGate = failingGate;
      }

      if (sameGateStreak >= 3) {
        // Circuit breaker: model is stuck repeating the same failure.
        messages.push({
          role: "user",
          content:
            `CIRCUIT BREAKER: you've failed the \`${failingGate}\` gate three times in a row. The current approach is wrong — do not tweak the same edit a fourth time. Step back, re-read the exploit test, and rewrite the patched source from scratch using a DIFFERENT defense mechanism (different layer, different check type, or different function). Call \`str_replace_editor\` with \`command="create"\` to replace the entire patched file.`,
        });
        sameGateStreak = 0;
        continue;
      }

      messages.push({
        role: "user",
        content: gateSpecificNudge(latestVerification),
      });
      continue;
    }

    // No verify in this turn — encourage running it once a patch has been written.
    if (hasWrittenPatch(messages) && verificationHistory.length === 0 && iterations >= 3) {
      messages.push({
        role: "user",
        content:
          "You've edited the patched source but haven't called `verify_patch` yet. Run it now — it's the only way to learn which gates you've passed.",
      });
      continue;
    }
  }

  // Budget hit — try to extract a best-attempt patch + rationale from the last output.
  if (containsPatchMarkers(lastTextOutput)) {
    const parsed = parsePatchOutput(lastTextOutput);
    const lastGreen = lastGreenVerification(verificationHistory);
    if (lastGreen && parsed.source) {
      return {
        success: true,
        finalSource: parsed.source,
        rationale: parsed.rationale,
        iterations,
        cost: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        verificationHistory,
      };
    }
    return {
      success: false,
      finalSource: parsed.source,
      rationale: parsed.rationale,
      iterations,
      cost: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      verificationHistory,
      error:
        "Blue emitted patch markers but no verification run confirmed all four gates green.",
    };
  }

  return finishFailure({
    error: `Iteration budget exhausted (${maxIterations}) without all four gates green.`,
    iterations,
    totalInputTokens,
    totalOutputTokens,
    lastTextOutput,
    verificationHistory,
  });
}

// If the last emitted patch happens AFTER the last green verification, also
// try to extract it. But we only set success=true when we have both.
function finishFailure(args: {
  error: string;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastTextOutput: string;
  verificationHistory: PatchVerification[];
}): BluePatchResult {
  const parsed = parsePatchOutput(args.lastTextOutput);
  return {
    success: false,
    finalSource: parsed.source,
    rationale: parsed.rationale,
    iterations: args.iterations,
    cost: {
      inputTokens: args.totalInputTokens,
      outputTokens: args.totalOutputTokens,
    },
    verificationHistory: args.verificationHistory,
    error: args.error,
  };
}

// ---------------------------------------------------------------------
// Provider routing (subscription vs OpenRouter)
// ---------------------------------------------------------------------

async function callModel(
  provider: ProviderConfig,
  messages: Message[],
  tools: ReturnType<typeof getBlueToolDefinitions>
) {
  // BLUE_VIA_SUBSCRIPTION=1 means route strategic text through `claude -p`.
  // Subscription path does NOT support tool calls — so we only take it when
  // the model's next step is prose (no tools needed). Because Blue NEEDS tools
  // (verify_patch is the oracle), we fall back to the configured provider
  // whenever tools are in play. The env var still matters: STRATEGIC_MODEL
  // lets operators pick opus for the reasoning.
  //
  // Net effect for Phase 1: subscription routing is wired but, for the Blue
  // loop, we always use the configured provider because every turn either
  // calls a tool or emits the final patch. If a future caller wants a
  // pure-prose sub-module (e.g. the generator.ts benign-suite LLM call, which
  // doesn't use tools), it can reuse `subscriptionCompletion` directly.
  if (process.env.BLUE_VIA_SUBSCRIPTION === "1" && tools.length === 0) {
    const model = mapToClaudeCliModel(
      process.env.STRATEGIC_MODEL ?? provider.model
    );
    return await subscriptionCompletion({ model }, messages);
  }
  return await chatCompletion(provider, messages, tools);
}

// ---------------------------------------------------------------------
// Prompt + analysis builders
// ---------------------------------------------------------------------

function loadBluePrompt(): string {
  return readFileSync(BLUE_PROMPT_PATH, "utf-8");
}

function buildBlueAnalysisPrompt(params: {
  exploitReport: ExploitReport;
  originalSource: string;
  sourceFilename: string;
  patchedProjectRoot: string;
  exploitTestPath: string;
  benignTestPath: string;
}): string {
  const MAX_SOURCE_CHARS = 40_000;
  const trimmedSource =
    params.originalSource.length <= MAX_SOURCE_CHARS
      ? params.originalSource
      : params.originalSource.slice(0, MAX_SOURCE_CHARS) +
        "\n// ... [truncated; use read_file to see the rest]";

  const vuln = params.exploitReport.vulnerability;

  return `## Red-team findings

**Contract:** ${params.exploitReport.contractName} @ ${params.exploitReport.contract}
**Chain / Block:** ${params.exploitReport.chain} / ${params.exploitReport.blockNumber}
**Class:** ${vuln.class}
**Severity:** ${vuln.severity}
**Affected functions:** ${vuln.functions.join(", ") || "(none specified)"}
**Description:** ${vuln.description}

**Value at risk:** ${params.exploitReport.exploit.valueAtRisk}
**Red's exploit lives at:** \`${params.exploitTestPath}\` (do not modify)
**Auto-generated benign suite:** \`${params.benignTestPath}\` (do not modify)

## Sandbox layout

Your editable project: \`${params.patchedProjectRoot}\`
- \`src/${params.sourceFilename}\` — the source you will patch
- \`${params.exploitTestPath}\` — Red's exploit
- \`${params.benignTestPath}\` — happy-path regression suite
- \`foundry.toml\` — pinned compiler config

## Original (unpatched) source

Echoed here so you don't need a tool call to read it:

\`\`\`solidity
${trimmedSource}
\`\`\`

## Your task

Produce a minimal, storage-safe, general patch. Call \`verify_patch\` to confirm. When all four gates are green, emit the final patched source inside the marker pair and a 2-3 sentence rationale inside the rationale marker pair — nothing else.`;
}

// ---------------------------------------------------------------------
// Conversation trimming (same strategy as Red's loop.ts)
// ---------------------------------------------------------------------

function trimConversation(messages: Message[]): void {
  if (messages.length <= 10) return;
  const systemAndUser = messages.slice(0, 2);
  const recent = messages.slice(-6);
  const middle = messages.slice(2, -6);

  const ERROR_KEYWORDS =
    /\b(Error|FAIL|PASS|revert|panic|overflow|underflow|storageLayoutChanged|freshAttackerNeutralized|benignPassed|regressions)\b/i;

  const compressed = middle.map((m) => {
    if (m.role === "tool" && m.content && m.content.length > 500) {
      if (m.name === "verify_patch") {
        // Preserve verify_patch outputs fully, but cap the raw JSON.
        return m.content.length > 5000
          ? { ...m, content: m.content.slice(0, 5000) + "\n[... verify_patch output truncated ...]" }
          : m;
      }
      if (ERROR_KEYWORDS.test(m.content)) {
        return m.content.length > 2000
          ? { ...m, content: m.content.slice(0, 2000) + "\n[... output truncated ...]" }
          : m;
      }
      return { ...m, content: m.content.slice(0, 300) + "\n[... output truncated ...]" };
    }
    if (m.role === "assistant" && m.content && m.content.length > 500) {
      return { ...m, content: m.content.slice(0, 500) + "\n[... truncated ...]" };
    }
    return m;
  });

  messages.length = 0;
  messages.push(...systemAndUser, ...compressed, ...recent);
}

// ---------------------------------------------------------------------
// Gate / verification helpers
// ---------------------------------------------------------------------

function isAllGatesGreen(v: PatchVerification): boolean {
  return (
    v.exploitNeutralized &&
    v.benignPassed &&
    v.freshAttackerNeutralized &&
    !v.storageLayoutChanged &&
    !v.error
  );
}

function lastGreenVerification(
  history: PatchVerification[]
): PatchVerification | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (isAllGatesGreen(history[i])) return history[i];
  }
  return null;
}

function firstFailingGate(v: PatchVerification): string {
  if (v.error) return "error";
  if (v.storageLayoutChanged) return "storageLayoutChanged";
  if (!v.exploitNeutralized) return "exploitNeutralized";
  if (!v.freshAttackerNeutralized) return "freshAttackerNeutralized";
  if (!v.benignPassed) return "benignPassed";
  return "unknown";
}

function gateSpecificNudge(v: PatchVerification): string {
  if (v.error) {
    return `verify_patch returned an error: ${v.error.slice(0, 600)}\n\nFix the build / structural problem first — none of the logical gates can run until the project compiles and etches cleanly.`;
  }
  if (v.storageLayoutChanged) {
    return "STORAGE LAYOUT REGRESSED. Your patch moved, reordered, renamed, or retyped an existing state variable. `vm.etch` only rewrites code, so the live contract's storage will be reinterpreted under your new layout and reads will corrupt. Use diamond storage or APPEND new state at the END of its struct/contract. Do not insert fields in the middle. Do not rename existing fields. Do not change types.";
  }
  if (!v.exploitNeutralized) {
    return "EXPLOIT STILL PASSES. Your patch didn't actually short-circuit the attack sink. Re-read `test/Exploit.t.sol` and identify the exact call that transfers value — your guard must revert BEFORE that call lands. Revisit the function in your patched source and make sure the check is on the hot path, not on a branch the exploit skips.";
  }
  if (!v.freshAttackerNeutralized) {
    return "FRESH-ATTACKER GATE FAILED: the exploit neutralization only works for the original attacker EOA. Your patch is keying off a specific address. Generalize the check — use an allow-list of approved targets, a role check, or input validation that isn't tied to `msg.sender`'s identity. Never blocklist a single address.";
  }
  if (!v.benignPassed) {
    const regs = v.regressions.length
      ? v.regressions.join(", ")
      : "(no specific test names surfaced)";
    return `BENIGN REGRESSION. The patch bricked legitimate usage. Failing tests: ${regs}. Read the relevant benign test cases and find the happy path your guard is now blocking. Tighten the condition so it stops the exploit shape but permits the benign shape — do not just delete the check. If the benign case requires a setup step (e.g. admin pre-approving a router), the patch has to leave that workflow intact.`;
  }
  return "Gate verdict unclear. Re-run verify_patch after a fresh edit.";
}

// ---------------------------------------------------------------------
// Contextual nudges for turns with no tool calls (pre-verify)
// ---------------------------------------------------------------------

function contextualNudge(args: {
  iterations: number;
  maxIterations: number;
  verificationHistory: PatchVerification[];
  wroteSourceFile: boolean;
}): string {
  const left = args.maxIterations - args.iterations;
  if (left <= 2) {
    return "FINAL ITERATION approaching. If you have a green verify_patch run, output the final patch markers now. Otherwise, there is not enough budget to iterate further — emit your best attempt inside the markers so it can be recovered.";
  }
  if (!args.wroteSourceFile) {
    return "You haven't written the patched file yet. Use `str_replace_editor` (`create` or `str_replace`) to edit `src/<TargetContract>.sol` inside the patched project root. Do not keep analyzing — write a minimal first attempt and verify it.";
  }
  if (args.verificationHistory.length === 0) {
    return "Run `verify_patch` to get the first verdict. The oracle is the only thing that tells you which gate you're failing.";
  }
  return "Continue iterating. Call a tool (`str_replace_editor` to edit, `verify_patch` to check) unless you are emitting the final ===SOLHUNT_PATCH_START=== markers.";
}

// ---------------------------------------------------------------------
// Patch marker parsing
// ---------------------------------------------------------------------

function containsPatchMarkers(text: string): boolean {
  return (
    text.includes("===SOLHUNT_PATCH_START===") &&
    text.includes("===SOLHUNT_PATCH_END===")
  );
}

export function parsePatchOutput(text: string): {
  source?: string;
  rationale?: string;
} {
  const patch = text.match(
    /===SOLHUNT_PATCH_START===\s*([\s\S]*?)\s*===SOLHUNT_PATCH_END===/
  );
  const rationale = text.match(
    /===SOLHUNT_RATIONALE_START===\s*([\s\S]*?)\s*===SOLHUNT_RATIONALE_END===/
  );
  return {
    source: patch?.[1]?.trim(),
    rationale: rationale?.[1]?.trim(),
  };
}

function hasWrittenPatch(messages: Message[]): boolean {
  for (const m of messages) {
    if (m.role !== "tool") continue;
    if (m.name !== "str_replace_editor") continue;
    if (!m.content) continue;
    if (/File created:|Replacement made in/i.test(m.content)) return true;
  }
  return false;
}

// When the gate-green path extracts source directly from the sandbox, we still
// want a short rationale for the audit trail. Prefer the most recent assistant
// text (Blue usually narrates its patch decision) over a synthesized fallback.
function extractLastAssistantText(messages: Message[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const text = typeof m.content === "string" ? m.content.trim() : "";
    if (!text) continue;
    // Cap at 400 chars — the audit trail wants a rationale, not a transcript.
    return text.length > 400 ? text.slice(0, 400) + "…" : text;
  }
  return undefined;
}

// Re-export for index.ts convenience
export type { BlueToolResult };

// ---------------------------------------------------------------------
// Claude Code CLI branch (Max subscription, Opus 4.7 as the brain)
// ---------------------------------------------------------------------
//
// Gated by BLUE_VIA_CLAUDE_CLI=1. Instead of driving a tool-calling loop from
// this process, we hand the whole problem to one `claude -p` invocation and
// let Opus autonomously Read/Edit/Write Solidity and run `verify_patch` as a
// plain Bash command.
//
// Architecture:
//   host (VPS, claude CLI + solhunt repo)
//   └── staging dir: /workspace/harness/ (under os.tmpdir if env unset)
//       ├── blue-prompt.txt    — system prompt + analysis prompt
//       ├── verify-args.json   — passed to patch-harness-cli.ts
//       ├── patched/           — Claude's editable filesystem root
//       │   └── src/Dexible.sol
//       └── claude-stream.ndjson — tee of the stream-json output
//
//   container (solhunt-sandbox)
//   └── /workspace/harness/patched/  — mirror target; verify_patch syncs host src/
//                                      here before running forge.
//
// Claude cannot speak to Docker from the host; only the host-side harness can.
// verify_patch (the shell wrapper) pushes host src/ into the container each
// time Claude invokes it.
async function runBlueTeamViaClaudeCli(
  args: BlueRunArgs
): Promise<BluePatchResult> {
  const t0 = Date.now();
  const hostStagingRoot =
    process.env.SOLHUNT_HOST_STAGING ?? "/workspace/harness";
  const hostPatchedRoot = join(hostStagingRoot, "patched");
  const hostPromptPath = join(hostStagingRoot, "blue-prompt.txt");
  const hostVerifyArgsPath = join(hostStagingRoot, "verify-args.json");
  const hostStreamPath = join(hostStagingRoot, "claude-stream.ndjson");

  // 1. Seed host staging dir with patched source + prompt + verify args.
  //    sourceFilename may contain forward-slash subdirs (e.g.
  //    "contracts/dexible/DexibleProxy.sol") for real Etherscan-extracted
  //    multi-file source trees. Create the parent chain before writing.
  const hostTargetPath = join(hostPatchedRoot, "src", args.sourceFilename);
  mkdirSync(dirname(hostTargetPath), { recursive: true });
  writeFileSync(hostTargetPath, args.originalSource, "utf-8");

  const verifyArgs = {
    containerId: args.containerId,
    targetAddress: args.targetAddress,
    forkBlockNumber: args.forkBlockNumber,
    contractName: args.contractName,
    sourceFilename: args.sourceFilename,
    rpcUrl: args.rpcUrl,
    exploitTestPath: args.exploitTestPath,
    benignTestPath: args.benignTestPath,
    originalProjectRoot: args.originalProjectRoot,
    patchedProjectRoot: args.patchedProjectRoot,
    hostPatchedRoot,
    // Propagate fresh-address mode to the shell wrapper's verify_patch so each
    // of Blue's interactive verify calls also swaps bytecode between stages.
    freshAddress: args.freshAddress,
    anvilRpcUrl: args.anvilRpcUrl,
  };
  writeFileSync(hostVerifyArgsPath, JSON.stringify(verifyArgs, null, 2), "utf-8");

  // 2. Install the verify_patch shell wrapper so `bash -c verify_patch` works
  //    when claude shells out. Fall back to a local staging copy if we can't
  //    write /usr/local/bin.
  const wrapperSourcePath = resolve(
    __dirname,
    "../bench/phase1-dexible-blue/docker-bin/verify_patch.sh"
  );
  const wrapperSource = readFileSync(wrapperSourcePath, "utf-8");
  const wrapperDest = installVerifyPatchWrapper(wrapperSource, hostStagingRoot);

  // 3. Build the prompt file (system prompt + analysis).
  const systemPrompt = loadBluePrompt();
  const analysisPrompt = buildBlueAnalysisPrompt({
    exploitReport: args.exploitReport,
    originalSource: args.originalSource,
    sourceFilename: args.sourceFilename,
    patchedProjectRoot: hostPatchedRoot,
    exploitTestPath: args.exploitTestPath,
    benignTestPath: args.benignTestPath,
  });

  const cliAddendum = `

## How this session runs

You are running as a single \`claude -p\` invocation with direct filesystem
access. Your tools are Read, Edit, Write, and Bash — the same surface as
Claude Code. There is NO tool-calling loop wrapping you. You will get ONE
chance to patch and verify.

**Working directory:** \`${hostPatchedRoot}\`
**Target file to edit:** \`${hostPatchedRoot}/src/${args.sourceFilename}\`

**The oracle is a shell command.** Run it like this:
\`\`\`
${wrapperDest}
\`\`\`
or simply \`verify_patch\` if it's on \$PATH. It prints the PatchVerification
JSON to stdout and exits 0 iff all four gates are green. Call it REPEATEDLY
from your Bash tool after each Edit until you see green. Do NOT stop before
a green run.

**Do not** try to edit test/Exploit.t.sol or test/Benign.t.sol (they live
inside the container and are read-only for you anyway). Only edit the
Solidity source under \`src/\`.

## Output contract

Once \`verify_patch\` prints a JSON with
\`exploitNeutralized=true benignPassed=true freshAttackerNeutralized=true storageLayoutChanged=false\`
and no \`error\`, emit your final rationale in your last assistant message
like this:

===SOLHUNT_RATIONALE_START===
<2-3 sentences: which sink the patch neutralizes, the defense mechanism,
why it is general rather than attacker-specific>
===SOLHUNT_RATIONALE_END===

The patched source is already on disk — don't echo it back. Just the rationale.
`;

  const fullPrompt = `${systemPrompt}\n\n${analysisPrompt}${cliAddendum}`;
  writeFileSync(hostPromptPath, fullPrompt, "utf-8");

  // 4. Spawn claude -p. Stream-json is tee'd to disk for telemetry.
  const deadlineMs = cfg_scanTimeoutOr(args.config.scanTimeout, 20 * 60_000);
  const spawnResult = await spawnClaudeCli({
    promptPath: hostPromptPath,
    streamPath: hostStreamPath,
    cwd: hostPatchedRoot,
    timeoutMs: deadlineMs,
  });

  // 5. AUTHORITATIVE verdict: run verifyPatch one last time against the
  //    patched source on disk, regardless of whether claude succeeded.
  const finalVerdict = await runFinalVerification(args, hostPatchedRoot);

  // 6. Extract the patched source + rationale.
  const patchedSourceOnDisk = safeReadFile(
    join(hostPatchedRoot, "src", args.sourceFilename)
  );
  const rationale = extractRationaleFromStream(hostStreamPath);

  const allGreen =
    finalVerdict.exploitNeutralized &&
    finalVerdict.benignPassed &&
    finalVerdict.freshAttackerNeutralized &&
    !finalVerdict.storageLayoutChanged &&
    !finalVerdict.error;

  const streamSummary = summarizeClaudeStream(hostStreamPath);

  const dtMs = Date.now() - t0;
  console.error(
    `[blue-cli] done in ${(dtMs / 1000).toFixed(1)}s; claude exit=${spawnResult.exitCode}, ` +
      `turns=${streamSummary.numTurns ?? "?"}, notional_usd=${streamSummary.notionalCostUsd ?? "?"}, ` +
      `timedOut=${spawnResult.timedOut}`
  );

  return {
    success: allGreen,
    finalSource: patchedSourceOnDisk ?? undefined,
    rationale:
      rationale ??
      (allGreen
        ? `Patch neutralizes the ${args.exploitReport.vulnerability?.class ?? "documented"} vulnerability via the host-edit/verify loop. All four harness gates green.`
        : undefined),
    iterations: 1,
    cost: { inputTokens: 0, outputTokens: 0 },
    verificationHistory: [finalVerdict],
    error: allGreen
      ? undefined
      : spawnResult.timedOut
        ? `Claude CLI timed out after ${deadlineMs}ms; final verifyPatch did not all-green.`
        : `Claude CLI exited ${spawnResult.exitCode}; final verifyPatch did not all-green.`,
    claudeNotionalCostUsd: streamSummary.notionalCostUsd,
  };
}

function cfg_scanTimeoutOr(raw: number | undefined, fallback: number): number {
  if (typeof raw !== "number" || raw <= 0) return fallback;
  return raw;
}

function installVerifyPatchWrapper(
  wrapperSource: string,
  hostStagingRoot: string
): string {
  const preferred = "/usr/local/bin/verify_patch";
  try {
    writeFileSync(preferred, wrapperSource, "utf-8");
    chmodSync(preferred, 0o755);
    return preferred;
  } catch {
    // Fall back to a per-run wrapper path; still callable via absolute path.
    const fallback = join(hostStagingRoot, "verify_patch.sh");
    writeFileSync(fallback, wrapperSource, "utf-8");
    try {
      chmodSync(fallback, 0o755);
    } catch {
      // ignore chmod failure on non-POSIX; claude's Bash tool can still `sh <path>`.
    }
    return fallback;
  }
}

interface ClaudeCliSpawnResult {
  exitCode: number | null;
  timedOut: boolean;
}

async function spawnClaudeCli(opts: {
  promptPath: string;
  streamPath: string;
  cwd: string;
  timeoutMs: number;
}): Promise<ClaudeCliSpawnResult> {
  // GOTCHA: --permission-mode bypassPermissions is rejected when claude runs
  // as root ("cannot be used with root/sudo privileges"). Pre-approving tools
  // via --allowedTools is enough — those tools skip the confirmation dialog.
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
    "--verbose", // stream-json requires --verbose per claude CLI v2.1.x
    "--no-session-persistence",
  ];

  const prompt = readFileSync(opts.promptPath, "utf-8");

  return await new Promise<ClaudeCliSpawnResult>((resolvePromise) => {
    const proc = spawn("claude", args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
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

    // Tee stdout (stream-json) to disk for post-mortem.
    const streamOut = createWriteStream(opts.streamPath, { flags: "w" });
    proc.stdout.on("data", (chunk: Buffer) => {
      streamOut.write(chunk);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      // Mirror stderr to node stderr so operators can see claude errors live.
      process.stderr.write(chunk);
    });

    proc.on("error", (err) => {
      clearTimeout(killTimer);
      streamOut.end();
      process.stderr.write(`\n[blue-cli] spawn error: ${err.message}\n`);
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

async function runFinalVerification(
  args: BlueRunArgs,
  hostPatchedRoot: string
): Promise<PatchVerification> {
  // Push host src/ into container, then run verifyPatch directly. This is the
  // same sync the CLI wrapper does; we reimplement the minimal form here so
  // the final verdict is independent of whether claude invoked verify_patch.
  // Walk recursively so multi-file source trees (e.g.
  // "contracts/dexible/DexibleProxy.sol") sync their nested layout intact.
  const hostSrc = join(hostPatchedRoot, "src");
  if (existsSync(hostSrc)) {
    const walk = async (dir: string, relPrefix: string): Promise<void> => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const s = statSync(full);
        const rel = relPrefix ? `${relPrefix}/${name}` : name;
        if (s.isDirectory()) {
          await walk(full, rel);
        } else if (s.isFile()) {
          const containerPath = `${args.patchedProjectRoot}/src/${rel}`;
          const content = readFileSync(full, "utf-8");
          await args.sandbox.writeFile(args.containerId, containerPath, content);
        }
      }
    };
    await walk(hostSrc, "");
  }

  // Import verifyPatch lazily to avoid a circular dep at module load.
  const { verifyPatch } = await import("../sandbox/patch-harness.js");
  return await verifyPatch(args.sandbox, {
    sandboxId: args.containerId,
    targetAddress: args.targetAddress,
    forkBlockNumber: args.forkBlockNumber,
    contractName: args.contractName,
    originalSourcePath: args.originalProjectRoot,
    patchedSourcePath: args.patchedProjectRoot,
    exploitTestPath: args.exploitTestPath,
    benignTestPath: args.benignTestPath,
    rpcUrl: args.rpcUrl,
    freshAddress: args.freshAddress,
    anvilRpcUrl: args.anvilRpcUrl,
  });
}

function safeReadFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

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
    // ignore parse errors — telemetry only.
  }
  return summary;
}

function extractRationaleFromStream(streamPath: string): string | undefined {
  if (!existsSync(streamPath)) return undefined;
  let lastAssistantText: string | undefined;
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
        const contentArr = msg.message?.content;
        if (Array.isArray(contentArr)) {
          const textBits: string[] = [];
          for (const block of contentArr) {
            if (block && block.type === "text" && typeof block.text === "string") {
              textBits.push(block.text);
            }
          }
          const combined = textBits.join("\n").trim();
          if (combined) lastAssistantText = combined;
        } else if (typeof msg.message?.content === "string") {
          lastAssistantText = msg.message.content;
        }
      }
    }
  } catch {
    return undefined;
  }

  if (!lastAssistantText) return undefined;
  const match = lastAssistantText.match(
    /===SOLHUNT_RATIONALE_START===\s*([\s\S]*?)\s*===SOLHUNT_RATIONALE_END===/
  );
  if (match && match[1]) return match[1].trim();
  return lastAssistantText.length > 400
    ? lastAssistantText.slice(0, 400) + "…"
    : lastAssistantText;
}
