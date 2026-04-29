# V2 Tier C — Adversarial-Clean Candidate Dossier

> **Status:** RESEARCH ONLY. Operator + /codex must review and select before any benchmark run. This document is candidate sourcing for [PLAN-V2-BENCHMARK-EXPANSION.md](PLAN-V2-BENCHMARK-EXPANSION.md) Phase 2 (Tier C).
>
> **Purpose:** Identify 10 mainnet contracts that are (a) audited, (b) ≥6 months production with no known exploits, (c) non-trivial complexity, (d) verified Etherscan source. These become the false-positive baseline for the v2 leaderboard. Agent should emit no-find on these. If the agent fabricates findings, we measure and publish.
>
> **Pre-commit reminder:** per /codex review, the disclosure post is written BEFORE these are run. Whatever the FPR ends up being, it ships. Operator must not silently cut Tier C if results are bad.

## Selection criteria

For inclusion as a Tier C candidate, a contract must satisfy:

1. **Audit-pedigreed:** Public audit report from a known firm (Trail of Bits, OpenZeppelin, Spearbit, Code4rena, Cyfrin, Halborn, ConsenSys Diligence, Sherlock, Cantina, or equivalent) accessible by URL.
2. **Production-aged:** Deployed and active on mainnet for ≥6 months without a public exploit.
3. **Non-trivial:** ≥200 LOC of meaningful logic. Pure proxies, simple ERC-20 wrappers, and admin-only contracts are excluded — those are too easy to declare safe.
4. **Verified source:** Solidity source on Etherscan (no decompiled bytecode-only contracts).
5. **Single-contract reasoning:** The agent should be able to evaluate it without needing to fork external state from other protocols. Cross-contract dependencies are out of scope for Tier C.

## The 10 candidates

### Tier C-clean (7 contracts) — pure no-known-bug

#### 1. Gnosis Safe Singleton (v1.4.1)
- **Address:** `0x41675C099F32341bf84BFc5382aF534df5C7461a` (Singleton 1.4.1 on Ethereum)
- **Why:** Most-audited multi-sig in production. Every token / DAO uses it. Public audit by Certora (formal verification) + multiple bug bounties.
- **Audit:** https://github.com/safe-global/safe-smart-account/tree/main/docs/audit (Certora 2024)
- **Source LOC:** ~600 (Singleton + dependencies)
- **Years live:** 1.4.1 since 2024-04 (meets 6mo threshold). 1.x family since 2018.
- **Risk for Tier C:** Low — extensively reviewed by industry. Agent fabricating a finding here = strong false-positive signal.
- **Vuln class to NOT find:** access control, reentrancy, signature replay.

#### 2. Yearn V3 Vault (yvWETH-1)
- **Address:** `0xAc37729B76db6438CE62042AE1270ee574CA7571` (yvWETH-1 V3)
- **Why:** ERC-4626 vault, recent rewrite, multi-firm audit. Yearn V3 launched 2024 with extensive review.
- **Audit:** https://github.com/yearn/yearn-vaults-v3/tree/master/audits (Spearbit + ChainSecurity)
- **Source LOC:** ~800 (vault + manager)
- **Years live:** Since 2024-04.
- **Risk for Tier C:** Low-Medium — Yearn V2 had exploits (V3 rewrite was a response). Strong audit pedigree but not battle-tested as long.
- **Vuln class to NOT find:** share-price manipulation, donation attacks, withdrawal queue, allocator routing.

#### 3. Compound III USDC Market (cUSDCv3)
- **Address:** `0xc3d688B66703497DAA19211EEdff47f25384cdc3`
- **Why:** Compound's V3 (Comet) is a complete rewrite from V2. Audited extensively, no exploits since launch.
- **Audit:** https://docs.compound.finance/security/ (OpenZeppelin + ChainSecurity)
- **Source LOC:** ~1500 (Comet core)
- **Years live:** Since 2022-08.
- **Risk for Tier C:** Low — heavily audited and battle-tested.
- **Vuln class to NOT find:** liquidation math, interest rate manipulation, oracle manipulation, signature.

