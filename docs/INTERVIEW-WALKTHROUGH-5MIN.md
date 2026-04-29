# Solhunt-Duel — 5-Minute Architecture Walkthrough

> **For:** screen calls / phone interviews where someone says "tell me about your projects."
> **Time budget:** 5 minutes spoken (~750-900 words). Includes pauses for questions.
> **Format:** memorize the structure, not the words. Practice once before each interview to keep it cold-fluent.
> **Goal:** by the end of 5 minutes the interviewer can (a) explain what Solhunt-Duel is to a colleague, (b) name at least one technically interesting design decision, (c) ask a follow-up question that's specific, not generic.

---

## The structure (5 beats, ~1 min each)

1. **The premise** — why agents need external verifiers (~45s)
2. **The setup** — what Red and Blue do, what the harness does (~60s)
3. **The four gates** — what each one catches, with one concrete example (~75s)
4. **The honest failure** — 67.7% / 13.7% gap, why it's the most important number (~60s)
5. **What I'd do next** — v2 corpus, what it measures, what it doesn't (~60s)

Total: ~5 min spoken, slightly more if interviewer interrupts (good).

---

## Beat 1 — The premise (~45s)

> "I built Solhunt-Duel because of something I noticed in the predecessor project, Solhunt. Solhunt is a single-agent security scanner. You give it a smart contract, it writes a Foundry exploit if one exists, otherwise it emits a no-find report.
>
> On 32 curated DeFiHackLabs exploits, it hit 67%. On 95 random contracts from the same dataset, it hit 13%. Same agent, same prompts, same model — only the curation changed.
>
> The 54-point gap was the project's real result. And it told me something specific: I had been letting the agent grade itself. The 67% number was 'agent says it found a bug,' which on the 13% random set was sometimes true and sometimes a hallucination. I needed a verdict that lived outside the agent.
>
> That's the whole premise of Solhunt-Duel. Agents will lie about success if you let them. Don't let them."

**If interviewer interrupts:** "What do you mean by lie?" → answer concisely, then continue: "The agent isn't malicious — it's pattern-completing. It's been trained to write summaries that sound conclusive. So it generates summaries that sound conclusive whether or not the underlying claim is true."

---

## Beat 2 — The setup (~60s)

> "Solhunt-Duel is adversarial: a Red agent and a Blue agent take turns. Red reads the source and writes an exploit. Blue reads the source plus Red's exploit and writes a Solidity patch. Each agent runs against a real Anvil fork — they're not reasoning about hypothetical state, they're writing code that has to actually execute against EVM bytecode.
>
> The thing that makes it work is the harness in the middle. After every Blue patch, the harness compiles the patched contract, extracts the runtime bytecode, vm.etches that bytecode onto a fresh deterministic fork address, and runs four checks. The agents don't see the harness code, the test results, or the bytecode comparison. They only see a JSON verdict at the end."

**Show, don't tell:** if you have your laptop open, share the leaderboard URL — `solhunt-duel.netlify.app/leaderboard/`. The four-gate stat cards make this concrete in two seconds. If on phone, just describe.

---

## Beat 3 — The four gates (~75s)

> "Four gates. Each one catches a specific failure mode.
>
> **First: exploitNeutralized.** Red's exploit is replayed against the patched bytecode. It must fail. If it passes, the patch did nothing.
>
> **Second: freshAttackerNeutralized.** Same exploit, same patched contract, but the attacker is a fresh derived EOA — different address. We caught Blue trying `require(msg.sender != ATTACKER_ADDR)` patches in the first batch of duel runs. The fresh-attacker gate makes that strategy fail mechanically.
>
> **Third: benignPassed.** The contract's normal operation tests still pass. The trivial patch for any vulnerability is 'delete the function.' That kills the exploit AND every legitimate user. The benign suite catches that.
>
> **Fourth: storageLayoutPreserved.** This is the subtle one. vm.etch swaps runtime bytecode but leaves storage untouched. If Blue reorders or resizes a storage variable, the live contract's existing state gets reinterpreted under the new layout — silent corruption. The gate compares the storage layout JSON solc emits at compile time."

**If they ask why four:** "They're orthogonal. Each gate catches a class of bad patch the other three would miss. The fresh-attacker gate isn't redundant with exploitNeutralized — a hardcoded-address patch passes #1 and fails #2."

---

## Beat 4 — The honest failure (~60s)

