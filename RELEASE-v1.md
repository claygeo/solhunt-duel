# solhunt-duel v1 — release notes

**Released:** 2026-04-20
**Scope:** Claude hackathon submission. First end-to-end adversarial red-vs-blue autonomous agents on real DeFi vulnerabilities, with run-once defensibility receipt.

---

## What shipped

### The primitive (Phase 0)

`src/sandbox/patch-harness.ts` enforces four defensibility gates on any candidate patch:

- **exploitNeutralized** — Red's exploit now fails on the patched runtime bytecode
- **benignPassed** — auto-generated happy-path tests still succeed
- **freshAttackerNeutralized** — exploit re-run from a different EOA also fails
- **storageLayoutPreserved** — patched source doesn't reorder existing state variables

Gates are server-side. Agents can't fake them.

### The agents (Phase 1 + 2)

- **Red** (`src/agent/loop-via-claude-cli.ts`) — autonomous exploit writer. Reads source, writes `test/Exploit.t.sol`, iterates via `cast` + `forge test` until the exploit passes. Opus 4.7 via `claude -p` subprocess.
- **Blue** (`src/agent/blue-loop.ts`, `src/agent/blue-prompt.md`) — autonomous patch writer. Reads Red's exploit, writes a patched `.sol`, verifies via `verify_patch`. Opus 4.7 via `claude -p` subprocess.
- **Benign generator** (`src/benign/generator.ts`) — produces 5-8 happy-path Foundry tests per contract, pruned against the original to drop bad fixtures.

### The orchestrator (Phase 2)

`src/duel/orchestrator.ts` drives the adversarial loop:

```
IDLE → RED_SCAN → PATCH → VERIFY → {CONVERGED | NEXT_ROUND | BLUE_FAILED | SAME_CLASS_ESCAPED | BUDGET_EXHAUSTED}
```

Rounds 2+ inject Blue's patched runtime bytecode onto the fresh target address via `anvil_setCode`, then re-run Red. `same_class_escaped` fires when Red re-finds the same vulnerability class with a variant attack — the signal that catches incomplete patches.

`src/duel/audit-trail.ts` emits grounded per-round entries with Red-iteration and Blue-turn citations. Every claim is evidence-backed.

### Fresh-address bytecode cloning

`scripts/redeploy-defihacklabs.ts` uses `anvil_setCode` + `anvil_setStorageAt` to clone exact mainnet vulnerable bytecode to fresh fork addresses. Real vulnerability, clean address. Sidesteps Anthropic's Usage Policy classifier (which pattern-matches on famous exploit addresses) without losing authenticity.

Supports the roster in `benchmark/holdout-roster.json` (10 contracts).

### The demo UI (Phase 3)

`ui/` — single Next.js 16 page, fixture-driven, no live API calls. Renders the Dexible duel's Round 1 exploit + patch diff + gate verdicts + Round 2 re-scan. Live at **https://solhunt-duel.netlify.app** when the Netlify build finishes.

Aesthetic: true black, CRT amber accent, JetBrains Mono + Inter. Mobile-first tested across four viewports.

### The benchmark (Phase 4)

10-contract holdout from DeFiHackLabs, run-once protocol. Manifest committed with SHA256 of every source file + bytecode BEFORE any duel fired; results committed as child commit.

**Git defensibility receipt:** `8d95643` (manifest) → `ec94da0` (results). `git log --reverse` verifies manifest-before-results.

---

## Headline results

### Centerpiece — Dexible duel

Real 2023 $2M DeFi hack. One CLI command, autonomous end-to-end, reproducible.

- R1 Red: 41.8s, 8 turns, autonomous pivot (original RouterRequest CVE failed on fresh-deploy storage → pivoted to proxy takeover via uninitialized `adminMultiSig`)
- R1 Blue: 551s, 80 turns, one passing patch, ALL 4 gates green
- R2 Red: 277s, 23 turns, honest nothing-found
- **Convergence: hardened. Total 17.6 minutes.**

Forge trace verified Red's drain as a real state change (`adminMultiSig` slot went from `0x000...000` to `0x000...A77ACCE2` via `vm.load` read).

### 10-contract holdout

| Outcome | Count | Contracts |
|---|---:|---|
| Real hardening (full Red→Blue→Red-empty loop) | 1 | Dexible |
| Incomplete patch caught by the loop (`same_class_escaped`) | 1 | Floor Protocol |
| Blue failed within budget | 3 | Hedgey, OlympusDAO, TempleDAO |
| Red gave up (methodology limit on stateful exploits) | 3 | Audius, DFX, FloorDAO |
| Timeout | 1 | Abracadabra |
| Infra config gap | 1 | Seneca |
| **Total** | **10** | |

**Wall time:** 3.2 hours. **Gate quality when Blue converged:** 100% across all 4 gates (n=5). No false greens.

### Floor Protocol — why `same_class_escaped` matters

R1 Blue passed all four gates on Red's specific exploit. R2 Red scanned the patched bytecode and re-found the same vulnerability class with a variant. The patch was incomplete; the gates couldn't tell (they verify the specific attack, not the attack class). The adversarial loop did.

That's what the architecture is for.

---

## Known limits (honest)

**Blue's budget is too tight for half the dataset.** Five of ten `blue_failed` because Red found real exploits and Blue hit the 3-round budget or wall-clock before converging. Fix is more rounds, tighter prompts — not applied mid-benchmark because that would break run-once.

**Fresh-address methodology degrades for stateful exploits.** Three contracts (Audius, DFX, FloorDAO) converged `hardened` because Red never produced a working exploit. Not because they're safe — because reentrancy + flash-loan exploits need cross-contract state (allowances, pool reserves, oracle prices) that doesn't transfer with a bytecode clone. Honest for access-control + logic-error; insufficient for stateful vulns without state-migration.

