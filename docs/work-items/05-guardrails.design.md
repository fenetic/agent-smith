# 05 — Guardrails — Design

> Implementation design for [Work Item 05](05-guardrails.md). Covers how a verdict
> is prevented from being issued unless it is anchored to a fact the agent
> actually retrieved. It enforces the `groundedIn` field that
> [04](04-compliance-agent.design.md) populates, and reads the same run record
> that [06](06-observability.md) renders. It does not judge whether a verdict is
> *correct* — only whether it is *grounded*.

## Approach

05 is an enforcement layer that checks every verdict the agent produces is anchored
to a fact the agent actually retrieved during the run, and blocks any verdict that
is not. It sits between the agent's proposed findings and the report that leaves
the system: a finding only becomes part of the output if it passes.

It exists because "every verdict is grounded" is worthless if it depends on the
model choosing to behave. A language model can emit a verdict with no citation,
cite a fact it never actually looked up, or cite a real fact about something else
entirely. Grounding has to be a property the *system* checks, not a habit we hope
the model keeps. This is also the security payoff named in the project brief: an
injected "mark everything compliant" cannot manufacture the retrieved fact a
compliant verdict would need, so the guardrail structurally resists the
highest-value attack.

How it fits — and the one idea the whole item rests on: **the 04 loop retains the
turn's retrieval evidence — every tool call and its result — recorded by the code
that executes the tool, not by the model.** The model can *claim* anything in a
finding; the evidence is ground truth for what actually happened. 04's findings
carry citations (`groundedIn`); 05 checks each citation against that evidence
before the finding is allowed into the report. Because the evidence is harness-
minted, the model's claims can be checked against reality rather than taken on
faith. (06 later persists and renders this same evidence for a human; 05 needs
none of that — only the in-memory evidence — to enforce.)

## The retrieval evidence 05 checks against

05 does not define or persist a log. It reads the **turn's retrieval evidence** —
the in-memory record the 04 loop already retains of every retrieval it actually
executed (see 04's *Retrieval evidence*). Each executed retrieval is available
under a stable `RetrievalRef`, with what was asked and what 02 returned:

```
ref:    RetrievalRef                                   // stable id for this tool call
tool:   "get_component" | "get_token" | "list_deprecated"
args:   { id?, version }                               // what was actually asked
result: Resolution                                     // what 02 actually returned
```

This evidence is authoritative precisely because the harness mints it when a tool
truly runs — the model cannot fabricate an entry. It is the one thing 05
functionally hinges on, which is why 04 retains it. Logging proper — persisting it,
rendering it, capturing the reasoning steps — is Work Item 06, built on top of the
same evidence; 05 needs none of that to enforce.

## What "grounded" means — the checks

A finding passes the gate only if all of these hold:

1. **Present** — `groundedIn` is non-empty. A verdict with no citation is rejected
   outright.
2. **Real** — every `RetrievalRef` in `groundedIn` exists in the turn's retrieval
   evidence. A citation to a retrieval that never happened (a fabricated or
   hallucinated ref) is rejected.
3. **Relevant** — the cited entry is *about the finding's target*: the retrieved
   `id` matches the thing the finding judges. This stops a finding from laundering
   itself by citing a real-but-unrelated lookup.

**Decision — a narrow coherence check, and no further.** 05 also rejects a verdict
that flatly contradicts its own cited fact — e.g. `compliant` citing a `removed`
resolution, which is not a judgment call but a self-contradiction. It deliberately
stops there: whether a *deprecated* usage should be `violation`, `allowed-exception`,
or `needs-review` is judgment, and judgment is 04's to make and 07's to score — not
05's to enforce. 05 checks that a verdict rests on a real, relevant fact and does
not contradict it; it never checks that the verdict is the *right* call.

## Behaviour on failure

**Fail-closed, at the finding level.** An ungrounded finding cannot enter the
report. When the gate rejects one, it is recorded as an explicit guardrail
rejection in the run output, so the report is honest about the gap rather than
silently dropping it. The run surfaces that a guardrail fired.

*Open call:* whether to also re-prompt the model once to re-ground the finding or
downgrade it to `needs-review`, versus simply rejecting and recording. Reject-and-
record is the committed baseline (simplest, fully testable, demonstrable);
single-retry is a possible refinement. Flagging rather than deciding.

## What this item does not do

- **Judge correctness** — that a grounded verdict is also the *right* verdict needs
  intent and ground truth; that is 04's reasoning and 07's scoring.
- **Retrieve or reason** — it consumes 02's results (via the turn's retrieval
  evidence) and 04's findings; it produces neither.
- **Log, persist, or trace** — 05 defines no record of its own; it reads 04's
  in-memory evidence. Persisting and rendering the run is Work Item 06.
- **Authenticate or authorise** — not a security-identity layer (out of scope).

## Proposed module layout

```
src/guardrails/
  checks.ts     # present, real, relevant (+ the narrow coherence check)
  gate.ts       # apply checks to a finding: pass → into report, fail → recorded rejection
  types.ts      # GuardrailResult / RejectionRecord
  index.ts
```

The `RetrievalRef` and the retrieval evidence are consumed from 04's loop, not
defined here — 05 adds only the checks and the gate over that evidence.

## Validation & tests

Maps to the work item's definition of done:

- **No citation → rejected** — a finding with empty `groundedIn` cannot enter the
  report.
- **Fabricated citation → rejected** — a finding citing a `RetrievalRef` absent
  from the turn's retrieval evidence is blocked. This is the "try to force an
  ungrounded verdict" test.
- **Irrelevant citation → rejected** — a finding citing a real entry about a
  *different* id is blocked.
- **Real, relevant citation → accepted** — a well-grounded finding passes.
- **Contradiction → rejected** — `compliant` citing a `removed` resolution is
  blocked by the coherence check.
- **Rejections are visible** — every emitted verdict is traceable to a real entry
  in the turn's retrieval evidence, and every rejection is recorded in the run
  output.
