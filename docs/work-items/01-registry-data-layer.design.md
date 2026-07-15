# 01 — Registry Data Layer — Design

> Implementation design for [Work Item 01](01-registry-data-layer.md). Covers how
> the registry hangs together: representation, schema, version/lifecycle/alias
> models, the seeded ambiguous cases, and the single surface it exposes. It does
> **not** cover resolution — version-safe reads are Work Item 02.

## Representation

**Decision: canonical data is JSON, validated on load by a schema that is also the
source of the TypeScript types.**

- **JSON**, because it mirrors reality (real tokens serialize as W3C Design Tokens
  JSON; component manifests are JSON) and because the MCP server (03) serves these
  records over a wire — a serializable shape is the natural fit.
- **Schema-validated on load**, because malformed lifecycle metadata must fail
  loudly and early, not resolve to something misleading downstream.
- **Types derived from the schema**, so the registry's shape has a single
  definition and Work Item 02 builds on inferred types, not hand-maintained ones.

*Rejected alternative:* authoring the data directly as typed TypeScript `const`
objects. It gives compile-time checks but isn't serializable-first, drifts from
how real registries are published, and couples the data to our runtime. JSON +
load-time validation keeps the data portable and honest.

## Version model

A single linear version history, declared once and referenced everywhere.

- `meta.versions` is an ordered array of version identifiers, chronological, e.g.
  `["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"]`.
- A `Version` is any string that appears in that array. Ordering is its index.
- No semver ranges, no branches, no parallel major lines. Comparison logic lives
  in Work Item 02; this layer only guarantees the ordered list exists and every
  version reference is a member of it.

## Schema (shape, not exhaustive types)

```
Registry
  meta:       { name, modelledOn, versions: Version[] }
  components: ComponentEntry[]
  tokens:     TokenEntry[]

Lifecycle                       // shared by components, variants, tokens
  addedIn:       Version
  deprecatedIn?: Version        // absent ⇒ never deprecated
  removedIn?:    Version        // absent ⇒ never removed
  replacedBy?:   Ref            // required iff deprecatedIn is present

ComponentEntry
  id:          string           // "Button"
  kind:        "component"
  description: string
  variants?:   Variant[]        // e.g. size, tone — each independently lifecycled
  lifecycle:   Lifecycle

Variant
  name:      string             // "size=jumbo"
  lifecycle: Lifecycle

TokenEntry
  id:        string             // "color.blue-500", "brand.primary"
  kind:      "token"
  type:      "color" | "spacing" | "typography"
  value?:    string             // concrete value, e.g. "#2196F3"
  alias?:    Ref                // points at another token id
  lifecycle: Lifecycle

Ref = string                    // resolves in the scope of whatever owns it
```

A `Ref` resolves against **entry ids** everywhere except one place: a *variant's*
`replacedBy` resolves against its own component's **variant names** (`size=jumbo`
→ `size=xl`). A variant is not a top-level entry and has no id, so there is no
entry id for it to name. This costs nothing in ambiguity: nothing downstream
resolves a variant ref programmatically — 02's query surface is `component(id)`
and `token(id)`, and 03's tools are `get_component`/`get_token` — so the only
readers are this loader (which is iterating the component when it checks) and the
agent (which fetched the component to get there). Neither ever lacks the
component context.

*Rejected alternative:* qualified refs (`Button#size=xl`), keeping one flat `Ref`
namespace and allowing a variant to be replaced by a different component. It buys
uniformity for a resolver that does not exist, at the cost of an id grammar whose
only parser would be the loader.

### Invariants the loader enforces

1. **Referential integrity** — every `Ref` (`replacedBy`, `alias`) resolves within
   its scope: entry ids for components and tokens, sibling variant names for a
   variant's `replacedBy`.
2. **Replacement on deprecation** — `deprecatedIn` present ⇒ `replacedBy` present.
   A deprecation always points somewhere; that is what lets the agent say "use X
   instead."
3. **Ordered lifecycle** — where both exist, `addedIn ≤ deprecatedIn ≤ removedIn`
   by version order.
