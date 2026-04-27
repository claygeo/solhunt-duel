# solhunt — grant writeup

**Author:** Clayton George
**Repo:** https://github.com/claygeo/solhunt-duel
**Date:** 2026-04-27
**Purpose:** master grant narrative + four ecosystem-specific framings (Arbitrum Trailblazer, Optimism Foundation Missions, Ethereum Foundation ESP, Polygon Community Grants)

The first ~1100 words below are the core writeup. Substitute the relevant ecosystem framing — chosen per the program — into the section labeled `[ECOSYSTEM FRAMING]`. Each ecosystem's framing is in the second half of this file (~100-180 words each). Total per-application length: ~1500 words.

Note on Aave Grants DAO: per Stream 1 research (RESEARCH-2026-04-27.md), Aave Grants DAO has been effectively dormant since the Jan 2024 ABSTAIN-majority renewal vote. The active Aave funding vehicle is direct-to-AIP governance votes. We are not applying to Aave Grants DAO at this time and have substituted Polygon Community Grants Season 2 as the fourth framing. Revisit Aave when (a) AGD reopens or (b) solhunt has caught an Aave-class bug publicly.

---

## Core writeup (use for all four applications)

### What is solhunt

solhunt is an autonomous AI agent that finds and exploits vulnerabilities in EVM smart contracts. You give it a contract address. It either (a) writes a runnable Foundry exploit test that proves the contract is broken — drained, hijacked, or ownership-stolen with `forge test` output as the receipt — or (b) emits a structured report explaining the vulnerability classes it considered and why nothing was found. There is no human in the loop. Every claim is backed by `forge test` output, not LLM assertion.

The headline result: solhunt reproduced the **Beanstalk Farms $182M flash-loan governance hack in 1 minute 44 seconds for $0.65 in API costs**. Given only the contract address and a system prompt, the agent identified the Diamond proxy's unrestricted `delegatecall` in `LibDiamond.initializeDiamondCut`, wrote a 90-line Foundry exploit test, and drained the diamond's instantaneous balance to zero on a forked mainnet at the historical exploit block. Sixteen iterations. No hint that the vulnerability was flash-loan-based or in the Diamond proxy pattern.

Across a curated 32-contract DeFiHackLabs subset, **solhunt's exploit rate is 67.7% at $0.89/contract average** (Claude Sonnet 4 via OpenRouter, total run $28.64). For comparison, Anthropic's published SCONE-bench reported 51.1% on the same class of task. On a *random* 95-contract draw — no curation, no class filtering — exploit rate drops to ~13%. We publish both numbers because they answer different questions: 67.7% is "what this agent CAN do on approachable contracts," and 13% is "what it does against arbitrary historical exploits." Neither is the whole story; both are honest.

### Why this is worth funding

The existing smart-contract security tooling splits into two camps that both leave a gap. Static analyzers (Slither, Mythril, Aderyn) emit findings without producing working exploits — useful for pattern hunting but not for proof. Audit firms (Trail of Bits, OpenZeppelin, Spearbit) produce thorough reports but cost $15K–$100K per engagement and run on weeks of human time. Pre-launch DeFi protocols at TVL $1M–$20M can't justify a Trail of Bits engagement and end up either skipping a real audit or running one too late to act on the findings. solhunt's $0.89/contract cost lands precisely in that gap.

Equally important: solhunt's output is *executable*. A static analyzer says "possible reentrancy here" — a probabilistic flag a developer must investigate. solhunt says "here is the test that drains the contract; run it yourself." Proof beats suspicion. That distinction is what makes the output useful to a small dev team that can't afford auditor follow-up.

### What's already shipped

- **The 32-contract benchmark.** Open dataset, full per-contract results in `benchmark/dataset.json`, vulnerability-class breakdown in the README. Reproducible end-to-end with one `npx tsx` command.
- **The Beanstalk case study.** Iteration-by-iteration writeup at `docs/CASE_STUDY_BEANSTALK.md` documenting how the agent identified the unrestricted delegatecall and what it got wrong (transferred ETH to `tx.origin` first, fixed in iteration 7).
- **A live-scan path against active bug bounties.** As of last week, solhunt scans against the Drips Network Immunefi-listed allowlist via Claude Max subscription (`--via-claude-cli`), saves findings bundles to disk for human review, and never auto-submits. The first live scan produced a false positive — the agent claimed an access-control bug that only "passed" because Foundry cheatcodes bypassed a permanent pause flag. We published the full forensic writeup at `findings/2026-04-27-RepoDriver-FALSE-POSITIVE-ANALYSIS.md` and converted three lessons from that failure into prompt updates that any future scan inherits. The agent gets honest about its blind spots in writing, then the prompt gets harder.
- **An adversarial Red↔Blue duel mode.** A second agent (Blue) writes Solidity patches against Red's exploits. A harness verifies the patch under four defensibility gates: exploit neutralized, benign suite preserved, fresh-attacker re-attack neutralized, storage layout unchanged. They iterate until the contract is hardened or budget runs out. The Phase 4 holdout (10 contracts, run-once protocol with SHA-pinned manifest) is in the repo. Honest result: 1 full hardening (Dexible), 1 incomplete-patch caught by the loop (Floor Protocol), 5 blue-failed-within-budget, 3 red-couldn't-reproduce, 2 infra/timeout. When Blue produced a passing patch, all four gates held every time across n=5 — no false greens in the converged-patch set.

