Lesson One. What solhunt does.

This is the foundation. Before we get into vulnerability classes, the duel, the trade-offs, the architecture — you have to be able to explain what solhunt actually is in thirty seconds, cold, without thinking. So we're going to walk through it slowly, repeat the key parts, and use real examples from your own benchmark runs.

Let's start with the one-line pitch.

Solhunt is an autonomous AI agent that finds and exploits vulnerabilities in Ethereum smart contracts. No human in the loop. You point it at a contract, walk away, and come back to either a working exploit or a structured report explaining why nothing was found. That's it. That's the pitch.

Now let's break it down piece by piece, starting with the input.

The input to solhunt is a single Ethereum contract address. That's a forty-two character hex string starting with zero-x — for example, the Beanstalk contract that got hit for one hundred and eighty-two million dollars. You find these addresses however you want. DeFiHackLabs has a repository full of post-mortems for past hacks. Etherscan has lists of verified contracts. People post juicy targets on Twitter. Your employer might hand you one to scan before launch. Solhunt itself doesn't discover targets — it analyzes the ones you point it at.

How do you actually feed the address to solhunt? Through the command line interface. CLI for short. That just means you open a terminal, type something like solhunt scan zero-x-C-eleven-B-and-so-on, hit enter, and the agent kicks off. No web app. No dashboard. No login screen. Just a terminal command.

This is a deliberate choice and it's worth understanding why. CLI is the right interface for three reasons.

First, scriptability. Security researchers don't scan one contract at a time — they scan lists. With a CLI, you can write a one-line shell loop that scans every contract in a file. For example, your own benchmark — running solhunt against ninety-five contracts to measure detection rate — is only possible because solhunt is a CLI. If it were a web app, that benchmark wouldn't exist. You'd be clicking buttons ninety-five times.

Second, trust and locality. A bug bounty hunter scanning a juicy target doesn't want to send that address to someone else's server. That signals what they're investigating, and competitors could see it. Local CLI means the targets stay on the user's machine. Same logic applies to a protocol team scanning their own pre-launch contract — they don't want to leak the deployment address.

Third, it fits the existing security tooling ecosystem. Researchers, auditors, bounty hunters — they all live in terminals. They use forge, anvil, cast, slither, echidna. All command line tools. Solhunt fitting into that ecosystem matters more than being approachable to non-developers.

What does CLI exclude? Non-technical users, obviously. But the bigger exclusion is team workflows. There's no review queue, no shared dashboard, no way for one researcher to flag a contract for another to look at. That's a v2 problem.

Okay. So you've passed an address to solhunt via the command line. What happens next, internally?

Three things kick off in sequence. First, solhunt makes a call to the Etherscan API to fetch the verified Solidity source code for that address. Second, a Docker container spins up — a fresh sandboxed environment with Foundry and a bunch of pre-installed DeFi libraries inside it. Third, the agent loop begins — the LLM starts reasoning about the contract, calling tools, writing exploit attempts, and running them against a forked mainnet inside that Docker container.

Let's pause on the verified versus unverified distinction, because it matters for the benchmark numbers later.

Every contract on Ethereum exists as bytecode — raw EVM hexadecimal that the chain executes. When a developer deploys a contract, they have the option to upload the original Solidity source code to Etherscan. Etherscan recompiles it and confirms the bytecode matches. That contract is now verified. Anyone can read the source.

If a contract is unverified, only the bytecode is public. You can decompile bytecode back into pseudo-Solidity, but it's barely readable, variable names are gone, and the agent does significantly worse on it. So in practice, solhunt skips unverified contracts. It can't do a good job on them. That's a real limitation, and it's part of why your random ninety-five benchmark drops to thirteen percent — a chunk of those targets are unverified or near-unreadable. The curated thirty-two are all verified, which is one reason that benchmark hits sixty-seven point seven percent.

Now the output. This is where solhunt's value proposition lives. There are two possible outputs, depending on whether the agent succeeds or fails.

Success output: a working Foundry exploit test. Concretely, that's a dot-t-dot-sol file containing actual Solidity code. When you run that file with the command forge test, it executes against an anvil mainnet fork — a local copy of the Ethereum chain — and the exploit runs. Funds get drained. An invariant breaks. The contract is provably broken.

Concrete example: Beanstalk. The one hundred and eighty-two million dollar governance flash loan attack. Solhunt produced a runnable forge test that replicated that exploit in one minute and forty-four seconds. Cost: sixty-five cents in API fees. You can run that test yourself, watch funds move on the forked chain, and there's no debate — the exploit works.

