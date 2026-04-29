# V2 Tier B — Code4rena Historical Candidate Dossier

> **Status:** RESEARCH ONLY. Operator verification required before any contract enters the v2 corpus. This document is candidate sourcing for [PLAN-V2-BENCHMARK-EXPANSION.md](PLAN-V2-BENCHMARK-EXPANSION.md) Phase 3 (Tier B).
>
> **Purpose:** Identify 5 mainnet-deployed contracts from past Code4rena contests where a Medium-or-higher severity finding was confirmed and is publicly documented. These are real auditor-grade business-logic bugs the agent should be able to find. Distinct from Tier A (synthetic SWC cases) and DeFiHackLabs (cinematic-loss replays) — Tier B is "what a contemporary audit competitor catches."

## Selection criteria

For inclusion as a Tier B candidate, a contract must satisfy:

1. **Code4rena report public:** linked report URL, finding documented with severity + description.
2. **Mainnet deployed:** the contract that contained the bug is on Ethereum mainnet (not testnet, not L2-only).
3. **Verified Etherscan source:** Solidity source on Etherscan at the deployed address.
4. **Single-contract attack vector:** the bug doesn't require pre-loading external pool state from other protocols (those go to Tier D, not Tier B).
5. **Vuln class diversity:** prefer classes our existing corpus is light on. Our corpus is heavy on price-manipulation, access-control, reentrancy. Want oracle-deviation, liquidation math, accounting-error, signature-replay, governance.
6. **Block-pinnable:** historical block number where the bug was reachable is identifiable.

## The 5 candidates

### 1. Maple Finance V1 — Pool collateral check (Medium, 2022)

- **Source:** Code4rena Maple Finance audit, May 2022
- **Report URL:** https://code4rena.com/reports/2022-05-maple
- **Vulnerability class:** liquidation-math / accounting-error
- **Description:** A finding around `collateralRatio` calculation in MaplePool — incorrect rounding when calculating shortfall during liquidation. Allowed undercollateralized positions to remain open.
- **Severity:** Medium-High
- **Why for Tier B:** Class our corpus lacks. Real business-logic, not classic OWASP. Relatively self-contained reasoning.
- **Risk:** Maple V1 was deprecated in favor of V2 — need to confirm V1 contracts still mainnet-readable on the historical block. If V1 contracts are paused, exclude.
- **Operator verification:** confirm a specific deployed address on mainnet, find the exact block where the patched-original divergence occurs.

### 2. Frax — fraxlend governance ratemodel (Medium, 2022)

- **Source:** Code4rena Frax Ether + FRAX audit, 2022-09
- **Report URL:** https://code4rena.com/reports/2022-09-frax (verify exact slug)
- **Vulnerability class:** governance / rate-model arithmetic
- **Description:** Rate model interpolation in Fraxlend had an edge case where extreme utilization could push interest rates into a state that allowed governance to be triggered under unintended conditions.
- **Severity:** Medium
- **Why for Tier B:** Multi-step business logic — agent must trace utilization → rate → governance trigger. Not a one-liner.
- **Risk:** Frax has had multiple iterations; need to confirm THE specific finding maps to a deployed contract address.
- **Operator verification:** find the deployed Fraxlend pair contract that contained this finding's affected logic at the contest block.

### 3. Astaria — auction order finding (High, 2023)

- **Source:** Code4rena Astaria audit, 2023-01
- **Report URL:** https://code4rena.com/reports/2023-01-astaria
- **Vulnerability class:** logic-error / auction-mechanism
- **Description:** Astaria's auction-finalization had a finding where bidder orderings could be manipulated under specific time conditions, allowing a non-highest-bidder to claim collateral.
- **Severity:** High
- **Why for Tier B:** Real auction logic — different surface than DeFiHackLabs replays. Agent must reason about state transitions across blocks.
- **Risk:** Astaria was less-used than top-tier DeFi; mainnet deployment may be small. Verify the contract still exists and has Etherscan source.
- **Operator verification:** confirm mainnet address, confirm exploit reproducible on fork.

### 4. JPEG'd — staking accounting (Medium, 2023)

- **Source:** Code4rena JPEG'd audit, 2023-12
- **Report URL:** https://code4rena.com/reports/2023-12-jpegd (verify slug)
- **Vulnerability class:** accounting-error / staking-rewards
- **Description:** Staking-reward distribution had a finding where reward rate computation could leave dust accumulating in a way that benefited specific stakers disproportionately. Edge-case arithmetic.
- **Severity:** Medium
- **Why for Tier B:** Accounting-edge-case — class our corpus doesn't have. Tests agent on subtle arithmetic, not heroic exploits.
- **Risk:** JPEG'd had stability issues in 2024 (peg de-pegging); confirm the specific contract is still live + verified.
- **Operator verification:** confirm address + reproduce the dust-accumulation pattern on fork.

