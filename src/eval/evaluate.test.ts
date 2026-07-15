import { describe, expect, it } from "vitest";
import type { ModelClient } from "../agent/index.js";
import { callsTools, toolUse } from "../agent/scripted.js";
import { cases } from "./cases/index.js";
import { evaluate } from "./evaluate.js";

/**
 * A model that reports nothing, whatever it is shown.
 *
 * Scripted turn-by-turn responses do not fit here: this runs the *whole committed set*, so
 * a script would have to be rewritten every time a case is added — and the test would be
 * about the script rather than about the harness running the set. A model that always
 * submits an empty report answers any number of cases identically, which turns every label
 * into a miss and makes the arithmetic something the test can state independently.
 */
const reportsNothing: ModelClient = {
  createMessage: () =>
    Promise.resolve(callsTools(toolUse("t1", "submit_report", { findings: [] }))),
};

/** Every label in the set — what a run that found nothing must have missed. */
const labelCount = cases.flatMap((one) => one.expected).length;

/**
 * "The harness runs the agent over the full labelled set in one command" — the work item's
 * first line of done, as a function a command can call.
 *
 * The set is not a parameter: running *the* labelled set is the whole point, and a harness
 * that took the cases as an argument would let a caller quietly evaluate against a subset
 * and report the number as though it were the run. `runSet` is there for anyone who
 * genuinely wants a subset, and it does not pretend to be the eval.
 */
describe("running the whole set in one call", () => {
  it("runs every case the set commits to", async () => {
    const { summary } = await evaluate({ model: reportsNothing });

    expect(summary.cases.map((one) => one.id)).toEqual(cases.map((one) => one.id));
  });

  it("scores what the run came to", async () => {
    const { summary } = await evaluate({ model: reportsNothing });

    expect(summary.totals.missed).toBe(labelCount);
  });

  /** An agent that finds nothing agrees with the human about nothing. */
  it("gives an agent that reported nothing no credit for it", async () => {
    const { summary } = await evaluate({ model: reportsNothing });

    expect(summary.agreementRate).toBe(0);
  });

  /**
   * A miss is the absence of a verdict, not a wrong one — so an agent that reported nothing
   * is not thereby "safe". Reading silence as an escalation would be the harness flattering
   * the agent in exactly the place it is supposed to be strict.
   */
  it("does not read finding nothing as failing safely", async () => {
    const { summary } = await evaluate({ model: reportsNothing });

    expect(summary.safety).toEqual({ escalation: 0, confidentWrong: 0 });
  });
});

describe("keeping the runs behind the score", () => {
  it("hands back the run for every case", async () => {
    const { runs } = await evaluate({ model: reportsNothing });

    expect(runs).toHaveLength(cases.length);
  });

  /** The trace is what makes a disagreement debuggable rather than merely reported. */
  it("keeps each case's trace", async () => {
    const { runs } = await evaluate({ model: reportsNothing });

    expect(runs.every((run) => run.trace.length > 0)).toBe(true);
  });
});

/**
 * The wiring that makes the number mean anything: with nothing injected, the harness must
 * be auditing against the real registry — the same file 03 serves and 01 pins. A default
 * pointing at a fixture would make the eval a measurement of a toy.
 */
describe("evaluating against the real design system", () => {
  it("audits every case at the version its label names", async () => {
    const { runs } = await evaluate({ model: reportsNothing });

    expect(runs.map((run) => run.trace[0])).toMatchObject(
      cases.map((one) => ({ type: "run-start", version: one.version })),
    );
  });
});
