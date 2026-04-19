// Subscription-backed provider. Ports the pattern from
// rotmg-hunter/src/agent/provider-subscription.ts so Blue can optionally route
// its prose-only calls (benign-suite generator, future retros) through the
// user's Claude Max plan instead of burning OpenRouter credits.
//
// Cost behavior:
//   - OpenRouter charges per-token; a Blue patch cycle would cost ~$0.05-0.20.
//   - Claude Max is flat-rate. The subprocess returns `total_cost_usd` as the
//     NOTIONAL api-equivalent pricing; actual bill is $0 since we're on the plan.
//
// Tool calling: NOT supported here. `claude -p` returns prose/JSON only. The
// Blue main loop ALWAYS needs tools (verify_patch is the oracle), so this
// function is only used by the benign-suite generator and any future
// prose-only sub-calls. Tactical tool-using turns must stay on the configured
// provider.
//
// Windows-friendly: spawn with `shell: true` so the `claude.cmd` shim from
// nvm4w resolves correctly.
import { spawn } from "node:child_process";
import type { Message, CompletionResponse } from "./provider.js";

export interface SubscriptionConfig {
  /** e.g. "claude-sonnet-4-5-20250929", "claude-opus-4-7", or an alias like "opus". */
  model: string;
  /** Subprocess kill timeout (ms). Default 300_000 (5min — Opus needs headroom on Solidity generation). */
  timeoutMs?: number;
  /** Passthrough to `--max-budget-usd`, optional. */
  maxBudgetUsd?: number;
}

interface ClaudeCliResult {
  type: string;
  subtype: string;
  is_error: boolean;
  api_error_status?: string | null;
  result: string;
  stop_reason?: string;
  session_id?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// Collapse Message[] into a single prompt. `claude -p` takes one text blob,
// not a role-tagged conversation. We preserve structure with section headers
// so Claude still reads the system prompt as instructions.
function messagesToPrompt(messages: Message[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    const content =
      typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content ?? "");
    if (!content.trim()) continue;
    if (m.role === "system") {
      parts.push(`# System instructions\n\n${content}`);
    } else if (m.role === "user") {
      parts.push(`# User\n\n${content}`);
    } else if (m.role === "assistant") {
      parts.push(`# Previous assistant response\n\n${content}`);
    }
  }
  return parts.join("\n\n---\n\n");
}

export async function subscriptionCompletion(
  config: SubscriptionConfig,
  messages: Message[]
): Promise<CompletionResponse> {
  const prompt = messagesToPrompt(messages);
  const args = [
    "-p",
    "--output-format", "json",
    "--model", config.model,
    "--no-session-persistence",
  ];
  if (config.maxBudgetUsd != null) {
    args.push("--max-budget-usd", String(config.maxBudgetUsd));
  }

  const timeoutMs = config.timeoutMs ?? 300_000;

  return await new Promise<CompletionResponse>((resolvePromise, rejectPromise) => {
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const killTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill();
      rejectPromise(new Error(`claude subprocess timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      rejectPromise(new Error(`claude subprocess spawn error: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (code !== 0) {
        rejectPromise(
          new Error(
            `claude subprocess exited ${code}. stderr: ${stderr.slice(0, 500)}`
          )
        );
        return;
      }
      try {
        const parsed: ClaudeCliResult = JSON.parse(stdout);
        if (parsed.is_error) {
          rejectPromise(
            new Error(
              `claude subscription error: ${parsed.api_error_status ?? "unknown"}`
            )
          );
          return;
        }
        resolvePromise({
          message: { role: "assistant", content: parsed.result },
          finish_reason: parsed.stop_reason === "max_tokens" ? "length" : "stop",
          usage: {
            prompt_tokens: parsed.usage?.input_tokens ?? 0,
            completion_tokens: parsed.usage?.output_tokens ?? 0,
            total_tokens:
              (parsed.usage?.input_tokens ?? 0) +
              (parsed.usage?.output_tokens ?? 0),
          },
        });
      } catch (e) {
        rejectPromise(
          new Error(
            `claude subprocess output parse error: ${(e as Error).message}. stdout: ${stdout.slice(0, 500)}`
          )
        );
      }
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// Map OpenRouter-style model names to the dated IDs `claude -p` expects.
// Keeps pinned ids verbatim so an Opus 5 release doesn't silently replace
// our strategic brain.
export function mapToClaudeCliModel(openrouterModel: string): string {
  const m = openrouterModel.toLowerCase();
  if (m.startsWith("claude-")) return openrouterModel;
  if (m === "opus") return "opus";
  if (m === "sonnet") return "sonnet";
  if (m === "haiku") return "haiku";
  if (m.includes("sonnet-4.5") || m.includes("sonnet-4-5")) return "claude-sonnet-4-5-20250929";
  if (m.includes("haiku-4.5") || m.includes("haiku-4-5")) return "claude-haiku-4-5-20251001";
  if (m.includes("opus-4.7") || m.includes("opus-4-7")) return "claude-opus-4-7";
  if (m.includes("opus-4")) return "opus";
  return openrouterModel;
}
