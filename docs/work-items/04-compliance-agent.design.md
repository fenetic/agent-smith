# 04 — Compliance Agent — Design

> Implementation design for [Work Item 04](04-compliance-agent.md). Covers the
> audit loop, the verdict shape, how the agent uses 02's lookups as tools, and how
> it handles ambiguity. It consumes — does not define — grounding enforcement
> (05) and tracing (06). It builds on
> [02](02-version-aware-retrieval.design.md) directly, in-process.

## Approach

04 is the compliance agent — the project's actual deliverable. It takes a code
snippet and the version the code targets, examines each place the code uses a
design-system component or token, and produces a verdict for each: **compliant**,
a **violation**, an **intentional exception**, or something that **needs human
review**. Every verdict is tied to a specific fact it retrieved from 02.

It works as a loop driven by a language model. The model reads the code, calls a
retrieval tool to get the current status of a usage, observes the answer, reasons
about what that answer means *for this particular usage*, and moves on — repeating
until it has judged every usage and can produce a final report.

Why this is an agent and not a linter: a rule can only check relationships and
conditions it was told about in advance. It cannot judge a relationship that was
never declared, and it cannot read intent. But the cases that matter most turn on
exactly those things — a low-contrast pair no rule was told to check, or a
deprecated component that is correct on a frozen page and wrong on active work,
identical to any rule looking at them. The agent closes that gap by retrieving the
relevant facts and reasoning about them in context, including weighing signals of
intent — and, importantly, by returning "needs review" when the signals do not
settle it, rather than guessing.

How it fits: the agent calls 02 directly, in the same process — the retrieval
tools it uses are thin adapters over 02, the same lookups the MCP server (03)
exposes externally. It produces verdicts in a shape that records what each one
rests on; the guardrail layer (05) makes that grounding non-optional, and the
observability layer (06) records the loop. 04 consumes both; it does not define
them.

## Input and output

- **Input:** `audit(code, version)` — the snippet to check, and the version the
  code targets (retrieval is version-scoped, so the audit needs a version to
  resolve against).
- **Output:** a `Report` — the version audited plus a list of `Finding`s, one per
  design-system usage the agent judged.

## The loop

A standard model tool-use loop, bounded:

1. The model receives the code, the target version, and a system prompt defining
   the task, the available tools, and what each verdict outcome means.
2. It identifies a design-system usage in the code (a component, a token
   reference).
3. It calls a retrieval tool for that usage — `get_component` / `get_token` /
   `list_deprecated`, each at the target version.
4. It observes the returned `Resolution` (active / deprecated / removed / unknown).
5. It reasons: given that status **and** any intent signals present in the code,
   is this usage compliant, a violation, an intentional exception, or unresolvable?
6. It records a `Finding` citing the `Resolution` it just observed, and continues
   to the next usage.
7. When every usage is judged, it emits the final `Report`.

The loop is capped at a maximum number of iterations so a misbehaving run
terminates rather than looping indefinitely; hitting the cap is itself a reported
condition, not a silent stop.

### Worked example

Code contains `<Modal>`, target version `4.1`:

1. Model spots `<Modal>` → calls `get_component("Modal", "4.1")`.
2. 02 returns `deprecated`, `replacedBy: Dialog`, deprecated since `4.0`.
3. Model checks the surrounding code for intent signals (see below).
4. On active-looking code with no legacy signal → `Finding { outcome: "violation",
   groundedIn: [that resolution], rationale: "Modal deprecated at 4.0…",
   suggestedFix: "Dialog" }`.

### Retrieval evidence

As the loop runs, it keeps the turn's executed retrievals in memory — each tool
call's result under a stable `RetrievalRef` — so a `Finding` can cite what it
actually rests on via `groundedIn`. This is *retained evidence, not logging*: it is
simply the loop not discarding the `Resolution`s it already observed, and the refs
are trustworthy because the harness mints them when a tool truly runs, never the
model. 05 checks citations against this evidence; 06 later turns it — together with
the reasoning steps — into a persisted, human-readable trace. The evidence is the
one thing downstream enforcement (05) genuinely hinges on, which is why it lives
here; the logging built on top of it does not, and is deferred to 06.

