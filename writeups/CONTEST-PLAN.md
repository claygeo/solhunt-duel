# Active contest entry plan — 2026-04-27

**Source:** Stream 3 of `RESEARCH-2026-04-27.md` (outside-voice research, all URLs verified 2026-04-27)
**Status:** Plan ready. Actual contest **submissions require Clayton's accounts and his approval** (Code4rena + Immunefi accounts are in his name; submissions are publishing to a third party).

---

## ⚠️ Update 2026-04-27 evening — Base Azul SKIPPED

**Decision (outside voice, agentId a4d641944bae954bd):** skip Base Azul entirely.

**Why:**
1. **Fit is bad.** 9 of 10 in-scope contracts are TEE/ZK/dispute-game/oracle territory — solhunt's weak zone. Only 1 contract (`TEEProverRegistryImpl`) is access-control fit. Honest expected value across the single addressable slice: **$0-2K, mode = $0** (top auditors are 3 days deep into the TEE/ZK surface; out-finding Spearbit on AWS Nitro CBOR parsing in 5 days with a v1.1 agent is unrealistic).
2. **Plumbing blocker.** Solhunt hardcodes Ethereum chainId=1 and `ETH_RPC_URL`. Base Sepolia is 84532. The `--chain` CLI flag is just a label, not a real RPC switch. 2-4h of patch work needed — and that patch should ship as a proper v1.2 PR with `/plan-eng-review`, not a rushed hotfix.
3. **The $250K pool framing was misleading.** $250K is severity-scaled across the entire 10-contract Base L2 upgrade, weighted toward critical TEE/ZK findings. Solhunt's realistic addressable slice = one contract = $0-2K range, not $10K-30K.

**Pivot:**
- Tonight: scan **Twyne** (codex-vetted target, Ethereum mainnet, in allowlist, scripts/scan-codex-twyne.sh already prepped) and Drips Tier-E (scripts/scan-codex-tier-e.sh).
- Sunday/Monday: ship multichain patch as v1.2 PR with `/plan-eng-review` per CLAUDE.md gstack discipline. Permanent capability gain — unlocks Arbitrum + Polygon + Base + Optimism scanning. Cite in grant applications.
- May 4 contest deadline: forfeit Base Azul without guilt.

**What I'm keeping in this plan below:** Monetrix on Code4rena ($22K, Eth mainnet — no plumbing issue). Still mediocre EV given V12 dedup, but it's a cheap shot if Twyne / Drips Tier-E land clean and there's spare time.

---

## Critical strategic constraint — Code4rena ≠ default platform anymore

Code4rena now runs **Zellic's V12 AI tool** internally on every Solidity competition. V12 findings are auto-shared with all wardens AND judged as known issues. **Duplicates of V12's findings are ineligible for awards.**

Source: https://docs.code4rena.com/competitions/submission-guidelines

What this means for solhunt:
- The easy AI-discoverable bugs in any Code4rena contest are **pre-claimed by V12** before the warden window opens.
- For solhunt to win on Code4rena, it must find something V12 *missed* — which is harder than just finding bugs.
- Code4rena's contest economics shift heavily against AI-tool entries.
- Smaller / simpler contests are still worth a 4-hour cheap attempt because V12 might miss something, but the **expected value of Code4rena entries dropped significantly when V12 went live**.