> "On the 10-contract Phase 4 duel set we have one fully-converged hardened run, three blue-failed runs, three red-failed, one same-class escape, two timeouts. That's 1/10 fully hardened.
>
> I publish that. I publish the 67% / 13% gap from Solhunt. I also published a finding earlier this week — a Twyne Aave wrapper bug the agent claimed was Medium severity. I did the responsible-disclosure prep, but Codex outside-voice review rejected it: the function was intentionally inherited from BGD upstream, the exploit required a user-error precondition, and Twyne's bounty has no Medium tier. So we wrote a REVIEWED-REJECTED sidecar, preserved the agent's original output for honest record, and shipped no submission.
>
> The pattern matters more than any individual result. The agent caught a candidate, the outside-voice review caught the false positive, the trail is in the repo. Honesty compounds. Spin destroys. That discipline is what I want to bring to whatever team I land at."

---

## Beat 5 — What I'd do next (~60s)

> "Two things.
>
> **One: corpus expansion to v2.** Today I have 32 confirmed exploits. The thing my benchmark cannot measure today is false-positive rate — what does the agent do on a contract with NO known bug? I have a plan for 10 adversarial-clean contracts with severity-weighted scoring and near-miss controls. If the agent fabricates findings on, say, USDC, that's the failure mode that would matter most to a deployment. I want to measure it before I claim anything.
>
> **Two: generalizing the principle.** The pattern — agent writes the artifact, harness writes the verdict — applies to coding agents (diff against hidden tests), tool-use agents (verify side effects against hidden expected diff), research agents (grade against criteria the agent doesn't see). I'd want to work somewhere that's already thinking this way and could push the discipline further."

---

## Variants by interview type

### Quick screening call (3 minutes, not 5)

Drop Beats 4 and 5 if time-pressed. Keep 1-2-3. End on: "Honest about a 67% → 13% gap on the predecessor; that's why this project exists." Interviewer asks for more, you have it. They say "thanks, that's all," you stayed in time.

### Deep technical (15+ minutes)

Walk all 5 beats, then offer: "Want me to walk through the verifier code line-by-line? I can pull up [PROOF.md](PROOF.md) and show the exact gate computation in `src/sandbox/patch-harness.ts`." If yes, share screen and walk lines 89-223.

### Behavioral / hiring manager (not technical)

Skip the gate names. Substitute Beat 3 with:

> "The harness checks four things in sequence: did the patch actually neutralize the exploit, did it work against a different attacker, does the contract still do its normal job, did the patch preserve internal state structure. Each one catches a different failure mode the agent wouldn't catch on its own."

End with: "The reason this project exists is that I caught my own predecessor lying to me on its own benchmark. The gap between curated and random was 50 points. I felt embarrassed, then I published it, then I built this to fix it. That's the cycle I want to keep doing."

---

## What NOT to say

- Don't compare directly to SCONE-bench or any specific paper unless asked. The numbers aren't apples-to-apples.
- Don't oversell the convergence rate. 1/10 hardened is a small sample with high variance.
- Don't claim the agent "found a 0-day" or "discovered a vulnerability" without immediately following with the rejection context. The Twyne find was a candidate, not a confirmed bug.
- Don't pitch Solhunt-Duel as a product or service. It's a research artifact. "Building a startup around it" reframes the conversation in a direction that hurts more than it helps for AI safety roles.
- Don't trash other tools (academic benchmarks, Inspect-AI, Anthropic's SCONE-bench, etc.). Adjacent work is allies, not competitors.

---

## What to have on hand for the call

- **Live URL ready to paste:** `solhunt-duel.netlify.app/leaderboard/`
- **Repo URL ready to paste:** `github.com/claygeo/solhunt-duel`
- **PROOF.md URL ready:** `github.com/claygeo/solhunt-duel/blob/master/docs/PROOF.md`
- **Two-sentence summary memorized:** "Solhunt-Duel is an adversarial AI agent system for smart contract auditing. The premise is that agents will lie about success if you let them, so the verdict lives in a server-side harness the agents can't see or modify."

---

## Practice notes

- Read this aloud twice before any interview where Solhunt-Duel might come up. Adjust phrasing to feel natural in your voice.
- The 67% / 13% delivery is the most underdone part on first practice. Practice it specifically — the comma after "13%" matters, the pause matters, the "same agent, same prompts, same model" beat matters.
- Time yourself once. If you're under 4 minutes, you're rushing. If you're over 6, you're including too much detail.
- The interviewer's first question after this walkthrough is the most important data point. If it's specific ("how do you handle stateful exploits?") — you delivered well. If it's generic ("interesting, can you tell me about your work at Curaleaf?") — the architecture didn't land. Iterate the script.

---

## Honest meta-note

This walkthrough is for jobs where Solhunt-Duel is a relevant signal. For Curaleaf-equivalent backend roles, lead with Curaleaf platform engineering. For Anthropic FRT / Modal / Sourcegraph / agent-eval roles, lead with this. Match the artifact to the audience. Don't pitch Solhunt-Duel to a hiring manager who's looking for a payments engineer.

---

## Appendix — 60-90 second demo recording script

