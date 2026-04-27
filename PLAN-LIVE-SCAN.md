# Plan: First Live Immunefi Scan — Drips Network / RepoDriver

## Goal

Run solhunt against an in-scope live Immunefi target end-to-end. Produce either a runnable Foundry exploit + structured report, OR a structured no-find report. Never auto-submit.

This is the first attempt. The bar is "the plumbing works on a live target without an OpenRouter key, and we get an honest yes/no." Not "we cash a $50k bounty on the first try."

## Target

**Project**: Drips Network (https://immunefi.com/bug-bounty/drips/)

**First-pass sub-target**: RepoDriver only (smallest in-scope surface).
- RepoDriver proxy: `0x770023d55D09A9C110694827F1a6B32D5c2b373E`
- RepoDriver Logic (impl): `0xfC446dB5E1255e837E95dB90c818C6fEb8e93ab0`

**Why this target** (per /codex outside-voice review):
- Self-contained streaming/splitting logic. No live pool reserves, no live oracle pricing. solhunt's fresh-fork methodology works cleanly here.
- In-scope vuln classes (theft, freezing, governance, logic) match solhunt's 75-83% strong zone.
- $50k critical floor, no KYC.
- RepoDriver specifically: post-2024 module, AnyApi→Gelato migration, thinner audit coverage than core Drips.

**Out of scope**: 51% attacks, third-party oracle data errors. solhunt won't naturally drift here.

## Architecture change

**Gap**: `solhunt scan` currently routes through `runAgent` (OpenRouter / Sonnet / paid). The Max-subscription path (`runRedTeamViaClaudeCli` in `src/agent/loop-via-claude-cli.ts`) is only wired into the duel system, not the standalone scanner.

**Change**: Add `--via-claude-cli` flag to `solhunt scan`.
- When set: skip OpenRouter provider validation, delegate to `runRedTeamViaClaudeCli`.
- All other plumbing unchanged (Etherscan fetch, Docker sandbox, Anvil fork, pre-scan recon, report output).
- Estimated diff: ~30 lines in `src/index.ts`.

**Why this minimal approach**: the duel orchestrator is overkill for a single-target scan. We don't need Blue, audit trail, gates. We just need Red on Max.

## Hard rails (enforced in code, not just convention)

1. **In-scope allowlist**: hardcode an `IMMUNEFI_INSCOPE` set of {address: program_url} pairs in a new `src/safety/in-scope.ts`. Block `--via-claude-cli` unless target ∈ allowlist OR `--i-acknowledge-out-of-scope` flag passed.
2. **Never auto-submit**: solhunt has zero Immunefi API integration today. Don't add one. Findings save to `findings/<iso-timestamp>-<contract>/{report.json,Exploit.t.sol,run.log}` for manual review.
3. **Max daily limit handling**: if `claude -p` returns `api_error_status` indicating rate limit, capture verbatim, pause, report. Do not retry.

## Execution location

**VPS (77.42.83.22) only.** Local Windows lacks Docker, Foundry, and the .env keys.

**VPS state already verified**:
- Docker 28.2.2 running, 118G free
- claude CLI v2.1.114 authenticated (Max)
- ETH_RPC_URL, ETHERSCAN_API_KEY, SUPABASE_* env set
- forge 1.6.0-nightly inside docker container
- 2 dirty fixes on VPS (`manager.ts` Docker stream framing + `patch-harness.ts` Foundry RPC cache + storage AST IDs) — keep these

## Implementation steps

1. Local edit: add `--via-claude-cli` flag + `safety/in-scope.ts` in this repo
2. Commit on local branch (no push to public repo yet — keep target list private until we're confident)
3. Sync to VPS via `git diff | ssh ... patch -p1` OR direct SSH edit
4. Smoke: `solhunt scan 0x770023d55D09A9C110694827F1a6B32D5c2b373E --via-claude-cli --dry-run`
5. Live run: same address without `--dry-run`, fork at recent block (e.g., last week's block for reproducibility), scan timeout 25min
6. Whatever comes back: write final report

## Stop / pivot conditions

- **Stop immediately**: `claude -p` rate-limit error, Docker stream parse error, Etherscan source fetch fails for in-scope address.
- **Pivot to runner-up (Twyne)**: 3 consecutive no-finds across 3 different in-scope Drips contracts.
- **Per-scan budget**: 25-minute wall clock per contract. If hung, kill container.

## Success criteria for this first attempt

- Pipeline runs end-to-end on a live in-scope address. ✅ infrastructure validated.
- Output is a valid `ExploitReport` JSON (found=true OR found=false with substance).
- No false-positive submissions. No auto-submission attempted.
- Either:
  - **found=true**: Foundry test compiles, `forge test` passes on the harness re-run (authoritative), human-review-able PoC saved.
  - **found=false**: structured analysis of what was checked and why no exploit was constructed.

## Known risks (honest)

1. **Drips is heavily audited** (Spearbit, Code4rena, Cantina). Realistic find probability for a public LLM scanner: <13% baseline, lifted toward 30-40% on the post-2024 modules but still long-shot.
2. **`claude -p` Usage Policy filter** — historical scanning required fresh-address bytecode cloning to avoid the filter on famous mainnet addresses. RepoDriver isn't famous; should pass clean. But monitor for refusals.
3. **`forge_test` on RepoDriver may need pinned remappings** — Drips uses OpenZeppelin upgradeable contracts. Existing `buildFoundryToml()` includes `@openzeppelin/=lib/openzeppelin-contracts/`, which may not match the upgradeable variant. Etherscan will return the flattened source, so this might be a non-issue — verify in dry-run.
4. **First scan not finding anything is the most likely outcome.** Plan for it. The win condition is "infrastructure works", not "we hit the bug."

## What this does NOT do (out of scope for this PR)

- Multi-contract concurrent scanning
- Submission templating
- Automated re-scanning across all 12 Drips contracts
- Adapting the duel system for Blue patching (not relevant for bounty submission)
- Solana / L2 / non-Ethereum targets

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | clean | Drips/RepoDriverLogic recommended as smallest in-scope target; Twyne flagged as runner-up but stateful |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 7 arch + 3 quality + 14 test gaps; 1 critical (in-scope bypass via non-claude-cli provider); see [REVIEW-LIVE-SCAN.md](REVIEW-LIVE-SCAN.md) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | n/a | (CLI tool, no UI) |

**UNRESOLVED:** 0 (review user opted to defer all decisions to /codex; concrete TODOS in [TODOS.md](TODOS.md) for v1.1 PR).

**VERDICT:** ENG REVIEW DONE_WITH_CONCERNS — three v1.1 items are strongly recommended before the next sweep:
1. Lift in-scope check above the provider branch (5 lines)
2. Regression test for staging cleanup (Iron Rule)
3. Tests for `assertInScopeOrAcknowledged` (the actual safety rail)

The currently-running scan (RepoDriverLogic on `--via-claude-cli`) is NOT blocked by any of these — they're hardening for v1.1.