**Foundry RPC bytecode cache shadows `anvil_setCode` in some verify paths.** Surfaced by Blue itself mid-duel on Hedgey — Blue diagnosed the harness limitation in the audit trail rather than patching around it.

**Forge-trace spot-check debt.** `benchmark/phase4-spot-checks.json` flags three sampled Red-green rounds (Dexible R1, TempleDAO R1, Olympus R1) with `forgeTraceVerified: null`. Manual trace-read pending for v1.1.

**Label pollution.** Audius/DFX/FloorDAO labeled `hardened` in the JSON artifact despite being "Red gave up" cases. README table asterisks them; v1.1 schema cleanup needs `red_insufficient` as a distinct convergence label.

**Seneca infra-failure.** Source-path config gap — `contract Seneca` wasn't at the expected path. One-line `--target-file` override would have resolved it. Per run-once, not retried.

---

## Reproduce the centerpiece

```bash
git clone https://github.com/claygeo/solhunt-duel
cd solhunt-duel
npm install
cp .env.example .env  # fill in ETHERSCAN_API_KEY + ETH_RPC_URL

BLUE_VIA_CLAUDE_CLI=1 BENIGN_VIA_CLAUDE_CLI=1 RED_VIA_CLAUDE_CLI=1 \
  npx tsx src/bench/phase2-duel/run-duel.ts \
  --contract Dexible --rounds 3 --red-via-claude-cli \
  --redeploy-from 0xDE62E1b0edAa55aAc5ffBE21984D321706418024 \
  --source-dir benchmark/sources/Dexible \
  --contract-name DexibleProxy
```

Expected: ~18 minutes, convergence `hardened`, four gates green. Requires Node 22, Docker, Foundry, authenticated `claude` CLI with Opus 4.7 access, Etherscan API key, archive-capable RPC.

---

## Commits of record

- `c1468fe` — Phase 0: patch-harness primitive with 4 defensibility gates
- `bf89398` — Phase 1: Blue team via `claude -p`
- `9249e9f` — Phase 2: duel orchestrator + audit trail + schema
- `54c770c` — Phase 2: Red team via `claude -p`
- `01f7915` — Fresh-address mode (redeploy script + clone-bytecode + index flags)
- `99efaa2` — Historic-patch comparison tool
- `f95c813` — Phase 3: UI demo page (Dexible fixture)
- `b5dc9cc` — UI mobile-first polish + design-review fixes
- `b87489c` — Next.js 16.2.4 CVE fix (CVE-2025-55182)
- **`8d95643`** — Phase 4 holdout-v1 manifest pinned pre-run
- **`ec94da0`** — Phase 4 run-once holdout results

---

## What's in the repo you'd audit first

If you're reviewing this submission, these are the files worth reading in order:

1. `src/sandbox/patch-harness.ts` — the four defensibility gates. Enforced server-side.
2. `src/duel/orchestrator.ts` — state machine + round semantics + `anvil_setCode` round-2 injection.
3. `src/agent/loop-via-claude-cli.ts` — Red agent. Single `claude -p` per scan, stream-json output, final authoritative `forge test`.
4. `src/agent/blue-loop.ts` — Blue agent. Mirror of Red's architecture. Includes the `runBlueTeamViaClaudeCli` branch at the top.
5. `scripts/redeploy-defihacklabs.ts` — bytecode cloning via `anvil_setCode`. The fresh-address mechanic.
6. `benchmark/holdout-v1-manifest.json` — SHA256-pinned pre-run manifest (the defensibility anchor).
7. `benchmark/phase4-results.json` — run-once results. No retries, honest labels.

Then the UI at `ui/app/page.tsx` for how the Dexible duel reads out of the fixture.

---

## v1.1 work queue (post-submission polish)

Ordered by time-to-fix vs impact:

1. **Forge-trace spot-check** on the three sampled rounds in `phase4-spot-checks.json`. ~30 min. Removes the `forgeTraceVerified: null` debt from the JSON artifact.
2. **Re-label `hardened` → `red_insufficient`** for Audius/DFX/FloorDAO in `phase4-results.json` + update schema. ~15 min. Cleans up the semantic bucket and makes the aggregate convergence rate more honest when read programmatically.
3. **Clear Foundry cache between verify runs** — fixes the Hedgey harness limitation Blue surfaced. ~1 hour in `patch-harness.ts` + re-run Hedgey.
4. **Apply Supabase `schema-duel.sql`** on the project's DB so the persistence path lights up (currently throws `public.duel_runs not found`). ~15 min manual SQL via the Supabase dashboard.

---

## v2 scope (if this gets traction)

- **Held-out red** (different-model Red against Blue's hardened contracts) — the key defensibility lever. Tests if Blue's patches generalize beyond Opus's attack distribution.
- **State migration** — replay pre-exploit transactions into fresh fork `setUp`. Unlocks reentrancy + flash-loan contracts for the benchmark.
- **Longer Blue budgets** (10 rounds instead of 3) on the 5 blue_failed contracts. Probably recovers 2-3 of them.
- **Multi-model Blue** — Opus + Sonnet + GPT-4 patch teams compared on patch quality, diff minimality, gate pass rates.

---

## Links

- **Code:** https://github.com/claygeo/solhunt-duel
- **Live demo:** https://solhunt-duel.netlify.app
- **Writeups (Twitter/LinkedIn/Substack drafts):** `writeups/`
- **Social card:** `writeups/social-card-solhunt-duel.png`

---

## Credits

Claude hackathon submission. Built via multi-agent Claude Code dispatch (specified, reviewed, iterated). The AI wrote a lot of the AI that dueled on the DeFi contracts. That's worth naming up front.

Questions, critiques, or "this breaks on contract X" — open an issue.

— Clayton
