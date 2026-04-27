# Polygon Community Grants Season 2 — paste-ready application

**Apply at:** https://polygon.questbook.xyz/ → Community Grants Season 2 → Direct Track
**Recommended ask:** $40,000 USD-equivalent in POL
**Target submission date:** Saturday 2026-04-28

---

## Project name

solhunt — autonomous AI smart-contract security agent for Polygon zkEVM + PoS

## One-line description

Open-source AI agent that finds and writes working exploits for smart-contract vulnerabilities, with planned Polygon zkEVM + PoS native support and free continuous-coverage scans for the top 30 dApps deployed on Polygon.

## GitHub URL

https://github.com/claygeo/solhunt-duel

## Project description (~1500 words)

### What is solhunt

solhunt is an autonomous AI agent that finds and exploits vulnerabilities in EVM smart contracts. You give it a contract address. It either (a) writes a runnable Foundry exploit test that proves the contract is broken — drained, hijacked, or ownership-stolen with `forge test` output as the receipt — or (b) emits a structured report explaining the vulnerability classes it considered and why nothing was found. There is no human in the loop. Every claim is backed by `forge test` output, not LLM assertion.

The headline result: solhunt reproduced the **Beanstalk Farms $182M flash-loan governance hack in 1 minute 44 seconds for $0.65 in API costs**. Sixteen iterations, no hint, autonomous identification of an unrestricted Diamond-proxy `delegatecall`.

Across a curated 32-contract DeFiHackLabs subset, solhunt's exploit rate is **67.7% at $0.89/contract average** (Claude Sonnet 4 via OpenRouter). For comparison, Anthropic's published SCONE-bench reported 51.1% on the same class of task. On a *random* 95-contract draw — no curation — exploit rate drops to ~13%. Both numbers are honest; they answer different questions.

### Why this is worth funding (Polygon-specific)

Polygon Community Grants Season 2 explicitly funds **AI / DePIN tooling** — solhunt's "AI agent that produces working exploits" maps directly to that thesis. Polygon's broader narrative ("Aggregation Layer," AI/DePIN focus, zkEVM as the production-grade L2) creates a natural fit for solhunt: a security tool that scales linearly with the number of Polygon dApps without scaling per-protocol audit costs.

Polygon zkEVM and PoS together host hundreds of EVM-Solidity dApps, many of them at the TVL band ($1M–$20M) that can't justify a Trail of Bits engagement. solhunt's $0.89/contract baseline cost lands precisely in that gap. A Polygon-funded sweep makes that cost-tier of security accessible to the long tail of Polygon-deployed dApps.

### What's already shipped

- **The 32-contract benchmark** with full per-contract results.
- **The Beanstalk case study** — iteration-by-iteration writeup at `docs/CASE_STUDY_BEANSTALK.md`.
- **Live-scan path against active bug bounties** (Drips Network allowlist, false-positive forensic postmortem published in `findings/2026-04-27-RepoDriver-FALSE-POSITIVE-ANALYSIS.md`, three concrete prompt updates derived from that failure).
- **Adversarial Red↔Blue duel mode** with run-once SHA-pinned holdout protocol (10 contracts, honest reporting of partial wins and complete losses).

### Polygon-native scope (what this grant funds)

The grant funds a **Polygon-native track** of solhunt — three concrete deliverables, sized to a 12-week scope:

**1. Polygon zkEVM + PoS fork sandbox (~3 weeks).** Both Polygon zkEVM and Polygon PoS are EVM-compatible, so the existing Foundry / Anvil pipeline supports them with minor RPC config. The track adds: (a) Anvil fork support for Polygon zkEVM and Polygon PoS at user-specified historical blocks, (b) chain-specific recon (zkEVM's distinct gas model, PoS's checkpoint root contracts and Heimdall-side state assumptions), (c) a Polygon-aware vulnerability-class taxonomy that flags zkEVM-specific patterns (e.g., circuit-related precompile interactions) as distinct from generic Solidity vulns.

**2. Top-30-Polygon dApp sweep (~4 weeks).** Solhunt scans the top 30 dApps deployed on Polygon by aggregate TVL across zkEVM + PoS, produces per-protocol findings bundles, and publishes a public security-posture report on Polygon's most-deployed contract patterns. Findings queue for protocol-team review BEFORE any public disclosure. Output: public security-posture report with per-class capability bounds.

