// Audit trail generator — Phase 2 of solhunt-duel.
//
// Port of the rotmg-hunter retrospective pattern: given a completed round
// (Red scan + Blue patch + verification), spawn `claude -p` (Opus on the Max
// subscription) and ask it to produce a GROUNDED per-round audit entry.
//
// Grounding contract:
//   - Every claim must cite a specific iteration or turn (e.g. "red iter 7",
//     "blue turn 4").
//   - If the model can't produce evidence arrays with at least one citation
//     each, the entry is rejected (schema enforcement happens at the caller).
//
// This file is intentionally independent of the orchestrator — it takes a
// fully-formed DuelRoundResult plus optional raw transcripts and returns an
// AuditEntry. The orchestrator is responsible for rejecting empty-evidence
// entries.
//
// Why `claude -p` (not OpenRouter)? Two reasons:
//   1. Runs under Max subscription → $0 marginal cost.
//   2. Opus 4.7 is already what Blue uses; same-brain continuity keeps the
//      audit voice consistent with Blue's rationale.

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

import type { ExploitReport } from "../reporter/format.js";
import type { PatchVerification } from "../sandbox/patch-harness.js";
import type { DuelRoundResult } from "./orchestrator.js";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface AuditEntry {
  round: number;
  vulnClass: string;
  exploitSummary: string;
  patchSummary: string;
  verificationSummary: string;
  convergenceSignal: string;
  redEvidence: string[];
  blueEvidence: string[];
}

export interface AuditContext {
  /** Path to Red's conversation.ndjson/json (for citation strings). */
  redConversationPath?: string;
  /** Path to Blue's stream.ndjson (for Claude CLI branch). */
  blueStreamPath?: string;
  /** Non-fatal: if omitted, the model produces a best-effort audit from the
   *  structured fields alone. */
  redIterationCount?: number;
  blueTurnCount?: number;
  /** Max wall-clock for the audit call. Default 3 min. */
  timeoutMs?: number;
}

