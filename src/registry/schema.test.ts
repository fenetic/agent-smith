import { describe, expect, it } from "vitest";
import { registrySchema } from "./schema.js";

const minimalRegistry = {
  meta: {
    name: "Acme Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  },
  components: [] as unknown[],
  tokens: [] as unknown[],
};

const registryWith = (entries: { components?: unknown[]; tokens?: unknown[] }) => ({
  ...minimalRegistry,
  ...entries,
});

describe("registrySchema", () => {
  it("parses a registry with no entries", () => {
    expect(registrySchema.parse(minimalRegistry)).toEqual(minimalRegistry);
  });

  it("rejects a registry whose version history is missing", () => {
    const { versions: _dropped, ...metaWithoutVersions } = minimalRegistry.meta;

    expect(() =>
      registrySchema.parse({ ...minimalRegistry, meta: metaWithoutVersions }),
    ).toThrow();
  });

  it("parses a component carrying a full deprecation lifecycle", () => {
    const registry = registryWith({
      components: [
        {
          id: "Modal",
          kind: "component",
          description: "An overlay dialog.",
          lifecycle: {
            addedIn: "1.0",
            deprecatedIn: "4.0",
            replacedBy: "Dialog",
            removedIn: "6.0",
          },
        },
      ],
    });

    expect(registrySchema.parse(registry)).toEqual(registry);
  });

  it("parses a component's independently lifecycled variants", () => {
    const registry = registryWith({
      components: [
        {
          id: "Button",
          kind: "component",
          description: "A clickable action.",
          variants: [
            {
              name: "size=jumbo",
              lifecycle: {
                addedIn: "2.0",
                deprecatedIn: "5.0",
                replacedBy: "size=xl",
              },
            },
            { name: "size=xl", lifecycle: { addedIn: "5.0" } },
          ],
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(registrySchema.parse(registry)).toEqual(registry);
  });

  it("parses a token that holds a concrete value", () => {
    const registry = registryWith({
      tokens: [
        {
          id: "color.blue-500",
          kind: "token",
          type: "color",
          value: "#2196F3",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(registrySchema.parse(registry)).toEqual(registry);
  });

  it("parses a token that aliases another token", () => {
    const registry = registryWith({
      tokens: [
        {
          id: "brand.primary",
          kind: "token",
          type: "color",
          alias: "color.blue-500",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(registrySchema.parse(registry)).toEqual(registry);
  });

  it("rejects an entry with no addedIn, since no entry may have an implicit status", () => {
    const registry = registryWith({
      components: [
        {
          id: "Card",
          kind: "component",
          description: "A surface.",
          lifecycle: {},
        },
      ],
    });

    expect(() => registrySchema.parse(registry)).toThrow();
  });

  it("rejects a token of an unrecognized type", () => {
    const registry = registryWith({
      tokens: [
        {
          id: "motion.fast",
          kind: "token",
          type: "duration",
          value: "150ms",
          lifecycle: { addedIn: "1.0" },
        },
      ],
    });

    expect(() => registrySchema.parse(registry)).toThrow();
  });
});
