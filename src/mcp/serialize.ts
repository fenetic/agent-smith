import type { ComponentEntry, TokenEntry, Version } from "../registry/index.js";
import type { Resolution } from "../retrieval/index.js";

/** Anything 02 resolves: a component, a token, or either from the deprecation sweep. */
type Entry = ComponentEntry | TokenEntry;

/**
 * What a tool call returns: 02's answer as structured data, plus a line a person
 * can read. The JSON is the contract; the summary is a convenience over it.
 */
export interface ToolPayload<T extends Entry> {
  json: Resolution<T>;
  summary: string;
}

/**
 * The sweep's equivalent. The resolutions live under a name rather than as a bare
 * array because a tool's structured result is an object — so the array needs a
 * field to sit in, and `deprecated` says what they are.
 */
export interface SweepPayload {
  json: { deprecated: Resolution<Entry>[] };
  summary: string;
}

/**
 * Say what `resolution` means in one line, for a client that shows text to a
 * person. Every line names the version it was asked about: read on its own, a
 * summary must not pass as a timeless fact about the item.
 *
 * The switch is exhaustive by construction — narrowing on `status` is what lets
 * each branch reach only the fields that variant actually carries, so this cannot
 * claim a replacement that 02 did not report.
 */
function summarise<T extends Entry>(resolution: Resolution<T>): string {
  switch (resolution.status) {
    case "active":
      return `\`${resolution.entry.id}\` is active as of ${resolution.asOf}.`;

    case "deprecated":
      return `\`${resolution.entry.id}\` is deprecated as of ${resolution.asOf} — use \`${resolution.replacedBy}\`.`;

    case "removed":
      // `replacedBy` is optional here alone: an entry may be removed without ever
      // having been deprecated, and 01 only guarantees a replacement where there
      // was a deprecation. Nowhere to send anyone is a fact, not a gap to fill.
      return resolution.replacedBy === undefined
        ? `\`${resolution.id}\` was removed in ${resolution.removedIn}.`
        : `\`${resolution.id}\` was removed in ${resolution.removedIn} — use \`${resolution.replacedBy}\`.`;

    case "unknown":
      return resolution.reason === "not-yet-added"
        ? `\`${resolution.id}\` does not exist as of ${resolution.asOf} — it was added in a later version.`
        : `\`${resolution.id}\` is not an id this registry knows.`;
  }
}

/**
 * Carry a resolution across the MCP boundary.
 *
 * The JSON is the resolution itself, unmapped. That is the point rather than an
 * omission: 02's union is already plain data whose *shape* is the safety property,
 * so a `removed` answer has no value field to serialise and arrives with nothing
 * to misread. Rebuilding the payload field-by-field here would be the one way to
 * lose that — a hand-written mapping is where a stale value gets reintroduced.
 */
export function serialize<T extends Entry>(resolution: Resolution<T>): ToolPayload<T> {
  return { json: resolution, summary: summarise(resolution) };
}

/**
 * Carry 02's deprecation sweep across, as of `asOf`.
 *
 * Each line is the same `summarise` the point lookups use, so an item reads the
 * same however it was reached — a sweep that phrased deprecations its own way
 * would be a second description of the same fact, free to drift from the first.
 */
export function serializeSweep(
  deprecated: Resolution<Entry>[],
  asOf: Version,
): SweepPayload {
  const lines = deprecated.map((resolution) => `- ${summarise(resolution)}`);
  const count =
    deprecated.length === 1 ? "1 item is" : `${deprecated.length} items are`;

  return {
    json: { deprecated },
    summary:
      deprecated.length === 0
        ? `Nothing is deprecated as of ${asOf}.`
        : [`${count} deprecated as of ${asOf}:`, ...lines].join("\n"),
  };
}
