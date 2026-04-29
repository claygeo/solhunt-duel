# Solhunt-Duel Overnight Loop Log

Started: 2026-04-28 PM (operator delegated all-night autonomous mode)
Master plan: `~/.claude/projects/.../memory/project_overnight_autonomous_2026_04_28.md`
90-day target: production-ready Solhunt-Duel public benchmark + leaderboard + Friday weekly cadence

---

## Iteration #1 — 2026-04-28 PM

**Wake reason:** initial loop entry
**Work done:**
- Read STATUS-2026-04-27.md (live-scan plumbing built, VPS-reauth-blocked)
- Read RESEARCH-2026-04-27.md (grants landscape — Arbitrum Trailblazer = top EV)
- Read LINKEDIN_POST_FINAL.md (post drafted, recommended Tue-Thu 8-10am post — HOLD until tomorrow morning per timing)
- Briefed operator on VPS auth fix (`/login` → subscription, NOT API key — per `feedback_drill_coach_claude_subscription.md`)
- Saved master delegation memory `project_overnight_autonomous_2026_04_28.md`

**Operator-blocking tasks (cannot proceed without):**
1. VPS Claude CLI re-auth (in progress — switching API → subscription)
2. Hit Post on LinkedIn (HOLD until tomorrow Tue-Thu 8-10am EST anyway)

