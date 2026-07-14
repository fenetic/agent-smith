# 07 — Eval Harness — Design

> Implementation design for [Work Item 07](07-eval-harness.md). Covers the labelled
> case set, how a run is scored against human ground truth, and — the part that
> matters most — how disagreements are classified by *safety*, not just counted. It
> runs [04](04-compliance-agent.design.md) end-to-end and realizes the ambiguous
> cases planted in [01](01-registry-data-layer.design.md).

## Approach

07 is the eval harness. It runs the agent over a fixed set of code snippets whose
correct verdicts a human has already decided, compares what the agent said to those
labels, and reports where they agreed and where they did not.

It exists because the project's central claim — that an agent handles ambiguous
drift better than a rule can — is only an assertion until it is measured. The
harness is the measurement. It is also where the "eval for AI features" discipline
the role cares about is shown concretely: not "it seemed to work in the demo," but
a repeatable score against labelled ground truth.

How it fits: the cases realize the ambiguous ingredients planted in 01 (plus some
deliberately unambiguous ones) into full labelled snippets; the harness runs each
through the agent (04) end-to-end, reads the `Report` it produces, and diffs it
against the labels. Ground truth is human-authored. 07 measures; it changes nothing
about how the agent works.

## The case set

Each case is a snippet, the version to audit it at, and the human-labelled verdicts
expected for it:

```
EvalCase
  id:       string
  snippet:  string              // the code to audit
  version:  Version             // target version to audit at
  expected: ExpectedFinding[]   // ground-truth verdicts, by usage
  notes:    string              // the human's rationale for the label

ExpectedFinding
  target:   string              // the usage, e.g. "<Modal>"
  outcome:  "compliant" | "violation" | "allowed-exception" | "needs-review"
```

The set spans two kinds of case on purpose:

- **Ambiguous** — the 01 seeds realized as concrete snippets. Because intent lives
  in the snippet (per 01), a single seed spawns *several* cases: the deprecated
  `Modal` appears on legacy-signalled code (expected `allowed-exception`), on
  active-looking code (expected `violation`), and with no signal at all (expected
  `needs-review`). These are the cases the whole project is about.
- **Unambiguous** — a clearly-current usage (expected `compliant`), a clearly-gone
  one (expected `violation`). These establish the agent does not *regress* on the
  easy cases while reasoning about the hard ones.

## Scoring — and why failure *type* matters more than the rate

For each case the harness aligns the agent's findings to the expected ones by
`target`, then classifies each:

- **Agree** — same outcome.
- **Missed** — an expected usage the agent produced no finding for.
- **Spurious** — a finding for a usage that was not expected.
- **Disagree** — a finding whose outcome differs from the label.

The headline number is the agreement rate. But the **disagreements are split by
safety**, and this is the part that reflects 04's design philosophy — *a confident
wrong verdict is worse than an honest "a human must decide."* So a disagreement is
further typed as:

- **Escalation (safe failure)** — the agent returned `needs-review` where a
  definite call was expected. It declined to guess. Undesirable, but safe.
- **Confident-wrong (unsafe failure)** — the agent gave a *definite* verdict that
  was wrong — most seriously, `compliant` where a `violation` was expected. This is
  the failure the system exists to avoid.

Reporting these separately means the harness measures not just *how often* the
agent is right, but *how it fails when it is wrong* — which is the actual claim
being defended. An agent that fails mostly by escalating is behaving as designed;
one that fails by confident-wrong is not.

## LLM nondeterminism

The agent is model-driven, so a run is a snapshot, not a fixed value. The harness
runs the full set on command and reports that run. Optionally re-running each case
N times and reporting outcome stability is a natural extension; the baseline is a
single pass with nondeterminism named as a known limitation, not hidden.

When a case disagrees, its run is worth keeping to debug *why* — so the harness
retains each case's trace (06) alongside its result, letting a failing verdict be
opened and read rather than re-derived.

## What this item does not do

- **CI wiring / gating** — running eval automatically on a change is the Work Item
  09 stretch; 07 is the harness that a CI hook would call, not the hook.
- **Define the agent or retrieval** — it consumes 04's `Report`; it does not shape
  how verdicts are produced.
- **Generate labels** — ground truth is human-authored. The harness never invents
  or model-generates its own "correct" answers.
- **Benchmark against other systems** — it scores this agent against labels, not
  against a linter or a competitor.

## Proposed module layout

```
src/eval/
  cases/         # the labelled set: snippets + expected verdicts + notes
  run.ts         # run the agent over the case set
  score.ts       # align findings to expected; classify agree / miss / spurious / disagree (+ safety type)
  report.ts      # aggregate + render (structured result + human-readable summary)
  index.ts
```

## Validation & tests

Maps to the work item's definition of done:

- **Runs the full set in one command** and produces a report.
- **Per-case agreement against ground truth** is reported.
- **The set includes at least one semantic and one temporal ambiguous case** (from
  the 01 seeds).
- **Disagreements are classified by safety** — escalation vs confident-wrong are
  reported separately, so a safe failure is never scored the same as an unsafe one.

## Deliberate scope cuts (feeds the README)

- **Single human labeller, small curated set** — real eval needs multiple
  labellers and inter-annotator agreement; ours is one person's ground truth on a
  handful of cases, chosen to be illustrative rather than statistically powered.
- **Single-pass by default** — no built-in variance analysis across repeated runs;
  named as an extension, not built.
- **No automated regression gate** — the harness reports; it does not fail a build
  (that is 09).
