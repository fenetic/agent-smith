import { describe, expect, it, vi } from "vitest";
import type { Registry } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";
import { translating } from "./errors.js";

const registry: Registry = {
  meta: {
    name: "Northwind Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0"],
  },
  components: [
    {
      id: "Modal",
      kind: "component",
      description: "An overlay.",
      lifecycle: { addedIn: "1.0" },
    },
  ],
  tokens: [],
};

/** The text an MCP client would actually show for a tool result. */
function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content
    .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
    .join("");
}

/** A lookup at a version the registry never released — 02 throws on this. */
const askAtUnreleasedVersion = () => {
  const resolver = atVersion(registry, "9.9");
  return { content: [{ type: "text" as const, text: resolver.asOf }] };
};

/**
 * 02 draws a line between a malformed question and a fact about the data, and
 * throwing is how it reports the former. That line has to survive the boundary:
 * a bad version is the caller's mistake, so it comes back as a tool error the
 * caller can read and correct — not as a crashed server, and not as `unknown`,
 * which would let a typo read as "this doesn't exist yet".
 */
describe("a bad version comes back as a tool error", () => {
  it("reports it as an error rather than letting 02's throw escape", () => {
    expect(translating(askAtUnreleasedVersion).isError).toBe(true);
  });

  it("names the versions the registry does know, so the caller can correct it", () => {
    expect(textOf(translating(askAtUnreleasedVersion))).toContain("1.0, 2.0, 3.0");
  });
});

/** What 02 throws when an entry's timeline is incoherent — a bug, not a question. */
const hitIncoherentData = () => {
  throw new Error('Modal is "deprecated" at 4.0 but its lifecycle does not say when');
};

/**
 * The counterweight, and the reason this module exists at all.
 *
 * The protocol flattens everything: the MCP SDK catches whatever a handler throws
 * and hands the caller a tool error, so a corrupt registry and a mistyped version
 * would look identical from the outside and a real defect could sit unnoticed
 * behind a polite message. What the SDK cannot decide is which of the two an
 * operator needs woken up about — so that judgement is this layer's job, and
 * stderr is where it lands. Under stdio, stdout carries the protocol and stderr
 * is free, which is exactly why it is the channel for this.
 */
describe("a defect is reported where an operator will see it", () => {
  it("lets an error that is not about the version through", () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => translating(hitIncoherentData)).toThrow("does not say when");
    } finally {
      stderr.mockRestore();
    }
  });

  it("says so on stderr, where the protocol is not listening", () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => translating(hitIncoherentData)).toThrow();
      expect(stderr).toHaveBeenCalledOnce();
    } finally {
      stderr.mockRestore();
    }
  });

  it("stays quiet about a bad version, which is the caller's to fix and not a bug", () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      translating(askAtUnreleasedVersion);
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
    }
  });
});