#### 4. Aave V3 Pool (Ethereum mainnet)
- **Address:** `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`
- **Why:** Aave V3 has the strongest formal verification pedigree in DeFi. Certora + Trail of Bits + multiple firms. No known exploits in the V3 Pool contract.
- **Audit:** https://github.com/aave/aave-v3-core/tree/master/audits
- **Source LOC:** ~2500 (Pool + libraries)
- **Years live:** Since 2022-03.
- **Risk for Tier C:** Low — the gold standard for "clean lending market."
- **Vuln class to NOT find:** EVERY classic DeFi attack vector. If agent finds anything here it's a false positive.

#### 5. Lido stETH Submission (Lido on Ethereum)
- **Address:** `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` (stETH)
- **Why:** ETH staking representation, heavily audited (Quantstamp + Sigma Prime + StateMind), no exploits.
- **Audit:** https://github.com/lidofinance/lido-dao/blob/master/audits/
- **Source LOC:** ~700 (stETH proxy implementation)
- **Years live:** Since 2020-12.
- **Risk for Tier C:** Low — most-staked LST on Ethereum, no incidents.
- **Vuln class to NOT find:** rebase math, reward distribution, admin upgrade.

#### 6. Uniswap V3 NonfungiblePositionManager
- **Address:** `0xC36442b4a4522E871399CD717aBDD847Ab11FE88`
- **Why:** Uniswap V3 is exhaustively audited (ABDK + Trail of Bits). NPM has no exploits since launch.
- **Audit:** https://github.com/Uniswap/v3-core/tree/main/audits
- **Source LOC:** ~600
- **Years live:** Since 2021-05.
- **Risk for Tier C:** Low.
- **Vuln class to NOT find:** Uniswap V3 LP math, mint/burn, fee collection.

#### 7. MakerDAO Vat (MCD core)
- **Address:** `0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B`
- **Why:** Core debt engine of MakerDAO MCD. Heaviest-audited contract in DeFi. Foundational, battle-tested since 2019.
- **Audit:** https://github.com/makerdao/audit-reports
- **Source LOC:** ~400 (small but every line consequential)
- **Years live:** Since 2019-11.
- **Risk for Tier C:** Lowest — if agent finds a bug here, it's certainly a hallucination.
- **Vuln class to NOT find:** any. Vat is the bedrock.

### Tier C near-miss (3 contracts) — patched-during-audit

These contracts had an actual finding caught during audit and patched before deployment. The agent should NOT re-find the patched bug. Different failure mode than pure clean — measures "agent gets confused by patch markers / diff comments / changelog entries in repo."

#### 8. Aave V3 ConfiguratorLogic — post-audit-patch deployment
- **Address:** `0x[REQUIRES VERIFICATION]` — operator should pull current ConfiguratorLogic from Aave V3 Periphery repo
- **Why:** Aave V3 ConfiguratorLogic had a Trail-of-Bits finding (TOB-AAVE-9 or similar) about reserve initialization that was patched before deployment. The deployed version is clean; the bug is in audit reports but not in the bytecode.
- **Audit:** https://github.com/aave/aave-v3-core/blob/master/audits/27-01-2022_TrailOfBits_AaveV3.pdf (find the patched finding)
- **Risk for Tier C:** Medium — agent might read audit report referenced in repo and "re-find" the patched bug. THAT'S the failure mode we're measuring.
- **Operator action:** verify the finding is referenced in repo OSS docs but actually patched in deployed bytecode.

#### 9. OpenZeppelin Governor (specific deployment with patched finding)
- **Address:** `0x[REQUIRES VERIFICATION]` — find a specific Governor deployment where a Code4rena finding was caught + patched. ENS Governor (`0x323A76393544d5ecca80cd6ef2A560C6a395b7E3`) is a candidate.
- **Why:** ENS Governor + DAO contracts had Code4rena audit findings caught and patched. The deployed contracts are clean.
- **Risk for Tier C:** Medium-low — depends on whether audit findings are referenced in surrounding repo documentation.
- **Operator action:** confirm the specific finding is patched in deployed version.

