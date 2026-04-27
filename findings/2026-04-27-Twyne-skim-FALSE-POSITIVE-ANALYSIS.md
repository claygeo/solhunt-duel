# Finding rejected: Twyne `awstETHWrapper.skim()` access-control claim

**Date:** 2026-04-27 (evening)
**Target scanned:** `0xfaba8f777996c0c28fe9e6554d84cb30ca3e1881` (Twyne's awstETHWrapper, ERC1967Proxy)
**Implementation per agent:** `0xff8cbf0bb4274cf82c23779ab04978d631a0a34e` (Twyne's AaveV3ATokenWrapper)
**Program:** Twyne ([Immunefi](https://immunefi.com/bug-bounty/twyne/))
**Agent verdict:** `found=true`, severity=medium, class=access-control
**Reviewer verdict (outside voice, agentId ab583ff9603f0c4d7):** **FALSE POSITIVE — DO NOT SUBMIT — 3% probability of real bug**

## What the agent claimed

`awstETHWrapper.skim(address receiver)` lacks access control. Any caller can mint shares to themselves, backed by WSTETH that lands on the wrapper outside of `deposit()` (user error, transfer-then-call routers, front-running approve/transfer/deposit sequences). Forge test passed: attacker stole 9.985 WSTETH from a 10 WSTETH "donation" — ~$33K at $3300/ETH.

The exploit is mechanically real on a fork. The agent ran 28 iterations, wrote a clean Foundry test, observed the actual share-mint, and produced honest output.

## Why this is a false positive

### 1. `skim()` is intentionally permissionless — Euler EVK design pattern

Twyne's contracts fork the Euler Vault Kit (EVK) directly. Per [Euler's own security documentation](https://docs.euler.finance/security/attack-vectors/donation-attacks/), the donation-attack via permissionless skim is **stated public design, not a vulnerability**:

> *Euler explicitly chose permissionless skim over admin-gated sweep, accepting that "a single bot looking for opportunities in all the existing EVaults could undermine its intended use" — they consider this less bad than centralizing the sweep role.*

Twyne inherits this stance. Adding access control to `skim()` would **break the protocol**, because Twyne's Periphery code calls `intermediateVault.skim(shares, msgSender)` as part of the deposit primitive itself.

### 2. The protocol's own SDK uses skim() identically to the "exploit"

Twyne's `src/Periphery/AaveV3Wrapper.sol` does:

```solidity
deposit(amount, intermediateVault);
intermediateVault.skim(shares, msgSender);
```

Atomically, in one transaction. The agent's "exploit" calls `skim(attacker)` to mint shares to itself — exactly the same call signature the SDK uses, just with a different receiver. **The function is the deposit primitive.** It's not a vulnerability that the deposit primitive can be called.

### 3. Wrapper holds zero raw WSTETH currently

Per Etherscan, `0xfaba8f...1881` has 11 lifetime txs, no `Pause` events, regular legitimate skim activity, and currently holds **0 WSTETH** (only 5.69 aEthwstETH from prior deposits, which aren't skimmable as wrapper shares). The exploit window is purely theoretical right now.

### 4. Twyne's bounty rubric explicitly excludes this class

Twyne's Immunefi page lists exclusions including:
- "Any issue related to rewards accrued to Twyne contracts"
- Front-running on permissionless functions where the protocol's intent is permissionlessness

This finding falls squarely in the excluded set even before considering whether it's a real bug.

### 5. Three independent audits cleared it

Twyne's gitbook lists yAudit, SecEureka, and Enigma audits on the Aave wrapper. The `skim` signature has been front-and-center in every audit. None flagged it. The pattern is well-known and intentional.

### 6. Real exploitability requires victim error + losing a mempool race

Even if the wrapper had stranded WSTETH, the realistic attack requires:
1. A user manually transfers WSTETH directly to the proxy (which Twyne's SDK never does)
2. The attacker wins a mempool race against Twyne's keeper bot (recurring caller `0x270221...0F07` is plausibly that keeper)

This is the same threat model as "user accidentally sends tokens to the wrong address" — universally out-of-scope on Immunefi.

## Why solhunt fell for it

Solhunt's red-team prompt currently flags any function lacking access control as a potential vulnerability. It correctly read the contract, correctly identified that `skim()` has no `onlyAdmin` / `onlyOwner` modifier, correctly wrote a test that exercises the function, and the test correctly passes — because the function is *supposed* to work that way.

What the agent doesn't currently do:

1. **Check whether the protocol's own callers use the function the same way as the "exploit."** `intermediateVault.skim(shares, msgSender)` in Twyne's Periphery code calling pattern is identical to what the agent flagged as malicious. If the SDK uses it, it's by design.
2. **Cross-reference the protocol's documented design philosophy.** Euler EVK's security docs explicitly endorse permissionless skim. solhunt didn't check.
3. **Reason about the bounty's explicit out-of-scope clauses.** Even if the bug were real, the rubric excludes it. solhunt judged severity in the abstract.

## Lesson for `red-prompt.md` (next iteration of agent prompt)

### Update 4 — "Is this the deposit primitive?" check (after Updates 1-3 from RepoDriver)

Add to "Common false-positive patterns":

> **Permissionless functions that are the protocol's deposit/withdrawal primitive.** Before claiming an unprotected function is a vulnerability, search the protocol's own repo (Periphery, SDK, Router, Helper) for callers of the function. If the protocol's own code calls the function the same way your exploit does — same signature, same receiver pattern, same atomic context — the function is documented design, not a bug. `skim`, `pull`, `flush`, `harvest`, and `liquidate` are common patterns that LOOK like access-control bugs but are typically intentionally permissionless. Always grep for callers BEFORE claiming `found=true` on access-control-class findings.

### Update 5 — Donation-attack pattern recognition

Add to "Common false-positive patterns":

> **Donation-attack against ERC4626 / Euler EVK style wrappers.** When the exploit requires "WSTETH lands on the contract outside of deposit()" or "USDC stranded between approve and deposit," check whether the contract is an ERC4626-style wrapper or Euler EVK fork. These designs intentionally accept permissionless skim/sweep as the trade-off against admin centralization. Donation-attack severity is almost always "out of scope: rewards accrued to contract" or "out of scope: user error." Promote to `found=false` with note "donation-attack on EVK-style wrapper, by design" rather than `found=true`.

### Update 6 — Tool: `find_callers_in_protocol_repo`

Add to recon tools (deferred — needs implementation):

> Before asserting access-control vuln, fetch the protocol's GitHub repo (search for the contract name, the protocol name, or `repository:` URL on the Etherscan source). Grep the repo for callers of the function. If the protocol's own code calls it identically to the exploit, the function is design.

This is the same kind of tool the RepoDriver lessons asked for (`find_proxies_for_impl`). Both gaps point to the same root cause: solhunt scans contracts in isolation, divorced from their protocol context.

## Comparison to the RepoDriver false positive (2026-04-27 morning)

| Dimension | RepoDriver | Twyne skim |
|---|---|---|
| Scanned a real Immunefi target | Yes (Drips Network) | Yes (Twyne) |
| Forge test passed | Yes | Yes |
| Cheatcode bypass? | Yes (vm.store the pause flag) | No (deal/prank are legitimate user actions) |
| Permanent pause? | Yes (admin = address(0)) | No (wrapper is live) |
| Impl-not-proxy? | Yes (deprecated impl) | No (proxy actively delegates) |
| Cleared old false-positive checklist? | No (failed all 3) | **Yes (passed all 3)** |
| New failure mode? | n/a | **Yes — "intentionally permissionless function in EVK-style wrapper"** |

The Twyne false positive is qualitatively different from RepoDriver. The exploit IS a real reproduction of the function's behavior on mainnet. The bug is in the agent's *interpretation* — it treated documented design as vulnerability.

## Verdict

**Do not submit.** Same operational discipline as RepoDriver: the finding is technically interesting but operationally junk — submitting would burn Twyne's triage time on a known design pattern and damage Clayton's reputation as a researcher.

**solhunt's live-scan record so far: 0/2 real findings on live bug bounties.**

That number is honest, important, and not catastrophic — it tells us where solhunt is weakest:

- Strong zone (per benchmark): finding KNOWN-class vulnerabilities in HISTORICAL exploits where the bug class is well-defined and the protocol's intent is clear from the post-mortem.
- Weak zone (per live scans): distinguishing *vulnerability* from *intentional design* in actively-developed, audited code. The agent doesn't read the protocol's own callers. It doesn't read the design docs. It judges in isolation.

The fix is recon expansion (`find_callers_in_protocol_repo`), prompt hardening (the two new lessons above), and **honesty in the cold-DM pitch**: clean scans are the realistic deliverable, not free real bugs. The Case B template ("scan came back clean, $1500/mo continuous coverage") is now the primary cold-DM template, not the fallback.

## What this means for the grant pitch

The grant writeups already emphasize honest reporting of solhunt's weak zone. The 32-contract benchmark is 67.7% on curated *historical* exploits — that result still holds. The live-scan path producing 0/2 real findings is not a contradiction; it's the natural extension of "what the agent CAN do on approachable contracts" vs. "what it does against arbitrary, audited live code."

For grants:
- Lean into the honesty. **"We have 2 published false-positive postmortems and the agent's prompt updates derived from them"** is exactly the "scientific, self-correcting" signal grant committees fund.
- The proposed scope (benchmark expansion to 250, monitoring daemon, multi-ecosystem support) explicitly addresses the gap. The recon-expansion item should be added to the v2 scope in the grant writeups.

For cold-DM:
- Default to Case B template. Real findings will still happen (the agent's strong zone is real), but they'll be the exception, not the median outcome.
- **Pricing pitch shifts from "free finding + retainer upsell" to "automated coverage at $1500/mo with QA gates that catch false positives like this one."** The forensic post-mortems become the QA proof point.
