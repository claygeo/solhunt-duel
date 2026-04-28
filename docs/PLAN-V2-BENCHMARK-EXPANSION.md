# PLAN — V2 Benchmark Expansion (32 → 50+ contracts)

> **Status:** PLAN ONLY. This document is the input to a `/plan-eng-review` session, NOT a green-lit work order. Operator must read + approve before any code lands. /codex outside-voice review also required before execution per gstack discipline.
>
> **Author:** Claude (autonomous loop, iteration #6, 2026-04-28).
> **Why now:** Per master 90-day plan, the leaderboard's biggest credibility lift is corpus expansion — 32 curated contracts is a "small-N" tell. 50+ contracts with broader vuln-class coverage moves the conversation from "demo on cherry-picked exploits" to "benchmark with statistical signal."
> **Goal:** before publishing v2 leaderboard numbers, expand corpus to ≥50 contracts spanning ≥8 distinct vuln classes, with at least 5 adversarial-no-find contracts (no known bug — agent should report no-find, not fabricate one).

## Today's corpus (the baseline)

[`benchmark/dataset.json`](https://github.com/claygeo/solhunt-duel/blob/master/benchmark/dataset.json) currently has **32 contracts** sourced from DeFiHackLabs. Vulnerability class distribution:

| Class | Count | % |
|---|---|---|
| price-manipulation | 8 | 25% |
| access-control | 8 | 25% |
| reentrancy | 7 | 22% |
| logic-error | 5 | 16% |
| integer-overflow | 2 | 6% |
| flash-loan | 2 | 6% |
| **Total** | **32** | 100% |

**Headline result on this set:** 67.7% exploit rate at $0.89/contract (Sonnet 4 via OpenRouter).

**The honest gap:** on a 95-contract random draw from DeFiHackLabs (no curation), the agent hit 13.7%. That gap is the project's most informative metric — see [README §The numbers](https://github.com/claygeo/solhunt-duel/blob/master/README.md#the-numbers--be-precise) for full context.

## Why the current corpus is incomplete

Three structural problems:

1. **All 32 are confirmed historical exploits.** Selection bias toward "bugs that were findable in some sense." The agent is being graded on a population of solved problems. A real auditor's caseload includes contracts where the answer is "this is fine" — and our corpus has zero of those. We can't measure false-positive rates today.

2. **Six vulnerability classes is too narrow.** The Smart Contract Weakness Classification (SWC) registry has 37 distinct categories. Our corpus covers ~6. Agent strengths/weaknesses across the missing categories are unobserved. This is also a recruiter signal — eval researchers will ask "what's in your held-out class set?" and the honest answer today is "we don't have one."

3. **Distribution doesn't match real audit caseload.** On Code4rena / Sherlock, the lived distribution skews toward business-logic bugs (oracle deviation, liquidation math, emission curves) and away from the OWASP-style classics (reentrancy, overflow, etc.) that dominate DeFiHackLabs. Our corpus is good for "does this agent know reentrancy" — bad for "would this agent be useful on a real audit competition."

## Proposed v2 corpus structure

Target: **52 contracts**, additive (the existing 32 stay in for continuity).

### New 20 contracts breakdown

| Tier | Count | Source | Purpose |
|---|---|---|---|
| **A. SWC-registry coverage** | 8 | SWC registry test cases (synthetic) | Cover 8 new SWC classes the corpus lacks |
| **B. Code4rena historical** | 5 | Code4rena finding archive (verified-source mainnet contracts) | Real auditor-grade business-logic bugs |
| **C. Adversarial-no-find** | 5 | Hand-selected legitimate contracts with no known bug | Measure false-positive rate (agent should report no-find) |
| **D. Hard-difficulty extension** | 2 | Multi-contract chains (Curve / Aave composability) | Expose harness limit; document failure mode |

Net: 32 → 52 contracts, 6 → 14+ vuln classes, 0 → 5 adversarial-clean contracts.

### Tier A — SWC registry coverage (8 contracts)

Pull from SWC registry (https://swcregistry.io/) test cases. Specific SWC classes our corpus is missing:

- SWC-104 (Unchecked call return value) — 1 contract
- SWC-114 (Transaction order dependence / front-running) — 1 contract
- SWC-115 (Authorization through tx.origin) — 1 contract
- SWC-116 (Block values as proxy for time) — 1 contract
- SWC-119 (Shadowing state variables) — 1 contract
- SWC-128 (DoS with block gas limit) — 1 contract
- SWC-132 (Unprotected SELFDESTRUCT) — 1 contract
- SWC-134 (Unprotected Ether withdrawal) — 1 contract

**Sourcing approach:** SWC test cases are intentionally simple synthetic contracts (~50-100 LOC). Keeps the bench tractable; complements the multi-contract DeFiHackLabs cases.

**Risk:** SWC test cases are pedagogical, not adversarial. The agent might hit 90%+ on them and inflate the overall number. Mitigation: report Tier A as a separate sub-score on the leaderboard, not folded into the 67.7% number.

### Tier B — Code4rena historical (5 contracts)

Mine the [Code4rena finding archive](https://code4rena.com/reports) for verified-source mainnet contracts with documented exploits (M+ severity, post-contest payout). Filter by:
- Verified Etherscan source (no decompiled hacks)
- Single-contract attack vector (multi-contract chains go to Tier D)
- Vuln class NOT already over-represented in our corpus
- Mainnet block number known (we need to fork at the bug block)

**Sourcing approach:** start with Code4rena reports from 2024-2025 since contests then are more representative of current solidity idioms. Avoid 2022-era contracts (we have plenty of those from DeFiHackLabs).

**Risk:** some Code4rena bugs are in test contracts or upgradable proxies that don't fork-replay cleanly. Mitigation: each Tier B candidate must pass our sanity-check (run the documented exploit on our fork, confirm the test goes RED before adding to corpus).

### Tier C — Adversarial-no-find (5 contracts)

The most important addition. Hand-select 5 mainnet contracts that are publicly audited, have ≥6 months in production with no exploits, and have non-trivial complexity. Ground truth: "no known bug." Agent should produce a structured no-find report.

**Candidates to evaluate:**
- A simple ERC-20 with standard OZ implementation (e.g., USDC proxy)
- An audited multi-sig wallet (Gnosis Safe singleton)
- An audited ERC-4626 vault (Yearn V3 vault)
- A vetted lending market (Compound v3 USDC market)
- A staking contract with public audit + bug bounty + clean track record

**Why this matters:**
- Today we cannot distinguish "this agent finds bugs" from "this agent confidently fabricates bugs."
- Tier C measures false-positive rate. If the agent declares an exploit on 4/5 of these, we have a serious accuracy problem we'd be embarrassed not to know about.
- Recruiters will specifically ask "what's your false-positive rate" — without Tier C we have no answer.

**Risk:** the contracts ARE in fact exploitable in some way we don't know about, and the agent finds a real 0-day. Mitigation: if the agent reports a finding on a Tier C contract, treat it as a manual-review trigger (operator + /codex pass before publishing). Worst case it's a real find we report responsibly. Best case it's a false positive that calibrates our metric.

### Tier D — Hard-difficulty extension (2 contracts)

Pick 2 historical exploits that REQUIRE multi-contract composability to reproduce (e.g., bZx flash-loan-then-oracle-manipulation, Cream Finance multi-step). These will likely fail on our current sandbox; that's the point — document the failure mode and what would be needed to fix it.

**Why include known failures:**
- Honest signal about harness limits, not just model limits.
- Forces us to document the sandbox's coverage cap (which we should have anyway).
- A "Tier D — none converged, here's why" footnote is more credible than silently omitting the hard cases.

## Implementation phases

### Phase 1 — schema + tooling (no new contracts yet)

- Extend `benchmark/dataset.json` schema to support `tier` (A/B/C/D) and `groundTruth` (`exploit-known` / `no-known-bug`)
- Update reporter to emit per-tier breakdowns alongside aggregate
- Add a "Tier C calibration" subsection on the leaderboard

**Effort:** ~1 day work for an experienced TS engineer. ~1 hour with Claude + gstack.

### Phase 2 — Tier C population (highest priority)

Add 5 Tier C contracts first. They're the most credibility-changing additions and the hardest to fake. Run agent on all 5; document false-positive rate honestly even if embarrassing.

**Effort:** ~2 days for sourcing + sanity-checks. Needs operator's eyes on each Tier C candidate (genuinely no known bug).

### Phase 3 — Tier A + B fill-in

Tier A SWC cases (synthetic) come from existing public test contracts; mostly mechanical work.
Tier B Code4rena historical needs hand-curation; start with 2-3 high-confidence picks before going wider.

**Effort:** ~3-4 days.

### Phase 4 — Tier D documentation

Add the 2 multi-contract bugs. Run them. Document the failure. Publish "Tier D — 0/2 converged, here's why and here's what would be needed."

**Effort:** ~1 day.

### Phase 5 — re-run + publish v2 numbers

Run the full agent loop against the new 52-contract corpus. Publish updated leaderboard with per-tier breakdown. Updated headline numbers (likely lower than 67.7% — that's fine, that's the point).

**Effort:** ~$30-50 in API costs (52 contracts × ~$0.89 average). Wall time ~6-8 hours sequential, less if parallelized.

## What this v2 corpus is NOT

- It is not a substitute for SCONE-bench. Anthropic's 405-contract random draw remains the gold standard for agent capability assessment. Our corpus is curated-with-intent (mixed tiers, mixed difficulty, includes adversarial-clean).
- It is not a substitute for security audit. Agent finding `0` exploits on a contract does NOT mean the contract is safe. The corpus measures agent capability, not contract correctness.
- It is not stable forever. As the agent improves we'll need harder corpora. Plan for v3 in 90+ days post-v2.

## Risks I want /plan-eng-review to challenge

1. **Tier C false-find handling.** If the agent claims to find a 0-day on a Tier C contract, what's our publish/responsible-disclosure flow? I haven't fully spec'd this. Needs adversarial review.

2. **Tier D being too pessimistic.** Maybe the agent CAN do multi-contract chains with the right harness changes. Adding Tier D as "this fails" might lock us into a self-fulfilling prophecy. Counter: easier to remove Tier D if it converges than to add it back if we never tried.

3. **Per-tier reporting could split the headline number into noise.** If we report 5 sub-scores, no single one is screenshot-worthy. Counter: aggregate score still shipping; per-tier is the methodology footnote.

4. **52-contract corpus may still be too small for statistical signal.** Real benchmarks are 200-500. We're constrained by API cost + harness time. Counter: 52 is enough to expose vuln-class blind spots even if individual confidence intervals are wide.

5. **Tier B sourcing overlap with future Code4rena participation.** If operator joins a Code4rena contest in the next 90 days, we shouldn't have its contracts in our corpus (would be conflict). Counter: only use Code4rena contests that are CLOSED + judged + reports public, not ones operator might enter.

## Open questions for operator

1. **Do you want to do this in 90 days or extend?** Phase 1-5 is ~6-9 work days realistic. Doable if it's the only thing happening, harder if balancing with job apps + the Friday cadence.

2. **Tier C false-find disclosure threshold.** If the agent fabricates "I found a bug in USDC" — do we (a) silently note it as a calibration failure, (b) post a transparent "agent had this false positive, here's why," or (c) hold it for 30 days before publishing? My default is (b), but (a) might be saner for the 1-2 weeks post-launch.

3. **Cap on API spend per benchmark run.** $30-50 for v2 is fine, but if v3 / v4 corpus keep doubling, we need a budget. What's the ceiling?

4. **Whose responsibility to write the per-tier copy on the leaderboard?** Could be me + /codex, could be operator-and-Claude in a single sit-down session.

## What this PLAN deliberately defers

- Inspect-AI integration (mentioned in master plan as a "Trojan horse" path) — separate effort, probably AFTER v2 ships
- Multi-model evaluation (Sonnet vs Opus vs Claude 3.5 Haiku vs GPT-4o) — explicitly out of scope; one model per benchmark run
- Real-time / streaming benchmark — out of scope; batch-run model
- Public submission portal where third parties can submit contracts — out of scope until traffic justifies it

## Decision sought from operator + /plan-eng-review + /codex

- [ ] **Approve corpus structure** (52 contracts, 4 tiers, additive to existing 32) → if no, what changes?
- [ ] **Approve Tier C inclusion** (the riskiest call — 5 adversarial-clean contracts where false positives are expected) → if concerned, what's the risk that overrides the credibility benefit?
- [ ] **Approve phase order** (Phase 2 / Tier C first, before Tier A/B) → if no, alternative ordering?
- [ ] **Approve API spend cap of $50 for v2 run** → if no, what's the ceiling?
- [ ] **Sign off on Tier C false-find handling: option (b) — transparent disclosure** → if no, which option?

## Next actions if approved

1. Schedule a /plan-eng-review session with this doc as input.
2. Schedule a /codex outside-voice session focused on Tier C risk + Tier D pessimism.
3. Operator reads + approves.
4. Phase 1 (schema + tooling) starts.
5. Phase 2 (Tier C) begins with operator eyes-on each contract.
