import { describe, expect, it } from "vitest";
import { loadRegistry, parseRegistry } from "./load.js";

const meta = {
  name: "Acme Design System",
  modelledOn: "Material Design",
  versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
};

const registryWith = (entries: { components?: unknown[]; tokens?: unknown[] }) => ({
  meta,
  components: [],
  tokens: [],
  ...entries,
});

const activeComponent = {
  id: "Card",
  kind: "component",
  description: "A surface.",
  lifecycle: { addedIn: "1.0" },
};

const activeToken = {
  id: "color.blue-500",
  kind: "token",
  type: "color",
  value: "#2196F3",
  lifecycle: { addedIn: "1.0" },
};

describe("parseRegistry — known versions", () => {
  it("accepts a registry whose version references are all in the history", () => {
    const registry = registryWith({ components: [activeComponent] });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("rejects a lifecycle referencing a version outside the history", () => {
    const registry = registryWith({
      components: [{ ...activeComponent, lifecycle: { addedIn: "9.0" } }],
    });

    expect(() => parseRegistry(registry)).toThrow(/9\.0/);
  });

  it("rejects a variant lifecycle referencing a version outside the history", () => {
    const registry = registryWith({
      components: [
        {
          ...activeComponent,
          variants: [{ name: "tone=ghost", lifecycle: { addedIn: "9.0" } }],
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/9\.0/);
  });

  it("rejects a removedIn referencing a version outside the history", () => {
    const registry = registryWith({
      components: [
        {
          ...activeComponent,
          lifecycle: {
            addedIn: "1.0",
            deprecatedIn: "4.0",
            replacedBy: "Card",
            removedIn: "9.0",
          },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/9\.0/);
  });
});

describe("parseRegistry — token value XOR alias", () => {
  it("accepts a token that only aliases another token", () => {
    const registry = registryWith({
      tokens: [
        activeToken,
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          alias: "color.blue-500",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("rejects a token carrying both a value and an alias", () => {
    const registry = registryWith({
      tokens: [
        activeToken,
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          value: "#2196F3",
          alias: "color.blue-500",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/brand\.primary/);
  });

  it("rejects a token carrying neither a value nor an alias", () => {
    const registry = registryWith({
      tokens: [
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/brand\.primary/);
  });
});

describe("parseRegistry — replacement on deprecation", () => {
  it("accepts a deprecated component that names its replacement", () => {
    const registry = registryWith({
      components: [
        activeComponent,
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: { addedIn: "1.0", deprecatedIn: "4.0", replacedBy: "Card" },
        },
      ],
    });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("rejects a deprecated component with nowhere to go instead", () => {
    const registry = registryWith({
      components: [
        {
          ...activeComponent,
          lifecycle: { addedIn: "1.0", deprecatedIn: "4.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/Card/);
  });

  it("rejects a deprecated variant with nowhere to go instead", () => {
    const registry = registryWith({
      components: [
        {
          ...activeComponent,
          variants: [
            { name: "size=jumbo", lifecycle: { addedIn: "2.0", deprecatedIn: "5.0" } },
          ],
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/size=jumbo/);
  });

  it("rejects a deprecated token with nowhere to go instead", () => {
    const registry = registryWith({
      tokens: [
        {
          ...activeToken,
          lifecycle: { addedIn: "1.0", deprecatedIn: "4.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/color\.blue-500/);
  });
});

describe("parseRegistry — ordered lifecycle", () => {
  it("accepts a lifecycle whose versions run in chronological order", () => {
    const registry = registryWith({
      components: [
        activeComponent,
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: {
            addedIn: "1.0",
            deprecatedIn: "4.0",
            replacedBy: "Card",
            removedIn: "6.0",
          },
        },
      ],
    });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("accepts an entry added and deprecated in the same version", () => {
    const registry = registryWith({
      components: [
        activeComponent,
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: { addedIn: "4.0", deprecatedIn: "4.0", replacedBy: "Card" },
        },
      ],
    });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("rejects an entry deprecated before it was added", () => {
    const registry = registryWith({
      components: [
        activeComponent,
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: { addedIn: "5.0", deprecatedIn: "4.0", replacedBy: "Card" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/Modal/);
  });

  it("rejects an entry removed before it was deprecated", () => {
    const registry = registryWith({
      components: [
        activeComponent,
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: {
            addedIn: "1.0",
            deprecatedIn: "5.0",
            replacedBy: "Card",
            removedIn: "4.0",
          },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/Modal/);
  });

  it("rejects an entry removed before it was added, with no deprecation between", () => {
    const registry = registryWith({
      components: [
        { ...activeComponent, lifecycle: { addedIn: "5.0", removedIn: "2.0" } },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/Card/);
  });
});

describe("parseRegistry — error reporting", () => {
  it("reports an unknown version without also claiming the lifecycle runs backwards", () => {
    const registry = registryWith({
      components: [
        { ...activeComponent, lifecycle: { addedIn: "1.0", removedIn: "9.0" } },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(
      /not a version in meta\.versions(?![\s\S]*is after)/,
    );
  });

  it("reports every violation in the registry at once, not just the first", () => {
    const registry = registryWith({
      components: [{ ...activeComponent, lifecycle: { addedIn: "9.0" } }],
      tokens: [{ ...activeToken, lifecycle: { addedIn: "1.0", deprecatedIn: "4.0" } }],
    });

    expect(() => parseRegistry(registry)).toThrow(/Card[\s\S]*color\.blue-500/);
  });
});

describe("parseRegistry — referential integrity", () => {
  it("accepts a component whose replacedBy names a real component", () => {
    const registry = registryWith({
      components: [
        activeComponent,
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: { addedIn: "1.0", deprecatedIn: "4.0", replacedBy: "Card" },
        },
      ],
    });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("rejects a component whose replacedBy names nothing in the registry", () => {
    const registry = registryWith({
      components: [
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: { addedIn: "1.0", deprecatedIn: "4.0", replacedBy: "Dialog" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/Dialog/);
  });

  it("rejects a token whose alias points at nothing", () => {
    const registry = registryWith({
      tokens: [
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          alias: "color.nonexistent",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/color\.nonexistent/);
  });

  it("resolves a variant's replacedBy against its own component's variants", () => {
    const registry = registryWith({
      components: [
        {
          ...activeComponent,
          variants: [
            {
              name: "size=jumbo",
              lifecycle: { addedIn: "2.0", deprecatedIn: "5.0", replacedBy: "size=xl" },
            },
            { name: "size=xl", lifecycle: { addedIn: "5.0" } },
          ],
        },
      ],
    });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("rejects a variant's replacedBy that names no sibling variant", () => {
    const registry = registryWith({
      components: [
        {
          ...activeComponent,
          variants: [
            {
              name: "size=jumbo",
              lifecycle: { addedIn: "2.0", deprecatedIn: "5.0", replacedBy: "size=xl" },
            },
          ],
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/size=xl/);
  });

  it("rejects a variant's replacedBy that names a variant of a different component", () => {
    const registry = registryWith({
      components: [
        {
          ...activeComponent,
          variants: [
            {
              name: "size=jumbo",
              lifecycle: {
                addedIn: "2.0",
                deprecatedIn: "5.0",
                replacedBy: "tone=ghost",
              },
            },
          ],
        },
        {
          id: "Button",
          kind: "component",
          description: "A clickable action.",
          variants: [{ name: "tone=ghost", lifecycle: { addedIn: "1.0" } }],
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/tone=ghost/);
  });
});

describe("parseRegistry — acyclic alias graph", () => {
  it("accepts an alias chain that terminates in a concrete value", () => {
    const registry = registryWith({
      tokens: [
        activeToken,
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          alias: "color.blue-500",
          lifecycle: { addedIn: "1.0" },
        },
        {
          id: "cta.background",
          kind: "token",
          type: "color",
          alias: "brand.primary",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(parseRegistry(registry)).toEqual(registry);
  });

  it("rejects a token that aliases itself", () => {
    const registry = registryWith({
      tokens: [
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          alias: "brand.primary",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/brand\.primary/);
  });

  it("rejects a cycle spanning several alias edges", () => {
    const registry = registryWith({
      tokens: [
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          alias: "brand.accent",
          lifecycle: { addedIn: "1.0" },
        },
        {
          id: "brand.accent",
          kind: "token",
          type: "color",
          alias: "brand.highlight",
          lifecycle: { addedIn: "1.0" },
        },
        {
          id: "brand.highlight",
          kind: "token",
          type: "color",
          alias: "brand.primary",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(() => parseRegistry(registry)).toThrow(/cycle/i);
  });
});

describe("loadRegistry", () => {
  it("loads the committed registry without error", () => {
    expect(() => loadRegistry()).not.toThrow();
  });

  it("reassembles the three data files into one registry", () => {
    const registry = loadRegistry();

    expect(registry.meta.versions.length).toBeGreaterThan(0);
    expect(registry.components.length).toBeGreaterThan(0);
    expect(registry.tokens.length).toBeGreaterThan(0);
  });
});