## The tools the agent uses

The same three lookups from 02, wrapped as model tool definitions. In-process, they
call 02 directly — no MCP round-trip (03 is the *external* adapter over the same
02; this is the *internal* one):

| Tool | Backed by |
|------|-----------|
| `get_component(id, version)` | `atVersion(reg, version).component(id)` |
| `get_token(id, version)`     | `atVersion(reg, version).token(id)` |
| `list_deprecated(version)`   | `atVersion(reg, version).listDeprecated()` |

The agent detects *usages in the code* itself (that is reading, not retrieval); it
uses these tools to get the *authoritative status* of what it found. For the
semantic contrast case, it retrieves the two tokens involved and reasons about the
contrast between their real, retrieved values — so even that verdict is grounded in
facts it pulled, not in the model's own knowledge.

## Verdict shape

```
Finding
  target:       string              // the usage, e.g. "<Modal>" at line 12
  outcome:      "compliant" | "violation" | "allowed-exception" | "needs-review"
  groundedIn:   RetrievalRef[]      // the retrieval result(s) this rests on
  rationale:    string              // why, in terms of the retrieved fact + context
  suggestedFix?: Ref                // e.g. the replacedBy target, when applicable

Report
  version:  Version
  findings: Finding[]
```

`groundedIn` is the load-bearing field: it points at the specific tool result(s)
the finding depends on. 04 *populates* it; 05 *enforces* that it is present and
valid (no finding may cite a fact the agent did not actually retrieve). Defining
the field here and enforcing it there is the same shape/enforcement split used
between 01 and 02.

## Handling ambiguity: intent signals and the honest non-answer

This is the crux — where judgment replaces pattern-matching.

A deprecated status does not mechanically mean "violation." Whether deprecated
usage is a violation, an intentional exception, or unclear depends on **intent**,
which the agent reads from signals available in the code and its context —
comments (`// legacy checkout — frozen`), file-path or surrounding cues that mark
frozen legacy versus active new work.

- Clear signal it is intentional legacy → `allowed-exception`, with the rationale
  naming both the retrieved deprecation fact and the intent signal.
- No such signal on active-looking work → `violation`, with the `replacedBy`
  suggestion.
- **Signals absent or conflicting → `needs-review`.** The agent surfaces the
  tension explicitly (the fact and the missing intent) instead of guessing. This
  is the deliberate design point: a confident wrong verdict is worse than an
  honest "a human must decide," so the agent is built to reach for the latter when
  the evidence does not settle it.

## Model

Driven by a capable Claude model via the Messages API tool-use loop. The exact
model is an implementation choice (a reasoning-strong model suits the ambiguous
cases); it does not affect the architecture here. Final selection and API specifics
belong in implementation.

## What this item does not do

- **Grounding enforcement** — 04 produces findings that carry `groundedIn`; making
  grounding impossible to omit is Work Item 05.
- **Logging / tracing** — 04 only *retains* the turn's retrieval evidence in
  memory (above); persisting it, rendering it for a human, and capturing the
  reasoning steps is Work Item 06.
- **Scoring** — measuring verdict quality against ground truth is Work Item 07.
- **Retrieval logic** — consumed from 02, never re-implemented here.

## Proposed module layout

```
src/agent/
  tools.ts     # model tool definitions adapting 02's resolver methods
  prompt.ts    # system prompt: task framing, outcome definitions, how to weigh status + intent
  loop.ts      # the reason → tool → observe → reason loop over the Messages API
  verdict.ts   # Finding / Report types
  audit.ts     # audit(code, version): Promise<Report> — the public surface
  index.ts
```

## Validation & tests

Maps to the work item's definition of done:

- **End-to-end run** on a planted snippet produces a `Report`, each finding citing
  a specific retrieved `Resolution`.
- **Ambiguity handled by reasoning, not a rule** — the same deprecated component
  yields `violation` on an active-work snippet and `allowed-exception` on a
  legacy-signalled one; a snippet with no intent signal yields `needs-review`.
- **Every finding carries `groundedIn`** referencing a real retrieval result from
  the same run.
- **The loop terminates** — normal completion, and the iteration cap is a reported
  condition when hit.
