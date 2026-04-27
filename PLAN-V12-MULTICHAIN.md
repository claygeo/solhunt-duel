# solhunt v1.2 — multichain support

**Reviewer:** /plan-eng-review
**Mode:** Plan stage, code not yet written. No AskUserQuestion calls — recommendations baked in per CLAUDE.md "never stop to ask, defer to outside voice."
**Branch:** master (will land on `feat/v12-multichain` once implementation starts)
**Goal:** Unblock Arbitrum / Optimism / Polygon / Base scanning for cold-DM targets and grant ecosystem sweeps. Pre-condition for the Trailblazer / Optimism Mission / Polygon CG-S2 grant pitches ("v1.2 added multichain support").

---

## Step 0 — Scope challenge

### What already exists (good news)

Most of the chain abstraction is already in place. The plumbing is smaller than the Base Azul subagent's report suggested. Verified by reading current code:

- **Etherscan v2 multichain API is already wired.** `src/ingestion/etherscan.ts:37` already accepts `chainId: number = 1`. Etherscan's v2 endpoint takes a `chainid` query param and ONE API key works across Ethereum / Arbitrum / Optimism / Base / Polygon / etc. No per-chain Etherscan account needed.
- **`--chain` CLI flag exists** at `src/index.ts:141` with default `"ethereum"`. Currently a label only — passed to `forge create`/`anvil` but not used to switch RPC or chainId.
- **`config.rpcUrl` is already threaded** through `SandboxManager` (`src/sandbox/manager.ts:7,56`) and `ForkManager` (`src/sandbox/fork.ts:5,22`). The fork command honors whatever URL is passed; it just always passes the Ethereum-mainnet one because of how the index.ts caller resolves it.

### What's actually broken

Three concrete gaps:

1. **`src/index.ts:272`** hardcodes chainId=1: `fetchContractSource(target, etherscanKey!, 1)`. One-line fix.
2. **`src/index.ts:162` + `:611`** read `process.env.ETH_RPC_URL` directly, with no per-chain dispatch. Need a `chainName → rpcUrl` resolver.
3. **`src/index.ts:141`** chain flag is a string label without validation. If a user passes `--chain stellar`, current code silently proceeds and the scan crashes opaquely on Etherscan source fetch (chainId=1 with a Stellar address returns "not verified").

### Minimum viable fix (rejected as the recommended scope — see Lake Score below)

The narrowest possible PR (~25 lines):

- Add a `CHAIN_CONFIG` constant: `{ ethereum: {chainId:1, rpcEnv:"ETH_RPC_URL"}, arbitrum: {chainId:42161, rpcEnv:"ARB_RPC_URL"}, ... }`
- At `src/index.ts:272`, replace `fetchContractSource(target, etherscanKey!, 1)` with `fetchContractSource(target, etherscanKey!, chainConfig.chainId)`
- At `src/index.ts:162`, replace `process.env.ETH_RPC_URL` with `process.env[chainConfig.rpcEnv]`
- Validate `--chain` against the config keys; error explicitly on unknown.

That's the boring/correct fix.

### Recommended scope (boil the lake)

Extend the minimum fix with:

- **Per-chain Anvil hard-fork detection** — Arbitrum's gas model differs from mainnet; surface a non-default `--hardfork shanghai` (or `cancun`) per chain so Anvil forks behave correctly.
- **Per-chain block-explorer URL helper** — currently `findings/<ts>/README.md` always says "https://etherscan.io" in agent-rendered text. Render the chain-appropriate URL (arbiscan.io, basescan.org, polygonscan.com, optimistic.etherscan.io) so reviewer-facing artifacts are correct.
- **Smoke test per supported chain** — one fixture contract per chain, `vitest run test/multichain.test.ts` confirms source fetch works against each. Catches "I shipped Arbitrum support and never actually verified it works."
- **README delta** — three lines documenting how to scan a non-Ethereum contract (`--chain arbitrum --rpc-url $ARB_RPC_URL`).
- **`--rpc-url` override flag** — for users who want to bring their own RPC (Alchemy / Infura / QuickNode / Tenderly) without setting an env var.

