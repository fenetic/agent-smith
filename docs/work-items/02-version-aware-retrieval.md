# 02 — Version-Aware Retrieval

The core hard problem: resolve registry entries so that stale truth cannot
masquerade as current truth.

## Purpose

The whole system's grounding promise depends on retrieval never handing back a
deprecated fact dressed with the same authority as a current one — "false
confidence." A grounding agent is *more* dangerous when this happens, not less,
because it will cite the stale fact and act more sure of itself.

This item makes deprecated state unignorable by construction rather than by
discipline. It is deliberately separate from the MCP server (03): the safety
invariants live here, in protocol-agnostic TypeScript, so the same guarantees
serve both the in-process agent and any external consumer without duplication.
That is what makes "one source of truth, two consumers" literally true.

It comes second because it depends only on the registry (01) and everything that
resolves data — the MCP tools and the agent — depends on it.

## Scope

**This item covers:**
- Version-scoped queries: no entry resolves without an as-of version context, so
  a result is never floating free of the timeline.
- A discriminated-union result shape (`active` / `deprecated` / `removed`) such
  that a caller cannot read a value without also holding its status.
- Alias-chain resolution that carries the most-deprecated status found in the
  chain, rather than silently passing a value through.
- As-of-version semantics that correctly place any entry within its lifecycle
  window.

**This item explicitly does not cover:**
- Any protocol, transport, or serialization — that is Work Item 03.
- The registry data itself — consumed from Work Item 01.
- Verdict logic — retrieval reports status; it does not judge compliance.

## Outcomes

- A directly importable retrieval module with no protocol dependencies.
- Every query requires a version context; none can resolve without one.
- Deprecated and removed entries are returned in a shape that makes reading them
  as active structurally impossible.
- Alias chains resolve with the correct, most-deprecated status.

## Dependencies

- Work Item 01 (Registry Data Layer).

## Definition of done

- [ ] A unit test proves a deprecated entry cannot be read as active.
- [ ] A unit test proves a query without a version context does not resolve.
- [ ] As-of-version resolution is correct across the registry's version history.
- [ ] Alias-chain resolution carries the most-deprecated status in the chain.
