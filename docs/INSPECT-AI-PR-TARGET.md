# Inspect-AI PR Target — Issue #3770 (Verification Taxonomy)

> **Status:** RESEARCH ONLY. Per /codex outside-voice review of [V2 plan](PLAN-V2-BENCHMARK-EXPANSION.md), Inspect-AI integration is SEQUENTIAL with v2 corpus expansion, not parallel. This document identifies the target; execution is deferred until after v2 ships.

## What is Inspect-AI

[Inspect-AI](https://github.com/UKGovernmentBEIS/inspect_ai) is the UK AI Security Institute's eval framework. Maintained by Joe Allaire (jjallaire — RStudio founder, now at the UK AISI). 200+ pre-built evals, used by AISI for the model assessments they publish on frontier systems. Anthropic, Google DeepMind, and OpenAI all engage with AISI evals.

For Solhunt-Duel's positioning: **upstreaming a contribution to Inspect-AI puts the operator in the same review thread as Anthropic / DeepMind / AISI staff.** The /codex outside-voice review called this the "Trojan horse" path because:

1. PR review by named maintainers = visible artifact
2. Maintainers are the same people / same orgs operator wants to land at
3. The contribution itself doubles as a portfolio piece

## The target: Issue #3770

**URL:** https://github.com/UKGovernmentBEIS/inspect_ai/issues/3770
**Title:** "verification taxonomy on @scorer + opt-in Task(verifiable=True) lint"
**Author:** smledbetter (community contributor, has shipped a working external extension package)
**Status:** Open, no maintainer triage yet, no comments

### Why this is the right target

The issue proposes adding a `verification` field to Inspect's `@scorer` decorator that distinguishes deterministic graders from model-graded ones, with a `Task(verifiable=True)` lint that warns when a verifiable task is registered with a model-graded scorer.

This is **literally Solhunt-Duel's PROOF.md thesis applied to the eval framework itself**:

| Solhunt-Duel | Inspect-AI #3770 |
|---|---|
| "Agents will lie about success if you let them" | "Tasks with deterministic checks silently default to model-graded when an author reaches for `model_graded_qa` first" |
| Server-side gates the LLM cannot see | Deterministic scorers, not LLM-judged |
| 4 atomic gates (`exploitNeutralized`, etc.) | `verification="deterministic"` field |
| `forge test` is the verdict, not the agent | The deterministic grader is the verdict, not the model |

The PR target is small (~50 LOC additive, 8 self-tagged built-in scorers, 5 unit tests). The contributor has already done the hard work in their external [`inspect-build-time-contract`](https://github.com/smledbetter/inspect-build-time-contract) package — there's working code we can cite.

### The PR shape (when ready)

After v2 corpus ships, operator's contribution sequence:

1. **Comment on #3770** with:
   - Endorsement of the direction
   - Citation of Solhunt-Duel as analogous design from a different domain (smart-contract auditing)
   - One paragraph from PROOF.md about how the same problem appears in security agents
   - Offer to help land the in-core taxonomy
2. **Wait for maintainer triage** — let jjallaire or another core contributor weigh in. If they say "we want this in core," proceed to PR. If they say "external extension is fine," substitute Target #2 below.
3. **Open a draft PR** following the proposal:
   - Add `verification: Optional[Literal["deterministic", "model_graded"]] = None` to `@scorer`
   - Tag built-in scorers (`match`, `includes`, `pattern`, `exact`, `f1`, `answer`, `choice`, `math` as `"deterministic"`; `model_graded_qa`, `model_graded_fact` as `"model_graded"`)
   - Add `verifiable: bool = False` to `Task`
   - Lint at task load: warn if `verifiable=True` AND scorer has `verification="model_graded"`
   - Optional `[tool.inspect_ai] strict_verification` config to escalate warning to error
   - 5 unit tests (verification field round-trip, lint warning fires, lint warning doesn't fire on deterministic, strict mode errors, default behavior unchanged)

### Why the operator should be the one to land this

Operator's positioning lifts:
- **Anthropic FRT (Cyber + Autonomy roles)** — these explicitly value "infrastructure for evaluating AI systems in security environments." A merged Inspect-AI taxonomy PR + Solhunt-Duel = "this person ships eval infrastructure."
- **Modal Labs** — runtime / sandbox eval focus.
- **Sourcegraph IC2** — already staged in career-ops; agentic-tools requirement matches exactly.
- **AISI itself** — UK government AI safety institute. Public-interest mission, hires aggressively for eval engineers.

### Backup target if #3770 closes / gets handled by maintainers

**Issue #3769 (RFC: checkpointing and mid-sample resumption)** by jjallaire himself — much larger architectural RFC. Not a 50-LOC PR; more like a multi-PR series. Higher risk, higher reward — but operator is unlikely to own this end-to-end at 1.5 YOE.

Better backup: scan for new "good first issue"-style work after v2 ships. Inspect-AI moves fast; new issues will be open.

## What this dossier deliberately does NOT do

- **Open the PR now.** Per /codex review, sequential with v2 corpus. Premature contribution = thin signal.
- **Comment on the issue now.** Same logic. Comment when there's something concrete to add (PROOF.md cite + Solhunt-Duel reference, both polished).
- **Frame Solhunt-Duel as a competitor to Inspect-AI.** They're complementary. Solhunt-Duel could BE an Inspect-AI eval pack in a future iteration. Don't position adversarially.

## Pre-conditions before opening the PR

- [ ] V2 corpus shipped (Tier C at minimum) and leaderboard reflects new numbers
- [ ] PROOF.md is publicly accessible at solhunt-duel.netlify.app or github.com/claygeo/solhunt-duel
- [ ] Operator has read the [Inspect-AI CONTRIBUTING.md](https://github.com/UKGovernmentBEIS/inspect_ai/blob/main/CONTRIBUTING.md) (assume linked from repo root)
- [ ] Operator has a clean `inspect-ai` dev environment locally (`pip install inspect-ai`, run a sample eval, confirm tests pass)
- [ ] Operator has reviewed this dossier + made the PR opening their own decision

## Decision sought from operator (FUTURE — not tonight)

When v2 ships:

- [ ] Approve targeting issue #3770 (or substitute backup)
- [ ] Approve commenting first vs opening draft PR directly
- [ ] Approve citing Solhunt-Duel + PROOF.md in the comment / PR body

## Files this dossier supports

- [PLAN-V2-BENCHMARK-EXPANSION.md](PLAN-V2-BENCHMARK-EXPANSION.md) — gates this work behind v2 ship
- [PROOF.md](PROOF.md) — content to cite in the PR comment
- [INTERVIEW-WALKTHROUGH-5MIN.md](INTERVIEW-WALKTHROUGH-5MIN.md) — Beat 5 ("what I'd do next") gets stronger after this lands

## Estimated effort (when triggered)

- Comment on #3770: ~30 min
- If maintainer green-lights: draft PR ~4-6 hours (50 LOC + tests + docs + first round of review iteration)
- Iteration on PR review: ~2-4 hours over 1-2 weeks
- Total: ~1 work day spread across 2 weeks

This is well-suited to "background work after v2 ships" — small enough to ship in the gaps between higher-priority work, big enough to be a real contribution.
