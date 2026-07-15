import { describe, expect, it } from "vitest";
import type { ComponentEntry } from "../registry/index.js";
import type { Resolution } from "../retrieval/index.js";
import { createLedger } from "./evidence.js";

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

/** What 02 hands back for `Modal` at 4.0 — the fact a finding would rest on. */
const deprecated: Resolution<ComponentEntry> = {
  status: "deprecated",
  asOf: "4.0",
  entry: modal,
  deprecatedIn: "4.0",
  replacedBy: "Dialog",
  removedIn: "6.0",
};

const active: Resolution<ComponentEntry> = {
  status: "active",
  asOf: "3.0",
  entry: modal,
};

describe("a fresh ledger claims nothing happened", () => {
  it("has no evidence before a retrieval has run", () => {
    expect(createLedger().entries()).toEqual([]);
  });
});

describe("the ledger retains what a retrieval actually returned", () => {
  it("hands the result back under the ref it minted", () => {
    const ledger = createLedger();
    const ref = ledger.record(
      "get_component",
      { id: "Modal", version: "4.0" },
      deprecated,
    );

    expect(ledger.get(ref)?.result).toEqual(deprecated);
  });

  /**
   * The args are half the evidence: 05 can only judge a citation against what was
   * asked, and a result alone cannot say which question it answered.
   */
  it("retains what was asked, not only what came back", () => {
    const ledger = createLedger();
    const ref = ledger.record(
      "get_component",
      { id: "Modal", version: "4.0" },
      deprecated,
    );

    expect(ledger.get(ref)?.args).toEqual({ id: "Modal", version: "4.0" });
  });

  it("names the tool that produced the result", () => {
    const ledger = createLedger();
    const ref = ledger.record(
      "get_component",
      { id: "Modal", version: "4.0" },
      deprecated,
    );

    expect(ledger.get(ref)?.tool).toBe("get_component");
  });
});

/**
 * Two lookups of the same id at different versions are different facts — one
 * active, one deprecated — and a finding citing the first must not be able to
 * reach the second. Distinct refs are what keep them apart.
 */
describe("every retrieval gets its own ref", () => {
  it("mints a distinct ref per call, even for the same question twice", () => {
    const ledger = createLedger();
    const first = ledger.record(
      "get_component",
      { id: "Modal", version: "4.0" },
      deprecated,
    );
    const second = ledger.record(
      "get_component",
      { id: "Modal", version: "4.0" },
      deprecated,
    );

    expect(first).not.toBe(second);
  });

  it("does not let one ref's result stand in for another's", () => {
    const ledger = createLedger();
    const atThree = ledger.record(
      "get_component",
      { id: "Modal", version: "3.0" },
      active,
    );
    const atFour = ledger.record(
      "get_component",
      { id: "Modal", version: "4.0" },
      deprecated,
    );

    expect(ledger.get(atThree)?.result).toEqual(active);
    expect(ledger.get(atFour)?.result).toEqual(deprecated);
  });
});

/**
 * The property the whole grounding claim rests on. The harness mints a ref only
 * when a tool truly ran, so a ref the ledger does not know is a citation to a
 * retrieval that never happened — exactly what 05 exists to reject. The ledger
 * does not judge that here; it only has to be unable to corroborate it.
 */
describe("a ref the ledger never minted corroborates nothing", () => {
  it("misses on a ref invented out of thin air", () => {
    expect(createLedger().get("r1")).toBeUndefined();
  });

  it("misses on an invented ref even once real retrievals exist", () => {
    const ledger = createLedger();
    ledger.record("get_component", { id: "Modal", version: "4.0" }, deprecated);

    expect(ledger.get("not-a-ref")).toBeUndefined();
  });
});

/**
 * Order is 06's, not 05's — but it is free here and costs nothing to keep, and a
 * ledger that shuffled its entries could not be lifted into an ordered trace later.
 */
describe("the ledger keeps the retrievals in the order they ran", () => {
  it("lists evidence in call order", () => {
    const ledger = createLedger();
    ledger.record("get_component", { id: "Modal", version: "3.0" }, active);
    ledger.record("get_component", { id: "Modal", version: "4.0" }, deprecated);

    expect(ledger.entries().map((entry) => entry.args.version)).toEqual(["3.0", "4.0"]);
  });
});
