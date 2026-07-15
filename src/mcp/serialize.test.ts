import { describe, expect, it } from "vitest";
import type { ComponentEntry, Registry } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";
import { serialize } from "./serialize.js";

const modal: ComponentEntry = {
  id: "Modal",
  kind: "component",
  description: "An overlay.",
  lifecycle: {
    addedIn: "1.0",
    deprecatedIn: "4.0",
    replacedBy: "Dialog",
    removedIn: "6.0",
  },
};

const dialog: ComponentEntry = {
  id: "Dialog",
  kind: "component",
  description: "An overlay, but current.",
  lifecycle: { addedIn: "4.0" },
};

/** Removed without ever being deprecated — so there is nowhere to send anyone. */
const banner: ComponentEntry = {
  id: "Banner",
  kind: "component",
  description: "A strip along the top.",
  lifecycle: { addedIn: "1.0", removedIn: "5.0" },
};

const registry: Registry = {
  meta: {
    name: "Northwind Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  },
  components: [modal, dialog, banner],
  tokens: [],
};

/** What an external tool actually receives, rather than what we held in memory. */
function overTheWire(resolution: Parameters<typeof serialize>[0]): unknown {
  return JSON.parse(JSON.stringify(serialize(resolution).json));
}

function summaryOf(resolution: Parameters<typeof serialize>[0]): string {
  return serialize(resolution).summary;
}

/**
 * 02's safety property is that a value cannot be read without its status. Across
 * the boundary the types are gone, so what has to survive is the *shape*: a stale
 * item has no value field to misread, and serialisation cannot invent one.
 */
describe("a stale item crosses the wire with nothing to misread", () => {
  it("gives a removed resolution no entry field", () => {
    expect(
      overTheWire(atVersion(registry, "6.0").component("Modal")),
    ).not.toHaveProperty("entry");
  });
});

/**
 * A convenience for a client that shows text to a person, never a substitute for
 * the JSON. Every line names the item and the version it was asked about, so a
 * summary read on its own cannot be mistaken for a timeless fact.
 */
describe("the summary line", () => {
  it("reports an active item as current", () => {
    expect(summaryOf(atVersion(registry, "3.0").component("Modal"))).toBe(
      "`Modal` is active as of 3.0.",
    );
  });

  it("points a deprecated item at its replacement", () => {
    expect(summaryOf(atVersion(registry, "4.0").component("Modal"))).toBe(
      "`Modal` is deprecated as of 4.0 — use `Dialog`.",
    );
  });

  it("names where a removed item went", () => {
    expect(summaryOf(atVersion(registry, "6.0").component("Modal"))).toBe(
      "`Modal` was removed in 6.0 — use `Dialog`.",
    );
  });

  it("does not invent a replacement for a removal that never named one", () => {
    expect(summaryOf(atVersion(registry, "5.0").component("Banner"))).toBe(
      "`Banner` was removed in 5.0.",
    );
  });

  it("distinguishes an item that does not exist yet", () => {
    expect(summaryOf(atVersion(registry, "1.0").component("Dialog"))).toBe(
      "`Dialog` does not exist as of 1.0 — it was added in a later version.",
    );
  });

  it("distinguishes an id the registry never knew", () => {
    expect(summaryOf(atVersion(registry, "4.0").component("Carousel"))).toBe(
      "`Carousel` is not an id this registry knows.",
    );
  });
});
