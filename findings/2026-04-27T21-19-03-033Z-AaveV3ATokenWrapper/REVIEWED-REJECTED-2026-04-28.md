# Reviewed by /codex outside-voice: 2026-04-28

## Verdict: DO NOT SUBMIT

The original `STATUS` file says `FOUND` (autonomous solhunt scan flagged a Medium access-control vuln on `AaveV3ATokenWrapper.skim()`). After /codex independent review, this finding is rejected as bounty-worthy. Original STATUS preserved for honest record.

## Why rejected (4 independent reasons)

1. **`skim()` is intentional upstream-inherited behavior.** Inherited from BGD Labs `StataTokenV2`. Twyne's own production flows call `aWETHWrapper.skim(address(collateral_vault))` deliberately as part of EVC batch composition (1-click leverage). Sources: Twyne `aave-v3-aToken-wrapper` repo, BGD Labs `static-a-token-v3`, Twyne source lines 7570-7574, 2995-2998, 3473-3476, 3556-3559.

2. **Exploit requires victim to bypass canonical API.** The wrapper exposes `depositATokens(uint, address)`, `depositWithPermit(...)`, `deposit(uint, address)` — every documented integration path takes a `receiver` argument and credits shares atomically. The "exploit" path uses raw `IERC20.transfer(WRAPPER, donation)` which is not how anyone is supposed to interact. User-error precondition, not protocol bug. Immunefi precedent (Angle / deliriusz) rejected the analogous class.

3. **Twyne's bounty program has no Medium tier.** Only Critical ($20K-$50K) and High ($3K-$10K). Agent claim of "Medium" doesn't even map to a payout slot.

4. **Class doesn't fit Immunefi v2.3 SC Medium definitions.** None of {token-fund-failure, block-stuffing, griefing, theft-of-gas, unbounded-gas} apply. "Theft of unclaimed yield" is High but only for protocol-earned yield, not donor-error wstETH.

## Realistic payout if submitted

**$0.** Most likely outcomes: closed as known-design, or out-of-scope-user-error, or $250-$500 goodwill (no obligation). Submitting burns solhunt's credibility on Twyne's future-finding triage queue.

## Implication for autonomous-chain.sh Stage 0

Stage 0 currently exits on `STATUS=FOUND` with "FOUND_UPSTREAM" — correct safety behavior for a real find but wrong for a reviewed-and-rejected one. This sidecar file marks the finding as processed. Future versions of autonomous-chain.sh should check for `REVIEWED-*` sidecars before treating `STATUS=FOUND` as a chain-stopping condition. (Proper code change pending /plan-eng-review — not done in this iteration.)

## Sources cited by /codex

- https://immunefi.com/bug-bounty/twyne/
- https://immunefi.com/bug-bounty/twyne/scope/
- https://immunefi.com/immunefi-vulnerability-severity-classification-system-v2-3/
- https://github.com/0xTwyne/aave-v3-aToken-wrapper
- https://github.com/bgd-labs/static-a-token-v3
- https://docs.euler.finance/security/attack-vectors/donation-attacks/
- deliriusz - "Stealing in motion" (Angle precedent)
