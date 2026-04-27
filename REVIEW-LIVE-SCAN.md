# /plan-eng-review — Live-scan operationalization

**Scope reviewed:** `PLAN-LIVE-SCAN.md` + the implementation diff (3 modified, 4 new files).
**Mode:** consolidated review (no per-issue AskUserQuestion — user requested defer-to-/codex on judgment calls).
**Branch:** `master` (solhunt subdir) on parent repo's `feat/richer-run-metadata`.
**Scan in flight:** RepoDriverLogic running in tmux on VPS, started 2026-04-27T19:13:14Z.

---

## Step 0 — Scope Challenge: PASS

Plan does not parallel-build; reuses `runRedTeamViaClaudeCli`, `runPreScanRecon`, Etherscan fetcher, sandbox, fork. Complexity check (8+ files / 2+ classes) does NOT trigger. Boring tech everywhere (Layer 1 / Layer 2). Distribution N/A (internal tool).

---

## Section 1 — Architecture

### 1.A — CRITICAL: In-scope check tied to billing path, not to scanning

**File:** [src/index.ts:174](src/index.ts:174)
```typescript
if (options.viaClaudeCli && target.startsWith("0x")) {
  inScopeMatch = assertInScopeOrAcknowledged(target, options.iAcknowledgeOutOfScope);
```

The hard rail in CLAUDE.md says "Only scan targets currently in scope of an active bounty program." But the allowlist check fires only when `--via-claude-cli` is set. A future invocation like `solhunt scan 0xUNAUTHORIZED --provider openrouter` bypasses it silently.

**Why this matters:** any scan against a non-allowlisted address (regardless of provider) violates the operational policy. Tying safety to billing is an architectural mismatch.

**Recommended fix (v1.1):** lift the in-scope check above the provider branch. Apply it for ANY 0x address scan unless `--i-acknowledge-out-of-scope` is set. ~5 line move.

### 1.B — MEDIUM: ProviderConfig type leak via `as any`

**File:** [src/index.ts:204](src/index.ts:204)
```typescript
providerConfig = {
  provider: "claude-cli" as any,
  model: "claude-opus-4-7",
} as ProviderConfig;
```

The `ProviderConfig.provider` union doesn't include `"claude-cli"`. We're shipping a fake config so the downstream `calculateCost` doesn't crash. Two real consequences:
1. `calculateCost(providerConfig.model, ...)` returns "unknown model" warning at runtime.
2. Future static analysis (e.g., `lint`) won't catch it.

**Recommended fix (v1.1):** add `"claude-cli"` as a real discriminator in `provider.ts`, with a `kind`-based dispatch. Or: don't fake a config — split the dispatch path so the claude-cli branch never touches `providerConfig`.

### 1.C — LOW: Cost tracking misreports for Max subscription

**File:** [src/index.ts:448](src/index.ts:448)
```typescript
totalUSD: calculateCost(providerConfig.model, ...)
```

For `--via-claude-cli`, actual cost is **$0** (Max flat-rate). The notional cost from `claude -p`'s response (`total_cost_usd` field, ~$0.05–5/scan) is what you'd want to log for attention/quota tracking. Right now we throw it away and show "$0.0000" while logging a misleading "unknown model" warning.

**Recommended fix (v1.1):** thread `claudeNotionalCostUsd` from `runRedTeamViaClaudeCli`'s return type (already exists as optional field) into the report JSON under a `notionalCostUsd` field. Don't conflate with `totalUSD`.

### 1.D — MEDIUM: Etherscan returns proxy stub, not impl source, for proxy targets

**File:** [src/ingestion/etherscan.ts] (existing, not in diff)

When `target = 0x770023...` (RepoDriver **proxy**), Etherscan returns `ManagedProxy.sol` + UUPS deps. The actual logic at the impl slot isn't fetched. Dry-run smoke confirmed:
```
Source files: Managed.sol, lib/openzeppelin-contracts/contracts/proxy/utils/UUPSUpgradeable.sol, ...
```
The agent has to manually `cast storage` the EIP-1967 slot, fetch the impl bytecode, and reverse-engineer it. Doable but a 5-10 iteration tax per proxy scan.

**Recommended fix (v1.1):** in `runPreScanRecon`, detect EIP-1967 proxies (slot `0x360894...382bbc`), follow to impl, fetch impl source from Etherscan, attach to recon. Could double the agent's effective context.

