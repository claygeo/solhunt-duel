# DRAFT: Substack Post #1 — "I built an AI agent that finds 67% of smart contract bugs. Then I picked random contracts and it dropped to 13%."

**Status:** Draft for operator review. Do NOT publish without /codex outside-voice pass + operator final read-through.
**Target Substack:** TBD — operator should set up `solhunt.substack.com` or similar before publishing.
**Est. word count:** ~1500
**Working subhed:** "What I found when I rebuilt the benchmark from scratch and what it taught me about server-side gates."

---

## The post

I spent three weeks building an autonomous AI agent that audits smart contracts for security vulnerabilities. You give it a deployed contract address, it forks the chain, reads the source, writes an exploit, runs it through Foundry, and emits either (a) a passing test that proves the contract is broken or (b) a structured no-find report explaining what it considered.

On a curated benchmark of 32 historical mainnet exploits I'd hand-picked from DeFiHackLabs, the agent hit a 67.7% exploit rate at $0.89 per contract. Beanstalk Farms ($182M flash-loan governance hack) reproduced in 1m44s for 65 cents. I wrote a victory-lap LinkedIn post.

The post did okay. About what you'd expect. I almost moved on.

Then I picked 95 random contracts from DeFiHackLabs — same dataset, no curation, no skipping — and ran the same agent against them. The exploit rate dropped to 13.7%.

13 out of 95. From 67.7% to 13%. Same agent, same prompts, same model, same harness. The only thing that changed was which contracts I aimed it at.

This post is about what's in that 54-point gap, why I'm publishing it instead of burying it, and what it taught me about how AI agent evals should work.

### The moment I realized I was lying to myself

I built the curated 32-contract set the way a researcher builds a benchmark when they want to show their tool works: I picked contracts where the exploit was a single, locally-reasonable code path. Single-contract attack vectors. Verified Solidity source code. Reasonable function names. No cross-contract reentrancy chains spanning four protocols. Nothing requiring price-oracle manipulation across two AMMs and a flash loan.

I didn't tell myself I was cherry-picking. I told myself I was "building an evaluable subset where the harness limitations don't dominate the signal."

Same thing. Different words.

The 67.7% number measures what the agent does on the kind of bugs I selected. It does not measure what the agent does on the bug you actually care about — the next $200M flash-loan exploit nobody's seen before.

The 13.7% random-sample number measures something closer to that. Not perfectly — DeFiHackLabs is itself filtered to historical exploits, so it's biased toward "bugs that were findable in some sense" — but the gap from 67.7% to 13.7% is real and tells you something the curated number can't.

### Why publish the bad number

A reasonable person could ask: why are you posting the 13% number? You could just keep using the 67.7% number, point to it on your resume, and let people draw their own conclusions.

Three reasons.

**One: every researcher in this space is doing the curated thing**, and most of them are not labeling it. Anthropic's recent SCONE-bench paper hit 51.1% on a random-draw eval at scale (405 contracts). My 67.7% on 32 curated contracts is not comparable to their 51.1% on 405 random contracts. If I let the comparison stand without correction, I'm not doing science, I'm doing PR.

**Two: in 12 months, when someone tries to reproduce the 67.7% number on their own random contracts and gets 15%, they will (correctly) conclude I was bullshitting them.** Better to publish the 13.7% myself, plainly, with a clear explanation of what each number measures, than to wait for someone else to publish it less generously.

**Three: the gap is the most interesting result in the project.** It's not a failure to suppress; it's the data point that justifies the next round of work. The question "why does this agent fall off so hard on random contracts?" is the seed of every interesting follow-up question. Burying it would mean burying the question.

### What's in the 54-point gap

I traced every random-draw failure. The collapse modes cluster:

- **Sandbox limitations** (≈40% of failures). Cross-contract chains that need the full DeFi ecosystem state, not just my fork. Exploits requiring specific oracle prices or LP balances I didn't pre-load.
- **Compiler version mismatches** (≈20%). Older contracts compile with Solc 0.4.x or 0.5.x; my Foundry sandbox defaults to 0.8.x. The agent tries, fails on syntax, gives up before figuring out it can swap the compiler.
- **Verification gaps** (≈15%). Source not verified on Etherscan; the agent has bytecode but no source to read. Fundamental.
- **Genuine reasoning limits** (≈25%). Multi-contract reentrancy, complex math invariants, time-dependent state machines. Things where you'd need to trace 8 contracts and 200 state transitions to see the bug. The agent runs out of context budget or wall-clock cap before the trace converges.

