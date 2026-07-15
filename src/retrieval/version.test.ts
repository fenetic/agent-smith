import { describe, expect, it } from "vitest";
import type { Meta } from "../registry/index.js";
import { compareVersions, isKnownVersion } from "./version.js";

const meta: Meta = {
  name: "Northwind Design System",
  modelledOn: "Material Design",
  versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
};

describe("compareVersions", () => {
  it("orders an earlier version before a later one", () => {
    expect(compareVersions(meta, "3.0", "5.0")).toBeLessThan(0);
  });

  it("orders a later version after an earlier one", () => {
    expect(compareVersions(meta, "5.0", "3.0")).toBeGreaterThan(0);
  });

  it("treats a version as equal to itself", () => {
    expect(compareVersions(meta, "4.0", "4.0")).toBe(0);
  });

  it("orders by position in the history, not by string comparison", () => {
    const releases: Meta = { ...meta, versions: ["9.0", "10.0"] };

    expect(compareVersions(releases, "9.0", "10.0")).toBeLessThan(0);
  });

  it("rejects a comparison against a version outside the history", () => {
    expect(() => compareVersions(meta, "4.0", "9.9")).toThrow(/9\.9/);
  });
});

describe("isKnownVersion", () => {
  it("accepts a version in the history", () => {
    expect(isKnownVersion(meta, "4.0")).toBe(true);
  });

  it("rejects a version outside the history", () => {
    expect(isKnownVersion(meta, "4.1")).toBe(false);
  });
});
