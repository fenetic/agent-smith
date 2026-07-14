# 06 — Observability — Design

> Implementation design for [Work Item 06](06-observability.md). Covers how a
> single agent run becomes a complete, ordered, readable trace — persisted and
> legible enough to narrate live. It builds on the retrieval evidence
> [04](04-compliance-agent.design.md) already retains and the guardrail outcomes
> [05](05-guardrails.design.md) produces, and it enforces nothing.

## Approach

06 is the observability layer. It turns a single run of the agent into a complete,
ordered, readable trace — every reasoning step and every tool call, in the order
they happened — persisted for review after the fact and legible enough to narrate
while it runs.

It exists because an agent that reaches a verdict for reasons you cannot see is
neither demonstrable nor trustworthy. The demo plan is to walk through the loop as
it runs; that only works if the loop leaves a legible trail. It is also how the two
claims the rest of the system makes stop being assertions and become *visible*: you
can see the exact tool call that grounds each verdict (05's promise) and the
reasoning that led to each outcome (04's judgment).

How it fits: it builds on the retrieval evidence 04 already retains — the tool
calls and their results — and adds what that evidence alone does not carry: the
reasoning steps between tool calls, the findings, and the guardrail outcomes from
05. 05 consumed the bare evidence in memory to enforce; 06 is the human-facing
record built on top, and it persists and renders rather than blocking anything. It
comes last of the loop-facing items because it depends on all of them: it observes
04, includes 05's decisions, and shows 02's results.

## What a trace contains

A trace is an **ordered list of typed events** — a structured record, not free
text, so it can be both rendered for a human and asserted against in tests. Each
event carries its position in the run:

```
TraceEvent (ordered)
  run-start   { code (or redacted reference), version }
  reasoning   { text }                          // the model's rationale for its next move
  retrieval   { ref, tool, args, result }       // the evidence entry 04 already retains
  finding     { finding, groundedIn }            // a verdict the agent emitted
  guardrail   { findingRef, outcome, reason? }   // 05's accept / reject on that finding
  cap-hit     { iterations }                     // the loop hit its iteration bound
  run-end     { report }
```

The `retrieval` events *are* 04's retained evidence, lifted into the ordered trace;
06 adds the `reasoning`, `finding`, and `guardrail` events around them to make the
whole loop legible.

## Following grounding through the trace

This is the payoff — the trace makes 05's grounding and 04's judgment inspectable
rather than asserted. Because the ids line up, a reader can walk the chain in
either direction:

```
finding (verdict) ──groundedIn──▶ retrieval (ref) ──▶ args + Resolution
        └────────── guardrail (accepted / rejected) on that finding
```

So for any verdict you can see the exact tool call that backs it, what was asked,
what 02 returned, and whether the guardrail accepted it — all in sequence with the
reasoning that produced it. That is the concrete thing walked through in the live
demo.

## Capturing it: a thin instrumentation seam

06 needs the reasoning steps and guardrail outcomes, which live inside the loop
(04) and the gate (05). It gets them through **a small optional observer the loop
and gate call as they run** — `emit(event)`. The default observer is a no-op, so
04 and 05 run unchanged with no observability attached; when 06 is active it
supplies a collector that assembles the ordered trace.

This is the one place 06 reaches back into the loop, and it does so through a hook
the loop owns: the dependency points **06 → 04/05**, never the reverse, so the
strict sequence holds. Capturing reasoning steps is deferred here (not retained in
04) precisely because nothing before 06 needs them — only 05's bare evidence does,
and that stays in 04.

## Persistence and rendering

Same split as the MCP result payload (03): a structured source of truth plus a
convenience view over it.

- **Structured trace (source of truth)** — the ordered events are written to a
  durable per-run artifact (JSON), so a run is reviewable after the fact and
  testable.
- **Human rendering** — a renderer prints the same events as an ordered, indented
  narrative (console/markdown) for review and for narrating the demo. The JSON is
  the contract; the rendering is a view over it, never a separate source.

## Redaction note

Persisting a trace is exactly where raw input — potentially containing secrets or
PII — would be written to disk. For this weekend input is trusted (single-user,
local snippets), consistent with the project brief's deferral. At real scale,
redaction-before-persist applies precisely here; the `run-start` event already
allows a redacted reference in place of raw code for that reason.

## What this item does not do

- **Enforce** — a trace never blocks a verdict; grounding enforcement is 05. 06 is
  record-only.
- **Score** — comparing verdicts to ground truth is 07; the trace is an input it
  can draw on, not the judge.
- **Retrieve or reason** — it observes 02's results and 04's steps; it produces
  neither.
- **Dashboards or metrics** — no aggregation, time-series, or UI infrastructure
  (explicit scope cut). One legible trace per run is the whole target.

## Proposed module layout

```
src/observability/
  events.ts     # TraceEvent types
  collector.ts  # the observer the loop/gate call; assembles the ordered trace
  persist.ts    # write the structured trace (JSON) per run
  render.ts     # human-readable rendering for review / live demo
  index.ts
```

## Validation & tests

Maps to the work item's definition of done:

- **Complete ordered trace** — one run yields a trace covering every reasoning step
  and every tool call, in order.
- **Grounding is followable** — each `finding` links to its `retrieval` evidence by
  ref, and each `guardrail` outcome links to its finding.
- **Legible enough to narrate** — the renderer produces an ordered narrative of the
  run suitable for the live demo.
- **Passthrough by default** — running with the no-op observer leaves 04 and 05
  behaviour identical to running without observability.