Why "boil the lake": the marginal cost in CC time is ~30 min more than the minimum, but it eliminates the entire class of "I added multichain but it silently broke X" follow-up bugs. **Lake Score: 8/10** — recommend complete option.

### Search check

- **"foundry forge multichain"** — Foundry has no built-in chain-config registry; per-RPC-URL is the canonical approach. Layer 1.
- **"etherscan v2 api chains supported"** — Etherscan v2 covers Ethereum mainnet/Sepolia, Arbitrum One/Sepolia/Nova, Optimism, Base, Polygon, BNB, Linea, Scroll, zkSync, and ~50 more. One API key. Layer 1.
- **"anvil fork-url chainid"** — Anvil auto-detects chainId from the forked RPC's `eth_chainId` response. We don't need to set chainId manually on the fork — only on the Etherscan call. Subtle but important.

### TODOS cross-reference

`TODOS.md` item P1 #6 (EIP-1967 impl-source auto-fetch) — orthogonal, doesn't block this PR. Leave for v1.3.

`TODOS.md` item P0 #1 (lift in-scope check above the provider branch) — orthogonal, leave for v1.1 polish if not already shipped (it's not — confirmed in current src/index.ts).

`TODOS.md` item P1 #7 (per-scan staging dir) — relevant only if multichain enables concurrent scans. Defer.

### Distribution check

This PR doesn't introduce a new artifact type. The `solhunt` CLI binary is already distributed via `npm install` + `npx tsx`. No new packaging.

---

## Section 1 — Architecture review

### 1.A — `ChainConfig` shape and location

The chain config is a single object with a fixed set of supported chains. Two reasonable homes:

- **`src/config/chains.ts` (new file)** — explicit module, single source of truth, easy to grep. Recommended.
- **Inline constant in `src/index.ts`** — fewer files, but the chain config will be referenced from `findings` rendering, the README writer, and tests — making it a separate module saves duplicated imports later.

**Recommendation:** new file `src/config/chains.ts`. Mappable to:

```typescript
export interface ChainConfig {
  name: string;          // "ethereum", "arbitrum", "optimism", ...
  chainId: number;       // 1, 42161, 10, ...
  rpcEnv: string;        // "ETH_RPC_URL", "ARB_RPC_URL", ...
  explorerUrl: string;   // "https://etherscan.io", "https://arbiscan.io", ...
  hardfork?: string;     // optional per-chain Anvil hardfork override
}
export const CHAINS: Record<string, ChainConfig> = { ... };
export function resolveChain(name: string): ChainConfig { ... }
```

`resolveChain()` throws on unknown chain — explicit error, not silent.

### 1.B — RPC URL resolution priority

Three sources for the RPC URL: CLI flag, per-chain env var, generic `ETH_RPC_URL` fallback. Priority order matters:

**Recommended:**
1. `--rpc-url <url>` CLI flag (explicit wins)
2. Per-chain env var (`ARB_RPC_URL` for Arbitrum, etc.) — looked up via `chainConfig.rpcEnv`
3. `ETH_RPC_URL` ONLY when `--chain ethereum` (don't silently use Ethereum RPC for an Arbitrum scan — that's the current bug)
4. Hard error if no URL resolves — never proceed with empty RPC.

**Why explicit > clever:** the worst failure mode here is using the wrong RPC silently. A scan that runs "successfully" against the wrong chain produces fake findings. Hard error > soft default.

### 1.C — Backward compatibility

Existing scripts in the repo (`scripts/scan-codex-twyne.sh`, `scripts/scan-codex-tier-e.sh`, `scripts/meta-live-scan.sh`) all assume Ethereum mainnet. They don't pass `--chain`. With the new resolver, the default `--chain ethereum` plus `ETH_RPC_URL` env var still works exactly as before. **No script changes needed for v1.2.**

### 1.D — Failure mode: chain mismatch between source and fork

Consider: user passes `--chain arbitrum 0x<ethereum-address>`. Etherscan v2 with `chainid=42161` returns "contract not verified" because the address is on Ethereum, not Arbitrum. Currently the error would surface as "Etherscan API error: NOTOK." That's fine — fail-loud is correct. But the error message should mention the chain.

