import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ComponentEntry, Registry, TokenEntry } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";
import { translating } from "./errors.js";
import type { SweepPayload, ToolPayload } from "./serialize.js";
import { serialize, serializeSweep } from "./serialize.js";

/**
 * Every tool takes a version, and the schema is what enforces it: a call without
 * one is rejected by validation before it reaches 02. "No lookup without a
 * version" is 02's structural guarantee, and this is the same guarantee wearing
 * the protocol's clothes — not a rule this layer remembers to apply.
 */
const version = z
  .string()
  .describe(
    "The design-system version to answer as of. Read the version resource for the list.",
  );

const id = z.string().describe("The entry's id, exactly as written in code.");

/**
 * Hand a serialised answer back as a tool result: the JSON as the contract a
 * caller branches on, the summary as text for a client that shows it to a person.
 *
 * A domain condition — deprecated, removed, unknown — is a *successful* result
 * here, never `isError`. The item is stale, but the question was valid and the
 * answer is correct; flagging it would tell the caller to handle a failure when
 * what they need to do is read the status.
 */
function resultOf(
  payload: ToolPayload<ComponentEntry | TokenEntry> | SweepPayload,
): CallToolResult {
  return {
    structuredContent: payload.json,
    content: [{ type: "text", text: payload.summary }],
  };
}

/** Register the three lookups, each a thin wrapper over one 02 resolver method. */
export function registerTools(server: McpServer, registry: Registry): void {
  server.registerTool(
    "get_component",
    {
      description:
        "Look up a component's standing as of a version: whether it is active, deprecated (and what replaced it), removed, or unknown.",
      inputSchema: { id, version },
    },
    ({ id, version }) =>
      translating(() =>
        resultOf(serialize(atVersion(registry, version).component(id))),
      ),
  );

  server.registerTool(
    "get_token",
    {
      description:
        "Look up a design token's standing as of a version, following any alias chain to report it at its worst node.",
      inputSchema: { id, version },
    },
    // `token` is 02's alias-resolving path. Reading a token's own lifecycle
    // instead would be quicker and wrong: a stale alias pointing at a live value
    // would report "active", which is the false confidence 02 exists to prevent.
    ({ id, version }) =>
      translating(() => resultOf(serialize(atVersion(registry, version).token(id)))),
  );

  server.registerTool(
    "list_deprecated",
    {
      description:
        "List every component and token that is deprecated as of a version, with its replacement.",
      inputSchema: { version },
    },
    ({ version }) =>
      translating(() =>
        resultOf(
          serializeSweep(atVersion(registry, version).listDeprecated(), version),
        ),
      ),
  );
}
