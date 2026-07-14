# 03 — MCP Server

Expose version-aware retrieval over the wire, so an external coding agent shares
the exact same source of truth as our own compliance agent.

## Purpose

This is the supporting proof of the project's central claim: one registry serves
both an autonomous auditor (built from scratch) and an interactive assistant
(integrated, not built). The MCP layer is a thin transport over Work Item 02 —
deliberately thin, so that the version-safety invariants are not re-implemented
here where a divergent copy could reintroduce false confidence.

Because 02 did the hard work, this item should be close to trivial. That is the
signal the 02/03 boundary was drawn in the right place.

## Scope

**This item covers:**
- MCP tools over the retrieval module: `get_component`, `get_token`,
  `list_deprecated`.
- stdio transport, callable by an off-the-shelf MCP client (e.g. Claude Code,
  Cursor).
- Tool wrappers that import Work Item 02 directly and add no resolution logic of
  their own.

**This item explicitly does not cover:**
- Remote or streamable-HTTP transport — that is the Work Item 09 stretch.
- Any auth/identity layer (named as a known gap, not built).
- New retrieval or version logic — all of that lives in Work Item 02.

## Outcomes

- The three tools are exposed over MCP stdio and callable by a standard client.
- Results returned over the wire carry the same version-safe status information
  the agent receives in-process.
- No version-safety logic is duplicated in this layer.

## Dependencies

- Work Item 02 (Version-Aware Retrieval).

## Definition of done

- [ ] An off-the-shelf MCP client can connect and list the three tools.
- [ ] Calling each tool returns version-safe results matching the in-process
      output of Work Item 02.
- [ ] The server contains no resolution logic beyond wrapping 02.