**Fix:** in `etherscan.ts`, include the chain name in the thrown error: `throw new Error(\`Contract ${address} not verified on Etherscan for chain=${chainName} (chainId=${chainId}). Did you mean a different chain?\`)`.

### 1.E — In-scope allowlist multichain awareness

`src/safety/in-scope.ts` currently has Drips Network entries (Ethereum) and Twyne entries (Ethereum). The Base Azul recon subagent added Base Azul entries already. The `InScopeTarget` type doesn't have a `chain` field.

**Risk:** `assertInScopeOrAcknowledged(0x<arbitrum-address>, false)` checks lowercase address match, but doesn't confirm the chain matches. If a future Arbitrum protocol has a contract at the same checksummed address as an Ethereum protocol's contract (collision is possible — addresses are not chain-namespaced), the wrong allowlist entry could fire.

**Realistic likelihood:** very low (address collisions are computationally hard). But explicit is better.

**Fix:** add `chain: string` field to `InScopeTarget`. Update `isInScope(address, chain)` signature. The lookup is now `(address, chain) -> boolean`. For backward compat, default `chain="ethereum"` if not passed (matches current behavior for all existing entries).

This is the only architectural change in v1.2 that touches `src/safety/in-scope.ts`. Keep blast radius small.

### 1.F — ASCII diagram for chain resolution

Add to `src/index.ts` near the chain handling block:

```
Chain resolution flow:
==========================================================
  CLI: --chain <name> [--rpc-url <url>]
       │
       ▼
  resolveChain(name) → throws on unknown
       │
       ├─ chainConfig.chainId  → fetchContractSource(addr, key, chainId)
       │
       └─ rpcUrl precedence:
              flag > process.env[chainConfig.rpcEnv] > ETH_RPC_URL (only ethereum) > error
              │
              ▼
       SandboxManager.createContainer({ rpcUrl })
              │
              ▼
       ForkManager.start({ chain: name, rpcUrl, hardfork? })
==========================================================
```

Document this in the new `src/config/chains.ts` module header.

---

## Section 2 — Code quality review

### 2.A — DRY: RPC env-var lookup

Currently `src/index.ts:162` and `src/index.ts:611` both do `process.env.ETH_RPC_URL`. After this patch they should both call a `getRpcUrl(chainConfig, options.rpcUrl?)` helper. Don't duplicate the precedence-resolution logic in two places.

**Fix:** export `getRpcUrl(config: ChainConfig, override?: string): string` from `src/config/chains.ts`. Throws if no URL resolves.

### 2.B — Magic strings: chain names

The `--chain` flag accepts free-form strings. Validate against `Object.keys(CHAINS)` at parse time, with a helpful "did you mean" error message:

```typescript
if (!CHAINS[options.chain]) {
  const supported = Object.keys(CHAINS).join(", ");
  throw new Error(`Unknown chain "${options.chain}". Supported: ${supported}`);
}
```

Don't use a TypeScript union type for chain names — keeping it as a string with runtime validation is cleaner because the supported chain list is data, not types. (Counter-argument: a literal type would catch typos at compile time. Counter-counter: scripts and env files don't get type-checked anyway, and the error message is the same UX.)

### 2.C — `--rpc-url` flag plumbing

`src/index.ts` already has the `--chain` option declaration. Add `--rpc-url <url>` adjacent to it. Wire through `getRpcUrl(config, options.rpcUrl)`.

### 2.D — `findings/<ts>/README.md` rendering

`renderFindingReadme()` currently hardcodes etherscan.io URLs in template strings. After this patch, accept `chainConfig.explorerUrl` and template:

```
[View on ${chainConfig.explorerLabel}](${chainConfig.explorerUrl}/address/${address})
```

Where `explorerLabel` is "Etherscan" / "Arbiscan" / "Basescan" / "Polygonscan" / "Optimistic Etherscan."

### 2.E — Existing ASCII diagrams: src/sandbox/manager.ts

