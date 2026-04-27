# TODOS — Solhunt live-scan operationalization

Items deferred from the v1.0 live-scan PR. Each has rationale, pros/cons, and a context block for someone picking it up later.

## P0 (do in v1.1 — small focused PR)

### 1. Lift in-scope check above the provider branch

**What:** Move the `assertInScopeOrAcknowledged` call so it runs for any 0x address scan, not just `--via-claude-cli`. ~5 line change.

**Why:** Today the safety rail only fires on the Max-subscription path. A future invocation like `solhunt scan 0xUNAUTHORIZED --provider openrouter` bypasses it silently. The hard rail is "only scan in-scope Immunefi targets" — that should hold regardless of who's paying.

**Pros:** Closes a real safety gap. Enforces the rule we wrote, not just the rule we coded around the billing path.

**Cons:** None real. Forces every existing OpenRouter scan workflow to add `--i-acknowledge-out-of-scope` if their target isn't in the allowlist. Acceptable.

**Context:** [src/index.ts:174](src/index.ts:174) is where the check lives. It's currently inside `if (options.viaClaudeCli && target.startsWith("0x"))`. Move it above the provider branch (line ~200), keep the `target.startsWith("0x")` guard.

**Depends on:** none.

### 2. Add `"claude-cli"` as a real provider discriminator

**What:** Extend the `ProviderConfig` union (in `src/agent/provider.ts`) to include `"claude-cli"`. Update `calculateCost` in `src/reporter/format.ts` to return notional cost from the `claude -p` JSON output (or `0` for the actual-bill semantics).

**Why:** Today we ship `provider: "claude-cli" as any` to bypass the type system. This causes the runtime warning "unknown model 'claude-opus-4-7'" and forces any future static analysis to skip the new path.

**Pros:** Type safety. Real cost reporting (the `claude -p` JSON gives us `total_cost_usd` for free).

**Cons:** Touches `provider.ts` (existing module) — small blast radius but non-zero.

**Context:** [src/index.ts:204](src/index.ts:204) is the `as any`. The `runRedTeamViaClaudeCli` already returns `claudeNotionalCostUsd` as an optional field — thread that through `agentResult` to `scanResult.cost.notionalUSD`.

**Depends on:** none.

### 3. Lift findings-bundle save out of the `--via-claude-cli` branch

**What:** Save the `findings/<ts>-<contract>/{report.json,Exploit.t.sol,README.md}` bundle for ANY 0x address scan, not just claude-cli. ~3 line move.

**Why:** Inconsistent. The hard rail "never auto-submit, always queue findings for human review" applies regardless of which model produced the report.

**Pros:** Consistency, doesn't add code, just moves the existing block out of an `if`.

**Cons:** None real.

**Context:** [src/index.ts:461-501](src/index.ts:461). The `if (options.viaClaudeCli)` wrap is the only thing keeping it from running on OpenRouter scans.

**Depends on:** none.

### 4. Regression test: staging cleanup wipes prior-target sources

**What:** Test that when `runRedTeamViaClaudeCli` runs against target B after a prior run against target A, no source files from A leak into B's compilation.

**Why:** Iron Rule. The staging-cleanup fix in [src/agent/loop-via-claude-cli.ts:60-68](src/agent/loop-via-claude-cli.ts:60) closed exactly this bug — Abracadabra's `cauldrons/CauldronV4.sol` was leaking into Drips scans and breaking forge compile. Without a regression test, the next refactor of the seed step could silently reintroduce it.

**Pros:** Critical correctness guarantee.

**Cons:** Requires a Docker-bearing test environment. Either gate behind a tag (`vitest test/integration`) or mock the docker exec layer.

**Context:** Pre-seed `/tmp/test-staging/scan/src/leftover.sol`, run the seed step against a fixture target (just inline a small ContractA.sol), assert `/tmp/test-staging/scan/src/leftover.sol` does NOT exist post-seed and `/tmp/test-staging/scan/src/ContractA.sol` does.

**Depends on:** test/ directory conventions in solhunt (already uses vitest).

