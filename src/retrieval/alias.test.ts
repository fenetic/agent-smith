import { describe, expect, it } from "vitest";
import type { Registry, TokenEntry } from "../registry/index.js";
import { atVersion } from "./resolve.js";

const blue: TokenEntry = {
  id: "color.blue-500",
  kind: "token",
  type: "color",
  value: "#2196F3",
  lifecycle: { addedIn: "1.0" },
};

const indigo: TokenEntry = {
  id: "color.indigo-600",
  kind: "token",
  type: "color",
  value: "#3949AB",
  lifecycle: { addedIn: "4.0" },
};

/** Case C — a stale alias pointing at a live value. The false-confidence case. */
const brandPrimary: TokenEntry = {
  id: "brand.primary",
  kind: "token",
  type: "color",
  alias: "color.blue-500",
  lifecycle: {
    addedIn: "1.0",
    deprecatedIn: "4.0",
    replacedBy: "brand.primaryV2",
  },
};

const brandPrimaryV2: TokenEntry = {
  id: "brand.primaryV2",
  kind: "token",
  type: "color",
  alias: "color.indigo-600",
  lifecycle: { addedIn: "4.0" },
};

/** An alias onto a token that is removed at 5.0 — a chain with a broken link. */
const legacyAccent: TokenEntry = {
  id: "legacy.accent",
  kind: "token",
  type: "color",
  alias: "color.retired",
  lifecycle: { addedIn: "1.0" },
};

const retired: TokenEntry = {
  id: "color.retired",
  kind: "token",
  type: "color",
  value: "#BADA55",
  lifecycle: {
    addedIn: "1.0",
    deprecatedIn: "3.0",
    replacedBy: "color.blue-500",
    removedIn: "5.0",
  },
};

/** An alias onto a token that does not exist until 4.0. */
const earlyBird: TokenEntry = {
  id: "early.bird",
  kind: "token",
  type: "color",
  alias: "color.indigo-600",
  lifecycle: { addedIn: "1.0" },
};

/** Three hops: surface.brand -> brand.primary -> color.blue-500. */
const surfaceBrand: TokenEntry = {
  id: "surface.brand",
  kind: "token",
  type: "color",
  alias: "brand.primary",
  lifecycle: { addedIn: "2.0" },
};

const registry: Registry = {
  meta: {
    name: "Northwind Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  },
  components: [],
  tokens: [
    blue,
    indigo,
    brandPrimary,
    brandPrimaryV2,
    legacyAccent,
    retired,
    earlyBird,
    surfaceBrand,
  ],
};

describe("alias chains — an all-active chain", () => {
  it("resolves to active", () => {
    expect(atVersion(registry, "4.0").token("brand.primaryV2")).toMatchObject({
      status: "active",
    });
  });

  it("carries the token that was asked for, not the one it points at", () => {
    expect(atVersion(registry, "4.0").token("brand.primaryV2")).toMatchObject({
      entry: brandPrimaryV2,
    });
  });

  it("carries the chain through to the concrete value", () => {
    expect(atVersion(registry, "4.0").token("brand.primaryV2")).toMatchObject({
      via: [indigo],
    });
  });

  it("carries no chain for a token that holds its own value", () => {
    expect(atVersion(registry, "4.0").token("color.blue-500")).not.toHaveProperty(
      "via",
    );
  });
});

describe("alias chains — case C: a stale alias onto a live value", () => {
  it("reads deprecated even though the value it points at is active", () => {
    // The whole point of 02: color.blue-500 is perfectly alive, so following the
    // edge and reporting the target's status would read "active" — confidently wrong.
    expect(atVersion(registry, "4.0").token("brand.primary")).toMatchObject({
      status: "deprecated",
    });
  });

  it("names where to go instead, from the node that is actually deprecated", () => {
    expect(atVersion(registry, "4.0").token("brand.primary")).toMatchObject({
      deprecatedIn: "4.0",
      replacedBy: "brand.primaryV2",
    });
  });

  it("still reaches the live value, flagged rather than withheld", () => {
    expect(atVersion(registry, "4.0").token("brand.primary")).toMatchObject({
      via: [blue],
    });
  });

  it("reads active before the alias goes stale", () => {
    expect(atVersion(registry, "3.0").token("brand.primary")).toMatchObject({
      status: "active",
    });
  });
});

describe("alias chains — severity is taken from the worst node, wherever it sits", () => {
  it("reads deprecated when the deprecation is downstream, not at the head", () => {
    expect(atVersion(registry, "3.0").token("legacy.accent")).toMatchObject({
      status: "deprecated",
      deprecatedIn: "3.0",
      replacedBy: "color.blue-500",
    });
  });

  it("reads deprecated across a three-hop chain deprecated in the middle", () => {
    expect(atVersion(registry, "4.0").token("surface.brand")).toMatchObject({
      status: "deprecated",
      replacedBy: "brand.primaryV2",
    });
  });

  it("carries every hop of a three-hop chain, terminal node last", () => {
    expect(atVersion(registry, "4.0").token("surface.brand")).toMatchObject({
      entry: surfaceBrand,
      via: [brandPrimary, blue],
    });
  });
});

describe("alias chains — listDeprecated sees what token() sees", () => {
  it("lists a token whose deprecation is downstream, not on itself", () => {
    // legacy.accent's own lifecycle is spotless; only the chain is in trouble. A
    // listing built from lifecycles alone would miss it, and then two answers to
    // the same question — is this deprecated? — would disagree.
    const at = atVersion(registry, "3.0");

    expect(at.listDeprecated()).toContainEqual(at.token("legacy.accent"));
  });

  it("does not list a healthy token that points at a healthy value", () => {
    const listed = atVersion(registry, "3.0")
      .listDeprecated()
      .map((resolution) => ("entry" in resolution ? resolution.entry.id : undefined));

    expect(listed).not.toContain("brand.primaryV2");
  });
});

describe("alias chains — a chain is only as readable as its most-broken link", () => {
  it("collapses to removed when a downstream node is removed", () => {
    expect(atVersion(registry, "5.0").token("legacy.accent")).toMatchObject({
      status: "removed",
      id: "legacy.accent",
      removedIn: "5.0",
    });
  });

  it("withholds the value entirely when a downstream node is removed", () => {
    // legacy.accent is itself perfectly healthy at 5.0. It resolves to nothing
    // because what it points at is gone.
    expect(atVersion(registry, "5.0").token("legacy.accent")).not.toHaveProperty(
      "entry",
    );
  });

  it("reports the id that was asked for when a chain collapses", () => {
    expect(atVersion(registry, "5.0").token("legacy.accent")).toMatchObject({
      id: "legacy.accent",
    });
  });

  it("collapses to unknown when a downstream node does not exist yet", () => {
    expect(atVersion(registry, "1.0").token("early.bird")).toMatchObject({
      status: "unknown",
      id: "early.bird",
      reason: "not-yet-added",
    });
  });

  it("withholds the value when a downstream node does not exist yet", () => {
    expect(atVersion(registry, "1.0").token("early.bird")).not.toHaveProperty("entry");
  });
});