No existing diagrams in the touched files. Add the chain-resolution diagram (1.F) to the new `src/config/chains.ts` module.

---

## Section 3 — Test review

### Test framework: vitest (already in use, 35 tests passing on master)

### Coverage diagram

```
CODE PATH COVERAGE — v1.2 multichain patch
=========================================================
[+] src/config/chains.ts (new file)
    │
    ├── resolveChain(name)
    │   ├── [GAP] CRIT  known chain returns config — NO TEST
    │   ├── [GAP] CRIT  unknown chain throws — NO TEST
    │   └── [GAP]       case-insensitive name matching — NO TEST (defer if not implementing case-insensitive)
    │
    ├── getRpcUrl(config, override?)
    │   ├── [GAP] CRIT  override flag wins over env — NO TEST
    │   ├── [GAP] CRIT  per-chain env var resolved correctly — NO TEST
    │   ├── [GAP] CRIT  ETH_RPC_URL fallback ONLY for ethereum — NO TEST
    │   └── [GAP] CRIT  no URL → throws (not silent) — NO TEST
    │
    └── CHAINS constant
        └── [GAP] supported chains documented + present — NO TEST (verifies via per-chain smoke)

[+] src/ingestion/etherscan.ts (modified — chainId thread-through)
    │
    └── fetchContractSource(address, key, chainId)
        ├── [GAP] [→E2E] Arbitrum verified contract returns valid source — NO TEST
        ├── [GAP] [→E2E] Optimism verified contract — NO TEST
        ├── [GAP] [→E2E] Base verified contract — NO TEST
        ├── [GAP] [→E2E] Polygon verified contract — NO TEST
        └── [GAP] CRIT   chain mismatch error message includes chain name — NO TEST

[+] src/safety/in-scope.ts (modified — chain field)
    │
    └── isInScope(address, chain)
        ├── [GAP] CRIT  matching address+chain returns target — NO TEST
        ├── [GAP] REGRESSION  Ethereum-default backward compat — NO TEST (Iron Rule)
        └── [GAP]       unknown chain returns null/false — NO TEST

[+] src/index.ts (modified — wiring)
    │
    └── scan dispatch
        ├── [GAP] [→E2E] --chain arbitrum --rpc-url <url> 0x<arb-addr> dry-run — NO TEST
        ├── [GAP] CRIT   --chain unknown errors before sandbox creation — NO TEST
        └── [GAP] CRIT   --chain ethereum (default) still works exactly as before — NO TEST (Iron Rule regression)

─────────────────────────────────────────
COVERAGE: 0/16 paths tested (0%)
GAPS: 16 paths need tests
  CRITICAL gaps: 11
  REGRESSIONS (Iron Rule, mandatory): 2
  E2E (live API call): 5
─────────────────────────────────────────
```

### Test plan additions to PR

**Required (Iron Rule + critical gaps):**

