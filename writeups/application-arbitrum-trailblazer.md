# Arbitrum Trailblazer — paste-ready application

**Apply at:** Tally form linked from https://arbitrumfoundation.medium.com/trailblazer-1m-grants-to-power-ai-innovation-on-arbitrum-c6de1200e656

**Recommended ask:** $75,000 USD-equivalent in ARB
**Target submission date:** Saturday 2026-04-28

---

## Project name

solhunt — autonomous AI smart-contract security agent for Arbitrum

## One-line description

Open-source AI agent that finds and writes working exploits for smart-contract vulnerabilities, with a planned Arbitrum-native track and free continuous-coverage scans for the top 50 dApps on Arbitrum.

## GitHub / project URL

https://github.com/claygeo/solhunt-duel

## Live demo

https://solhunt-duel.netlify.app

## Project description (1500 words — main body)

> Note to Clayton: this section is the substantive answer. If the Tally form has a single "describe your project" textarea, paste this whole block. If it has separate fields for "what" / "why" / "how" / "milestones" / "team," split this into the corresponding chunks using the section breaks below.

### What is solhunt

solhunt is an autonomous AI agent that finds and exploits vulnerabilities in EVM smart contracts. You give it a contract address. It either (a) writes a runnable Foundry exploit test that proves the contract is broken — drained, hijacked, or ownership-stolen with `forge test` output as the receipt — or (b) emits a structured report explaining the vulnerability classes it considered and why nothing was found. There is no human in the loop. Every claim is backed by `forge test` output, not LLM assertion.

The headline result: solhunt reproduced the **Beanstalk Farms $182M flash-loan governance hack in 1 minute 44 seconds for $0.65 in API costs**. Given only the contract address and a system prompt, the agent identified the Diamond proxy's unrestricted `delegatecall` in `LibDiamond.initializeDiamondCut`, wrote a 90-line Foundry exploit test, and drained the diamond's instantaneous balance to zero on a forked mainnet at the historical exploit block. Sixteen iterations. No hint that the vulnerability was flash-loan-based or in the Diamond proxy pattern.

Across a curated 32-contract DeFiHackLabs subset, solhunt's exploit rate is **67.7% at $0.89/contract average** (Claude Sonnet 4 via OpenRouter, total run $28.64). For comparison, Anthropic's published SCONE-bench reported 51.1% on the same class of task. On a *random* 95-contract draw — no curation, no class filtering — exploit rate drops to ~13%. We publish both numbers because they answer different questions: 67.7% is "what this agent CAN do on approachable contracts," and 13% is "what it does against arbitrary historical exploits." Neither is the whole story; both are honest.

### Why this is worth funding

Existing smart-contract security tooling splits into two camps that both leave a gap. Static analyzers (Slither, Mythril, Aderyn) emit findings without producing working exploits — useful for pattern hunting but not for proof. Audit firms (Trail of Bits, OpenZeppelin, Spearbit) produce thorough reports but cost $15K–$100K per engagement and run on weeks of human time. Pre-launch DeFi protocols at TVL $1M–$20M can't justify a Trail of Bits engagement and end up either skipping a real audit or running one too late to act on the findings. solhunt's $0.89/contract cost lands precisely in that gap.

Equally important: solhunt's output is *executable*. A static analyzer says "possible reentrancy here" — a probabilistic flag a developer must investigate. solhunt says "here is the test that drains the contract; run it yourself." Proof beats suspicion. That distinction is what makes the output useful to a small dev team that can't afford auditor follow-up.

### What's already shipped (de-risk for the reviewer)

- **The 32-contract benchmark.** Open dataset, full per-contract results in `benchmark/dataset.json`, vulnerability-class breakdown in the README. Reproducible end-to-end with one command.
- **The Beanstalk case study.** Iteration-by-iteration writeup at `docs/CASE_STUDY_BEANSTALK.md` documenting how the agent identified the unrestricted delegatecall and what it got wrong (transferred ETH to `tx.origin` first, fixed in iteration 7).
- **A live-scan path against active bug bounties.** As of last week, solhunt scans against the Drips Network Immunefi-listed allowlist via Claude Max subscription, saves findings bundles to disk for human review, and never auto-submits. The first live scan produced a false positive — the agent claimed an access-control bug that only "passed" because Foundry cheatcodes bypassed a permanent pause flag. We published the full forensic writeup at `findings/2026-04-27-RepoDriver-FALSE-POSITIVE-ANALYSIS.md` and converted three lessons from that failure into prompt updates that any future scan inherits. The agent gets honest about its blind spots in writing, then the prompt gets harder.
- **An adversarial Red↔Blue duel mode.** A second agent (Blue) writes Solidity patches against Red's exploits. A harness verifies the patch under four defensibility gates: exploit neutralized, benign suite preserved, fresh-attacker re-attack neutralized, storage layout unchanged. They iterate until the contract is hardened or budget runs out. The Phase 4 holdout (10 contracts, run-once protocol with SHA-pinned manifest) is in the repo, with honest reporting of partial wins and complete losses.

