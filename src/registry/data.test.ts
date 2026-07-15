import { describe, expect, it } from "vitest";
import { loadRegistry } from "./load.js";
import type { ComponentEntry, TokenEntry } from "./schema.js";

// Pins the committed seed set against the work item's definition of done. These
// are the ingredients Work Item 07's ground-truth labels reference by id, so
// drift here silently invalidates the eval — hence asserting on them here.
const registry = loadRegistry();

const component = (id: string): ComponentEntry => {
  const found = registry.components.find((entry) => entry.id === id);
  if (!found) throw new Error(`no component "${id}" in the committed registry`);
  return found;
};

const token = (id: string): TokenEntry => {
  const found = registry.tokens.find((entry) => entry.id === id);
  if (!found) throw new Error(`no token "${id}" in the committed registry`);
  return found;
};

describe("the committed registry", () => {
  it("contains entries that are never deprecated", () => {
    const active = [...registry.components, ...registry.tokens].filter(
      (entry) => entry.lifecycle.deprecatedIn === undefined,
    );

    expect(active.length).toBeGreaterThan(0);
  });

  it("contains entries that are deprecated but not yet removed", () => {
    const deprecated = [...registry.components, ...registry.tokens].filter(
      (entry) =>
        entry.lifecycle.deprecatedIn !== undefined &&
        entry.lifecycle.removedIn === undefined,
    );

    expect(deprecated.length).toBeGreaterThan(0);
  });

  it("contains entries that are removed", () => {
    const removed = [...registry.components, ...registry.tokens].filter(
      (entry) => entry.lifecycle.removedIn !== undefined,
    );

    expect(removed.length).toBeGreaterThan(0);
  });

  it("spreads its lifecycle events across at least two version boundaries", () => {
    const boundaries = new Set(
      [...registry.components, ...registry.tokens].flatMap((entry) =>
        [entry.lifecycle.deprecatedIn, entry.lifecycle.removedIn].filter(
          (version) => version !== undefined,
        ),
      ),
    );

    expect(boundaries.size).toBeGreaterThanOrEqual(2);
  });
});

describe("seeded ambiguous cases", () => {
  it("case A — Modal is deprecated in 4.0 for Dialog and removed in 6.0", () => {
    expect(component("Modal").lifecycle).toEqual({
      addedIn: "1.0",
      deprecatedIn: "4.0",
      replacedBy: "Dialog",
      removedIn: "6.0",
    });
  });

  it("case A — Dialog, the replacement, is itself active", () => {
    expect(component("Dialog").lifecycle.deprecatedIn).toBeUndefined();
  });

  it("case B — Button's size=jumbo variant is deprecated in 5.0 for size=xl", () => {
    const jumbo = component("Button").variants?.find(
      (variant) => variant.name === "size=jumbo",
    );

    expect(jumbo?.lifecycle).toEqual({
      addedIn: "2.0",
      deprecatedIn: "5.0",
      replacedBy: "size=xl",
    });
  });

  it("case B — Button itself stays active, so a component-level check would miss it", () => {
    expect(component("Button").lifecycle.deprecatedIn).toBeUndefined();
  });

  it("case C — brand.primary still aliases a live value while being deprecated", () => {
    expect(token("brand.primary")).toMatchObject({
      alias: "color.blue-500",
      lifecycle: { deprecatedIn: "4.0", replacedBy: "brand.primaryV2" },
    });
  });

  it("case C — the value behind the stale alias is itself active, hence plausible", () => {
    expect(token("color.blue-500").lifecycle.deprecatedIn).toBeUndefined();
  });

  it("case C — the replacement alias points somewhere different", () => {
    expect(token("brand.primaryV2").alias).toBe("color.indigo-600");
  });

  it("case D — both halves of the low-contrast pair are active", () => {
    const pair = [token("color.slate-400"), token("color.slate-100")];

    expect(pair.every((t) => t.lifecycle.deprecatedIn === undefined)).toBe(true);
  });

  it("case D — the pair is never declared as a relationship anywhere", () => {
    const slate400 = token("color.slate-400");

    expect(JSON.stringify(slate400)).not.toContain("slate-100");
  });

  it("case D — a passing counterpart exists, so an undeclared pair is not itself a signal", () => {
    // slate-900 on slate-100 is the same shape of usage as the failing pair and
    // is equally undeclared, but passes contrast. Without it the agent could
    // learn "undeclared pair => violation" and be right for the wrong reason.
    expect(token("color.slate-900").lifecycle.deprecatedIn).toBeUndefined();
  });
});
