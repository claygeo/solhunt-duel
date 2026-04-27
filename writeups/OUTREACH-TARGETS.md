# Cold outreach — 20 small DeFi protocols

**Date:** 2026-04-27
**Source:** Stream 2 of `RESEARCH-2026-04-27.md` (outside-voice research)
**Pricing target:** $1500/scan for continuous coverage (post-free-report conversion)
**Status legend:** ☐ not yet contacted • → contacted, awaiting reply • ✓ replied • ✗ no fit / declined

> **TVL caveat:** the research subagent's WebFetch was blocked by DefiLlama (403/500) so the TVL bands below are name-confirmed but approximate. **Verify exact current TVL on DefiLlama before each pitch** — and skew the message toward "a free scan worth your 30 min" rather than "you have $X TVL at risk." Specific numbers in a cold DM that turn out to be wrong destroy credibility immediately.

> **Target filter (do not deviate without reason):** TVL $1M–$20M, post-audit, currently shipping new features, EVM-compatible, accessible team contact. Above $20M they have audit retainers and won't reply to cold pitches; below $1M they don't have the budget for $1500/scan.

> **Pre-pitch checklist:** for each protocol, BEFORE sending the outreach, run `solhunt scan <addr> --via-claude-cli --i-acknowledge-out-of-scope` against ONE of their main contracts. Attach the actual `findings/<ts>/` bundle as proof. A cold pitch with no findings attached is just spam.

---

## Top 5 to DM this weekend (ranked by fit + receptiveness)

| # | Protocol | Why first | Channel |
|---|---|---|---|
| 1 | Sturdy V2 | Small team, prior-exploit history (extra-receptive to security pitches) | @SturdyFinance |
| 2 | D2 Finance | Currently pitching for Arbitrum STEP funding — actively cash-conscious + needs validation | Arbitrum forum |
| 3 | Kresko | Synthetic minting, classic access-control surface, small team | @KreskoProtocol |
| 4 | Resonate (Revest) | Niche team, will read DMs | @resonatefi |
| 5 | Y2K Finance | Exotic peg derivatives, non-standard accounting → solhunt's logic-error zone | @y2kfinance |

---

## Full 20-protocol target sheet

| # | Protocol | Approx TVL | Auditor | Active feature | Best contact | Solhunt fit |
|---|---|---|---|---|---|---|
| 1 | **Sturdy V2** | ~$300K (low) | Multiple historical | V2 ecosystem | @SturdyFinance | Small team — DM-receptive, prior exploit |
| 2 | **D2 Finance** | small (Arb STEP applicant) | In progress | STEP-funded growth | Arbitrum forum thread | Cash-conscious, actively pitching |
| 3 | **Kresko** | low M (Arb synths) | Multiple | Synthetic minting | kresko.fi, @KreskoProtocol | Classic access-control surface |
| 4 | **Resonate (Revest)** | low M | Multiple historical | Cycle-based yield | @RevestFinance, @resonatefi | Niche team, DM-readers |
| 5 | **Y2K Finance** | ~$1-3M | Multiple | V2 active | @y2kfinance | Exotic peg derivatives, non-standard accounting |
| 6 | **Smilee Finance** | ~$1-3M | Sherlock Feb 2024 | Smilee v2 / gBERA | medium.com/smilee-finance | DVP architecture, well-defined invariants |
| 7 | **Cega** | ~$415K total | OtterSec, Zellic | Shark/Bull vault expansion | @cega_fi | Structured-product vault — pure access-control/accounting |
| 8 | **Wasabi Protocol** | ~$5-15M | Zellic, Sherlock, Narya, foobar | Live on Base App | wasabi.xyz, @WasabiProtocol | Leverage+lending, multi-auditor culture |
| 9 | **Vela Exchange** | ~$13.5M | Multiple | Synthetics/forex expansion | @velaex | Perp DEX with vault, growth mode |
| 10 | **Toros Finance** | ~$10-20M | dHEDGE-aligned | Vault expansion | dHEDGE community | Multichain vault aggregator |
| 11 | **Premia** | ~$5-10M Arb | Arbitrary Execution | v3 on Arb | @PremiaFinance | American options, AMM logic |
| 12 | **Stryke (ex-Dopex)** | ~$5-15M | OpenZeppelin | SYK migration | @stryke_xyz, @dopex_io | Options vault, upgrade-path bugs |
| 13 | **Rage Trade** | ~$2-8M | Quantstamp | Omnichain ETH perps | @RageTrade | LayerZero+Arb cross-chain |
| 14 | **Spectra V2** | ~$40M (borderline upper) | Sherlock | Active gauge requests | @SpectraFinance | Yield-stripping, wide perm surface |
| 15 | **IPOR / IPOR Fusion** | low-mid M | Multiple | Fusion vault rollouts | ipor.io, @IPOR_official | Interest-rate swap math |
| 16 | **Notional V3** | low tens of M | OpenZeppelin, ABDK | V3 fixed-rate | @NotionalFinance | fCash math |
| 17 | **Inverse Finance FiRM** | ~$45M (upper) | Multiple | DOLA/FiRM evolution | @InverseFinance | Custom oracle, past-exploit history |
| 18 | **Plutus DAO** | ~$3-10M Arb | Multiple | Active on Arb | @PlutusDAO | Governance + reward routing |
| 19 | **Gamma Strategies** | low-mid M | Trail of Bits | LP management ongoing | @GammaStrategies | CL-vault management |
| 20 | **Steer Protocol** | ~$15-20M | Multiple | Active Base expansion | @steerprotocol | Vault infra layer |

