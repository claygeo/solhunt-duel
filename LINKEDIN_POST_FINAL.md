# LinkedIn Post — HONEST Version (corrected numbers)

## Recommended post

I've been building a lot in 2026. A cannabis pricing scraper. A Miami condo risk tool. An AI agent that exploits DeFi smart contracts.

I'm committing to the third one.

Solhunt is an autonomous AI agent that finds and exploits smart contract vulnerabilities. No human in the loop: it forks Ethereum at the exploit block, reads source, writes a Foundry test in Solidity, runs it, iterates on errors, and produces a pass/fail proof.

I ran two benchmarks because the numbers tell different stories:

**Curated set (32 contracts from DeFiHackLabs, Claude Sonnet 4):**
• **67.7% exploit rate (21/31)**
• $28.64 total cost
• Above Anthropic's SCONE-bench (51.1%) on similar workload
• Beanstalk ($182M hack): 1m 44s for $0.65
• DFX Finance ($7.5M reentrancy): 4m 52s for $3.25

**Random sample (95 contracts + Qwen3.5 pre-flight):**
• **~13% exploit rate**
• $24.89 total across both models
• Most failures are sandbox limitations (multi-protocol flash loans, non-standard token storage), not model limitations

What I actually learned building this:

→ **AI agents love to "cheat" with vm.prank(admin)** and claim false-positive exploits. Added explicit guardrails after seeing it first-hand.

→ **Budget projections are 50% off reality.** Shipped a cost circuit breaker that physically cannot overspend.

→ **Smaller models have their niche.** Qwen3.5-35B-A3B handled most access-control exploits at $0.07-$0.15 per contract. Sonnet only needed for complex reentrancy + proxy patterns.

→ **Sandbox tooling matters more than model intelligence.** Both models hit the same ceiling on contracts requiring flash-loan orchestration across protocols. The model isn't the bottleneck - infrastructure is.

Repo: github.com/claygeo/solhunt
Full write-up: [link]

Open to conversations with security firms, DeFi protocols, and ML infrastructure teams. DMs open.

---

## Why this version is better

1. **Honest two-number framing.** Can't be accused of cherry-picking because I name the cherry-picking explicitly.
2. **Still leads with strong numbers.** 67.7% on real DeFi hacks above Anthropic research = legitimate.
3. **"What I learned" section signals depth** - not just claiming a rate.
4. **Target audiences named in CTA.**

## Headline if asked for a single number

Use 67.7% on the curated set. Explain the 13% on random sample if pushed. Don't hide the 13% - mention it unprompted. That builds credibility.

## What visual to attach

**Option A (recommended):** Simple 2-row table:
```
Curated 32 contracts (Sonnet)     67.7% | $28.64 | 1m44s avg
Random 95 contracts (Qwen+Sonnet)  13%  | $24.89 | 5m avg
```
Clean, honest, shows both.

**Option B:** Beanstalk exploit screenshot - visceral "this actually works" moment.

## When to post

Not today. Tomorrow afternoon earliest.

1. Re-read the draft tomorrow morning with fresh eyes
2. Check the links work
3. Read it out loud once
4. Post Tue-Thu 8-10am EST for max engagement

## Risk: someone asks "why is the rate so different?"

Have this ready:
> "The 32-contract set was implicitly cherry-picked for contracts with verified source and single-contract attack vectors. The 95-contract expansion included unverified contracts, multi-protocol flash loan exploits, and non-standard token patterns our sandbox doesn't currently handle. The 67.7% reflects what the agent can do when the problem is approachable. The 13% reflects what happens with arbitrary real-world complexity. Fixing the gap is sandbox work, not model work."

This answer shows you understand your system's limitations. That's more impressive than the number itself.
