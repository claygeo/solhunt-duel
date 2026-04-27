Topic 1 cheat sheet. Solhunt — what it does.

The pitch.

Solhunt is an autonomous AI agent that finds and exploits vulnerabilities in Ethereum smart contracts. You give it a contract address. It either produces a runnable Foundry exploit test that proves the contract is broken, or a structured report explaining what it considered and why nothing was found. No human in the loop.

The input.

Input is one Ethereum contract address. A forty-two character hex string starting with zero-x. For example, the Beanstalk contract at zero-x-C-eleven-B-one-two-six-eight, and so on. You source addresses from DeFiHackLabs, Etherscan verified lists, Twitter, or whoever hands them to you. Solhunt doesn't find targets — it analyzes targets you point it at. You pass the address to solhunt through the command line interface. One terminal command.

Why CLI is the right interface. Three reasons.

One — scriptability. Security researchers scan lists, not single contracts. With a CLI, you can write a shell loop to scan every contract in a file. Your ninety-five contract benchmark only exists because solhunt is a CLI. A web app couldn't do that.

Two — trust and locality. A bug bounty hunter doesn't want to leak which targets they're investigating to someone else's server. Local CLI means your target list stays on your machine. Same logic for a protocol team scanning their own pre-launch contract.

Three — fits the existing security ecosystem. Forge, anvil, cast, slither, echidna are all command line tools. Solhunt dropping into that ecosystem matters more than being approachable to non-developers.

What CLI excludes — non-technical users and team workflows. No review queue, no shared dashboard. That's a v2 problem.

What happens internally after you hit enter. Three steps.

Step one — fetch. Solhunt calls the Etherscan API to pull the verified Solidity source code for that address.

Step two — sandbox. A fresh Docker container spins up. Pre-loaded with Foundry — that's forge, anvil, and cast — plus DeFi libraries including OpenZeppelin, Uniswap, Aave, Compound, and Chainlink.

Step three — loop. The agent loop begins. The LLM reads the source, reasons about vulnerability classes, calls tools, and runs forge tests against a mainnet fork inside the Docker container. Hard cap of thirty iterations or one hour wall time.

Mnemonic — fetch, sandbox, loop.

Verified versus unverified contracts.

Every contract on Ethereum exists as bytecode — raw EVM hex. When a developer deploys, they can upload the original Solidity source to Etherscan. Etherscan recompiles and confirms the bytecode matches. That contract is now verified. Anyone can read the source.

Unverified contracts only have bytecode public. You can decompile bytecode back into pseudo-Solidity, but it's barely readable, variable names are gone, and the agent does much worse. So solhunt skips unverified contracts. This is part of why the random ninety-five benchmark drops to thirteen percent — a chunk of those targets are unverified. The curated thirty-two are all verified, which is why that benchmark hits sixty-seven point seven percent.

The four tools the agent has.

One — bash. Shell access inside the container. Swiss army knife. Runs any command.

Two — text editor. Dedicated tool for writing and editing files, especially the Solidity exploit test. Cleaner than bash for multi-line edits.

Three — read file. Dedicated tool for reading files. Cleaner than bash cat because of structured input-output, no shell escaping issues, and line numbers.

Four — forge test. Runs the exploit test against the mainnet fork. This is the money shot.

Why forge test is the money shot.

Forge test gives the agent real execution results instead of speculation. The LLM writes an exploit attempt. Forge test runs it. The agent sees whether it compiled, whether the transaction reverted, whether the attacker's balance went up. Those are facts from actual execution, not the agent's guess. The agent adjusts based on real feedback and tries again. Remove forge test and the agent is a novelist — writing code it has no way to validate. That feedback loop on real execution is what makes solhunt autonomous instead of a static analyzer.

The two output artifacts.

Success artifact — a runnable Foundry exploit test. A dot-t-dot-sol file with Solidity code. Run it with forge test, it executes against the anvil mainnet fork, funds drain, exploit proven.

Concrete example. Beanstalk, one hundred and eighty-two million dollar governance flash loan hack. Solhunt produced a working exploit test in one minute forty-four seconds for sixty-five cents in API fees.

Another. DFX Finance, seven and a half million dollar reentrancy. Solhunt exploited it in four minutes fifty-two seconds for three dollars twenty-five cents.

Compare to a Trail of Bits audit — ten thousand to one hundred thousand dollars, weeks of work. Solhunt, when it works, is roughly ten thousand to fifty thousand times cheaper.

Failure artifact — a structured JSON report. Emitted between markers — three equals signs, SOLHUNT underscore REPORT underscore START, three equals signs — and the matching END marker. Solhunt's loop parses the JSON between them. Markers exist because Claude responds with structured tool use blocks and rarely emits free text on its own — the markers force the model to declare, this chunk is the report.

What's in the failure report. The verdict — no vulnerability found. Which of the eight vulnerability classes the agent considered. What it actually tried. Why it gave up.

Why the content matters more than the verdict. A result that just says "no vulnerability found" is worthless. An auditor needs coverage detail — which classes were checked, what was attempted, where the agent hit a dead end. Only then can a human independently judge whether the search was thorough.

Concrete example. Inverse Finance. Pre-fix, the agent reported a false positive critical access control vuln via a Foundry cheatcode called vm dot prank — impersonating the owner to call owner-only functions. That's not an exploit, that's admin doing admin things. Cost seventy-two cents. After adding explicit valid and invalid rules to the system prompt, solhunt re-ran Inverse, correctly considered access control and rejected the vm prank trick, tried the other seven classes, and emitted a clean report at one dollar twenty-four cents.

The Slither comparison line. Memorize this for interviews.

Slither says, quote, possible reentrancy here. Solhunt says, here is the test that drains the contract — run it yourself. Proof beats suspicion. That's the difference between a smoke alarm and a firefighter showing you the burnt remains.

The curveball defense.

Interviewer asks, quote, isn't solhunt just Claude with a bash tool and some Docker? What did you actually build?

Concede the premise, then tell one story. Here's the EIP-55 story as the opener.

Sure, the LLM is the engine. But here's one example of what "just Claude and bash" gets you. LLMs emit Ethereum addresses in lowercase hex — that's how they're trained. Forge rejects lowercase addresses with EIP-55 checksum errors. So the naive version of solhunt had the agent burning five to ten iterations per scan fighting checksum errors it didn't understand. I added a pass that auto-recomputes the EIP-55 checksum on every address the agent writes into a Solidity file, silently. The LLM never even sees the error. That one fix cut iteration burn on every scan. There are six or seven more like it — context trimming, interface-only imports for the Solidity version mismatch, vm prank guardrails for false positives. The LLM is the engine, but the harness is the product.

The causal chain — memorize this shape, re-inflate on the fly.

LLM emits lowercase hex — forge rejects — five to ten iterations burned — auto-checksum fix makes the error invisible — six more fixes like it — harness is the product.

Numbers to know cold.

Sixty-seven point seven percent exploit rate on thirty-two curated DeFi hacks. Twenty-eight dollars sixty-four cents total benchmark cost. Thirteen percent on ninety-five random imports. Beanstalk in one minute forty-four seconds for sixty-five cents. DFX in four minutes fifty-two seconds for three dollars twenty-five cents. Audit firms charge ten thousand to one hundred thousand dollars. Solhunt is ten thousand to fifty thousand times cheaper when it works.

End of topic one. Next session — topic two, the economic story, why this matters.
