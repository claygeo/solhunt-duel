# Optimism Foundation Mission — paste-ready application

**Apply at:** https://app.opgrants.io/ → Foundation Missions → Audit Grants
**Direct link:** https://atlas.optimism.io/missions/audit-grants
**Recommended ask:** $50,000 USD-equivalent in OP
**Target submission date:** Saturday 2026-04-28 (afternoon)

---

## Project name

solhunt — autonomous AI security scanner for the Superchain

## One-line description

Open-source AI agent that finds and writes working exploits for smart-contract vulnerabilities, with a planned Superchain-native track and free continuous-coverage scans for the top 30 dApps deployed on Optimism + the broader Superchain.

## Project URL

https://github.com/claygeo/solhunt-duel

## Project description (~1500 words)

> Note: same core narrative as the Trailblazer application, with the Superchain-specific framing in the "What this grant funds" section. If the application form has separate fields, split using the section breaks.

### What is solhunt

solhunt is an autonomous AI agent that finds and exploits vulnerabilities in EVM smart contracts. You give it a contract address. It either (a) writes a runnable Foundry exploit test that proves the contract is broken — drained, hijacked, or ownership-stolen with `forge test` output as the receipt — or (b) emits a structured report explaining the vulnerability classes it considered and why nothing was found. There is no human in the loop. Every claim is backed by `forge test` output, not LLM assertion.

The headline result: solhunt reproduced the **Beanstalk Farms $182M flash-loan governance hack in 1 minute 44 seconds for $0.65 in API costs**. Given only the contract address and a system prompt, the agent identified the Diamond proxy's unrestricted `delegatecall` in `LibDiamond.initializeDiamondCut`, wrote a 90-line Foundry exploit test, and drained the diamond's instantaneous balance to zero on a forked mainnet at the historical exploit block.

Across a curated 32-contract DeFiHackLabs subset, solhunt's exploit rate is **67.7% at $0.89/contract average** (Claude Sonnet 4 via OpenRouter). For comparison, Anthropic's published SCONE-bench reported 51.1% on the same class of task. On a *random* 95-contract draw — no curation — exploit rate drops to ~13%. Both numbers are honest; they answer different questions.

### Why this is worth funding (from Optimism's perspective)

Optimism's prior security funding signals a clear pattern: **Hats Finance, Phylax, Cyfrin Aderyn, and similar public-good security infrastructure projects** have all received OP funding. solhunt fits that thesis. It is open-source, it produces public artifacts (benchmark dataset, per-class capability bounds, exploit corpus), and it lowers the security-tooling barrier for OP Stack apps that can't justify a Trail of Bits engagement.

The Superchain has a distinctive security gap: most existing AI security tools are Ethereum-mainnet-first. OP Stack apps deploy on Base, Optimism, Mode, Zora, World Chain, and increasingly other Superchain rollups, but the audit and continuous-scanning ecosystem hasn't kept pace with the deploy diversity. A protocol launching on Base today gets the same audit option as a protocol launching on Ethereum mainnet in 2022. solhunt's Superchain-native track closes that gap.

### What's already shipped (de-risk for the reviewer)

- **The 32-contract benchmark.** Open dataset, full per-contract results in `benchmark/dataset.json`, vulnerability-class breakdown in the README. Reproducible end-to-end with one command.
- **The Beanstalk case study.** Iteration-by-iteration writeup at `docs/CASE_STUDY_BEANSTALK.md`.
- **Live-scan path against active bug bounties.** As of last week, solhunt scans against the Drips Network Immunefi-listed allowlist via Claude Max subscription, saves findings bundles to disk for human review, and never auto-submits. The first live scan produced a false positive — the agent claimed an access-control bug that only "passed" because Foundry cheatcodes bypassed a permanent pause flag. We published the full forensic writeup at `findings/2026-04-27-RepoDriver-FALSE-POSITIVE-ANALYSIS.md` and converted three lessons from that failure into prompt updates that any future scan inherits.
- **An adversarial Red↔Blue duel mode.** A second agent writes Solidity patches against Red's exploits. A harness verifies the patch under four defensibility gates. The Phase 4 holdout (10 contracts, run-once SHA-pinned manifest) is in the repo.

### Superchain-native scope (what this grant funds)

The grant funds a **Superchain-native track** of solhunt — three concrete deliverables, sized to a 12-week scope:

**1. OP Stack fork sandbox + Superchain RPC awareness (~4 weeks).** Solhunt's current sandbox forks Ethereum mainnet via Anvil. The Superchain track adds: (a) Anvil fork support for Optimism, Base, Mode, Zora, World Chain, with chain-specific RPC awareness and gas-pricing assumptions, (b) handling of OP Stack predeploy contracts (e.g., the L2-specific `L1Block`, `L2StandardBridge` opcodes that solhunt's recon must understand), (c) a Superchain-aware vulnerability-class taxonomy that flags cross-chain bridging, native-token gas-handling, and L1-fault-proof-window-related issues as distinct from generic Solidity vulns.