4. **Token value XOR alias** — a token has exactly one of `value` or `alias`.
5. **Known versions** — every `Version` is a member of `meta.versions`.
6. **Acyclic aliases** — no alias chain loops back on itself. Added because
   [Work Item 02](02-version-aware-retrieval.design.md) walks these chains and
   states that a cycle is "a load-time invariant violation surfaced by 01, not a
   runtime concern here" — so 01 has to actually surface it. Note that a cycle
   satisfies invariant 1 untouched (every ref in a loop resolves), which is why it
   needs a check of its own rather than falling out of referential integrity.

## Aliasing model

A token either holds a concrete `value` or an `alias` edge to another token; never
both. This layer only declares the edge — `brand.primary → color.blue-500`. Chain
resolution (and carrying the most-deprecated status along the chain) is Work Item
02. That split is deliberate: 01 owns the *graph*, 02 owns *walking it safely*.

## Seeded ambiguous cases

These are the ingredients later items need. The registry provides the deprecated
entries and value pairs; the *usage context* that makes them ambiguous lives in
the eval snippets (07). Committed seed set:

| # | Kind | What's in the registry | The ambiguity it enables |
|---|------|------------------------|--------------------------|
| A | Temporal (component) | `Modal` deprecated in `4.0`, `replacedBy` `Dialog`, removed in `6.0` | Identical usage is correct on a frozen legacy page and wrong on active new work — only intent distinguishes them |
| B | Temporal (variant) | `Button` variant `size=jumbo` deprecated in `5.0`, `replacedBy` `size=xl` | Variant-level drift a component-level check would miss |
| C | Alias staleness | `brand.primary` aliases `color.blue-500` but is deprecated in `4.0`, `replacedBy` `brand.primaryV2` (aliases `color.indigo-600`) | The false-confidence case: a stale alias that still returns a plausible value |
| D | Semantic (contrast) | `color.slate-400` and `color.slate-100`, both active, never declared as a pair | A low-contrast combination no rule fires on, because the relationship was never declared |

Each is documented in-repo alongside the data so 07's ground-truth labels can
reference them by id.

## Consumption surface

The layer exposes exactly one thing:

```
loadRegistry(): Registry      // read JSON, validate against schema, return typed data
```

Parse-and-validate is the only logic here, and it is not resolution — it produces
the same typed object whether called by Work Item 02 in-process or by the tooling
behind the MCP server. Everything else imports the returned `Registry` type.

## Proposed module layout

```
src/registry/
  data/
    meta.json          # name, modelledOn, ordered version history
    components.json     # component entries
    tokens.json         # token entries
  schema.ts            # schema definitions + inferred types
  load.ts              # loadRegistry(): read all three, validate, enforce invariants
  index.ts             # re-exports Registry types + loadRegistry
  cases.md             # the seeded ambiguous cases, documented by id
```

The three-file split mirrors the one real seam that matters: in practice tokens
and components have different producers and pipelines — tokens exported from
design (Figma → Style Dictionary → a tokens package), components published from
engineering (a component library + generated manifest), often as separate
packages. Splitting on that seam also maps cleanly onto the two MCP tools
(`get_component` / `get_token`). We deliberately stop short of fragmenting tokens
further by category/tier — that reconciliation complexity is a scope cut, not a
fidelity gain. `loadRegistry()` reassembles the three files into one validated
`Registry`.

## Validation & tests

Maps directly to the work item's definition of done:

- Loads without error; rejects data that violates any invariant (dedicated
  negative tests per invariant).
- Contains active, deprecated, and removed entries across ≥2 version boundaries.
- At least one alias chain present (case C).
- Seed cases A–D present and addressable by id.

## Deliberate scope cuts (feeds the README)

- **One linear version line** instead of semver across multiple published
  packages — collapses real reconciliation work that isn't the point this weekend.
- **Explicit lifecycle fields** instead of the informal reality (`@deprecated`
  JSDoc, changelog prose, migration guides) — we promote to first-class what real
  systems leave scattered.
- **Curated synthetic data** instead of a scraped real design system — chosen so
  examples read as recognizable without importing a real system's full surface.
- **Only as much component/token richness as the seeded cases require** — no
  attempt at a complete component API.
