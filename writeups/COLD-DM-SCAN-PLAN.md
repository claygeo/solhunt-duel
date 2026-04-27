# Cold-DM scan plan — top 5 outreach targets

**For:** Saturday outreach in [writeups/OUTREACH-TARGETS.md](OUTREACH-TARGETS.md)
**Scan budget:** ~$0 marginal cost (VPS Max subscription via `--via-claude-cli`)
**Wall time per target:** ~25 min (per the meta-runner timeout)
**Total:** ~2-3 hours wall time, runs after Base Azul completes
**Prerequisite:** Base Azul Solidity sweep finished (no concurrent staging-dir contention per `TODOS.md` P1 #7)

---

## What gets scanned

For each top-5 target, identify ONE high-impact contract — typically the protocol's main lending / vault / minting contract, NOT a peripheral fee receiver or governance helper. The scan must be against an address that the team will recognize as theirs and consider important, otherwise the cold DM lands flat.

**Address discovery:** The target list in OUTREACH-TARGETS.md doesn't have specific addresses (because TVL/contracts shift over time). For each target, fetch the team's docs site for the canonical address, OR use DefiLlama's contracts page for the protocol, OR use the protocol's `addresses.json` if they ship one.

If address discovery fails for a target (docs are stale, no DefiLlama listing, no addresses.json), **skip that target** rather than scanning a guessed address. A scan against the wrong contract is worse than no scan — it's a credibility kill in the DM.

---

## Per-target scan recipe

```bash
# inside /root/solhunt on VPS, after Base Azul completes:

# 1. Pre-fetch each target's main contract source
for target in sturdy-v2 d2-finance kresko resonate y2k-finance; do
  echo "=== $target ==="
  # source URL for the canonical address goes here, fetched manually
  cast etherscan-source --etherscan-api-key $ETHERSCAN_API_KEY \
    -d /tmp/dm-targets/$target/ <ADDRESS>
done

# 2. Run scans serially (no concurrent staging-dir race)
for target in sturdy-v2 d2-finance kresko resonate y2k-finance; do
  ADDRESS=$(jq -r ".\"$target\"" /root/solhunt/findings/dm-targets.json)
  # add to in-scope allowlist OR pass --i-acknowledge-out-of-scope
  npx tsx src/index.ts scan $ADDRESS \
    --via-claude-cli --i-acknowledge-out-of-scope \
    > /root/solhunt/findings/dm-scan-$target.log 2>&1
done

# 3. Each scan deposits to:
#    /root/solhunt/findings/<iso-ts>-<contract>/{report.json, Exploit.t.sol, README.md}
#    The report.json is what we paste into the DM thread
```

---

## Address-discovery checklist (do before scans)

For each of the 5 targets, fill in the canonical main-contract address. If empty, skip that target.

| Target | Network | Canonical contract | Source |
|---|---|---|---|
| Sturdy V2 | Ethereum | TBD — fetch from docs.sturdy.finance | docs |
| D2 Finance | Arbitrum | TBD — Arbiscan + Arbitrum forum | forum |
| Kresko | Arbitrum | TBD — kresko.fi/contracts | docs |
| Resonate (Revest) | Ethereum | TBD — docs.resonate.fi | docs |
| Y2K Finance | Arbitrum | TBD — docs.y2k.finance | docs |

> Outside-voice subagent should fill this in before the scans start. If only 3 of 5 targets have discoverable addresses, scan only those 3. **Never scan a guessed address.**

---

## Per-finding handling

After each scan, apply the false-positive checklist (same one from RepoDriver lessons):

- ☐ Does the exploit use `vm.store` / `vm.prank` to bypass real access control?
  → if YES, finding is invalid. DM as "clean scan, here's the report."
- ☐ Is the function gated by a permanent block (pause + zero admin)?
  → if YES, finding is invalid. DM as "clean scan."
- ☐ Is the scanned contract an impl that no proxy currently delegates to?
  → if YES, fix the address and re-run, or DM as "clean scan."
- ☐ Is the value-at-risk realistic (not just instantaneous balance against a fork)?
  → quote actual TVL or annotate "instantaneous balance only."

If a finding survives all four checks, the DM uses Case A from the OUTREACH-TARGETS.md template ("Found a [class] issue in [function]. Forge test passes. Bundle attached.").

If it fails any check, the DM uses Case B ("Scan came back clean. Happy to run continuous coverage at $1500/mo.").

---

## What I (autonomous agent) deliver Saturday morning

A single message to Clayton with:

```
=== Cold-DM scan results, ready for outreach ===

Sturdy V2 (Eth)
  Verdict: [FOUND realfinding | CLEAN | SKIPPED—no address]
  Bundle: findings/2026-04-28-Sturdy/
  DM draft: [paste-ready text]

D2 Finance (Arb)
  Verdict: ...
  Bundle: ...
  DM draft: ...

[etc]

5 targets, X scanned, Y findings to verify, Z clean scans.
All bundles ready. DM drafts ready.

Send order recommendation:
  Sat AM: [target with strongest finding]
  Sat PM: [next strongest]
  Sun AM: [remaining 3]
```

You read the DM drafts, click send.

---

## Don't do these things

- ❌ Don't scan more than the top 5 in this batch. Second batch goes out after first 5 reply (or don't reply in 72h).
- ❌ Don't scan multiple addresses per target. One canonical contract per target.
- ❌ Don't auto-DM. Drafts only. Clayton's Twitter / handle / approval.
- ❌ Don't scan addresses outside the protocol's actual scope. If the protocol has a private bug bounty (Immunefi listed), the scan goes through the bounty path, not the cold-DM path.
- ❌ Don't keep scanning a target if the first 2 attempts fail Etherscan source fetch. Move on.

---

## Concurrency note

Per [TODOS.md](../TODOS.md) item P1 #7: "Today, two concurrent scans against the same VPS would race on staging." This plan is strictly serial — scans run one at a time, after Base Azul finishes. No simultaneous scans on the same VPS.

If a future expansion to 20-target batches becomes useful, item P1 #7 (per-scan staging dir) lands first, then concurrency.
