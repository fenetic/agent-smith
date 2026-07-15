import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadRegistry } from "../registry/index.js";
import { createServer } from "./server.js";

/**
 * Start the registry server on stdio.
 *
 * The registry is read once, here, and held in memory for the process's life —
 * so every tool call is answered from memory, with no per-call file read and no
 * mutable state between calls. Loading before connecting also means a registry
 * that violates 01's invariants takes the process down at startup, where an
 * operator is watching, rather than surfacing later as a puzzling tool error.
 *
 * stdio is the only transport (remote/HTTP is 09's), which is why there is
 * nothing here about ports or connection lifecycle: the client owns the process,
 * and the conversation ends when it does.
 */
async function main(): Promise<void> {
  // stdout carries the protocol, so it must stay uncontaminated: anything this
  // process wants to say to a human goes to stderr, here and in `errors.ts`.
  const server = createServer(loadRegistry());

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("design-system-registry: failed to start", error);
  process.exit(1);
});