**Dropped from research-agent list and why:**
- Synthetix Perps, EigenLayer/Symbiotic/Karak, Pendle Finance — too big ($200M+ TVL), have audit retainers, won't reply
- LSDfi protocols heavy on oracle/price-manipulation — solhunt's weak zone, low conversion-confidence

---

## Outreach script

### The 4-message DM sequence

Cold DM, then await reply 48-72h, then send msg 2 if findings landed in the meantime, then msg 3 only after a reply. Don't follow up beyond 3 messages without engagement.

**Message 1 — initial cold (paste the actual scan output, not a generic pitch):**

```
Hi [team] — built a tool called solhunt that autonomously
writes working exploits for smart-contract vulns. Ran it
against [Protocol's specific contract] this morning.

[ONE OF THE FOLLOWING:]

Case A — found something real:
> Found a [class] issue in [function]. Forge test passes.
> Bundle attached: report.json + Exploit.t.sol. Free, no
> strings. Wanted to send before public post-mortem so you
> can verify and patch.

Case B — clean scan, want to pitch continuous:
> Scan came back clean (8 vuln classes considered, full
> report attached). $0.89 average per scan, 1-2min wall
> time. Happy to run continuous coverage on every
> [Protocol] contract upgrade for $1500/mo if useful —
> covers ~20 scans + Foundry-test artifacts.

Repo for context: github.com/claygeo/solhunt-duel
Beanstalk replay (1m44s, $0.65, $182M hack): [README link]

[Sender name]
```

**Message 2 — soft follow-up if no reply in 48h:**

```
Quick follow-up — happy to walk through the report on a
call or in DMs if any of it's unclear. Also fine to ignore
if it's not useful right now. Just didn't want this sitting
in your inbox without confirming you got it.
```

**Message 3 — only after a reply, conversion ask:**

```
Glad it was useful. The continuous-coverage offer:

- Every [Protocol] contract upgrade triggers a fresh scan
  automatically (proxy admin events watched, new impls
  scanned within the hour)
- Findings queue to a private review channel — nothing
  auto-public, nothing auto-submitted to bounty programs
- $1500/mo, no minimum term
- Free trial for 30 days against your full contract set if
  that's easier than a procurement decision

If yes, I just need (a) the contract addresses you want
covered and (b) where you want findings delivered (Slack /
Telegram / email).
```

### Why these messages and not generic outreach

- **Lead with the actual scan output.** Cold DMs with "I built a tool" go straight to spam. Cold DMs with "here's what I found in your contract" get read because you've done the work first.
- **Free first, paid second.** The first finding is *always* free. The pitch is for ongoing coverage. Don't try to monetize the initial scan — that's the lead magnet.
- **Honest about clean scans.** If the scan came back empty, say so. Don't hallucinate findings. Small DeFi teams have read 50 fake "I found a critical vuln" cold DMs this month and they pattern-match instantly.
- **Public reference point.** Link the GitHub repo in the first message. The Beanstalk replay is the credibility anchor — it's a real $182M hack that solhunt actually reproduced, and it's open-source so they can verify.

### Pre-conditions before sending message 1

Run this checklist for each target — if any item fails, skip the protocol:

- [ ] Contract address(es) verified in scope (no random impl scanning, especially after the RepoDriver false-positive lesson)
- [ ] Solhunt scan completed against ONE main contract — output saved
- [ ] If finding is positive: forensic verify the finding is NOT a cheatcode-bypass, NOT a permanent-pause-blocked function, NOT the impl rather than the proxy (per `findings/2026-04-27-RepoDriver-FALSE-POSITIVE-ANALYSIS.md` lessons)
- [ ] TVL verified on DefiLlama as of today (don't quote the number from this sheet)
- [ ] Team is genuinely small (1-5 visible devs) — if it's a 30-person team they have audit retainers already
- [ ] Latest audit was Sherlock / Code4rena / Cantina / OpenZeppelin / Trail of Bits — i.e. a real audit, not a Certik stamp
- [ ] At least one team member's Twitter is active in the last 30 days

### Conversion math

Realistic conversion rates on cold DM with attached findings:

- Reply rate: 30-50% (anyone who actually got a finding will at least say "got it, looking")
- Reply → 30-day trial: 10-15%
- Trial → paid $1500/mo: 30-50%

So 20 cold DMs → 6-10 replies → 2-3 trials → 1 paid customer = $1500/mo.

To hit $5K MRR (3-4 customers) need ~80-100 cold DMs sent over 8-12 weeks. The sheet above is the first batch of 20; second + third batches come from contest entries (people whose contests we attempt) and grant-funded scans (top-30 lists from Arbitrum / Optimism / Polygon ecosystem applications).

### Don't pitch out-of-scope

If a target has an Immunefi / HackenProof / HatsFinance bounty program AND solhunt found something real, **the bounty is the right financial channel — not the cold-pitch retainer.** Submit to the bounty, get paid the bounty (KYC if required, $20K-$50K typical for medium severities), THEN mention continuous coverage in the bounty submission's "future work" section. Don't pitch a $1500/mo retainer on top of a $20K bounty payment — it cheapens both.

### Status tracking

Each protocol contacted gets a row in `findings/cold-outreach-log.csv` (TODO — create after first scan):

```
date,protocol,contact,channel,status,scan_bundle_path,reply,notes
2026-04-28,Sturdy V2,@SturdyFinance,twitter_dm,sent,findings/2026-04-28-Sturdy/,,first cold pitch
```

Don't keep this log in your head. The point of the script is repeatability.