### What this grant funds (12-week scope)

Three things, sized to a $50–75K ask.

**1. Benchmark expansion to 250 contracts (~6 weeks).** The current 32 is a curated DeFiHackLabs subset. The 95-contract random sample exists but isn't fully analyzed per class. Scaling to 250 contracts across all six vulnerability classes — with held-out splits, multi-model comparison (Sonnet 4 / Opus 4 / GPT-4o / Gemini 2.5), and per-class capability bounds published — turns solhunt from "interesting demo" into a benchmark the security community can cite. Output: open dataset, reproducible scoring harness, paper-style report with per-class confusion matrices.

**2. Red↔Blue Phase 2 expansion (~3 weeks).** The Phase 4 holdout exposed real gaps: Blue's budget is too tight (5 of 10 hit `blue_failed`), and the fresh-address methodology degrades for stateful exploits (reentrancy and flash-loan attacks need pre-condition state that doesn't transfer with bytecode cloning). Phase 2 fixes both — longer Blue budgets and a state-migration step that replays pre-exploit transactions into the fresh fork's `setUp`. Probable recovery: 2-3 of the 5 blue_failed cases. Honest result published either way.

**3. Continuous monitoring daemon (~3 weeks).** A long-running service that tracks a configurable set of in-scope bug bounty contracts. When a contract upgrades (proxy admin call, new impl deploy), the daemon triggers a fresh scan automatically. Findings queue to a human-review interface; nothing auto-submits. Output: open-source daemon + CLI, deployable on a $20/month VPS, suitable for protocols, audit firms, and bounty hunters who want a continuous-coverage layer instead of point-in-time scans. This is the artifact that converts "neat tool" into "running production service."

The deliverables are all open-source MIT. The benchmark dataset, scoring harness, daemon code, and grant-funded findings reports are all public. We are NOT building a closed SaaS with this grant. The commercial path (a paid scan-as-a-service for protocols at $1500/scan) is funded separately by direct customer revenue, post-grant.

### Why we'll ship

The full v1.0 (red-team scanner) and v1.1 (live-scan operationalization with safety rails) are already shipped, public, MIT-licensed, with passing CI, a published false-positive postmortem, and an open benchmark. We are not asking to start work. We are asking to scale work that already runs end-to-end. The grant accelerates the dataset expansion and the monitoring daemon; the agent itself, the harness, and the persistence layer are built and on master.

---

## [ECOSYSTEM FRAMING]

### Framing 1 — Arbitrum Trailblazer ($1M AI grants pool)

Apply at: https://arbitrumfoundation.medium.com/trailblazer-1m-grants-to-power-ai-innovation-on-arbitrum-c6de1200e656

**Recommended ask: $75K (top of plausible range for an open-source security tool with a working v1.0).**

Substitute this paragraph into the writeup just before "Why we'll ship":

> **Arbitrum-native scope:** the grant funds a parallel Arbitrum-native track of solhunt — Arbitrum-fork sandbox (replacing the current Ethereum-mainnet Anvil fork), Stylus-WASM contract support (the dimension Solidity-only solhunt currently misses), and a free-scans-for-Arbitrum-dApps offering for the top 50 protocols by TVL on Arbitrum One. The Arbitrum security gap is real: most existing tooling is Ethereum-mainnet-first, and Stylus contracts have no equivalent to Slither yet. solhunt's Foundry-based pipeline already supports forking arbitrary EVM-compatible chains; the Stylus extension is a 2-3 week build. Arbitrum receives: open-source AI-augmented continuous-coverage scanner, Arbitrum-specific exploit corpus from the benchmark expansion, and a public report on Arbitrum's top-50 dApps' security posture.

This framing is the highest-EV grant on our list — Trailblazer was literally created for the "AI agent on Arbitrum" pitch, and our application maps to it cleanly.

### Framing 2 — Optimism Foundation Missions / Audit Grants

Apply at: https://atlas.optimism.io/missions/audit-grants

