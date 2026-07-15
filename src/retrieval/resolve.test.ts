import { describe, expect, it } from "vitest";
import type { ComponentEntry, Registry, TokenEntry } from "../registry/index.js";
import { atVersion } from "./resolve.js";
import type { Resolution } from "./types.js";

/** Mirrors the seed data's shape. Local so 02's logic is pinned independently of edits to `data/`. */
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

const card: ComponentEntry = {
  id: "Card",
  kind: "component",
  description: "A surface.",
  lifecycle: { addedIn: "1.0" },
};

const accordion: ComponentEntry = {
  id: "Accordion",
  kind: "component",
  description: "Expandable panels.",
  lifecycle: { addedIn: "5.0" },
};

/** Removed without ever being deprecated — so it names no replacement. */
const legacyGrid: ComponentEntry = {
  id: "LegacyGrid",
  kind: "component",
  description: "A grid.",
  lifecycle: { addedIn: "1.0", removedIn: "5.0" },
};

const spaceTight: TokenEntry = {
  id: "space.tight",
  kind: "token",
  type: "spacing",
  value: "4px",
  lifecycle: { addedIn: "1.0" },
};

/** Fully lifecycled, like Modal, but carrying a concrete value. */
const spaceSnug: TokenEntry = {
  id: "space.snug",
  kind: "token",
  type: "spacing",
  value: "8px",
  lifecycle: {
    addedIn: "1.0",
    deprecatedIn: "3.0",
    replacedBy: "space.cosy",
    removedIn: "5.0",
  },
};

const indigo: TokenEntry = {
  id: "color.indigo-600",
  kind: "token",
  type: "color",
  value: "#3949AB",
  lifecycle: { addedIn: "4.0" },
};