**3. Continuous monitoring daemon for Polygon dApps (~5 weeks).** A long-running service that tracks a configurable set of Polygon contracts. When a contract upgrades, the daemon triggers a fresh scan automatically. Findings queue to a human-review interface; nothing auto-submits. The daemon is dual-chain aware (zkEVM + PoS in one config). Output: open-source daemon + CLI, deployable on a $20/month VPS.

The deliverables are all open-source MIT. We are NOT building a closed SaaS with this grant. The commercial path (paid scan-as-a-service for protocols at $1500/scan continuous coverage) is funded separately by direct customer revenue, post-grant.

### Why we'll ship

The full v1.0 (red-team scanner) and v1.1 (live-scan operationalization with safety rails, MIT license, CI, false-positive postmortem) are already shipped, public, and on `master`. We are not asking to start work. The agent, harness, persistence layer, safety rails, and `claude -p` Max-subscription path are built and verified. The Polygon track is an additive layer on top of working v1.1.

### How Polygon benefits

- An open-source, AI-augmented continuous-coverage scanner native to Polygon zkEVM + PoS
- A Polygon-specific exploit corpus from the top-30 sweep, published as public security research
- A public security-posture report on Polygon's most-deployed dApps with per-class capability bounds
- A monitoring daemon that any Polygon protocol can self-host
- Multi-ecosystem validation: solhunt is being applied to Arbitrum (Trailblazer) and Optimism (Foundation Missions) in parallel; Polygon's grant adds the third major Aggregation-Layer-relevant ecosystem to a portfolio that the Polygon Foundation can compare across

The multi-ecosystem framing matters for Polygon specifically. Polygon's AggLayer narrative is about cross-rollup interoperability; security tooling that treats all major rollups as a portfolio (rather than per-rollup silos) reinforces that thesis.

### Team

Clayton George — sole developer. Background: Associate Pricing Analyst at Curaleaf with several years of TypeScript / Node / Solidity dev experience. Built solhunt over ~3 months end-to-end. LinkedIn: [link]. Twitter: [link]. Solo project; 12-week focused scope.

### Budget breakdown ($40,000)

- Developer time: $33,600 (12 weeks @ $2,800/wk; lower per-week rate than Trailblazer to fit Polygon's typical grant size)
- Cloud infrastructure: $2,400 (VPS, archive RPC for Polygon zkEVM + PoS, PolygonScan API rates)
- Public-report editorial: $2,400
- Reserve for zkEVM-specific tooling investigation: $1,600

Total: $40,000 USD-equivalent in POL

### Milestones

- **Week 4:** Polygon zkEVM + PoS fork sandbox running, recon module verified on representative contracts
- **Week 8:** Top-30-Polygon dApp sweep complete, public security-posture report draft
- **Week 12:** Continuous monitoring daemon deployed, final report + dataset published

### Outputs

- Polygon-native solhunt fork (zkEVM + PoS Anvil chain config)
- Polygon-specific contract recon module
- Top-30-Polygon exploit corpus
- Public security-posture report
- Continuous monitoring daemon (dual-chain aware)
- Per-class capability-bounds report for Polygon contract patterns

---

## Likely QuestBook form fields

**Track:** Direct Track / AI tooling
**Funding requested:** $40,000 USD-equivalent in POL
**Timeline:** 12 weeks
**Team size:** 1
**Open source:** Yes / MIT
**Multi-ecosystem context:** Parallel applications to Arbitrum Foundation Trailblazer and Optimism Foundation Missions; Polygon adds the third major AggLayer-relevant ecosystem to a coordinated portfolio

---

## Things to fill in BEFORE submitting

- [ ] Wallet address for POL receipt (QuestBook is wallet-sign-in)
- [ ] Connect wallet to QuestBook
- [ ] Your LinkedIn URL
- [ ] Your Twitter handle

## Things to deliberately NOT include

- ❌ Promises about exploit-rate IMPROVEMENTS
- ❌ Cost-of-living / overhead detail
- ❌ Mention of the duel mode taking center stage
