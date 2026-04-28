# Solhunt finding bundle

- **Target address:** `0xfaba8f777996c0c28fe9e6554d84cb30ca3e1881`
- **Contract name:** AaveV3ATokenWrapper
- **Program:** [Twyne](https://immunefi.com/bug-bounty/twyne/)
- **In-scope as of:** 2026-04-27
- **Generated:** 2026-04-27T21:19:03.034Z

## DO NOT SUBMIT WITHOUT HUMAN REVIEW.

Solhunt is an autonomous agent. Every claim below MUST be re-verified by a human before any Immunefi submission. Common failure modes:
- Exploit test passes only because of an artifact of the fork (e.g. a flash-loan callback that wouldn't work on mainnet).
- "Vulnerability" is actually expected protocol behavior under intended access control.
- Severity inflated. Check the program's severity classification before trusting the agent's label.

## Agent verdict

- **Found:** YES
- **Class:** access-control
- **Severity (agent claim):** medium
- **Functions:** skim
- **Description:** AaveV3ATokenWrapper.skim(address receiver) is unauthenticated and does not pull assets from the caller. It reads the wrapper's full underlying-token (wstETH) balance, supplies it to AAVE on the wrapper's behalf, and mints freshly computed ERC4626 shares to an attacker-chosen receiver. Any underlying tokens donated to the wrapper (e.g. by a user mistakenly calling ERC20.transfer instead of depositATokens/depositWithPermit) can therefore be stolen by anyone who calls skim first — they receive shares backed by the victim's wstETH.
- **Test passed (authoritative):** NO
- **Value at risk (agent claim):** Any underlying (wstETH) accidentally sent to the live wrapper: ~0.998 shares per 1 wstETH donated. Scales 1:1 with donations.

## Files in this bundle

- `report.json` — full structured agent output
- `Exploit.t.sol` — Foundry test the agent wrote (if any)
- `README.md` — this file

## Next steps for the reviewer

1. Read `Exploit.t.sol` end-to-end. Convince yourself the asserted "exploit" is a real loss-of-funds path on mainnet, not a fork artifact.
2. Re-run `forge test` against a fresh mainnet fork (not the cached one solhunt used) to confirm reproducibility.
3. Cross-reference the program's severity rubric. `severity` from the agent is best-effort, not authoritative.
4. If still confident, prepare an Immunefi submission per the program's PoC requirements.