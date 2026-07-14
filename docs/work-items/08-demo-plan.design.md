# 08 — Demo Plan — Design

> The demo-plan portion of [Work Item 08](08-demo-and-readme.md). Covers what the
> live demo shows, in what order, and how it does not fall over on the day. The
> README (the leave-behind, with the "deliberate scope cuts" section) is *assembled*
> from the work already designed in 01–07 and is not designed here — this document
> is the runnable demo.

## Approach

The demo exists to make one thesis land in a single sitting: **the same versioned
source of truth grounds both an autonomous auditor built from scratch and an
off-the-shelf assistant integrated over MCP — and the auditor reasons over
ambiguity rather than pattern-matching it.** Everything shown must be traceable to a
tool call; nothing is asserted that the trace can't back.

It is two acts. Act 1 is the deliverable (the compliance agent). Act 2 is the
supporting proof (an off-the-shelf coding agent hitting the same MCP tools). Act 1
carries the weight; Act 2 exists to show the "one source of truth, two consumers"
claim is real and not a diagram.

## Act 1 — the compliance agent (the deliverable)

Run the agent (04) against one planted snippet, audited at a chosen version (e.g.
`5.1`), and walk the 06 trace live. The snippet is planted so that a handful of
usages exercise the full range of outcomes — this same snippet doubles as an 07
eval case:

| Planted usage | At `5.1` | Expected verdict | What it demonstrates |
|---------------|----------|------------------|----------------------|
| A current component/token | active | `compliant` | no false positives — it doesn't cry wolf |
| `<Modal>` in an active new-feature file, no legacy marker | deprecated (→ `Dialog`) | `violation` | catches real drift, suggests the replacement |
| `<Modal>` in a file marked `// legacy checkout — frozen` | deprecated | `allowed-exception` | **judgment**: identical usage, opposite verdict, decided by intent |
| A deprecated usage with no intent signal either way | deprecated | `needs-review` | **the honest non-answer** — declines to guess rather than risk a confident-wrong call |
| `color.slate-400` text on `color.slate-100` | both active | `violation` | catches an **undeclared** relationship a rule was never told to check, grounded in two retrieved token values |

The walk-through, per finding, follows the trace: **verdict → `groundedIn` → the
tool call that backs it → the reasoning that produced it.** Two things to say out
loud as it runs:

- **Grounding** — every verdict cites a real retrieval; the guardrail (05) would
  have blocked one that didn't. Optionally show that: feed a case engineered to
  tempt an ungrounded verdict and show 05 reject it.
- **Judgment** — the two `Modal` rows are the money moment: same deprecated
  component, `violation` vs `allowed-exception`, and `needs-review` when intent is
  genuinely unreadable. That is the "why an agent, not a linter" argument made
  visible.

## Act 2 — the off-the-shelf agent over MCP (supporting proof)

Point Claude Code (or Cursor) at the MCP server (03) and ask it, *before writing
code*:

1. It reads the version resource to discover the version line.
2. It calls `get_component` / `get_token` / `list_deprecated` at a version — e.g.
   "is `Modal` current at 5.1, and what should I use instead?" — and gets the same
   version-safe answer the auditor got.

The point to land: the registry that grounded the auditor *after* code was written
now grounds an assistant *before* it is. Retrieval and verification are the same
mechanism at opposite ends of the lifecycle — one source of truth, two consumers,
one built from scratch and one merely integrated.

## Narrative arc (what to say, in order)

1. The problem: rule-based checkers fail silently on exactly the cases that matter —
   undeclared relationships and intent.
2. Act 1: watch the agent reason, ground each verdict, and — critically — *decline
   to guess* when it should.
3. The safety profile: show the 07 eval report, and make the point that failures
   skew to safe escalation, not confident-wrong.
4. Act 2: the same MCP tools, an off-the-shelf agent, the same truth — before code
   instead of after.
5. Close on the scope cuts (from the README): what's synthetic, and what production
   would need — the deliberate-simplification judgment.

## Prerequisites / setup

- The registry (01) built; the agent (04), guardrails (05), and trace (06) runnable
  end-to-end.
- An API key for the model behind 04.
- The MCP server (03) running over stdio, and Claude Code / Cursor configured to
  connect to it (its MCP client config pointed at our server binary).
- The planted snippet committed in the repo; the audit version fixed.

## Not falling over on the day

Live demos fail, and this one has a nondeterministic component (the model). Plan
for it:

- **Pre-capture a known-good run.** Because 06 persists the trace as JSON with a
  human rendering, run Act 1 ahead of time and keep the trace. If the live API call
  flakes or the model wobbles on a borderline case, show the captured trace — it is
  the same artifact, just recorded.
- **Pick robust planted cases.** Favour usages whose correct verdict is stable
  across runs; keep the single genuinely-borderline `needs-review` case as the one
  place variance is *expected*, and frame it as such.
- **Have the 07 report pre-generated** as the evidence slide, so the safety-profile
  claim doesn't depend on a live eval pass.
- **The repo + README are the leave-behind** — if the live environment fails
  entirely, the recorded trace, the eval report, and the README carry the whole
  story asynchronously.

## What the demo deliberately does not show

- No real Figma/design-tool integration — the registry is synthetic (README scope
  cut).
- No remote deployment or CI gate — Act 2 is local stdio; the CI/remote story is
  the 09 stretch, mentioned as "what's next," not shown.
- No auth on the MCP server — named as a known gap, not demonstrated.

## Validation & tests

Maps to the work item's definition of done:

- **Act 1 runs the agent on the planted snippet end-to-end** and produces the trace
  walked in the demo.
- **Act 2 shows Claude Code calling the same MCP tools** and getting version-safe
  answers.
- **A pre-captured trace and a pre-generated eval report exist** as fallbacks.
- **The README includes the "deliberate scope cuts" section** (assembled, not
  designed here).
