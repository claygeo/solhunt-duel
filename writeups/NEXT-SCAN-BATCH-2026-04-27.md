# Next Scan Batch — Outside-Voice Strategic Verdict (2026-04-27 evening)

**Question:** "Why don't we just keep scanning till we have a success?"

**Verdict:** Do NOT just sweep more heavily-audited Drips/Twyne contracts. Pivot to **less-audited, recently-listed Immunefi targets** for the next batch. The audit-saturation argument is the single most important signal in your 0/2 FP record so far. Drips has 4 audits + a year of public bounty exposure. Twyne is an Euler EVK fork — anything obvious is in the parent's triage corpus. Continuing to swing at audited mainstays burns Anthropic rate-limit headroom against negative-EV surfaces. Marginal cost is near-zero, but rate-limit budget and your own attention budget are NOT zero. The right move is to redirect, not stop.

---

## Pick: "Tier-N" — Newer / less-audited Ethereum mainnet targets

**Batch name:** `codex-tier-n` (N = newer / not-saturated). Five concrete contracts, all verified on Etherscan, all in solhunt's strong zone (access control + accounting + custom logic, no oracle-manipulation reliance).

| # | Protocol | Contract | Address | Audits | Why fits | Expected outcome |
|---|---|---|---|---|---|---|
| 1 | **Parallel Protocol V3** | Swapper | `0x506Ba37aa8e265bE445913B9c4080852277f3c5a` | 5 (mostly Bail Security + Zenith + Certora) | Live ~10 mo, only listed Oct 2 2025 — much fresher than Drips. Solidity 0.8.28, BSL 1.1, ~1000 LOC, swap + permit + Chainlink oracle. Not deeply battered. Custom collateral system means custom invariants. | Real chance of a logic/accounting bug. Higher-than-Drips signal. |
| 2 | **Parallel Protocol V3** | Getters (Diamond facet) | `0xa9C21Cf291ad935e0C9B05a55A42254fB159181d` | 5 (same set) | Diamond pattern facet; 25 view functions + 1 state-changing (`isWhitelistedForCollateral`). Lower depth than the Swapper but LibOracle/LibGetters/LibManager interactions can hide whitelist-bypass bugs. | Likely shallow surface, run only if Swapper finishes early. Lower priority. |
| 3 | **Inverse Finance FiRM** | CRV Market | `0x63fAd99705a255fE2D500e498dbb3A9aE5AA1Ee8` | Multi-firm (per Inverse docs) | **Standalone Market contract — not a Compound fork. 2-4K LOC, full borrow/lend/liquidate surface. Inverse has past exploit history (Feb 2022 Anchor; Apr 2022 oracle).** Governor-only setters around collateralFactor / liquidationIncentive / oracle wiring. Pure access-control + accounting = solhunt's bullseye. | Highest signal target. Past-exploit-prone team often = unfixed rough edges in adjacent paths. |
| 4 | **Inverse Finance FiRM** | WETH Market | `0x63df5e23db45a2066508318f172ba45b9cd37035` | Multi-firm | Same architecture as #3 but different collateral. If solhunt finds something in CRV Market, replicating across markets confirms whether it's structural or per-market. If clean on CRV, run this anyway — different ERC20 quirks (WETH wrap/unwrap edges) sometimes surface what CRV doesn't. | Cross-validation play. |
| 5 | **Inverse Finance FiRM** | cvxCRV Market | `0x3474ad0e3a9775c9F68B415A7a9880B0CAB9397a` | Multi-firm | Convex-wrapped CRV. Reward-token edge cases (Convex auto-rewards) interact with FiRM accounting. Highest weirdness-of-collateral score in the FiRM family — that's where bugs hide. | Run only if 3 + 4 are clean (avoid drowning in Inverse-only signal). |

**Reserve / fallback (only if 1-5 all clean):**

| # | Protocol | Contract | Address | Why |
|---|---|---|---|---|
| R1 | **Origin Protocol** | OUSD vault (look up via their docs — most likely `0x9c354503C38481a7A7a51629142963F98eCC12D0`) | latest impl varies by harvest cycle | 34 in-scope, $50K min critical, **last updated 17 April 2026** — fresh attention from team. Yield aggregator with multiple strategy adapters = config-edge bug surface. Pull current scope before scanning. |

---

## Concrete script invocation

Save the following to `scripts/scan-codex-tier-n.sh` (cloned from `scan-codex-tier-e.sh`, with the TARGETS array swapped):

```bash
#!/bin/bash
# scan-codex-tier-n.sh
#
# Per outside-voice verdict 2026-04-27 evening (confidence 8/10):
#   Pivot off audit-saturated Drips/Twyne. Hit newer Immunefi listings
#   (Parallel V3, Oct 2025 listing) and a multi-market protocol with
#   past-exploit history (Inverse Finance FiRM). All eth mainnet
#   (no v1.2 multichain needed).
#
# Why this and not more Drips/Twyne: 0/2 FP rate so far is on heavily-
# audited mainstays. Continuing the same pattern is a sunk-cost trap.
# These 5 targets are real solhunt-strong-zone surfaces (access control,
# borrow/lend accounting, custom collateral logic) on protocols with
# fresher attack surfaces.

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"   # 25 min per scan
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-9000}"          # 2.5h hard cap (5 scans + buffer)
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/codex-tier-n-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

# Priority order: highest expected signal first. FiRM CRV Market is the
# bullseye; Parallel Swapper is the freshest surface; FiRM-WETH/cvxCRV
# are cross-validation; Parallel Getters last (low depth).
TARGETS=(
  "FiRM-CRV-Market|0x63fAd99705a255fE2D500e498dbb3A9aE5AA1Ee8"
  "Parallel-V3-Swapper|0x506Ba37aa8e265bE445913B9c4080852277f3c5a"
  "FiRM-WETH-Market|0x63df5e23db45a2066508318f172ba45b9cd37035"
  "FiRM-cvxCRV-Market|0x3474ad0e3a9775c9F68B415A7a9880B0CAB9397a"
  "Parallel-V3-Getters|0xa9C21Cf291ad935e0C9B05a55A42254fB159181d"
)

# IMPORTANT: extend src/safety/in-scope.ts allowlist with these addresses
# OR run with --i-acknowledge-out-of-scope (logs warning, doesn't block).
# Inverse FiRM IS on Immunefi: https://immunefi.com/bug-bounty/inversefinance/
# Parallel V3 IS on Immunefi:  https://immunefi.com/bug-bounty/parallel/

# (rest of meta-runner same as scan-codex-tier-e.sh — copy lines 36-137)
```