**Recommended ask: $50K Foundation Mission for "AI-augmented continuous-coverage scanner for OP Stack apps."**

Substitute this paragraph into the writeup:

> **Superchain scope:** the grant funds a Superchain-native track — the monitoring daemon configured for OP Stack rollups (Base, Optimism, Mode, Zora, World Chain), integration with OP Stack's predeploy contracts and L2-specific opcodes, and free continuous-coverage for the top 30 apps deployed on Optimism. Optimism's prior security funding (Hats Finance, Phylax, Cyfrin Aderyn) tells us this is exactly the kind of public-good security infrastructure the Foundation funds. solhunt is open-source MIT, the dataset is public, and the deliverable is a daemon that any OP Stack dApp can self-host or that the Foundation can run as a public-good service for the ecosystem. Output: Superchain-aware solhunt fork, OP-Stack-specific exploit corpus, and a public security-posture report on the top-30 OP-deployed apps.

The fit is good but the per-grant size is smaller. Apply alongside Trailblazer, not as a substitute.

### Framing 3 — Ethereum Foundation ESP

Apply at: https://esp.ethereum.foundation/applicants

**Recommended ask: $50K for 3 months public-good work.**

Substitute this paragraph into the writeup:

> **Public-good scope:** the grant funds the benchmark expansion to 250 contracts and the multi-model evaluation as a *public security-research artifact*. The dataset, scoring harness, and per-class capability bounds become a citable benchmark that the Ethereum security community can use to evaluate other AI tools — not just solhunt. The deliverable is positioned as research infrastructure, not product: a public benchmark with documented methodology, a reproducible eval protocol, and held-out splits that prevent overfitting. Reference baselines included: Anthropic's SCONE-bench (51.1%), Slither's pattern detection rate on the same dataset, Mythril coverage. The Ethereum security ecosystem currently has no standardized public benchmark for AI-driven exploit generation; solhunt-bench fills that gap. The benchmark is dataset-only — no agent-as-a-service, no commercial product implied by the funding.

ESP currently has no open round matching this directly (status as of 2026-04-27: "no active grant rounds"); apply when an Application Layer / Security RFP opens, or via Office Hours to position for the next round.

### Framing 4 — Polygon Community Grants Season 2

Apply at: https://polygon.questbook.xyz/

**Recommended ask: $40K (USD-equivalent in POL) via the Direct Track.**

Substitute this paragraph into the writeup:

> **Polygon zkEVM / PoS scope:** the grant funds a Polygon-native track — solhunt fork that supports Polygon zkEVM and Polygon PoS forks (both EVM-compatible, fits the existing Foundry pipeline with minor RPC config), free continuous-coverage scans for the top 30 dApps on Polygon by TVL, and a public report on the security posture of Polygon's most-deployed contract patterns. Polygon Community Grants explicitly funds AI/DePIN tooling, and solhunt's "AI agent that produces working exploits" maps directly to the program's stated AI focus. Output: Polygon-aware solhunt fork, Polygon-specific exploit corpus from the top-30 sweep, a public report mirroring what we'd produce for Arbitrum and Optimism. This is part of a multi-ecosystem strategy — solhunt's value compounds across chains, since each ecosystem-funded scan adds to the global benchmark.

The Polygon program is rolling and AI-focused; this is the lowest-effort fourth application on the list and pairs cleanly with Arbitrum/Optimism for portfolio-style multi-ecosystem funding.

---

## Submission order (ranked by ROI)

1. **Arbitrum Trailblazer** — apply this week, ~75K ask, highest fit per outside-voice research
2. **Optimism Foundation Missions** — apply within 2 weeks, ~50K ask, Foundation Missions track is open
3. **Polygon Community Grants S2** — apply within 2 weeks, ~40K ask, lowest-effort fourth shot
4. **EF ESP** — wait for matching RFP / book Office Hours; do NOT cold-apply when no round matches

If all four landed, total funding: ~$215K. Realistic expectation: 1-2 land at typical sizes ($50-75K combined), conditional on application quality and ecosystem fit. Even one win funds the 12-week scope.

---

## Do NOT apply to

- **Aave Grants DAO** — dormant since Jan 2024 ABSTAIN-majority renewal vote. Active Aave funding is direct-to-AIP governance, not application-based. Revisit when AGD reopens or solhunt has caught an Aave-class bug publicly.
- **Compound CGP** — rolling, but $5–30K typical and slower than the above. Low priority unless a Compound-specific finding lands.
- **Solidity Foundation** — does not exist as an independent grant program.
- **a16z CSX (Crypto Startup School)** — Spring 2026 cohort closed; next likely opens Aug-Sep 2026, and only worth applying if pivoting to company-mode (7% equity for $500K). Defer until grant track produces a forcing function for the equity choice.
