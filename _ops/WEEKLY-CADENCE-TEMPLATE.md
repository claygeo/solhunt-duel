# Solhunt-Duel Weekly Drop — Friday Cadence Template

> **Purpose:** Friday post that compounds Solhunt-Duel as an inbound recruiting funnel. Every week recruiters at AI-safety / agent-eval shops see the leaderboard grow. Over 12 weeks, that's 12 datapoints of "this person ships every week" + 12 honest results posts (some wins, some failures published plain) + 12 chances for one of them to get screenshotted into a hiring channel.
>
> **Writer:** Clayton (or Claude on Clayton's behalf, after Clayton wakes up — never autonomous).
> **Cadence:** Every Friday, 10:00am ET (peak LinkedIn engagement for tech audience).
> **Channels (in order):** LinkedIn → X/Twitter → Substack (long-form on slow weeks) → bluesky (eventually).
> **Hard rule:** Never claim a result you can't link to a forge-test PASS or a structured no-find report. Honesty compounds; spin destroys.

---

## Pre-flight checklist (before hitting Post)

- [ ] At least one new duel ran this week (success OR failure both publishable)
- [ ] Leaderboard.html updated with the week's runs (`solhunt/docs/leaderboard.html` + `solhunt/ui/public/leaderboard/index.html`)
- [ ] Leaderboard deployed to https://solhunt-duel.netlify.app/leaderboard/
- [ ] Numbers in post match numbers on leaderboard (no rounding cheats)
- [ ] If a previous week's claim turned out wrong: lead with the correction THIS week
- [ ] /codex outside-voice review on the draft post (catches misleading framings before recruiters do)

---

## Template — Standard Friday Drop

```
This week in Solhunt-Duel: [one-sentence headline of the most interesting result]

📊 [N] new duels run this week
✅ [hardened-blue count] hardened (red found exploit, blue patched, all 4 gates passed)
⚠ [red-failed count] red failed to find an exploit (could be safe, could be harness limit)
❌ [blue-failed count] red found exploit, blue couldn't patch in budget
↻ [same-class count] blue patch shipped, red pivoted to same vuln class — escaped

Cumulative leaderboard (now [total] contracts):
- Curated 32-contract benchmark: 67.7% exploit rate at $0.89/contract
- Random 95-contract honest eval: 13.7%
- Phase 4 duel set: [N] contracts, [X]% hardened-blue rate

This week's most interesting moment:
[1-2 sentences. Pick the run with the highest learning content, not the highest stat. 
"Red autonomously pivoted from CVE-2023-XXXX to a different vuln class when fork storage didn't match" 
is more interesting than "we hit 70% on the easy ones."]

Honest gap from this week:
[1 sentence on what didn't work. If nothing didn't work, this week was probably too easy. 
"3/5 runs hit our 1-hour wall-clock cap before convergence — need to revisit harness budget" 
is the kind of admission that builds trust. Recruiter brains pattern-match on "publishes negative results" = "honest engineer worth interviewing."]

Full leaderboard with click-to-expand round-by-round: solhunt-duel.netlify.app/leaderboard/
Repo: github.com/claygeo/solhunt-duel
```

---

## Variants by week-state

### Week with only failures (lean into it)

```
Week [N] in Solhunt-Duel: 0 new convergences. Here's why that's still data.

Ran [N] new contracts this week. Zero hardened, [X] blue-failed, [Y] same-class-escaped.

That's a real signal about Phase 4's blue agent budget cap. The pattern from this week's
runs: red consistently finds exploits in 1 round, but blue exhausts our token budget
trying to patch the bug WITHOUT introducing new ones — the storageLayoutPreserved
gate keeps catching unintended state shifts.

Two options on the table for next week:
(a) Raise blue budget cap from [X]K to [Y]K tokens — see if blue converges given more rope
(b) Add a 'storage layout proposal' tool so blue can propose layout changes explicitly
    instead of accidentally drifting them

Going with (a) because it's the cleaner ablation. If blue still fails at 2x budget, 
the bottleneck is reasoning depth not budget, and (b) becomes the right next step.

Leaderboard updated: solhunt-duel.netlify.app/leaderboard/
```

### Week with one cinematic result (lead with the moment)

```
This week Solhunt-Duel reproduced the [protocol] [class] vuln in [time] at [cost].

[1-paragraph summary of the run. What red did. What blue did. Where it converged. 
Link to the specific run page if individual run pages exist. Otherwise link to the 
leaderboard row that expands to show it.]

The four server-side gates the LLMs cannot see or modify — exploitNeutralized,
benignPassed, freshAttackerNeutralized, storageLayoutPreserved — all passed.
That's the whole game: the agent doesn't get to declare success, the harness does.

Watch the asciinema reconstruction: [link]
Leaderboard with full round-by-round: solhunt-duel.netlify.app/leaderboard/
```

### Week with a correction (most credibility-building variant)

```
Correction on last week's [claim]. Posting this before anyone notices.

Last Friday I claimed [X]. The correct number is [Y]. Source of the error:
[honest 1-2 sentences]. Leaderboard updated, screenshot of corrected row attached.

This is going to happen periodically. Solhunt-Duel runs autonomously and the
benchmark numbers move as new contracts hit it. The discipline I want to keep:
catch and post corrections same-week, not bury them.

This week's fresh runs: [N] contracts, results below.
[continue with standard format]
```

---

## What NOT to post

- Implication that 67.7% is the "real" number when 13% is the random-sample honest version. Always show both.
- "Outperforms [competitor]" framing unless there's an apples-to-apples benchmark (SCONE-bench is the closest, see leaderboard footnotes for the comparison)
- Cherry-picked best-of runs without showing the failures
- Claims about specific protocols' security based on red-failed (only means our agent didn't find a bug in budget, NOT that the contract is safe)
- Solhunt-Duel-as-a-product framing — it's a research artifact, not SaaS. Treating it as a product invites enterprise-procurement skepticism we don't need
- Names of recruiters / hiring managers we're hoping to get noticed by

