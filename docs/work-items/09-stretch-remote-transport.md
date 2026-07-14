# 09 — Stretch: Remote Transport / CI Hook

Show the same registry serving a deployed or CI context, rather than only a local
stdio session.

> **Conditional on time.** This is the single work item gated on time remaining,
> per the brief. Work Items 01–08 are committed. If this item is reached, the
> target below is exact — the conditionality is whether we start it, not what it
> is.

## Purpose

Everything prior runs locally over stdio. This item demonstrates the architecture
extends to where compliance checking actually earns its keep: a deployed MCP
endpoint, or an automated check in CI that flags drift before it merges. It is
proof of reach, not a core claim.

## Scope

**This item covers (if reached):**
- Either: streamable-HTTP MCP transport, so the same tools are reachable remotely
  instead of only over stdio;
- Or: a CI hook that runs the compliance agent against changed code and reports
  drift.

**This item explicitly does not cover:**
- Production auth/identity/security for the remote endpoint (named as a known gap).
- Any change to the retrieval or agent logic — this is transport/integration only.

## Outcomes

- One of the two targets is working: the MCP tools reachable over streamable-HTTP,
  or a CI check that runs the agent and reports drift on a change.

## Dependencies

- Work Item 03 (MCP Server) for the remote-transport path.
- Work Item 04 (Compliance Agent) for the CI-hook path.

## Definition of done

- [ ] Remote path: the three MCP tools are callable over streamable-HTTP and
      return the same version-safe results as stdio; **or**
- [ ] CI path: a CI run executes the agent against changed code and reports drift.