The current scan is hitting RepoDriver*Logic* directly (`0xfc446db5...`) so this isn't an issue for tonight, but it'll bite us on the proxy entries in the meta-runner's full sweep.

### 1.E — LOW: Findings-bundle save only fires on --via-claude-cli

**File:** [src/index.ts:461](src/index.ts:461)
```typescript
if (options.viaClaudeCli) {
  // ... write findings/<ts>-<contract>/{report.json,Exploit.t.sol,README.md}
}
```

If a future user runs `solhunt scan 0x... --provider openrouter`, no bundle gets saved. Inconsistent with the goal that "every scan that finds something needs a human-review bundle on disk."

**Recommended fix (v1.1):** lift the bundle save above the provider branch so it fires for every 0x address scan.

### 1.F — LOW (now), MEDIUM (when scaling): Single global staging dir

**File:** [src/agent/loop-via-claude-cli.ts:50](src/agent/loop-via-claude-cli.ts:50)
```typescript
const hostStagingRoot = ... ?? "/workspace/harness-red";
```

Two concurrent scans against this dir would race on the staging cleanup. Not blocking for `SCAN_MODE=single` but bites us if we ever add `--concurrency N` to the meta-runner.

**Recommended fix (v1.1+):** suffix with `scanId` so each scan gets its own dir. The cleanup (just-added) becomes per-scan trivially.

### 1.G — LOW: Meta-runner doesn't write to Supabase

**File:** [scripts/meta-live-scan.sh](scripts/meta-live-scan.sh)

The existing scan flow writes to Supabase (`upsertContract`, `insertScanRun` at [src/index.ts:484](src/index.ts:484)). The meta-runner gets a list of exit codes per contract but no aggregated cross-contract intelligence. For a 12-contract sweep, you'd want a `meta_run` table linking children.

**Recommended fix (v1.2):** add `solhunt meta-scan` as a Node command (replacing the bash script) that writes a `meta_runs` row + child `scan_runs` foreign keys. Deferred — bash works for now.

### Failure modes (Section 1 only)

| Codepath | Realistic failure | Test? | Error handling? | User-visible? |
|---|---|---|---|---|
| In-scope check on billing path | Scan goes out-of-scope via `--provider openrouter` | NO | NO (silent) | NO — **CRITICAL gap** |
| ProviderConfig fake | `calculateCost` returns 0 + warning, hides real notional | NO | partial | yes (log line) |
| Etherscan proxy stub | Agent burns iterations on impl recon | NO | yes (agent prompt covers it) | yes (slow scan) |

---

## Section 2 — Code Quality

### 2.A — MEDIUM: DRY on the scan dispatch

**File:** [src/index.ts:403-428](src/index.ts:403)

Two near-identical `await ...(scanTarget, containerId, sandbox, agentConfig, (iter, tool) => { spinner.text = ... }, collector)` calls differing only by which function gets called. Extract:

```typescript
const runner = options.viaClaudeCli ? runRedTeamViaClaudeCli : runAgent;
agentResult = await runner(scanTarget, containerId, sandbox, agentConfig, onIter, collector);
```

5 lines saved, no readability hit. Boilerplate-grade DRY violation.

### 2.B — LOW: `try/catch` in findings save swallows real errors

**File:** [src/index.ts:462-501](src/index.ts:462)
```typescript
} catch (err: any) {
  console.error(chalk.red(`[findings] save failed: ${err.message}`));
}
```

`err.message` only — stack trace hidden. If the disk is full, perms wrong, or staging dir vanished, debugging requires re-running. At minimum log `err.stack ?? err.message`.

### 2.C — LOW: Magic `300` second offset for staging exploit lookup

**File:** [src/index.ts:489](src/index.ts:489)

Looking for the exploit at `process.env.SOLHUNT_HOST_STAGING_RED ?? process.env.SOLHUNT_HOST_STAGING ?? "/workspace/harness-red"`. The default path is duplicated across `index.ts` (here) and `loop-via-claude-cli.ts:50`. Single source of truth in a constants file.

### 2.D — Existing ASCII diagrams: none touched, none needed yet

No existing diagrams to maintain. The scan-dispatch path is simple enough to skip an ASCII addition for now.

---

