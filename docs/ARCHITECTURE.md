# Architecture

> **TL;DR (60-second read):** This repo holds two related but separate projects.
> **Solhunt** is a single-agent scanner: give it a contract, it writes a Foundry exploit if one exists, otherwise it emits a structured no-find report. Numbers: 67.7% on a curated 32-contract DeFiHackLabs subset, 13.7% on a 95-contract random draw — both published honestly. **Solhunt-Duel** sits on top: Red writes the exploit, Blue writes a Solidity patch, a server-side harness enforces four gates the LLMs cannot see or modify (`exploitNeutralized`, `benignPassed`, `freshAttackerNeutralized`, `storageLayoutPreserved`) before declaring convergence. The premise: agents will lie about success if you let them, so the verdict lives outside the agent.
>
> **Live artifacts:** [leaderboard](https://solhunt-duel.netlify.app/leaderboard/) · [gate verifier walkthrough (PROOF.md)](PROOF.md) · [v2 corpus expansion plan](PLAN-V2-BENCHMARK-EXPANSION.md)

---

## The two projects

| | Solhunt (predecessor) | Solhunt-Duel (current) |
|---|---|---|
| **Mode** | Single-agent: Red writes exploits | Adversarial: Red writes exploits, Blue writes patches |
| **Verdict source** | Foundry forge_test exit code | Foundry forge_test against four server-side gates |
| **Convergence claim** | "Found exploit" iff forge passes | "Hardened" iff Red exploits AND Blue patches AND all 4 gates green |
| **Output** | Per-contract exploit-or-no-find report | Per-duel round-by-round trace + final convergence label |
| **Headline numbers** | 67.7% curated / 13.7% random (32 / 95 contracts) | 1 hardened / 3 red-failed / 3 blue-failed / 1 same-class-escaped / 2 timeout (10 contracts in Phase 4) |

The two share docker sandbox + anvil fork + supabase persistence. They differ in agent loop and verifier.

---

## Solhunt-Duel — adversarial loop with server-side gates

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operator
    participant Orch as Orchestrator
    participant Red as Red Agent
    participant Blue as Blue Agent
    participant Verify as verifyPatch (harness)
    participant Anvil as Anvil Fork
    participant SB as Supabase

    Op->>Orch: duel --target dexible
    Orch->>Anvil: Start fork at historical block
    Orch->>Anvil: Clone runtime bytecode to fresh address
    Note over Anvil: Fresh addr means no constructor state<br/>(catches uninitialized-storage bugs)

    loop Up to N rounds
        Orch->>Red: Source + prior round context
        Red->>Anvil: Iterative tool calls (read/edit/forge_test)
        Red-->>Orch: Exploit.t.sol (or no-find)

        alt Red found exploit
            Orch->>Blue: Source + Red's exploit
            Blue->>Anvil: Iterative patch attempts
            Blue->>Verify: verify_patch (after each patch)
            Verify->>Anvil: Build patched + extract bytecode + storage layout
            Verify->>Anvil: vm.etch patched bytecode at fresh addr
            Verify->>Anvil: Run sanity (exploit on ORIGINAL = PASS expected)
            Verify->>Anvil: Run exploit on PATCHED = FAIL expected
            Verify->>Anvil: Run exploit with FRESH attacker label = FAIL expected
            Verify->>Anvil: Run benign suite on PATCHED = PASS expected
            Verify->>Verify: Compare storage layouts = unchanged expected
            Verify-->>Blue: { exploitNeutralized, benignPassed, freshAttackerNeutralized, storageLayoutChanged, regressions, error? }
            Blue-->>Orch: Final patch (when 4 gates green) or budget exhausted
        end

        Orch->>SB: Round audit trail (red turns, blue turns, verify verdicts)
    end

    Orch->>SB: Duel result (HARDENED / BLUE_FAILED / RED_FAILED / SAME_CLASS_ESCAPED / TIMEOUT)
    Orch->>Op: Convergence label + leaderboard row
```

The four gates and what they catch:

| Gate | Computed in `verifyPatch()` | Defeats |
|---|---|---|
| `exploitNeutralized` | exploit FAILS on patched bytecode | "patch did nothing" |
| `freshAttackerNeutralized` | exploit FAILS from a different EOA | "patch only blocks the original attacker address" |
| `benignPassed` | benign happy-path tests still PASS | "patch deleted the function entirely" |
| `storageLayoutChanged == false` | original vs patched storage layout slots/offsets/types match | "patch silently bricks existing state" |

Source: [`src/sandbox/patch-harness.ts`](https://github.com/claygeo/solhunt-duel/blob/master/src/sandbox/patch-harness.ts) · Full walkthrough: [PROOF.md](PROOF.md)

**Convergence taxonomy** (what each leaderboard label means):

- `HARDENED` — Red found an exploit, Blue produced a patch, all 4 gates green
- `BLUE_FAILED` — Red found exploit, Blue exhausted budget without all 4 gates green
- `RED_FAILED` — Red emitted no-find within budget; contract may be safe OR our agent missed
- `SAME_CLASS_ESCAPED` — Blue's patch passed gates, Red pivoted to a DIFFERENT vulnerability of the same class — escape, not hardening
- `TIMEOUT` — wall-clock cap hit before any agent emitted a final verdict

The taxonomy is deliberately five-way, not two-way. "Did Blue patch successfully" and "is the contract now safe" are different questions; the labels keep them separate.

---

## Solhunt (single-agent scanner) — predecessor

The original loop. Used to produce the headline 67.7% / 13.7% numbers.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant CLI as solhunt CLI
    participant ES as Etherscan API
    participant Docker as Docker Sandbox
    participant Anvil as Anvil Fork
    participant LLM as LLM (Claude Sonnet 4)
    participant SB as Supabase

    User->>CLI: benchmark --dataset X --model Y
    CLI->>SB: insertBenchmarkRun()

    loop Each contract
        CLI->>ES: Fetch source code
        ES-->>CLI: Solidity files
        CLI->>Docker: Create isolated container
        Docker->>Anvil: Start fork at historical block
        Note over Anvil: Alchemy archive RPC required<br/>for historical state

        CLI->>LLM: System prompt + source + recon
        loop Up to 30 iterations
            LLM-->>CLI: Tool calls (bash, str_replace_editor, forge_test)
            CLI->>Docker: Execute tool
            Docker-->>CLI: Output
            CLI->>SB: Log tool_call row
            CLI->>LLM: Tool result (smart-trimmed)
        end

        LLM-->>CLI: ===SOLHUNT_REPORT_START=== JSON ===
        CLI->>SB: insertScanRun() + upload artifacts
        CLI->>Docker: Destroy container
    end

    CLI->>SB: updateBenchmarkRun() aggregate
    CLI->>User: Results table + cost summary
```

### Agent loop state machine

```mermaid
stateDiagram-v2
    [*] --> Read: initial prompt
    Read --> Identify: source read
    Identify --> Write: pattern detected
    Write --> Test: exploit.t.sol created
    Test --> Write: compile error<br/>(str_replace)
    Test --> Test: forge fails<br/>(retry different vector)
    Test --> Report: forge passes
    Identify --> Report: no exploit found<br/>after iter N
    Write --> Report: iteration budget hit
    Report --> [*]

    Read: read source files
    Identify: identify attack vector
    Write: write exploit test
    Test: run forge_test
    Report: emit SOLHUNT_REPORT
```

---

## Shared infrastructure

### Data model

```mermaid
erDiagram
    benchmark_runs ||--o{ scan_runs : produces
    scan_runs ||--o{ tool_calls : logs
    contracts ||--o{ scan_runs : scanned
    scan_runs ||--o{ artifacts : generates
    duel_runs ||--o{ duel_rounds : has
    duel_rounds ||--o{ scan_runs : reuses

    benchmark_runs {
        uuid id PK
        string provider
        string model
        int total
        int exploited
        float success_rate
        float total_cost
        timestamp created_at
    }

    scan_runs {
        uuid id PK
        uuid contract_id FK
        uuid benchmark_run_id FK
        bool found
        bool test_passed
        string vuln_class
        string severity
        float cost_usd
        int iterations
        int max_iterations
        string exploit_code_path
        string forge_output_path
        string conversation_path
    }

    duel_runs {
        uuid id PK
        uuid contract_id FK
        string convergence
        int rounds
        float wall_time_seconds
        float notional_cost
        timestamp created_at
    }

    duel_rounds {
        uuid id PK
        uuid duel_run_id FK
        int round_index
        bool exploit_neutralized
        bool benign_passed
        bool fresh_attacker_neutralized
        bool storage_layout_changed
    }

    tool_calls {
        int id PK
        uuid scan_run_id FK
        int iteration
        string tool_name
        int duration_ms
        bool is_error
        string summary
    }

    contracts {
        uuid id PK
        string address
        string chain
        string name
        int block_number
        string vuln_class
        string description
        string date_exploited
        string value_impacted
    }
```

### Why Docker sandbox per scan
- Isolation: agent can't escape or affect host
- Reproducibility: every scan starts from identical state
- Preloaded DeFi libs (Aave V3, Compound, Uniswap V2/V3, OZ v4+v5, Chainlink)
- Destroyed after scan, no lingering state

### Why Alchemy (archive node)
- Historical block forking requires archive state
- Free public RPCs (llamarpc, publicnode) don't serve archive state
- Alchemy free tier: 300M compute units/month, sufficient for benchmarks
- We hit this as a hard blocker before switching

### Why Supabase for persistence
- Separates transactional data (pg) from artifacts (storage bucket)
- Service role key = no auth surface for our internal pipeline
- Artifacts stored as `runs/<scan_id>/{exploit.sol, conversation.json.gz, forge_output.txt}`
- Queryable from analysis scripts without re-fetching

### Why fire-and-forget flush pattern
- `DataCollector` buffers tool calls, messages, artifacts in memory during scan
- One `flush(scanRunId)` call after scan completes
- All Supabase writes wrapped in try/catch that never throws
- Scan result is never blocked by storage failures
- If Supabase is down, we still get the scan result, we just lose persistence for that run

### Why auto-checksum addresses
- LLMs emit lowercase hex addresses frequently
- Forge rejects with EIP-55 checksum errors
- Agent wastes 5-10 iterations fighting this
- Fix: regex replace all `0x[40 hex]` with keccak256-computed checksums on every .sol file write

### Why vm.prank false-positive guard
- `vm.prank(admin)` makes next call appear from admin
- Agent discovered it could "exploit" access-controlled functions this way
- But pranking as owner to call owner functions proves nothing
- System prompt now lists valid uses (whale, EOA, governance-after-vote) and flags invalid use

### Why fresh-address bytecode cloning (Solhunt-Duel only)
- Original contract address has constructor state, immutables, possibly initializer storage
- vm.etch swaps runtime bytecode but does NOT replay the constructor
- If we just etched on the original address, Blue's patches that depend on initializer storage would silently fail
- Fix: clone bytecode to a fresh deterministic address with anvil_setCode, then run all verify stages against that address. Each stage anvil_setCode's the correct variant (original / patched) before running.

---

## Cost controls

Two layers of protection:

1. **Failure circuit breaker** (existing, pre-Duel):
   - If last 3 contracts all failed without producing a report → stop
   - If last 3 contracts all hit the same error → stop

2. **Budget circuit breaker**:
   - `--max-budget <usd>` global cap
   - Checks cumulative cost between batches
   - Stops immediately if cap exceeded
   - Warns at 75% usage

Without these, a stuck agent in a 30-iteration loop at $3+ per contract could burn through an $80 budget in the first ~27 contracts.

---

## Model abstraction

```mermaid
flowchart LR
    Agent[Agent Loop] --> Provider{Provider}
    Provider -->|openai format| Claude[Claude Sonnet 4]
    Provider -->|openai format| Qwen[Qwen3.5-35B-A3B]
    Provider -->|openai format| GPT[GPT-4o]
    Provider -->|openai format| Gemini[Gemini 2.0 Flash]
    Provider -->|anthropic SDK| Direct[Direct Anthropic]
    Provider -->|localhost| Ollama[Ollama local models]
    Provider -->|claude-cli| ClaudeCLI[Claude Code CLI]
```

One provider abstraction, multiple backends. Qwen-specific handling: append `/no_think` to disable reasoning on local models. Cost calculated per-token against PRICING table. Solhunt-Duel adds a Claude Code CLI backend (uses Max subscription, not API metered) for autonomous overnight runs.

---

## Where to read the code

For the gate verifier (the load-bearing claim of Solhunt-Duel): start at [`src/sandbox/patch-harness.ts:89`](https://github.com/claygeo/solhunt-duel/blob/master/src/sandbox/patch-harness.ts#L89) — the `verifyPatch()` function is the entire gate-checking pipeline in 130 lines.

For the duel orchestration: [`src/duel/orchestrator.ts`](https://github.com/claygeo/solhunt-duel/blob/master/src/duel/orchestrator.ts) — Red/Blue round coordination, fresh-address bytecode cloning, audit trail.

For the single-agent scanner: [`src/agent/`](https://github.com/claygeo/solhunt-duel/tree/master/src/agent) — read loop, prompts, tool definitions.

For the benchmark runner: [`src/bench/`](https://github.com/claygeo/solhunt-duel/tree/master/src/bench) — phase0 (single-agent) and phase1 (duel) runner entry points.

---

## Honest limitations

- The Phase 4 duel set is 10 contracts. That's small-N. The v2 expansion plan in [PLAN-V2-BENCHMARK-EXPANSION.md](PLAN-V2-BENCHMARK-EXPANSION.md) is how we get to 50+ with vuln-class diversity and adversarial-clean baseline.
- The 67.7% / 13.7% gap is real and unresolved. Sandbox limitations dominate the failure modes on random samples (compiler version mismatches, cross-contract dependencies the harness doesn't pre-load). See [README §The numbers](https://github.com/claygeo/solhunt-duel/blob/master/README.md#the-numbers--be-precise) for the failure breakdown.
- The gates falsify positive claims, not negative ones. A `HARDENED` verdict means "we ran the four checks and they all passed." It does NOT mean "the contract is now bulletproof." Different claim, different scope.
- MEV and front-running are invisible to the verifier. Deterministic block timing on a frozen fork. Real-world transaction ordering is not modeled.
- Multi-contract attack chains that need specific pool / oracle state at specific blocks fail on our harness fork even when the exploit works on mainnet. We don't pre-load arbitrary DeFi state. Those collapse to RED_FAILED, not falsely-hardened runs.

If you find a counter-example to any of these, please file an issue. Honest negative results compound; spin destroys.
