# Solhunt Topic 1 — Full Q/A Source

This file covers everything from Topic 1: "What solhunt does." Each Q/A pair is a flashcard candidate.
Format: `**Q:** question` / `**A:** answer`. Group headers organize by sub-topic.

---

## The Pitch

**Q:** What is solhunt in one sentence?
**A:** An autonomous AI agent that finds and exploits vulnerabilities in Ethereum smart contracts.

**Q:** Give the 30-second pitch for solhunt.
**A:** Solhunt is an autonomous AI agent that finds and exploits vulnerabilities in Ethereum smart contracts. You give it a contract address. It either produces a runnable Foundry exploit test that proves the contract is broken, or a structured report explaining what it considered and why nothing was found. No human in the loop.

**Q:** Give the 10-second elevator pitch.
**A:** Crypto contracts get hacked for millions. I built an AI agent that finds and exploits those bugs for a few dollars per scan.

**Q:** What is the non-technical "explain to your aunt" version?
**A:** Hackers steal millions from crypto apps by finding bugs in the code. I built an AI that finds those bugs first — about a dollar per scan, a few minutes each. A human expert charges $50,000 and takes weeks.

**Q:** What is the non-negotiable verb pair in any solhunt pitch?
**A:** "Finds and exploits" (or "finds and proves"). Without both verbs, the pitch is indistinguishable from any static scanner.

---

## The Input

**Q:** What is the input to solhunt?
**A:** A single Ethereum contract address.

**Q:** How long is an Ethereum contract address, and what does it start with?
**A:** 42 characters total. Starts with `0x`, followed by 40 hex digits.

**Q:** Is an Ethereum address a hash?
**A:** No. It's an address (technically derived from a hash of the public key). The correct term is "address," not "hash."

**Q:** Where do you source contract addresses to scan?
**A:** DeFiHackLabs (post-mortems of past hacks), Etherscan verified contract lists, Twitter, or whoever hands them to you. Solhunt doesn't discover targets — it analyzes targets you point it at.

**Q:** Can solhunt accept a URL like `https://app.uniswap.org` as input?
**A:** No. It breaks at the Etherscan API call because Etherscan can't interpret a URL. Only contract addresses work.

**Q:** Can solhunt accept a GitHub repo URL?
**A:** No. Solhunt scans deployed contracts on chain, not source repositories. Etherscan can't fetch bytecode from GitHub.

**Q:** Why does `0xDEADBEEF` fail as input even though it's valid hex starting with 0x?
**A:** Wrong length. It's 10 characters (0x + 8 hex chars), not 42. Etherscan would return "contract not found."

**Q:** How is the address passed to solhunt?
**A:** Through the CLI (Command Line Interface). One terminal command, e.g., `solhunt scan 0xC11B...A7F4`.

---

## CLI Choice

**Q:** Why is CLI the right interface for solhunt? (Three reasons.)
**A:** (1) Scriptability — security researchers scan lists, not single contracts; CLI lets you loop over a file of addresses. The 95-contract benchmark only exists because solhunt is a CLI. (2) Trust and locality — bug bounty hunters and protocol teams don't want to leak target addresses to someone else's server. Local CLI keeps targets on your machine. (3) Fits the existing security ecosystem — forge, anvil, cast, slither, echidna are all CLIs; solhunt drops into existing workflows.

**Q:** What does CLI sacrifice vs a web app?
**A:** (1) Non-technical users — a web app is open to anyone with a browser; CLI requires Docker, API keys, terminal knowledge. Cuts addressable market by maybe 80%. (2) Team workflows — no shared dashboard, no review queue, no "Sarah already looked at this contract." Both are intentional v1 tradeoffs.

**Q:** How should you frame CLI tradeoffs in an interview?
**A:** Call them "intentional tradeoffs," not "limitations." Same fact, different framing — sounds like judgment, not a flaw.

---

## Internal Flow

**Q:** What three things happen internally after you hit enter?
**A:** (1) Fetch — Solhunt calls the Etherscan API to fetch the verified Solidity source code for that address. (2) Sandbox — A fresh Docker container spins up, pre-loaded with Foundry and DeFi libraries. (3) Loop — The agent loop begins; the LLM reads the source, reasons, calls tools, runs forge_test against the mainnet fork.

**Q:** What's the mnemonic for the three internal steps?
**A:** Fetch → Sandbox → Loop.

**Q:** Who provides the address vs who returns the source code?
**A:** User provides the address as CLI input. Solhunt sends that address to Etherscan. Etherscan returns the Solidity source code. The agent reads source code that was fetched using the address.