## Section 3 — Test Review

### Coverage diagram

```
CODE PATH COVERAGE — diff under review
==========================================
[+] src/safety/in-scope.ts
    │
    ├── isInScope(address)
    │   └── [GAP]         lowercase normalization, exact-match — NO TEST
    │
    ├── listInScope()
    │   └── [GAP]         shape/length sanity — NO TEST
    │
    └── assertInScopeOrAcknowledged(address, ack)
        ├── [GAP]         in-scope happy path — NO TEST
        ├── [GAP]         out-of-scope + ack=true returns null — NO TEST
        └── [GAP] **CRIT** out-of-scope + ack=false throws — NO TEST (the actual safety rail!)

[+] src/index.ts (modified action handler)
    │
    ├── --via-claude-cli + 0x + in-scope target
    │   └── [GAP] [→E2E]  smoke (dry-run) was manual — NO test
    │
    ├── --via-claude-cli + 0x + out-of-scope (no ack)
    │   └── [GAP] **CRIT** must process.exit(1) — NO TEST
    │
    ├── --via-claude-cli + 0x + out-of-scope + ack
    │   └── [GAP]         must log warning, proceed — NO TEST
    │
    ├── --via-claude-cli routes to runRedTeamViaClaudeCli
    │   └── [GAP]         dispatch correctness — NO TEST
    │
    ├── findings save: report.json, Exploit.t.sol, README.md
    │   └── [GAP]         golden-file output — NO TEST
    │
    └── renderFindingReadme(args)
        └── [GAP]         pure function, trivially testable — NO TEST

[+] src/agent/loop-via-claude-cli.ts (staging cleanup fix)
    │
    └── staging dir wipe before seed
        ├── [GAP] **REGRESSION** — this fixed a real bug (Abracadabra leftover). NEEDS regression test.
        └── [GAP]         already-empty dir is a no-op — NO TEST

[+] scripts/meta-live-scan.sh
    │
    ├── SCAN_MODE=single: 1 target only
    │   └── [GAP]         array slice — NO TEST
    │
    ├── stale container reaping
    │   └── [GAP]         awk regex on Status column — NO TEST
    │
    ├── rate-limit grep detection
    │   └── [GAP]         critical safety, NO TEST
    │
    └── found=true detection
        └── [GAP] **CRIT** misclassification = silent submit risk — NO TEST

─────────────────────────────────────────
COVERAGE: 0/14 paths tested (0%)
GAPS: 14 paths need tests
  CRITICAL gaps: 4 (regression + 3 safety paths)
  E2E: 1 (smoke for the full flag pipeline)
─────────────────────────────────────────
```

**REGRESSION (mandatory per Iron Rule):** the staging cleanup at [src/agent/loop-via-claude-cli.ts:60-68](src/agent/loop-via-claude-cli.ts:60) MUST get a regression test. The bug we caught (Abracadabra source leaking into Drips scan) is exactly the kind of cross-target contamination that silently produces false-negative scans. Test should: pre-seed staging with an unrelated `.sol` file, run the seed step, assert that file is gone post-seed.

**Safety-rail gaps (CRITICAL):**
- `assertInScopeOrAcknowledged` happy + sad paths (3 tests, ~20 lines).
- The `--i-acknowledge-out-of-scope` warning emission must be verified (regex match on stderr in an integration test).
- Meta-runner's `found=true` detection — false positive triggers the user-review queue but false negative hides a real find. Both modes need a test fixture.

**Test plan artifact** would normally land at `~/.gstack/projects/solhunt/...` but this skill's bash bits are zsh-tuned and partially failing on Windows bash. Test plan documented inline here.

---

## Section 4 — Performance

No N+1, no DB hot paths in the diff. The scan itself is bounded by claude's tool-call latency (~5-30s/turn) and forge compile time (~5-15s). The 25-min per-contract budget is generous.

**One observation:** `runPreScanRecon` does ~5 `cast` calls sequentially. If we ever bulk-scan, parallelize those (Promise.all) — saves ~10s/contract.

**No performance issues blocking.**

---

## Outside Voice — deferred to scan-completion review

I'll spawn a `/codex` outside-voice subagent on the **findings** (whatever the scan produces) rather than the plan, since the plan is largely sound and the high-leverage second opinion is on whether any "found" exploit is real. That's where adversarial review buys the most.