export interface AuditEntryResult {
  entry: AuditEntry;
  rawModelOutput: string;
  /** Filled when the model's response could not be parsed or failed the
   *  grounding schema. Caller decides whether to re-run or drop. */
  rejectionReason?: string;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export async function generateAuditEntry(
  round: DuelRoundResult,
  ctx: AuditContext = {}
): Promise<AuditEntryResult> {
  const prompt = buildAuditPrompt(round, ctx);
  const raw = await callClaudeCli(prompt, ctx.timeoutMs ?? 3 * 60_000);

  const parsed = parseAuditJson(raw);
  if (!parsed) {
    return {
      entry: fallbackEntry(round),
      rawModelOutput: raw,
      rejectionReason: "Could not parse JSON from model output.",
    };
  }

  // Schema: both evidence arrays must be non-empty.
  const evidenceOk =
    Array.isArray(parsed.redEvidence) &&
    parsed.redEvidence.length > 0 &&
    Array.isArray(parsed.blueEvidence) &&
    parsed.blueEvidence.length > 0;

  if (!evidenceOk) {
    return {
      entry: fallbackEntry(round),
      rawModelOutput: raw,
      rejectionReason:
        "Grounding check failed: both redEvidence and blueEvidence must be non-empty arrays.",
    };
  }

  // Citation sanity: at least one blueEvidence item should mention the
  // word "turn" (Blue's unit of work) and at least one redEvidence item
  // should mention "iteration" or "iter". Soft check — log but don't reject.
  const blueCitesTurn = parsed.blueEvidence.some((e: string) =>
    /\bturn\b/i.test(e)
  );
  const redCitesIter = parsed.redEvidence.some((e: string) =>
    /\biter/i.test(e)
  );

  const entry: AuditEntry = {
    round: round.roundIndex,
    vulnClass: String(parsed.vulnClass ?? round.redReport?.vulnerability?.class ?? "unknown"),
    exploitSummary: String(parsed.exploitSummary ?? "").slice(0, 800),
    patchSummary: String(parsed.patchSummary ?? "").slice(0, 800),
    verificationSummary: String(parsed.verificationSummary ?? "").slice(0, 400),
    convergenceSignal: String(parsed.convergenceSignal ?? "").slice(0, 400),
    redEvidence: parsed.redEvidence.slice(0, 6).map((s: any) => String(s).slice(0, 300)),
    blueEvidence: parsed.blueEvidence.slice(0, 6).map((s: any) => String(s).slice(0, 300)),
  };

  return {
    entry,
    rawModelOutput: raw,
    rejectionReason:
      blueCitesTurn && redCitesIter
        ? undefined
        : "Soft-warn: citations do not include turn/iter keywords (accepted anyway).",
  };
}

// ---------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------

function buildAuditPrompt(round: DuelRoundResult, ctx: AuditContext): string {
  const red = round.redReport;
  const verify = round.verification;
  const vulnClass = red?.vulnerability?.class ?? "unknown";
  const severity = red?.vulnerability?.severity ?? "unknown";
  const redIters = ctx.redIterationCount ?? round.redIterations;
  const blueTurns = ctx.blueTurnCount ?? round.blueIterations;

  // Evidence hints from raw artifacts (optional; helps the model produce real
  // citations rather than fabricating "iter 7").
  const redHint = summarizeRedConversation(
    ctx.redConversationPath,
    redIters
  );
  const blueHint = summarizeBlueStream(ctx.blueStreamPath, blueTurns);

  const verifyLines = verify
    ? [
        `exploitNeutralized=${verify.exploitNeutralized}`,
        `benignPassed=${verify.benignPassed}`,
        `freshAttackerNeutralized=${verify.freshAttackerNeutralized}`,
        `storageLayoutChanged=${verify.storageLayoutChanged}`,
        `regressions=${(verify.regressions ?? []).join(",") || "(none)"}`,
        verify.error ? `error=${verify.error.slice(0, 240)}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "(no verification run)";

  return `You are producing a GROUNDED retrospective audit entry for one round of
a Red-vs-Blue solidity security duel. Output MUST be a single JSON object and
nothing else — no markdown fences, no preamble.

## Round ${round.roundIndex} facts (authoritative)
- Vulnerability class: ${vulnClass}
- Severity: ${severity}
- Red found: ${red?.found ? "YES" : "NO"}
- Red ran ${redIters} iterations
- Blue ran ${blueTurns} turns/iterations
- Blue patch success: ${round.blueSuccess ? "YES" : "NO"}
- Verification: ${verifyLines}
- Blue rationale snippet: ${truncate(round.blueRationale, 300)}
- Red exploit description: ${truncate(red?.vulnerability?.description, 400)}
- Round convergence signal from orchestrator: ${round.convergenceSignal ?? "(none)"}

## Evidence hints (use these as citation anchors when possible)
- Red conversation hint:
${indent(redHint, "  ")}
- Blue stream hint:
${indent(blueHint, "  ")}

## Grounding rules
- Every sentence in exploitSummary / patchSummary / verificationSummary MUST
  reference a specific iteration or turn when possible (e.g. "red iter 7",
  "blue turn 4"). If a fact has no evidence, drop it — DO NOT speculate.
- redEvidence must be a non-empty array of short citation strings, each
  citing "red iter N: <quote or description>".
- blueEvidence must be a non-empty array of short citation strings, each
  citing "blue turn N: <quote or description>".
- Keep each summary under 400 chars. Do not narrate; state findings.

## Output schema (exact keys, JSON only)
{
  "vulnClass": "<string>",
  "exploitSummary": "<string citing red iterations>",
  "patchSummary": "<string citing blue turns>",
  "verificationSummary": "<string citing the 4 gates>",
  "convergenceSignal": "<short phrase, e.g. 'hardened', 'blue_failed', 'same_class_repeated'>",
  "redEvidence": ["red iter N: …", "red iter M: …"],
  "blueEvidence": ["blue turn N: …", "blue turn M: …"]
}

Output the JSON object now.`;
}

function summarizeRedConversation(
  path: string | undefined,
  fallbackIters: number
): string {
  if (!path || !existsSync(path)) {
    return `(no transcript on disk; Red ran ${fallbackIters} iterations total)`;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    // Files are either .json (array) or .ndjson (one msg per line).
    let lines: string[] = [];
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          lines = arr
            .map((m: any) => compactMessage(m))
            .filter(Boolean) as string[];
        }
      } catch {
        // fall through
      }
    }
    if (lines.length === 0) {
      lines = trimmed
        .split(/\r?\n/)
        .map((l) => {
          try {
            return compactMessage(JSON.parse(l));
          } catch {
            return null;
          }
        })
        .filter(Boolean) as string[];
    }
    // Keep it small; we're giving the model anchors, not the full convo.
    const head = lines.slice(0, 3);
    const tail = lines.slice(-8);
    return [...head, "...", ...tail].join("\n").slice(0, 3_000);
  } catch (err) {
    return `(could not read Red transcript: ${(err as Error).message})`;
  }
}

function summarizeBlueStream(
  path: string | undefined,
  fallbackTurns: number
): string {
  if (!path || !existsSync(path)) {
    return `(no stream on disk; Blue ran ${fallbackTurns} turns total)`;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const pieces: string[] = [];
    let turn = 0;
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
        turn++;
        const contentArr = msg.message?.content;
        if (Array.isArray(contentArr)) {
          for (const block of contentArr) {
            if (block?.type === "text" && typeof block.text === "string") {
              pieces.push(`turn ${turn}: ${block.text.replace(/\s+/g, " ").slice(0, 180)}`);
            } else if (block?.type === "tool_use" && block.name) {
              const inp =
                typeof block.input === "object"
                  ? JSON.stringify(block.input).slice(0, 100)
                  : "";
              pieces.push(`turn ${turn}: tool=${block.name} ${inp}`);
            }
          }
        }
      }
    }
    if (pieces.length === 0) {
      return `(blue stream present but no assistant turns parsed; fallback turn count ${fallbackTurns})`;
    }
    const head = pieces.slice(0, 2);
    const tail = pieces.slice(-8);
    return [...head, "...", ...tail].join("\n").slice(0, 3_000);
  } catch (err) {
    return `(could not read Blue stream: ${(err as Error).message})`;
  }
}

function compactMessage(m: any): string | null {
  if (!m || typeof m !== "object") return null;
  const role = m.role ?? m.type ?? "?";
  if (m.tool_calls?.length) {
    const tc = m.tool_calls[0];
    return `${role} tool=${tc.function?.name ?? "?"} args=${String(tc.function?.arguments ?? "").slice(0, 100)}`;
  }
  if (typeof m.content === "string") {
    const text = m.content.replace(/\s+/g, " ").slice(0, 160);
    return `${role}: ${text}`;
  }
  if (m.name && typeof m.name === "string") {
    return `${role} name=${m.name}`;
  }
  return null;
}

// ---------------------------------------------------------------------
// Claude CLI invocation
// ---------------------------------------------------------------------

async function callClaudeCli(prompt: string, timeoutMs: number): Promise<string> {
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    const args = [
      "-p",
      "--model",
      "claude-opus-4-7",
      "--output-format",
      "text",
      "--no-session-persistence",
    ];
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const killTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill("SIGKILL");
      } catch {}
      rejectPromise(new Error(`claude audit call timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf-8");
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf-8");
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      rejectPromise(new Error(`claude audit spawn error: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (code !== 0) {
        rejectPromise(
          new Error(
            `claude audit exited ${code}. stderr tail: ${stderr.slice(-500)}`
          )
        );
        return;
      }
      resolvePromise(stdout);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// ---------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------

function parseAuditJson(raw: string): any | null {
  // Strip optional markdown fences the model sometimes emits even when told
  // not to.
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    return JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
}

function fallbackEntry(round: DuelRoundResult): AuditEntry {
  const vulnClass = round.redReport?.vulnerability?.class ?? "unknown";
  return {
    round: round.roundIndex,
    vulnClass,
    exploitSummary: `Red ran ${round.redIterations} iterations; found=${!!round.redReport?.found}.`,
    patchSummary: `Blue ran ${round.blueIterations} iterations; success=${round.blueSuccess}.`,
    verificationSummary: formatVerdictShort(round.verification),
    convergenceSignal: round.convergenceSignal ?? "unknown",
    redEvidence: [`red iter ${round.redIterations}: (transcript unavailable)`],
    blueEvidence: [`blue turn ${round.blueIterations}: (stream unavailable)`],
  };
}

function formatVerdictShort(v: PatchVerification | undefined): string {
  if (!v) return "no verification run";
  if (v.error) return `error: ${v.error.slice(0, 160)}`;
  return [
    `exploit=${v.exploitNeutralized ? "neutralized" : "alive"}`,
    `benign=${v.benignPassed ? "ok" : `fail(${v.regressions.join(",")})`}`,
    `fresh=${v.freshAttackerNeutralized ? "ok" : "fail"}`,
    `layout=${v.storageLayoutChanged ? "CHANGED" : "ok"}`,
  ].join(" ");
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return "(none)";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}