**Q:** What's pre-installed in the Docker container?
**A:** Foundry (forge, anvil, cast) plus DeFi libraries: OpenZeppelin, Uniswap, Aave, Compound, Chainlink.

**Q:** What's the hard cap on the agent loop?
**A:** 30 iterations or 1 hour wall time, whichever hits first.

**Q:** Which of the three internal steps takes the most time?
**A:** The agent loop, by far. Etherscan fetch is sub-second; Docker spin-up is a few seconds (image is pre-built); the loop is minutes to an hour. Beanstalk took 1m44s, DFX took 4m52s — almost entirely loop time.

**Q:** Why is Docker spin-up fast?
**A:** The image is pre-built (`ghcr.io/foundry-rs/foundry:latest`) with all DeFi libraries baked in. No simulation happens at sandbox time — that occurs inside the loop when forge_test runs.

**Q:** Mnemonic for time profile of the three steps?
**A:** Fast fetch, fast spin-up, slow loop.

---

## Verified vs Unverified Contracts

**Q:** What does "verified" mean on Etherscan?
**A:** The contract deployer uploaded the original Solidity source plus compiler version and optimizer settings. Etherscan recompiled it and confirmed the bytecode matches what's actually deployed on-chain at that address. Source ↔ bytecode equivalence, cryptographically tight.

**Q:** What's an unverified contract?
**A:** Only the bytecode is public — no Solidity source available. You can decompile bytecode back into pseudo-Solidity but it's barely readable, variable names are gone.

**Q:** Why does solhunt skip unverified contracts?
**A:** The agent does significantly worse on decompiled pseudo-Solidity. It's a capability problem, not a cost problem. Cost savings are a side benefit.

**Q:** How does the verified/unverified split affect benchmark numbers?
**A:** The 32 curated hacks are all verified — that benchmark hits 67.7%. The 95 random imports include unverified or near-unreadable contracts — detection drops to 13%.

---

## The 4 Agent Tools

**Q:** What four tools does the agent have access to?
**A:** bash, text_editor, read_file, forge_test. Each runs inside the Docker container via `docker exec`.

**Q:** What is `bash` for?
**A:** Shell access inside the container. Swiss army knife. Runs any shell command — `ls`, `cat`, `cast call`, `curl`, custom scripts. Most flexible.

**Q:** What is `text_editor` for?
**A:** Writing and editing files inside the container — primarily the `.t.sol` exploit test files. Cleaner than bash for multi-line edits.

**Q:** What is `read_file` for?
**A:** Reading files back. Cleaner than bash `cat` because of structured I/O, no shell escaping issues with special-character filenames, and line-numbered output.

**Q:** What is `forge_test` for?
**A:** Runs the exploit test against the anvil mainnet fork. The money shot — provides ground truth feedback on whether the exploit actually works.

**Q:** Why do dedicated tools exist alongside bash?
**A:** The LLM is better at using dedicated tools than at constructing bash incantations. Cleaner I/O, no escaping hell, structured output the model can parse.

**Q:** Which of the 4 tools is the only one that produces NEW information about the world?
**A:** forge_test. The other three (bash, text_editor, read_file) shuffle bits inside the container. Only forge_test crosses the boundary into the simulated chain and brings back ground truth from execution.

**Q:** Why is forge_test called the "money shot"?
**A:** It gives the agent real execution results instead of speculation. Without it, the agent writes code in the dark. With it, the agent gets pass/fail ground truth from the fork, sees errors, adjusts, iterates. Remove forge_test and the whole loop collapses into a static analyzer.

**Q:** What's the simplest sentence about why forge_test is critical?
**A:** It turns LLM speculation into verified exploits via the feedback loop.

---

## Mainnet Fork

**Q:** What is a mainnet fork?
**A:** A local copy of the Ethereum blockchain at a specific block height. `anvil` (from Foundry) clones the chain state from an Ethereum RPC — all real contracts, real balances, real liquidity pools — into a local sandbox.

**Q:** Why does the agent need a fork instead of testnet or mainnet directly?
**A:** Real mainnet would cost real money and only let you exploit each bug once. Testnet doesn't have real DeFi state. A fork has real state but no real consequences — drain $182M from Beanstalk, no actual money moves.

---

## The Two Output Artifacts

**Q:** What are solhunt's two possible outputs?
**A:** Success: a runnable Foundry exploit test (`.t.sol` file with Solidity code). Failure: a structured JSON report.

**Q:** What's the success artifact concretely?
**A:** A `.t.sol` file. Run it with `forge test`, it executes against the anvil mainnet fork, funds drain or an invariant breaks. Proof, not a claim.

