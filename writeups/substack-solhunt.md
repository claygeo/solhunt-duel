# solhunt: an autonomous exploit-writing agent for smart contracts

Subtitle: **The red-team half of solhunt-duel, built months before the duel existed.**

---

## TL;DR

**solhunt** is an autonomous AI agent that finds and exploits smart-contract vulnerabilities. You give it a contract address, it forks the blockchain, reads the source, reasons about attack vectors, writes a Solidity exploit as a Foundry test, runs `forge test`, reads compiler errors, fixes its own code, and iterates until the exploit passes or it runs out of attempts.

No human in the loop. No static-analysis signatures. It's a Claude model driving a sandboxed toolchain (Bash, text editor, `forge_test`) inside Docker, reasoning from source code to working exploit the way a human auditor does.

On a curated benchmark of 32 famous DeFi hacks, it exploits **21 of 31 attempted (67.7%)**, averaging **$0.89 per contract** and **under two minutes** per scan.

On a random 95-contract sample from [DeFiHackLabs](https://github.com/SunWeb3Sec/DeFiHackLabs) — contracts I hadn't cherry-picked — the rate drops to **~13%**.

Both numbers are real. The gap between them is the most interesting thing about this project.

---

## The honest headline

"67.7% exploit rate on real DeFi hacks" is the kind of sentence that gets shared on Twitter. It's also misleading without context. The 32-contract curated set had contracts with verified Etherscan source, clear attack vectors, single-contract exploits, and no proxy patterns beyond the standard EIP-1967. Real-world distribution is nothing like that.

When I expanded to a random sample of 95 DeFiHackLabs entries, the rate collapsed to 13%. The other 87% were:
- Unverified contracts (no source)
- Multi-protocol exploits requiring cross-contract orchestration
- Contracts on BSC/Arbitrum mislabeled in the import
- Complex proxy patterns beyond the sandbox's capability

Reporting both numbers was a deliberate choice. A security tool that only benchmarks against easy wins isn't a security tool. A tool that publishes its failure distribution alongside its wins is at least an honest starting point.

Comparable academic benchmarks report ~51% on similar tasks. solhunt's 67.7% on the curated set beats that. Its 13% on a random sample doesn't. Both are true.

---

## How it works

### The loop

```
┌──────────────────────────────────────────────────────────┐
│                  solhunt agent loop                       │
│                                                           │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │ Ingestion│───>│  Agent Loop  │───>│   Reporter     │  │
│  │ (source, │    │  (Claude)    │    │  (structured   │  │
│  │  recon)  │    │              │    │   JSON out)    │  │
│  └──────────┘    └──────┬───────┘    └────────────────┘  │
│                         │                                 │
│                  ┌──────v───────┐                         │
│                  │  Tool Runner │                         │
│                  │ (sandboxed)  │                         │
│                  │  bash        │                         │
│                  │  text_editor │                         │
│                  │  read_file   │                         │
│                  │  forge_test  │                         │
│                  └──────┬───────┘                         │
│                         │                                 │
│                  ┌──────v──────────┐                      │
│                  │  Docker Sandbox │                      │
│                  │  Anvil fork     │                      │
│                  │  Foundry        │                      │
│                  │  Contract src   │                      │
│                  └─────────────────┘                      │
└──────────────────────────────────────────────────────────┘
```

### The agent has four tools

- `bash` — run shell commands inside the Docker sandbox
- `text_editor` — write or edit files (most often `test/Exploit.t.sol`)
- `read_file` — read files (contract source, test output)
- `forge_test` — compile + run Foundry tests against the forked chain

And one job: prove the vulnerability by writing a Foundry test that passes. When its output contains `===SOLHUNT_REPORT_START===` markers, the loop extracts a structured JSON report. That's it. No special reasoning prompts, no chain-of-thought templates — the agent decides what to read, what to write, what to run.

### Pre-scan recon

Before the agent starts, solhunt queries the forked chain in parallel: ETH balance, code size, owner address, token info, DEX pair data, storage slot 0, EIP-1967 proxy implementation address. 13 queries, 10-second timeout each. This saves the agent 3-5 iterations it would otherwise waste discovering basic facts about the contract.

Inline source injection: up to 30KB of contract source goes directly into the analysis prompt. The agent starts reasoning about vulnerabilities on turn 1, not turn 5.

### Smart recovery

LLMs without guardrails loop forever. solhunt has several anti-stuck mechanisms:

- **Context-aware nudges.** If the agent stops calling tools without producing a report, the loop injects a stage-specific nudge. Haven't read the code? "list files and read the main contract." Code read but no exploit? "stop reading, write the exploit NOW." Forge test failed? "read the error, rewrite Exploit.t.sol."
- **Loop detection.** If `forge_test` fires 3+ times in a row without an edit between, the loop forces a full rewrite with a different approach.
- **Iteration budget enforcement.** 8+ iterations of reading files and running `cast` queries without writing any exploit = hard warning.
- **Forced report extraction.** In the last 3 iterations, the loop forces a structured-report output. Handles cases where Claude stays in tool-use loops without producing text.
- **Conversation trimming.** Beyond 10 messages, older tool outputs get truncated to 200 chars. System prompt + analysis prompt + last 6 messages stay intact.
- **Circuit breaker.** In benchmark mode, 3 consecutive no-report contracts halt the run to avoid burning budget.

None of this is novel individually. Collectively it's the difference between an agent that runs for 30 minutes and produces nothing, and one that finishes in under two minutes with a structured report.

---

## What it's good at

Looking at the 21 successes on the curated set, the pattern is clear: **single-contract exploits where the vuln is in the source code you can read**.

- **Reentrancy (5/6, 83.3%)** — well-scoped. Agent reads the callback, writes a recursive caller, proves it drains.
- **Access control (6/8, 75%)** — equally well-scoped. Missing modifiers, misnamed functions, unprotected initializers.
- **Logic errors (3/5, 60%)** — works when the bug is visible in the source. Struggles when it's an arithmetic pattern spanning multiple contracts.
- **Price manipulation (4/7, 57%)** — works when the manipulation vector is obvious from a DEX pair query.
- **Integer overflow (1/2, 50%)**, **flash loan (1/2, 50%)** — small samples.

Full results are in the README if you want to verify contract by contract.

---

## What it's bad at

From the same curated set, the misses cluster around specific failure modes:

- **Multi-contract exploits.** Attacks that require coordinating calls across 3+ protocols. The agent can reason about 1-2 contracts simultaneously; beyond that it loses the thread.
- **Complex proxy patterns.** EIP-1967 is fine. Proxies with unusual delegate-call routing or diamond patterns are not.
- **Stateful preconditions.** Exploits that depend on specific pool reserves, allowances from third parties, or oracle prices at specific blocks. The agent can't always reconstruct the state needed to make the exploit land.
- **Obfuscated source.** Contracts with heavy bytecode optimization, stripped names, or encoded function selectors.

This is where the 67%→13% gap lives. The curated set was (unintentionally, in hindsight) selected for contracts that avoided these failure modes. The random sample hits them hard.

---

## The architecture

### Docker sandbox per scan

Each scan runs in its own ephemeral container built from `ghcr.io/foundry-rs/foundry:latest`. Anvil forks mainnet at a specific block. Foundry compiles. Contract source gets fetched from Etherscan and mounted. Agent drives via `docker exec`.

Isolation matters for two reasons:
1. The agent writes arbitrary Solidity and runs it. A shared fork could have state leaks between scans.
2. Container destruction between scans is the hard reset. No hidden persistence.

### Cost model

Per-scan cost on Sonnet 4 (via OpenRouter) ran $0.60-$1.90, averaging $0.89. That includes pre-scan recon, the agent's full tool-use budget (30 iterations max), and structured-report extraction.

For solhunt-duel (the successor project), I ported both red and blue agents to `claude -p` subprocess with Opus 4.7. Same architecture, cleaner cost profile, and the unlock for running 10-contract benchmarks without API credit anxiety.

### Supabase persistence

Every scan writes to Supabase: contract metadata, scan run, per-iteration tool calls, final report, conversation transcript. Gives you a searchable history of what the agent tried and why.

For the duel, this schema got extended with `duel_runs` and `duel_rounds` tables plus an `agent_role` column on `scan_runs`. Same storage backbone, different downstream queries.

---

## Why this matters

Smart-contract auditing is roughly a $1B+ industry and still runs mostly on senior engineers reading code manually. Static tools (Slither, Mythril, Aderyn) produce findings but don't prove them. Commercial auditors produce proofs but at $500-$5,000 per contract per audit.

solhunt exists to ask: **can an LLM close the gap at the unit level?** Not "replace the auditor" — that's not happening. But:
- Can it triage a random DeFi contract and produce a working exploit for the subset where one exists?
- At what cost?
- With what reliability?

13% and $0.89 and 90 seconds is a real answer, even if it's not the answer that closes the market. It's a reproducible starting point, and the failure distribution is a roadmap.

---

## solhunt-duel — what came after

Once you have a red team that writes working exploits, the obvious next move is to build a blue team that writes working patches — and have them fight.

[solhunt-duel](https://github.com/claygeo/solhunt-duel) does exactly that. Red finds the exploit, blue writes a Solidity patch, the harness verifies the patch holds under four defensibility gates, and they iterate until convergence.

I wrote up solhunt-duel separately; that's the current project. solhunt itself is the foundation it's built on, and this post exists because the foundation deserves its own accounting.

---

## Links

- **Code:** [github.com/claygeo/solhunt](https://github.com/claygeo/solhunt) (or the duel repo; historic solhunt lives on the `solhunt-legacy` remote as of April 2026)
- **Benchmark dataset:** `benchmark/dataset.json` — 32-entry curated set, contracts hash-pinned
- **Raw per-contract results:** in the README tables; all 31 attempts listed individually

If you want to poke at the 13% number and find out which contracts solhunt fails on, the data is all there. I'd be curious what a more carefully-engineered agent loop could do with the same sandbox.

— Clayton