### 5. Tests for `assertInScopeOrAcknowledged`

**What:** Three trivial unit tests:
- `assertInScopeOrAcknowledged(allowlistedAddr, false)` returns the InScopeTarget object.
- `assertInScopeOrAcknowledged(unknownAddr, false)` throws.
- `assertInScopeOrAcknowledged(unknownAddr, true)` returns `null`.

**Why:** This is the actual safety rail. Zero coverage is unacceptable for code that gates whether we scan a paid bug-bounty target.

**Pros:** ~20 lines of test, catches any future regression in the lowercase normalization, allowlist seeding, or boolean handling.

**Cons:** None.

**Context:** New test file `test/safety/in-scope.test.ts`. Reuse one of the Drips addresses from the allowlist for the happy path.

**Depends on:** none.

## P1 (v1.2 — when the proxy-target sweep matters)

### 6. EIP-1967 impl-source auto-fetch in pre-scan recon

**What:** In `runPreScanRecon`, detect EIP-1967 proxies via `cast storage <addr> 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`. If non-zero, follow to the impl address, fetch its source from Etherscan, attach to recon data.

**Why:** When we scan a proxy address (8 of the 12 Drips contracts are proxies), Etherscan returns the proxy stub source — `ManagedProxy.sol` + UUPS deps — but NOT the actual logic. The agent has to reconstruct the impl manually, costing 5-10 iterations per proxy scan.

**Pros:** Doubles agent's effective context for proxy targets. Especially valuable for the Drips sweep where most targets are proxies.

**Cons:** New code path with its own failure modes (impl unverified on Etherscan, proxy uses non-1967 slot, etc.). Need fallback.

**Context:** [src/sandbox/recon.ts:runPreScanRecon](src/sandbox/recon.ts). Add `proxyImplAddress` to the recon return type. Update `formatReconForPrompt` to surface the impl source as a separate section.

**Depends on:** Etherscan rate limits (already in the existing fetcher).

### 7. Per-scan staging dir

**What:** Replace the global `/workspace/harness-red` default with `/workspace/harness-red/<scanId>`. Each scan gets its own directory.

**Why:** Today, two concurrent scans against the same VPS would race on staging. Not blocking for `SCAN_MODE=single` but bites us when we add `--concurrency N` to the meta-runner for parallel sweeps.

**Pros:** Enables concurrent scans. Cleanup gets simpler (just `rm -rf $stagingDir`).

**Cons:** Need to clean up post-scan to avoid disk fill. ~30s of work.

**Context:** [src/agent/loop-via-claude-cli.ts:50](src/agent/loop-via-claude-cli.ts:50). The `hostStagingRoot` default. Pass `scanId` from the caller.

**Depends on:** none. The cleanup we just added simplifies this.

### 8. Supabase `meta_runs` table

**What:** Convert `scripts/meta-live-scan.sh` to `solhunt meta-scan` (a Node command). On run, insert a `meta_runs` row; per-contract scans foreign-key to it. Cross-scan analytics ("how does our hit rate look across the Drips sweep?") become trivial.

**Why:** The bash meta-runner has no aggregation. Each scan writes its own `scan_runs` row but nothing ties them together. For a 12-contract sweep, that's 12 disconnected rows.

**Pros:** Better analytics, cleaner UX, fewer moving parts (no bash + Node hybrid).

**Cons:** ~150 lines of code. Bash works for now. Not blocking.

**Context:** New `src/storage/meta-scan.ts`. Schema migration in `supabase/migrations/`. Replace `scripts/meta-live-scan.sh` once parity confirmed.

**Depends on:** Supabase schema migration (existing pattern in `scripts/apply-duel-schema.mjs`).

---

## How this list is used

- Items P0 1-5 should land as a single focused v1.1 PR before the next sweep run.
- Items P1 6-8 land when the use case demands them (full proxy sweep → 6, parallel scans → 7, cross-scan analytics → 8).
- Don't bundle P0 + P1 in one PR — keeps blast radius small per Larson's rule.
- All items have concrete file:line refs so a future Clayton (or future Claude) can pick them up cold.