Pivoting to **Immunefi audit competitions** (PoC-quality required, V12 not running, plays to solhunt's "I write working exploits" strength) and **Sherlock** (full PoC quality matters, senior-Watson-gated but pays 2-3x typical) is the right move.

---

## Active contest landscape

| Platform | Contest | Pool | Ends | Fit | Link |
|---|---|---|---|---|---|
| Code4rena | **Monetrix** (Hyperliquid yield, Solidity) | $22K USDC | May 4, 2026 | Mediocre — small Solidity contest | https://code4rena.com/audits/2026-04-monetrix |
| Code4rena | K2 (Stellar lending, Rust) | $135K USDC | May 27, 2026 | Bad — Rust, not Solidity | https://code4rena.com/audits/2026-04-k2 |
| Immunefi | **Base Azul** (Solidity + Rust, ~190K nSLOC) | $250K severity-scaled | May 4, 2026 20:00 UTC | Mixed — Solidity portion worth the time, Rust portion wasted | https://immunefi.com/audit-competition/audit-comp-base-azul/information/ |
| Immunefi | Firedancer V1 (C/C++ Solana) | $1M severity-scaled | May 9, 2026 | Bad — wrong language stack | https://immunefi.com/audit-competition/firedancer-v1-audit-comp/information/ |
| Sherlock | XRP Ledger April 2026 | 550K RLUSD | ~April 27 (2-week) | Bad — XRPL native, not EVM | https://audits.sherlock.xyz/contests/1260 |
| Cantina | (none active) | — | — | n/a | https://cantina.xyz/competitions |
| Hats Finance | (requires JS, check directly) | — | — | unverified | https://app.hats.finance/audit-competitions |

---

## Recommended top 2 to enter THIS WEEK

### 1. Base Azul Solidity portion (Immunefi)

- **Pool:** $250K severity-scaled (Critical = $250K cap, but typical "Medium" payout per acknowledged finding is ~$5-15K from this pool)
- **Ends:** May 4, 2026 20:00 UTC (~7 days)
- **Why this one:**
  - Solidity content in the codebase (skip the Rust portion)
  - PoC quality required → solhunt's exploit-writing strength is the core deliverable expected
  - Immunefi audit competitions don't run V12 dedup
  - Even one acknowledged Medium severity ≈ $5-15K
- **Entry cost:** ~6-8h to scan all in-scope Solidity contracts via solhunt + manually verify each finding before submission. Most of that is verification — automated scan is fast.
- **Realistic outcome:**
  - Best case: 1-2 acknowledged Medium = $10-30K
  - Likely case: 1 acknowledged Low + several rejected duplicates = $1-3K
  - Worst case: zero acknowledged = $0 + a public submission with a forensic per-finding writeup as a portfolio asset
- **Risk:** if solhunt produces another RepoDriver-style false positive (cheatcode-bypass, vm.prank-as-admin, scanned-impl-not-proxy), submitting it tanks Clayton's auditor reputation. **Pre-condition: every finding must clear the false-positive checklist from the RepoDriver post-mortem before submission.**

### 2. Monetrix (Code4rena) — only as cheap-shot opportunity

- **Pool:** $22K USDC (small Solidity yield protocol on Hyperliquid)
- **Ends:** May 4, 2026 (~7 days)
- **Why:** $22K is small enough that V12 might miss something, and a 4-hour solhunt sweep + 2-hour manual verification on findings is a cheap shot.
- **Why not first priority:** V12 dedup means easy findings are pre-claimed. Solhunt's strong zone (access control, reentrancy) is also V12's strong zone. Anything left is the "needs deeper economic-model reasoning" stuff that's solhunt's weak zone.
- **Entry cost:** 4-6h
- **Realistic outcome:** $0-1500 expected. Mostly portfolio-building.
- **Don't enter if:** time is better spent on grant applications + Base Azul. This is a "if you already have Base Azul submissions queued and have spare hours" task.

---

## Skip these (and why)

- **Firedancer V1 ($1M pool):** C/C++ Solana validator code. Solhunt operates only on EVM-Solidity. Wrong stack.
- **K2 ($135K):** Rust on Stellar. Wrong stack.
- **Sherlock XRPL ($550K RLUSD):** XRPL native code, not EVM. Wrong stack. Also Sherlock is Watson-gated; first-time entrants are usually shut out of payouts.
- **All other Code4rena Solidity contests** — V12 dedup makes them lower-EV than Immunefi.

---

## Submission workflow per finding

This applies for both Code4rena and Immunefi. **Every submission gates on Clayton's approval to publish to a third party.**

```
1. solhunt scan <addr> --via-claude-cli
   → produces findings/<ts>-<contract>/{report.json, Exploit.t.sol, README.md}

2. Apply false-positive checklist (per RepoDriver lessons):
   ☐ Does the exploit use vm.store / vm.prank to bypass real access control?
       → if YES, finding is invalid, do not submit.
   ☐ Is the function gated by a permanent block (pause + zero admin)?
       → if YES, finding is invalid, do not submit.
   ☐ Is the scanned contract an impl that no proxy currently delegates to?
       → if YES, scan the proxy instead; do not submit a finding on the dead impl.
   ☐ Is the value-at-risk realistic (not just instantaneous balance against a fork)?
       → quote actual TVL or annotate "instantaneous balance, not historical drain."

3. Manually re-run forge test on a fresh fork at the contest's specified block.
   → if it doesn't repro on a fresh fork, do not submit.

4. Write the contest submission:
   - Severity (use contest's rubric, not solhunt's heuristic)
   - Impact (concrete monetary exposure, not "could be exploited")
   - PoC (the .t.sol, with comments explaining the attack steps)
   - Mitigation (this is required by Immunefi, optional on C4)

5. Get Clayton's approval before clicking submit.
   → DO NOT auto-submit. Reply to Clayton with the finding + the
     submission text. Wait for explicit "ship it" before submitting.

6. After submission:
   - Add to findings/contest-submissions-log.csv
   - Track verdict (acknowledged / duplicate / invalid / out-of-scope)
   - On "duplicate" verdict, add the duplicating finding to the
     red-prompt as another false-positive pattern (so solhunt doesn't
     waste future budget on the same shape of issue).
```

---

## Setup tasks BEFORE entering any contest

1. **Verify Clayton's Code4rena account** — sign in at https://code4rena.com/login. Confirm "Warden" status. (Credential issue — needs Clayton.)
2. **Verify Clayton's Immunefi account** — sign in at https://immunefi.com/whitehats. Confirm KYC status (required for any payout). (Credential + KYC issue — needs Clayton.)
3. **Set up Sherlock account** — only if pursuing Sherlock contests. Watson application required. Skip for now.
4. **Pre-scan the in-scope contracts before contest start** — for Base Azul, fetch the in-scope Solidity contract list from the contest spec, run solhunt sweep, save findings/. This is non-blocking — can run autonomously now.

---

## Realistic outcome math

Combined Base Azul + Monetrix entries (~14h total time):
- Base Azul: $0-30K expected, mostly $0-10K range
- Monetrix: $0-1500 expected, mostly $0
- Combined expected value: ~$3-12K
- Combined hourly rate: ~$200-850/hr (low end is below market for an experienced engineer, high end is decent)
- Portfolio value of public submissions (acknowledged or not): real and persistent

**Compare to grant applications (Stream 1, RESEARCH-2026-04-27.md):**
- Arbitrum Trailblazer alone: ~$50-75K, 4-6h application time, ~30-50% land rate
- Expected value: ~$15-40K for 4-6h
- Hourly rate: ~$2500-10000/hr

**Conclusion:** grant applications are higher EV than contests right now. **Do contests as portfolio + secondary**, not as the primary income strategy. The primary money lane is grants + cold-outreach retainers (Stream 2, OUTREACH-TARGETS.md).

---

## What I (autonomous agent) will do without Clayton's approval

- ✓ Run solhunt sweeps against in-scope contest contracts (autonomous)
- ✓ Apply false-positive checklist to each finding (autonomous)
- ✓ Draft submission writeups per finding (autonomous)
- ✓ Track contest deadlines and surface upcoming ones (autonomous)

## What requires Clayton's approval

- ✗ Submitting findings to Code4rena / Immunefi / Sherlock (publishes to third-party + impacts auditor reputation)
- ✗ Creating accounts on platforms where Clayton doesn't already have one
- ✗ Completing KYC on Immunefi (personal info)
- ✗ Accepting any prize payout (financial)

---

## Next concrete actions (autonomous, no approval needed)

1. **Today:** fetch Base Azul contest scope (in-scope Solidity contract addresses), pre-stage source for solhunt scan
2. **Today:** fetch Monetrix contest scope, pre-stage source
3. **Tomorrow:** run solhunt sweep against Base Azul Solidity contracts (~3-6h on Max subscription, $0 marginal)
4. **Tomorrow:** run solhunt sweep against Monetrix
5. **This weekend:** apply false-positive checklist to all findings
6. **This weekend:** draft submission writeup per surviving finding
7. **By Monday:** present findings + draft submissions to Clayton for go/no-go on submission

Submission to either platform on Wednesday April 30 latest, leaving 4 days of buffer before May 4 deadline.
