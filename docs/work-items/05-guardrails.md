# 05 — Guardrails

Make the grounding promise structural: the agent cannot issue a verdict that
isn't grounded in something it actually retrieved.

## Purpose

"Every verdict is grounded in a retrieved fact" is worthless if it depends on the
agent's good behaviour. This item makes it an enforced invariant. An ungrounded
verdict — one the agent asserts without a real tool result behind it — must be
impossible to emit, not merely discouraged.

This is the counterpart to Work Item 02. Retrieval guarantees the *facts* handed
to the agent are version-safe; guardrails guarantee the agent's *verdicts* are
actually anchored to those facts. Together they close the loop: safe input,
anchored output.

## Scope

**This item covers:**
- An enforcement layer that ties every verdict to a specific tool result produced
  during the run.
- Rejection or blocking of any verdict that cannot be traced to a real retrieved
  fact.

**This item explicitly does not cover:**
- The quality or correctness of the reasoning itself — that is measured by Work
  Item 07.
- The recording of the trace — that is Work Item 06 (guardrails enforce; they do
  not narrate).
- Retrieval safety — that is Work Item 02.

## Outcomes

- A verdict with no grounding fact behind it cannot be emitted.
- Grounding is enforced by the system, not left to the agent's discretion.

## Dependencies

- Work Item 04 (Compliance Agent).

## Definition of done

- [ ] A test that attempts to force an ungrounded verdict is blocked by the
      guardrail.
- [ ] Every verdict that is emitted is traceable to a specific tool result from
      the same run.