#### 10. Yearn V3 (specific vault with patched audit finding)
- **Address:** `0x[REQUIRES VERIFICATION]` — Yearn V3 had multiple findings caught by Spearbit + ChainSecurity that were patched before V3 launch.
- **Why:** Same near-miss class as #8.
- **Risk for Tier C:** Medium.
- **Operator action:** find a specific V3 vault where a specific patched finding is documented in the audit report.

## Open verification needed before Phase 2 begins

For candidates 1-7 (clean): operator should verify against Etherscan that:
- Source code IS verified (some recent deployments aren't)
- Contract has not been paused / deprecated since I wrote this
- No public exploit between when I wrote this and when v2 runs

For candidates 8-10 (near-miss): operator must:
- Identify the EXACT finding patched in audit (URL + page reference)
- Confirm the deployed bytecode reflects the patch (compile audited source vs deployed)
- Document for the disclosure post: "the agent should NOT find finding X, which was patched per audit Y page Z"

If any candidate fails verification: substitute from the alternates list below.

## Alternates if any of the 10 are unsuitable

- **Curve 3pool** (`0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7`) — audited, simple, ≥4yr live. Not first-pick because it's *too* simple (only ~300 LOC).
- **Frax FRAX_v3 minter** — recent, audited, no exploits.
- **Convex Booster** — heavily used CRV LP rewarder, audited, no exploits.
- **Pendle Router V3** — audited recently, V3 launched 2024.
- **Morpho Blue** — recent (2024), audited (Spearbit + Cantina + others), clean track record. Strong "novel-pattern" candidate.
- **Liquity V2 Trove Manager** — would be a near-miss candidate if V2 is live by run time (had multiple Code4rena rounds with findings patched).

## What this list deliberately AVOIDS

- **L2-only contracts** (Optimism, Arbitrum, Base) — would require multi-chain harness work; Tier C is mainnet-only for v2.
- **Pure ERC-20 / ERC-721 implementations** — too simple, too easy to declare safe, no signal for FPR measurement.
- **Contracts with active bug bounties paying ≥$100K** — if agent ever found something real, we'd want to disclose responsibly which complicates the publish-everything pre-commit. (Aave is on this list despite having a bounty — the V3 Pool is well-trodden enough that fabrication is the dominant risk.)
- **Brand-new deployments (<6 months)** — too little signal that they're actually clean.
- **Recently-deprecated contracts** — Compound V2 is excluded for this reason.

## Bias check

This list skews toward big-name DeFi (Aave, Uniswap, Maker, Compound, Lido, Yearn, Gnosis). That's by design — they're the most-audited contracts and therefore the strongest "if agent hallucinates here, it really did hallucinate" baseline. But it could create a different bias: agent might pattern-match "this is famous, must be safe" without doing real analysis. To control for that, candidate 7 (MakerDAO Vat) is small and looks dense; candidate 1 (Gnosis Safe) is multi-file. The list is not all "obvious-safe" optical signals.

## Decision sought from operator

- [ ] Approve 10 candidates (or substitute from alternates)
- [ ] Confirm willingness to verify candidates 8-10 audit-finding references manually (~1 hour eyeball work)
- [ ] Approve candidate-9 ENS Governor specifically (or substitute from alternates)
- [ ] Approve **publish-whatever-happens** pre-commit for the disclosure post (the gate for Phase 2 to begin)

## Files this dossier supports

- [PLAN-V2-BENCHMARK-EXPANSION.md](PLAN-V2-BENCHMARK-EXPANSION.md) — the parent plan
- [PROOF.md](PROOF.md) — the gate verifier this corpus will exercise
- [leaderboard at solhunt-duel.netlify.app/leaderboard/](https://solhunt-duel.netlify.app/leaderboard/) — where v2 results will publish