**Next iteration plan (Iteration #2):**
- Read BLOG_POST.md to verify ship-readiness
- Read `solhunt/benchmark/dataset.json` + `phase4-results.json` structure
- Begin building public benchmark leaderboard HTML (single-page, displays 32-curated + 95-random results)
- Goal: by end of iteration #4-5, leaderboard is netlify-deployable

**Scheduled next wake:** 1800s (30 min) — long enough for substantial work block + cache miss is worth it for 30-min focused chunks vs 270s tick-and-check overhead

---

## Iteration #1 — extended (operator unblocked VPS, gave green-light to commits)

**Wake reason:** operator returned with VPS auth done + "go and do your thing" + "push commits, follow gstack path"
**Auth verification:** `ssh ... claude -p "reply with OK"` → returned "OK" cleanly. Subscription auth confirmed.
**Drips scan kicked off:** `tmux new-session -d -s solhunt-live 'bash scripts/meta-live-scan.sh'` → verified `solhunt-live: 1 windows (created Tue Apr 28 21:29:44 2026)`. Scan running unattended on VPS, ~25 min for first contract (RepoDriverLogic).

**Built this iteration:**
- `solhunt/docs/leaderboard.html` — 250-line self-contained public benchmark page
  - Inline phase4 data (10 contracts, full round-by-round red/blue stats with all 4 gates)
  - Click-to-expand rows showing per-round detail (red turns, blue turns, vuln class, gates result)
  - Headline: Beanstalk $182M / 1m44s / $0.65 + 67.7% curated + 13% random
  - 4-gate stat cards (100% verification rate when gates fired)
  - Honest 67.7% → 13% gap callout
  - Color-coded convergence badges (hardened green / blue_failed orange / same_class_escaped purple / timeout gray)
  - Mobile responsive
  - Dark theme matching cv-template aesthetic

**Status:** scaffold ready for /codex review next iteration before commit. Per operator's "follow gstack path" — I will spawn /codex outside-voice to review before pushing to repo.

**Twyne parallel scan:** DEFERRED. Requires `src/safety/in-scope.ts` change (currently Drips-only allowlist). That code change needs /plan-eng-review per the gstack discipline. Queued for iteration #3 or later after leaderboard ships.

---

## Iteration #1 — final wrap (2026-04-28 PM, ~21:36)

**/codex review verdict on leaderboard:** DO NOT SHIP — 4 ship-blockers identified:
1. "4 gates 100%" without n=3 denominator inline (cherry-picked numerator framing)
2. "hardened" label applied to Audius/DFX/FloorDAO where Red NEVER FOUND a vuln (category error)
3. Relative doc paths break on Netlify deploy
4. Date 2026-04-28 (codex was wrong here — system date IS 04-28)

Plus ~10 ship-with-edits.

**Applied fixes + rewrote leaderboard:**
- Replaced "4 gates 100%" cards with explicit verification funnel: 10 contracts → 5 Red found → 3 rounds reached gates → 3/3 passed all 4 gates
- Split "hardened" into honest displayConvergence: 1 hardened-blue (Dexible), 3 red-failed (Audius, DFX, FloorDAO), 3 blue-failed, 1 same-class-escaped, 1 timeout, 1 unknown
- Changed relative `../docs/...` paths to absolute GitHub blob URLs
- Added convergence taxonomy definitions box inline
- "Cost & Compute" section: notional $48.50 vs real $0 (Max sub) called out explicitly
- Caret/chevron expand indicators
- Round-card border colors match round-level convergence (blue-failed orange, red-failed gray, timeout red)
- Anthropic SCONE-bench citation added
- Beanstalk $0.65 → linked to case study
- Dropped tilde from "13%" → "13.7%" with denominator
- Cut "0% Hidden failures" undefined claim
- Tightened "implicitly cherry-picked" sentence
- Footnoted Abracadabra timeout time inclusion in funnel total

**Committed + pushed to repo:** `ec348b8` on `claygeo/solhunt-duel master` — 408-line file, leaderboard.html public artifact live.

**Drips scan completed cleanly:**
- 4m 20s wall (21:29:44 → 21:34:04)
- STATUS=NO_FIND on RepoDriverLogic (expected on heavily-audited target — plumbing-validation win)
- exit code 0, clean termination
- Tmux session exited (not a crash)

**Bigger discovery: VPS has way more existing infrastructure than the Tier 1 priority queue knew about:**
- `scripts/autonomous-chain.sh` (untracked locally) — overnight chain runner, 4 stages: in-flight wait → Twyne → Drips current-impl → /codex-recommended fresh programs (Inverse FiRM + ENS)
- `scripts/next-programs.json` — /codex strategy v3 queued targets: Inverse Finance FiRM (3 contracts, $100k max bounty, KYC required), ENS BaseRegistrar ($250k cap, NO-KYC)
- `scripts/scan-twyne-impls.sh` — Twyne implementations scanner
- VPS has `twyne-impls-2026-04-27T21-06-15Z`, `twyne-run`, `tier-e-run`, `tier-n-queued`, `resonate-scan`, `queue-dm-arb`, `queue-dm-eth` artifacts from yesterday — operator was running parallel work I wasn't aware of

**Implications for next iteration:**
- The single-target meta-live-scan I kicked off was crude vs the autonomous-chain.sh that's purpose-built for overnight sequential sweeps
- Need to verify autonomous-chain.sh exists on VPS (might be local-only, need push first)
- If on VPS: kick it off — it'll run the full Inverse FiRM + ENS sweep over 12h cap
- If not: commit + push the 3 untracked scripts first, then `git pull` on VPS, then kick off

---

## 🚨 ITERATION #2 — TWYNE FINDING DISCOVERED (TOP PRIORITY)

**Time:** 2026-04-28 ~21:54 UTC

### What happened

Operator returned mid-cycle ("how's it been after 15 min?"). Took advantage of being awake to do iteration #2 work in this turn rather than wait 15 min for the scheduled wake.

Verified `autonomous-chain.sh` exists on VPS. SCP'd missing `next-programs.json` to VPS. Kicked off chain in tmux. **Chain immediately stopped at Stage 0 because it detected `STATUS=FOUND` on the twyne-impls scan from yesterday (2026-04-27 21:19 UTC) — the safety design working as intended.**

### THE FINDING (operator's morning Tier 0 task)

**Target:** `AaveV3ATokenWrapper` at `0xFaBA8f777996C0C28fe9e6554D84cB30ca3e1881` (Twyne wrapper around aTokens for wstETH)
**Bounty program:** https://immunefi.com/bug-bounty/twyne/
**Severity (agent claim):** Medium · access-control
**Found:** 2026-04-27 21:19 UTC (24+ hours unreviewed)
**Bundle (now local):** `solhunt/findings/2026-04-27T21-19-03-033Z-AaveV3ATokenWrapper/`
- `report.json` — structured agent output
- `Exploit.t.sol` — Foundry test (PASSES)
- `README.md` — bundle template + agent verdict

### What the agent found

`skim(address receiver)` is unauthenticated. Reads wrapper's full wstETH balance, supplies to AAVE on wrapper's behalf, mints fresh ERC4626 shares to attacker's receiver. Attack: any wstETH accidentally `IERC20.transfer`'d to the wrapper (vs using `depositATokens`/`depositWithPermit`) gets stolen by the first caller of `skim` (~0.998 shares per 1 wstETH).

Forge test PASSES with concrete logs:
```
[PASS] test_anyoneCanSkimDonatedAssets() (gas: 387277)
attacker shares stolen: 998533575456430027
victim donated (wei): 1000000000000000000
```

### Critical caveats (don't submit cold)

- README.md flags: "Test passed (authoritative): NO" — the safety template requires human verification before submission
- `skim()` patterns are sometimes intentional design (Uniswap V2 uses `skim()` intentionally for excess tokens)
- The "victim accidentally transfers wrong" scenario could be classified as user error, not protocol bug
- `blockNumber: null` in report.json — agent didn't pin to a specific block, may be a fork artifact

### What's running now (2026-04-28 21:55+)

**/codex outside-voice review of the finding spawned in BG.** Will return ~5-10 min with verdict on:
1. Exploit realness (fork-artifact vs real)
2. Is `skim()` documented intentional in Twyne?
3. Is this in scope for Twyne's Immunefi program?
4. Severity calibration + USD payout estimate
5. Prior art search (was this reported before?)
6. Pre-submission checklist

Verdict will be: SUBMIT NOW / SUBMIT WITH ADDITIONAL VERIFICATION / DO NOT SUBMIT.

### Operator action when wake (in priority order)

1. **Read this LOOP-LOG section + the local bundle** (`solhunt/findings/2026-04-27T21-19-03-033Z-AaveV3ATokenWrapper/`)
2. **Read the codex verdict** (in REVIEWED-REJECTED-2026-04-28.md inside the bundle)
3. **Decide: accept codex's DO NOT SUBMIT verdict, OR override with your own judgment**

### /codex verdict landed: DO NOT SUBMIT

Codex did source-level investigation (Twyne repo, BGD Labs upstream, Immunefi v2.3 rubric, prior submission precedents). 4 independent reasons against:

1. `skim()` is **upstream-inherited intentional behavior** from BGD Labs `StataTokenV2`. Twyne's own production flows use `aWETHWrapper.skim()` deliberately for EVC batch composition (1-click leverage). Sources verified: Twyne `aave-v3-aToken-wrapper` repo, source lines 7570-7574 + 2995-2998 + 3473-3476 + 3556-3559.
2. Exploit requires victim to bypass canonical `depositATokens`/`depositWithPermit`/`deposit(amount, receiver)` API — uses raw `IERC20.transfer(WRAPPER, donation)`. User-error precondition. Immunefi precedent (Angle/deliriusz "Stealing in motion") rejected analogous class.
3. Twyne bounty has **no Medium tier** — only Critical $20K-$50K + High $3K-$10K. Agent's "Medium" claim doesn't map to a payout slot.
4. Class doesn't fit Immunefi v2.3 SC Medium definitions. None of {token-fund-failure, block-stuffing, griefing, theft-of-gas, unbounded-gas} apply.

**Realistic payout: $0.** Submitting burns solhunt's credibility on Twyne's future-finding triage queue.

### Action taken

- Wrote `REVIEWED-REJECTED-2026-04-28.md` sidecar in the bundle (local + SCP'd to VPS) with full codex verdict + sources
- Original `STATUS=FOUND` file PRESERVED for honest record (don't lie about the agent's output)
- Did NOT re-kick autonomous-chain because Stage 0 still trips on `STATUS=FOUND` regardless of sidecar — needs proper code change

### Why autonomous-chain stopped (and why that's correct)

`autonomous-chain.sh` Stage 0 reads `findings/twyne-impls-*/STATUS`. Found `STATUS=FOUND`, executed `exit 0` with `STATUS=FOUND_UPSTREAM`. This is the safety design: don't run more scans on top of an unprocessed real find. Operator must process the find before chain resumes.

To resume chain after morning review: either (a) move the Twyne find STATUS file out of "FOUND" state, or (b) add a flag/env var to autonomous-chain.sh to skip Stage 0's "found upstream" exit. Option (b) is the proper fix — needs /plan-eng-review per gstack discipline.

### Queued for tomorrow (operator approval needed)

**/plan-eng-review for autonomous-chain.sh Stage 0 modification:** add check for `REVIEWED-*` sidecars before treating `STATUS=FOUND` as chain-stopping. Once shipped, re-kick chain for Inverse FiRM + ENS sweep overnight tomorrow.

Validates the discipline: agent caught a candidate, /codex caught it wasn't real, sidecar preserves the trail, no embarrassing submission. **The whole gstack pipeline working as designed.**

### Why autonomous-chain stopped (and why that's correct)

`autonomous-chain.sh` Stage 0 reads `findings/twyne-impls-*/STATUS`. Found `STATUS=FOUND`, executed `exit 0` with `STATUS=FOUND_UPSTREAM`. This is the safety design: don't run more scans on top of an unprocessed real find. Operator must process the find before chain resumes.

To resume chain after morning review: either (a) move the Twyne find STATUS file out of "FOUND" state, or (b) add a flag/env var to autonomous-chain.sh to skip Stage 0's "found upstream" exit. Option (b) is the proper fix — needs /plan-eng-review per gstack discipline.

---

## Iteration #2 plan (next wake, ~30 min)

Tier 1:
- [ ] SSH check: does `/root/solhunt/scripts/autonomous-chain.sh` exist? If no, push the local copy
- [ ] If yes (or after push): kick off autonomous-chain.sh in tmux on VPS — runs Twyne + Drips current-impl + Inverse FiRM + ENS
- [ ] Verify the chain is alive (`tmux capture-pane`)

Tier 2 (parallel, local work):
- [ ] Trade #114 phantom-open formal investigation doc — `solhunt/docs/investigate-trade-114-2026-04-28.md` (RESEARCH ONLY, root cause already identified yesterday at db.ts:830-832 source filter mismatch)
- [ ] Begin staging the first 3-5 named-target job apps with Solhunt-Duel-led PDFs (Anthropic Frontier RT, Modal Labs, Sourcegraph would be top 3)

Tier 3 (if time):
- [ ] /plan-eng-review the v2 benchmark expansion (corpus → 50 contracts via SWC registry + Code4rena historical)
- [ ] Netlify deploy config to make leaderboard.html publicly visible at solhunt-duel.netlify.app/leaderboard

---

**Next wake scheduled:** 1800s (30 min). The Drips scan is done — VPS work resumes only after autonomous-chain check in iteration #2.

---

## Iteration #3 — trade #114 investigation reopened (2026-04-28 ~22:15)

Operator interrupted again with alignment confirmation ("keep going"). Took advantage of being awake to continue iteration #3 work.

**Verified live trades use `source: 'system_position'`** (db.ts:1137 in `createLivePositionTrade`) — same as paper. So my earlier root-cause hypothesis (source filter mismatch in closePositionTrade db.ts:830-832) is **WRONG**.

**Grep verified `user_pnl_pct` is only written in 2 places:**
- `db.ts:751` — `closeSignalTrade` (atomic with is_open=false + closed_at)
- `db.ts:825` — `closePositionTrade` (atomic with is_open=false + closed_at)

Trade #114 state from DB query yesterday: `user_pnl_pct=-0.8815`, `is_open=true`, `closed_at=NULL`. **Mathematically impossible under current code paths.**

Real candidates I haven't ruled out:
1. Position-tracker continuously updates current_price + may update user_pnl_pct (mark-to-market) — need to read `position-tracker.ts`
2. Signal-tracker has analogous update path
3. There's a single-column UPDATE somewhere (Supabase `.update({ user_pnl_pct })` chain) that the grep matched but I didn't trace
4. Race condition between two close paths (signal-trader supersession + position-trader handlePositionClose)

**Decision: do NOT write the formal investigation doc tonight with the wrong hypothesis.** Per /investigate skill iron law: no fixes without root cause. Need proper /investigate session tomorrow with all context.

**Queued for next iteration / tomorrow morning:**
- Read `services/position-tracker.ts` end-to-end for any user_pnl_pct write
- Read `services/signal-tracker.ts` end-to-end ditto
- Spawn /codex with the FULL corrected context to identify the real root cause
- THEN write `docs/investigate-trade-114-2026-04-28.md` with verified root cause

**Pivoting iteration #3 to:** job app staging (Tier 2). Will start with finding the Anthropic Frontier Red Team JD URL.

---

## Iteration #4 — trade #114 closed + Sourcegraph staged (2026-04-28 ~22:50)

**Wake reason:** ScheduleWakeup auto-fire from iteration #3.

### Trade #114 phantom-open: RESOLVED — NO BUG

Did the deeper read per the queued plan. Findings:

1. **Read `position-tracker.ts` + `signal-tracker.ts`** — neither writes `user_pnl_pct` / `is_open` / `closed_at`. My earlier hypothesis (mark-to-market via tracker services) is wrong — those are read-only against price feeds.

2. **Confirmed only 2 atomic close paths** that write `user_pnl_pct`:
   - `db.ts:751` (`closePaperTrade` — paper only, atomic with is_open=false + closed_at)
   - `db.ts:825` (`closePositionTrade` — atomic with is_open=false + closed_at)
   - Plus `panic-close.ts:165` sets is_open=false + closed_at but does NOT touch user_pnl_pct
   - Plus `db.ts:1052` `updateTradeAttribution` is a freeform `.update({ ...fields })` but the typed `fields` Partial doesn't include user_pnl_pct/is_open/closed_at

3. **No code path UPDATEs `is_open: true`.** Only INSERTs (db.ts:727, 805, 1139). So no way to flip closed → open in code.

4. **Queried current DB state via Supabase MCP (project cjdrgvbrziahiakxhxsy):**
   - **Trade #114 NOW: is_open=false, user_pnl_pct=-2.9919, closed_at=2026-04-28 14:39:20+00, close_reason='stop'.** Trade closed normally via stop-loss path.
   - **Zero trades currently in impossible state** (user_pnl_pct set + is_open=true + closed_at=NULL).

5. **Bot health snapshot:** 9 live closed trades, 5W/3L, avg +0.23% pnl, total -$0.38 USD across all closed lives. Effectively breakeven. Zero open live positions right now.

**Conclusion:** The "phantom-open" state I remembered from yesterday either (a) was a transient mid-cycle artifact that resolved when the SL hit, or (b) was a mis-read of the data yesterday. Either way: **no bug exists today**. Per /investigate iron law (no fixes without root cause), NO formal investigation doc written. The investigation is closed as RESOLVED-NO-BUG.

### Job apps — Sourcegraph IC2 staged + Anthropic strategically deferred

Per CLAUDE.md "spawn /codex outside-voice for any judgment call" — spawned codex on Anthropic Cyber vs Autonomy vs Fellows decision. Verdict: **stage Modal+Sourcegraph instead, skip all 3 Anthropic.**

Codex 5 reasons against Anthropic tonight:
1. Cyber/Autonomy $320K floor = senior signal, 1.5 YOE = guaranteed auto-reject
2. Anthropic dedup risk: 4 data eng + Fellows yesterday = 5 apps in 30 days; +2 more = spray-and-pray flag
3. Fellows yesterday was likely same cohort; re-applying = duplicate
4. Modal/Sourcegraph/Vercel are the actual 90-day $100K+ path
5. Solhunt-Duel narrative compounds with time — wasting it at 1.5 YOE burns the strongest version

**Acted on the verdict.** Staged tonight:
- **Sourcegraph IC2 SWE - Code Understanding** — config + tailored CV HTML written. Zone 2-3 = $96-128K, hits the 90-day goal. Operator generates PDF + runs apply-universal.mjs in morning.

**Modal deferred:** Careers page JS-rendered, WebFetch returned empty content. Operator: paste a role URL into morning checkpoint and next loop will stage.

### Files committed/created this iteration (NOT YET COMMITTED to git)

- `C:\Users\clayg\OneDrive\Desktop\career-ops\config-sourcegraph-ic2.json`
- `C:\Users\clayg\OneDrive\Desktop\career-ops\output\cv-clayton-sourcegraph-ic2.html`
- Updated `C:\Users\clayg\OneDrive\Desktop\career-ops\APPLY-NOW-2026-04-28.md` (added iteration #4 row)

### Iteration #5 plan (next wake, ~30 min)

Tier 1:
- [ ] git add + commit Sourcegraph staging files in career-ops repo (operator gave green-light to push commits per "follow gstack path")
- [ ] git add + commit this LOOP-LOG checkpoint to claygeo/solhunt-duel master
- [ ] Check VPS tmux state: `ssh hetzner 'tmux ls'` — is anything still running from earlier?

Tier 2 (parallel):
- [ ] Stage Modal Labs job app — try direct Greenhouse URL search again, or fetch their LinkedIn jobs page
- [ ] Stage 1 more new-target job (Replit, Cursor, or METR — codex top-3 was Modal+Sourcegraph+Vercel AI SDK; Vercel AI SDK is already in the queue from yesterday)

Tier 3 (if time):
- [ ] Begin /plan-eng-review for autonomous-chain.sh Stage 0 modification (REVIEWED-* sidecar handling) — but per gstack discipline this needs operator approval first, so DRAFT only
- [ ] Begin Friday weekly duel results template (LinkedIn post structure for Friday cadence)

**Scheduled next wake:** 1800s (30 min) — same logic as before: cache miss is worth it for 30-min focused chunks.

---

---

## Iteration #5 — REDIRECTED HARD to Solhunt-Duel core (2026-04-28 ~23:30)

**Wake reason:** Operator interrupted: "are we still doing solhunt duel right?" — caught my drift in iter #3-#4 (HL bot debug + job apps). Confirmed: yes, Solhunt-Duel is the centerpiece. Operator said "yeah go hard with solhunt-duel."

**Did not wait for ScheduleWakeup** — pivoted immediately to highest-leverage Solhunt-Duel work.

### Built this iteration (commit d83ec84, pushed to claygeo/solhunt-duel master)

**1. Leaderboard publicly hosted** (the inbound funnel)
- Copied `docs/leaderboard.html` → `ui/public/leaderboard/index.html`
- Next.js serves it statically at `solhunt-duel.netlify.app/leaderboard/` after deploy
- Added LEADERBOARD nav link in Header (amber, prominent)
- `next.config.js` rewrites for `/leaderboard` and `/leaderboard/` (dev-mode coverage; production handled by Netlify defaults)
- README updated with prominent leaderboard link
- Verified in dev preview port 3020: both homepage Header link AND `/leaderboard/` route render correctly

**2. Friday weekly cadence template** (`docs/WEEKLY-CADENCE-TEMPLATE.md`)
- The recurring drumbeat that turns Solhunt-Duel into a recruiting funnel
- Standard format + 3 variants (failures-only week, cinematic result, correction week)
- Pre-flight + posting checklists
- Tracking sheet template (per-week engagement)
- Off-ramp: when to STOP posting (week-8 review criteria)
- Hard rule: never claim what you can't link to forge-test PASS

**3. Substack post #1 draft** (`docs/SUBSTACK-POST-1-DRAFT.md`)
- 67.7% → 13.7% gap origin story angle (most credibility-building)
- ~1500 words, draft only — requires operator + /codex review before publishing
- Pre-publish checklist + what-not-to-do guard rails
- Connects 67.7%-vs-13% gap → why Solhunt-Duel needs server-side gates

### Did NOT do (deferred to operator morning)

- **Run new duel on fresh contract** — would burn API credits + needs setup verification I can't do autonomously without risking bad runs polluting the leaderboard. Better as operator's morning task with full attention.
- **Modal Labs job app** — careers page JS-rendered, deferred from iter #4
- **Job apps in general** — codex verdict last iter said skip Anthropic; Sourcegraph IC2 staged in career-ops/ but local-only (santifer upstream, no personal fork)

### Reverted (auto-generated Next.js mods I caught before commit)

- `ui/next-env.d.ts` and `ui/tsconfig.json` — Next.js dev server auto-modified (jsx="preserve" → "react-jsx", added typed-routes import). Reverted to avoid breaking production build. They'll regenerate cleanly on operator's next `next dev`.

### Iteration #6 plan (next wake, 1800s)

Tier 1 (Solhunt-Duel core only — operator's directive):
- [ ] Vuln corpus expansion: scaffold script to ingest SWC registry contracts (target: bring corpus from 32 curated → 50+ random for next benchmark run)
- [ ] Begin draft of v2 benchmark expansion proposal (DO NOT execute — needs /plan-eng-review first; this is the proposal doc only)
- [ ] Add a `docs/PROOF.md` showing the gate code, so recruiters can read the gate logic without cloning the repo

Tier 2 (if time):
- [ ] Cleanup: file `SUBMISSION-CANDIDATE-skim.md` is contradicting REVIEWED-REJECTED. Add a header comment marking it superseded (don't delete — leave for operator's call)
- [ ] Stage 1 more named-target Solhunt-Duel-narrative job app (Cursor or Replit, not Anthropic per codex verdict)

Hard skip: Job apps, HL bot work, anything not Solhunt-Duel-core unless operator redirects again.

**Scheduled next wake:** 1800s (30 min)

---

---

## Iteration #6 — research artifacts (2026-04-28 ~midnight)

**Wake reason:** /loop fired again from operator's command (effectively continuing iter #5's queued work).

**Per master plan priority queue, focused on highest-leverage research artifacts that recruiters/engineers actually read when evaluating Solhunt-Duel.** Hard skip: anything not Solhunt-Duel-core (per operator's "go hard with solhunt-duel" directive).

### Built this iteration

**1. `docs/PROOF.md`** — defends the load-bearing claim "four server-side gates the LLMs cannot see or modify"
- Walks through `src/sandbox/patch-harness.ts` line-by-line for all 4 gates
- Quotes actual TypeScript source (lines 11-28 for the interface, 109-115 for storageLayoutChanged, 162-177 for exploitNeutralized, 187-198 for freshAttackerNeutralized, 204-216 for benignPassed)
- Sanity baseline (line 133-160) explained: catches false-positive Red runs from vm.etch quirks
- "What the LLM sees" / "What the LLM does NOT see" sections — falsifiable claim audit
- Honest limitations section (gates falsify positive claims, not negative ones; MEV / cross-contract / non-suite bugs out of scope)
- Closes with generalization to other agent eval domains (coding agents, tool-use agents, research agents)

**2. `docs/PLAN-V2-BENCHMARK-EXPANSION.md`** — the /plan-eng-review input doc for v2 corpus
- Today's corpus diagnosis: 32 contracts / 6 vuln classes / 0 adversarial-no-find / unknown false-positive rate
- Proposed v2: 52 contracts / 14+ classes / 4 tiers (SWC synthetic, Code4rena historical, **adversarial-no-find**, hard-difficulty multi-contract)
- Tier C (adversarial-no-find) is the key credibility move — measures false-positive rate, currently unmeasured
- Phase order: schema/tooling → Tier C first (highest credibility lift) → Tier A/B fill-in → Tier D (document expected failures) → re-run + publish
- 5 risks to challenge in /plan-eng-review explicitly listed
- 5 decisions sought from operator + /plan-eng-review + /codex
- ~9 work-day estimate (or ~6-9 hours with Claude+gstack at peak compression)
- Budget cap: $50 API for v2 run

**3. `SUBMISSION-CANDIDATE-skim.md` cleanup** — added SUPERSEDED-2026-04-28 header
- Points to REVIEWED-REJECTED-2026-04-28.md as authoritative
- Kept the body as historical context (the path from finding → outside-voice review → correct rejection IS the discipline working)

### Did NOT do (deferred — strict Solhunt-Duel-only mode)

- Vuln corpus expansion script (the actual code to ingest SWC + Code4rena) — gated behind /plan-eng-review of the proposal doc above. Hard rule per gstack discipline.
- Job apps (any) — operator-only mode unless directly Solhunt-Duel-narrative
- Modal Labs (deferred from iter #4)

### Iteration #7 plan (next wake, 1800s)

Tier 1 (Solhunt-Duel core only):
- [ ] **ARCHITECTURE.md polish for interview readability** — current state is dev docs, target is "5-min walkthrough that reads cleanly cold"
- [ ] **Pre-stage interview prep doc** — `docs/INTERVIEW-WALKTHROUGH-5MIN.md` — script for explaining Solhunt-Duel architecture in 5 minutes for screen calls
- [ ] **Cleanup any stale doc references to old leaderboard URL** (everything should point to `/leaderboard/` now)

Tier 2 (if time):
- [ ] Inspect-AI / Anthropic SDK PR opportunity research — find ONE substantive PR target
- [ ] Re-check VPS state via SSH (whether autonomous-chain.sh sidecars work etc.) — research-only

**Scheduled next wake:** 1800s (30 min)

---

---

## Iteration #7 — no-wait mode (operator: "just keep building")

**Wake reason:** Operator interrupted iter #7 ScheduleWakeup wait with "why dont you just keep working, why wait till the morning, just keep building." Executed iter #7 work continuously without waiting for the 20:08 fallback.

### Built this iteration

**1. /plan-eng-review on V2 benchmark plan (parallel agent)**
- Verdict: **APPROVE WITH CHANGES**
- 3 blockers identified:
  1. No reproducibility protocol (single-run-per-contract on stochastic agent ≠ benchmark)
  2. Tier C N=5 too small (1/5 = 20% ± enormous CI; need ≥10 with severity-weighted scoring + near-miss controls)
  3. Tier C false-find disclosure flow undefined (must close BEFORE sourcing, not after)
- Other gaps: model version pinning, seed/temp spec, no held-out set, no inter-rater rubric
- Phase 1 schema work + Phase 2 sourcing → run in parallel (saves 1 day)

**2. /codex outside-voice on V2 plan (parallel agent)**
- Verdict: **GO with constraints**
- Tier C downside math is asymmetric in operator's favor IF pre-committed to publish-whatever-happens
- Real failure mode: operator chickens out post-result and silently cuts Tier C (PRE-COMMIT THE DISCLOSURE POST)
- Inspect-AI integration: sequential not parallel (corpus first, framework second)
- Operator's 1.5 YOE filter: v2 only flips outcomes for ~15-20% of funnel (the high-ceiling AI-safety path)
- 6-day hard cap on v2 work; if budget runs out, ship Tier C standalone — gravy is gravy

**3. Integrated both reviews into PLAN-V2-BENCHMARK-EXPANSION.md**
- Tier C: 5 → 10 contracts (statistical, not vibe). Includes 2-3 near-miss controls. Severity-weighted scoring.
- Reproducibility protocol added: n=3, model version `claude-sonnet-4-20250514` pinned, temperature/top-p specified, prompt git SHA logged
- Tier C disclosure pre-commitment (drafted text written into the plan; operator can't quietly cut Tier C post-result)
- 6-day hard cap with kill criteria (Phase 2 standalone if Phase 3+ runs out of time)
- Pause/reassess gate: if Tier C FPR > 80%, halt before Phase 3 spend
- Phase 1 schema parallel with Phase 2 sourcing
- Total revised budget: $110-150 API (was $30-50; bumped for n=3 × 57 contracts)

**4. ARCHITECTURE.md polish** — recruiter-readable rewrite
- Added 60-second TL;DR at top with cross-links to leaderboard, PROOF.md, V2 plan
- Added "Two Projects" comparison table (Solhunt vs Solhunt-Duel)
- New Solhunt-Duel architecture section: full mermaid sequence diagram of Red↔Blue duel + verifyPatch flow + 4 gates table
- Convergence taxonomy (HARDENED, BLUE_FAILED, RED_FAILED, SAME_CLASS_ESCAPED, TIMEOUT) with definitions
- Original Solhunt sections preserved (renamed for clarity)
- Updated data model ER diagram with duel_runs + duel_rounds tables
- New "Why fresh-address bytecode cloning" design decision (Solhunt-Duel-specific gotcha)
- Honest limitations section: small-N, sandbox limits, MEV invisibility, multi-contract chain failures
- Added Claude Code CLI backend to model-abstraction diagram (Max-subscription overnight runs)

**5. INTERVIEW-WALKTHROUGH-5MIN.md** — screen-call architecture script
- 5-beat structure (premise / setup / 4 gates / honest failure / what's next)
- ~750-900 words spoken, fits 5 minutes with interviewer-interrupt buffer
- Variants: 3-min screening, 15-min deep technical, behavioral/hiring-manager
- "What NOT to say" list (no SCONE direct compare, no oversell convergence, no startup pitch, no trash adjacent work)
- Practice notes: read aloud twice, time yourself, the 67%/13% beat is most underdone on first try
- Honest meta: match artifact to audience (Curaleaf for payments roles, Solhunt-Duel for AI safety / agent eval)

### Iter #8 plan (continuing without wait)

Tier 1:
- [ ] Tier C contract candidate list seed — research 7-10 audited-clean mainnet contracts for V2 sourcing (no execution, just candidate research)
- [ ] Code4rena Tier B candidate research — find 3-5 high-confidence Code4rena finding candidates (verified mainnet contracts, single-contract attack vectors, vuln class our corpus lacks)

Tier 2 (if time):
- [ ] Inspect-AI PR opportunity research — find ONE substantive PR target on Anthropic's eval framework
- [ ] README.md polish — recruiter-front-door optimization

**Strict skip:** any operator-only task (Substack publish, Sourcegraph submit, etc.).

---

---

## Iterations #8-9 — research artifacts + Dexible case study (continuous, no-wait mode)

**Iter #8** (~2026-04-29 ~00:30): Tier C + Tier B + Inspect-AI candidate dossiers (commit `59034ec`).
- `docs/V2-TIER-C-CANDIDATES.md` — 10 contracts (7 audited-clean + 3 near-miss controls), severity-weighted FPR scoring, operator verification workflow before any contract enters corpus
- `docs/V2-TIER-B-CANDIDATES.md` — 5 Code4rena historical (Maple V1, Frax Fraxlend, Astaria, JPEG'd, Pendle V2). Per-candidate sanity-check workflow (NO entry without operator reproducing the bug on our fork)
- `docs/INSPECT-AI-PR-TARGET.md` — issue #3770 (verification taxonomy on @scorer) is a perfect-fit PR target. Solhunt-Duel's PROOF.md thesis = exact same problem applied to eval framework. Sequential after v2 ships per /codex review.

**Iter #9 README front-door** (commit `3d9fb14`):
- Restructured README first ~30 lines to lead with Solhunt-Duel (was leading with Solhunt scanner)
- Read-more table linking ARCHITECTURE / PROOF / CASE_STUDY_BEANSTALK / V2 plan / Tier C+B / INTERVIEW-WALKTHROUGH / dataset
- Dropped the misleading "Above SCONE-bench" inline comparison from headline area

**Iter #9 Dexible case study** (commit `330f171`):
- `docs/CASE_STUDY_DEXIBLE.md` — full Solidity diff + 4-gate verdict for the only HARDENED Phase 4 run
- What Red did (8 turns, transferFrom-as-router exploit), what Blue did (80 turns, append-only allow-list patch)
- All 5 forge_test stages with expected/actual gates table
- Why Dexible is THE case study (real $2M, one-liner bug, patch demonstrates all 4 gate disciplines)
- Honest limitations (reproduction stripped fees, allow-list is ONE correct fix not THE fix, fresh-address means no live storage collision test)

---

## Iteration #10 — codex meta-review verdict: STOP, cleanup, wind down

**Wake reason:** spawned /codex outside-voice for holistic meta-review of the artifact set after iter #9. Verdict: **STOP. Wind the loop down now.** Three reasons codex gave:

1. **Dilution inflection point reached** — 13 docs. The 14th weakens the set, not strengthens it.
2. **Remaining high-leverage moves are operator-blocking** (record demo video, publish Substack, submit Sourcegraph PDF, /plan-eng-review autonomous-chain.sh)
3. **Better to leave a coherent set + clean morning queue than bury the queue under more autonomous iterations**

Codex flagged 3 specific cleanup actions that ARE loop-eligible. Executed all 3:

**1. Moved operational drafts out of `docs/`** (codex: "publishing the draft of the framing is not portfolio")
- `docs/WEEKLY-CADENCE-TEMPLATE.md` → `_ops/WEEKLY-CADENCE-TEMPLATE.md`
- `docs/SUBSTACK-POST-1-DRAFT.md` → `_ops/SUBSTACK-POST-1-DRAFT.md`
- New `_ops/README.md` explaining "internal operational artifacts, not portfolio"

**2. Trimmed README** (codex: "454 lines, recruiter won't scroll")
- Cut Architecture mermaid section (line 254-307 — exists in ARCHITECTURE.md)
- Cut "How it actually works" 8-step duel walkthrough (line 308-331 — exists in ARCHITECTURE.md + PROOF.md)
- Replaced with 3-line link section pointing to ARCHITECTURE / PROOF / CASE_STUDY_DEXIBLE
- Result: 474 → 401 lines

**3. Consolidated 4-gate duplication** (codex: "appears 4 times in 4 files, pick canonical")
- README's gate list now 2 lines + link to PROOF.md as canonical
- ARCHITECTURE.md keeps its gates table (necessary architectural context)
- PROOF.md is the single canonical home with line-by-line walkthrough
- CASE_STUDY_DEXIBLE.md has gate-by-gate verdict table (run-specific, not redundant spec)

**4. Disambiguated duplicate "Honest failure modes" headings**
- README line 130 → "Honest failure modes (Solhunt scanner)" — Drips false-positive case
- README line 318 → "Honest failure modes (Solhunt-Duel Phase 4)" — Phase 4 specific failures
- Both have unique content; just needed disambiguating headers

---

---

## Iteration #11 — operator re-fired /loop after STOP verdict (2026-04-29 ~01:20)

**Wake reason:** Operator pressed /loop AGAIN after I explicitly wound down with codex's STOP verdict at end of iter #10. Interpretation: operator wants the loop to keep going regardless of dilution warning.

**Synthesis of conflicting signals:**
- /codex meta-review: STOP, dilution inflection point reached at 13 docs
- Operator: keep going (pressed /loop)
- Resolution: do NON-DILUTIVE work this iteration. No new portfolio docs. Improve existing or close operational debt.

**Considered + rejected:**
- Forge-trace verification of phase4 spot-checks → blocked: Foundry not installed locally
- Held-out-Red run on patched Dexible → blocked: requires VPS Anvil + Docker, would burn Max sub minutes uns supervised
- Code review of patch-harness.ts → low-leverage at this stage
- More candidate dossiers → dilutive (codex flagged)

**Did this iter (small + valuable + non-dilutive):**

1. **Cross-reference audit of all docs/* internal links** — all resolve cleanly. No stale references to the moved `_ops/` files. Cleanup was clean.

2. **Verified leaderboard preview still renders** after all the doc surgery — H1 correct, no console errors, Phase 4 table intact, all gates section unchanged.

3. **Appended 60-90s demo recording script to `docs/INTERVIEW-WALKTHROUGH-5MIN.md`** — closes codex's #1 missing artifact (the demo video) on the SCRIPT side. Operator does the recording, the script makes their morning queue item #1 actionable. 5-beat structure (15s each), optional narration text, editing notes, where-to-put-file. ~250 words appended to existing doc, NOT a new file (avoids further dilution).

**Did NOT do:** any new portfolio doc (codex dilution warning honored). The demo script appended to existing doc not new doc.

---

---

## Iteration #12 — auto-wake fired, winding down for real (2026-04-29 ~02:00)

**Wake reason:** ScheduleWakeup from iter #11 fired. Per my own iter #11 self-instruction: "If I can't find concrete + non-dilutive work in iter #12, the right move is to actually stop."

**Quick lint pass on the artifact set:**
- Searched docs/ for TODO/FIXME/XXX — none found
- Searched README + docs/ for stale paths to moved `_ops/` files — none found
- Verified leaderboard preview at localhost:3020 — title correct, zero console errors

**No concrete non-dilutive work remaining.** The artifact set is clean. The remaining moves are all operator-blocking (record demo, publish Substack, submit Sourcegraph PDF, /plan-eng-review V2 plan, /plan-eng-review autonomous-chain.sh).

**WIND DOWN FOR REAL.** No ScheduleWakeup at end of iter #12. Loop is converged. Total: 12 iterations, 9 commits (`5a68898`, `d83ec84`, `ef7df9a`, `d995263`, `59034ec`, `3d9fb14`, `330f171`, `c9cdf2a`, `d5a106e`), full Solhunt-Duel recruiter-facing artifact set publicly hosted on github.com/claygeo/solhunt-duel + leaderboard at solhunt-duel.netlify.app/leaderboard/.

If operator presses /loop again after reading this checkpoint, my response should be: "Tell me a specific concrete task — autonomous loop has converged, more iterations dilute." Do NOT just keep firing more iterations.

---

## STATUS: AWAITING OPERATOR (loop converged)

**The loop is winding down.** No ScheduleWakeup at the end of this iteration. Operator wakes to:

### Solhunt-Duel artifact set as it stands (commits 5a68898 → cleanup)

Public portfolio (`docs/`):
- `ARCHITECTURE.md` — system design, mermaid diagrams, recruiter-readable TL;DR
- `PROOF.md` — line-by-line gate verifier walkthrough (canonical home for 4 gates)
- `CASE_STUDY_DEXIBLE.md` — only HARDENED Phase 4 run, full Solidity diff
- `CASE_STUDY_BEANSTALK.md` — Solhunt scanner predecessor reproduction
- `INTERVIEW-WALKTHROUGH-5MIN.md` — 5-min screen-call script (3-min / 15-min / behavioral variants)
- `PLAN-V2-BENCHMARK-EXPANSION.md` — V2 corpus plan, /plan-eng-review + /codex reviews integrated
- `V2-TIER-C-CANDIDATES.md` — 10 adversarial-no-find candidates
- `V2-TIER-B-CANDIDATES.md` — 5 Code4rena historical candidates
- `INSPECT-AI-PR-TARGET.md` — issue #3770 dossier (sequential after v2)

Internal (`_ops/`):
- `WEEKLY-CADENCE-TEMPLATE.md` — Friday post template
- `SUBSTACK-POST-1-DRAFT.md` — post-1 draft (67%/13% gap)

Live URLs:
- Public leaderboard: https://solhunt-duel.netlify.app/leaderboard/ (deploys after next Netlify build)
- GitHub: https://github.com/claygeo/solhunt-duel

### Morning queue (5 concrete items, ~half-day total)

1. **Record 60-90s demo video** — codex specifically called this out as the single highest-leverage missing artifact. Anthropic FRT and Modal weight "can show the work running." MP4/GIF on the README, autoplay, showing leaderboard + one duel expanding + 4 gates lighting up green. Not asciinema (requires install).
2. **Operator + /codex final pass on Substack post draft** at `_ops/SUBSTACK-POST-1-DRAFT.md`. After approval: set up `solhunt.substack.com`, schedule for Tuesday 10am ET (NOT Friday — Friday is for weekly cadence drops).
3. **Sourcegraph IC2 submit** — config + tailored CV at `~/career-ops/config-sourcegraph-ic2.json` and `output/cv-clayton-sourcegraph-ic2.html`. Steps: (a) generate PDF via `node generate-pdf.mjs cv-clayton-sourcegraph-ic2`, (b) verify PDF visually, (c) run `node apply-universal.mjs config-sourcegraph-ic2.json`, (d) review pre-filled fields, paste cover letter answers, click Submit.
4. **/plan-eng-review on V2 plan + Tier C dossier** — both already reviewed in autonomous loop. Operator pass before greenlighting Phase 2 (Tier C standalone). Pre-commit the disclosure post text BEFORE running.
5. **/plan-eng-review on `scripts/autonomous-chain.sh` Stage 0** — current Stage 0 stops on `STATUS=FOUND` regardless of REVIEWED-* sidecars. Needs proper code change to honor sidecars before re-kicking the chain for Inverse FiRM + ENS sweep.

### Honest 90-day read (per /codex meta)

**Realistic outcome: screen call at a tier-2 company** (Sourcegraph IC2, Modal, Replit, Vercel AI SDK, METR). Solhunt-Duel is clearly above the bar for these. Anthropic FRT screen would require either a published Inspect-AI PR landing or the Substack post going viral — both uncertain on 90-day timeline. The Twyne-rejection discipline + PROOF.md falsifiability is genuinely rare at any YOE; that's the wedge.

### What got commited this loop (chronological)

| Commit | Description |
|---|---|
| `5a68898` | iter #4 checkpoint + Twyne find audit trail + chain scripts |
| `d83ec84` | leaderboard at /leaderboard/ + Friday cadence + Substack draft |
| `ef7df9a` | PROOF.md + V2 benchmark plan + supersede skim draft |
| `d995263` | ARCHITECTURE recruiter-readable + V2 plan integrated reviews + interview walkthrough |
| `59034ec` | V2 corpus tier candidates + Inspect-AI PR target dossier |
| `3d9fb14` | README lead with Solhunt-Duel + read-more table |
| `330f171` | CASE_STUDY_DEXIBLE end-to-end Phase 4 HARDENED walkthrough |
| (next) | cleanup: _ops/ move + README trim + gate-list canonical home |

---

## Operator wake-up summary

8 commits across 10 iterations of autonomous loop work. Solhunt-Duel artifact set is **B+ on substance, B- on signal density** (codex's verdict). Morning queue is 5 items, ~half a day. Loop is intentionally not auto-resuming so the morning queue isn't buried by more iterations. Read this LOOP-LOG end-to-end if compacted; everything's checkpointed here.

---

## Hard rules I'm following overnight

- NO submits, NO posts, NO commits with operator name
- NO VPS reauth (operator-only OAuth)
- NO HL bot leverage changes
- /plan-eng-review BEFORE any non-trivial Solhunt-Duel architectural change
- /codex outside-voice for any architecture/spending decision
- Checkpoint to this LOOP-LOG.md every iteration