---

## Posting checklist (after writing draft)

- [ ] /codex outside-voice review of the draft (specifically: "would a recruiter at an AI-safety shop screenshot this favorably or unfavorably?")
- [ ] All numbers cross-referenced against leaderboard.html
- [ ] All link URLs tested manually
- [ ] No em-dashes, no AI-vocabulary tells (`delve`, `crucial`, `robust`), no `Here's the thing` openings
- [ ] No mention of operator's day job employer (separation of concerns)
- [ ] Image attached: leaderboard screenshot of the week's row (high engagement)
- [ ] LinkedIn post first, X/Twitter rephrased to fit char limit, Substack expansion if a long-form story
- [ ] Schedule for 10am ET Friday (or post live if Friday morning) — never auto-schedule

---

## Tracking sheet (update each week)

| Week | Date | Runs | Hardened | Blue-Failed | Notable | LinkedIn URL | Engagement (week+1) |
|---|---|---|---|---|---|---|---|
| 1 | 2026-05-02 | | | | | | |
| 2 | 2026-05-09 | | | | | | |
| 3 | 2026-05-16 | | | | | | |
| 4 | 2026-05-23 | | | | | | |

(Re-evaluate at week 4: is the engagement compounding? If post-1 got 200 views and post-4 got 1500, the funnel is working. If flat or declining, change format / channel mix.)

---

## When to STOP posting (the off-ramp)

If by week 8:
- Zero recruiter inbounds AND zero engagement growth → format isn't working, switch to long-form Substack only
- Negative engagement (mockery, "another AI security demo bro" replies) → kill social, keep building, let the leaderboard speak
- Operator landed a $100K+ offer through other channels → cadence becomes optional, not mandatory

The cadence is a TOOL not an identity. Stop when the tool stops paying its rent.
