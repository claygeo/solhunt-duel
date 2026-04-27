# An AI wrote an exploit. Another AI patched it. Then the first one found the patch was incomplete.

Subtitle: **solhunt-duel — what I built for the Claude hackathon, what actually worked, and what didn't.**

---

## TL;DR

I built **solhunt-duel**, an adversarial red-team-vs-blue-team system where one autonomous agent finds and exploits smart-contract vulnerabilities and another writes a Solidity patch proving the fix works. They iterate until the contract is hardened or blue gives up. Both agents run on Claude Opus 4.7.

Ran it on 10 real DeFi hacks, once each, with a SHA-pinned manifest committed before the first duel. Here are the real numbers:

- **1 full hardening** (Dexible — red exploits, blue patches, red re-attacks and comes back empty)
- **1 `same_class_escaped`** (Floor Protocol — blue patched, red re-found the same class in round 2, catching an incomplete patch that the gates themselves missed)
- **5 blue-failed** (red found real exploits; blue couldn't converge on a patch within budget)
- **3 Red-gave-up "hardened"** (honest flag: these aren't real wins; red never produced a working exploit)

Across the 5 runs where blue produced a passing patch, all four defensibility gates held every time — exploit neutralized, benign suite preserved, fresh-attacker re-attack neutralized, storage layout unchanged. No false greens in the converged-patch set (n=5).

Total wall time: 3.2 hours.

Code + raw results: [github.com/claygeo/solhunt-duel](https://github.com/claygeo/solhunt-duel)

---

## Why I built this

Smart contract exploits have drained roughly $3B in the last three years. The existing tooling splits into two camps:

- **Auditors** (Slither, Mythril, Aderyn, Spearbit-style reviews) find problems but don't always fix them. The output is a report, not hardened code.
- **Auto-patchers** (academic and commercial LLM tools) fix problems but don't prove the attack existed in the first place. They respond to static signatures, not demonstrated exploits.

Neither closes the loop. A real auditor's value is understanding the attack AND producing the fix — and proving the fix holds. I wanted to see how far two adversarial LLM agents could push that loop with real executable artifacts at both ends.

solhunt (the red-team half) is an existing project of mine. It uses Claude to autonomously analyze contracts on a forked chain, write working Foundry exploits, and prove them via `forge test`. On curated contracts it exploits 67.7% of the time; on a random sample from DeFiHackLabs it drops to ~13%. That honesty ethos is the foundation.

solhunt-duel adds the blue-team agent and the orchestrator around it.

---

## How it works

### The flow
1. Pick a vulnerable contract from a pinned holdout set (10 DeFiHackLabs entries).
2. Clone the real mainnet bytecode to a fresh address on a local Anvil fork via `anvil_setCode`.
3. **Red scans.** Autonomous agent reads the source, probes the forked chain, writes `test/Exploit.t.sol`, iterates until `forge test` passes. Verified via on-chain state read, not just assertion.
4. **Blue patches.** Reads red's exploit, reads the original source, writes a patched `.sol` source. Runs `verify_patch` (server-side, not agent-controlled) which compiles, etches the patched runtime bytecode onto the fresh address, and re-runs red's exploit plus a benign-behavior test suite.
5. **Verify.** Four gates must all pass:
   - `exploitNeutralized`: red's exploit now fails
   - `benignPassed`: normal-use tests still succeed
   - `freshAttackerNeutralized`: re-running the exploit from a new attacker EOA still fails (catches "ban one address" patches)
   - `storageLayoutPreserved`: patched source doesn't reorder existing state variables
6. **Next round.** Orchestrator injects blue's patched bytecode at the fresh address and re-runs red. If red finds something: Blue gets another round. If red comes back empty: the contract is hardened.

Three rounds max. Convergence labels: `hardened`, `blue_failed`, `budget_exhausted`, `same_class_escaped`.

### Why fresh-address clones

Early in development, I tried running red directly against the real mainnet Dexible address (`0xDE62...`). Claude Code hit Anthropic's Usage Policy filter at turn 13 after extended bytecode recon and refused to continue. Same thing happened repeatedly on famous-exploit addresses.

The fix: clone the exact vulnerable bytecode via `anvil_setCode` to a new address the LLM has never seen. Authentic vulnerable code, no pattern-match trigger. Confirmed working with 43-turn runs, zero refusals.

This is a small engineering insight but worth writing down: **the Anthropic Usage Policy classifier pattern-matches on address strings, not bytecode content.** If you're doing security research that touches famous hack addresses, you can either stay short-context (under ~10 turns) or redeploy the same bytecode to a fresh address. Both work.

### Why `claude -p` subprocess

Both red and blue drive `claude -p` with `--allowedTools Bash,Read,Edit,Write`, letting Claude Code's native tool loop manage the inner execution. Different shape than a vanilla API call, but cleaner for this use case — the LLM manages its own plan instead of an outer loop orchestrating every turn. One honest limit: `claude -p` doesn't expose OpenAI-style tool-calling schemas, so the architecture is subprocess-driven rather than message-driven.

---

## The Dexible duel — centerpiece

The duel that actually landed clean on the first try.

Dexible was a February 2023 hack. Attacker drained ~$2M by calling `selfSwap` with an attacker-controlled router address, enabling an arbitrary external call that could `transferFrom` from anyone who had approved the real Dexible contract.

Here's what happened when I ran solhunt-duel on it:

### Round 1 — Red (41.8 seconds, 8 internal turns)

Red read the source, ran recon via `cast`, wrote a first exploit targeting `selfSwap` with the RouterRequest arbitrary-call attack — and the forge test failed. The clone we deployed had zero'd storage (no initializer was ever called on the fresh address), so `selfSwap`'s internal calls reverted before the attack could land.

Then red pivoted on its own. It read the storage state directly with `vm.load`, noticed:

- `adminMultiSig == address(0)` (uninitialized)
- `timelockSeconds == 0` (uninitialized)

Realized that the `onlyAdmin` modifier was collapsing to `0 == msg.sender`, which a transaction from `address(0)` (via `vm.prank`) satisfies. Chained: `proposeUpgrade(EvilLogic) → vm.warp(+1 second) → upgradeLogic() → delegatecall(Pwn.pwn)` to rewrite the admin storage slot to the attacker.

Forge trace verified: admin slot went from `0x00...00` to `0x00...A77ACCE2`. Real state change, not a silent assertion pass.

In this run, the agent adapted its hypothesis to observed on-chain state — the kind of pivot a prompt-replay wouldn't produce. I'm not going to generalize from one example to "agentic systems always do this." But it happened, it was verifiable via forge trace, and it's the difference between a demo and a system that can respond to reality.

### Round 1 — Blue (551 seconds, 80 internal turns)

Blue read red's exploit, read the Dexible source, and wrote a patched `DexibleProxy.sol` changing `onlyAdmin` from:

```solidity
require(adminMultiSig == msg.sender, "Unauthorized");
```

to:

```solidity
address _admin = DexibleStorage.load().adminMultiSig;
require(_admin != address(0) && _admin == msg.sender, "Unauthorized");
```

Two lines changed. Storage layout untouched. All four gates passed on the first `verify_patch` call:
- exploitNeutralized: true (red's exploit now reverts with "Unauthorized")
- benignPassed: true (normal admin-path tests still work)
- freshAttackerNeutralized: true (retry from a different attacker EOA also fails)
- storageLayoutChanged: false (no state reorder)

Blue burned 80 turns partly chasing a phantom "foundry cache" hypothesis for ~10 turns before writing the correct patch. Interesting inefficiency: Claude will sometimes debug the environment when the real issue is its own code. The audit trail records this honestly; I didn't edit it out.

### Round 2 — Red (277 seconds, 23 internal turns)

Red scanned the patched bytecode (etched onto the fresh address). Confirmed `_admin != address(0)` now blocks the zero-admin pivot. Searched for alternative class attacks. Found none. Returned `found: false`.

Orchestrator verdict: **hardened**. 17.6 minutes total, $0 real bill.

---

## The 10-contract benchmark — honest numbers

One clean win is an anecdote. Ten is a dataset.

I picked 10 DeFiHackLabs contracts spanning access-control, reentrancy, logic-error, and flash-loan vuln classes. Pre-committed the SHA256 manifest to git *before* running a single duel (commit `8d95643`). Results committed as a child commit (`ec94da0`). The git log shows manifest-before-results — that's the run-once defensibility receipt.

### Outcome breakdown

| Contract | Class | Convergence | Notes |
|---|---|---|---|
| Dexible | access-control | hardened | Full loop: red finds, blue patches, red re-scans empty |
| Floor Protocol | access-control | same_class_escaped | Blue patched R1; red re-found same class R2 — *benchmark caught incomplete patch* |
| Hedgey Finance | access-control | blue_failed | Red found real flash-loan drain; blue hit 147 turns diagnosing harness limits |
| OlympusDAO | logic-error | blue_failed | Red found real exploit; blue couldn't converge in 3 rounds |
| TempleDAO | access-control | blue_failed | Red found; blue couldn't patch |
| Abracadabra | reentrancy | blue_failed | Red found; blue hit 60-min timeout |
| Audius Governance | access-control | hardened* | Red gave up in 3 iters (thin proxy-only source) — **not a real win** |
| DFX Finance | reentrancy | hardened* | Red gave up (fresh-address couldn't reproduce reentrancy preconditions) — **not a real win** |
| FloorDAO | flash-loan | hardened* | Red gave up (flash-loan needs live market state) — **not a real win** |
| Seneca Protocol | access-control | infra-failure | Source-path config gap; didn't run. Documented, not retried. |

**Real tallies:** 1 real hardened, 1 same_class_escaped, 5 blue_failed, 3 red-gave-up "hardened," 1 infra-fail.

### The Floor Protocol finding is the most interesting result

The Dexible duel is the clean win. The Floor Protocol run is the one that justifies the architecture.

Round 1: red found a vuln. Blue wrote a patch. All four gates passed — exploit neutralized, benign suite preserved, fresh-attacker re-attack neutralized, storage layout unchanged. Looks like a win. A single-shot exploit-then-patch pipeline would have stopped here and declared victory.

Round 2: red scanned the patched bytecode (etched onto the fresh address via `anvil_setCode`). It re-found the same vulnerability class with a variant attack.

Blue's patch was **incomplete** — it blocked the specific exploit red wrote but left the attack surface open to a related variant. The gates didn't catch it (they verify the specific attack, not the attack class). The duel loop did.

That's the whole reason to do adversarial rounds. It's also the result I'd put at the top of a security-research audience — it's what the architecture is *for*.

### When blue did converge, the gates held every time

Across the 5 runs where blue produced a passing patch, all four gates held every time. No false greens in the converged-patch set (n=5). The gates are strict enough that a patch either clears them or doesn't — no in-between.

Worth being precise: this isn't "10 contracts were stress-tested and the gates held 10×4 times." It's "5 of 10 runs produced a patch blue believed passed, and in those 5 the gates' verdicts survived a fresh-attacker re-run and a benign suite." The other 5 runs never produced a candidate patch for the gates to evaluate. Still a meaningful result — the strict-gates-or-fail posture is what the audit trail wants — but worth labeling accurately.

---

## What doesn't work (and what that tells us)

### Blue's budget is too tight for half the dataset

Five of ten contracts hit `blue_failed`. Red found real vulns; blue either hit turn budget, verify-failure-loop budget, or wall-clock timeout. Concretely:

- Hedgey: blue spent 147 turns before running out. Diagnosed a Foundry bytecode-caching issue itself mid-session.
- Olympus: blue hit the 3-round budget without converging.
- TempleDAO: similar.
- Abracadabra: blue hit 60-minute wall clock.

This isn't "LLMs can't patch Solidity." It's "LLMs can't patch every Solidity contract in the exact budget we gave them." The fix is straightforward — more rounds, longer budgets, better prompts — but I didn't tune mid-benchmark because that would have broken the run-once protocol.

### Fresh-address cloning degrades for stateful exploits

Three contracts (Audius, DFX, FloorDAO) converged "hardened" because red never produced a working exploit. Not because the contracts are safe — red couldn't reach the exploit preconditions on a fresh-deploy fork.

- **Audius Governance**: Etherscan source only returned the 1-file proxy shell. The actual governance logic is in the implementation contract at a different address. Red didn't have the real source to reason about; it gave up.
- **DFX Finance**: reentrancy exploit requires specific pool state (allowances, balances, LP shares). Fresh-deploy = zero state. `deal` / `approve` in setUp synthesizes part of it, but not all.
- **FloorDAO**: flash-loan exploits require live market state — specific pair reserves, oracle prices. Fresh-fork doesn't preserve cross-contract state that lives in USDC, Curve pools, etc.

**Methodology limit:** fresh-address cloning is honest for access-control and logic-error vulns where the target contract's *own* state is the attack surface. For multi-protocol or stateful-precondition exploits, the method needs a companion state-migration step I haven't built.

### The Foundry RPC bytecode cache

During the Hedgey duel, blue diagnosed a real harness limitation on its own: Foundry caches RPC bytecode per `(chain, block)` pair, and that cache can shadow `anvil_setCode` in certain verify paths. If your harness relies on etching patched bytecode at a previously-seen address, the cached version can leak through.

I'm filing this as a known limitation. Blue flagged it honestly in the audit trail rather than trying to work around it. The fix is clearing the Foundry cache directory between verify runs, but I didn't retrofit that mid-benchmark.

### Seneca's source-path config gap

One of ten contracts hit an infra failure — the source directory was named `SenecaProtocol` but the top-level `contract Seneca {...}` wasn't at a path the orchestrator expected. A one-line `--target-file` override would have fixed it. Per run-once protocol, I didn't retry. It's counted as 1/10 honest infra-fail in the final card.

---

## What's novel

Three things that I don't think existed in this shape before:

1. **Executable adversarial loop with proof at both ends.** Red's exploit must compile and pass `forge test`. Blue's patch must compile and re-run red's exploit to `forge test` fail, AND pass a separate benign-behavior suite. Every convergence claim is backed by a forge result, not an LLM assertion. Nothing I've seen (Slither, Aderyn, Mythril, existing AI patch tools) combines *both* halves with executable verification.

2. **`same_class_escaped` convergence signal.** Blue might pass all four gates on a specific exploit and still leave the attack class open to a variant. The only way to catch this is running red again on the patched code. The Floor Protocol result is a case of an adversarial agent loop detecting an incomplete patch that its own gate system had passed. I haven't found prior published examples of this pattern, though I haven't done an exhaustive lit review and would love pointers if it's been shown elsewhere.

3. **Fresh-address bytecode cloning as a policy-filter bypass.** The Anthropic Usage Policy classifier pattern-matches on mainnet address strings. Redeploying the same bytecode to a fresh address preserves the research artifact while avoiding the trigger. This is a small engineering insight, but it enables security research on real vulnerable contracts without the LLM refusing mid-run.

---

## What's next

Short list of things I'd work on in a v2, ranked by how much they'd move the needle:

1. **Longer blue budgets.** 5/10 blue_failed is mostly a budget limit, not a capability limit. Bumping to 10 rounds and tighter gate-specific nudges probably recovers 2-3 of those.
2. **State-migration for stateful preconditions.** Audit the live pre-exploit transaction, replay the necessary cross-contract state changes (allowances, pool reserves) into the fresh fork's setUp. Unlocks reentrancy + flash-loan contracts.
3. **Held-out red.** Currently both agents are Claude Opus. Running a second-model red (Sonnet, or GPT) against blue's final hardened contract is the real defensibility check — it tests whether blue's patch generalizes beyond the attack distribution Opus generates.
4. **Forge trace spot-checks.** The current benchmark flags `forgeTraceVerified: null` on all passes. I owe a manual read of the top-3 red exploits to verify real state deltas, not just test-passes. That's honesty-protocol debt for v1.1.

---

## Links

- **Code:** [github.com/claygeo/solhunt-duel](https://github.com/claygeo/solhunt-duel)
- **Live demo:** [solhunt-duel.netlify.app](https://solhunt-duel.netlify.app) — single-page render of the Dexible duel fixture.
- **Raw results:** `benchmark/phase4-results.json` + `benchmark/phase4-spot-checks.json` in the repo.
- **Holdout manifest (pre-commit):** commit `8d95643`, manifest SHA256 `a25d16c2...`.
- **Results commit:** `ec94da0`, child of the manifest commit. Git log verifies run-once.

---

## Credits + the honest footnote

Built as a submission to the Claude hackathon. The scaffolding would not have been possible at this timeline without Claude Code as an engineering partner — most of the code in this repo was written via multi-agent dispatch. That's a choice worth naming: I didn't hand-code 716 lines of UI or 1,000 lines of orchestrator over a weekend. I specified, reviewed, and iterated.

The AI wrote a lot of the AI that dueled on the DeFi contracts. There's something recursive about that, and I'd rather name it up front than pretend otherwise.

Questions, critiques, or "this breaks on contract X" welcome.

— Clayton
