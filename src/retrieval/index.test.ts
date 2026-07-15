import { describe, expect, expectTypeOf, it } from "vitest";
import type { ComponentEntry, Registry } from "../registry/index.js";
import type { Resolution } from "./index.js";
import { atVersion } from "./index.js";

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

const registry: Registry = {
  meta: {
    name: "Northwind Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  },
  components: [modal],
  tokens: [],
};

describe("the public surface", () => {
  it("resolves through atVersion", () => {
    expect(atVersion(registry, "4.0").component("Modal")).toMatchObject({
      status: "deprecated",
    });
  });
});

/**
 * These assertions are checked by `npm run typecheck`, not at runtime — `tsc`
 * covers `src`, so a `@ts-expect-error` that stops erroring fails the build as an
 * unused directive. The safety claim is enforced rather than described: if someone
 * widens the union so a value can be read without its status, this goes red.
 */
describe("a value cannot be read without its status", () => {
  it("refuses to hand over an entry until the caller has branched on status", () => {
    const resolution = atVersion(registry, "4.0").component("Modal");

    // @ts-expect-error — `entry` is unreachable on the bare union. This is the
    // whole safety property: you cannot get to a value without saying which
    // status you are prepared to handle.
    resolution.entry;

    expect(resolution).toBeDefined();
  });

  it("hands over the entry once narrowed to active", () => {
    const resolution = atVersion(registry, "3.0").component("Modal");

    if (resolution.status === "active") {
      expectTypeOf(resolution.entry).toEqualTypeOf<ComponentEntry>();
    }

    expect(resolution.status).toBe("active");
  });

  it("hands over the entry, and where to go instead, once narrowed to deprecated", () => {
    const resolution = atVersion(registry, "4.0").component("Modal");

    if (resolution.status === "deprecated") {
      expectTypeOf(resolution.entry).toEqualTypeOf<ComponentEntry>();
      expectTypeOf(resolution.replacedBy).toEqualTypeOf<string>();
    }

    expect(resolution.status).toBe("deprecated");
  });
});

describe("a removed entry has no value to read, and the type says so", () => {
  it("offers no entry even after narrowing to removed", () => {
    const resolution = atVersion(registry, "6.0").component("Modal");

    if (resolution.status === "removed") {
      // @ts-expect-error — narrowing to `removed` does not reveal an entry; there
      // is none. A stale value cannot be read because it is not there to read.
      resolution.entry;
    }

    expect(resolution.status).toBe("removed");
  });

  it("offers no entry even after narrowing to unknown", () => {
    const resolution = atVersion(registry, "4.0").component("Carousel");

    if (resolution.status === "unknown") {
      // @ts-expect-error — same for an id the registry never knew.
      resolution.entry;
    }

    expect(resolution.status).toBe("unknown");
  });
});

describe("a deprecated entry cannot be read as an active one", () => {
  it("does not let an active-shaped read reach a deprecated resolution", () => {
    const deprecated: Resolution<ComponentEntry> = {
      status: "deprecated",
      asOf: "4.0",
      entry: modal,
      deprecatedIn: "4.0",
      replacedBy: "Dialog",
    };

    // @ts-expect-error — the `active` variant does not accept a deprecated
    // resolution: `status` alone rules it out, so a deprecated entry cannot be
    // laundered into a context expecting an active one.
    const asActive: Extract<
      Resolution<ComponentEntry>,
      { status: "active" }
    > = deprecated;

    expect(asActive).toBeDefined();
  });

  it("rejects a deprecated variant built without a replacement", () => {
    // 01 guarantees a deprecation names where to go instead, and the type holds
    // the layer to it — a deprecation you cannot act on is not one worth reporting.
    // @ts-expect-error — missing `replacedBy`.
    const incomplete: Resolution<ComponentEntry> = {
      status: "deprecated",
      asOf: "4.0",
      entry: modal,
      deprecatedIn: "4.0",
    };

    expect(incomplete).toBeDefined();
  });
});
