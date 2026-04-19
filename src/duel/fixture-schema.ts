// Demo UI fixture schema. This is the source of truth for what Phase 2's
// orchestrator must emit after a duel completes, AND what Phase 3's Next.js UI
// consumes as static JSON. Single file, both sides import this type.
//
// Invariant: one fixture file per contract-duel. Loaded at build time by the UI
// (or at runtime for the `/demo` playback route). No live Supabase calls on
// demo day — the `/demo` path is 100% static JSON.
//
// File layout convention (emitted by Phase 2 post-duel):
//   data/fixtures/duels/<contract-slug>.json
//
// Phase 4's holdout run emits the same shape to data/fixtures/holdout/<slug>.json.

import type { PatchVerification } from "../sandbox/patch-harness.js";
import type { PatchComparison } from "../historic/differ.js";

export interface DuelFixtureMetadata {
  contractName: string;
  contractAddress: string;
  chain: string;
  forkBlockNumber: number;
  vulnerabilityClass: string;
  valueImpacted: string;
  dateExploited: string;
  referenceExploit: string;
  datasetSplit: "train" | "holdout" | "adversarial";
}

export interface DuelFixtureRound {
  round: number;

  // Red phase
  redScan: {
    model: string;                      // e.g. "anthropic/claude-sonnet-4"
    iterations: number;
    durationMs: number;
    found: boolean;
    exploitSource: string;              // the compiled Forge test file
    exploitSummary: string;             // 1-line human-friendly description
    vulnClass: string;
    severity: "critical" | "high" | "medium" | "low";
    functions: string[];                // which contract functions are attacked
    conversationDigest: Array<{
      iteration: number;
      action: string;                   // "read Dexible.sol" | "wrote Exploit.t.sol" | "ran forge test"
      outcome?: string;                 // "test passed" | "compile failed"
    }>;
  };

  // Blue phase (null if red didn't find)
  bluePatch?: {
    model: string;                      // e.g. "claude-opus-4-7"
    claudeInternalTurns: number;        // stream-json turns
    durationMs: number;
    patchedSource: string;              // full .sol after patching
    diffLinesAdded: number;
    diffLinesRemoved: number;
    rationale: string;                  // Blue's own 2-3 sentence explanation
    approachSummary: string;            // 1-line human-friendly ("allowlist mapping + onlyAdmin setter")
    notionalCostUsd: number;            // subscription = $0 real, but notional for telemetry
    internalToolCalls: Array<{
      turn: number;
      tool: "Bash" | "Read" | "Edit" | "Write";
      target?: string;                  // file path or command summary
    }>;
  };

  // Verification gates (null if blue didn't run)
  verification?: PatchVerification;

  // Convergence signal emitted by orchestrator for this round
  convergenceSignal:
    | "new_vuln_found"            // red found something new, loop continues
    | "blue_hardened"             // all 4 gates green, ready for next round's red scan
    | "blue_failed_gates"         // blue couldn't get to green within budget
    | "same_class_escaped"        // red re-found same vuln class → patch was incomplete
    | "no_vuln_found"             // red came up empty → contract is hardened
    | "budget_exhausted";         // wall-clock or iteration budget hit

  // Grounded audit entry (from src/duel/audit-trail.ts)
  auditEntry: {
    vulnClass: string;
    exploitSummary: string;
    patchSummary: string;
    verificationSummary: string;
    redEvidence: string[];              // each string cites a red iteration/action
    blueEvidence: string[];             // each string cites a blue turn
    timestamp: string;                  // ISO 8601
  };
}

export interface DuelFixture {
  schemaVersion: 1;
  metadata: DuelFixtureMetadata;

  rounds: DuelFixtureRound[];

  // Final verdict
  convergence:
    | "hardened"                  // no new vulns found in terminal round
    | "blue_failed"               // blue couldn't converge
    | "budget_exhausted"          // hit max rounds
    | "same_class_escaped";       // patch was incomplete

  // Aggregate stats for the metrics header
  stats: {
    totalRoundsExecuted: number;
    totalWallTimeMs: number;
    totalNotionalCostUsd: number;
    patchLocMedian: number;             // median lines changed across rounds
    patchLocP90: number;
    // Gate pass rates across ALL rounds (0..1)
    exploitNeutralizationRate: number;
    benignPassRate: number;
    freshAttackerNeutralizationRate: number;
    storageLayoutPreservationRate: number;
  };

  // Historic side-by-side (optional; null if we couldn't find protocol's real patch)
  historicComparison?: PatchComparison;

  // Held-out-red validation (Phase 4)
  heldOutRed?: {
    model: string;                      // e.g. "claude-sonnet-4-5"
    foundNew: boolean;                  // if true, "hardened" claim is weakened
    iterations: number;
    note: string;                       // human-readable summary
  };

  // Provenance
  sha: {
    datasetManifest: string;            // SHA256 of the dataset-split manifest at run-time
    runnerConfig: string;               // SHA256 of the runner config
    gitCommit: string;                  // HEAD at run time
    runStartedAt: string;               // ISO 8601
    runEndedAt: string;                 // ISO 8601
  };
}

// ---------------------------------------------------------------------
// Minimal shape for the UI's list view (home page) — derived from DuelFixture
// ---------------------------------------------------------------------

export interface DuelFixtureSummary {
  contractName: string;
  datasetSplit: DuelFixtureMetadata["datasetSplit"];
  valueImpacted: string;
  convergence: DuelFixture["convergence"];
  roundsExecuted: number;
  blueApproachSummary?: string;
  historicAvailable: boolean;
}

export function summarizeFixture(f: DuelFixture): DuelFixtureSummary {
  const lastBluePatch = [...f.rounds].reverse().find((r) => r.bluePatch);
  return {
    contractName: f.metadata.contractName,
    datasetSplit: f.metadata.datasetSplit,
    valueImpacted: f.metadata.valueImpacted,
    convergence: f.convergence,
    roundsExecuted: f.stats.totalRoundsExecuted,
    blueApproachSummary: lastBluePatch?.bluePatch?.approachSummary,
    historicAvailable: !!f.historicComparison?.historicPatch?.available,
  };
}