1. `test/config/chains.test.ts` (new file) — unit tests for `resolveChain` and `getRpcUrl`. ~40 lines, ~8 cases.
2. `test/safety/in-scope.test.ts` (already on TODOS list as P0 #5) — extend to cover the new `chain` field. ~15 additional lines.
3. `test/ingestion/etherscan.test.ts` (existing) — extend with mocked v2-API responses for chainId=42161 (Arbitrum) and chainId=8453 (Base). NOT live API calls in CI — use `nock` or fetch-mock.
4. `test/regression/multichain-default.test.ts` (new file) — explicit regression: `--chain ethereum` (and no `--chain` at all) produces identical behavior to v1.1. Iron Rule.

**Recommended (E2E, gated behind `vitest run test/e2e`):**

5. `test/e2e/multichain.live.test.ts` — one verified contract per supported chain, runs `npx tsx src/index.ts scan <addr> --chain <name> --dry-run`. Skipped by default in CI (gated on `RUN_E2E=true`). Run manually before each release. Catches the "Etherscan v2 dropped support for chain X" failure mode.

**Eval changes:** none. This patch doesn't touch agent prompts.

---

## Section 4 — Performance review

No N+1, no DB hot path, no agent-loop changes. Etherscan v2 multichain endpoint has the same rate-limit profile as the v1 single-chain endpoint (5 calls/sec free tier). No perf concerns.

One nit: `getRpcUrl()` is called once per scan; not hot. No caching needed.

---

## Outside Voice — Independent challenge

> Per CLAUDE.md `feedback_no_codex_cli.md`: outside voice = Claude subagent via Agent tool, never the codex CLI. Outside voice on this plan should run AFTER the user reviews this doc, not inline — the plan is small enough that diff-review will catch what plan-review misses, and outside voice budget is more useful for surprising/contested calls than for boring/correct refactors.

**Recommendation:** skip outside voice on this v1.2 plan. Run `/codex review` (Claude subagent adversarial) on the diff once code is written. That catches LLM trust boundary issues, conditional side effects, and surprises that are hard to see at plan stage.

---

## NOT in scope (deferred to future versions)

| Item | Why deferred |
|---|---|
| Non-EVM chains (Solana, Stellar, Move-based) | Different VM, different toolchain. Solhunt is EVM-only by design; non-EVM is v3+ scope. |
| Full Stylus-WASM (Rust on Arbitrum) support | Promised in Trailblazer grant scope, not v1.2. v1.2 unlocks Solidity-on-Arbitrum, Stylus is a parallel additive workstream funded by the grant. |
| Per-chain Etherscan API key fallback | v2 multichain API uses one key. Only relevant if a chain is on a non-Etherscan explorer (e.g., Blockscout-only). Defer to "first time it bites." |
| `--chain` autodetection from address | Cute but the wrong primitive. User explicitly states intent via flag; autodetect is a debugging UX feature, not a v1.2 capability. |
| Multi-chain `meta-scan` runner | Currently `scripts/meta-live-scan.sh` is single-chain. Multi-chain meta needs the per-scan staging dir fix (TODOS P1 #7). Defer. |

---

## What already exists (reused, not rebuilt)

- `src/ingestion/etherscan.ts:34-37` — `fetchContractSource` already takes `chainId` (Etherscan v2). v1.2 just stops hardcoding 1.
- `src/sandbox/manager.ts:7,56` — `SandboxManager` already accepts `rpcUrl` config. No change.
- `src/sandbox/fork.ts:5,22` — `ForkManager` already takes `rpcUrl`. No change.
- `src/index.ts:141` — `--chain` flag exists. v1.2 makes it functional instead of cosmetic.

---

## TODOS.md updates

Three new entries proposed (one-line each, full context already in this doc):

1. **P0 — Add `chain` field to `InScopeTarget`** (Section 1.E). Critical for v1.2 multichain in-scope safety.
2. **P1 — `test/e2e/multichain.live.test.ts`** (Section 3 #5). Catches Etherscan v2 chain-support changes. Runs manually pre-release.
3. **P2 — Per-chain Anvil hardfork override** (boil-the-lake item). Most chains work fine on Anvil's default; override only when needed.

---

## Failure modes (critical-gap audit)

| Codepath | Failure | Test? | Error handling? | Visible? |
|---|---|---|---|---|
| `getRpcUrl` no URL resolved | scan starts then crashes 5s in | NO (gap) | YES (throws explicit) | YES |
| Chain mismatch (Ethereum addr, --chain arbitrum) | "not verified" error | NO (gap) | YES (Etherscan throws) | YES, but error doesn't name chain |
| In-scope check on wrong-chain address | wrong allowlist entry could fire | NO (gap) | NO — silent correctness bug | NO — **CRITICAL GAP** |
| `--chain` flag typo | unknown chain throws at flag-parse | NO (gap) | YES (planned) | YES |
| Etherscan v2 chain-support change (chain X removed) | source fetch fails with weird error | E2E only (gap) | partial | YES |

**Critical gap:** in-scope chain awareness (Section 1.E). Don't ship v1.2 without the test for it.

---

## Worktree parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| 1. Create `src/config/chains.ts` + tests | `src/config/`, `test/config/` | — |
| 2. Modify `src/ingestion/etherscan.ts` (chain in error) + tests | `src/ingestion/`, `test/ingestion/` | 1 |
| 3. Add `chain` to `InScopeTarget` + tests | `src/safety/`, `test/safety/` | — |
| 4. Wire in `src/index.ts` (CLI flag + getRpcUrl) | `src/`, `test/regression/` | 1, 2, 3 |
| 5. Update `findings` rendering (per-chain explorer URL) | `src/` | 4 |
| 6. README delta + .env.example update | docs | — |

**Parallel lanes:**
- Lane A: 1 → 2
- Lane B: 3 (independent)
- Lane C: 6 (independent)

After lanes complete: 4 → 5 (sequential, both touch `src/index.ts`).

**Conflict flag:** Lane A and step 4 both touch `src/`, step 5 touches `src/`. Sequential after the parallel lanes converge. Total wall time: ~2-3h CC time across lanes.

---

## Completion summary

- **Step 0:** scope reviewed, complete option recommended (boil the lake), Lake Score 8/10
- **Architecture review:** 6 issues (1.A–1.F), 1 critical gap (1.E in-scope chain awareness)
- **Code quality review:** 5 issues (2.A–2.E)
- **Test review:** 16-path coverage diagram, 11 critical gaps, 2 Iron Rule regressions (default-Ethereum behavior + in-scope.ts compat), 5 E2E
- **Performance review:** 0 issues
- **NOT in scope:** documented (5 items)
- **What already exists:** documented (4 items reused)
- **TODOS.md updates:** 3 new items proposed
- **Failure modes:** 1 critical gap flagged (in-scope chain awareness)
- **Outside voice:** deferred to diff-stage `/codex review` (recommended over plan-stage)
- **Parallelization:** 3 lanes (A, B, C) parallel, then 4 → 5 sequential
- **Lake Score:** complete option chosen on the only meaningful tradeoff (full multichain UX vs. minimum-viable patch). 1/1.

**STATUS: DONE — plan ready for implementation.**

---

## Implementation order (when work begins)

1. ☐ Create `src/config/chains.ts` with `CHAINS`, `resolveChain`, `getRpcUrl`. Write its tests first.
2. ☐ Update `src/ingestion/etherscan.ts` error message to include chain name. Mock-test for two non-Eth chains.
3. ☐ Add `chain: string` to `InScopeTarget`, with `chain="ethereum"` default for backward compat. Test the regression.
4. ☐ Wire `--chain` validation + `--rpc-url` flag + `getRpcUrl` in `src/index.ts`. Iron Rule regression: default behavior unchanged.
5. ☐ Update `renderFindingReadme()` to use per-chain explorer URL.
6. ☐ Update README + `.env.example` with `ARB_RPC_URL`, `OPT_RPC_URL`, `BASE_RPC_URL`, `POLYGON_RPC_URL`, etc.
7. ☐ Run full vitest suite — should be 35 + ~16 new = 51 tests passing.
8. ☐ Manual smoke: `npx tsx src/index.ts scan 0x<arb-addr> --chain arbitrum --dry-run` against a known Arbitrum contract. Confirm Etherscan source fetch returns the right contract.
9. ☐ `/review` on the diff. Adversarial pass via Claude subagent.
10. ☐ `/ship` — bump version, CHANGELOG, PR.

Estimated CC time: 2-3 hours including tests + manual smoke + review.

---

## What this unblocks

- **Cold-DM scans:** Kresko (Arbitrum), D2 Finance (Arbitrum), Y2K Finance (Arbitrum) — top-5 outreach targets that were blocked.
- **Grant pitch credibility:** every grant application can cite "v1.2 multichain support shipped" with a commit link.
- **Top-30 ecosystem sweeps:** Arbitrum / Optimism / Polygon / Base — the Trailblazer + Optimism Mission + Polygon CG-S2 deliverables become buildable.
- **Re-evaluate Base Azul:** with v1.2 in place, the *plumbing* objection to Base Azul disappears. The *fit* objection remains (9/10 contracts wrong-zone), so the decision to skip stays. But the same multichain capability captures any future Base / Optimism / Arbitrum bug-bounty contest with a single PR's worth of ongoing work.
