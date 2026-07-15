import type { ComponentEntry, Registry, TokenEntry } from "../registry/index.js";

/**
 * A registry shaped like the seed data, for 04's tests.
 *
 * Local rather than loaded from `data/`, for the reason 03 keeps its own: these
 * tests pin *the agent's wiring*, and pointing them at the real file would make an
 * edit to the seed data fail them for a reason that has nothing to do with 04.
 * It carries the planted cases from `registry/cases.md` that the agent's judgment
 * actually turns on — the fully-lifecycled component (A), the stale alias (C), and
 * the undeclared contrast pair (D).
 */

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
  value: "#4F46E5",
  lifecycle: { addedIn: "4.0" },
};

const brandPrimaryV2: TokenEntry = {
  id: "brand.primaryV2",
  kind: "token",
  type: "color",
  alias: "color.indigo-600",
  lifecycle: { addedIn: "4.0" },
};

/** Case C: a stale alias pointing at a live value — the false-confidence case. */
const brandPrimary: TokenEntry = {
  id: "brand.primary",
  kind: "token",
  type: "color",
  alias: "color.blue-500",
  lifecycle: { addedIn: "1.0", deprecatedIn: "4.0", replacedBy: "brand.primaryV2" },
};

/** Case D: two ordinary, active tokens that are nowhere declared as a pair. */
const slate400: TokenEntry = {
  id: "color.slate-400",
  kind: "token",
  type: "color",
  value: "#94A3B8",
  lifecycle: { addedIn: "1.0" },
};

const slate100: TokenEntry = {
  id: "color.slate-100",
  kind: "token",
  type: "color",
  value: "#F1F5F9",
  lifecycle: { addedIn: "1.0" },
};

export const registry: Registry = {
  meta: {
    name: "Northwind Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  },
  components: [modal, dialog],
  tokens: [blue, indigo, brandPrimary, brandPrimaryV2, slate400, slate100],
};
