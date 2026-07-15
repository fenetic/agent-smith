import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Registry } from "../registry/index.js";

/** Where a caller reads the version line before asking anything version-scoped. */
const VERSIONS_URI = "registry://versions";

/**
 * Expose the registry's version line as read-only data.
 *
 * A resource rather than a tool, and the distinction is the point: tools are
 * actions a caller invokes, resources are data a caller reads. The version line
 * is reference data — you consult it to learn what you may ask, then ask. Putting
 * it among the tools would invite a caller to treat "which versions exist" as a
 * lookup on the same footing as "what happened to Modal", when it is the question
 * you must answer *before* either of those makes sense.
 *
 * It is also the good path onto the version requirement, not the only one: a
 * caller that skips this and guesses gets a tool error naming the known versions
 * either way. This just means they need not guess in the first place.
 */
export function registerResources(server: McpServer, registry: Registry): void {
  server.registerResource(
    "versions",
    VERSIONS_URI,
    {
      title: "Design-system version line",
      description:
        "The registry's ordered version history. Read this to learn which versions the tools will accept.",
      mimeType: "application/json",
    },
    // `meta` is 01's, held in memory since startup — a read, not a computation.
    () => ({
      contents: [
        {
          uri: VERSIONS_URI,
          mimeType: "application/json",
          text: JSON.stringify(registry.meta, null, 2),
        },
      ],
    }),
  );
}
