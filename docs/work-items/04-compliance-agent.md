# 04 — Compliance Agent

The actual deliverable: an agent that reasons over ambiguous drift instead of
pattern-matching it, grounding every verdict in a fact it retrieved.

## Purpose

This is the item the interview is really about — demonstrated grasp of agentic AI
integration, not tool-building. A linter fails silently on exactly the cases that
matter: where "is this okay" depends on relationships or intent the rule was never
told to look for. This agent closes that gap by reasoning — asking about intent,
weighing context — rather than firing fixed rules.

It imports Work Item 02 directly (in-process, no wire), which is why 02 had to be
a standalone module. It produces verdicts grounded in specific retrieved facts;
the enforcement that makes grounding non-optional is Work Item 05, and the trace
that makes the loop inspectable is Work Item 06 — this item consumes both, it does
not define them.

## Scope

**This item covers:**
- A reason → call a tool → observe → reason → verdict loop over a code snippet.
- Direct in-process use of the retrieval module (02) as the agent's tools.
- Verdicts that cite the specific retrieved fact they rest on, with a rationale.
- Handling of ambiguous drift (semantic and temporal) through judgment rather
  than pattern-matching.

**This item explicitly does not cover:**
- The *mechanism* that enforces grounding — that is Work Item 05.
- The *mechanism* that records the trace — that is Work Item 06.
- Scoring verdict quality against ground truth — that is Work Item 07.

## Outcomes

- The agent runs end-to-end against a code snippet with planted drift.
- Each verdict names the retrieved fact it is grounded in and a rationale.
- Ambiguous cases are reasoned about, not silently pattern-matched or ignored.

## Dependencies

- Work Item 02 (Version-Aware Retrieval).

## Definition of done

- [ ] The agent completes a full reason→tool→observe→verdict run on a planted
      snippet.
- [ ] Every emitted verdict cites a specific retrieved fact.
- [ ] At least one planted ambiguous case is handled by reasoning about intent,
      not by a fixed rule.
