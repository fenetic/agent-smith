import { describe, expect, it } from "vitest";
import type { Lifecycle, Meta } from "../registry/index.js";
import { statusAt } from "./status.js";

const meta: Meta = {
  name: "Northwind Design System",
  modelledOn: "Material Design",
  versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
};

/** Modal, from the seed data — the one entry that exercises every status. */
const fullyLifecycled: Lifecycle = {
  addedIn: "1.0",
  deprecatedIn: "4.0",
  replacedBy: "Dialog",
  removedIn: "6.0",
};

describe("statusAt — a fully-lifecycled entry across the whole history", () => {
  it.each([
    { asOf: "1.0", expected: "active" },
    { asOf: "2.0", expected: "active" },
    { asOf: "3.0", expected: "active" },
    { asOf: "4.0", expected: "deprecated" },
    { asOf: "5.0", expected: "deprecated" },
    { asOf: "6.0", expected: "removed" },
  ])("reads $expected at $asOf", ({ asOf, expected }) => {
    expect(statusAt(meta, fullyLifecycled, asOf)).toBe(expected);
  });
});

describe("statusAt — boundaries are inclusive", () => {
  it("is deprecated in the very version that deprecates it", () => {
    expect(statusAt(meta, fullyLifecycled, "4.0")).toBe("deprecated");
  });

  it("is removed in the very version that removes it", () => {
    expect(statusAt(meta, fullyLifecycled, "6.0")).toBe("removed");
  });

  it("is active in the very version that adds it", () => {
    expect(statusAt(meta, fullyLifecycled, "1.0")).toBe("active");
  });
});

describe("statusAt — partial lifecycles", () => {
  it("stays active when never deprecated", () => {
    expect(statusAt(meta, { addedIn: "1.0" }, "6.0")).toBe("active");
  });

  it("stays deprecated when deprecated but never removed", () => {
    const lifecycle: Lifecycle = {
      addedIn: "2.0",
      deprecatedIn: "5.0",
      replacedBy: "size=xl",
    };

    expect(statusAt(meta, lifecycle, "6.0")).toBe("deprecated");
  });

  it("reads removed when removed without ever being deprecated", () => {
    expect(statusAt(meta, { addedIn: "1.0", removedIn: "5.0" }, "5.0")).toBe("removed");
  });
});

describe("statusAt — before the entry exists", () => {
  it("reads not-yet-added at a version earlier than addedIn", () => {
    expect(statusAt(meta, { addedIn: "5.0" }, "1.0")).toBe("not-yet-added");
  });

  it("reads not-yet-added one version before it is added", () => {
    expect(statusAt(meta, { addedIn: "5.0" }, "4.0")).toBe("not-yet-added");
  });
});
