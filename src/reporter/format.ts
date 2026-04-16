export interface ExploitReport {
  contract: string;
  contractName: string;
  chain: string;
  blockNumber: number;
  found: boolean;
  vulnerability: {
    class: string;
    severity: "critical" | "high" | "medium" | "low";
    functions: string[];
    description: string;
  };
  exploit: {
    script: string;
    executed: boolean;
    output: string;
    valueAtRisk: string;
  };
}

export interface ScanResult {
  report: ExploitReport | null;
  iterations: number;
  cost: {
    inputTokens: number;
    outputTokens: number;
    totalUSD: number;
  };
  durationMs: number;
  error?: string;
}

// API pricing (per 1M tokens). Ollama/local models are free.
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // OpenRouter (same underlying models, pass-through pricing)
  "anthropic/claude-sonnet-4": { input: 3, output: 15 },
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  // Gemini (very cheap, used for infrastructure testing)
  "google/gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
  "google/gemini-flash-1.5": { input: 0.075, output: 0.3 },
  // Qwen (OpenRouter pricing as of 2026-04)
  "qwen/qwen3.6-plus": { input: 0.325, output: 1.95 },
  "qwen/qwen3.5-9b": { input: 0.05, output: 0.15 },
  "qwen/qwen3.5-35b-a3b": { input: 0.16, output: 1.30 },
  "qwen/qwen3.5-27b": { input: 0.20, output: 1.56 },
  "qwen/qwen3.5-122b-a10b": { input: 0.26, output: 2.08 },
  "qwen/qwen3.5-flash-02-23": { input: 0.07, output: 0.26 },
  "qwen/qwen3.5-plus-02-15": { input: 0.26, output: 1.56 },
  "qwen/qwen3.5-397b-a17b": { input: 0.39, output: 2.34 },
  "qwen/qwen3-coder-next": { input: 0.15, output: 0.80 },
  "qwen/qwen3-max-thinking": { input: 0.78, output: 3.90 },
};

// Default: free (Ollama, local models)
const FREE = { input: 0, output: 0 };

// Track unknown models so we warn once instead of silently showing $0
const warnedUnknownModels = new Set<string>();

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  let price = PRICING[model];
  if (!price) {
    // Check for partial matches (e.g., "qwen/qwen3.6-plus-04-02" should match "qwen/qwen3.6-plus")
    const prefixMatch = Object.keys(PRICING).find(k => model.startsWith(k));
    if (prefixMatch) {
      price = PRICING[prefixMatch];
    } else {
      if (!warnedUnknownModels.has(model)) {
        warnedUnknownModels.add(model);
        console.error(`[cost] WARNING: unknown model '${model}' - defaulting to $0/token. Add to PRICING table in reporter/format.ts to track cost accurately.`);
      }
      price = FREE;
    }
  }
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}
