import { describe, expect, it } from "vitest";
import { loadRegistry } from "../../registry/index.js";
import { cases } from "./index.js";

/**
 * Pins the labelled set against the work item's definition of done.
 *
 * The same job `registry/data.test.ts` does one layer down, and for the same reason: this
 * is curated data, and the claims made about it — that it spans both ambiguity kinds, that
 * one seed is labelled three ways by intent — are only true because someone chose them.
 * Nothing else would notice if a case were deleted and the claim quietly became false.
 *
 * These are properties of the *set*, never of the agent. Not one of them runs a model.
 */
const registry = loadRegistry();

describe("the labelled set is well-formed", () => {
  it("labels are unique by id, so a result names exactly one case", () => {
    expect(new Set(cases.map((one) => one.id)).size).toBe(cases.length);
  });

  /** A case auditing a version the registry never released would throw before it scored. */
  it("audits only versions the registry actually released", () => {
    const released = new Set(registry.meta.versions);

    expect(
      cases.filter((one) => !released.has(one.version)).map((one) => one.id),
    ).toEqual([]);
  });

  /**
   * A label names a usage the snippet contains, or it is unanswerable: the agent cannot
   * produce a finding for code that is not there, so the case would score a permanent miss
   * and read as an agent failure. Alignment is by containment, so this is the invariant
   * that keeps a label reachable at all.
   */
  it("labels only usages that appear in the snippet they judge", () => {
    const orphans = cases.flatMap((one) =>
      one.expected
        .filter((label) => !one.snippet.includes(label.target))
        .map((label) => `${one.id}: ${label.target}`),
    );

    expect(orphans).toEqual([]);
  });

  /**
   * Ground truth carries its own evidence, or it is just an assertion.
   *
   * When the agent says `violation` and the label says `allowed-exception`, the question is
   * "which of them is right?" — and a bare enum cannot answer it. 05 refuses a verdict from
   * the model that cites nothing; a label is held to the same standard.
   */
  it("carries the labeller's rationale for every case", () => {
    expect(cases.filter((one) => one.notes.trim() === "").map((one) => one.id)).toEqual(
      [],
    );
  });
});

/**
 * The definition of done, as tests.
 *
 * "The set includes at least one semantic and one temporal ambiguous case" — the two kinds
 * fail differently, and a set with only temporal cases would measure a lookup table with
 * good manners rather than judgment.
 */
describe("the set spans the ambiguity the project claims to handle", () => {
  it("includes a temporal ambiguous case", () => {
    expect(cases.filter((one) => one.ambiguity === "temporal").length).toBeGreaterThan(
      0,
    );
  });

  it("includes a semantic ambiguous case", () => {
    expect(cases.filter((one) => one.ambiguity === "semantic").length).toBeGreaterThan(
      0,
    );
  });

  /**
   * The regression guard. Without these, an agent that answered `needs-review` to
   * everything would post a respectable safety record and never be caught — the easy cases
   * are what prove it is still deciding things.
   */
  it("includes an unambiguous case that should simply pass", () => {
    const easy = cases.filter(
      (one) =>
        one.ambiguity === "none" &&
        one.expected.every((label) => label.outcome === "compliant"),
    );

    expect(easy.length).toBeGreaterThan(0);
  });

  it("includes an unambiguous case that should simply fail", () => {
    const easy = cases.filter(
      (one) =>
        one.ambiguity === "none" &&
        one.expected.some((label) => label.outcome === "violation"),
    );

    expect(easy.length).toBeGreaterThan(0);
  });
});

/**
 * The cases the whole project is about.
 *
 * 01 planted the ingredients and said the ambiguity lives in the *usage context*, not the
 * registry. This is where that claim is cashed: one registry fact — Modal is deprecated —
 * labelled three different ways, and the only thing that differs is what the code says
 * about its own intent. If these three collapsed to one answer, the agent would be a linter
 * and the project would have no argument.
 */
describe("one seed, labelled by the intent the code signals", () => {
  const modalLabels = cases
    .filter((one) => one.snippet.includes("<Modal"))
    .flatMap((one) => one.expected.filter((label) => label.target.includes("Modal")));

  it("reads the deprecated component three ways", () => {
    expect(new Set(modalLabels.map((label) => label.outcome))).toEqual(
      new Set(["allowed-exception", "violation", "needs-review"]),
    );
  });

  it("expects an exception only where the code signals deliberate legacy", () => {
    const exception = cases.find((one) =>
      one.expected.some((label) => label.outcome === "allowed-exception"),
    );

    expect(exception?.snippet.toLowerCase()).toContain("legacy");
  });
});

/**
 * The control that stops the agent being right for the wrong reason.
 *
 * Per `registry/cases.md`: slate-900 on slate-100 is the same *shape* of usage as the
 * failing pair — two undeclared tokens combined — but passes contrast. Without it the agent
 * could learn "undeclared pair ⇒ violation" and score well while reasoning about nothing.
 */
describe("the semantic cases cut both ways", () => {
  it("includes a semantic case the agent should clear", () => {
    const passing = cases.filter(
      (one) =>
        one.ambiguity === "semantic" &&
        one.expected.every((label) => label.outcome === "compliant"),
    );

    expect(passing.length).toBeGreaterThan(0);
  });

  it("includes a semantic case the agent should catch", () => {
    const failing = cases.filter(
      (one) =>
        one.ambiguity === "semantic" &&
        one.expected.some((label) => label.outcome === "violation"),
    );

    expect(failing.length).toBeGreaterThan(0);
  });
});