const registry: Registry = {
  meta: {
    name: "Northwind Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  },
  components: [modal, card, accordion, legacyGrid],
  tokens: [spaceTight, spaceSnug, indigo],
};

describe("atVersion — the only way in", () => {
  it("binds a resolver to a version in the registry's history", () => {
    expect(atVersion(registry, "4.0").asOf).toBe("4.0");
  });

  it("throws on a version outside the history rather than resolving", () => {
    expect(() => atVersion(registry, "4.1")).toThrow(/4\.1/);
  });

  it("names the versions it would accept when rejecting one", () => {
    expect(() => atVersion(registry, "9.9")).toThrow(/1\.0.*6\.0/s);
  });

  it("throws rather than reporting an invalid version as unknown", () => {
    // `unknown` answers questions about the data. A version that was never
    // released is a malformed question, and must not resolve at all.
    expect(() => atVersion(registry, "")).toThrow();
  });
});

describe("at.component — a fully-lifecycled entry, version by version", () => {
  it("reads active before deprecation, carrying the entry", () => {
    expect(atVersion(registry, "3.0").component("Modal")).toEqual({
      status: "active",
      asOf: "3.0",
      entry: modal,
    });
  });

  it("reads deprecated from the deprecating version, with where to go instead", () => {
    expect(atVersion(registry, "4.0").component("Modal")).toEqual({
      status: "deprecated",
      asOf: "4.0",
      entry: modal,
      deprecatedIn: "4.0",
      replacedBy: "Dialog",
      removedIn: "6.0",
    });
  });

  it("reads removed from the removing version", () => {
    expect(atVersion(registry, "6.0").component("Modal")).toEqual({
      status: "removed",
      asOf: "6.0",
      id: "Modal",
      removedIn: "6.0",
      replacedBy: "Dialog",
    });
  });
});

describe("at.component — a value is never returned without its status", () => {
  it("hands back no entry at all once an entry is removed", () => {
    const resolution = atVersion(registry, "6.0").component("Modal");

    expect(resolution).not.toHaveProperty("entry");
  });

  it("hands back no entry for an id the registry does not know", () => {
    const resolution = atVersion(registry, "4.0").component("Carousel");

    expect(resolution).not.toHaveProperty("entry");
  });
});

describe("at.component — unknown distinguishes its two causes", () => {
  it("reads not-yet-added for an entry that exists later in the history", () => {
    expect(atVersion(registry, "1.0").component("Accordion")).toEqual({
      status: "unknown",
      asOf: "1.0",
      id: "Accordion",
      reason: "not-yet-added",
    });
  });

  it("reads unrecognized-id for an entry that never existed", () => {
    expect(atVersion(registry, "4.0").component("Carousel")).toEqual({
      status: "unknown",
      asOf: "4.0",
      id: "Carousel",
      reason: "unrecognized-id",
    });
  });
});

describe("at.component — partial lifecycles", () => {
  it("reads active for an entry that is never deprecated", () => {
    expect(atVersion(registry, "6.0").component("Card")).toMatchObject({
      status: "active",
    });
  });

  it("omits replacedBy when an entry was removed without a replacement", () => {
    expect(atVersion(registry, "5.0").component("LegacyGrid")).toEqual({
      status: "removed",
      asOf: "5.0",
      id: "LegacyGrid",
      removedIn: "5.0",
    });
  });
});

describe("at.token — a token carrying its own value", () => {
  it("reads active, carrying the entry and thus its value", () => {
    expect(atVersion(registry, "4.0").token("space.tight")).toEqual({
      status: "active",
      asOf: "4.0",
      entry: spaceTight,
    });
  });

  it("reads active before deprecation", () => {
    expect(atVersion(registry, "2.0").token("space.snug")).toMatchObject({
      status: "active",
    });
  });

  it("reads deprecated from the deprecating version, with where to go instead", () => {
    expect(atVersion(registry, "3.0").token("space.snug")).toEqual({
      status: "deprecated",
      asOf: "3.0",
      entry: spaceSnug,
      deprecatedIn: "3.0",
      replacedBy: "space.cosy",
      removedIn: "5.0",
    });
  });

  it("still hands back the value while deprecated — flagged, not withheld", () => {
    const resolution = atVersion(registry, "3.0").token("space.snug");

    expect(resolution).toHaveProperty("entry.value", "8px");
  });

  it("reads removed from the removing version", () => {
    expect(atVersion(registry, "5.0").token("space.snug")).toEqual({
      status: "removed",
      asOf: "5.0",
      id: "space.snug",
      removedIn: "5.0",
      replacedBy: "space.cosy",
    });
  });

  it("withholds the value entirely once a token is removed", () => {
    const resolution = atVersion(registry, "5.0").token("space.snug");

    expect(resolution).not.toHaveProperty("entry");
  });
});

describe("at.token — unknown distinguishes its two causes", () => {
  it("reads not-yet-added for a token introduced later in the history", () => {
    expect(atVersion(registry, "1.0").token("color.indigo-600")).toEqual({
      status: "unknown",
      asOf: "1.0",
      id: "color.indigo-600",
      reason: "not-yet-added",
    });
  });

  it("reads unrecognized-id for a token that never existed", () => {
    expect(atVersion(registry, "4.0").token("color.chartreuse-900")).toEqual({
      status: "unknown",
      asOf: "4.0",
      id: "color.chartreuse-900",
      reason: "unrecognized-id",
    });
  });
});

describe("at.listDeprecated — what is drifting at this version", () => {
  // Narrowing on `status` is the only way to an id: the removed and unknown
  // variants have no `entry` to read one from. Even this test helper has to ask.
  const idsOf = (resolutions: Resolution<ComponentEntry | TokenEntry>[]) =>
    resolutions
      .map((resolution) =>
        "entry" in resolution ? resolution.entry.id : resolution.id,
      )
      .sort();

  it("lists an entry from the version that deprecates it", () => {
    expect(idsOf(atVersion(registry, "4.0").listDeprecated())).toContain("Modal");
  });

  it("does not list an entry that is still active", () => {
    expect(idsOf(atVersion(registry, "3.0").listDeprecated())).not.toContain("Modal");
  });

  it("does not list an entry once it is removed", () => {
    // Removed is not deprecated. An entry that is gone needs no migration warning;
    // it needs a different conversation.
    expect(idsOf(atVersion(registry, "6.0").listDeprecated())).not.toContain("Modal");
  });

  it("spans components and tokens together", () => {
    expect(idsOf(atVersion(registry, "4.0").listDeprecated())).toEqual([
      "Modal",
      "space.snug",
    ]);
  });

  it("reports each one as a full deprecated Resolution, not a bare id", () => {
    const [deprecated] = atVersion(registry, "3.0").listDeprecated();

    expect(deprecated).toMatchObject({
      status: "deprecated",
      asOf: "3.0",
      entry: spaceSnug,
      replacedBy: "space.cosy",
    });
  });

  it("is empty when nothing is deprecated at that version", () => {
    expect(atVersion(registry, "2.0").listDeprecated()).toEqual([]);
  });

  it("agrees with what a direct lookup of the same id reports", () => {
    const at = atVersion(registry, "4.0");

    expect(at.listDeprecated()).toContainEqual(at.component("Modal"));
  });
});

describe("at.token — components and tokens are separate namespaces", () => {
  it("does not find a component through the token surface", () => {
    expect(atVersion(registry, "4.0").token("Card")).toMatchObject({
      status: "unknown",
      reason: "unrecognized-id",
    });
  });

  it("does not find a token through the component surface", () => {
    expect(atVersion(registry, "4.0").component("space.tight")).toMatchObject({
      status: "unknown",
      reason: "unrecognized-id",
    });
  });
});
