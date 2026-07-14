# 03 — MCP Server — Design

> Implementation design for [Work Item 03](03-mcp-server.md). Covers how the
> registry's lookups are exposed to external tools over MCP, and how the
> version-safety guarantee from [Work Item 02](02-version-aware-retrieval.design.md)
> is preserved across that boundary. It adds no resolution logic of its own, and
> excludes remote/HTTP transport (that is the Work Item 09 stretch).

## Approach

03 is a small server that exposes 02's lookups over the **Model Context Protocol
(MCP)** — a standard way for AI coding tools to call external tools. It runs as its
own process, loads the registry once at startup, holds it in memory, and offers
three tools: `get_component`, `get_token`, and `list_deprecated` — plus a
read-only resource exposing the registry's version line so a caller can discover
which versions it may query.

It exists for one reason. Our own agent (04) calls 02 directly, in the same
process. An off-the-shelf coding tool — Claude Code, Cursor — cannot: it runs
elsewhere and needs a defined protocol to ask questions. MCP is that protocol.
Exposing 02 over it means an external tool can pull the same version-safe facts
*before* code is written that our agent uses to audit code *after* it is written.
That is the project's "one source of truth, two consumers" claim made real.

It fits as a thin wrapper. It performs no resolution of its own: it validates a
tool call's inputs, hands them to 02, serializes 02's answer, and translates
errors. Each MCP tool maps one-to-one onto a 02 resolver method. If 03 ever needed
its own version logic, that would mean 02's boundary was drawn in the wrong place —
so the fact that this layer is close to trivial is the signal the split was
correct.

## Preserving the guarantee across the wire

02's safety property is that a consumer cannot receive an item's value without also
receiving its status. That must not weaken just because the consumer is now on the
other end of a protocol. Two things carry it across:

- **The version requirement lives in the tool's input schema.** Every tool
  requires a `version` argument; a call without one is rejected by schema
  validation before it ever reaches 02. "No lookup without a version" holds over
  the wire exactly as it does in-process.
- **The safety property is in the data, not just the types.** A `removed` or
  `unknown` answer from 02 has no value field to begin with (see 02's result
  shape). Serialized to JSON and sent over MCP, it *still* has no value field. An
  external tool receives the status and, for a stale item, has nothing to misread.
  The guarantee never depended on TypeScript surviving the boundary — it depended
  on field presence, which does survive.

## The three tools

Each maps directly onto a 02 resolver method. All take `version`; the point
lookups also take an `id`.

| Tool | Input | Calls | Returns |
|------|-------|-------|---------|
| `get_component` | `{ id, version }` | `atVersion(reg, version).component(id)` | the component's `Resolution` |
| `get_token`     | `{ id, version }` | `atVersion(reg, version).token(id)` (alias-resolved) | the token's `Resolution` |
| `list_deprecated` | `{ version }` | `atVersion(reg, version).listDeprecated()` | all items deprecated at that version |

Input schemas are the MCP tool contract: `id` a required string, `version` a
required string. The handler does nothing but call 02, serialize, and return.

## Result serialization

A tool result carries 02's `Resolution` as a structured JSON object — `status`
plus the fields that status implies (`replacedBy` on a deprecated item, and so on)
— so an external agent can branch on it programmatically. Alongside it we include a
short human-readable summary line (e.g. *"`Modal` is deprecated as of 4.0 — use
`Dialog`"*) so the result is legible in a tool that surfaces text to a person. The
JSON is the contract; the summary is a convenience over it, never a substitute.

## Error handling: the same seam as 02

02 already separates *misuse* from *domain conditions*, and 03 preserves that split
across the boundary:

- **A bad query** — a `version` that is not a known registry version — makes 02
  throw. 03 catches it and returns a proper **MCP tool error** with a clear
  message (including the list of known versions), rather than letting the process
  crash. Malformed input fails loudly.
- **A domain condition** — the item is `deprecated`, `removed`, `unknown`, or
  not-yet-added at that version — is a normal, *successful* result carrying the
  status. These are answers, not errors, and are returned as tool results.

## Version discovery: a read-only resource

A caller must know which versions exist before it can ask a version-scoped
question, and blind-guessing a version is a poor first-use experience. So the
server also exposes the registry's version line as an MCP **resource** — read-only
data, distinct from the action tools.

- The resource returns `meta` from 01: the ordered `versions` array (plus `name`
  and `modelledOn`). A caller reads it once to learn the valid versions, then
  passes one to the tools.
- It is a *resource*, not a tool, deliberately: MCP tools are actions a caller
  invokes, resources are data a caller reads. The version line is reference data,
  so it belongs in the resource channel — and keeping it there stops the version
  list from being mistaken for something you "call."
- Like the tools, it is a thin read: the handler returns `registry.meta`, held in
  memory since startup. No resolution, no computation.

The bad-version tool error (above) still lists the known versions, so a caller that
skips the resource and guesses wrong is corrected either way; the resource just
makes the good path available up front.

## Statelessness and runtime

- Node process using the MCP SDK over **stdio** transport (HTTP is 09).
- The registry is loaded once at startup via `loadRegistry()` (01) and held in
  memory. Each tool call constructs `atVersion(registry, version)` and answers from
  memory — no per-call file reads, no mutable state between calls.

## Proposed module layout

```
src/mcp/
  server.ts       # construct the MCP server, register tools + resource, wire stdio transport
  tools.ts        # the three tool definitions: input schema + handler calling 02
  resources.ts    # the version-line resource: returns registry.meta
  serialize.ts    # Resolution → { json, summary } tool payload
  errors.ts       # translate thrown 02 errors → MCP tool errors
  index.ts        # entrypoint: loadRegistry() then start the server on stdio
```

## Validation & tests

Maps to the work item's definition of done:

- **A real MCP client can connect and list all three tools and the version
  resource**, and reading the resource returns the registry's ordered version
  line.
- **Parity with in-process 02** — for the same `(id, version)`, the result
  returned over MCP equals the result of calling 02 directly. This is the test
  that proves no logic was duplicated or dropped at the boundary.
- **Version safety survives serialization** — a `removed`/`unknown` result carries
  status and no value field over the wire.
- **Bad version → clean tool error**, not a crash; the message names the known
  versions.
- **No resolution logic in this layer** — handlers only validate, call 02,
  serialize, and translate errors.

## Deliberate scope cuts (feeds the README)

- **stdio only** — no remote/HTTP transport (09), so no networking, ports, or
  connection lifecycle to manage this weekend.
- **No auth/identity** on the server — named as a known gap, not built. A real
  deployment exposing a registry would gate access; we do not.
- **Read-only** — three query tools, no tools that mutate the registry.
- **Three tools, by design** — the minimal set that covers point lookups and the
  deprecation sweep; not a general query language over the registry.