**Q:** Concrete example of a success artifact and its cost?
**A:** Beanstalk ($182M governance flash loan hack) — exploited in 1m44s for $0.65 in API fees.

**Q:** Another concrete success example?
**A:** DFX Finance ($7.5M reentrancy) — exploited in 4m52s for $3.25.

**Q:** What's the failure artifact and where is it found in the agent's output?
**A:** A structured JSON report, emitted between the markers `===SOLHUNT_REPORT_START===` and `===SOLHUNT_REPORT_END===`. The loop parses the JSON between them.

**Q:** Why are markers used instead of just detecting when the model stops?
**A:** Claude responds with structured `tool_use` blocks and rarely emits free-form text on its own. Markers force the model to declare "this chunk is the report."

**Q:** What's inside the failure report?
**A:** (1) Verdict — "no vulnerability found." (2) Which of the 8 vuln classes were considered. (3) What the agent tried — tools called, functions probed, exploit attempts made. (4) Why it gave up — out of iterations, dead ends, sandbox limitations.

**Q:** Why does the failure report's content matter more than the verdict?
**A:** "No vuln found" alone is worthless — auditors can't tell if the search was thorough. Coverage detail (which classes were checked, what was tried, where the agent stopped) lets a human independently judge whether the negative result is trustworthy or whether they need to investigate manually.

---

## Slither Comparison

**Q:** What is Slither?
**A:** A static analyzer. Reads Solidity source code without running it; pattern-matches against known vulnerability shapes. Free, fast (seconds), open-source.

**Q:** What's the fundamental category difference between Slither and solhunt?
**A:** Slither is a static analyzer (looks at source). Solhunt is a dynamic exploiter (runs code). Static vs dynamic — the same difference as `grep` vs a debugger.

**Q:** What's Slither's output vs solhunt's output?
**A:** Slither: warnings like "possible reentrancy here" — possibilities that need human validation. Solhunt: working exploit code or a structured failure report — proof, not suspicion.

**Q:** What's the metal-detector analogy?
**A:** Slither is a metal detector — sweeps wide, beeps on metal, but the beep could be a coin or a bomb. Solhunt is a bomb squad — point at one spot, excavate carefully, detonate to confirm or rule it out.

**Q:** What's the simplest one-liner contrast?
**A:** Slither looks. Solhunt acts.

**Q:** Are Slither and solhunt competitive or complementary?
**A:** Complementary, not competitive. Use Slither for cheap broad coverage across a whole codebase; use solhunt when you need runnable proof on a specific contract.

**Q:** Killer line for the Slither comparison?
**A:** "Slither says possible reentrancy here. Solhunt says here's the test that drains it — run it yourself. Proof beats suspicion."

---

## Users of Solhunt

**Q:** Who actually uses solhunt? (Three groups.)
**A:** (1) Bug bounty hunters — submit the runnable test to Immunefi or Code4rena to claim payouts ($10K-$1M+). (2) Audit firms — attach the runnable test to client reports as proof. (3) Protocol defenders — run the test, patch the contract, re-run as a regression test.

**Q:** Mnemonic for the three user types?
**A:** Hunter, auditor, defender.

**Q:** Why do bug bounty hunters specifically need a runnable exploit?
**A:** Platforms like Immunefi require a working proof-of-concept to pay out. Without runnable code, no payout — they ignore "I think there might be a vuln."

**Q:** How do audit firms use the success artifact?
**A:** Attach it to their report as proof the vulnerability is real. "Possible reentrancy" is weak; "here's the test that drains $50M, run it" is bulletproof. Speeds up client acceptance.

**Q:** How do protocol defenders use it?
**A:** Run it (passes — exploit works), patch the contract, re-run it (now fails — exploit blocked). The test becomes the acceptance criteria for the patch.

**Q:** What's the deep insight about the success artifact's reusability?
**A:** A single `.t.sol` file serves as bounty submission, audit evidence, and regression test for the patch — three artifacts in one. That's the multiplier on solhunt's output vs a written description.

---

## Trustworthiness / "Is It Hallucinating?"

**Q:** How do you know solhunt's success results aren't hallucinations?
**A:** The success artifact only exists because it already passed forge_test running against the anvil mainnet fork. The agent cannot output a "success" without the exploit actually executing and moving funds. You don't trust solhunt; you re-run the test yourself.

**Q:** What makes hallucination structurally impossible for solhunt success outputs?
**A:** The validation loop IS the feedback mechanism. forge_test must pass on the fork before the agent declares success. If the exploit doesn't work, forge_test fails and the agent has to keep iterating. No pass = no success artifact.

**Q:** Causal chain for trustworthiness?
**A:** Runnable test → passed forge_test on fork → can't be output without real execution → re-runnable yourself.