---

## Required Outputs

### NOT in scope (deferred to v1.1+)

| Item | Why deferred |
|---|---|
| In-scope check applied to all providers (not just claude-cli) | 5-line fix; not blocking tonight's run since we ARE on `--via-claude-cli` |
| ProviderConfig refactor with proper "claude-cli" discriminator | Type fix; doesn't change runtime behavior |
| Notional `claudeNotionalCostUsd` in report JSON | Observability; doesn't affect correctness |
| EIP-1967 impl-source auto-fetch in recon | High-impact for proxy scans but new code, not a fix |
| Findings save lifted out of the `--via-claude-cli` branch | Consistency; doesn't affect tonight |
| Per-scan staging dir | Concurrency prep |
| Supabase `meta_runs` table | Observability for sweeps |
| Test suite for everything in the coverage diagram | 14 tests, ~2-3h of CC time |

### What already exists (reused, not rebuilt)

- `runRedTeamViaClaudeCli()` — the entire claude-p plumbing.
- `runPreScanRecon()` — pre-fetched contract state.
- `fetchContractSource()` — Etherscan integration.
- `SandboxManager`, `ForkManager`, `FoundryProject` — Docker + Anvil + Foundry.
- `DataCollector` + Supabase persistence — all wired.
- `claude-stream.ndjson` schema + `extractLastAssistantText` parser.

The diff does NOT duplicate any of this. Scope discipline is solid.

### TODOS.md proposals (would normally each be an AskUserQuestion)

1. **In-scope check across all providers** — 1.A above. Critical safety. Recommend: build now in v1.1 PR.
2. **Add `"claude-cli"` provider discriminator** — 1.B + 1.C. Recommend: TODOS.md, do in v1.1.
3. **EIP-1967 impl-source auto-fetch** — 1.D. Recommend: TODOS.md, do in v1.2.
4. **Lift findings save out of via-claude-cli branch** — 1.E. Recommend: bundle into the v1.1 PR with item 1.
5. **Per-scan staging dir** — 1.F. Recommend: TODOS.md, do when concurrency comes up.
6. **Supabase `meta_runs` aggregation** — 1.G. Recommend: TODOS.md, defer to v1.2.
7. **Regression test for staging cleanup** — Section 3 Iron Rule. Recommend: critical, do in v1.1.
8. **`assertInScopeOrAcknowledged` test trio** — Section 3. Recommend: critical, do in v1.1.

I'll write these to `TODOS.md` after this review.

### Worktree parallelization

Sequential implementation, no parallelization opportunity. v1.1 is a small focused PR; doesn't warrant worktree fanout.

---

## Completion Summary

- **Step 0:** scope accepted as-is (no reduction needed).
- **Architecture Review:** 7 issues found (1 critical, 2 medium, 4 low).
- **Code Quality Review:** 3 issues found (0 critical, 1 medium, 2 low).
- **Test Review:** coverage diagram produced, 14 gaps identified, 4 CRITICAL (regression + 3 safety paths).
- **Performance Review:** 0 blocking issues.
- **NOT in scope:** written above.
- **What already exists:** written above.
- **TODOS.md:** 8 items to propose (will write after this).
- **Failure modes:** 1 critical gap flagged (in-scope bypass via non-claude-cli provider).
- **Outside voice:** deferred to scan-completion review (higher-leverage moment).
- **Parallelization:** N/A (sequential, small PR).
- **Lake Score:** 7/8 recommendations chose the complete option. The one shortcut: deferring the EIP-1967 auto-fetch to v1.2 (bigger change, not a 30-min job).

**STATUS: DONE_WITH_CONCERNS**

Concerns the user should know about:
1. **In-scope bypass via non-claude-cli provider is a real safety gap.** Not exploited tonight (we're on `--via-claude-cli`), but the next user (or me, distracted, in 6 weeks) could `solhunt scan 0xANY --provider ollama` and hit a non-allowlisted contract. Patch this in v1.1.
2. **Zero test coverage on the new code.** Including the staging-cleanup regression test the Iron Rule requires.
3. **Notional cost reporting is wrong.** Shows $0 + "unknown model" warning instead of the real `claude -p` `total_cost_usd`. Fix in v1.1.

None of these block the running scan. All belong in a v1.1 PR.