### 5. Pendle V2 — SY swap routing (Medium, 2024)

- **Source:** Code4rena Pendle V2 audit, 2024-Q1
- **Report URL:** https://code4rena.com/reports/2024-Q1-pendle (verify slug)
- **Vulnerability class:** price-manipulation / routing
- **Description:** Pendle's SY (Standardized Yield) swap routing had a finding around price-impact calculation when going through a specific token pair, allowing slippage outside expected bounds.
- **Severity:** Medium
- **Why for Tier B:** Recent (2024) and Pendle is a contemporary protocol — signals "this benchmark cares about modern attack surface, not just 2022 hacks."
- **Risk:** Pendle is large + active; the specific finding may have been patched in a later deployed version. Need to confirm a historical block where the bug was live.
- **Operator verification:** find specific Pendle deployment (router or specific market) where this finding was reachable.

## Alternates if any of the 5 are unsuitable

- **Index Protocol** (Code4rena 2022) — basket-token arithmetic
- **Olympus V3 / gOHM** — staking math finding from 2023 audit
- **Centrifuge** (Code4rena 2023) — institutional lending, multi-asset accounting
- **Liquity V2** (Code4rena 2024) — TroveManager edge cases (when V2 is mainnet)
- **Morpho Blue** (Code4rena 2024) — though most findings were Low/Info; may not meet Medium threshold
- **Olympus Bonds V2** — bond-discount math
- **Curio Stable Wars** — Curve gauge weight manipulation

## Verification workflow before adding to corpus

For each candidate above, BEFORE running the agent on it:

1. **Read the C4 finding in detail** (report URL → finding-by-finding section)
2. **Confirm specific deployed address** on Etherscan with verified source
3. **Identify the historical block** where the bug was reachable (typically: contest start block, before any patch deploy)
4. **Write a sanity-check exploit** (≤30min) that triggers the bug on a fork at that block — this is YOUR ground truth, separate from Red's attempt
5. **If sanity-check passes:** add to corpus
6. **If sanity-check fails:** the harness can't reproduce this finding (cross-protocol state, MEV, etc.) — substitute from alternates

This is the gate: NO Tier B candidate enters the corpus without operator confirming the bug actually replays on our fork.

## Bias check

The 5 candidates skew toward 2022-2024 contests because Code4rena has gotten more rigorous over time and recent contests have better-documented findings. Older contests (pre-2022) had less standardized reporting; harder to find the specific deployed address for a patched bug. This is intentional — modern Code4rena standards match what a recruiter at an audit shop would look for.

There's a class diversity risk: I'm reaching for accounting/arithmetic/auction/routing classes, which are LESS represented in DeFiHackLabs than reentrancy/access-control. That's by design (Tier B should fill gaps in v1 corpus). But it means Tier B's agent-difficulty profile may differ from v1 — the agent is unproven on this class mix.

## Cost estimate

5 contracts × 3 runs × $0.89 ≈ $13 in API + ~2 hours operator verification time + ~1-2 hours per candidate for sanity-check exploit writing (with Claude+gstack, ~5-8 hours total).

## Decision sought from operator

- [ ] Approve 5 candidates (or substitute from alternates list)
- [ ] Confirm willingness to do verification workflow per-candidate (estimated ~1-2 hours each)
- [ ] Pick: do Tier B candidates 1+5 first as smoke-test, then 2-4 if those work?
- [ ] Approve the bias toward 2022-2024 contests over older

## What this dossier deliberately AVOIDS

- **Bridge / cross-chain bugs** — out of scope for single-contract Tier B
- **Sherlock / Cantina / Cyfrin contests** — Tier B is Code4rena-specific by design (one source = one rubric); other audit platforms could be a future Tier E
- **Findings already exploited in production** — those are DeFiHackLabs Tier (already in v1 corpus)
- **Findings tagged "QA / Gas optimization"** — too low-signal for the benchmark

## Files this dossier supports

- [PLAN-V2-BENCHMARK-EXPANSION.md](PLAN-V2-BENCHMARK-EXPANSION.md) — parent plan, Phase 3 inputs
- [V2-TIER-C-CANDIDATES.md](V2-TIER-C-CANDIDATES.md) — Tier C dossier (sibling)
- [PROOF.md](PROOF.md) — gate verifier
- [leaderboard](https://solhunt-duel.netlify.app/leaderboard/) — where v2 Tier B results will publish
