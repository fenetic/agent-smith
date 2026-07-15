# Seeded ambiguous cases

The registry data in `data/` is curated, not arbitrary. Alongside ordinary
entries it carries four planted cases that later work items draw on. This file
documents them by id so [Work Item 07](../../docs/work-items/07-eval-harness.design.md)'s
ground-truth labels can reference them without re-deriving what makes each hard.

The registry provides the *ingredients* only. What makes each case genuinely
ambiguous is the **usage context**, which lives in 07's eval snippets — the same
registry entry is correct in one context and wrong in another. That split is the
point: if the registry alone could settle it, no judgment would be needed and the
agent would be a linter.

`data.test.ts` pins every claim below. If you edit the seed data, those tests fail
rather than 07 quietly grading against ground truth that no longer exists.

## Case A — temporal, component level

**In the data:** `Modal`, added `1.0`, deprecated `4.0`, `replacedBy` `Dialog`,
removed `6.0`. `Dialog` (added `4.0`) is active.

**The ambiguity:** identical usage is correct on a frozen legacy page pinned to
`3.0` and wrong on active new work at `5.0`. Nothing about the code distinguishes
them — only the intent behind it does. Modal is also the fully-lifecycled entry:
it exercises all three statuses (active at `3.0`, deprecated at `4.1`, removed at
`6.0`) across two version boundaries.

## Case B — temporal, variant level

**In the data:** `Button` is active and never deprecated. Its variant
`size=jumbo` (added `2.0`) is deprecated in `5.0`, `replacedBy` `size=xl` (added
`5.0`).

**The ambiguity:** the drift is *inside* an entry that is itself perfectly
healthy. A component-level check — "is Button deprecated?" — returns no and moves
on, missing it entirely. Catching this requires resolving to variant granularity.

## Case C — alias staleness

**In the data:** `brand.primary` aliases `color.blue-500` and is deprecated in
`4.0`, `replacedBy` `brand.primaryV2`, which aliases `color.indigo-600`. Both
`color.blue-500` and `color.indigo-600` are active.

**The ambiguity:** the false-confidence case. `brand.primary` still resolves to a
real, live, plausible-looking colour — nothing about the returned value announces
that the alias itself is stale. A resolver that follows the edge and reports the
target's status reads "active" and is confidently wrong. This is why
[02](../../docs/work-items/02-version-aware-retrieval.design.md) carries the
*most-deprecated* status along a chain rather than the terminal one.

## Case D — semantic, undeclared relationship

**In the data:** `color.slate-400` (`#94A3B8`) and `color.slate-100` (`#F1F5F9`),
both active, both ordinary. Nowhere are they declared as a pair.

**The ambiguity:** used as foreground on background they fail contrast, but the
registry contains no relationship to check and no rule to fire. The problem exists
only in the *combination*, which is not a fact the data models. No lookup can
surface this; it takes reasoning about what the code does with the two values
together. This is the case that separates an agent from a lookup table.

Contrast is why `color.slate-900` is also seeded: `slate-900` on `slate-100` is
the same *shape* of usage — two undeclared tokens combined — but passes. The
undeclared pairing is therefore not itself a signal, which is what stops the agent
from learning "undeclared pair ⇒ violation" and forces the actual judgment.