The first three are harness problems. They're not "the model can't do this," they're "I didn't build the sandbox to support this." Fixable, but expensive: every fix risks introducing capability the agent hasn't earned, which inflates the metric without inflating the underlying ability.

The fourth is real. Some bugs are beyond the current model's reasoning depth in a one-hour budget. That's not a critique, it's a calibration.

### What this taught me about server-side gates

The reason I split the curated and random numbers in the first place is that I'd already started building Solhunt-Duel — a follow-up project that pits a red agent (writes exploits) against a blue agent (writes patches) on the same contract, with a server-side harness that decides who won.

When I started Duel, I assumed the agent would tell me whether the patch worked. The Red agent would write an exploit; I'd ask Red, "is the Blue patch still exploitable?" Red would say yes or no, and that would be the convergence signal.

Solhunt's curated-vs-random gap killed that plan immediately. If the agent will lie to me about its own success rate (telling me 67.7% when the honest number is 13.7%), it will lie to me about whether the patch held. The "lie" isn't malicious — it's pattern-completion. The agent has been trained to write summaries that sound conclusive, so it generates summaries that sound conclusive whether or not the underlying claim is true.

So Solhunt-Duel has four server-side gates the LLMs cannot see or modify:

- **exploitNeutralized** — the original exploit, replayed against the patched contract, must FAIL via forge test
- **benignPassed** — the contract's normal operations, replayed against the patched contract, must still PASS
- **freshAttackerNeutralized** — the exploit, deployed from a fresh attacker address (not the original), must also FAIL (no address-shaped backdoor in the patch)
- **storageLayoutPreserved** — the patched contract's storage layout must match the original (no slot drift that would brick existing state)

All four must pass for a Duel run to claim "hardened." The agents never see the gate code. They never see the gate output until after they've submitted. The harness writes the verdict, not the LLM.

This is the entire premise: agents will lie about success if you let them. Don't let them.

### Why I'm publishing this on Substack instead of just shipping the next thing

The honest answer: I'm pre-positioning. I want to land at an AI safety / agent evaluation team next, and the artifacts that get attention in those rooms are not glossy demo videos. They're posts like this — somebody who built a thing, found out the metric was lying, and published the correction with the same energy they'd published the hype.

If you work on AI agents and you're thinking about your own evaluation methodology, here's the takeaway I'd offer:

- The number you're tempted to put on your slide is probably the curated number.
- The honest number is the one you'd get by drawing without replacement from the unfiltered population.
- The gap between them is your project's most important result, even when it's painful.
- Your agent will lie about whether it succeeded. Build the verifier outside the agent's view.

If you want to see the agent in action, the leaderboard is at [solhunt-duel.netlify.app/leaderboard](https://solhunt-duel.netlify.app/leaderboard/). Repository at [github.com/claygeo/solhunt-duel](https://github.com/claygeo/solhunt-duel). All numbers in this post are reproducible — the curated benchmark, the random sample, and every Solhunt-Duel run is in the repo with the forge test output.

If you're hiring for AI agent eval / red-team / autonomous-systems work and any of this lands the right way, my email is in my GitHub profile.

---

## Operator pre-publish checklist

- [ ] Read the WHOLE draft, not just the headline. Anything sound off?
- [ ] Verify every claim: 67.7%, 13.7%, $0.89, $0.65, 1m44s — all match repo + leaderboard
- [ ] Verify SCONE-bench framing (51.1% on 405 random) — link to Anthropic's paper for citability
- [ ] /codex outside-voice review: "would a recruiter at Anthropic FRT, Modal, Sourcegraph screenshot this favorably?"
- [ ] Set up `solhunt.substack.com` (or whatever name) — pick a name you can live with for 12 months
- [ ] Consider crossposting summary to LinkedIn (250-word version, link to Substack for full)
- [ ] Schedule for Tuesday 10am ET (Substack peak) — NOT Friday (Friday is for the weekly cadence drops)
- [ ] After publishing: monitor for one week. If a recruiter / engineer at a target company comments, RESPOND HUMAN-WRITTEN within 24 hours

## What this post deliberately does NOT do

- Doesn't claim Solhunt-Duel "outperforms" anything. It does what it does, the numbers are what they are.
- Doesn't pitch Solhunt-Duel as a product or service. It's a research artifact.
- Doesn't bash other tools. The whole industry has the same problem.
- Doesn't end with a CTA other than "email if hiring." No newsletter signup beg, no merch, no Discord.
- Doesn't mention day job employer. Separation of concerns.
