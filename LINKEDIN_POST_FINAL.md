# LinkedIn Post — HONEST Version (corrected numbers)

## Recommended post

I built an autonomous AI agent that finds and exploits DeFi smart contract vulnerabilities. No human in the loop.

Solhunt takes a contract address, forks Ethereum at the exploit block, reads the Solidity source, writes a Foundry exploit test, runs it, iterates on errors, and produces a pass/fail proof.

I ran two benchmarks. The numbers tell different stories:

**Curated set (32 real DeFi hacks, Claude Sonnet 4):**
• 67.7% exploit rate (21/31)
• $28.64 total
• Above Anthropic's SCONE-bench (51.1%) on similar workload
• Beanstalk ($182M hack): 1m 44s for $0.65
• DFX Finance ($7.5M reentrancy): 4m 52s for $3.25

**Random sample (Qwen3.5 + Sonnet, multi-model):**
• ~13% exploit rate
• $17.06 total (Qwen $7.76, Sonnet $9.30)
• Most failures are sandbox limitations, not model limitations

Why the huge gap? The curated set was implicitly cherry-picked for contracts with verified source and single-contract attack vectors. The random sample included unverified contracts, multi-protocol flash loan exploits, and non-standard token patterns the sandbox doesn't yet handle. The 67.7% is "what it can do when the problem is approachable." The 13% is "what happens with arbitrary real-world complexity."

What I learned building this:

→ AI agents love to cheat with vm.prank(admin) and claim false-positive exploits. The agent literally wrote "I pranked as admin, access control vulnerability found." No. That's the admin doing admin things. Added guardrails after catching this with strict test_passed validation.

→ Budget projections are 50% off reality. Projected $0.89/contract, actual was $1.34. Shipped a cost circuit breaker that physically cannot overspend.

→ Smaller models have specific niches. Qwen3.5-35B-A3B handled most access-control exploits at $0.07-$0.15 each. Sonnet was only needed for complex reentrancy and proxy patterns.

→ Sandbox tooling matters more than model intelligence. Both models hit the same ceiling on contracts requiring flash-loan orchestration across protocols. The model isn't the bottleneck. Infrastructure is.

Repo: github.com/claygeo/solhunt

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
