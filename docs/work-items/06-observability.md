# 06 — Observability

Make the agent's loop inspectable — the ordered record of reasoning and tool calls
you walk through live in the demo.

## Purpose

An agent that reaches the right verdict for reasons you can't see is not
demonstrable and not trustworthy. The presentation plan is explicitly to walk
through the agent's reasoning and tool calls live; this item is what makes that
possible. It is also how grounding (05) and judgment (04) become visible rather
than asserted.

## Scope

**This item covers:**
- Tracing every tool call and every reasoning step in a single agent run.
- Presenting that trace as an ordered, reviewable record of what happened in the
  loop.

**This item explicitly does not cover:**
- Dashboards, metrics aggregation, or persistence infrastructure.
- Enforcement — observability records what happened; it does not block anything
  (that is Work Item 05).

## Outcomes

- A single agent run produces a complete, ordered trace of its reasoning steps and
  tool calls.
- The trace is reviewable after the fact and suitable to walk through live.

## Dependencies

- Work Item 04 (Compliance Agent).

## Definition of done

- [ ] Running the agent once yields an ordered trace covering every reasoning step
      and tool call in that run.
- [ ] The trace is legible enough to narrate in a live demo.
