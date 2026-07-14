# 01 — Registry Data Layer

The single grounded source of truth: a synthetic, versioned design-system
registry — standing in for the token and component library a team publishes and
queries at author-time and in CI — that every other work item resolves against.

## Purpose

Everything downstream — retrieval, the MCP tools, the agent's verdicts — is only
as trustworthy as what it grounds against. This item builds that ground truth. It
must encode design-system lifecycle from the start, because deprecation is
temporal: an entry is not simply valid or invalid, it moves through a sunset
window across versions. If that metadata isn't native to the data, no amount of
downstream logic can recover it honestly.

It sits first in the sequence because it has no dependencies and everything else
has a hard dependency on it.

## Scope

**This item covers:**
- A synthetic registry — structured, serializable data (JSON-shaped, conforming
  to a defined schema) — of components (e.g. `Button`, `Card`, `Modal`) and
  design tokens (color, spacing, typography), modelled loosely on a recognizable
  real system so examples read as familiar rather than arbitrary.
- Lifecycle metadata on every entry: `addedIn`, `deprecatedIn`, `removedIn`,
  `replacedBy` — expressed against a single linear version history.
- Token aliasing (e.g. `brand.primary → color.blue-500`), so alias-chain
  resolution has something real to resolve later.
- A curated set of ambiguous cases seeded into the data — both semantic (an
  undeclared token relationship that only fails in some contexts) and temporal
  (a deprecated entry legitimately in use on frozen legacy work) — so later eval
  has genuine judgment cases to test against.

**This item explicitly does not cover:**
- Any query, lookup, or resolution logic — that is Work Item 02.
- Any version-safety guarantees on reads — that is a property of retrieval, not
  of the data.
- Real Figma or live design-tool data (out of scope for the whole project).

## Outcomes

- A loadable registry containing both active and deprecated entries spread across
  a linear version history.
- Every entry carries complete lifecycle metadata; no entry has an implicit or
  missing status.
- Token aliases are represented explicitly and are resolvable in principle.
- A documented set of planted ambiguous cases (semantic + temporal) exists for
  Work Item 07 to draw on.

## Dependencies

None. This is the root of the sequence.

## Definition of done

- [ ] The registry loads without error.
- [ ] It contains active, deprecated, and removed entries across at least two
      version boundaries.
- [ ] At least one token alias chain is present.
- [ ] The planted ambiguous cases (≥1 semantic, ≥1 temporal) are present and
      documented.