Another one. DFX Finance. A seven and a half million dollar reentrancy hack. Solhunt exploited it in four minutes and fifty-two seconds at a cost of three dollars and twenty-five cents.

Now contrast that with a traditional security audit from a firm like Trail of Bits. Those cost ten thousand to one hundred thousand dollars and take weeks. Solhunt, when it works, is roughly ten thousand to fifty thousand times cheaper. That's the economic story.

This is also where the comparison to static analyzers like Slither comes in, and you should internalize this line for interviews. Slither says, quote, possible reentrancy here. Solhunt says, here is the test that drains the contract — run it yourself. Proof beats suspicion. A static analyzer flags patterns that might be vulnerabilities. Solhunt produces working code that proves the vulnerability is real and exploitable. That's the difference between a smoke alarm and a firefighter showing you the burnt remains.

Failure output: a structured JSON report. The agent emits this report between two markers in its output — three equals signs, then SOLHUNT underscore REPORT underscore START, then three more equals signs to mark the start, and the matching END marker at the bottom. Solhunt's loop scans for those markers and parses whatever JSON is between them.

Why markers? Because Claude — the model solhunt usually runs on — responds with structured tool-use blocks and rarely emits free-form text on its own. The markers force the model to declare, this chunk right here is the report.

What's inside that JSON report? Four things. The verdict — no vulnerability found. Which of the eight vulnerability classes the agent considered. What it actually tried — which tools it called, which functions it probed, which exploit attempts it made. And why it gave up — ran out of iterations, hit a dead end on every class, couldn't compile a test, et cetera.

Here's the critical point — why the content of the failure report matters more than just the verdict.

Imagine you hand a client a result that says only, no vulnerability found. That is worthless. The client has no way to know if the agent actually looked at the right things. Maybe it spent thirty iterations hammering reentrancy and never even considered oracle manipulation — and the contract has a sketchy spot-price oracle. That clean verdict would be a lie of omission.

The structured report fixes this. An auditor reads it and sees: agent considered all eight classes, attempted oracle exploit on iteration twelve by trying to skew the Uniswap V2 reserves, couldn't get the flash loan to land in the sandbox, gave up at iteration fifteen. Now the auditor can independently judge — okay, the search was thorough, this is a real clean result. Or alternatively — wait, it gave up because of a sandbox limitation, not because the contract is safe. I should look at oracle manipulation manually.

Concrete example: Inverse Finance. Early version of solhunt reported a critical access control vulnerability on Inverse at a cost of seventy-two cents. False positive. The agent had used a Foundry cheatcode called vm-prank to impersonate the contract owner and call owner-only functions, then declared that as an exploit. But pretending to be the owner isn't an exploit — that's just admin doing admin things. After the fix, solhunt re-ran on Inverse Finance, took fifteen iterations, correctly considered access control and rejected the vm-prank trick, tried the other seven vulnerability classes, found nothing exploitable, and emitted a clean structured report at a cost of one dollar and twenty-four cents. The content of that report is what lets a human say, yes, the agent did its job, this contract really isn't trivially exploitable — instead of just trusting a black box.

Lock this in. The general principle for interviews: a, quote, no vulnerability found, end quote, result without coverage detail is worthless. Solhunt's failure artifact has value because it tells you what was searched, how it was searched, and where the agent gave up. That makes negative results trustworthy.

Let's recap the whole thing in one flow.

You find a verified contract address through DeFiHackLabs, Etherscan, Twitter, or wherever. You pass that address to solhunt via the command line — one terminal command. Solhunt fetches the source from Etherscan, spins up a Docker container with Foundry inside, and starts the agent loop. The agent reads the source, reasons about vulnerability classes, calls tools, writes exploit attempts, and runs them against a forked mainnet. After up to thirty iterations or one hour of wall time, it produces one of two artifacts. Either a runnable Foundry exploit test that proves the contract is broken — like the Beanstalk exploit in one minute forty-four seconds for sixty-five cents. Or a structured JSON report listing what was considered and why nothing was found — like the clean Inverse Finance report at one dollar twenty-four cents. The first artifact is what makes solhunt different from Slither — it produces proof, not suspicion. The second artifact is what makes solhunt's negative results trustworthy — it shows coverage, not just verdict.

Three numbers to memorize. Sixty-seven point seven percent exploit rate on thirty-two curated DeFi hacks. Twenty-eight dollars and sixty-four cents total cost for that benchmark. Ten thousand to fifty thousand times cheaper than a Trail of Bits audit when it works.

That's lesson one. Get this cold. Everything else builds on it.