**2. Top-30-Superchain dApp sweep (~4 weeks).** Solhunt scans the top 30 dApps deployed on the Superchain by aggregate TVL, weighted across Optimism + Base + Mode + Zora + World Chain. Per-protocol findings bundles are queued for protocol-team review BEFORE any public disclosure — the same operational discipline that gates the existing Drips Network sweep. Output: public security-posture report on the most-deployed Superchain contract patterns, including per-class capability bounds (where solhunt is strong vs. weak) so the OP security community has a citable baseline.

**3. Continuous monitoring daemon for Superchain dApps (~4 weeks).** A long-running service that tracks a configurable set of Superchain contracts. When a contract upgrades (proxy admin call, new impl deploy, governance vote execution), the daemon triggers a fresh scan automatically. Findings queue to a human-review interface; nothing auto-submits. The daemon is multi-rollup-aware: a contract redeploying on a different Superchain rollup is detected and re-scanned. Output: open-source daemon + CLI, deployable on a $20/month VPS, suitable for OP Stack protocols, audit firms, and bounty hunters.

The deliverables are all open-source MIT. We are NOT building a closed SaaS with this grant. The commercial path (paid scan-as-a-service for protocols at $1500/scan continuous coverage) is funded separately by direct customer revenue, post-grant.

### Why we'll ship

The full v1.0 (red-team scanner) and v1.1 (live-scan operationalization with safety rails, MIT license, CI, false-positive postmortem) are already shipped, public, and on `master`. We are not asking to start work. We are asking to scale work that already runs end-to-end. The agent itself, the Foundry harness, the persistence layer, the safety rails, and the `claude -p` Max-subscription path are all built and verified. The Superchain track is an additive layer on top of a working v1.1 — not a green-field rebuild.

### How Optimism / the Superchain benefits

- An open-source, AI-augmented continuous-coverage scanner native to all current and future OP Stack rollups
- A Superchain-specific exploit corpus from the top-30 sweep, published as public security research
- A public security-posture report on the Superchain's most-deployed dApps with per-class capability bounds
- A monitoring daemon that any Superchain protocol can self-host or that the Foundation can run as a public-good service
- Documentation that lowers the barrier for OTHER security researchers to evaluate Superchain dApps with AI tools

Concretely: at the $0.89/contract baseline cost, solhunt-as-public-good can scan every newly-deployed Superchain dApp at marginal cost the ecosystem can sustain. As the Superchain grows to N rollups, the per-rollup security tooling cost is currently linear (N audit firms, N audit reports per protocol launch). solhunt's per-rollup cost is sub-linear — the same scanner runs across all rollups with chain-specific RPC config. That's a structural ecosystem advantage.

### Team

Clayton George — sole developer. Background: Associate Pricing Analyst at Curaleaf with several years of TypeScript / Node / Solidity dev experience. Built solhunt over ~3 months end-to-end. LinkedIn: [link]. Twitter: [link]. This is a solo project; the grant funds 12 weeks of focused work; the architecture is mature enough that scaling does not require additional headcount.

### Budget breakdown ($50,000)

- Developer time: $42,000 (12 weeks @ $3,500/wk)
- Cloud infrastructure: $3,000 (VPS for monitoring daemon, archive RPCs for Optimism + Base + Mode + Zora + World Chain, Etherscan-equivalent block-explorer API rates per chain)
- Public-report editorial / open-source-release polish: $3,000
- Reserve for OP Stack tooling investigation (predeploy ABI fetching, fault-proof-window analysis tooling): $2,000

Total: $50,000 USD-equivalent in OP

### Milestones

- **Week 4:** OP Stack fork sandbox running on Optimism + Base + Mode, predeploy-contract recon verified
- **Week 8:** Top-30-Superchain dApp sweep complete, public security-posture report draft circulated to OP Foundation for review
- **Week 12:** Continuous monitoring daemon deployed publicly, full open-source release, final report + dataset published

### Outputs (all open-source MIT, all public)

- Superchain-native solhunt fork on master, with Anvil chain-config support for all current OP Stack rollups
- OP Stack predeploy + Superchain-specific contract recon module
- Top-30-Superchain exploit corpus (per-protocol findings bundles)
- Public security-posture report on Superchain's top-30 dApps
- Continuous monitoring daemon (multi-rollup aware)
- Per-class capability-bounds report

---

## Likely application form fields

**Project name:** solhunt
**Mission:** Audit Grants
**Funding requested:** $50,000 USD-equivalent in OP
**Timeline:** 12 weeks from grant award
**Team size:** 1
**Open source:** Yes / MIT
**Public goods alignment:** Open-source security infrastructure; deliverables include public benchmarks and reports usable by the entire OP security community, not just the project itself.

---

## Things to fill in BEFORE submitting

- [ ] Your LinkedIn URL
- [ ] Your Twitter handle
- [ ] Your wallet address for OP receipt
- [ ] Connect wallet to Atlas if Atlas requires sign-in

## Things to deliberately NOT include

- ❌ Promises about exploit-rate IMPROVEMENTS during the grant period
- ❌ Comparison to specific competitors by name
- ❌ Mention of the duel mode taking center stage
- ❌ Cost-of-living / overhead detail