One-line invocation pattern (matches existing tier-e):

```bash
ssh -p 2222 root@77.42.83.22 "cd /root/solhunt && tmux new-session -d -s solhunt-tier-n 'bash scripts/scan-codex-tier-n.sh'"
```

---

## Answers to the side questions

### Should we re-run the 32-contract DeFiHackLabs benchmark in parallel?

**Yes — but as a SEPARATE, second-priority track, not in the same Anthropic rate-limit window.** Run it overnight after the Tier-N batch completes. Two reasons:

1. **The 6 hardening lessons are unvalidated against historical signal.** If the new red-prompt now hits 70% strong-zone (up from 67.7%), that's grant-worthy proof of progress for the Arbitrum Trailblazer / Optimism Foundation Missions ask. If it drops to 50%, the new lessons are over-tuned and we need to walk back specific entries before they cause more FPs on live targets.
2. **Cheap to run, high information value.** The benchmark is 32 contracts at ~5 min/scan ≈ 2.5h serial OR ~30 min if parallelized to the existing harness. Marginal cost ~$0.

Don't run benchmark concurrently with Tier-N — it'll compete for the 5h Max rate-limit window and you risk hitting it mid-Inverse-FiRM-CRV-Market scan. Stagger.

### Target type/class to AVOID for the next 2 weeks

Hard avoids based on the 0/2 FP pattern:

1. **EVK-style ERC4626 wrappers that expose `skim()` / permissionless-donation patterns.** This is the Twyne FP shape exactly. The Euler EVK reference design has these as intentional features. Any wrapper of an EVK vault (Re7, Idle, Yearn V3 with EVK adapters, etc.) will produce the same FP signature.
2. **Deeply-audited DeFi mainstays with 4+ audits AND >12 months of public bounty exposure.** Examples to skip: rest of Drips (Caller, RepoDriverAnyApiOperator already in flight, the others are even more audited), Sky/MakerDAO suite, core Lido, core Aave V3, core Curve. The economically rational LLM-find rate on these is statistically zero.
3. **Deprecated implementation contracts behind upgradeable proxies.** This is the RepoDriver FP shape — solhunt scanned `0xfc446db5...` which was a deprecated impl no longer routed through the proxy. Always verify the contract is the current routed impl before scanning. Add a preflight to the scanner.
4. **Pure factory contracts that are stubs (e.g. `clone() + init()` only).** This was the Twyne CollateralVaultFactory + IntermediateVaultFactory shape — solhunt scanned them in 26 turns, came up clean because there's nothing there. Skip in favor of the cloned vault implementations themselves.
5. **Anything with primary attack surface in oracle manipulation, AMM math, or flash-loan composability.** Solhunt's strong zones don't include these — running there is volunteer FP-generation.

### Kill criterion: when do we stop scanning bounty targets?

Three layers of kill criteria, in priority order:

**Layer 1 — Rate-limit kill:** if Anthropic Max 5h-window rate-limit hits twice in any 24h period, stop for 24h. Rate-limit signal = "you're scanning faster than the budget supports, slow down." Don't fight it.

**Layer 2 — Signal-quality kill:** if **0 hits across 15 contiguous scans on Tier-N-class targets (newer/less-audited)**, that's the signal that solhunt's current build can't produce live finds at all — the issue is the agent, not the target selection. At 15-scan-zero, stop scanning bounty targets and pivot to:
   - Re-running the benchmark to identify which capability has regressed
   - The grants stream (Arbitrum Trailblazer is the highest-EV non-find activity)
   - Cold-DM strategy (the 4 small-team protocols flagged as "would respond to DMs": Sturdy V2, D2 Finance, Kresko, Resonate)

**Layer 3 — Hard cap:** **30 lifetime scans on heavily-audited targets without a TP.** You're at 2/6 already. Once you hit 30 (counting old Drips Tier-E + future Drips/Twyne sweeps), the audit-saturation case is statistically proven and the scanner needs an architectural change, not more scans.

We are NOT at any kill criterion yet. Tier-N is exactly the right pivot — we're testing whether the issue is target selection (audit saturation) or capability (red-prompt is over-tuned). After Tier-N + hardened-prompt benchmark validation, we'll have enough signal to know which.

---

## Summary

After Tier-E completes, hit Tier-N. Run the benchmark validation track overnight, separately. Avoid EVK wrappers, deprecated impls, factory stubs, and 4+-audit mainstays for the next 2 weeks. Don't kill the bounty-scan stream until 15 contiguous Tier-N zero-hits OR 30 lifetime audit-mainstay zero-hits. Right now the bigger asymmetry is the Arbitrum Trailblazer grant ($75K, 4-6h of work) — even a clean Tier-N run is grant material for that pitch.

READY: kick off scripts/scan-codex-tier-n.sh after Tier-E completes.
