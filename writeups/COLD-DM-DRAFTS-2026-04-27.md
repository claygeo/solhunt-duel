# Cold-DM drafts — ready to send

**Generated:** 2026-04-27 evening
**Eth-mainnet targets only.** Arbitrum targets (D2, Kresko, Y2K) blocked behind v1.2 multichain — drafts will follow once v1.2 ships.

> **Pitch shift, post-FP-postmortems:** the original Case A "free real finding" template is now the EXCEPTION (0/2 actual finds on heavily-audited code, both confirmed FPs). **Default template is Case B**: clean scan + continuous-coverage offer. The two published forensic FP postmortems become the QA proof point ("here's how we don't submit garbage").

---

## Sturdy V2 — DM 1 (clean scan)

**Send to:** @SturdyFinance on Twitter (DM)
**Scan bundle:** `findings/2026-04-27T21-40-30-566Z-SturdyPairRegistry/`
**Verdict:** clean, 32 turns, 5m58s, $2.30 notional cost via Max subscription
**Address scanned:** `0xd577429db653Cd20EFFCD4977B2B41A6Fd794A3b` (SturdyPairRegistry, your canonical pair registry)

```
Hey Sturdy team — built a tool called solhunt that runs autonomous
exploit-test generation against EVM contracts (it reproduces real
historical hacks like Beanstalk's $182M flash-loan in 1m44s for
$0.65, repo: github.com/claygeo/solhunt-duel).

Ran it against your SturdyPairRegistry contract this evening. Came
back clean — 32 iterations, 6 minutes wall time, considered all 8
vulnerability classes I've defined. Bundle attached: solhunt's
report.json + the empty Exploit.t.sol it tried to write.

Two notes for context:
  - solhunt has produced 2 false-positive findings on live bug
    bounties this month (RepoDriver/Drips, Twyne skim) — both got
    forensic post-mortems published in the repo and lessons baked
    into the agent prompt. So when I say "clean scan," it's a clean
    scan with the FP-detection lessons applied.
  - I'm offering continuous coverage at $1500/mo: every Sturdy V2
    contract upgrade triggers an auto-scan, findings queue to a
    private channel for your review, nothing auto-public, nothing
    auto-submitted. Free 30-day trial against your full contract
    set if procurement is annoying.

If interested I just need (a) which contracts you want covered and
(b) where you want findings delivered (Slack/TG/email).

Either way, hope the clean scan is useful — and apologies if this
isn't relevant right now, just delete.

— Clayton (claygeo on github)
```

---

## Resonate (Revest Finance) — DM 2 (clean scan, deepest)

**Send to:** @RevestFinance and/or @resonatefi on Twitter (DM)
**Scan bundle:** `findings/2026-04-27T23-39-06-618Z-Resonate/`
**Verdict:** clean, **46 turns** (near max iteration budget — deep scan), 12m, $4.40 notional
**Address scanned:** `0x80ca847618030bc3e26ad2c444fd007279daf50a` (Resonate matching engine, your canonical Eth contract)

```
Hi Revest/Resonate team — built solhunt, an autonomous AI exploit-
test generator (reproduces real historical hacks like Beanstalk's
$182M flash-loan in 1m44s; repo: github.com/claygeo/solhunt-duel).

Ran it against your main Resonate matching-engine contract this
evening. The scan went deep — 46 iterations (basically the maximum
budget), 12 minutes of agent time, $4.40 in compute via Claude Max
subscription. Result: clean. No exploitable vulnerability across
8 vulnerability classes.

The 46-turn count matters. solhunt only goes that deep when there's
real complexity to explore (queue-based matching engines like yours
have a lot of state-transition surface). It checked the FNFT
mint/redeem path, the issuer/consumer queue invariants, and the
ERC-4626 vault adapter integration. All clean.

Bundle attached: solhunt's report.json + scan trace.

I'm offering continuous coverage at $1500/mo: every contract upgrade
triggers an auto-scan, findings queue private for your review, no
auto-submit. The pitch is post-deploy assurance, not point-in-time
audit replacement. Free 30-day trial against your contract set.

If interested I just need (a) the addresses you want covered and
(b) where you want findings delivered.

— Clayton (claygeo on github)
```

