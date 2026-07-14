# 02 — Version-Aware Retrieval — Design

> Implementation design for [Work Item 02](02-version-aware-retrieval.md). Covers
> how retrieval makes deprecated state unignorable by construction: the
> version-bound query surface, the discriminated result shape, version ordering,
> and alias-chain severity. It builds only on the typed `Registry` from
> [Work Item 01](01-registry-data-layer.design.md) and depends on no transport
> (03) and no verdict logic (04).

## Approach

02 is a lookup layer between the raw registry data (01) and everything that
consumes it — the agent (04) directly, and the MCP server (03) as a thin wrapper
over it. Its input is a component or token id plus a version; its output is that
item's status at that version — **active, deprecated, or removed** — together with
the facts that matter (for a deprecated item, what replaced it).

It has to exist because the registry stores each item as a *timeline*, not a
status: added in 2.0, deprecated in 4.0, replaced by Dialog, removed in 6.0. No
consumer wants a timeline; each wants a single answer — is this okay to use? — and
that answer depends entirely on the target version. `Modal` is active at 3.0,
deprecated at 4.1, gone at 6.0: one entry, three answers. Something has to turn
"raw timeline + target version" into "status at that version." That is 02, and
building it once as its own module is what lets 03 and 04 share one source of
answers instead of duplicating the logic and drifting apart.

The specific failure it prevents is returning a stale item as if it were current —
a usable value handed back with no signal that it is deprecated or removed. That is
worse than no answer, because the consumer proceeds with confidence on a wrong
fact, and a grounding agent will cite it and act *more* sure for having done so.

So the core requirement is not merely "compute the status." It is: **a consumer
cannot receive an item's value without also receiving its status.** Two design
choices deliver that:

- **The query is version-scoped** — you ask "what is `X` as of version `V`", never
  "what is `X`". A lookup without a version is malformed by definition, and we make
  it unspellable.
- **The answer reports its own standing** — not a bare value but "active — here is
  the value", "deprecated since 4.0, use this instead — here is the value", or
  "removed — there is no value." The value is reachable only after you confront the
  status.

Concretely that is two artifacts: a **version-bound resolver** — the only way to
ask a question — returning a **discriminated union** — an answer whose value is
unreachable until you branch on its status. Everything below is the precise
behaviour of those two.

## The safety claim, stated precisely

Retrieval must make three things true *by construction*, not by discipline:

1. **No lookup resolves without a version context** — a result is never floating
   free of the timeline.
2. **A value cannot be read without its status** — the value lives inside a
   discriminated variant that also carries the status, so the caller must branch.
3. **A stale alias cannot masquerade as current** — following an alias edge
   carries the most-deprecated status found along the chain.

The rest of this doc is how each is enforced.

## Result shape

Every resolution is a discriminated union keyed on `status`. The value only
exists inside variants where reading it is safe:

```
type Resolution<T> =
  | { status: 'active';     asOf: Version; entry: T }
  | { status: 'deprecated'; asOf: Version; entry: T;
      deprecatedIn: Version; replacedBy: Ref; removedIn?: Version }
  | { status: 'removed';    asOf: Version; id: string;
      removedIn: Version; replacedBy: Ref }              // no entry/value
  | { status: 'unknown';    asOf: Version; id: string;
      reason: 'not-yet-added' | 'unrecognized-id' }      // no entry/value
```

- `active` / `deprecated` carry `entry` (and thus its value). `deprecated` also
  carries where to go instead.
- `removed` and `unknown` carry **no `entry` at all** — there is no value to read,
  and the type makes reaching for one a compile error.
- `unknown` distinguishes *not-yet-added at this version* from *never existed*
  (a typo or a hallucinated id) — a meaningful difference to the agent (04).

This is why the guarantee survives the MCP boundary (03): safety is encoded in the
*presence of fields*, not only in the TypeScript type. Serialized to JSON, a
`removed`/`unknown` result still has no value field to misread.

## Query surface

**Decision: a version-bound resolver, not free functions with an `asOf` argument.**

You cannot look anything up until you have committed to a version:

