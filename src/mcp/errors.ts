import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Run `answer`, keeping 02's misuse/defect seam intact across the boundary.
 *
 * 02 answers a domain condition — deprecated, removed, unknown — by *returning* a
 * status, so those arrive here as ordinary successful results and need no help.
 * It throws in two very different situations, and telling them apart is the whole
 * job of this module:
 *
 * - **A malformed question.** The caller named a version the registry never
 *   released. That is theirs to fix, and 02's message already names the versions
 *   that do exist, so it goes back as a tool error and nothing more is said.
 * - **A defect.** 02 also throws when an entry's timeline is incoherent — a
 *   violation of the invariants 01 guarantees, meaning the data is wrong rather
 *   than the question. No caller can act on that and no retry can fix it.
 *
 * The protocol cannot tell these apart, and does not try: the MCP SDK catches
 * whatever a handler throws and hands the caller a tool error either way. That is
 * the right *caller-facing* behaviour for both — but it means a corrupt registry
 * and a typo look identical from outside, and a real bug could sit unnoticed
 * behind a polite message. So the one thing this layer adds is the judgement the
 * SDK has no way to make: a defect is announced on stderr, where an operator will
 * see it, and then re-thrown for the SDK to report to the caller as usual. Under
 * stdio, stdout carries the protocol and stderr is free — which is precisely why
 * that is the channel for it.
 *
 * A `RangeError` is specifically what `atVersion` raises for an unreleased
 * version, so narrowing on it draws the line exactly where 02 drew it.
 */
export function translating(answer: () => CallToolResult): CallToolResult {
  try {
    return answer();
  } catch (error) {
    if (!(error instanceof RangeError)) {
      // Loud here, because the caller's copy of this will read like any other
      // tool error and tell nobody that the registry itself is wrong.
      console.error(
        "design-system-registry: unexpected failure answering a lookup",
        error,
      );
      throw error;
    }

    // 02's message already names the known versions — the caller's way out.
    return { content: [{ type: "text", text: error.message }], isError: true };
  }
}