---

## Benchmark Numbers

**Q:** Solhunt's exploit rate on the curated benchmark?
**A:** 67.7% on 32 curated DeFi hacks. Total cost: $28.64. Model: Claude Sonnet 4.

**Q:** How does 67.7% compare to Anthropic's own SCONE-bench?
**A:** Above SCONE-bench's 51.1%. Solhunt is above the state-of-the-art baseline.

**Q:** Solhunt's exploit rate on random contracts?
**A:** ~13% on 95 random imports from DeFiHackLabs.

**Q:** Why does the random benchmark drop so much?
**A:** Sandbox limitations — can't orchestrate multi-protocol flash loans, can't handle non-standard token storage, and unverified/near-unverified contracts in the random set.

**Q:** Cost comparison vs traditional audits?
**A:** Trail of Bits-style audits cost $10K-$100K and take weeks. Solhunt is roughly 10,000-50,000x cheaper when it works.

---

## The "Is 67% a Failure?" Question

**Q:** If solhunt scans 100 contracts and exploits 67, is that a failure?
**A:** No. Three reasons: (1) Cost math — $0.30/contract vs $10K-$100K for human audit. (2) Above SCONE-bench's 51.1%. (3) The 33 misses still produce structured failure reports that direct human auditor time to the gaps — force multiplier, not failure.

**Q:** Why might solhunt fail on a verified contract?
**A:** Three buckets: (1) Contract is genuinely safe. (2) Sandbox limitations — vuln is real but requires multi-protocol orchestration solhunt can't perform. (3) Agent ran out of iterations.

**Q:** Reframe for interviews — why does 67% sound mediocre but actually isn't?
**A:** "67% of 100 at $30 beats 100% of 5 at $500K every time." In software, 67% sounds bad. In security at $0.30/contract, it's transformative — the alternative is "human auditors who can't process 100 contracts at any reasonable price."

---

## Defending Against the "Just Claude + Bash" Curveball

**Q:** What's the curveball question?
**A:** "Isn't solhunt just Claude with a bash tool and some Docker? What did you actually build?"

**Q:** What's the wrong way to answer?
**A:** Don't list 7 features defensively. Don't restate the pitch. Concede the premise, then tell ONE story well.

**Q:** What's the structure of the right answer?
**A:** (1) Concede the premise: "Sure, the LLM is the engine." (2) Tell ONE concrete story showing what the harness does. (3) Closer: "There are six or seven more like it. The harness is the product."

**Q:** What's the EIP-55 story?
**A:** LLMs emit Ethereum addresses in lowercase hex (training artifact). Forge rejects lowercase addresses with EIP-55 checksum errors. The naive version of solhunt had the agent burning 5-10 iterations per scan fighting checksum errors it didn't understand. Fix: a pass that auto-recomputes the EIP-55 checksum on every address the agent writes into a Solidity file. The LLM never sees the error. Cuts iteration burn on every scan.

**Q:** Causal chain for the EIP-55 story?
**A:** LLM emits lowercase → forge rejects → 5-10 iterations burned → auto-checksum fix makes the error invisible → 6 more fixes like it → harness is the product.

**Q:** What are the other harness elements (besides EIP-55)?
**A:** (1) Pre-scan recon — 13 parallel `cast` queries before the agent starts. (2) Source injected directly into the prompt (up to 30KB), not behind a tool call. (3) Interface-only imports — sidesteps the Solidity 0.6/0.7/0.8 compile version mismatch with forge-std. (4) Smart context trimming — tiered rules (5KB for forge_test output, 2KB for errors, 300 chars for verbose). (5) Marker-based report extraction. (6) vm.prank guardrails to prevent false positives. (7) Cost circuit breaker (`--max-budget` flag).

**Q:** One-liner defense?
**A:** "The LLM is the engine, but the harness is the product."

---

## The vm.prank False Positive Story

**Q:** What is `vm.prank`?
**A:** A Foundry cheatcode that makes the next contract call appear to come from a specified address. Used legitimately in testing (impersonate a whale to test their balance, prank an EOA, prank a governance executor after winning a flash-loan-funded vote).

**Q:** When is `vm.prank` an illegitimate "exploit"?
**A:** When you prank the owner to call owner-only functions. That's not an exploit — that's admin doing admin things.

**Q:** What was the Inverse Finance false positive?
**A:** Early version of solhunt reported a "critical access control vulnerability" on Inverse Finance at $0.72. The agent had used `vm.prank(owner)` to call owner-only functions and declared it as an exploit. False positive.

