import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Registry } from "../registry/index.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

/**
 * Build the server around an already-loaded registry.
 *
 * The registry arrives as an argument rather than being read here, which is what
 * keeps this layer thin enough to be obviously correct: there is no per-call file
 * read and no mutable state between calls, only lookups answered from memory. It
 * also means the transport can be chosen by the caller — `index.ts` gives it
 * stdio, the tests give it a linked in-memory pair — without either of them
 * standing in for the other.
 */
export function createServer(registry: Registry): McpServer {
  const server = new McpServer({ name: "design-system-registry", version: "0.1.0" });

  registerTools(server, registry);
  registerResources(server, registry);

  return server;
}
