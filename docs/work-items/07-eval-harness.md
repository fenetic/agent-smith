# 07 — Eval Harness

Prove the judgment claim with evidence: agent verdicts diffed against
human-labelled ground truth.

## Purpose

The project's central claim is that an agent handles ambiguous drift better than
a rule can. That claim needs evidence, not assertion. This item measures the
agent against a labelled set of cases — both the ambiguous ones where judgment is
the whole point, and unambiguous ones that establish it doesn't regress on the
easy cases.

It draws on the ambiguous cases planted back in Work Item 01, closing the loop
from data to demonstrated outcome.

## Scope

**This item covers:**
- A test set of drift cases, ambiguous and unambiguous, each with a human-labelled
  ground-truth verdict.
- A run that executes the agent over the set and diffs its verdicts against the
  labels, producing a pass/fail agreement report.

**This item explicitly does not cover:**
- CI wiring or automated gating — that is the Work Item 09 stretch.
- The agent's internal reasoning mechanism — that is Work Item 04.

## Outcomes

- A labelled evaluation set spanning ambiguous and unambiguous cases.
- A report showing, per case, whether the agent's verdict agreed with ground
  truth.

## Dependencies

- Work Item 04 (Compliance Agent).
- Work Item 01 (for the planted ambiguous cases).

## Definition of done

- [ ] The harness runs the agent over the full labelled set in one command.
- [ ] It reports per-case agreement against human ground truth.
- [ ] The set includes at least one semantic and one temporal ambiguous case.