> **For:** the README's autoplay demo video (codex's #1 missing artifact — recruiters won't `asciinema play` but they will watch a 60s embedded GIF/MP4).
> **Length target:** 60-90 seconds. Optional narration: silent + on-screen captions if you don't want voice.
> **Tools:** any screen recorder (QuickTime on macOS, OBS, Loom). Export as MP4 first, convert to GIF if file size matters for README embedding.

### Exact recording flow (5 beats × ~15s each)

**Beat 1 — Land on the leaderboard (0:00-0:15)**
- Open https://solhunt-duel.netlify.app/leaderboard/
- Scroll the headline card showing "$182M / 1m 44s / $0.65"
- Pause 1-2 seconds on "Adversarial AI Agents for Smart Contract Auditing"
- Caption (if silent): `"Solhunt-Duel — public benchmark for adversarial AI agents auditing smart contracts."`

**Beat 2 — Show the four-gate stat cards (0:15-0:30)**
- Scroll down to the per-tier stat cards (1 hardened / 3 red-failed / 3 blue-failed / 1 same-class-escaped / 2 timeout)
- Hover briefly on each label (no clicks yet)
- Caption: `"Five honest convergence labels. Not 'agent says success' — harness says success."`

**Beat 3 — Expand the Dexible row (0:30-0:50)**
- Scroll to the Phase 4 results table
- Click the `▸ Dexible` row to expand
- Pause showing the round 1 detail: red 8 turns / 41.8s, blue 80 turns / 691.7s, all gates green
- Briefly scroll the embedded `Exploit.t.sol` source preview
- Caption: `"Dexible — only HARDENED Phase 4 run. Red wrote the exploit in 8 turns, Blue wrote the patch in 80 turns, four server-side gates all green."`

**Beat 4 — The four-gate breakdown (0:50-1:10)**
- Scroll to the gates section showing exploitNeutralized / benignPassed / freshAttackerNeutralized / storageLayoutPreserved all green
- Slow pan or zoom on the gate names
- Caption: `"Four gates. Server-side. The agents never see the verdict code. They only see PASS or FAIL after submitting."`

**Beat 5 — Land on PROOF.md or repo (1:10-1:30)**
- Click the "GitHub" link or navigate to `github.com/claygeo/solhunt-duel/blob/master/docs/PROOF.md`
- Brief pan over the line-numbered TypeScript snippets in PROOF.md
- End on the URL or repo name visible
- Caption: `"Read the gate verifier line-by-line at docs/PROOF.md."`

### Optional narration (if voiced, ~120 spoken words)

> "This is Solhunt-Duel. An adversarial agent system for smart contract auditing.
>
> The premise: agents will lie about success if you let them. So the verdict here lives outside the agent — in a server-side harness with four atomic gates the LLMs cannot see or modify.
>
> On this Phase 4 run set, one out of ten contracts converged to fully hardened. Three blue-failed, three red-failed, one same-class escape, two timeouts. All five labels published.
>
> Here's Dexible — the only HARDENED run. Red wrote the exploit in 8 turns. Blue wrote a Solidity patch in 80 turns. Four gates checked: exploit neutralized, benign suite passed, fresh-attacker also neutralized, storage layout preserved.
>
> The four gates plus the verifier source are at github.com/claygeo/solhunt-duel/blob/master/docs/PROOF.md."

### Editing notes

- **Don't include the `<details>` collapse animation** — it's distracting. Pre-expand the Dexible row before recording, or use a smooth scroll instead.
- **Hide the browser chrome** — full-page screenshot or tab-only view. Recruiters don't need to see your bookmarks bar.
- **Keep cursor smooth** — slow, deliberate movement. No cursor jitter.
- **First take is rarely best.** Plan to do 3-5 takes, pick the cleanest. Total recording session: ~30 min for ~90s of usable footage.
- **Export at 1080p, ≤30 fps.** GitHub README embedding tolerates ~10 MB MP4 well; don't worry about smaller.

### Where to put the file

Once recorded:
- Upload as a release asset to https://github.com/claygeo/solhunt-duel/releases (avoids bloating the repo)
- Or commit a `.gif` to `docs/demo/solhunt-duel-60s.gif` if file size is small
- Embed in README.md immediately after the front-door TL;DR:
  ```markdown
  ![Solhunt-Duel 60s demo](docs/demo/solhunt-duel-60s.gif)
  ```

### What this demo deliberately does NOT do

- Doesn't show actual agent reasoning live (boring, hard to caption, can't fit in 90s anyway)
- Doesn't show terminal output (recruiters don't read terminals in 90s; they read visuals)
- Doesn't try to explain the v1 67%/13% gap (that's the README + Substack post job, not the demo's)
- Doesn't include sound effects or music (filler — the content speaks for itself)