### Arbitrum-native scope (what this grant funds)

The grant funds an **Arbitrum-native track** of solhunt, parallel to the Ethereum-mainnet baseline. Three concrete deliverables, sized to a 12-week scope:

**1. Arbitrum-fork sandbox + Stylus-WASM extension (~5 weeks).** The current solhunt sandbox forks Ethereum mainnet via Anvil at historical exploit blocks. The Arbitrum-native track adds: (a) Arbitrum One fork support via Anvil's RPC override, (b) handling of Arbitrum-specific opcodes (e.g., the `ArbOS` precompiles), (c) a Stylus-WASM contract recon path. Stylus contracts are the dimension Solidity-only solhunt currently misses, and there's no equivalent of Slither for Stylus yet — this is a real ecosystem gap. The Stylus extension uses `cargo-stylus` for build/test, and treats WASM contracts as a separate vulnerability-class taxonomy from EVM-Solidity.

**2. Top-50-Arbitrum dApp sweep (~4 weeks).** Solhunt scans the top 50 Arbitrum dApps by TVL (per DefiLlama), produces per-protocol findings bundles, and publishes a public security-posture report on Arbitrum's most-deployed contract patterns. Findings are queued for protocol-team review BEFORE any public disclosure — this is the same operational discipline that gates the existing Drips Network sweep. The deliverable is open-source and the report is public, including the per-class capability bounds (where solhunt is strong vs. weak) so the Arbitrum security community can use the data as a baseline for evaluating future tools.

**3. Continuous monitoring daemon for Arbitrum dApps (~3 weeks).** A long-running service that tracks a configurable set of Arbitrum contracts. When a contract upgrades (proxy admin call, new impl deploy, governance vote execution), the daemon triggers a fresh scan automatically. Findings queue to a human-review interface; nothing auto-submits. Output: open-source daemon + CLI, deployable on a $20/month VPS, suitable for protocols, audit firms, and bounty hunters who want a continuous-coverage layer instead of point-in-time scans. The daemon is the artifact that converts "neat tool" into "running production service."

The deliverables are all open-source MIT. The benchmark dataset, scoring harness, daemon code, and grant-funded findings reports are all public. We are NOT building a closed SaaS with this grant. The commercial path (a paid scan-as-a-service for protocols at $1500/scan continuous coverage) is funded separately by direct customer revenue, post-grant.

### Why we'll ship

The full v1.0 (red-team scanner) and v1.1 (live-scan operationalization with safety rails, MIT license, CI, false-positive postmortem) are already shipped, public, and on `master`. We are not asking to start work. We are asking to scale work that already runs end-to-end. The grant accelerates the Arbitrum-native track and the monitoring daemon; the agent itself, the Foundry harness, the persistence layer, the safety rails, and the `claude -p` Max-subscription path are built and verified.

### How Arbitrum benefits

Arbitrum receives:
- An open-source, AI-augmented continuous-coverage scanner native to Arbitrum One + Stylus
- An Arbitrum-specific exploit corpus from the top-50 sweep, published as public security research
- A public security-posture report on Arbitrum's most-deployed dApps, with per-class capability bounds
- A monitoring daemon that any Arbitrum protocol can self-host or that the Foundation can run as a public-good service
- Documentation and tooling that lowers the barrier for OTHER security researchers to evaluate Arbitrum dApps with AI tools — not just solhunt

Concretely: at the $0.89/contract baseline cost, solhunt-as-public-good can scan every newly-deployed Arbitrum dApp at a marginal cost the ecosystem can sustain. The current Arbitrum security tooling (Slither for Solidity, manual review for Stylus) is either pattern-matching or expensive-human; solhunt is the missing executable-proof layer.

### Team

Clayton George — sole developer. Background: Associate Pricing Analyst at Curaleaf (data engineering / pricing analytics) with several years of TypeScript / Node / Solidity dev experience. Built solhunt over ~3 months end-to-end (scaffolding, agent loop, sandbox, persistence, benchmark, duel mode, live-scan operationalization, false-positive postmortem). LinkedIn: [link]. Twitter: [link].