**Q:** What was the fix?
**A:** Added explicit valid/invalid rules to the system prompt about when impersonation counts as a real exploit vs an illegitimate cheat.

**Q:** What happened on retest?
**A:** Solhunt re-ran on Inverse Finance, took 15 iterations, correctly considered access control and rejected the vm.prank trick, tried the other 7 vulnerability classes, and emitted a clean "not exploitable" structured report at $1.24.

---

## The Data Contamination Pushback

**Q:** Interviewer: "Your 67.7% is cherry-picked — those are known hacks the LLM has probably seen in training. What does the number actually tell me?"
**A:** Concede the premise, then redirect. "Fair challenge — data contamination is real. But memorization gets you to 'I recognize this is a flash loan attack' — not to 'here's working Solidity that compiles, handles EIP-55 checksums, uses interface-only imports, and executes on a forked chain.' That's the harness, not the LLM. The honest counter-data: we ran 95 random imports where detection drops to 13%. I published both numbers — cherry-picking would be dishonest. The 54-point gap tells you where the work is: sandbox capability, not model intelligence."

**Q:** Why does publishing both 67.7% and 13% matter?
**A:** It's the strongest signal of intellectual honesty. A cherry-picker shows only the good number; showing both demonstrates you understand the gap and aren't trying to hide it.

**Q:** What does the 54-point gap (67.7 → 13) actually tell you?
**A:** Where the engineering work is — sandbox capability, not model intelligence. Even Qwen3.5 correctly identifies the DFX reentrancy on iteration 1 but can't orchestrate the flash loan in 19 iterations. Memorization doesn't rescue weak harnesses.

**Q:** Meta-lesson for handling skeptical interviewers?
**A:** Concede what's true, then redirect to what the number actually measures. Never deny a valid critique. Always publish your worst numbers alongside your best.

---

## Numbers to Memorize Cold

**Q:** Total benchmark cost for the 32 curated hacks?
**A:** $28.64.

**Q:** Beanstalk hack size, exploit time, exploit cost?
**A:** $182M hack. Exploited in 1m44s for $0.65.

**Q:** DFX Finance hack size, exploit time, exploit cost?
**A:** $7.5M reentrancy. Exploited in 4m52s for $3.25.

**Q:** Inverse Finance pre-fix cost (false positive)?
**A:** $0.72.

**Q:** Inverse Finance post-fix cost (clean negative)?
**A:** $1.24, 15 iterations.

**Q:** Average per-contract cost (curated benchmark)?
**A:** ~$0.89 per contract.

**Q:** Hard cap on agent iterations per scan?
**A:** 30 iterations or 1 hour wall time, whichever first.

**Q:** Address length?
**A:** 42 characters (0x + 40 hex digits).

**Q:** Solhunt's exploit rate on curated DeFi hacks?
**A:** 67.7% on 32 contracts.

**Q:** Solhunt's exploit rate on random imports?
**A:** ~13% on 95 contracts.

**Q:** SCONE-bench (Anthropic's baseline)?
**A:** 51.1%.

**Q:** Cost ratio vs human audits?
**A:** 10,000-50,000x cheaper when it works.

---

## Names to Lock In

**Q:** Foundry's three tools?
**A:** forge, anvil, cast. (Not cat. Cast.)

**Q:** Solhunt's four agent tools?
**A:** bash, text_editor, read_file, forge_test.

**Q:** DeFi libraries pre-installed in the Docker image?
**A:** OpenZeppelin, Uniswap, Aave, Compound, Chainlink.

**Q:** Docker image solhunt uses?
**A:** ghcr.io/foundry-rs/foundry:latest.

**Q:** Marker strings for the failure report?
**A:** `===SOLHUNT_REPORT_START===` and `===SOLHUNT_REPORT_END===`.

---

## End-of-Session Mental Model Check

**Q:** What is solhunt in one breath?
**A:** Autonomous AI agent. Input: contract address. Output: runnable Foundry exploit test (success) or structured JSON report with coverage detail (failure). No human in the loop.

**Q:** What's the key engineering insight?
**A:** The LLM is the engine, but the harness is the product. Pre-scan recon, EIP-55 auto-checksumming, interface-only imports, context trimming, marker-based extraction, vm.prank guardrails, and the benchmark dataset are what turn "Claude + bash" into something that actually works on real DeFi contracts.

**Q:** What's the moat?
**A:** The dataset (95 contracts with per-model detection rates, cost curves, full conversation logs) plus the harness engineering. Expensive to reproduce.

**Q:** What single line do you want an interviewer walking out remembering?
**A:** "Slither says possible reentrancy here. Solhunt says here's the test that drains it — run it yourself. Proof beats suspicion."
