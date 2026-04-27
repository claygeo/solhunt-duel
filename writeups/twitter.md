# Twitter

Two formats. Pick whichever feels right on the day.

## Option A — Single tweet (280 chars)

> Built solhunt-duel for the Claude hackathon: two autonomous agents run adversarial red vs blue on real DeFi hacks. Red writes the exploit, Blue writes the patch, they loop until the contract is hardened. Both agents run on Claude Opus 4.7. Ran it on 10 contracts. github.com/...

(Replace with real URL. Leaves room for a link card.)

## Option B — Thread (6 tweets)

**1/**
Built solhunt-duel for the Claude hackathon: two autonomous agents. Red finds and exploits. Blue reads the exploit, writes a Solidity patch, proves it works. They loop until the contract is hardened or Blue gives up.

Both agents run on Claude Opus 4.7.

**2/**
The centerpiece: Dexible, a real 2023 DeFi hack ($2M drained).

We clone the actual mainnet bytecode to a fresh Anvil fork address. Red's first exploit attempt failed because the fresh-deploy proxy had zero'd storage. Then it did something interesting.

**3/**
Red pivoted on its own. It read the storage, found that `adminMultiSig == 0` and `timelockSeconds == 0`, realized the `onlyAdmin` modifier was comparing zero to msg.sender, and chained `proposeUpgrade → warp → upgradeLogic → delegatecall` to take over the proxy.

Verified via `vm.load`. Real state change.

**4/**
Round 2: Red re-scanned Blue's patched bytecode (injected via `anvil_setCode`). Found nothing. Convergence: hardened.

17.6 minutes wall. Reproducible from a single CLI command.

**5/**
Ran it on 10 contracts with a run-once protocol (SHA-pinned manifest committed before any run, no retries):

1 real hardened (Dexible).
1 `same_class_escaped` (Floor Protocol — the benchmark caught an incomplete patch).
5 blue_failed.
3 Red-gave-up "hardened" (honest flags).

**6/**
When Blue did succeed, gate quality was 100% across all four checks (exploit neutralized, benign suite passed, fresh-attacker replay neutralized, storage layout preserved).

No false greens on 10 contracts.

Code + honest numbers: [repo link]
Live demo: [netlify link]

---

## Notes on tone
- No emojis anywhere.
- No "🚀" / "excited to share" / "proud to announce" openings.
- Lead with what it does, not with how we feel about it.
- Option B is the research-honest version. It reads like someone who actually built it.