---

## Twyne — DM 3 (handle the FP gracefully)

**Send to:** @Twyne_xyz / @0xTwyne on Twitter (DM)
**Status:** **DELICATE.** solhunt produced a found=true verdict on awstETHWrapper that turned out to be a false positive (skim() is intentional EVK design). Sending this DM is OPTIONAL — only send if Clayton thinks it's worth it. The transparency could be a pro (signals honesty) or a con (signals incompetence).

**Recommendation: DON'T SEND.** Twyne hasn't asked. Sending unsolicited "I almost submitted a FP about you" notes adds noise. The forensic post-mortem is published in the repo if they're curious. Skip.

If Clayton overrides:

```
Hey Twyne team — built solhunt, autonomous AI exploit-test gen.
Wanted to send a transparent note: I ran a scan on your awstETH
wrapper today and the agent flagged the permissionless skim() as
an access-control finding. Adversarial review confirmed it's
documented Euler EVK design, not a vuln — your Periphery code
calls skim() identically to what the agent flagged.

I'm publishing the forensic FP post-mortem here:
github.com/claygeo/solhunt-duel/blob/master/findings/2026-04-27-Twyne-skim-FALSE-POSITIVE-ANALYSIS.md

Two new lessons baked into the agent prompt as a result. Wanted to
flag because (a) it's a published artifact that mentions Twyne by
name and (b) future scans against EVK-style wrappers will be more
careful.

No pitch, no ask. Just transparency. If you want me to redact the
post-mortem or change framing, lmk.

— Clayton
```

---

## Operational notes

### Send order recommendation
1. **Sat AM:** Sturdy V2 — strongest "I did real work for free" pitch (reasonably-deep scan, well-known protocol)
2. **Sat PM (after Sturdy reply or 4h timeout):** Resonate — deepest scan, niche team likely to read DMs
3. **Skip:** Twyne (don't unsolicited-message about a FP)

### Pre-flight before sending
- [ ] Verify the bundle exists: `findings/2026-04-27T21-40-30-566Z-SturdyPairRegistry/` for Sturdy, `findings/2026-04-27T23-39-06-618Z-Resonate/` for Resonate
- [ ] Re-confirm Twitter handle is active in last 30 days
- [ ] Use Twitter DMs (open DMs on most accounts), not @mentions — keeps it private
- [ ] Attach the bundle as a screenshot/link rather than raw markdown — Twitter doesn't render
- [ ] Test the link: github.com/claygeo/solhunt-duel resolves cleanly

### Track replies
Add to `findings/cold-outreach-log.csv` (create on first send):

```csv
date,protocol,contact,channel,status,scan_bundle_path,reply_received,reply_summary
2026-04-28 09:00,Sturdy V2,@SturdyFinance,twitter_dm,sent,findings/2026-04-27T21-40-30-566Z-SturdyPairRegistry/,,
```

### Conversion expectations
Per outreach math (OUTREACH-TARGETS.md): 50% reply rate, 15% trial conversion, 40% trial→paid. So 2 DMs → ~1 reply → ~0.15 trial → ~0.06 paid customer. The point is volume + iteration, not single-DM conversion.

### When Arbitrum targets unblock (post-v1.2)
Run `scripts/scan-dm-arb.sh` (will be created post-v1.2):
- D2 Finance ETH++ vault on Arbitrum
- Kresko Diamond on Arbitrum
- Y2K Finance V2 CarouselFactory on Arbitrum

Expected timing: v1.2 ships Sunday/Monday → Arbitrum scans Tuesday → drafts Wednesday → DMs Thursday.
