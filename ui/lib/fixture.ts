// Minimal fixture shape the UI actually consumes. Kept intentionally loose so
// we can decouple from the larger DuelFixture type without a cross-package
// import. Lives in ui/public/fixtures/dexible.json.
export interface UiFixture {
  _provenance: {
    runId: string;
    source: string;
    synthesized: string[];
    verbatim: string[];
  };
  schemaVersion: 1;
  metadata: {
    contractName: string;
    contractAddress: string;
    freshAddress: string;
    chain: string;
    forkBlockNumber: number;
    vulnerabilityClass: string;
    valueImpacted: string;
    referenceExploit: string;
    datasetSplit: string;
  };
  stats: {
    convergence: string;
    roundsExecuted: number;
    wallTimeSec: number;
    notionalCostUsd: number;
    realCostUsd: number;
  };
  pivot: {
    narrative: string;
  };
  rounds: Array<{
    round: number;
    label: string;
    red: {
      model: string;
      turns: number;
      durationMs: number;
      found: boolean;
      exploitSource?: string;
      exploitSummary: string;
      forgeOutcome: string;
      reconSnippet?: string;
    };
    blue?: {
      model: string;
      turns: number;
      durationMs: number;
      patchedSource: string;
      originalSource: string;
      approachSummary: string;
      rationale: string;
    };
    verification?: {
      exploitNeutralized: boolean;
      benignPassed: boolean;
      freshAttackerNeutralized: boolean;
      storageLayoutPreserved: boolean;
    };
    summary?: string;
  }>;
  audit: Array<{ tag: string; text: string }>;
  methodology: string;
}
