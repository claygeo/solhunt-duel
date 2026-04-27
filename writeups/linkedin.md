# LinkedIn post

## The post

**Two AI agents dueling on real DeFi contracts — what I built for the Claude hackathon.**

DeFi has lost roughly $3B to smart-contract exploits in the last three years. Auditors find problems but don't always fix them. Auto-patch tools fix problems without understanding the attack. I wanted to see what happens when you run both as adversarial agents.

**solhunt-duel** pairs a red team (finds and writes working exploits) with a blue team (reads the exploit, writes a Solidity patch, proves the patch works). They iterate — red finds, blue patches, red re-attacks the patched bytecode — until the contract is hardened, or blue gives up, or the budget runs out.

Both agents run on Claude Opus 4.7 via `claude -p` subprocess.

**The centerpiece run was on Dexible**, a real 2023 access-control hack worth ~$2M. We clone the actual mainnet vulnerable bytecode to a fresh Anvil fork address, so the bytecode is authentic but the address isn't famous. Red's first exploit attempt failed against the fresh deploy because the proxy's storage was zero'd. Then Red did something I didn't expect: it read the storage state directly, found that `adminMultiSig == address(0)` and `timelockSeconds == 0`, realized the `onlyAdmin` modifier was collapsing to `0 == msg.sender`, and chained `proposeUpgrade → warp → upgradeLogic → delegatecall` to take over the proxy.

That pivot — adapting the attack to the actual on-chain state rather than replaying a known script — is the difference between a prompt-engineered demo and an agentic system.

**I ran it on 10 DeFi contracts with a run-once protocol** (SHA-pinned manifest committed before running, no retries). Honest results:

- 1 fully hardened (Dexible — red finds, blue patches, red comes back empty)
- 1 `same_class_escaped` (Floor Protocol — blue patched, red re-found the same vuln class in round 2, catching an incomplete patch the gates themselves missed)
- 5 blue-failed (red found real exploits, blue couldn't converge on a working patch within budget)
- 3 Red-gave-up "hardened" (honest flag: red never produced a working exploit; these aren't real wins)

Across all runs, when blue did produce a passing patch, **100% of the four defensibility gates held**: exploit neutralized, benign suite preserved, re-attack from a fresh attacker address still neutralized, storage layout unchanged. Zero false greens.

**What I learned the hard way:**
- Anthropic's Usage Policy filter pattern-matches on famous mainnet addresses. Fresh-address bytecode cloning sidesteps this without losing authenticity.
- Foundry caches RPC bytecode per (chain, block). That shadows `anvil_setCode` in certain verify paths — blue team agents can actually diagnose this class of harness limitation themselves.
- Blue's budget (3 rounds) is insufficient for 5 out of 10 real contracts. That's a system limit, not a methodology failure.

**What this isn't:** a production auditor. What it is: a reproducible research harness for measuring how far current LLMs can go in an adversarial security loop, with honest failure modes and a complete audit trail.

Code + full results + demo: [repo link]

Built as a Claude hackathon submission. If you work in smart-contract security, agentic AI, or DeFi infrastructure and want to poke at the harness, I'd love to hear what breaks.

---

## Notes
- No emojis. LinkedIn's algorithm doesn't reward them as much as people think, and they clash with a security-research pitch.
- The structure: problem → what I built → killer moment (Dexible pivot) → honest numbers → what I learned → open invitation.
- Length: roughly 400 words. LinkedIn truncates at ~200; the "see more" fold should land after "agentic system" paragraph. That's deliberate — the Dexible pivot story is the hook.
- Ask yourself before posting: am I ready for questions from senior engineers? The Dexible pivot is specific enough to defend. The 5/10 blue-failed number is a strength not a weakness in this audience.