This is a solo project. The grant funds 12 weeks of focused work; the architecture is mature enough that scaling does not require additional headcount.

### Budget breakdown ($75,000)

- Developer time: $60,000 (12 weeks @ $5,000/wk for sole developer)
- Cloud infrastructure: $5,000 (VPS for monitoring daemon, Alchemy archive RPC for Arbitrum, Etherscan API rate, optional OpenRouter or Claude API spend for benchmark expansion runs)
- Stylus tooling investigation + Rust-WASM-specific dependencies: $5,000
- Public-report editorial / open-source-release polish: $5,000

Total: $75,000 USD-equivalent in ARB

### Milestones

- **Week 4:** Arbitrum-fork sandbox running, Anvil + ArbOS precompile handling verified, Stylus-WASM recon path proof-of-concept on one Stylus contract
- **Week 8:** Top-50-Arbitrum dApp sweep complete, public security-posture report draft circulated to Arbitrum Foundation for review
- **Week 12:** Continuous monitoring daemon deployed publicly, full open-source release, final report + dataset published

### Outputs (all open-source, all public)

- Arbitrum-native solhunt fork on master
- Stylus-WASM contract scanning module
- Top-50-Arbitrum exploit corpus (per-protocol findings bundles)
- Public security-posture report on Arbitrum's top-50 dApps
- Continuous monitoring daemon (deployable on commodity VPS)
- Per-class capability-bounds report (where AI agents are strong vs. weak on Arbitrum's contract patterns)

---

## Application form fields (likely Tally questions)

If the Tally form asks for short answers separately, here are pre-baked answers:

**What is the project?**
> An open-source AI agent that finds and writes working Foundry exploit tests for smart-contract vulnerabilities. Headline result: reproduced the $182M Beanstalk hack in 1m44s for $0.65. 67.7% exploit rate on a 32-contract benchmark.

**What does the grant fund?**
> 12 weeks of work to add Arbitrum-native support (fork sandbox + Stylus-WASM scanning), do a top-50-Arbitrum dApp security sweep, and ship a continuous monitoring daemon. All deliverables open-source MIT.

**Why Arbitrum specifically?**
> Existing security tooling is Ethereum-mainnet-first and has no Stylus equivalent of Slither. solhunt's Foundry-based pipeline already supports forking arbitrary EVM-compatible chains; the Stylus extension is a 2-3 week build. Arbitrum receives an AI-augmented continuous-coverage scanner that no other ecosystem currently has.

**Team size:** 1 (solo developer)

**Funding requested:** $75,000 USD-equivalent in ARB

**Timeline:** 12 weeks from grant award

**Open source / license:** Yes / MIT

**Existing traction / deliverables:** Public repo at github.com/claygeo/solhunt-duel (CI green, MIT license, 22+ commits). 32-contract benchmark with full results published. Beanstalk case study at docs/CASE_STUDY_BEANSTALK.md. Live-scan operationalization v1.1 shipped with safety rails. Adversarial Red↔Blue duel mode (Phase 4 holdout: 10 contracts, run-once SHA-pinned protocol).

**How will you measure success?**
> Three concrete benchmarks at week 12:
> 1. Arbitrum-fork sandbox runs scans on at least 30 of the top-50 Arbitrum dApps, with full findings bundles published.
> 2. Stylus-WASM scanning works end-to-end on at least 5 Stylus contracts, producing structured reports.
> 3. Monitoring daemon deployed publicly, observing at least 20 Arbitrum proxy contracts for upgrade events, with per-event scan latency under 10 minutes.

---

## Things to fill in BEFORE submitting

- [ ] Your LinkedIn URL in the Team section
- [ ] Your Twitter handle in the Team section
- [ ] Wallet address for ARB receipt (or skip if Tally accepts post-acceptance wallet)
- [ ] Email contact for Trailblazer follow-up

## Things to deliberately NOT include

- ❌ Cost-of-living / overhead numbers (reviewers don't care; just the deliverable cost)
- ❌ Comparison to specific competitors by name (don't punch down at Slither/Mythril; punch up to "executable proof")
- ❌ Promises about exploit-rate IMPROVEMENTS during the grant period (don't commit to numbers you can't control)
- ❌ Mention of the duel mode taking center stage (the duel is a kicker for v2; the grant is for the core scanner + Arbitrum extension)