```
const at = atVersion(registry, '4.1');   // validates '4.1' is a known version
at.component('Modal');                    // Resolution<ComponentEntry>
at.token('brand.primary');                // Resolution<TokenEntry>, alias-resolved
at.listDeprecated();                      // Resolution[] — everything deprecated at 4.1
```

`atVersion` is the only entry point, so requirement (1) is structural: there is no
way to spell a lookup that lacks a version. An `asOf` that isn't a declared version
is a caller bug, so `atVersion` **throws** rather than returning `unknown` —
`unknown` is for questions about the *data*, not malformed *queries*.

*Rejected alternative:* free functions like `getComponent(registry, id, {asOf})`.
Equivalent power, but the version becomes a parameter you can forget or default;
the bound resolver makes forgetting unspeakable.

## Version ordering

`meta.versions` (from 01) is the single ordered list. Comparison is index-based:

```
compareVersions(meta, a, b)   // sign of indexOf(a) − indexOf(b)
```

Status at `asOf` for an entry with a `Lifecycle` is a pure function of these
comparisons:

| Condition (by version order) | Resulting status |
|------------------------------|------------------|
| `asOf < addedIn`             | `unknown` (`not-yet-added`) |
| `addedIn ≤ asOf` and (no `deprecatedIn` or `asOf < deprecatedIn`) | `active` |
| `deprecatedIn ≤ asOf` and (no `removedIn` or `asOf < removedIn`)  | `deprecated` |
| `removedIn ≤ asOf`           | `removed` |
| id not present in registry   | `unknown` (`unrecognized-id`) |

## Alias-chain resolution

Token resolution walks the `alias` edges from 01 to reach a concrete value, and
computes status as the **most-severe status over every node visited**:

```
severity:  active < deprecated < removed        (unknown is terminal — see below)
```

- Walk `brand.primary → color.blue-500`, evaluating each node's status at `asOf`.
- The resolved `status` is the max severity encountered. So `brand.primary`
  (deprecated in 4.0) resolving to `color.blue-500` (active) reads as **deprecated
  at 4.1**, carrying `replacedBy: brand.primaryV2` — even though a live value
  exists. That is exactly the false-confidence case (01 case C) defused.
- A value is returned **only if every node on the chain is active-or-deprecated**
  (i.e. has a live value). If any node is `removed` or `unknown` at `asOf`, the
  whole resolution collapses to that status with **no value** — a chain is only as
  readable as its most-broken link.

Referential integrity (guaranteed by 01) means edges always point at real ids, so
the only chain failures are temporal (`not-yet-added` / `removed` at `asOf`), never
dangling. Cycle-safety: the walk tracks visited ids and treats a cycle as a load-
time invariant violation surfaced by 01, not a runtime concern here.

## What this layer does not do

- **No transport / serialization** — that is Work Item 03. This is pure,
  in-process TypeScript.
- **No verdicts or compliance judgment** — retrieval reports *status*; deciding
  whether a given usage is a violation is the agent (04).
- **No intent** — "is this deprecated usage acceptable here" is exactly what a
  rule can't answer; retrieval doesn't try. It supplies the grounded fact the
  agent reasons over.
- **No mutation** — the registry is read-only through this layer.

## Proposed module layout

```
src/retrieval/
  types.ts       # Resolution<T> union, Resolver interface
  version.ts     # compareVersions, isKnownVersion over meta.versions
  status.ts      # lifecycle → status at asOf (the table above)
  alias.ts       # alias-chain walk + most-severe status
  resolve.ts     # atVersion(registry, version) → Resolver
  index.ts       # public surface: atVersion + Resolution types
```

## Validation & tests

Maps to the work item's definition of done:

- **Deprecated cannot read as active** — for a deprecated-at-`asOf` entry, the
  `active` branch is unreachable; a type-level test asserts `entry` is not
  accessible without narrowing on `status`.
- **No lookup without a version** — enforced structurally; the test is that
  `atVersion` is the sole entry point and an unknown version throws.
- **As-of correctness across history** — table test over the full version line for
  a fully-lifecycled entry (Modal: active at 3.0, deprecated at 4.0, removed at
  6.0).
- **Alias severity** — case C resolves to `deprecated` at 4.1 with the right
  `replacedBy`; a chain through a removed node yields `removed` with no value.
- **Invalid `asOf` throws** rather than resolving.
